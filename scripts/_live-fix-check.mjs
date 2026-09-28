/** 验证线上是否已更新到含修复的版本，并测试 baseUrl 方案 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();

const news = [];
page.on('console', (m) => {
  const t = m.text();
  if (/404|not found|Resource/i.test(t)) news.push(`[${m.type()}] ${t.slice(0, 180)}`);
});
page.on('response', (r) => {
  if (r.status() === 404) news.push(`[404] ${r.url()}`);
});

await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

// ---------- 1. 线上 chunk 是否含修复特征 ----------
const chunkHasFix = await page.evaluate(async () => {
  const srcs = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
  const results = [];
  for (const s of srcs) {
    if (!s || !/chunks/.test(s)) continue;
    try {
      const txt = await (await fetch(s)).text();
      if (txt.includes('学院最爱学生') || txt.includes('captureTitle')) {
        results.push({
          src: s.split('/').pop(),
          hasNewURL: txt.includes('new URL'),
          hasSetAttribute: txt.includes('setAttribute'),
          hasCacheBust: /cacheBust:\s*(!0|true)/.test(txt),
          hasOnImageError: txt.includes('onImageErrorHandler'),
        });
      }
    } catch {}
  }
  return results;
});
console.log('=== 线上 chunk 特征 ===');
console.log(JSON.stringify(chunkHasFix, null, 1));

// ---------- 2. 清空 console 噪音后，试直接导出 ----------
news.length = 0;
console.log('\n=== 直接点导出（观察是否还有根路径 404） ===');
const dlP = page.waitForEvent('download', { timeout: 45000 }).then(
  (d) => d.suggestedFilename(),
  (e) => 'TIMEOUT'
);
const t0 = Date.now();
await page.getByRole('button', { name: /保存图片/ }).click();
const r = await dlP;
console.log(`  结果: ${r}  耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('  期间 404/告警:', news.length ? news.slice(0, 6).join('\n    ') : '(无)');

await browser.close();
