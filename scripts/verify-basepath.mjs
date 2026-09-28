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

server.close();
console.log(
  `\n${failures === 0 ? '✓ basePath 校验通过：所有资源均可访问' : `✗ 共 ${failures} 项失败`}`
);
process.exit(failures === 0 ? 0 : 1);
