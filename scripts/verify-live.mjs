/**
 * 最终线上验收：一次跑完全部流程并给出结论。
 * 顺序严格照用户实际操作：打开 → 滚动看列表 → 填名字 → 选人 → 导出。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { netFetch } from './net.mjs';

const base = (process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn').replace(/\/$/, '');
const origin = new URL(base).origin;

let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => {
  console.log('  ✗ ' + m);
  failures++;
};

console.log(`目标: ${base}\n`);

// ---------- 1. 静态资源 ----------
console.log('=== 静态资源 ===');
for (const [label, url] of [
  ['首页', `${base}/`],
  ['最爱学生页', `${base}/favorite-students/`],
  ['学生头像', `${base}/assets/students/10000.webp`],
  ['NPC 头像', `${base}/assets/students/npc-arona.webp`],
  ['学院校徽', `${base}/assets/schools/abydos.png`],
]) {
  const res = await netFetch(url, { retries: 3, timeoutMs: 30000 });
  const len = (await res.arrayBuffer()).byteLength;
  res.ok && len > 0 ? ok(`${label} ${res.status} (${(len / 1024).toFixed(1)}KB)`) : bad(`${label} ${res.status}`);
}

const pageRes = await netFetch(`${base}/favorite-students/`, { retries: 3 });
const html = await pageRes.text();
const refs = [...new Set([...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]))];
let refBad = 0;
for (const r of refs) {
  const res = await netFetch(origin + r, { retries: 2, timeoutMs: 25000 });
  if (!res.ok) refBad++;
}
refBad === 0 ? ok(`HTML 内 ${refs.length} 个引用全部可访问`) : bad(`${refBad}/${refs.length} 个引用失败`);

// ---------- 2. 浏览器实测 ----------
console.log('\n=== 浏览器实测 ===');
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const p = await ctx.newPage();

const consoleErrors = [];
const req404 = [];
p.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 150));
});
p.on('response', (r) => {
  if (r.status() === 404) req404.push(r.url());
});
p.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(800);

// 2.1 滚动看完整列表（懒加载）
await p.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await p.waitForTimeout(2500);

const imgs = await p.evaluate(() => ({
  total: document.querySelectorAll('img').length,
  loaded: [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length,
}));
imgs.loaded === imgs.total ? ok(`图片 ${imgs.loaded}/${imgs.total} 全部解码`) : bad(`图片仅 ${imgs.loaded}/${imgs.total} 解码`);

const structure = await p.evaluate(() => ({
  cards: document.querySelectorAll('[data-student-id]').length,
  slots: document.querySelectorAll('[data-slot]').length,
  h1: document.querySelector('h1')?.textContent,
}));
structure.cards === 200 && structure.slots === 15
  ? ok(`结构正确：${structure.cards} 学生卡 / ${structure.slots} 学院格`)
  : bad(`结构异常：${structure.cards} 卡 / ${structure.slots} 格`);

// 2.2 填老师名字
await p.getByPlaceholder('写下你的名字').fill('线上验收');
await p.waitForTimeout(300);
ok('填入老师名字');

// 2.3 弹窗选人
await p.locator('[data-slot="abydos"]').click();
await p.waitForTimeout(500);
await p.locator('[role="dialog"] [class*="cardImg"]').first().click();
await p.waitForTimeout(500);
const prog = await p.locator('[class*="progress"] b').first().innerText();
prog === '1' ? ok('弹窗选择生效，进度 1/15') : bad(`进度异常：${prog}`);

// 2.4 拖拽
const dragId = await p.evaluate(() => document.querySelector('[data-student-id]')?.getAttribute('data-student-id'));
const dragOk = await p.evaluate(async (id) => {
  const card = document.querySelector(`[data-student-id="${id}"]`);
  const slot = document.querySelector('[data-slot="gehenna"]');
  const dt = new DataTransfer();
  const fire = (el, t) => el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
  fire(card, 'dragstart');
  fire(slot, 'dragover');
  fire(slot, 'drop');
  fire(card, 'dragend');
  await new Promise((r) => setTimeout(r, 500));
  return !!slot.querySelector('img[class*="slotFace"]');
}, dragId);
dragOk ? ok('拖拽投放生效') : bad('拖拽投放失败');

// 2.5 搜索
await p.getByPlaceholder('搜索学生名 / 韩文名').fill('白子');
await p.waitForTimeout(600);
const hits = await p.evaluate(() => [...document.querySelectorAll('[data-student-id] b')].map((b) => b.textContent));
hits.length > 0 ? ok(`搜索「白子」命中 ${hits.length}：${hits.join('、')}`) : bad('搜索无结果');
await p.getByPlaceholder('搜索学生名 / 韩文名').fill('');
await p.waitForTimeout(400);

// 2.6 导出
console.log('\n--- 导出 ---');
req404.length = 0;
const btn = p.getByRole('button', { name: /保存图片/ });
const t0 = Date.now();
const dlPromise = p.waitForEvent('download', { timeout: 120000 });
await btn.click();
try {
  const d = await dlPromise;
  const saved = 'scripts/.shots/live-export-final.png';
  await d.saveAs(saved);
  const size = fs.statSync(saved).size;
  ok(`导出成功: ${d.suggestedFilename()} (${(size / 1024).toFixed(0)}KB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // 校验导出图片确实是有效 PNG 且有内容
  const head = fs.readFileSync(saved).subarray(0, 8);
  const isPng = head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  isPng && size > 100 * 1024 ? ok('导出文件是有效 PNG 且体积正常') : bad('导出文件异常');
} catch (e) {
  bad(`导出失败: ${e.message.split('\n')[0]}`);
}

req404.length === 0 ? ok('导出期间无 404 请求') : bad(`导出期间有 ${req404.length} 个 404：${req404.slice(0, 3).join(', ')}`);

// 2.7 导出后页面是否恢复
const afterAttr = await p.evaluate(
  () => document.querySelector('[class*="captureArea"] img')?.getAttribute('src')
);
afterAttr?.startsWith('/kivotos-pick-cn/')
  ? ok(`导出后 src 正确还原: ${afterAttr}`)
  : bad(`导出后 src 未还原: ${afterAttr}`);

console.log('\n控制台错误:', consoleErrors.length ? consoleErrors.slice(0, 5).join(' | ') : '无');
p.removeAllListeners();

await p.screenshot({ path: 'scripts/.shots/live-final.png', fullPage: false });
await browser.close();

console.log(`\n${failures === 0 ? '✓ 线上验收全部通过' : `✗ 有 ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
