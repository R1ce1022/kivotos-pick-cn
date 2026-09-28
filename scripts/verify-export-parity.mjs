/**
 * 跨设备导出一致性验证。
 *
 * 核心诉求：同一份选择，在手机与电脑上导出的图片必须一致。
 * 做法：在桌面上下文与移动上下文里各做一遍完全相同的选择与导出，
 *       然后逐像素比对两张 PNG。
 *
 * 用法: node scripts/verify-export-parity.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const outDir = path.resolve('scripts/.shots');
fs.mkdirSync(outDir, { recursive: true });

/** 两个上下文都走同一段交互，保证选中同一批学生 */
const SLOTS = ['abydos', 'gehenna', 'trinity'];
const TEACHER = '一致性测试';

let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => {
  console.log('  ✗ ' + m);
  failures++;
};

/** 在指定上下文里完成一次导出，返回 PNG 文件路径 */
async function exportOnce(browser, { label, contextOptions }) {
  const ctx = await browser.newContext({ ...contextOptions, acceptDownloads: true });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.slice(0, 200)));

  await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(600);

  await page.getByPlaceholder('写下你的名字').fill(TEACHER);
  // 门禁：填了名字按钮才可用；这里顺带确认名字确实生效，否则导出会静默失败
  await page.waitForTimeout(250);
  const gateOk = await page.evaluate(() => {
    const btn = document.querySelector('[class*="saveBtn"]');
    return { disabled: !!btn?.disabled, hasTip: !!document.querySelector('[class*="saveTip"]') };
  });
  if (gateOk.disabled || gateOk.hasTip) {
    consoleErrors.push(`名字门禁未放行: disabled=${gateOk.disabled} 气泡=${gateOk.hasTip}`);
  }

  // 用弹窗对固定几个学院选人：每个学院都取列表第一张卡，
  // 若该角色有多套外观则明确选「第二套」——这样测的是非基础外观的导出，
  // 比选基础款更能暴露「两端外观不一致」的问题。两端做法完全一致。
  for (const id of SLOTS) {
    await page.locator(`[data-live-slot="${id}"]`).click();
    await page.waitForTimeout(300);
    await page.locator('[role="dialog"] [class*="cardImg"]').first().click();
    await page.waitForTimeout(300);
    const bar = page.locator('[data-skin-bar] [data-skin-id]');
    if (await page.evaluate(() => !!document.querySelector('[data-skin-bar]'))) {
      const count = await bar.count();
      // 有第二套就选第二套，否则退回第一套
      await bar.nth(count > 1 ? 1 : 0).click();
      await page.waitForTimeout(300);
    }
  }
  await page.waitForTimeout(400);

  // 记录选中了谁 + 用了哪套外观，便于两端核对。
  // 注意：学生名要去离屏导出节点读（屏幕槽位里只有立绘）；
  // 立绘取 .exportSlot 内的 img，外层 .exportLogo 里还有一枚校徽。
  const picked = await page.evaluate(() =>
    [...document.querySelectorAll('[data-export-slot]')]
      .map((s) => {
        const name = s.querySelector('[class*="exportStudentName"]')?.textContent?.trim();
        if (!name || name === '未选择') return null;
        const src = s.querySelector('[class*="exportSlot"] img')?.getAttribute('src') ?? '';
        return `${s.getAttribute('data-export-slot')}=${name}:${src.split('/').pop()}`;
      })
      .filter(Boolean)
  );

  const dlPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: /保存图片/ }).click();
  const dl = await dlPromise;
  const file = path.join(outDir, `parity-${label}.png`);
  await dl.saveAs(file);

  await ctx.close();
  return { file, picked, consoleErrors, suggested: dl.suggestedFilename() };
}

const browser = await chromium.launch({ channel: 'chrome' });

console.log('=== 1. 桌面上下文（1440×1000）===');
const desktop = await exportOnce(browser, {
  label: 'desktop',
  contextOptions: { viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' },
});
console.log(`  导出文件: ${path.basename(desktop.file)} (${(fs.statSync(desktop.file).size / 1024).toFixed(0)}KB)`);
console.log(`  选中: ${desktop.picked.join(', ')}`);

console.log('\n=== 2. 移动上下文（iPhone 12 / 390×844）===');
const mobile = await exportOnce(browser, {
  label: 'mobile',
  contextOptions: { ...devices['iPhone 12'], locale: 'zh-CN' },
});
console.log(`  导出文件: ${path.basename(mobile.file)} (${(fs.statSync(mobile.file).size / 1024).toFixed(0)}KB)`);
console.log(`  选中: ${mobile.picked.join(', ')}`);

await browser.close();

// ---------- 3. 比对 ----------
console.log('\n=== 3. 一致性比对 ===');

if (desktop.picked.join('|') !== mobile.picked.join('|')) {
  bad(`两端选中的角色/外观不一致：\n      桌面 ${desktop.picked.join(', ')}\n      移动 ${mobile.picked.join(', ')}`);
} else {
  // 顺带确认这次测的确实包含非基础外观，否则这条用例的覆盖度是虚的
  const nonBase = desktop.picked.filter((p) => {
    const skin = p.split(':')[1] ?? '';
    return !/^(10005|10000|10003)\.webp$/.test(skin);
  });
  if (nonBase.length === 0) {
    console.log('  ! 本次两端都只选到基础外观，未覆盖换装导出');
  } else {
    console.log(`  覆盖了 ${nonBase.length} 个非基础外观：${nonBase.join(', ')}`);
  }
  ok('两端选中的学生完全一致');
}

const a = PNG.sync.read(fs.readFileSync(desktop.file));
const b = PNG.sync.read(fs.readFileSync(mobile.file));

console.log(`  桌面图尺寸: ${a.width}×${a.height}`);
console.log(`  移动图尺寸: ${b.width}×${b.height}`);

if (a.width !== b.width || a.height !== b.height) {
  bad(`图片尺寸不一致（桌面 ${a.width}×${a.height} vs 移动 ${b.width}×${b.height}）`);
} else {
  ok(`图片尺寸一致：${a.width}×${a.height}`);
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const total = a.width * a.height;
  const ratio = diffPixels / total;

  console.log(`  差异像素: ${diffPixels} / ${total} = ${(ratio * 100).toFixed(4)}%`);

  if (diffPixels === 0) {
    ok('逐像素完全一致');
  } else if (ratio < 0.01) {
    ok(`差异 ${(ratio * 100).toFixed(4)}%，在 1% 容差内（预期仅字体抗锯齿差异）`);
    fs.writeFileSync(path.join(outDir, 'parity-diff.png'), PNG.sync.write(diff));
    console.log(`  差异图已保存: scripts/.shots/parity-diff.png`);
  } else {
    bad(`差异 ${(ratio * 100).toFixed(2)}% 超过 1% 阈值`);
    fs.writeFileSync(path.join(outDir, 'parity-diff.png'), PNG.sync.write(diff));
    console.log('  差异图已保存: scripts/.shots/parity-diff.png');
  }
}

// 控制台错误
const errs = [...desktop.consoleErrors, ...mobile.consoleErrors];
if (errs.length) bad(`控制台错误: ${errs.slice(0, 3).join(' | ')}`);
else ok('两端控制台均无错误');

console.log(`\n${failures === 0 ? '✓ 跨设备导出一致性验证通过' : `✗ 有 ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
