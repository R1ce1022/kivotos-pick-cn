/** 把 PNG 缩放到可读尺寸（用 Chrome 的 canvas 缩放，无需额外依赖） */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [src, dst, maxW = '1200', cropH = '0'] = process.argv.slice(2);
if (!src || !dst) {
  console.error('用法: node scripts/resize-image.mjs <src> <dst> [maxWidth] [cropHeight]');
  process.exit(1);
}

const dataUrl = `data:image/png;base64,${fs.readFileSync(src).toString('base64')}`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();

const out = await page.evaluate(
  async ({ dataUrl, maxW, cropH }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    // cropH > 0 时只取顶部若干像素（避免超长页面）
    const srcH = cropH > 0 ? Math.min(img.height, Number(cropH)) : img.height;
    const scale = Math.min(1, Number(maxW) / img.width);
    const w = Math.round(img.width * scale);
    const h = Math.round(srcH * scale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, img.width, srcH, 0, 0, w, h);
    return { url: c.toDataURL('image/png'), w, h, originW: img.width, originH: img.height };
  },
  { dataUrl, maxW, cropH }
);

const base64 = out.url.split(',')[1];
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, Buffer.from(base64, 'base64'));
console.log(`✓ ${out.originW}x${out.originH} → ${out.w}x${out.h}  ${dst}`);
await browser.close();
