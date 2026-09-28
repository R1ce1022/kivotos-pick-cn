/**
 * 移动端适配验收：溢出、弹窗、列数、标签高度、触屏交互。
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

// ---------- 1. 多视口：无横向溢出 + 列数/卡片宽度合理 ----------
console.log('=== 1. 多视口布局 ===');
// 手机段要求 2 列；更宽视口交给 auto-fill，只需保证卡片宽度落在合理区间
const VIEWPORTS = [
  { w: 320, h: 800, cardCols: 2 },
  { w: 360, h: 800, cardCols: 2 },
  { w: 390, h: 844, cardCols: 2 },
  { w: 430, h: 932, cardCols: 2 },
  { w: 768, h: 1024, cardCols: null },
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
    const grid = document.querySelector('[class*="gridRoster"]');
    const card = document.querySelector('[data-student-id]');
    const tabs = document.querySelector('[class*="tabs"]');
    const cols = (el) => (el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 0);
    return {
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      cardCols: cols(grid),
      cardW: card?.offsetWidth ?? 0,
      tabsH: tabs?.offsetHeight ?? 0,
    };
  });

  const tag = `${vp.w}px`;
  m.scrollW <= m.innerW + 1
    ? ok(`${tag} 无横向溢出 (scrollW=${m.scrollW})`)
    : bad(`${tag} 横向溢出: scrollW=${m.scrollW} > ${m.innerW}`);

  if (vp.cardCols !== null) is(m.cardCols, vp.cardCols, `${tag} 名单列数`);

  // 卡片宽度应落在 120–220px：过窄挤字，过宽浪费空间
  // （320px 下约 129px，因为面板本身有内边距，属于合理下限）
  m.cardW >= 120 && m.cardW <= 220
    ? ok(`${tag} 卡片宽度合理 (${m.cardW}px, ${m.cardCols} 列)`)
    : bad(`${tag} 卡片宽度 ${m.cardW}px 超出 120–220px 区间`);

  if (vp.w <= 760) {
    m.tabsH <= 56
      ? ok(`${tag} 标签单行 (${m.tabsH}px)`)
      : bad(`${tag} 标签占高 ${m.tabsH}px，超过 56px`);
  }

  await ctx.close();
}

// ---------- 2. 移动端弹窗不得溢出 ----------
console.log('\n=== 2. 移动端弹窗 ===');
{
  const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'zh-CN' });
  const p = await ctx.newPage();
  await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.locator('[data-live-slot="abydos"]').click();
  await p.waitForTimeout(600);

  const m = await p.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]');
    if (!modal) return null;
    const r = modal.getBoundingClientRect();
    const foot = modal.querySelector('[class*="modalFoot"]');
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      footBottom: foot ? Math.round(foot.getBoundingClientRect().bottom) : null,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
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

  // 触屏上不应启用原生拖拽
  const drag = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-student-id]')];
    return { total: cards.length, draggable: cards.filter((c) => c.getAttribute('draggable') === 'true').length };
  });
  is(drag.draggable, 0, `触屏 draggable 卡片数（共 ${drag.total} 张）`);

  // 点学生 → 固定底栏应出现在视口内
  await p.locator('[data-student-id]').first().click();
  await p.waitForTimeout(500);
  const pending = await p.evaluate(() => {
    const bar = document.querySelector('[class*="pendingBar"]');
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    const s = getComputedStyle(bar);
    return {
      position: s.position,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      innerH: window.innerHeight,
      visible: r.top >= 0 && r.bottom <= window.innerHeight,
      scrollY: Math.round(window.scrollY),
    };
  });

  if (!pending) {
    bad('点学生后未出现选中提示条');
  } else {
    pending.position === 'fixed' && pending.visible
      ? ok(`选中提示固定在视口内 (top=${pending.top}, 视口高=${pending.innerH}, scrollY=${pending.scrollY})`)
      : bad(`选中提示不可见: position=${pending.position}, visible=${pending.visible}`);
  }

  // 点槽位放入
  await p.locator('[data-live-slot="abydos"]').click();
  await p.waitForTimeout(500);
  const placed = await p.evaluate(() => {
    const slot = document.querySelector('[data-live-slot="abydos"]');
    const progress = document.querySelector('[class*="progress"] b')?.textContent;
    return {
      filled: !!slot?.querySelector('[class*="slotFace"]'),
      pendingGone: !document.querySelector('[class*="pendingBar"]'),
      progress,
    };
  });
  placed.filled ? ok('点槽位成功放入学生') : bad('点槽位未放入学生');
  placed.pendingGone ? ok('放入后提示条消失') : bad('放入后提示条未消失');
  is(placed.progress, '1', '进度计数');

  // 清除按钮触控尺寸
  const clearSize = await p.evaluate(() => {
    const c = document.querySelector('[class*="slotClear"]');
    return c ? { w: c.offsetWidth, h: c.offsetHeight } : null;
  });
  if (!clearSize) bad('未找到清除按钮');
  else
    clearSize.w >= 32 && clearSize.h >= 32
      ? ok(`清除按钮触控尺寸 ${clearSize.w}×${clearSize.h}`
      )
      : bad(`清除按钮过小 ${clearSize.w}×${clearSize.h}，应 ≥32×32`);

  await ctx.close();
}

// ---------- 4. 移动端也能正常导出 ----------
console.log('\n=== 4. 移动端导出 ===');
{
  const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'zh-CN', acceptDownloads: true });
  const p = await ctx.newPage();
  await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  const dlP = p.waitForEvent('download', { timeout: 90000 }).catch(() => null);
  await p.getByRole('button', { name: /保存图片/ }).click();
  const dl = await dlP;
  if (!dl) {
    bad('移动端导出未产生下载（若走了系统分享则属预期，此处仅检查不抛错）');
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
