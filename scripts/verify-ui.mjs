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
const eqNum = (actual, expected, label) =>
  String(actual) === String(expected) ? ok(`${label}: ${actual}`) : bad(`${label}: 期望 ${expected}，实际 ${actual}`);

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

// ---------- 4. 名字门禁：必须填了名字才能导出 ----------
console.log('\n=== 名字门禁 ===');
const saveBtn = page.getByRole('button', { name: /保存图片/ });
const nameInput = page.getByPlaceholder('写下你的名字');
const gateState = () =>
  page.evaluate(() => {
    const btn = document.querySelector('[class*="saveBtn"]');
    const tip = document.querySelector('[class*="saveTip"]');
    return {
      disabled: !!btn?.disabled,
      hasTip: !!tip,
      tipText: tip?.textContent?.trim() ?? null,
      describedBy: btn?.getAttribute('aria-describedby') ?? null,
    };
  });

{
  const s0 = await gateState();
  s0.disabled && s0.hasTip
    ? ok(`未填名字时按钮不可用，且气泡提示「${s0.tipText}」`)
    : bad(`门禁未生效: disabled=${s0.disabled} 气泡=${s0.hasTip}`);
  s0.describedBy ? ok(`气泡通过 aria-describedby 关联（${s0.describedBy}）`) : bad('缺少 aria-describedby');

  // 纯空格不应放行
  await nameInput.fill('   ');
  await page.waitForTimeout(250);
  const s1 = await gateState();
  s1.disabled ? ok('纯空格输入仍不可用') : bad('纯空格被当成了有效名字');

  // 正常名字应放行
  await nameInput.fill('测试老师');
  await page.waitForTimeout(250);
  const s2 = await gateState();
  !s2.disabled && !s2.hasTip
    ? ok('填入名字后按钮可用，气泡消失')
    : bad(`填名后仍异常: disabled=${s2.disabled} 气泡=${s2.hasTip}`);
}

// ---------- 5. 交互：点学院格 → 弹窗只含该学院 → 点学生入格 ----------
console.log('\n=== 点学院选人 ===');
const pickSlots = ['abydos', 'gehenna', 'trinity'];
for (const id of pickSlots) {
  await page.locator(`[data-live-slot="${id}"]`).click();
  await page.waitForTimeout(300);
  const modal = page.locator('[role="dialog"]');
  await modal.waitFor({ state: 'visible' });

  // 断言：弹窗只为该学院列出角色。
  // 注意用 cardImg 计数：外层 .card 与内层 .cardImg/.cardInfo 都含 "card" 子串，
  // 直接选 [class*="card"] 会重复计数。
  const belongs = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return { total: dlg.querySelectorAll('[class*="cardImg"]').length };
  });

  // 点第一张卡：多套外观的角色会展开外观条，此时再点第一套外观入格
  await modal.locator('[class*="cardImg"]').first().click();
  await page.waitForTimeout(250);
  const skinBarShown = await page.evaluate(() => !!document.querySelector('[data-skin-bar]'));
  if (skinBarShown) {
    await page.locator('[data-skin-bar] [data-skin-id]').first().click();
    await page.waitForTimeout(250);
  }

  const filled = await page.evaluate((sid) => {
    const slot = document.querySelector(`[data-live-slot="${sid}"]`);
    return {
      hasFace: !!slot?.querySelector('img[class*="slotFace"]'),
      modalClosed: !document.querySelector('[role="dialog"]'),
    };
  }, id);

  filled.hasFace && filled.modalClosed
    ? ok(`${id}: 弹窗列出 ${belongs.total} 名本学院角色，选中后入格且弹窗关闭`)
    : bad(`${id}: 入格=${filled.hasFace} 弹窗关闭=${filled.modalClosed}`);
}

await page.waitForTimeout(400);
await board.screenshot({ path: path.join(outDir, '04-board-filled.png') });

const count = await page.locator('[class*="progress"] b').first().innerText();
count === '3' ? ok(`进度显示 ${count}/15`) : bad(`进度异常：${count}（期望 3）`);

