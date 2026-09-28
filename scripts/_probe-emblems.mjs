/** 勘察：15 个校徽素材的实际明暗分布，判断为何部分显示为空白 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const dir = 'public/assets/schools';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();

console.log('=== 校徽素材明暗分析 ===');
console.log('文件名'.padEnd(20), '尺寸'.padEnd(12), '不透明像素', 'R,G,B 均值', ' 判定');
const rows = [];
for (const f of files) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3];
    if (a > 32) {
      n++;
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
    }
  }
  const mean = n ? [r / n, g / n, b / n].map((v) => Math.round(v)) : [0, 0, 0];
  const lum = Math.round(0.299 * mean[0] + 0.587 * mean[1] + 0.114 * mean[2]);
  // brightness(0) 会把任何颜色压成纯黑，所以「亮底透明」的图压黑后可见、
  // 本来就深的图压黑后仍然可见；真正会消失的是「深色描边 + 透明底」被放到深底上，
  // 或反之。这里只统计素材本身的色调，供判断统一处理方式。
  const kind = lum > 200 ? '白/极亮' : lum > 140 ? '浅' : lum > 80 ? '中' : '深';
  rows.push({ f, w: png.width, h: png.height, n, mean, lum, kind });
  console.log(
    f.padEnd(20),
    `${png.width}x${png.height}`.padEnd(12),
    String(n).padStart(8),
    ` ${String(mean[0]).padStart(3)},${String(mean[1]).padStart(3)},${String(mean[2]).padStart(3)}`,
    ` ${kind}`
  );
}

console.log('\n=== 汇总 ===');
const byKind = {};
for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
console.log(JSON.stringify(byKind));

console.log('\n=== 关键问题 ===');
console.log('若素材本身是「白色图形 + 透明底」，在浅色背景上原本就不可见，');
console.log('必须靠 filter 压深；但若素材是「深色图形」，压深后仍是深色。');
console.log('真正会呈现为空白的场景：素材图形本身极浅，且未压深。');
