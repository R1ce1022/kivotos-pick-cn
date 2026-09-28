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
 * 已知的 SchaleDB 重复条目，直接丢弃。
 *
 * 10144「雪玲（泳装）」是 10143「瞬（泳装）」的重复项：
 * 两者同为山海经、ID 与 DefaultOrder（264/265）紧邻、素材几乎相同，
 * 只是 10144 的 PathName 被误写成 `shunling_swimsuit`
 * （正确应为 `shun_swimsuit`，且 10143 的名字本来就是对的）。
 * 若不丢弃，它会因为主干与「瞬」不同而被当成另一名学生，
 * 使山海经多出 1 人、并出现一个「只有变体形态」的假角色。
 */
const DROPPED_DUPLICATE_IDS = new Set([10144]);

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
  /** 同名形态被丢弃的数量（如星野的重复「武装」） */
  duplicateFormsDropped: 0,
  /** 已知的 SchaleDB 重复条目被丢弃的数量（如 10144 冒牌雪玲） */
  droppedDuplicates: 0,
  /** ＊形态被拆成独立学生的数量（如「白子＊恐怖」） */
  terrorSplit: 0,
  /** 只有变体形态、没有基础形态的角色数（例如仅以「雪玲（泳装）」收录） */
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
  if (DROPPED_DUPLICATE_IDS.has(s.Id)) {
    stats.droppedDuplicates++;
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

  // ---- 规则 A：同名形态只保留一个 ----
  // 例如星野的「星野（武装）」有两套立绘（10098 / 10099），观感几乎一样，
  // 放在外观条里纯属噪音。按 DefaultOrder 保留靠前的那套。
  const bySkinName = new Map();
  for (const m of members) {
    const n = String(m.Name).trim();
    if (!bySkinName.has(n)) bySkinName.set(n, m);
    else stats.duplicateFormsDropped++;
  }
  const kept = [...bySkinName.values()];

  // ---- 规则 B：＊形态（异格）算独立学生，不作为同角色的外观 ----
  // 例如「白子＊恐怖」与「白子」，立绘与设定都是另一名角色。
  const terror = kept.filter((m) => String(m.Name).includes('＊'));
  const normal = kept.filter((m) => !String(m.Name).includes('＊'));

  const makeSkins = (list, baseName) => {
    const base = list.find((m) => !isVariantName(String(m.Name)));
    if (!base) stats.variantOnlyCharacters++;
    const skins = list.map((m) => {
      const isBase = m === base;
      if (!isBase) stats.variantSkins++;
      return {
        id: `s${m.Id}`,
        // 基础外观直接用角色名，其余保留 SchaleDB 的形态名（如「星野（泳装）」）。
        // 该名字只用于内部标识与无障碍标签，界面与导出图都不显示。
        name: isBase ? baseName : String(m.Name).trim(),
        icon: `/assets/students/${m.Id}.webp`,
        isBase,
      };
    });
    // 组内没有基础形态时，把第一套当作默认外观，保证「默认选中」始终存在
    if (!base && skins.length) skins[0].isBase = true;
    return skins;
  };

  if (normal.length) {
    const skins = makeSkins(normal, characterName);
    students.push({
      id: skins.find((s) => s.isBase).id,
      name: characterName,
      academyId,
      skins,
      sortKey: normal[0].DefaultOrder ?? normal[0].Id,
    });
    stats.base++;
  }

  for (const m of terror) {
    // 异格自成一个学生：名字用完整形态名（如「白子＊恐怖」）以便与本体区分
    const fullName = String(m.Name).trim();
    const skins = makeSkins([m], fullName);
    students.push({
      id: skins[0].id,
      name: fullName,
      academyId,
      skins,
      // 排在本体之后，避免打乱既有顺序
      sortKey: (m.DefaultOrder ?? m.Id) + 500,
    });
    stats.base++;
    stats.terrorSplit++;
  }
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
  /**
   * 页脚显示的日期，构建时固化成字符串。
   *
   * 不要在组件里用 new Date(generatedAt).toLocaleDateString()：
   * 它按**本地时区**换算，而构建机通常在 UTC。中国用户（UTC+8）会看到
   * 比构建机晚一天的日期，导致服务端渲染与客户端水合的文本不一致
   * （React 报 #418 并回退为客户端渲染）。这里用 UTC 取值，两端完全相同。
   */
  generatedDate: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
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
    /** 同名形态被丢弃的数量（如星野的重复「武装」） */
    duplicateFormsDropped: stats.duplicateFormsDropped,
    /** 已知的 SchaleDB 重复条目被丢弃的数量（如 10144 冒牌雪玲） */
    droppedDuplicates: stats.droppedDuplicates,
    /** ＊形态被拆成独立学生的数量（如「白子＊恐怖」） */
    terrorSplit: stats.terrorSplit,
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
if (out.stats.duplicateFormsDropped) {
  console.log(`  同名形态已合并: ${out.stats.duplicateFormsDropped} 套（观感重复，只保留一套）`);
}
if (out.stats.droppedDuplicates) {
  console.log(`  SchaleDB 重复条目已丢弃: ${out.stats.droppedDuplicates} 个（10144 冒牌雪玲）`);
}
if (out.stats.terrorSplit) {
  console.log(`  ＊形态已拆为独立学生: ${out.stats.terrorSplit} 个`);
}
if (out.stats.variantOnlyCharacters) {
  console.log(`  仅有变体形态的角色: ${out.stats.variantOnlyCharacters} 个（首套已作为默认外观）`);
}
console.log(`  已排除: 联动角色 ${out.stats.collabExcluded}`);
console.log('\n  各学院角色数:');
for (const a of out.academies) {
  console.log(`    ${a.short.padEnd(6)} ${String(a.count).padStart(3)}`);
}
