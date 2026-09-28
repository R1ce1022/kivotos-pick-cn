import fs from 'node:fs';
import path from 'node:path';

const dir = 'out/_next/static/chunks';
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const c = fs.readFileSync(path.join(dir, f), 'utf8');
  const i = c.indexOf('en=e=>et&&e.startsWith');
  if (i < 0) continue;
  console.log(`=== ${f} ===`);
  // 打印 withBasePath 定义之后的这段代码（studentsData 构造处）
  console.log(c.slice(i, i + 700).replace(/\\n/g, ''));
  console.log('\n--- 模块里 JSON 的来源 ---');
  const j = c.indexOf('"generatedAt"');
  console.log(j > 0 ? c.slice(Math.max(0, j - 160), j + 40) : '(未找到 generatedAt)');
}
