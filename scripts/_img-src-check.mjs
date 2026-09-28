/** 查线上页面 img 的 src 到底是什么形式 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')];
  const pick = (n) => imgs.slice(0, n).map((i) => ({
    attr: i.getAttribute('src'),
    resolved: i.src,
    loaded: i.naturalWidth > 0,
  }));
  return {
    baseURI: document.baseURI,
    locationHref: location.href,
    firstThree: pick(3),
    // 头像类图片
    studentImgs: imgs.filter((i) => /students/.test(i.getAttribute('src') ?? '')).slice(0, 3).map((i) => i.getAttribute('src')),
  };
});

console.log('location.href :', info.locationHref);
console.log('document.baseURI:', info.baseURI);
console.log('\n前 3 张图:');
info.firstThree.forEach((i) => console.log(`  attr=${i.attr}\n    resolved=${i.resolved}  loaded=${i.loaded}`));
console.log('\n学生头像 attr 样例:', info.studentImgs);

// 直接验证根路径是否 404（复现 html-to-image 的解析结果）
const rootUrl = new URL(base).origin + '/assets/students/10005.webp';
const ok = await page.evaluate(async (u) => (await fetch(u)).status, rootUrl);
console.log(`\n域名根路径取图 ${rootUrl} → HTTP ${ok}  (html-to-image 就是这样失败的)`);

await browser.close();
