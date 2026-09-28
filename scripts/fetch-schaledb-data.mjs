/**
 * 下载 SchaleDB 简中学生数据到本地缓存。
 *
 * 注意：必须用 Node 原生 fetch 而不是 PowerShell 的 Invoke-WebRequest，
 * 后者会把 UTF-8 响应按 Latin-1 解码，导致中文名双重编码损坏
 * （「爱露」会变成「çˆ±éœ²」）。这里显式按 UTF-8 解析，保证名字正确。
 */
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, SCHALE_STUDENTS_URL } from './academies.mjs';
import { netFetch } from './net.mjs';

const outFile = path.join(CACHE_DIR, 'schaledb-students-cn.json');
fs.mkdirSync(CACHE_DIR, { recursive: true });

console.log(`→ 拉取简中学生数据: ${SCHALE_STUDENTS_URL}`);
const res = await netFetch(SCHALE_STUDENTS_URL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);

// 关键：按 UTF-8 取文本，再解析
const text = await res.text();
const data = JSON.parse(text);
const students = Object.values(data);

// 自检：中文名必须能被正确解码
const probe = students.find((s) => s.Id === 10000);
if (!probe || !/^[\u4e00-\u9fff]/.test(probe.Name)) {
  throw new Error(`中文名解码异常，10000.Name = "${probe?.Name}"，预期形如「爱露」`);
}

fs.writeFileSync(outFile, JSON.stringify(data), 'utf8');
console.log(`✓ 已保存 ${students.length} 名学生 → ${outFile}`);
console.log(`  抽样校验: 10000=${probe.Name} / ${probe.School}`);
