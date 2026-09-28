/** 逐步检查导出区图片 src 是否带前缀，找出是哪一步把它改坏的 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();

await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

const checkSrc = async (tag) => {
  const s = await page.evaluate(() => {
    const area = document.querySelector('[class*="captureArea"]');
    const imgs = [...area.querySelectorAll('img')];
    const prefixed = imgs.filter((i) => (i.getAttribute('src') ?? '').startsWith('/kivotos-pick-cn/')).length;
    const bare = imgs.filter((i) => (i.getAttribute('src') ?? '').startsWith('/assets/')).length;
    return { total: imgs.length, prefixed, bare, sample: imgs[0]?.getAttribute('src') };
  });
  const flag = s.bare > 0 ? '  ✗ 出现无前缀!' : '';
  console.log(`[${tag.padEnd(22)}] 导出区图片 ${s.total} 张 | 带前缀 ${s.prefixed} | 无前缀 ${s.bare}${flag}`);
  if (s.bare > 0) console.log(`    样例: ${s.sample}`);
  return s;
};

await checkSrc('打开页面');

await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(2500);
await checkSrc('滚动整页后');

await page.getByPlaceholder('写下你的名字').fill('线上验收');
await page.waitForTimeout(500);
await checkSrc('填老师名字后');

await page.locator('[data-slot="abydos"]').click();
await page.waitForTimeout(500);
await checkSrc('打开弹窗后');

await page.locator('[role="dialog"] [class*="cardImg"]').first().click();
await page.waitForTimeout(600);
await checkSrc('弹窗选人后');

const id = await page.evaluate(() => document.querySelector('[data-student-id]')?.getAttribute('data-student-id'));
await page.evaluate(async (sid) => {
  const card = document.querySelector(`[data-student-id="${sid}"]`);
  const slot = document.querySelector('[data-slot="gehenna"]');
  const dt = new DataTransfer();
  const fire = (el, t) => el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
  fire(card, 'dragstart');
  fire(slot, 'dragover');
  fire(slot, 'drop');
  fire(card, 'dragend');
  await new Promise((r) => setTimeout(r, 400));
}, id);
await page.waitForTimeout(400);
await checkSrc('拖拽后');

await page.getByPlaceholder('搜索学生名 / 韩文名').fill('白子');
await page.waitForTimeout(600);
await checkSrc('搜索后');

await page.getByPlaceholder('搜索学生名 / 韩文名').fill('');
await page.waitForTimeout(600);
await checkSrc('清空搜索后');

// 再点一次导出，观察过程中的 src 变化
console.log('\n--- 点击导出，并跟踪 src 变化 ---');
await page.evaluate(() => {
  window.__srcLog = [];
  const orig = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) {
    if (n === 'src' && this.tagName === 'IMG') window.__srcLog.push(String(v).slice(0, 90));
    return orig.call(this, n, v);
  };
});
const dlP = page.waitForEvent('download', { timeout: 45000 }).then(() => 'OK', () => 'TIMEOUT');
await page.getByRole('button', { name: /保存图片/ }).click();
console.log('  导出结果:', await dlP);
const log = await page.evaluate(() => window.__srcLog);
console.log(`  导出期间 src 赋值 ${log.length} 条：`);
log.slice(0, 6).forEach((v) => console.log('    ' + v));
const bare = log.filter((v) => v.startsWith('/assets/'));
console.log(`  其中无前缀 ${bare.length} 条`);
await checkSrc('导出结束后');

await browser.close();
