/** 精确复现 verify-live 的导出流程，定位是慢还是挂 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

// 记录 toast 变化
await page.evaluate(() => {
  window.__toasts = [];
  new MutationObserver(() => {
    const t = document.querySelector('[class*="toast"]');
    if (t && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent);
  }).observe(document.body, { childList: true, subtree: true });
});

const dump = async (tag) => {
  const s = await page.evaluate(() => ({
    toasts: window.__toasts,
    btn: [...document.querySelectorAll('button')].find((b) => /保存图片|生成中/.test(b.textContent))?.textContent?.trim(),
    disabled: [...document.querySelectorAll('button')].find((b) => /保存图片|生成中/.test(b.textContent))?.disabled,
    imgsLoaded: [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length,
    imgsTotal: document.querySelectorAll('img').length,
  }));
  console.log(`[${tag}] 按钮="${s.btn}" disabled=${s.disabled} 图片=${s.imgsLoaded}/${s.imgsTotal} toasts=${JSON.stringify(s.toasts)}`);
};

await dump('初始');

// ---- 场景 1：直接导出（不滚动、不选人） ----
console.log('\n--- 场景1: 直接点导出 ---');
let dlP = page.waitForEvent('download', { timeout: 90000 }).catch((e) => 'TIMEOUT: ' + e.message);
let t0 = Date.now();
await page.getByRole('button', { name: /保存图片/ }).click();
let r = await dlP;
console.log(`  结果: ${typeof r === 'string' ? r : '下载 ' + r.suggestedFilename()}  耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await dump('场景1后');
await page.waitForTimeout(1500);

// ---- 场景 2：滚到底再导出 ----
console.log('\n--- 场景2: 滚到底再导出 ---');
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 100));
  }
});
await page.waitForTimeout(2000);
await dump('滚动后');
dlP = page.waitForEvent('download', { timeout: 90000 }).catch((e) => 'TIMEOUT: ' + e.message);
t0 = Date.now();
await page.getByRole('button', { name: /保存图片/ }).click();
r = await dlP;
console.log(`  结果: ${typeof r === 'string' ? r : '下载 ' + r.suggestedFilename()}  耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await dump('场景2后');

console.log('\n=== 控制台 ===');
console.log(logs.length ? logs.slice(0, 20).join('\n') : '(无)');
await browser.close();
