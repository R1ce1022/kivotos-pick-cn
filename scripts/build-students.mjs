/**
 * 生成站点数据 data/students.json
 *
 * 学生集合（与原站 204 张卡片完全对齐）：
 *   - 基础学生：SchaleDB 简中全表，排除「换装变体」（名字含（）或 *）与「联动角色」
 *   - 剧情 NPC：SchaleDB 未收录，中文名由手工映射表提供
 *   - 联动角色：仅下载素材，不进选择列表
 *
 * 产出 data/students.json：{ generatedAt, source, stats, academies[], students[] }
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
const krFile = path.join(CACHE_DIR, 'kr.json');

if (!fs.existsSync(cnFile)) {
  throw new Error(`缺少简中数据 ${cnFile}，请先执行 npm run fetch:data`);
}

const cn = JSON.parse(fs.readFileSync(cnFile, 'utf8'));
const kr = fs.existsSync(krFile) ? JSON.parse(fs.readFileSync(krFile, 'utf8')) : {};

const codeToAcademy = new Map();
for (const a of ACADEMIES) for (const c of a.schaleCodes) codeToAcademy.set(c, a.id);

const collabIds = new Set(COLLAB_STUDENTS.map((c) => Number(c.slug)));
const isVariant = (name) => /[（(]|\*/.test(name);

const students = [];
const stats = { variantExcluded: 0, collabExcluded: 0, noAcademy: 0, npc: 0, base: 0 };

// ---------- 基础学生 ----------
for (const s of Object.values(cn)) {
  const name = String(s.Name ?? '').trim();
  if (!name || name === '0' || /^\d+$/.test(name)) continue;

  if (collabIds.has(s.Id)) {
    stats.collabExcluded++;
    continue;
  }
  if (isVariant(name)) {
    stats.variantExcluded++;
    continue;
  }
  const academyId = codeToAcademy.get(String(s.School));
  if (!academyId) {
    stats.noAcademy++;
    continue;
  }

  // 搜索用别名：韩文名、英文名、日文名，方便中文用户按习惯检索
  const aliases = [kr[String(s.Id)]?.Name, s.DevName, s.PathName]
    .filter((x) => typeof x === 'string' && x.trim() && x !== name)
    .map((x) => x.trim());

  students.push({
    id: `s${s.Id}`,
    name,
    academyId,
    icon: `/assets/students/${s.Id}.webp`,
    aliases: [...new Set(aliases)],
    sortKey: s.Id,
  });
  stats.base++;
}

// ---------- 剧情 NPC ----------
for (const [i, n] of NPC_STUDENTS.entries()) {
  students.push({
    id: n.slug,
    name: n.name,
    academyId: n.academyId,
    icon: `/assets/students/${n.slug}.webp`,
    aliases: [],
    // NPC 排在学生之后，内部按配置表顺序
    sortKey: 1000000 + i,
  });
  stats.npc++;
}

// ---------- 排序与统计 ----------
students.sort((a, b) => a.sortKey - b.sortKey);
for (const s of students) delete s.sortKey;

const byAcademy = new Map();
for (const s of students) byAcademy.set(s.academyId, (byAcademy.get(s.academyId) ?? 0) + 1);

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
    variantExcluded: stats.variantExcluded,
    collabExcluded: stats.collabExcluded,
  },
  academies: ACADEMIES.map((a) => ({
    id: a.id,
    name: a.name,
    short: a.short,
    emblem: `/assets/schools/${a.emblem}`,
    count: byAcademy.get(a.id) ?? 0,
  })),
  students,
};

fs.mkdirSync(path.dirname(STUDENTS_JSON), { recursive: true });
fs.writeFileSync(STUDENTS_JSON, JSON.stringify(out) + '\n', 'utf8');

// ---------- 报告 ----------
console.log(`✓ 写出 ${STUDENTS_JSON}`);
console.log(`  学生总数: ${out.stats.total}（基础 ${out.stats.base} + NPC ${out.stats.npc}）`);
console.log(`  已排除: 换装变体 ${out.stats.variantExcluded} / 联动角色 ${out.stats.collabExcluded}`);
console.log('\n  各学院人数:');
for (const a of out.academies) {
  console.log(`    ${a.short.padEnd(6)} ${String(a.count).padStart(3)}`);
}
