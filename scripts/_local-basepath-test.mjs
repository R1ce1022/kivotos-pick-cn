/** 本地实测带 basePath 的产物：导出区图片 src 是否带前缀 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:4180/kivotos-pick-cn/favorite-students/';
const browser = await chromium.launch({ channel: 'chrome' });
const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const bad = [];
p.on('response', (r) => {
  if (r.status() >= 400) bad.push(r.status() + ' ' + r.url());
});

await p.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
await p.waitForTimeout(1500);

const s = await p.evaluate(() => {
  const imgs = [...document.querySelectorAll('[class*="captureArea"] img')];
  const cards = [...document.querySelectorAll('[data-student-id] img')];
  const count = (arr, pre) => arr.filter((i) => (i.getAttribute('src') || '').startsWith(pre)).length;
  return {
    area: {
      total: imgs.length,
      prefixed: count(imgs, '/kivotos-pick-cn/'),
      bare: count(imgs, '/assets/'),
      sample: imgs[0]?.getAttribute('src'),
    },
    cards: {
      total: cards.length,
      prefixed: count(cards, '/kivotos-pick-cn/'),
      bare: count(cards, '/assets/'),
      sample: cards[0]?.getAttribute('src'),
    },
    loadedImgs: [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length,
    allImgs: document.querySelectorAll('img').length,
  };
});

console.log('导出区图片:', JSON.stringify(s.area, null, 1));
console.log('学生卡图片:', JSON.stringify(s.cards, null, 1));
console.log(`图片解码: ${s.loadedImgs}/${s.allImgs}`);
console.log('4xx 请求:', bad.length ? bad.slice(0, 6) : '无');

await browser.close();
