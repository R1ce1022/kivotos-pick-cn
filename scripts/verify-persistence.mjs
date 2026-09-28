/**
 * 本地存储的浏览器端验收：选择记录在刷新后保留、重置后清空。
 * 用法: node scripts/verify-persistence.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';

let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => {
  console.log('  ✗ ' + m);
  failures++;
};

const browser = await chromium.launch({ channel: 'chrome' });

/** 读取当前已选状态（从槽位里的学生名反推） */
const readBoard = (page) =>
  page.evaluate(() => {
    const out = {};
    for (const slot of document.querySelectorAll('[data-live-slot]')) {
      const img = slot.querySelector('img[class*="slotFace"]');
      out[slot.getAttribute('data-live-slot')] = img ? img.getAttribute('alt') || '已选' : null;
    }
    return out;
  });

const readStore = (page) =>
  page.evaluate(() => {
    const raw = window.localStorage.getItem('kivotos-pick-cn:roster:v1');
    return raw ? JSON.parse(raw) : null;
  });

// ---------- 1. 选择后写入存储 ----------
console.log('=== 1. 选择后写入存储 ===');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const before = await readStore(page);
before === null ? ok('首次访问时无存储记录') : bad(`首次访问竟已有记录：${JSON.stringify(before)}`);

await page.getByPlaceholder('写下你的名字').fill('持久化测试');
for (const id of ['abydos', 'gehenna']) {
  await page.locator(`[data-live-slot="${id}"]`).click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(200);
  await page.locator('[role="dialog"] [class*="cardImg"]').first().click();
  await page.waitForTimeout(280);
}

const stored = await readStore(page);
if (!stored) {
  bad('选择后未写入存储');
} else {
  stored.slots?.length === 2 ? ok(`存储记录了 ${stored.slots.length} 个学院`) : bad(`存储记录数异常：${stored.slots?.length}`);
  stored.teacher === '持久化测试' ? ok('老师名一并保存') : bad(`老师名未保存：${stored.teacher}`);
  stored.version === 1 ? ok('带版本号') : bad('缺少版本号');
  // 不应把整个学生对象塞进去
  const raw = JSON.stringify(stored);
  raw.includes('icon') ? bad('存储里混入了学生对象（应只存 id）') : ok('只存 id 引用，未存学生对象');
}

const boardBefore = await readBoard(page);
const selectedIds = Object.entries(boardBefore).filter(([, v]) => v).map(([k]) => k);
console.log(`  已选: ${selectedIds.join(', ')}`);

// ---------- 2. 刷新后保留 ----------
console.log('\n=== 2. 刷新后保留 ===');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const boardAfter = await readBoard(page);
const stillSelected = Object.entries(boardAfter).filter(([, v]) => v).map(([k]) => k);
const sameSet =
  stillSelected.length === selectedIds.length && selectedIds.every((id) => stillSelected.includes(id));
sameSet
  ? ok(`刷新后选择保留：${stillSelected.join(', ')}`)
  : bad(`刷新后选择丢失：刷新前 [${selectedIds}]，刷新后 [${stillSelected}]`);

const nameAfter = await page.getByPlaceholder('写下你的名字').inputValue();
nameAfter === '持久化测试' ? ok('老师名也恢复') : bad(`老师名未恢复：${JSON.stringify(nameAfter)}`);

// 恢复应给用户一个提示
const toastSeen = await page.evaluate(() => document.body.innerText.includes('已恢复'));
toastSeen ? ok('出现「已恢复」提示') : bad('未给出恢复提示');

// 从全新上下文（模拟重开浏览器）访问也应恢复
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
await ctx2.addInitScript(() => {});
const p2 = await ctx2.newPage();
// 复制存储到新上下文
const storeJson = JSON.stringify(stored);
await p2.goto(`${base}/favorite-students/`, { waitUntil: 'domcontentloaded' });
await p2.evaluate((v) => window.localStorage.setItem('kivotos-pick-cn:roster:v1', v), storeJson);
await p2.reload({ waitUntil: 'networkidle' });
await p2.waitForTimeout(1000);
const boardNew = await readBoard(p2);
const restoredNew = Object.entries(boardNew).filter(([, v]) => v).map(([k]) => k);
restoredNew.length === selectedIds.length
  ? ok(`新会话同样恢复：${restoredNew.join(', ')}`)
  : bad(`新会话恢复失败：${restoredNew.join(', ') || '(空)'}`);
await ctx2.close();

// ---------- 3. 重置后清空 ----------
console.log('\n=== 3. 重置后清空 ===');
await page.getByRole('button', { name: '重置' }).click();
await page.waitForTimeout(500);

const boardReset = await readBoard(page);
const leftAfterReset = Object.entries(boardReset).filter(([, v]) => v);
leftAfterReset.length === 0 ? ok('重置后选择板清空') : bad(`重置后仍残留 ${leftAfterReset.length} 个`);

const afterReset = await readStore(page);
afterReset === null ? ok('重置后存储已清空') : bad(`重置后存储未清空：${JSON.stringify(afterReset)}`);

// 重置后刷新不应把旧记录带回来
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const boardReload = await readBoard(page);
Object.values(boardReload).filter(Boolean).length === 0
  ? ok('重置后刷新仍为空（旧记录没有复活）')
  : bad('重置后刷新又把旧记录恢复了');

// ---------- 4. 损坏数据不应白屏 ----------
console.log('\n=== 4. 损坏的存储数据 ===');
await page.evaluate(() => window.localStorage.setItem('kivotos-pick-cn:roster:v1', '{ 坏掉的 JSON'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const alive = await page.evaluate(() => !!document.querySelector('[data-live-slot]'));
alive ? ok('存储损坏时页面照常渲染（降级为空选择板）') : bad('存储损坏导致页面异常');
const badToast = await page.evaluate(() => document.body.innerText.includes('已恢复'));
!badToast ? ok('损坏数据不会误报「已恢复」') : bad('损坏数据也提示了「已恢复」');

await page.evaluate(() => window.localStorage.removeItem('kivotos-pick-cn:roster:v1'));
await ctx.close();

// ---------- 5. 移动端同样生效 ----------
console.log('\n=== 5. 移动端 ===');
{
  const mctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'zh-CN' });
  const mp = await mctx.newPage();
  await mp.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(800);

  await mp.locator('[data-live-slot="trinity"]').click();
  await mp.waitForSelector('[role="dialog"]');
  await mp.waitForTimeout(250);
  await mp.locator('[role="dialog"] [class*="cardImg"]').first().click();
  await mp.waitForTimeout(400);

  const mStored = await mp.evaluate(() => window.localStorage.getItem('kivotos-pick-cn:roster:v1'));
  mStored ? ok('移动端也写入了存储') : bad('移动端未写入存储');

  await mp.reload({ waitUntil: 'networkidle' });
  await mp.waitForTimeout(900);
  const mBoard = await mp.evaluate(
    () => !!document.querySelector('[data-live-slot="trinity"] img[class*="slotFace"]')
  );
  mBoard ? ok('移动端刷新后保留选择') : bad('移动端刷新后丢失选择');
  await mctx.close();
}

await browser.close();

console.log('\n=== 控制台错误 ===');
const real = errors.filter((e) => !e.includes('ERR_ABORTED') && !e.includes('404'));
real.length === 0 ? console.log('无') : real.slice(0, 8).forEach((e) => console.log('  ' + e));

console.log(`\n${failures === 0 ? '✓ 本地存储验收全部通过' : `✗ 有 ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
