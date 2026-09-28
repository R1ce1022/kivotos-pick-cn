/**
 * 移动端适配验收：溢出、弹窗、列数、触屏交互、导出。
 * 用法: node scripts/verify-mobile.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';

let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => {
  console.log('  ✗ ' + m);
  failures++;
};
const is = (actual, expected, label) =>
  actual === expected ? ok(`${label}: ${actual}`) : bad(`${label}: 期望 ${expected}，实际 ${actual}`);

const browser = await chromium.launch({ channel: 'chrome' });

// ---------- 1. 多视口：无横向溢出 + 选择板列数 ----------
console.log('=== 1. 多视口布局 ===');
const VIEWPORTS = [
  { w: 320, h: 800, boardCols: 2 },
  { w: 360, h: 800, boardCols: 2 },
  { w: 390, h: 844, boardCols: 2 },
  { w: 430, h: 932, boardCols: 2 },
  { w: 768, h: 1024, boardCols: 3 },
  { w: 1024, h: 768, boardCols: 4 },
];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    isMobile: vp.w < 768,
    hasTouch: vp.w < 768,
    deviceScaleFactor: 1,
  });
  const p = await ctx.newPage();
  await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);

  const m = await p.evaluate(() => {
    const board = document.querySelector('[class*="board"]:not([class*="export"])');
    const slot = document.querySelector('[data-live-slot]');
    const cols = (el) => (el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 0);
    return {
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      boardCols: cols(board),
      slotW: slot?.offsetWidth ?? 0,
      slotH: slot?.offsetHeight ?? 0,
      // 槽位应当是 1:1
      ratio: slot ? +(slot.offsetWidth / slot.offsetHeight).toFixed(2) : 0,
      // 旧的学生名单区块不应再存在
      hasRoster: !!document.querySelector('[class*="roster"]'),
      hasTabs: !!document.querySelector('[class*="tabs"]'),
    };
  });

  const tag = `${vp.w}px`;
  m.scrollW <= m.innerW + 1
    ? ok(`${tag} 无横向溢出 (scrollW=${m.scrollW})`)
    : bad(`${tag} 横向溢出: scrollW=${m.scrollW} > ${m.innerW}`);

  is(m.boardCols, vp.boardCols, `${tag} 选择板列数`);
  Math.abs(m.ratio - 1) <= 0.03
    ? ok(`${tag} 槽位为正方形 (${m.slotW}×${m.slotH})`)
    : bad(`${tag} 槽位比例 ${m.ratio}，应为 1:1`);
  !m.hasRoster ? ok(`${tag} 无学生名单区块`) : bad(`${tag} 仍存在学生名单区块`);
  !m.hasTabs ? ok(`${tag} 无学院标签条`) : bad(`${tag} 仍存在学院标签条`);

  await ctx.close();
}

// ---------- 2. 移动端弹窗：不溢出 + 只列本学院 + 不自动聚焦 ----------
console.log('\n=== 2. 移动端弹窗 ===');
{
  const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'zh-CN' });
  const p = await ctx.newPage();
  await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  await p.locator('[data-live-slot="gehenna"]').click();
  await p.waitForTimeout(600);

  const m = await p.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]');
    if (!modal) return null;
    const r = modal.getBoundingClientRect();
    const foot = modal.querySelector('[class*="modalFoot"]');
    const input = modal.querySelector('input');
    // 用 cardImg 计数，避免外层 .card 与内层 .cardImg/.cardInfo 重复
    const cards = [...modal.querySelectorAll('[class*="cardImg"]')];
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      footBottom: foot ? Math.round(foot.getBoundingClientRect().bottom) : null,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      hasTabs: !!modal.querySelector('[class*="modalTabs"]'),
      autoFocused: document.activeElement === input,
      cardCount: cards.length,
    };
  });

  if (!m) {
    bad('弹窗未打开');
  } else {
    m.left >= 0 && m.right <= m.innerW
      ? ok(`弹窗在视口内 (left=${m.left}, right=${m.right}, 视口宽=${m.innerW})`)
      : bad(`弹窗溢出: left=${m.left}, right=${m.right}, 视口宽=${m.innerW}`);
    m.footBottom !== null && m.footBottom <= m.innerH
      ? ok('弹窗底部按钮可见')
      : bad(`弹窗底部按钮超出视口 (footBottom=${m.footBottom}, 视口高=${m.innerH})`);
    m.hasHorizontalOverflow ? bad('弹窗导致页面横向溢出') : ok('弹窗未引起横向溢出');
    !m.hasTabs ? ok('弹窗内无学院标签条') : bad('弹窗内仍有学院标签条');
    !m.autoFocused ? ok('打开弹窗未自动聚焦搜索框') : bad('打开弹窗时自动聚焦了搜索框');
    m.cardCount > 0 ? ok(`列出 ${m.cardCount} 名本学院学生`) : bad('弹窗内没有学生');
  }
  await ctx.close();
}

// ---------- 3. 触屏交互 ----------
console.log('\n=== 3. 触屏交互 ===');
{
  const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'zh-CN' });
  const p = await ctx.newPage();
  await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  // 不应存在可拖拽元素（拖拽已移除）
  const drag = await p.evaluate(() => ({
    total: document.querySelectorAll('[data-live-slot], [class*="card"]').length,
    draggable: document.querySelectorAll('[draggable="true"]').length,
  }));
  is(drag.draggable, 0, `可拖拽元素数（共 ${drag.total} 个交互元素）`);

  // 点槽位 → 弹窗 → 点学生 → 入格
  await p.locator('[data-live-slot="abydos"]').click();
  await p.waitForTimeout(500);
  await p.locator('[role="dialog"] [class*="cardImg"]').first().click();
  await p.waitForTimeout(500);

  const placed = await p.evaluate(() => {
    const slot = document.querySelector('[data-live-slot="abydos"]');
    return {
      filled: !!slot?.querySelector('img[class*="slotFace"]'),
      modalClosed: !document.querySelector('[role="dialog"]'),
      progress: document.querySelector('[class*="progress"] b')?.textContent,
    };
  });
  placed.filled ? ok('点学生后成功入格') : bad('未入格');
  placed.modalClosed ? ok('入格后弹窗关闭') : bad('入格后弹窗未关闭');
  is(placed.progress, '1', '进度计数');

  // 清除按钮触控尺寸（需先让槽位处于已选状态）
  const clearSize = await p.evaluate(() => {
    const c = document.querySelector('[class*="slotClear"]');
    return c ? { w: c.offsetWidth, h: c.offsetHeight } : null;
  });
  if (!clearSize) bad('未找到清除按钮');
  else
    clearSize.w >= 32 && clearSize.h >= 32
      ? ok(`清除按钮触控尺寸 ${clearSize.w}×${clearSize.h}`)
      : bad(`清除按钮过小 ${clearSize.w}×${clearSize.h}，应 ≥32×32`);

  await ctx.close();
}

// ---------- 4. 校徽在移动端也可见 ----------
console.log('\n=== 4. 移动端校徽可见性 ===');
{
  const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'zh-CN' });
  const p = await ctx.newPage();
  await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);

  const emblems = await p.evaluate(async () => {
    const slots = [...document.querySelectorAll('[data-live-slot]')];
    const out = [];
    for (const s of slots) {
      const img = s.querySelector('img');
      if (!img) continue;
      const cs = getComputedStyle(img);
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
      const op = Number(cs.opacity);
      out.push(Math.round((n ? sum / n : 255) * op + 250 * (1 - op)));
    }
    return out;
  });

  const invisible = emblems.filter((l) => l > 200);
  invisible.length === 0
    ? ok(`${emblems.length} 个校徽全部可见（最高亮度 ${Math.max(...emblems)}）`)
    : bad(`${invisible.length} 个校徽几乎不可见`);
  await ctx.close();
}

// ---------- 5. 移动端导出 ----------
console.log('\n=== 5. 移动端导出 ===');
{
  const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'zh-CN', acceptDownloads: true });
  const p = await ctx.newPage();
  await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  const dlP = p.waitForEvent('download', { timeout: 90000 }).catch(() => null);
  await p.getByRole('button', { name: /保存图片/ }).click();
  const dl = await dlP;
  if (!dl) {
    bad('移动端导出未产生下载');
  } else {
    const fs = await import('node:fs');
    const saved = 'scripts/.shots/mobile-export.png';
    await dl.saveAs(saved);
    const size = fs.statSync(saved).size;
    size > 100 * 1024 ? ok(`移动端导出成功 (${(size / 1024).toFixed(0)}KB)`) : bad(`导出文件过小 ${size}B`);
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${failures === 0 ? '✓ 移动端验收全部通过' : `✗ 有 ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
