/**
 * 校验带 basePath 的构建产物是否真的可用。
 *
 * 关键点：GitHub Pages 项目页会把「仓库内容根目录」映射到 /<仓库名>/ 路径下。
 * 也就是说 out/ 里的 assets/... 对外就是 /<仓库名>/assets/...。
 * 本脚本按同样规则模拟：请求路径先剥掉 basePath，再回到 out/ 找文件。
 *
 * 用法: node scripts/verify-basepath.mjs <basePath> [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// 参数兼容：第一种是 basePath port；若第一个参数是纯数字，则视为「无 basePath + 该端口」
const arg1 = process.argv[2] ?? '';
const arg2 = process.argv[3];
const noBasePath = arg1 === '' || /^\d+$/.test(arg1);
const basePath = (noBasePath ? '' : arg1).replace(/\/$/, '');
const port = Number(noBasePath ? arg1 || arg2 || 4180 : arg2 ?? 4180);
const root = path.resolve('out');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** 请求路径 → 磁盘文件（模拟 Pages 对项目页前缀的映射） */
const toDiskPath = (urlPath) => {
  let p = urlPath;
  if (basePath && (p === basePath || p.startsWith(basePath + '/'))) {
    p = p.slice(basePath.length) || '/';
  } else if (basePath) {
    return null; // 前缀不对，Pages 上也会 404
  }
  let full = path.join(root, decodeURIComponent(p));
  // 目录请求补 index.html（trailingSlash 的产物就是这个结构）
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) full = path.join(full, 'index.html');
  return full;
};

const server = http.createServer((req, res) => {
  const p = toDiskPath(new URL(req.url, 'http://x').pathname);
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
    res.writeHead(404).end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(port, r));

const get = async (url) => (await fetch(`http://127.0.0.1:${port}${url}`)).status;

let failures = 0;
const fail = (msg) => {
  console.log('  ✗ ' + msg);
  failures++;
};

// ---------- 1. 页面可访问 ----------
console.log('=== 页面 ===');
for (const page of [`${basePath}/`, `${basePath}/favorite-students/`]) {
  const s = await get(page);
  console.log(`  ${s === 200 ? '✓' : '✗'} ${page} → ${s}`);
  if (s !== 200) failures++;
}

// ---------- 2. 逐条校验引用 ----------
const html = fs.readFileSync(path.join(root, 'favorite-students', 'index.html'), 'utf8');
const refs = [...new Set([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]))].filter(
  (r) => r.startsWith('/')
);

console.log(`\n=== 校验 ${refs.length} 个引用 ===`);

let withPrefix = 0;
let withoutPrefix = 0;
const problems = [];

for (const ref of refs) {
  if (ref.startsWith('//')) continue;
  ref.startsWith(`${basePath}/`) ? withPrefix++ : withoutPrefix++;

  const disk = toDiskPath(ref);
  const exists = !!disk && fs.existsSync(disk) && fs.statSync(disk).isFile();
  const status = await get(ref);
  if (!exists || status !== 200) problems.push({ ref, exists, status });
}

console.log(`  带 basePath 前缀: ${withPrefix}`);
console.log(`  不带前缀:        ${withoutPrefix}`);
if (problems.length) {
  console.log('\n  有问题的引用（前 15 条）:');
  problems.slice(0, 15).forEach((p) => fail(`${p.ref}  磁盘存在=${p.exists} HTTP=${p.status}`));
  if (problems.length > 15) console.log(`  …另有 ${problems.length - 15} 条`);
} else {
  console.log('  ✓ 全部引用均可命中');
}

// ---------- 3. 抽查关键素材 ----------
console.log('\n=== 抽查关键素材 ===');
const samples = [
  `${basePath}/assets/students/10000.webp`,
  // 换装外观：这一层是嵌套在 skins[] 里的，最容易漏加前缀
  `${basePath}/assets/students/10045.webp`,
  `${basePath}/assets/students/10098.webp`,
  `${basePath}/assets/students/npc-arona.webp`,
  `${basePath}/assets/schools/abydos.png`,
  `${basePath}/favicon.ico`,
  `${basePath}/favicon.svg`,
];
for (const s of samples) {
  const st = await get(s);
  console.log(`  ${st === 200 ? '✓' : '✗'} ${s} → ${st}`);
  if (st !== 200) failures++;
}

// ---------- 4. 嵌套的皮肤 icon 在子路径下必须能真正取到 ----------
// 不能去构建产物里搜 "/assets/students/..." 字面量：raw 数据本来就该是裸路径，
// 前缀由 lib/students-data.ts 的 withBasePath 在运行时加。
// 因此这里用浏览器实际打开页面，打开外观条，检查皮肤立绘的 URL 与前缀、并确认能取到。
console.log('\n=== 嵌套皮肤路径（浏览器实测）===');
{
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failed = [];
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/assets/') && r.status() >= 400) failed.push(`${r.status()} ${u}`);
  });

  await page.goto(`http://127.0.0.1:${port}${basePath}/favorite-students/`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(800);

  // 取空槽位里的校徽（.slotEmblem）：它是静态渲染的，用来确认前缀链路本身是通的
  const slotIcon = await page.evaluate(() => {
    const img = document.querySelector('[data-live-slot="abydos"] img[class*="slotEmblem"]');
    return img?.getAttribute('src') ?? '';
  });
  slotIcon.startsWith(`${basePath}/assets/`) && !slotIcon.startsWith('/assets/')
    ? console.log(`  ✓ 槽位校徽带前缀：${slotIcon}`)
    : (failures++, console.log(`  ✗ 槽位校徽缺少前缀：${slotIcon}`));

  // 打开外观条，取非基础外观（星野的泳装）
  await page.locator('[data-live-slot="abydos"]').click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(300);
  await page.locator('[role="dialog"] [class*="cardInfo"]', { hasText: '星野' }).first().click();
  await page.waitForTimeout(350);

  const skinSrcs = await page.evaluate(() =>
    [...document.querySelectorAll('[data-skin-bar] [data-skin-id] img')].map((i) => i.getAttribute('src') ?? '')
  );
  await browser.close();

  if (!skinSrcs.length) {
    failures++;
    console.log('  ✗ 未取到外观条的皮肤立绘');
  } else {
    const bad = skinSrcs.filter((s) => !s.startsWith(`${basePath}/assets/`));
    if (bad.length) {
      failures += bad.length;
      console.log(`  ✗ ${bad.length} 个皮肤立绘缺少前缀：`);
      bad.slice(0, 5).forEach((b) => console.log(`      ${b}`));
    } else {
      console.log(`  ✓ ${skinSrcs.length} 个皮肤立绘均带前缀（含换装外观）`);
    }
  }
  // 上面用 response 监听确认这些图确实取到了，而不是只看 URL 拼得对不对
  if (failed.length) {
    failures += failed.length;
    console.log(`  ✗ ${failed.length} 个素材请求失败：`);
    [...new Set(failed)].slice(0, 5).forEach((f) => console.log(`      ${f}`));
  } else {
    console.log('  ✓ 页面内的素材请求无 4xx');
  }
}

server.close();
console.log(
  `\n${failures === 0 ? '✓ basePath 校验通过：所有资源均可访问' : `✗ 共 ${failures} 项失败`}`
);
process.exit(failures === 0 ? 0 : 1);
