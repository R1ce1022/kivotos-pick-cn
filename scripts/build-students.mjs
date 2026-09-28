/**
 * 生成站点数据 data/students.json
 *
 * 角色集合（与原站 204 张卡片对齐）：
 *   - 可获取角色：SchaleDB 简中全表，按「FamilyName + PersonalName」聚合为一个角色；
 *     同一角色的换装/异格（名字含（）或 *）作为该角色的**可用外观**一并保留，
 *     因此不再排除变体。
 *   - 剧情 NPC：SchaleDB 未收录，中文名由手工映射表提供，每个 NPC 只有一套外观。
 *   - 联动角色：仅下载素材，不进选择列表。
 *
 * 为什么按 PathName 主干聚合：
 *   同一角色的所有形态共享 PathName 主干（shiroko / shiroko_cycling /
 *   shiroko_terror / shiroko_swimsuit → shiroko），实测恰好得到 144 组，
 *   与「排除变体后的基础角色数」完全一致，且组内学院无冲突。
 *   而 SchaleDB 的 FamilyName/PersonalName 有数据瑕疵（「紫（泳装）」的
 *   PersonalName 被误写成「紫草」），按它聚合会把角色拆开，故不采用。
 *
 * 每名角色只保留中文名：站内搜索只支持中文，因此不再生成多语言别名。
 *
 * 产出 data/students.json：
 *   { generatedAt, source, stats, academies[], students[] }
 *   students[].skins[] = { id, name, icon, isBase }
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ACADEMIES,
  CACHE_DIR,
  COLLAB_STUDENTS,
  NPC_STUDENTS,
  STUDENTS_JSON,
} from './academies.mjs';

const cnFile = path.join(CACHE_DIR, 'schaledb-students-cn.json');

if (!fs.existsSync(cnFile)) {
  throw new Error(`缺少简中数据 ${cnFile}，请先执行 npm run fetch:data`);
}

const cn = JSON.parse(fs.readFileSync(cnFile, 'utf8'));

const codeToAcademy = new Map();
for (const a of ACADEMIES) for (const c of a.schaleCodes) codeToAcademy.set(c, a.id);

const collabIds = new Set(COLLAB_STUDENTS.map((c) => Number(c.slug)));

/** 变体判定：名字含全/半角括号或星号（与 SchaleDB 的命名习惯一致） */
const isVariantName = (name) => /[（(]|\*/.test(name);

/**
 * 聚合键：同一角色的所有外观共享同一个 PathName 主干
 * （shiroko / shiroko_cycling / shiroko_terror → shiroko）。
 *
 * 不要用 FamilyName + PersonalName 聚合——SchaleDB 的这两个字段本身有瑕疵：
 * 「紫（泳装）」的 PersonalName 被误写成「紫草」（正确为「紫」），
 * 会导致角色被拆成两个。PathName 主干没有这个问题，实测恰好 144 组。
 */
const groupKey = (s) => String(s.PathName ?? s.Id).split('_')[0];

const students = [];
const stats = {
  variantSkins: 0,
  collabExcluded: 0,
  noAcademy: 0,
  npc: 0,
  base: 0,
  /** 只有变体形态、没有基础形态的角色数（例如仅以「白子＊恐怖」收录） */
  variantOnlyCharacters: 0,
};

// ---------- 可获取角色：按角色分组 ----------
const groups = new Map();
for (const s of Object.values(cn)) {
  const name = String(s.Name ?? '').trim();
  if (!name || name === '0' || /^\d+$/.test(name)) continue;
  if (collabIds.has(s.Id)) {
    stats.collabExcluded++;
    continue;
  }
  const key = groupKey(s);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(s);
}

for (const [, members] of groups) {
  // 组内按 DefaultOrder 升序：实测组内序号唯一无重复，是可靠的展示顺序
  members.sort((a, b) => (a.DefaultOrder ?? 0) - (b.DefaultOrder ?? 0));

  const academyId = codeToAcademy.get(String(members[0].School));
  if (!academyId) {
    stats.noAcademy += members.length;
    continue;
  }

  const characterName = String(members[0].PersonalName ?? members[0].Name).trim() || String(members[0].Name);
  const baseMember = members.find((m) => !isVariantName(String(m.Name)));
  if (!baseMember) stats.variantOnlyCharacters++;

  const skins = members.map((m) => {
    const skinName = String(m.Name).trim();
    const isBase = m === baseMember;
    if (!isBase) stats.variantSkins++;
    return {
      id: `s${m.Id}`,
      // 基础外观直接用角色名，其余保留 SchaleDB 的形态名（如「星野（泳装）」）。
      // 该名字只用于内部标识与无障碍标签，界面与导出图都不显示。
      name: isBase ? characterName : skinName,
      icon: `/assets/students/${m.Id}.webp`,
      isBase,
    };
  });

  // 组内没有基础形态时，把第一套当作默认外观，保证「默认选中」始终存在
  if (!baseMember) skins[0].isBase = true;

  students.push({
    id: skins.find((s) => s.isBase).id,
    name: characterName,
    academyId,
    skins,
    sortKey: members[0].DefaultOrder ?? members[0].Id,
  });
  stats.base++;
}

// ---------- 剧情 NPC：每人一套外观 ----------
for (const [i, n] of NPC_STUDENTS.entries()) {
  const icon = `/assets/students/${n.slug}.webp`;
  students.push({
    id: n.slug,
    name: n.name,
    academyId: n.academyId,
    skins: [{ id: n.slug, name: n.name, icon, isBase: true }],
    // NPC 排在可获取角色之后，内部按配置表顺序
    sortKey: 1000000 + i,
  });
  stats.npc++;
}

// ---------- 排序与统计 ----------
students.sort((a, b) => a.sortKey - b.sortKey);
for (const s of students) delete s.sortKey;

const byAcademy = new Map();
for (const s of students) byAcademy.set(s.academyId, (byAcademy.get(s.academyId) ?? 0) + 1);

const skinTotal = students.reduce((n, s) => n + s.skins.length, 0);
const extraSkins = skinTotal - students.length;

const out = {
  generatedAt: new Date().toISOString(),
  source: {
    data: 'https://schaledb.com/data/cn/students.min.json',
    icons: 'https://schaledb.com/images/student/icon/{id}.webp',
    npcIcons: 'https://blue-archive-pick.vercel.app/assets/students/{slug}.webp',
    note: '《蔚蓝档案》学生资料与头像版权归 Nexon 所有。本页为非官方同人镜像，仅供交流。',
  },
  stats: {
    total: students.length,
    base: stats.base,
    npc: stats.npc,
    /** 可选立绘总数（角色数 + 每角色额外外观数） */
    skinTotal,
    /** 除基础外观以外的可选外观数 */
    extraSkins,
    /** 来自换装/异格的额外外观数（不含「只有变体形态」角色的首套） */
    variantSkins: stats.variantSkins,
    variantOnlyCharacters: stats.variantOnlyCharacters,
    collabExcluded: stats.collabExcluded,
  },
  academies: ACADEMIES.map((a) => ({
    id: a.id,
    name: a.name,
    short: a.short,
    emblem: `/assets/schools/${a.emblem}`,
    accent: a.accent,
    count: byAcademy.get(a.id) ?? 0,
  })),
  students,
};

fs.mkdirSync(path.dirname(STUDENTS_JSON), { recursive: true });
fs.writeFileSync(STUDENTS_JSON, JSON.stringify(out) + '\n', 'utf8');

// ---------- 报告 ----------
const multi = students.filter((s) => s.skins.length > 1);
const maxSkins = Math.max(...students.map((s) => s.skins.length));
console.log(`✓ 写出 ${STUDENTS_JSON}`);
console.log(`  角色总数: ${out.stats.total}（可获取 ${out.stats.base} + NPC ${out.stats.npc}）`);
console.log(`  可选外观: ${skinTotal}（额外 ${extraSkins} 套；其中换装/异格 ${out.stats.variantSkins} 套）`);
console.log(`  多外观角色: ${multi.length} 个，单角色最多 ${maxSkins} 套`);
if (out.stats.variantOnlyCharacters) {
  console.log(`  仅有变体形态的角色: ${out.stats.variantOnlyCharacters} 个（首套已作为默认外观）`);
}
console.log(`  已排除: 联动角色 ${out.stats.collabExcluded}`);
console.log('\n  各学院角色数:');
for (const a of out.academies) {
  console.log(`    ${a.short.padEnd(6)} ${String(a.count).padStart(3)}`);
}
