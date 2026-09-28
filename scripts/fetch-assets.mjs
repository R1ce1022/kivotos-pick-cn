/**
 * 批量下载素材到 public/：
 *  - 学生头像  public/assets/students/{id}.webp   （来自 SchaleDB 官方 CDN）
 *  - 学院校徽  public/assets/schools/{slug}.png   （SchaleDB 仓库，缺失的回退镜像源）
 *
 * 用 Node 原生 fetch + 并发池，已存在的文件默认跳过（可加 --force 重下）。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ACADEMIES,
  COLLAB_STUDENTS,
  NPC_ICON_URL,
  NPC_STUDENTS,
  PUBLIC_SCHOOLS_DIR,
  PUBLIC_STUDENTS_DIR,
  SCHOOL_EMBLEM_SOURCES,
  SCHALE_STUDENTS_URL,
  STUDENT_ICON_URL,
  CACHE_DIR,
} from './academies.mjs';
import { fetchBuffer, netFetch } from './net.mjs';

const FORCE = process.argv.includes('--force');
const CONCURRENCY = 12;

fs.mkdirSync(PUBLIC_STUDENTS_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_SCHOOLS_DIR, { recursive: true });

/** 取需要下载头像的学生 id 列表（复用本地缓存数据） */
async function getStudentIds() {
  const cache = path.join(CACHE_DIR, 'schaledb-students-cn.json');
  let data;
  if (fs.existsSync(cache)) {
    data = JSON.parse(fs.readFileSync(cache, 'utf8'));
  } else {
    console.log('→ 本地无缓存，直接拉取学生数据');
    data = JSON.parse(await (await netFetch(SCHALE_STUDENTS_URL)).text());
  }
  return Object.values(data)
    .map((s) => s.Id)
    .sort((a, b) => a - b);
}

/** 并发池 */
async function pool(items, worker, concurrency = CONCURRENCY) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function downloadTo(urls, dest, label) {
  if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return { label, status: 'skip' };
  }
  for (const url of urls) {
    try {
      const buf = await fetchBuffer(url, { retries: 2, timeoutMs: 25000 });
      if (buf.length === 0) continue;
      fs.writeFileSync(dest, buf);
      return { label, status: 'ok', bytes: buf.length, url };
    } catch {
      // 换下一个源
    }
  }
  return { label, status: 'fail' };
}

// ---------- 学生头像 ----------
const ids = await getStudentIds();
console.log(`→ 下载 ${ids.length} 张学生头像 …`);
let done = 0;
const iconResults = await pool(ids, async (id) => {
  const dest = path.join(PUBLIC_STUDENTS_DIR, `${id}.webp`);
  const r = await downloadTo([STUDENT_ICON_URL(id)], dest, String(id));
  done++;
  if (done % 25 === 0 || done === ids.length) {
    process.stdout.write(`\r  进度 ${done}/${ids.length}`);
  }
  return r;
});
process.stdout.write('\n');

// ---------- 学院校徽 ----------
console.log(`→ 下载 ${ACADEMIES.length} 个学院校徽 …`);
const emblemResults = await pool(
  ACADEMIES,
  async (a) => {
    const dest = path.join(PUBLIC_SCHOOLS_DIR, a.emblem);
    const urls = SCHOOL_EMBLEM_SOURCES[a.id] ?? [];
    return downloadTo(urls, dest, a.id);
  },
  6
);

// ---------- NPC 头像（SchaleDB 无此资源，取自镜像源） ----------
console.log(`→ 下载 ${NPC_STUDENTS.length} 张剧情 NPC 头像 …`);
const npcResults = await pool(
  NPC_STUDENTS,
  async (n) => {
    const dest = path.join(PUBLIC_STUDENTS_DIR, `${n.slug}.webp`);
    return downloadTo([NPC_ICON_URL(n.slug)], dest, n.slug);
  },
  8
);

// ---------- 联动角色头像（仅补齐素材，页面选择列表不展示） ----------
console.log(`→ 下载 ${COLLAB_STUDENTS.length} 张联动角色头像 …`);
const collabResults = await pool(
  COLLAB_STUDENTS,
  async (c) => {
    const dest = path.join(PUBLIC_STUDENTS_DIR, `${c.slug}.webp`);
    return downloadTo([`https://blue-archive-pick.vercel.app/assets/students/${c.slug}.webp`], dest, c.slug);
  },
  4
);

// ---------- 汇总 ----------
const summarize = (results, kind) => {
  const ok = results.filter((r) => r.status === 'ok');
  const skip = results.filter((r) => r.status === 'skip');
  const fail = results.filter((r) => r.status === 'fail');
  const bytes = ok.reduce((n, r) => n + (r.bytes ?? 0), 0);
  console.log(
    `\n${kind}: 新下载 ${ok.length} / 已存在 ${skip.length} / 失败 ${fail.length}` +
      (bytes ? `（本次 ${(bytes / 1024 / 1024).toFixed(2)} MB）` : '')
  );
  if (fail.length) console.log(`  ✗ 失败: ${fail.map((r) => r.label).join(', ')}`);
  return fail;
};

const failIcons = summarize(iconResults, '学生头像');
const failEmblems = summarize(emblemResults, '学院校徽');
const failNpc = summarize(npcResults, 'NPC 头像');
const failCollab = summarize(collabResults, '联动头像');

if (failIcons.length || failEmblems.length || failNpc.length || failCollab.length) {
  process.exitCode = 1;
} else {
  console.log('\n✓ 素材下载完成');
}
