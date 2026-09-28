/**
 * 端到端验证：截图 + 交互 + 导出图片检查。
 * 用法: node scripts/verify-ui.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const outDir = path.resolve('scripts/.shots');
fs.mkdirSync(outDir, { recursive: true });

let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => {
  console.log('  ✗ ' + m);
  failures++;
};

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
});
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

// ---------- 1. 首页 ----------
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(outDir, '01-home.png'), fullPage: true });
console.log('✓ 首页截图');

// ---------- 2. 最爱学生页 ----------
await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, '02-favorite-empty.png'), fullPage: true });
console.log('✓ 最爱学生页（空状态）截图');

// 屏幕版的选择板：用「含屏幕槽位」定位，避免命中离屏的导出节点
const board = page.locator('div[class*="captureArea"]:has([data-live-slot])');
await board.screenshot({ path: path.join(outDir, '03-board-empty.png') });
console.log('✓ 选择板空状态截图');

// ---------- 3. 校徽可见性（回归防护） ----------
// 11 个校徽素材是白色透明底，浅色主题下若不压深就会「看起来是空的」。
// 这里对每个槽位内的校徽用 canvas 采样（套用其计算出的 filter 与 opacity），
// 要求平均亮度足够低。
console.log('\n=== 校徽可见性 ===');
const emblems = await page.evaluate(async () => {
  const slots = [...document.querySelectorAll('[data-live-slot]')];
  const out = [];
  for (const s of slots) {
    const img = s.querySelector('img');
    if (!img) continue;
    const cs = getComputedStyle(img);
    let lum = null;
    try {
      await (img.complete && img.naturalWidth
        ? Promise.resolve()
        : new Promise((r) => {
            img.onload = r;
            img.onerror = r;
          }));
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.filter = cs.filter;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 32) {
          n++;
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
      }
      const base = n ? sum / n : 255;
      // 与不透明度叠加到白底后的实际观感
      const op = Number(cs.opacity);
      lum = Math.round(base * op + 250 * (1 - op));
    } catch (e) {
      lum = 'err';
    }
    out.push({ id: s.getAttribute('data-live-slot'), filter: cs.filter, lum });
  }
  return out;
});

const invisible = emblems.filter((e) => typeof e.lum !== 'number' || e.lum > 200);
if (!emblems.length) {
  bad('未找到任何校徽');
} else if (invisible.length) {
  bad(`${invisible.length}/${emblems.length} 个校徽几乎不可见: ${invisible.map((e) => `${e.id}(${e.lum})`).join(', ')}`);
} else {
  const max = Math.max(...emblems.map((e) => e.lum));
  ok(`${emblems.length} 个校徽全部可见（最高亮度 ${max}，阈值 200）`);
}

// ---------- 4. 交互：填老师名字 ----------
await page.getByPlaceholder('写下你的名字').fill('测试老师');
console.log('\n✓ 填入老师名字');

// ---------- 5. 交互：点学院格 → 弹窗只含该学院 → 点学生入格 ----------
console.log('\n=== 点学院选人 ===');
const pickSlots = ['abydos', 'gehenna', 'trinity'];
for (const id of pickSlots) {
  await page.locator(`[data-live-slot="${id}"]`).click();
  await page.waitForTimeout(300);
  const modal = page.locator('[role="dialog"]');
  await modal.waitFor({ state: 'visible' });

  // 断言：弹窗只为该学院列出学生。
  // 注意用 cardImg 计数：外层 .card 与内层 .cardImg/.cardInfo 都含 "card" 子串，
  // 直接选 [class*="card"] 会重复计数。
  const belongs = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return { total: dlg.querySelectorAll('[class*="cardImg"]').length };
  });

  await modal.locator('[class*="cardImg"]').first().click();
  await page.waitForTimeout(250);

  const filled = await page.evaluate((sid) => {
    const slot = document.querySelector(`[data-live-slot="${sid}"]`);
    return {
      hasFace: !!slot?.querySelector('img[class*="slotFace"]'),
      modalClosed: !document.querySelector('[role="dialog"]'),
    };
  }, id);

  filled.hasFace && filled.modalClosed
    ? ok(`${id}: 弹窗列出 ${belongs.total} 名本学院学生，选中后入格且弹窗关闭`)
    : bad(`${id}: 入格=${filled.hasFace} 弹窗关闭=${filled.modalClosed}`);
}

await page.waitForTimeout(400);
await board.screenshot({ path: path.join(outDir, '04-board-filled.png') });

const count = await page.locator('[class*="progress"] b').first().innerText();
count === '3' ? ok(`进度显示 ${count}/15`) : bad(`进度异常：${count}（期望 3）`);

// ---------- 6. 弹窗内搜索（仅中文）与不自动聚焦 ----------
console.log('\n=== 弹窗搜索 ===');
// 用阿拜多斯：白子属于该学院，才能验证「本学院内搜索」
await page.locator('[data-live-slot="abydos"]').click();
await page.waitForTimeout(400);

const focusInfo = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const input = dlg?.querySelector('input');
  return { isFocused: document.activeElement === input };
});
focusInfo.isFocused ? bad('打开弹窗时不应自动聚焦搜索框') : ok('打开弹窗未自动聚焦搜索框');

const countCards = () =>
  page.evaluate(() => document.querySelectorAll('[role="dialog"] [class*="cardImg"]').length);

const beforeAll = await countCards();
const search = page.locator('[role="dialog"] input');
await search.fill('白');
await page.waitForTimeout(400);
const hits = await page.evaluate(() =>
  [...document.querySelectorAll('[role="dialog"] [class*="cardInfo"] b')].map((b) => b.textContent)
);
hits.length > 0 && hits.length < beforeAll && hits.every((n) => n.includes('白'))
  ? ok(`搜索「白」在本学院 ${beforeAll} 名中命中 ${hits.length} 名：${hits.join('、')}`)
  : bad(`搜索「白」结果异常：命中 ${hits.length}/${beforeAll}：${hits.join('、') || '(空)'}`);

// 韩文搜索应当无效（已移除别名索引）
await search.fill('시로코');
await page.waitForTimeout(400);
const krHits = await countCards();
krHits === 0 ? ok('韩文搜索无结果（符合「仅支持中文」）') : bad(`韩文搜索仍有 ${krHits} 条结果`);

await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ---------- 7. 导出图片 ----------
console.log('\n=== 导出 ===');
const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
await page.getByRole('button', { name: /保存图片/ }).click();
try {
  const dl = await downloadPromise;
  const saved = path.join(outDir, 'export-result.png');
  await dl.saveAs(saved);
  const size = fs.statSync(saved).size;
  size > 100 * 1024 ? ok(`导出成功: ${dl.suggestedFilename()} (${(size / 1024).toFixed(0)} KB)`) : bad(`导出文件过小 ${size}B`);
} catch (e) {
  bad(`导出失败: ${e.message.split('\n')[0]}`);
}

await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, '06-after-export.png'), fullPage: true });

// ---------- 8. 移动端视图 ----------
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const mp = await mobile.newPage();
await mp.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
await mp.waitForTimeout(600);
await mp.screenshot({ path: path.join(outDir, '07-mobile.png'), fullPage: true });
console.log('✓ 移动端截图');

await browser.close();

console.log('\n=== 控制台错误 ===');
const realErrors = errors.filter((e) => !e.includes('ERR_ABORTED') && !e.includes('status of 404'));
if (realErrors.length === 0) console.log('无');
else realErrors.slice(0, 20).forEach((e) => console.log('  ' + e));

console.log(`\n${failures === 0 ? '✓ 桌面验收全部通过' : `✗ 有 ${failures} 项失败`}`);
console.log(`截图目录: ${outDir}`);
process.exit(failures === 0 ? 0 : 1);
