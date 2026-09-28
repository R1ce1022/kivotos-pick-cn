/** 验证水合一致：SSR HTML 与客户端渲染的页脚文本必须完全相同 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome' });
// 刻意用中国时区，复现用户实际环境（构建机是 UTC）
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 200)}`);
});

const resp = await page.goto(`${base}/favorite-students/`, { waitUntil: 'domcontentloaded' });
const html = await resp.text();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1200);

const pick = (s) => {
  const i = s.indexOf('数据生成于');
  if (i < 0) return null;
  return s
    .slice(i, i + 40)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>?/g, '') // 同时清掉被截断的半个标签
    .trim();
};

const ssrDate = pick(html);
const clientDate = await page.evaluate(() => {
  const el = [...document.querySelectorAll('footer p')].find((p) => p.textContent.includes('数据生成于'));
  return el ? el.textContent.slice(el.textContent.indexOf('数据生成于')).trim() : null;
});

console.log('SSR  页脚:', JSON.stringify(ssrDate));
console.log('客户端页脚:', JSON.stringify(clientDate));
console.log(ssrDate === clientDate ? '✓ 两端日期文本一致（不再有水合不匹配）' : '✗ 两端仍不一致');
console.log('浏览器时区:', await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone));
console.log('控制台错误:', errors.length ? errors.join('\n') : '无');

await browser.close();
process.exit(ssrDate === clientDate && errors.length === 0 ? 0 : 1);
