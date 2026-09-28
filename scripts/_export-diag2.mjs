/** 对比：带上「填老师名 + 弹窗选人」后，导出是否还正常 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();

page.on('console', (m) => console.log(`  [console.${m.type()}] ${m.text().slice(0, 160)}`));
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

const state = async (tag) => {
  const s = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /保存图片|生成中/.test(b.textContent));
    return {
      btn: btn?.textContent?.trim(),
      disabled: btn?.disabled,
      toast: document.querySelector('[class*="toast"]')?.textContent ?? null,
      progress: document.querySelector('[class*="progress"] b')?.textContent,
    };
  });
  console.log(`[${tag}] 按钮="${s.btn}" disabled=${s.disabled} 进度=${s.progress} toast=${s.toast}`);
};

// 步骤：填老师名
await page.getByPlaceholder('写下你的名字').fill('线上验收');
await page.waitForTimeout(400);
await state('填老师名后');

// 步骤：开弹窗选人
await page.locator('[data-slot="abydos"]').click();
await page.waitForTimeout(500);
console.log('  弹窗已开:', await page.locator('[role="dialog"]').isVisible());
await page.locator('[role="dialog"] [class*="cardImg"]').first().click();
await page.waitForTimeout(600);
await state('选人后');

// 步骤：导出
console.log('\n--- 点击导出 ---');
const dlP = page.waitForEvent('download', { timeout: 60000 }).then(
  (d) => d.suggestedFilename(),
  (e) => 'TIMEOUT: ' + e.message.split('\n')[0]
);
const t0 = Date.now();
await page.getByRole('button', { name: /保存图片/ }).click();
console.log('  已点击');
await state('点击后瞬间');
const r = await dlP;
console.log(`  结果: ${r}  耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await state('结束后');

await browser.close();
