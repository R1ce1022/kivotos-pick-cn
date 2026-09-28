/**
 * 端到端验证：截图 + 交互 + 导出图片检查。
 * 用法: node scripts/verify-ui.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const outDir = path.resolve('scripts/.shots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
});
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

// ---------- 1. 首页 ----------
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(outDir, '01-home.png'), fullPage: true });
console.log('✓ 首页截图');

// ---------- 2. 最爱学生页 ----------
await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, '02-favorite-empty.png'), fullPage: true });
console.log('✓ 最爱学生页（空状态）截图');

// 滚动到选择板并截取
// 屏幕版的选择板：用「含屏幕槽位」定位，避免命中离屏的导出节点
const board = page.locator('div[class*="captureArea"]:has([data-live-slot])');
await board.screenshot({ path: path.join(outDir, '03-board-empty.png') });
console.log('✓ 选择板空状态截图');

// ---------- 3. 交互：填老师名字 ----------
await page.getByPlaceholder('写下你的名字').fill('测试老师');
console.log('✓ 填入老师名字');

// ---------- 4. 交互：用弹窗选择 3 个学院 ----------
const pickSlots = ['abydos', 'gehenna', 'trinity'];
for (const id of pickSlots) {
  await page.locator(`[data-live-slot="${id}"]`).click();
  await page.waitForTimeout(250);
  const modal = page.locator('[role="dialog"]');
  await modal.waitFor({ state: 'visible' });
  // 点弹窗里的第一张学生卡
  await modal.locator('[class*="card"]').first().click();
  await page.waitForTimeout(200);
}
console.log('✓ 通过弹窗选择了 3 个学院');

await page.waitForTimeout(400);
await board.screenshot({ path: path.join(outDir, '04-board-filled.png') });

// 进度计数
const count = await page.locator('[class*="progress"] b').first().innerText();
console.log(`  进度显示: ${count}/15`);

// ---------- 5. 交互：拖拽（完整 HTML5 事件序列） ----------
const dragSrc = await page.evaluate(() => {
  const c = document.querySelector('[data-student-id]');
  return { id: c?.getAttribute('data-student-id'), name: c?.querySelector('b')?.textContent };
});
const dragResult = await page.evaluate(async ({ id }) => {
  const card = document.querySelector(`[data-student-id="${id}"]`);
  const slot = document.querySelector('[data-live-slot="millennium"]');
  const dt = new DataTransfer();
  const fire = (el, type) =>
    el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  fire(card, 'dragstart');
  fire(slot, 'dragover');
  fire(slot, 'drop');
  fire(card, 'dragend');
  await new Promise((r) => setTimeout(r, 450));
  const img = slot.querySelector('img[class*="slotFace"]');
  return { filled: !!img, src: img?.getAttribute('src') ?? null };
}, dragSrc);
console.log(
  `✓ 拖拽测试: 「${dragSrc.name}」→ 千年格  填充=${dragResult.filled}  ${dragResult.src ?? ''}`
);

// ---------- 6. 搜索过滤（关键：先切到某个学院标签，再搜索，必须跨学院生效） ----------
const input = page.getByPlaceholder('搜索学生名 / 韩文名');
// 通过弹窗把标签停在「三一」
await page.locator('[data-live-slot="trinity"]').click();
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await input.fill('白子');
await page.waitForTimeout(600);
const searchNames = await page.evaluate(() =>
  [...document.querySelectorAll('[data-student-id] b')].map((b) => b.textContent)
);
console.log(`✓ 在「三一」标签下搜「白子」命中 ${searchNames.length} 张: ${searchNames.join(', ')}`);
if (searchNames.length === 0) console.log('  ✗ 跨学院搜索失效！');

// 按韩文别名搜索（验证别名索引可用）
await input.fill('시로코');
await page.waitForTimeout(600);
const aliasNames = await page.evaluate(() =>
  [...document.querySelectorAll('[data-student-id] b')].map((b) => b.textContent)
);
console.log(`✓ 按韩文名「시로코」搜索命中 ${aliasNames.length} 张: ${aliasNames.join(', ')}`);
await input.fill('');
await page.waitForTimeout(300);

// ---------- 7. 导出图片 ----------
const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.getByRole('button', { name: /保存图片/ }).click();
try {
  const dl = await downloadPromise;
  const saved = path.join(outDir, 'export-result.png');
  await dl.saveAs(saved);
  const size = fs.statSync(saved).size;
  console.log(`✓ 导出成功: ${dl.suggestedFilename()} (${(size / 1024).toFixed(0)} KB)`);
} catch (e) {
  console.log(`✗ 导出失败: ${e.message}`);
}

await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, '06-after-export.png'), fullPage: true });

// ---------- 8. 移动端视图 ----------
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const mp = await mobile.newPage();
await mp.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
await mp.waitForTimeout(500);
await mp.screenshot({ path: path.join(outDir, '07-mobile.png'), fullPage: true });
console.log('✓ 移动端截图');

await browser.close();

console.log('\n=== 控制台错误 ===');
if (errors.length === 0) console.log('无');
else errors.slice(0, 20).forEach((e) => console.log('  ' + e));
console.log(`\n截图目录: ${outDir}`);
