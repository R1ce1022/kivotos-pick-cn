/** 拖拽专项测试：用完整 HTML5 拖拽事件序列验证投放是否生效 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// 找一个学生卡与其学生 id
const info = await page.evaluate(() => {
  const card = document.querySelector('[data-student-id]');
  return { id: card?.getAttribute('data-student-id'), name: card?.querySelector('b')?.textContent };
});
console.log('拖拽源:', JSON.stringify(info));

// 完整事件序列：dragstart → dragenter → dragover → drop → dragend
const result = await page.evaluate(async ({ id }) => {
  const card = document.querySelector(`[data-student-id="${id}"]`);
  const slot = document.querySelector('[data-slot="millennium"]');
  const dt = new DataTransfer();

  const fire = (el, type) =>
    el.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })
    );

  fire(card, 'dragstart');
  fire(slot, 'dragenter');
  fire(slot, 'dragover');
  fire(slot, 'drop');
  fire(card, 'dragend');

  await new Promise((r) => setTimeout(r, 500));

  const img = slot.querySelector('img[class*="slotFace"]');
  return {
    dataTransferHadId: dt.getData('text/plain'),
    slotFilled: !!img,
    slotImgSrc: img?.getAttribute('src') ?? null,
    slotText: slot.textContent?.trim().slice(0, 40),
  };
}, info);

console.log('投放结果:', JSON.stringify(result, null, 1));

// 校验进度计数是否 +1
const progress = await page.locator('[class*="progress"] b').first().innerText();
console.log('进度:', progress);

// 同一个学生再拖到另一个学院 → 应从原学院移除
const moved = await page.evaluate(async ({ id }) => {
  const card = document.querySelector(`[data-student-id="${id}"]`);
  const slot = document.querySelector('[data-slot="trinity"]');
  const dt = new DataTransfer();
  const fire = (el, type) =>
    el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  fire(card, 'dragstart');
  fire(slot, 'dragover');
  fire(slot, 'drop');
  fire(card, 'dragend');
  await new Promise((r) => setTimeout(r, 500));
  const millennium = document.querySelector('[data-slot="millennium"]');
  const trinity = document.querySelector('[data-slot="trinity"]');
  return {
    millenniumFilled: !!millennium.querySelector('img[class*="slotFace"]'),
    trinityFilled: !!trinity.querySelector('img[class*="slotFace"]'),
  };
}, info);
console.log('同人换学院后:', JSON.stringify(moved));
const progress2 = await page.locator('[class*="progress"] b').first().innerText();
console.log('进度:', progress2);

await page.screenshot({ path: 'scripts/.shots/08-drag.png', fullPage: false });
await browser.close();
