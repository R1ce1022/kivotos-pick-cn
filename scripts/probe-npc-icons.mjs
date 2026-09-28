/**
 * 补齐 NPC：原站收录了 204 人，其中 59 人是剧情 NPC / 新学院学生，
 * SchaleDB 的 students 数据里没有，但 schaledb.com 的头像 CDN 可能仍有资源。
 *
 * 做法：对原站图标 id 与 SchaleDB 学生 id 的差集，逐个探测
 *       https://schaledb.com/images/student/icon/{id}.webp
 * 结果写入 scripts/.cache/npc-ids.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, STUDENT_ICON_URL } from './academies.mjs';
import { netFetch } from './net.mjs';

const html = fs.readFileSync(path.join(CACHE_DIR, 'target-favorite-students.html'), 'utf8');
const siteIconIds = [...new Set([...html.matchAll(/\/assets\/students\/(\d+)\.webp/g)].map((m) => Number(m[1])))].sort(
  (a, b) => a - b
);

const cn = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'schaledb-students-cn.json'), 'utf8'));
const knownIds = new Set(Object.keys(cn).map(Number));

const candidates = siteIconIds.filter((id) => !knownIds.has(id));
console.log(`原站图标 id: ${siteIconIds.length}，其中不在 SchaleDB 学生表里的: ${candidates.length}`);
console.log(candidates.join(', '));

// 探测头像是否可取
const probe = async (id) => {
  try {
    const res = await netFetch(STUDENT_ICON_URL(id), { retries: 2, timeoutMs: 20000 });
    if (!res.ok) return { id, ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    return { id, ok: buf.length > 0, status: res.status, bytes: buf.length };
  } catch (e) {
    return { id, ok: false, error: e.message };
  }
};

const results = [];
const CONC = 8;
let cursor = 0;
await Promise.all(
  Array.from({ length: CONC }, async () => {
    while (cursor < candidates.length) {
      const id = candidates[cursor++];
      const r = await probe(id);
      results.push(r);
      console.log(`  ${id} -> ${r.ok ? `OK ${r.bytes}B` : `无 (${r.status ?? r.error})`}`);
    }
  })
);

const available = results.filter((r) => r.ok).map((r) => r.id).sort((a, b) => a - b);
fs.writeFileSync(
  path.join(CACHE_DIR, 'npc-ids.json'),
  JSON.stringify({ siteIconIds, candidates, available, results: results.sort((a, b) => a.id - b.id) }, null, 2),
  'utf8'
);
console.log(`\n✓ 可取到头像的额外 id: ${available.length} / ${candidates.length}`);
console.log(available.join(', '));
