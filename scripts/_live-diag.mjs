/** 线上两项疑点的定点排查：懒加载图片 与 导出下载 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await ctx.newPage();

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const downloads = [];
page.on('download', (d) => downloads.push(d.suggestedFilename()));

await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1000);

// ---------- A. 懒加载验证 ----------
const lazyStats = async (tag) => {
  const s = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')];
    return {
      total: imgs.length,
      loaded: imgs.filter((i) => i.naturalWidth > 0).length,
      lazy: imgs.filter((i) => i.getAttribute('loading') === 'lazy').length,
      // 已加载但声明为 lazy 的数量
      lazyLoaded: imgs.filter((i) => i.getAttribute('loading') === 'lazy' && i.naturalWidth > 0).length,
    };
  });
  console.log(`${tag}: 总 ${s.total} | 已解码 ${s.loaded} | 声明 lazy ${s.lazy} | lazy 中已加载 ${s.lazyLoaded}`);
  return s;
};

await lazyStats('未滚动');
// 滚到页面底部，触发懒加载
await page.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, document.body.scrollHeight);
});
await page.waitForTimeout(2500);
const after = await lazyStats('滚到底后');

// ---------- B. 导出下载验证 ----------
console.log('\n=== 导出按钮排查 ===');
const btn = page.getByRole('button', { name: /保存图片/ });
console.log('按钮存在:', await btn.count(), '| 可见:', await btn.isVisible());

// 监听 toast 文案变化，看导出流程走到哪一步
await page.evaluate(() => {
  window.__toasts = [];
  const obs = new MutationObserver(() => {
    const t = document.querySelector('[class*="toast"]');
    if (t) window.__toasts.push(t.textContent);
  });
  obs.observe(document.body, { childList: true, subtree: true });
});

await btn.click();
console.log('已点击，等待 3 秒…');
await page.waitForTimeout(3000);

const state = await page.evaluate(() => ({
  buttonText: [...document.querySelectorAll('button')].find((b) => /保存图片|生成中/.test(b.textContent))?.textContent,
  toasts: window.__toasts ?? [],
  toastNow: document.querySelector('[class*="toast"]')?.textContent ?? null,
}));
console.log('按钮文案:', state.buttonText);
console.log('toast 序列:', JSON.stringify(state.toasts));
console.log('当前 toast:', state.toastNow);

await page.waitForTimeout(8000);
console.log('再等 8 秒后 downloads:', downloads.length ? downloads : '(无)');
console.log('最终 toast:', await page.evaluate(() => document.querySelector('[class*="toast"]')?.textContent ?? '(无)'));

console.log('\n=== 控制台日志 ===');
console.log(logs.length ? logs.slice(0, 15).join('\n') : '(无)');

await page.screenshot({ path: 'scripts/.shots/live-diag.png', fullPage: false });
fs.writeFileSync('scripts/.shots/live-diag.html', await page.content(), 'utf8');
await browser.close();
