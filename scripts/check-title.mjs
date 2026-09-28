/** 校验导出标题的署名拼接（避免出现「XX 老师的」这类重复） */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });

for (const name of ['', '测试老师', '  Sensei  ']) {
  await page.getByPlaceholder('写下你的名字').fill(name);
  await page.waitForTimeout(350);
  const title = await page.evaluate(() => {
    // 注意：类名形如 favorite-students-module__xxx__captureTitle，
    // 子串匹配要避开 __page / __captureArea 这类前缀干扰
    const h2 = document.querySelector('h2 > em')?.closest('h2');
    return h2 ? h2.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  console.log(`输入 ${JSON.stringify(name).padEnd(14)} → ${title}`);
}

await browser.close();
