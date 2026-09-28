import fs from 'node:fs';
import path from 'node:path';

const dir = 'out/_next/static/chunks';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

console.log('=== 搜索环境变量引用与内联结果 ===');
for (const f of files) {
  const c = fs.readFileSync(path.join(dir, f), 'utf8');
  const hits = [];
  if (c.includes('NEXT_PUBLIC_PAGES_BASE_PATH')) hits.push('字面量 NEXT_PUBLIC_PAGES_BASE_PATH 仍存在');
  if (c.includes('PAGES_BASE_PATH')) hits.push('字面量 PAGES_BASE_PATH 仍存在');
  if (c.includes('process.env')) hits.push(`process.env 出现 ${(c.match(/process\.env/g) || []).length} 次`);
  if (c.includes('kivotos-pick-cn')) hits.push('含 kivotos-pick-cn 字面量');
  if (hits.length) {
    console.log(`\n${f}:`);
    hits.forEach((h) => console.log('  - ' + h));
    // 打印 withBasePath 附近的代码
    const i = c.indexOf('startsWith("/")');
    if (i > 0) console.log('  withBasePath 附近: ...' + c.slice(Math.max(0, i - 260), i + 80) + '...');
  }
}

// 服务端产物里是否有前缀
console.log('\n=== 服务端 HTML ===');
const html = fs.readFileSync('out/favorite-students/index.html', 'utf8');
console.log('  HTML 带前缀:', (html.match(/\/kivotos-pick-cn\/assets\//g) || []).length);
console.log('  HTML 无前缀:', (html.match(/(?<!kivotos-pick-cn)\/assets\/students\//g) || []).length);
