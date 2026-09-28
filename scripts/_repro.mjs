/** 复现 verify-live 的完整顺序：滚动整页 → 填老师名 → 弹窗选人 → 导出 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();

const events = [];
page.on('console', (m) => {
  const t = m.text();
  if (/404|not found/i.test(t)) events.push(`[console] ${t.slice(0, 170)}`);
});
page.on('response', (r) => {
  if (r.status() === 404) events.push(`[404] ${r.url().replace('https://r1ce1022.github.io', '')}`);
});

await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

// 步骤 1：滚动整页（verify-live 就是这样做的）
console.log('--- 步骤1: 滚动整页 ---');
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(2500);
const imgState = await page.evaluate(() => ({
  total: document.querySelectorAll('img').length,
  loaded: [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length,
  notLoaded: [...document.querySelectorAll('img')]
    .filter((i) => i.naturalWidth === 0)
    .map((i) => i.getAttribute('src'))
    .slice(0, 8),
}));
console.log(`  图片 ${imgState.loaded}/${imgState.total}，未加载样例:`, imgState.notLoaded);

// 步骤 2：填老师名
await page.getByPlaceholder('写下你的名字').fill('线上验收');
await page.waitForTimeout(400);

// 步骤 3：弹窗选人
await page.locator('[data-slot="abydos"]').click();
await page.waitForTimeout(500);
await page.locator('[role="dialog"] [class*="cardImg"]').first().click();
await page.waitForTimeout(600);
console.log('  进度:', await page.locator('[class*="progress"] b').first().innerText());

// 步骤 4：导出
console.log('\n--- 步骤4: 导出 ---');
events.length = 0;
const dlP = page.waitForEvent('download', { timeout: 90000 }).then(
  (d) => d.suggestedFilename(),
  () => 'TIMEOUT'
);
const t0 = Date.now();
await page.getByRole('button', { name: /保存图片/ }).click();
const btnImmediately = await page.evaluate(
  () => [...document.querySelectorAll('button')].find((b) => /保存图片|生成中/.test(b.textContent))?.textContent?.trim()
);
console.log('  点击后按钮:', btnImmediately);
const r = await dlP;
console.log(`  结果: ${r}  耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('  期间 404:', events.length ? events.slice(0, 8).join('\n    ') : '(无)');

await browser.close();
