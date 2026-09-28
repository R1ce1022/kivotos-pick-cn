/** 在导出过程中跟踪 setAttribute，找出谁把 src 改回了无前缀的相对路径 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();

await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

// 安装跟踪钩子
await page.evaluate(() => {
  window.__trace = [];
  const origSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === 'src' && this.tagName === 'IMG') {
      window.__trace.push({ via: 'setAttribute', value: String(value).slice(0, 120) });
    }
    return origSet.call(this, name, value);
  };
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    get: desc.get,
    set(v) {
      window.__trace.push({ via: 'srcSetter', value: String(v).slice(0, 120) });
      return desc.set.call(this, v);
    },
  });
  // 记录 fetch/XHR
  const origFetch = window.fetch;
  window.__fetchLog = [];
  window.fetch = function (...args) {
    const u = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    window.__fetchLog.push(String(u).slice(0, 140));
    return origFetch.apply(this, args);
  };
});

// 滚动整页（复现失败条件）
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(2000);

// 清空跟踪，只看导出过程
await page.evaluate(() => {
  window.__trace = [];
  window.__fetchLog = [];
});

const dlP = page.waitForEvent('download', { timeout: 45000 }).then(() => 'OK', () => 'TIMEOUT');
await page.getByRole('button', { name: /保存图片/ }).click();
const r = await dlP;
console.log('导出结果:', r);

const trace = await page.evaluate(() => ({ trace: window.__trace, fetch: window.__fetchLog }));
console.log('\n=== src 被赋值的记录（前 20 条） ===');
for (const t of trace.trace.slice(0, 20)) {
  console.log(`  [${t.via}] ${t.value}`);
}
console.log(`  ...共 ${trace.trace.length} 条`);

// 统计：其中有多少是带前缀的、多少是不带的
const withPrefix = trace.trace.filter((t) => t.value.includes('/kivotos-pick-cn/')).length;
const withoutPrefix = trace.trace.filter((t) => t.value.startsWith('/assets/')).length;
console.log(`\n带前缀 ${withPrefix} 条 | 无前缀(以 /assets/ 开头) ${withoutPrefix} 条`);

console.log('\n=== 导出期间的 fetch（前 12 条） ===');
console.log(trace.fetch.slice(0, 12).map((u) => '  ' + u).join('\n') || '  (无)');
const badFetch = trace.fetch.filter((u) => /^https:\/\/r1ce1022\.github\.io\/assets\//.test(u));
console.log('  其中错误的根路径请求:', badFetch.length, badFetch.slice(0, 3));

await browser.close();