// ---------- 5b. 外观（皮肤）切换 ----------
console.log('\n=== 外观切换 ===');
{
  // 阿拜多斯的星野有 3 套外观：点卡片应展开外观条而不是直接入格
  await page.locator('[data-live-slot="abydos"]').click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const names = [...dlg.querySelectorAll('[class*="cardInfo"] b')].map((b) => b.textContent);
    const cards = [...dlg.querySelectorAll('[class*="card"]')].filter((c) =>
      c.querySelector('b')?.textContent === '星野'
    );
    return {
      names: names.join('、'),
      cardCount: names.length,
      badge: cards[0]?.querySelector('[class*="cardSkinBadge"]')?.textContent ?? null,
      hasBar: !!document.querySelector('[data-skin-bar]'),
    };
  });
  before.hasBar ? bad('刚打开弹窗就显示了外观条') : ok('刚打开弹窗时没有外观条');
  eqNum(before.badge, '3', '星野卡片标出 3 套外观（重复的「武装」已合并）');

  // 白子＊恐怖必须与白子是**两名学生**，不能被当成同一角色的两套外观
  before.names.includes('白子＊恐怖')
    ? ok(`「白子＊恐怖」独立成一名学生（阿拜多斯共 ${before.cardCount} 名）`)
    : bad(`「白子＊恐怖」未独立：${before.names}`);
  eqNum(before.cardCount, 7, '阿拜多斯角色数（含独立的恐怖白子）');

  // 点星野（多套外观）→ 应展开外观条，且弹窗仍未关闭
  await page.locator('[role="dialog"] [class*="cardInfo"]', { hasText: '星野' }).first().click();
  await page.waitForTimeout(350);

  const bar = await page.evaluate(() => {
    const b = document.querySelector('[data-skin-bar]');
    if (!b) return null;
    return {
      modalStillOpen: !!document.querySelector('[role="dialog"]'),
      skins: [...b.querySelectorAll('[data-skin-id]')].map((i) => ({
        id: i.getAttribute('data-skin-id'),
        src: i.querySelector('img')?.getAttribute('src') ?? '',
      })),
    };
  });

  if (!bar) {
    bad('点多套外观的角色后未出现外观条');
  } else {
    eqNum(bar.skins.length, 3, '外观条列出 3 套外观');
    bar.modalStillOpen ? ok('展开外观条时弹窗保持打开') : bad('展开外观条时弹窗被关掉了');
    bar.skins[0].id === 's10005' ? ok('第一套是基础外观') : bad(`第一套异常：${bar.skins[0].id}`);

    // 选「泳装」（第二套）→ 应入格、关闭弹窗、槽位立绘换成该外观
    await page.locator('[data-skin-id="s10045"]').click();
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => {
      const slot = document.querySelector('[data-live-slot="abydos"]');
      return {
        src: slot?.querySelector('img[class*="slotFace"]')?.getAttribute('src') ?? '',
        modalClosed: !document.querySelector('[role="dialog"]'),
      };
    });
    after.src.includes('10045') ? ok(`槽位立绘切到所选外观（${after.src.split('/').pop()}）`) : bad(`槽位立绘未切换：${after.src}`);
    after.modalClosed ? ok('选完外观后弹窗关闭') : bad('选完外观后弹窗未关闭');

    // 再次打开：该角色应高亮，且当前外观被标记
    await page.locator('[data-live-slot="abydos"]').click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(300);
    await page.locator('[role="dialog"] [class*="cardInfo"]', { hasText: '星野' }).first().click();
    await page.waitForTimeout(350);
    const active = await page.evaluate(
      () => document.querySelector('[data-skin-bar] [class*="skinItemActive"]')?.getAttribute('data-skin-id') ?? null
    );
    active === 's10045' ? ok('再次打开时当前外观被高亮') : bad(`高亮异常：${active}`);

    // 切回基础外观
    await page.locator('[data-skin-id="s10005"]').click();
    await page.waitForTimeout(400);
    const back = await page.evaluate(
      () => document.querySelector('[data-live-slot="abydos"] img[class*="slotFace"]')?.getAttribute('src') ?? ''
    );
    back.includes('10005') ? ok('可以切回基础外观') : bad(`切回失败：${back}`);
  }

  // 单套外观的角色（梦）应一步入格，不出现外观条
  await page.locator('[data-live-slot="abydos"]').click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(250);
  await page.locator('[role="dialog"] [class*="cardInfo"]', { hasText: '梦' }).first().click();
  await page.waitForTimeout(400);
  const single = await page.evaluate(() => ({
    hasBar: !!document.querySelector('[data-skin-bar]'),
    src: document.querySelector('[data-live-slot="abydos"] img[class*="slotFace"]')?.getAttribute('src') ?? '',
    modalClosed: !document.querySelector('[role="dialog"]'),
  }));
  !single.hasBar && single.modalClosed
    ? ok('单套外观的角色一步入格，不出现外观条')
    : bad(`单套外观角色异常：外观条=${single.hasBar} 弹窗关闭=${single.modalClosed}`);
}

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

// 计数用 cardInfo b（每张卡恰好一个）：
// cardImg 会同时命中外观角标里的元素，用它计数会偏大。
const countCards = () =>
  page.evaluate(() => document.querySelectorAll('[role="dialog"] [class*="cardInfo"] b').length);

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

// 导出前先确认离屏导出节点用的是所选外观，而不只是屏幕那份。
// 注意取 .exportSlot 内的 img：外层 .exportLogo 里还有一枚校徽。
// 此格最终放的是「梦」（NPC，皮肤 id 为 npc-yume）。
const exportSkin = await page.evaluate(() => {
  const node = document.querySelector('[data-export-slot="abydos"] [class*="exportSlot"] img');
  return node?.getAttribute('src') ?? '';
});
exportSkin.includes('npc-yume')
  ? ok(`导出节点使用所选外观（${exportSkin.split('/').pop()}）`)
  : bad(`导出节点未使用所选外观：${exportSkin}`);

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
