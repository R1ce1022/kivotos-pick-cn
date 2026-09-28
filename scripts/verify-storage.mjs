/**
 * 本地存储的真实行为测试：直接导入 lib/roster-storage.ts 执行
 * （Node 24 原生剥离类型，无需编译步骤）。
 *
 * 用法: node scripts/verify-storage.mjs
 */
import { STORAGE_KEY, parseStoredRoster, saveRoster, loadRoster, clearRoster } from '../lib/roster-storage.ts';

let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => {
  console.log('  ✗ ' + m);
  failures++;
};
const check = (cond, label) => (cond ? ok(label) : bad(label));
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  a === e ? ok(`${label} = ${a}`) : bad(`${label}: 期望 ${e}，实际 ${a}`);
};

// ---------- 测试夹具 ----------
const academies = [
  { id: 'abydos', name: '阿拜多斯高中', short: '阿拜多斯' },
  { id: 'gehenna', name: '格黑娜学园', short: '格黑娜' },
  { id: 'trinity', name: '三一综合学园', short: '三一' },
];
const students = [
  { id: 's1', name: '星野', academyId: 'abydos', icon: '/a1.webp' },
  { id: 's2', name: '白子', academyId: 'abydos', icon: '/a2.webp' },
  { id: 's3', name: '爱露', academyId: 'gehenna', icon: '/a3.webp' },
  { id: 's4', name: '日富美', academyId: 'trinity', icon: '/a4.webp' },
];
const raw = (slots, teacher = '小春') => ({ version: 1, teacher, slots, savedAt: '2026-01-01T00:00:00.000Z' });

console.log('=== 1. 正常记录 ===');
{
  const r = parseStoredRoster(raw([{ academyId: 'abydos', studentId: 's1' }]), academies, students);
  check(r !== null, '解析成功');
  eq(r.teacher, '小春', '老师名');
  eq(r.slots.abydos?.name, '星野', '阿拜多斯 = 星野');
  eq(r.slots.gehenna, null, '未选的学院为 null');
  eq(Object.keys(r.slots).length, 3, '槽位数与学院数一致');
  eq(r.droppedCount, 0, '无丢弃');
}

console.log('\n=== 2. 非法/缺失输入 ===');
{
  eq(parseStoredRoster(null, academies, students), null, 'null');
  eq(parseStoredRoster('x', academies, students), null, '字符串');
  eq(parseStoredRoster({}, academies, students), null, '空对象');
  eq(parseStoredRoster({ version: 2, slots: [] }, academies, students), null, '版本不符（换 key 之外的兜底）');
  eq(parseStoredRoster({ version: 1, slots: 'no' }, academies, students), null, 'slots 不是数组');
}

console.log('\n=== 3. 失效条目应被丢弃而不是崩掉 ===');
{
  const r = parseStoredRoster(
    raw([
      { academyId: 'abydos', studentId: 's1' },
      { academyId: 'nope', studentId: 's3' }, // 学院不存在
      { academyId: 'gehenna', studentId: 'ghost' }, // 学生已不存在
      { academyId: 'trinity', studentId: 's1' }, // 同一学生重复占格
      { academyId: 'trinity', studentId: 's4' },
    ]),
    academies,
    students
  );
  eq(r.droppedCount, 3, '丢弃 3 条失效记录');
  eq(Object.values(r.slots).filter(Boolean).length, 2, '保留 2 个有效选择');
  eq(r.slots.abydos?.id, 's1', '星野留在阿拜多斯');
  eq(r.slots.trinity?.id, 's4', '日富美留在三一');
}

console.log('\n=== 4. 学生改属学院时以当前数据为准 ===');
{
  // 记录里把 白子 放在三一，但当前数据里它属于阿拜多斯
  const r = parseStoredRoster(raw([{ academyId: 'trinity', studentId: 's2' }]), academies, students);
  eq(r.slots.abydos?.id, 's2', '白子被放回它真正的学院（阿拜多斯）');
  eq(r.slots.trinity, null, '三一没有被错误占格');
}

console.log('\n=== 5. teacher 字段防御 ===');
{
  eq(parseStoredRoster(raw([], 123), academies, students).teacher, '', '非字符串 → 空');
  const long = 'x'.repeat(100);
  eq(parseStoredRoster(raw([], long), academies, students).teacher.length, 24, '超长截到 24 字符');
}

console.log('\n=== 6. 真实读写往返（内存版 localStorage） ===');
{
  const mem = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    },
  };

  check(loadRoster(academies, students) === null, '空存储读出 null');

  const slots = { abydos: students[1], gehenna: students[2], trinity: null };
  saveRoster('测试老师', slots);
  check(mem.has(STORAGE_KEY), `写入到 ${STORAGE_KEY}`);

  const back = loadRoster(academies, students);
  eq(back.teacher, '测试老师', '老师名往返一致');
  eq(back.slots.abydos?.id, 's2', '阿拜多斯往返一致');
  eq(back.slots.gehenna?.id, 's3', '格黑娜往返一致');
  eq(back.slots.trinity, null, '未选学院仍为 null');

  // 存储内容只放引用，不放学生对象（数据重新生成后仍可解析）
  const payload = JSON.parse(mem.get(STORAGE_KEY));
  eq(payload.slots, [{ academyId: 'abydos', studentId: 's2' }, { academyId: 'gehenna', studentId: 's3' }], '只存 id 引用');
  check(!JSON.stringify(payload).includes('星野'), '没有把学生对象写进存储');

  clearRoster();
  check(!mem.has(STORAGE_KEY), 'clearRoster 后存储为空');
  check(loadRoster(academies, students) === null, '清空后读出 null');

  // 损坏内容不应抛错
  mem.set(STORAGE_KEY, '{ 这不是 JSON');
  check(loadRoster(academies, students) === null, '损坏的 JSON 读出 null 而不抛错');

  // localStorage 不可用时应静默降级
  delete globalThis.window;
  check(loadRoster(academies, students) === null, '无 window 时读出 null');
  let threw = false;
  try {
    saveRoster('x', {});
  } catch {
    threw = true;
  }
  check(!threw, '无 window 时写入不抛错');
}

console.log(`\n${failures === 0 ? '✓ 本地存储测试全部通过' : `✗ 有 ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
