/**
 * README 一致性校验：发现文档漂移（失效引用、未记录的脚本、写错的命令、失效锚点）。
 *
 * 用法:
 *   node scripts/verify-readme.mjs                  # 全部检查（外链仅警告）
 *   node scripts/verify-readme.mjs --offline        # 跳过外链检查
 *   node scripts/verify-readme.mjs --strict-links   # 外链失败也计入失败
 *
 * 设计取舍：
 *  - 检查「scripts/ 下每个文件在 README 中至少被提及」，而非必须进脚本表：
 *    结构由作者决定，校验只保证不漏文档。
 *  - 外链默认只警告：外链不可控，不应让本仓库的校验随机变红。
 */
import fs from 'node:fs';
import path from 'node:path';
import { netFetch } from './net.mjs';

const OFFLINE = process.argv.includes('--offline');
const STRICT_LINKS = process.argv.includes('--strict-links');
const README = 'README.md';

let failures = 0;
const warnings = [];
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => {
  console.log('  ✗ ' + m);
  failures++;
};
const warn = (m) => {
  console.log('  ! ' + m);
  warnings.push(m);
};

const md = fs.readFileSync(README, 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

/**
 * 逐个匹配时跳过「代码区内」的命中。
 *
 * README 会用代码举例（本文件自己的校验说明里就写了 `npm run xxx`、
 * `![](...)` 这类伪引用），这些要排除；但行内代码里也常写**真实**引用
 * （如 `scripts/verify-readme.mjs`、`npm run verify:docs`），不能整体屏蔽。
 * 因此用「占位符特征」过滤，而不是屏蔽代码区：
 *   - 路径含 `*` 或 `...`  → 通配符式说明
 *   - 含 `xxx`             → 占位符
 *   - 本地路径不存在        → 本来就是说明文字而非真实引用（见检查 2）
 */
const CODE_RANGE_RE = /```[\s\S]*?```|(?<!\\)`[^`\n]*`/g;
const codeRanges = (() => {
  const ranges = [];
  let m;
  while ((m = CODE_RANGE_RE.exec(md))) ranges.push([m.index, m.index + m[0].length]);
  CODE_RANGE_RE.lastIndex = 0;
  return ranges;
})();
const inCode = (idx) => codeRanges.some(([s, e]) => idx >= s && idx < e);

const isPlaceholder = (text) => /[*]|\.\.\.|xxx/i.test(text);

/** 收集 README 中真实出现的脚本引用（跳过示例与占位符） */
const scriptRefsInReadme = () => {
  const found = new Set();
  for (const m of md.matchAll(/scripts\/[\w./-]+\.mjs/g)) {
    const ref = m[0];
    if (isPlaceholder(ref)) continue;
    found.add(ref);
  }
  return [...found];
};

/** 收集 README 中真实出现的 npm 命令（跳过示例与占位符） */
const npmCommandsInReadme = () => {
  const found = new Set();
  for (const m of md.matchAll(/npm run ([\w:-]+)/g)) {
    const name = m[1];
    if (isPlaceholder(name)) continue;
    found.add(name);
  }
  return [...found];
};

/** 反查：脚本文件 → 调用它的 npm 命令（用于判断「是否已被文档覆盖」） */
const scriptToNpmCommand = new Map();
for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
  for (const m of String(cmd).matchAll(/scripts\/[\w./-]+\.mjs/g)) {
    if (!scriptToNpmCommand.has(m[0])) scriptToNpmCommand.set(m[0], name);
  }
}

/**
 * 某脚本是否已在 README 中被覆盖：提到文件本身，或提到调用它的 npm 命令。
 * 注意脚本路径本身常写在行内代码里（如 `scripts/verify-readme.mjs`），
 * 因此这里用未屏蔽代码的原文判断。
 */
const README_NPM_COMMANDS = npmCommandsInReadme();
const isDocumented = (file) => {
  if (md.includes(file)) return true;
  const cmd = scriptToNpmCommand.get(file);
  return !!cmd && README_NPM_COMMANDS.includes(cmd);
};

/** GitHub 风格的锚点 slug */
const slugify = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '') // 去标点，保留中日韩文字
    .replace(/\s+/g, '-');

// ---------- 1. 图片引用 ----------
console.log('=== 1. 图片引用 ===');
{
  // `![](...)` 这类示例只出现在行内代码里，跳过占位符即可
  const refs = [...md.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((r) => !isPlaceholder(r));
  const missing = refs.filter((r) => !/^https?:/i.test(r) && !fs.existsSync(r));
  if (!refs.length) bad('README 未引用任何图片');
  else if (missing.length) bad(`${missing.length}/${refs.length} 张配图不存在: ${missing.join(', ')}`);
  else ok(`${refs.length} 张配图均存在`);
}

// ---------- 2. 脚本引用 ----------
console.log('\n=== 2. 脚本引用 ===');
{
  const refs = scriptRefsInReadme();
  const missing = refs.filter((r) => !fs.existsSync(r));
  if (!refs.length) bad('README 未引用任何脚本');
  else if (missing.length) bad(`${missing.length} 个被引用的脚本不存在: ${missing.join(', ')}`);
  else ok(`${refs.length} 个被引用的脚本均存在`);
}

// ---------- 3. npm 命令 ----------
console.log('\n=== 3. npm 命令 ===');
{
  const names = npmCommandsInReadme();
  const missing = names.filter((n) => !(n in (pkg.scripts ?? {})));
  if (!names.length) bad('README 未提及任何 npm 命令');
  else if (missing.length) bad(`${missing.length} 个命令未在 package.json 中定义: ${missing.join(', ')}`);
  else ok(`${names.length} 个 npm 命令均已定义`);
}

// ---------- 4. scripts/ 下的文件是否都被提及 ----------
console.log('\n=== 4. scripts 目录覆盖度 ===');
{
  const IGNORED = ['.cache', '.shots'];
  const all = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED.includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.mjs')) all.push(full.split(path.sep).join('/'));
    }
  };
  walk('scripts');

  const undocumented = all.filter((f) => !isDocumented(f));
  if (undocumented.length) {
    bad(`${undocumented.length}/${all.length} 个脚本未在 README 中出现:`);
    undocumented.forEach((f) => console.log(`      ${f}`));
  } else {
    ok(`${all.length} 个脚本均在 README 中有记录`);
  }
}

// ---------- 5. 章节锚点 ----------
console.log('\n=== 5. 章节锚点 ===');
{
  // 标题要排除代码块里的 `#`（示例中的井号不是标题）
  const headings = [...md.matchAll(/^#{1,6}\s+(.+)$/gm)]
    .filter((m) => !inCode(m.index))
    .map((m) => slugify(m[1]));
  const set = new Set(headings);
  const anchors = [...new Set([...md.matchAll(/\]\(#([^)\s]+)\)/g)].map((m) => m[1]))].filter(
    (a) => !isPlaceholder(a)
  );
  if (!anchors.length) {
    ok('README 未使用章节锚点（无需校验）');
  } else {
    const broken = anchors.filter((a) => !set.has(a));
    if (broken.length) bad(`${broken.length} 个锚点无效: ${broken.join(', ')}`);
    else ok(`${anchors.length} 个锚点均有效`);
  }
}

// ---------- 6. 外链可达性 ----------
console.log('\n=== 6. 外链可达性 ===');
if (OFFLINE) {
  ok('已跳过（--offline）');
} else {
  const links = [...new Set([...md.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]))].filter(
    (u) => !isPlaceholder(u)
  );
  const broken = [];
  for (const url of links) {
    try {
      const res = await netFetch(url, { retries: 2, timeoutMs: 20000 });
      if (res.status >= 400) broken.push(`${url} → ${res.status}`);
    } catch (e) {
      broken.push(`${url} → ${e.message}`);
    }
  }
  if (broken.length) {
    const msg = `${broken.length}/${links.length} 个外链不可达: ${broken.join('; ')}`;
    STRICT_LINKS ? bad(msg) : warn(msg + '（默认仅警告，加 --strict-links 可计入失败）');
  } else {
    ok(`${links.length} 个外链均可达`);
  }
}

// ---------- 汇总 ----------
console.log(`\n${failures === 0 ? '✓ README 校验通过' : `✗ 有 ${failures} 项失败`}`);
if (warnings.length) console.log(`（另有 ${warnings.length} 条警告）`);
process.exit(failures === 0 ? 0 : 1);
