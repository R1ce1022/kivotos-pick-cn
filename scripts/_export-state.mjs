/** 抓取导出瞬间的真实状态：src、srcset、以及所有图片请求 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();

const imgReqs = [];
page.on('request', (r) => {
  if (r.resourceType() === 'image') imgReqs.push(r.url());
});
page.on('response', (r) => {
  if (r.status() === 404) console.log('  404 →', r.url());
});

await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

// 滚动整页
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(2000);

// 检查 10005 这张卡（学生列表里，不在导出区）
const cardInfo = await page.evaluate(() => {
  const el = document.querySelector('[data-student-id="s10005"]');
  const img = el?.querySelector('img');
  return el
    ? {
        found: true,
        srcAttr: img?.getAttribute('src'),
        srcProp: img?.src,
        srcset: img?.getAttribute('srcset'),
        naturalWidth: img?.naturalWidth,
      }
    : { found: false };
});
console.log('学生卡 s10005:', JSON.stringify(cardInfo, null, 1));

// 导出前：导出捕获区里的图片状态
const before = await page.evaluate(() => {
  const area = document.querySelector('[class*="captureArea"]');
  const imgs = [...area.querySelectorAll('img')];
  return {
    count: imgs.length,
    sample: imgs.slice(0, 4).map((i) => ({ attr: i.getAttribute('src'), srcset: i.getAttribute('srcset') })),
    anySrcset: imgs.filter((i) => i.hasAttribute('srcset')).length,
  };
});
console.log('\n导出区图片（导出前）:', JSON.stringify(before, null, 1));

imgReqs.length = 0;
console.log('\n=== 点击导出 ===');
const dlP = page.waitForEvent('download', { timeout: 60000 }).then(() => 'OK', () => 'TIMEOUT');
await page.getByRole('button', { name: /保存图片/ }).click();
const r = await dlP;
console.log('结果:', r);

// 导出中的图片请求
const bad = imgReqs.filter((u) => /^https:\/\/r1ce1022\.github\.io\/assets\//.test(u));
console.log(`\n导出期间图片请求 ${imgReqs.length} 个，其中根路径错误 ${bad.length} 个`);
bad.slice(0, 5).forEach((u) => console.log('   ✗', u));
imgReqs.filter((u) => u.includes('/kivotos-pick-cn/assets/')).slice(0, 3).forEach((u) => console.log('   ✓', u));

// 导出中途的状态（若超时则看最后状态）
const mid = await page.evaluate(() => {
  const area = document.querySelector('[class*="captureArea"]');
  const imgs = [...area.querySelectorAll('img')];
  return {
    sampleAfter: imgs.slice(0, 3).map((i) => i.getAttribute('src')),
    btn: [...document.querySelectorAll('button')].find((b) => /保存图片|生成中/.test(b.textContent))?.textContent?.trim(),
  };
});
console.log('\n导出后按钮:', mid.btn);
console.log('导出区图片（导出后）样例:', mid.sampleAfter);

await browser.close();
