// 一次性勘察脚本：确认 SchaleDB 简中数据的学院分布与学生名单
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const OUT = process.argv[3] ?? 'scripts/_inspect.txt';

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const students = Object.values(data);

const bySchool = new Map();
for (const s of students) {
  const key = String(s.School ?? 'UNKNOWN');
  if (!bySchool.has(key)) bySchool.set(key, []);
  bySchool.get(key).push(s);
}

const lines = [];
lines.push(`TOTAL: ${students.length}`);
lines.push('');
lines.push('=== SCHOOL DISTRIBUTION ===');
for (const [school, list] of [...bySchool.entries()].sort((a, b) => b[1].length - a[1].length)) {
  lines.push(`${school.padEnd(14)} ${String(list.length).padStart(3)}`);
}
lines.push('');
lines.push('=== PER SCHOOL: id=name ===');
for (const [school, list] of [...bySchool.entries()].sort((a, b) => b[1].length - a[1].length)) {
  lines.push('');
  lines.push(`--- ${school} (${list.length}) ---`);
  lines.push(
    list
      .sort((a, b) => a.Id - b.Id)
      .map((s) => `${s.Id}=${s.Name}`)
      .join('  ')
  );
}

const released = students.filter((s) => Array.isArray(s.IsReleased) && s.IsReleased[0]);
lines.push('');
lines.push(`IsReleased[0]=true: ${released.length}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`written ${OUT}`);
