/**
 * 持续运行的 basePath 预览服务器（用于本地验证子路径部署效果）。
 * 模拟 GitHub Pages 项目页：请求 /<basePath>/... 映射到 out/ 目录。
 * 用法: node scripts/serve-basepath.mjs <basePath> [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const basePath = (process.argv[2] ?? '').replace(/\/$/, '');
const port = Number(process.argv[3] ?? 4180);
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

if (!fs.existsSync(root)) {
  console.error(`✗ 找不到 ${root}，请先 npm run build`);
  process.exit(1);
}

http
  .createServer((req, res) => {
    let p = new URL(req.url, 'http://x').pathname;
    if (basePath) {
      if (p === basePath || p.startsWith(basePath + '/')) p = p.slice(basePath.length) || '/';
      else {
        res.writeHead(404).end('404');
        return;
      }
    }
    let full = path.join(root, decodeURIComponent(p));
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) full = path.join(full, 'index.html');
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404).end('404');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] ?? 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  })
  .listen(port, () => console.log(`✓ basePath 预览: http://127.0.0.1:${port}${basePath}/`));
