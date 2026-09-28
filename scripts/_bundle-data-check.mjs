/** 检查线上 bundle 里 students.json 到底内联了几份、前缀情况如何 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'https://r1ce1022.github.io/kivotos-pick-cn';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto(`${base}/favorite-students/`, { waitUntil: 'networkidle', timeout: 60000 });

const result = await page.evaluate(async () => {
  const srcs = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).filter(Boolean);
  const out = [];
  for (const s of srcs) {
    try {
      const txt = await (await fetch(s)).text();
      if (!txt.includes('assets/students') && !txt.includes('assets/schools')) continue;
      out.push({
        file: s.split('/').pop(),
        sizeKB: Math.round(txt.length / 1024),
        // 内联数据里带前缀的出现次数
        prefixedStudents: (txt.match(/\/kivotos-pick-cn\/assets\/students\//g) || []).length,
        prefixedSchools: (txt.match(/\/kivotos-pick-cn\/assets\/schools\//g) || []).length,
        // 不带前缀的（排除带前缀里的匹配）
        bareStudents: (txt.match(/(?<!kivotos-pick-cn)\/assets\/students\//g) || []).length,
        bareSchools: (txt.match(/(?<!kivotos-pick-cn)\/assets\/schools\//g) || []).length,
        hasWithBasePath: /withBasePath|PAGES_BASE_PATH/.test(txt),
        // 是否出现了原始 JSON 的片段（未加前缀的 students 数组）
        hasRawJsonFragment: txt.includes('"icon":"/assets/students/'),
        hasPrefixedJsonFragment: txt.includes('"icon":"/kivotos-pick-cn/assets/students/'),
      });
    } catch {}
  }
  return out;
});

console.log('=== 线上包含素材路径的 chunk ===');
for (const r of result) {
  console.log(`\n${r.file}  (${r.sizeKB}KB)`);
  console.log(`  内联数据 带前缀 students=${r.prefixedStudents} schools=${r.prefixedSchools}`);
  console.log(`  内联数据 无前缀 students=${r.bareStudents} schools=${r.bareSchools}`);
  console.log(`  含 withBasePath/PAGES_BASE_PATH: ${r.hasWithBasePath}`);
  console.log(`  原始JSON片段 "icon":"/assets/students/ : ${r.hasRawJsonFragment}`);
  console.log(`  带前缀JSON片段 "icon":"/kivotos-pick-cn/...  : ${r.hasPrefixedJsonFragment}`);
}

await browser.close();
