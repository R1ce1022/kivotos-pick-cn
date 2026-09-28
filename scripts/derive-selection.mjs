/**
 * 推导最终学生集合，并列出「韩文名 → 需人工确认中文名」的缺口。
 *
 * 规则（由原站 204 人与 SchaleDB 277 人比对反推）：
 *   收录 = 全部学生 − 变体换装（名字含（）或 *） − 联动角色
 */
import fs from 'node:fs';
import path from 'node:path';
import { ACADEMIES, CACHE_DIR } from './academies.mjs';

/** 联动角色：原站不收（版权在社外） */
const COLLAB_IDS = [10079, 10080, 20007, 26011];

const cn = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'schaledb-students-cn.json'), 'utf8'));
const kr = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'kr.json'), 'utf8'));
const t = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'target-ids.json'), 'utf8'));

const codeToAcademy = new Map();
for (const a of ACADEMIES) for (const c of a.schaleCodes) codeToAcademy.set(c, a.id);

const isVariant = (name) => /[（(]|\*/.test(name);

const selected = [];
const excluded = { variant: [], collab: [], noAcademy: [] };

for (const s of Object.values(cn)) {
  const name = String(s.Name ?? '').trim();
  if (!name || name === '0' || /^\d+$/.test(name)) continue;

  if (COLLAB_IDS.includes(s.Id)) {
    excluded.collab.push(`${s.Id}:${name}`);
    continue;
  }
  if (isVariant(name)) {
    excluded.variant.push(`${s.Id}:${name}`);
    continue;
  }
  const academyId = codeToAcademy.get(String(s.School));
  if (!academyId) {
    excluded.noAcademy.push(`${s.Id}:${name}(${s.School})`);
    continue;
  }
  selected.push({ id: s.Id, cn: name, kr: kr[String(s.Id)]?.Name ?? null, academyId });
}

selected.sort((a, b) => a.id - b.id);

const matchedIds = new Set(t.ids);
const confirmed = selected.filter((s) => matchedIds.has(s.id));
const needReview = selected.filter((s) => !matchedIds.has(s.id));

console.log(`规则推导集合: ${selected.length} 人`);
console.log(`  其中已被原站名单确认: ${confirmed.length}`);
console.log(`  名称待人工确认: ${needReview.length}`);
console.log(`排除: 变体 ${excluded.variant.length} / 联动 ${excluded.collab.length} / 无学院 ${excluded.noAcademy.length}`);

fs.writeFileSync(
  path.join(CACHE_DIR, 'selection.json'),
  JSON.stringify({ selected, confirmed, needReview, excluded }, null, 2),
  'utf8'
);

if (needReview.length) {
  console.log('\n--- 待确认中文名（韩文名 → SchaleDB 简中名）---');
  for (const s of needReview) {
    console.log(`${s.id}\t${s.kr ?? '?'}\t${s.cn}\t${s.academyId}`);
  }
}
