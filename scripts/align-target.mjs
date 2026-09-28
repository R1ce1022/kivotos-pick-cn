/**
 * 对齐脚本：算出原站 /favorite-students 收录的学生集合，
 * 以便在 SchaleDB 简中数据里筛选出同一批人（避免多收/少收）。
 *
 * 思路：
 *  1. 抓原站 HTML，抽出学生卡片上的「名字」；
 *  2. 抓 SchaleDB 日文数据（日文站学生名用汉字，可作为 id↔名字的桥梁）；
 *  3. 用名字做交叉匹配，得出原站的 id 集合。
 */
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './academies.mjs';
import { fetchText } from './net.mjs';

const SITE = 'https://blue-archive-pick.vercel.app/favorite-students';
// 原站界面与学生名都是韩文，所以用 SchaleDB 的韩文数据做 id↔名字 的桥梁
const KR_URL = 'https://schaledb.com/data/kr/students.min.json';

fs.mkdirSync(CACHE_DIR, { recursive: true });

// ---------- 1. 原站卡片名 ----------
console.log('→ 抓原站页面');
const html = await fetchText(SITE);
fs.writeFileSync(path.join(CACHE_DIR, 'target-favorite-students.html'), html, 'utf8');

// 卡片结构：<b>名字</b><small>学院</small>
// 注意：选择弹窗里有个「학생 선택하기 / 눌러서 검색」按钮也命中同一结构，需要排除
const UI_NOISE = new Set(['학생 선택하기', '선택 완료', '미선택']);
const cards = [...html.matchAll(/<b>([^<]+)<\/b><small>([^<]+)<\/small>/g)]
  .map((m) => ({ name: m[1], school: m[2] }))
  .filter((c) => !UI_NOISE.has(c.name));
// 去重（选择板与列表会重复渲染同一批学生）
const uniq = new Map();
for (const c of cards) uniq.set(`${c.name}|${c.school}`, c);
const siteStudents = [...uniq.values()];
console.log(`  原站卡片名（去重）: ${siteStudents.length}`);

// 原站引用了头像的 id
const siteIconIds = new Set(
  [...html.matchAll(/\/assets\/students\/(\d+)\.webp/g)].map((m) => Number(m[1]))
);
console.log(`  原站已挂头像的 id: ${siteIconIds.size}`);

// ---------- 2. SchaleDB 韩文数据 ----------
console.log('→ 抓 SchaleDB 韩文数据');
const kr = JSON.parse(await fetchText(KR_URL));
const krStudents = Object.values(kr);
console.log(`  韩文数据学生数: ${krStudents.length}`);

// ---------- 3. 交叉匹配 ----------
// 韩文名可能带（수영복）这类变体后缀，原站也是同样风格，直接全名匹配
const krByName = new Map();
for (const s of krStudents) {
  if (!krByName.has(s.Name)) krByName.set(s.Name, []);
  krByName.get(s.Name).push(s);
}

const matched = [];
const unmatched = [];
for (const c of siteStudents) {
  const hit = krByName.get(c.name);
  if (hit && hit.length) matched.push({ ...c, id: hit[0].Id, krName: hit[0].Name });
  else unmatched.push(c);
}

console.log(`\n名字精确匹配: ${matched.length} / ${siteStudents.length}`);
console.log(`未匹配: ${unmatched.length}`);
if (unmatched.length) {
  console.log('  未匹配样例:', unmatched.slice(0, 40).map((u) => `${u.name}(${u.school})`).join(', '));
}

// 变体统计：带括号 / 星号的
const variant = matched.filter((m) => /[（(]|\*/.test(m.name));
console.log(`\n匹配到的人里带变体标记的: ${variant.length}`);
console.log('  样例:', variant.slice(0, 12).map((v) => v.name).join(', '));

// 原站 id ↔ 名字，供后续筛选使用
const siteIds = matched.map((m) => m.id).sort((a, b) => a - b);
fs.writeFileSync(
  path.join(CACHE_DIR, 'target-ids.json'),
  JSON.stringify(
    {
      site: SITE,
      siteStudentCount: siteStudents.length,
      matchedCount: matched.length,
      ids: siteIds,
      entries: matched.sort((a, b) => a.id - b.id),
      unmatched,
    },
    null,
    2
  ),
  'utf8'
);
console.log(`\n✓ 已写出 ${path.join(CACHE_DIR, 'target-ids.json')}`);
