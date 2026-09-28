/** 本地完整流程测试（模拟子路径部署）：验证状态更新后渲染的图片是否仍带前缀 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:4185/kivotos-pick-cn/favorite-students/';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const p = await ctx.newPage();

const bad404 = [];
p.on('response', (r) => {
  if (r.status() === 404) bad404.push(r.url());
});

await p.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
await p.waitForTimeout(1000);

const srcState = async (tag) => {
  const s = await p.evaluate(() => {
    const area = [...document.querySelectorAll('[class*="captureArea"] img')];
    const cards = [...document.querySelectorAll('[data-student-id] img')];
    const cnt = (arr, pre) => arr.filter((i) => (i.getAttribute('src') || '').startsWith(pre)).length;
    return {
      areaBare: cnt(area, '/assets/'),
      areaPre: cnt(area, '/kivotos-pick-cn/'),
      cardBare: cnt(cards, '/assets/'),
      cardPre: cnt(cards, '/kivotos-pick-cn/'),
      sample: area.find((i) => (i.getAttribute('src') || '').startsWith('/assets/'))?.getAttribute('src'),
    };
  });
  const flag = s.areaBare || s.cardBare ? '   ✗ 有无前缀图片!' : '';
  console.log(
    `[${tag.padEnd(16)}] 导出区 带${s.areaPre}/裸${s.areaBare} | 卡片 带${s.cardPre}/裸${s.cardBare}${flag}`
  );
  if (s.areaBare) console.log(`    裸路径样例: ${s.sample}`);
  return s;
};

await srcState('初始');

// 触发状态更新：弹窗选人
await p.locator('[data-slot="abydos"]').click();
await p.waitForTimeout(400);
await p.locator('[role="dialog"] [class*="cardImg"]').first().click();
await p.waitForTimeout(600);
await srcState('选人后');

// 拖拽
const id = await p.evaluate(() => document.querySelector('[data-student-id]')?.getAttribute('data-student-id'));
await p.evaluate(async (sid) => {
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
await p.waitForTimeout(500);
await srcState('拖拽后');

// 搜索
await p.getByPlaceholder('搜索学生名 / 韩文名').fill('白子');
await p.waitForTimeout(600);
await srcState('搜索后');
await p.getByPlaceholder('搜索学生名 / 韩文名').fill('');
await p.waitForTimeout(400);

// 导出
console.log('\n--- 导出 ---');
bad404.length = 0;
const t0 = Date.now();
const dl = p.waitForEvent('download', { timeout: 60000 });
await p.getByRole('button', { name: /保存图片/ }).click();
try {
  const d = await dl;
  const saved = 'scripts/.shots/local-basepath-export.png';
  await d.saveAs(saved);
  console.log(`  ✓ 导出成功 (${(fs.statSync(saved).size / 1024).toFixed(0)}KB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
} catch {
  console.log('  ✗ 导出超时');
}
console.log('  导出期间 404:', bad404.length ? bad404.slice(0, 5) : '无');
await srcState('导出后');

await browser.close();
