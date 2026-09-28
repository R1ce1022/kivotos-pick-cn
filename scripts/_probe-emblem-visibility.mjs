/** 实测：选择板槽位里各校徽的实际可⻅度 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome' });
const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(1200);

const rows = await p.evaluate(async () => {
  const slots = [...document.querySelectorAll('[data-live-slot]')];
  const out = [];
  for (const s of slots) {
    const img = s.querySelector('img');
    if (!img) continue;
    const cs = getComputedStyle(img);
    // 用 canvas 采样：把图上不透明像素的平均亮度算出来（含 CSS 滤镜后的视觉近似）
    let lum = null;
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.filter = cs.filter === 'none' ? 'none' : cs.filter;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 32) {
          n++;
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
      }
      lum = n ? Math.round(sum / n) : 0;
    } catch (e) {
      lum = 'err:' + e.message;
    }
    out.push({
      id: s.getAttribute('data-live-slot'),
      src: img.getAttribute('src')?.split('/').pop(),
      filter: cs.filter,
      opacity: cs.opacity,
      naturalW: img.naturalWidth,
      loaded: img.complete && img.naturalWidth > 0,
      effectiveLum: lum,
      // 与 50% 不透明度叠加后的实际观感亮度（白底约 250）
      visualOnLight: typeof lum === 'number' ? Math.round(lum * Number(cs.opacity) + 250 * (1 - Number(cs.opacity))) : null,
    });
  }
  return out;
});

console.log('ID'.padEnd(12), '素材'.padEnd(14), '滤镜'.padEnd(34), 'opacity', ' 平均亮度', ' 叠加后');
for (const r of rows) {
  const warn = typeof r.visualOnLight === 'number' && r.visualOnLight > 200 ? '  ← 几乎看不见' : '';
  console.log(
    String(r.id).padEnd(12),
    String(r.src).padEnd(14),
    String(r.filter).padEnd(34),
    String(r.opacity).padEnd(7),
    String(r.effectiveLum).padStart(8),
    String(r.visualOnLight).padStart(9) + warn
  );
}

const invisible = rows.filter((r) => typeof r.visualOnLight === 'number' && r.visualOnLight > 200);
console.log(`\n近乎不可见的校徽: ${invisible.length} / ${rows.length}`);
console.log(invisible.map((r) => r.id).join(', '));

await browser.close();
