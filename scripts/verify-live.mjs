/**
 * 线上验收：直接请求 GitHub Pages 上的站点，逐条校验资源与真实渲染。
 * 用法: node scripts/verify-live.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { netFetch } from './net.mjs';

const base = (process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn/').replace(/\/$/, '');

console.log(`目标: ${base}\n`);

let failures = 0;
const check = async (url, label) => {
  try {
    const res = await netFetch(url, { retries: 3, timeoutMs: 30000 });
    const buf = Buffer.from(await res.arrayBuffer());
    const ok = res.ok && buf.length > 0;
    console.log(`  ${ok ? '✓' : '✗'} ${label ?? url}  ${res.status}  ${(buf.length / 1024).toFixed(1)}KB`);
    if (!ok) failures++;
    return buf;
  } catch (e) {
    console.log(`  ✗ ${label ?? url}  请求失败: ${e.message}`);
    failures++;
    return null;
  }
};

// ---------- 1. 页面 ----------
console.log('=== 页面 ===');
const home = await check(`${base}/`, '首页');
const page = await check(`${base}/favorite-students/`, '最爱学生页');

// ---------- 2. 从线上 HTML 提取引用并逐条校验 ----------
if (page) {
  const html = page.toString('utf8');
  const refs = [...new Set([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]))]
    .filter((r) => r.startsWith('/') && !r.startsWith('//'));

  console.log(`\n=== 线上 HTML 共 ${refs.length} 个引用，逐条校验 ===`);
  const bad = [];
  for (const r of refs) {
    const res = await netFetch(`${new URL(base).origin}${r}`, { retries: 2, timeoutMs: 25000 });
    if (!res.ok) bad.push(`${r} → ${res.status}`);
  }
  if (bad.length) {
    console.log(`  ✗ 有 ${bad.length} 个引用失败:`);
    bad.slice(0, 20).forEach((b) => console.log('    ' + b));
    failures += bad.length;
  } else {
    console.log(`  ✓ 全部 ${refs.length} 个引用均可访问`);
  }
}

// ---------- 3. 关键素材抽查 ----------
console.log('\n=== 关键素材 ===');
await check(`${base}/assets/students/10000.webp`, '学生头像 10000');
await check(`${base}/assets/students/npc-arona.webp`, 'NPC 头像 npc-arona');
await check(`${base}/assets/schools/abydos.png`, '学院校徽 abydos');
await check(`${base}/favicon.ico`, 'favicon.ico');

// ---------- 4. 真实浏览器渲染 ----------
console.log('\n=== 浏览器实测渲染 ===');
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

const errs = [];
const failedReq = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => {
  if (m.type() === 'error') errs.push('console: ' + m.text());
});
p.on('response', (r) => {
  if (r.status() >= 400) failedReq.push(`${r.status()} ${r.url()}`);
});

await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(1000);

// 头像用了 loading="lazy"，必须先滚一遍才会加载，否则统计到的只是首屏
await p.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await p.waitForTimeout(2500);

const info = await p.evaluate(() => ({
  title: document.title,
  h1: document.querySelector('h1')?.textContent,
  cards: document.querySelectorAll('[data-student-id]').length,
  slots: document.querySelectorAll('[data-slot]').length,
  // naturalWidth > 0 表示图片真的解码出来了
  imgsTotal: document.querySelectorAll('img').length,
  imgsLoaded: [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length,
}));

console.log('  标题:', info.title);
console.log('  主标题:', info.h1);
console.log('  学生卡:', info.cards, '| 学院格:', info.slots);
console.log(`  图片: ${info.imgsLoaded}/${info.imgsTotal} 张成功解码`);
if (info.cards !== 200) { console.log('  ✗ 学生卡数量不是 200'); failures++; }
if (info.imgsLoaded !== info.imgsTotal) { console.log('  ✗ 有图片未能加载'); failures++; }

if (failedReq.length) {
  console.log(`  ✗ 有 ${failedReq.length} 个请求失败:`);
  failedReq.slice(0, 10).forEach((f) => console.log('    ' + f));
  failures += failedReq.length;
} else {
  console.log('  ✓ 无失败请求');
}
console.log('  控制台错误:', errs.length ? errs.slice(0, 5).join(' | ') : '无');

await p.screenshot({ path: 'scripts/.shots/live-desktop.png', fullPage: false });

// ---------- 5. 交互 + 导出线上实测 ----------
console.log('\n=== 线上交互与导出 ===');
await p.getByPlaceholder('写下你的名字').fill('线上验收');
await p.locator('[data-slot="abydos"]').click();
await p.waitForTimeout(400);
await p.locator('[role="dialog"] [class*="cardImg"]').first().click();
await p.waitForTimeout(400);
const progress = await p.locator('[class*="progress"] b').first().innerText();
console.log('  弹窗选择后进度:', progress);

const t0 = Date.now();
const dl = p.waitForEvent('download', { timeout: 120000 });
await p.getByRole('button', { name: /保存图片/ }).click();
try {
  const d = await dl;
  const fs = await import('node:fs');
  const saved = 'scripts/.shots/live-export.png';
  await d.saveAs(saved);
  console.log(`  ✓ 导出成功: ${d.suggestedFilename()} (${(fs.statSync(saved).size / 1024).toFixed(0)}KB, 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
} catch (e) {
  console.log('  ✗ 导出失败:', e.message);
  failures++;
}

await browser.close();

console.log(`\n${failures === 0 ? '✓ 线上验收全部通过' : `✗ 线上验收有 ${failures} 项问题`}`);
process.exit(failures === 0 ? 0 : 1);
