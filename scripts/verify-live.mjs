/**
 * 最终线上验收：一次跑完全部流程并给出结论。
 * 顺序严格照用户实际操作：打开 → 滚动看列表 → 填名字 → 选人 → 导出。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { netFetch } from './net.mjs';

const base = (process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn').replace(/\/$/, '');
const origin = new URL(base).origin;

let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => {
  console.log('  ✗ ' + m);
  failures++;
};

console.log(`目标: ${base}\n`);

// ---------- 1. 静态资源 ----------
console.log('=== 静态资源 ===');
for (const [label, url] of [
  ['首页', `${base}/`],
  ['最爱学生页', `${base}/favorite-students/`],
  ['学生头像', `${base}/assets/students/10000.webp`],
  ['NPC 头像', `${base}/assets/students/npc-arona.webp`],
  ['学院校徽', `${base}/assets/schools/abydos.png`],
]) {
  const res = await netFetch(url, { retries: 3, timeoutMs: 30000 });
  const len = (await res.arrayBuffer()).byteLength;
  res.ok && len > 0 ? ok(`${label} ${res.status} (${(len / 1024).toFixed(1)}KB)`) : bad(`${label} ${res.status}`);
}

const pageRes = await netFetch(`${base}/favorite-students/`, { retries: 3 });
const html = await pageRes.text();
const refs = [...new Set([...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]))];
let refBad = 0;
for (const r of refs) {
  const res = await netFetch(origin + r, { retries: 2, timeoutMs: 25000 });
  if (!res.ok) refBad++;
}
refBad === 0 ? ok(`HTML 内 ${refs.length} 个引用全部可访问`) : bad(`${refBad}/${refs.length} 个引用失败`);

// ---------- 2. 浏览器实测 ----------
console.log('\n=== 浏览器实测 ===');
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const p = await ctx.newPage();

const consoleErrors = [];
const req404 = [];
p.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 150));
});
p.on('response', (r) => {
  if (r.status() === 404) req404.push(r.url());
});
p.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(800);

// 2.1 等待图片解码稳定
// 屏幕上的图片现在只有选择板的 15 张校徽（名单区已移除，懒加载也就不存在了），
// 因此这里应当很快收敛；离屏导出节点的副本不计入。
let imgs = { total: 0, loaded: 0 };
for (let i = 0; i < 20; i++) {
  await p.waitForTimeout(600);
  imgs = await p.evaluate(() => {
    const list = [...document.querySelectorAll('img')].filter(
      (i) => !i.closest('[data-export-stage]')
    );
    return {
      total: list.length,
      loaded: list.filter((i) => i.naturalWidth > 0).length,
    };
  });
  if (imgs.loaded === imgs.total) break;
}
imgs.loaded === imgs.total
  ? ok(`屏幕图片 ${imgs.loaded}/${imgs.total} 全部解码`)
  : bad(`屏幕图片仅 ${imgs.loaded}/${imgs.total} 解码`);

const structure = await p.evaluate(() => ({
  slots: document.querySelectorAll('[data-live-slot]').length,
  h1: document.querySelector('h1')?.textContent,
}));
structure.slots === 15
  ? ok(`结构正确：${structure.slots} 个学院格`)
  : bad(`结构异常：${structure.slots} 格`);

// 2.1b 校徽可见性（11 个素材是白色透明底，必须压深）
const emblemLums = await p.evaluate(async () => {
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
const invisible = emblemLums.filter((l) => l > 200);
invisible.length === 0
  ? ok(`校徽全部可见（${emblemLums.length} 个，最高亮度 ${Math.max(...emblemLums)}）`)
  : bad(`${invisible.length}/${emblemLums.length} 个校徽几乎不可见`);

// 2.2 名字门禁：未填名字时不允许导出
const gate = await p.evaluate(() => {
  const btn = document.querySelector('[class*="saveBtn"]');
  const tip = document.querySelector('[class*="saveTip"]');
  return { disabled: !!btn?.disabled, tipText: tip?.textContent?.trim() ?? null };
});
gate.disabled
  ? ok(`线上名字门禁生效（气泡「${gate.tipText}」）`)
  : bad('线上未填名字时保存按钮竟可用');

await p.getByPlaceholder('写下你的名字').fill('线上验收');
await p.waitForTimeout(300);
ok('填入老师名字');

// 2.3 点学院格 → 弹窗只列本学院 → 点学生入格
await p.locator('[data-live-slot="abydos"]').click();
await p.waitForTimeout(500);
const modalScope = await p.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  // 必须用 cardImg 计数：外层 .card 与内层 .cardImg/.cardInfo 都含 "card" 子串，
  // 直接查 [class*="card"] 会把一名学生数成 3 个。
  return { open: !!dlg, cards: dlg?.querySelectorAll('[class*="cardImg"]').length ?? 0 };
});
modalScope.open && modalScope.cards > 0
  ? ok(`弹窗打开并列出 ${modalScope.cards} 名阿拜多斯学生`)
  : bad(`弹窗异常：open=${modalScope.open} cards=${modalScope.cards}`);

await p.locator('[role="dialog"] [class*="cardImg"]').first().click();
await p.waitForTimeout(500);
const prog = await p.locator('[class*="progress"] b').first().innerText();
prog === '1' ? ok('点学生后入格，进度 1/15') : bad(`进度异常：${prog}`);

// 2.4 弹窗内中文搜索（用阿拜多斯：白子属于该学院，才能验证「本学院内搜索」）
await p.locator('[data-live-slot="abydos"]').click();
await p.waitForTimeout(400);
await p.locator('[role="dialog"] input').fill('白');
await p.waitForTimeout(500);
const searchHits = await p.evaluate(() =>
  [...document.querySelectorAll('[role="dialog"] [class*="cardInfo"] b')].map((b) => b.textContent)
);
searchHits.length > 0 && searchHits.every((n) => n.includes('白'))
  ? ok(`弹窗内搜索「白」命中 ${searchHits.length} 名：${searchHits.join('、')}`)
  : bad(`弹窗搜索异常：${searchHits.join('、') || '(空)'}`);

// 韩文搜索应当无结果（别名索引已移除）
await p.locator('[role="dialog"] input').fill('시로코');
await p.waitForTimeout(500);
const krHits = await p.evaluate(
  () => document.querySelectorAll('[role="dialog"] [class*="cardImg"]').length
);
krHits === 0 ? ok('韩文搜索无结果（仅支持中文）') : bad(`韩文搜索仍有 ${krHits} 条结果`);

await p.keyboard.press('Escape');
await p.waitForTimeout(300);

// 2.6 导出
console.log('\n--- 导出 ---');
req404.length = 0;
const btn = p.getByRole('button', { name: /保存图片/ });
const t0 = Date.now();
const dlPromise = p.waitForEvent('download', { timeout: 120000 });
await btn.click();
try {
  const d = await dlPromise;
  const saved = 'scripts/.shots/live-export-final.png';
  await d.saveAs(saved);
  const size = fs.statSync(saved).size;
  ok(`导出成功: ${d.suggestedFilename()} (${(size / 1024).toFixed(0)}KB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // 校验导出图片确实是有效 PNG 且有内容
  const head = fs.readFileSync(saved).subarray(0, 8);
  const isPng = head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  isPng && size > 100 * 1024 ? ok('导出文件是有效 PNG 且体积正常') : bad('导出文件异常');
} catch (e) {
  bad(`导出失败: ${e.message.split('\n')[0]}`);
}

req404.length === 0 ? ok('导出期间无 404 请求') : bad(`导出期间有 ${req404.length} 个 404：${req404.slice(0, 3).join(', ')}`);

// 2.7 导出后页面是否恢复
const afterAttr = await p.evaluate(
  () => document.querySelector('[data-live-slot] img')?.getAttribute('src')
);
afterAttr?.startsWith('/kivotos-pick-cn/')
  ? ok(`导出后 src 正确还原: ${afterAttr}`)
  : bad(`导出后 src 未还原: ${afterAttr}`);

console.log('\n控制台错误:', consoleErrors.length ? consoleErrors.slice(0, 5).join(' | ') : '无');
p.removeAllListeners();

await p.screenshot({ path: 'scripts/.shots/live-final.png', fullPage: false });
await browser.close();

console.log(`\n${failures === 0 ? '✓ 线上验收全部通过' : `✗ 有 ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
