/**
 * 本地存储的真实行为测试：直接导入 lib/roster-storage.ts 执行
 * （Node 24 原生剥离类型，无需编译步骤）。
 *
 * 用法: node scripts/verify-storage.mjs
 */
import {
  STORAGE_KEY,
  parseStoredRoster,
  saveRoster,
  loadRoster,
  clearRoster,
} from '../lib/roster-storage.ts';

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

// ---------- 测试夹具（含外观） ----------
const academies = [{ id: 'abydos' }, { id: 'gehenna' }, { id: 'trinity' }];
// 注意：头像文件名不含 id 前缀的 s（s10045 → 10045.webp）
const skin = (id, name, isBase = false) => ({
  id,
  name,
  icon: `/assets/students/${id.replace(/^s/, '')}.webp`,
  isBase,
});
const characters = [
  {
    id: 's10005',
    name: '星野',
    academyId: 'abydos',
    skins: [skin('s10005', '星野', true), skin('s10045', '星野（泳装）'), skin('s10098', '星野（武装）')],
  },
  {
    id: 's10010',
    name: '白子',
    academyId: 'abydos',
    skins: [skin('s10010', '白子', true), skin('s10024', '白子（骑行）')],
  },
  { id: 's10000', name: '爱露', academyId: 'gehenna', skins: [skin('s10000', '爱露', true)] },
  { id: 's10003', name: '日富美', academyId: 'trinity', skins: [skin('s10003', '日富美', true)] },
];

const entry = (academyId, skinId, characterId) => ({ academyId, skinId, characterId });
const raw = (slots, teacher = '小春') => ({ version: 1, teacher, slots, savedAt: '2026-01-01T00:00:00.000Z' });

console.log('=== 1. 正常记录（含非基础外观） ===');
{
  const r = parseStoredRoster(raw([entry('abydos', 's10045', 's10005')]), academies, characters);
  check(r !== null, '解析成功');
  eq(r.teacher, '小春', '老师名');
  eq(r.slots.abydos?.id, 's10045', '外观 id = 泳装');
  eq(r.slots.abydos?.characterId, 's10005', '角色 id = 星野');
  eq(r.slots.abydos?.name, '星野', '槽位显示名是角色名（不含形态后缀）');
  eq(r.slots.abydos?.icon, '/assets/students/10045.webp', '立绘用所选外观');
  eq(r.slots.gehenna, null, '未选的学院为 null');
  eq(Object.keys(r.slots).length, 3, '槽位数与学院数一致');
  eq(r.droppedCount, 0, '无丢弃');
}

console.log('\n=== 2. 旧版记录兼容（只有 studentId，没有外观功能） ===');
{
  const legacy = raw([{ academyId: 'abydos', studentId: 's10005' }]);
  const r = parseStoredRoster(legacy, academies, characters);
  check(r !== null, '旧记录仍能解析（不丢用户选择）');
  eq(r.slots.abydos?.id, 's10005', '回退为基础外观');
  eq(r.slots.abydos?.characterId, 's10005', '角色 id 正确');
  eq(r.droppedCount, 0, '不计为失效');

  // 旧记录里指向变体的也应当能解析
  const legacyVariant = raw([{ academyId: 'abydos', studentId: 's10045' }]);
  const r2 = parseStoredRoster(legacyVariant, academies, characters);
  eq(r2.slots.abydos?.id, 's10045', '旧记录若指向变体，也能按皮肤反查到角色');
}

console.log('\n=== 3. 非法/缺失输入 ===');
{
  eq(parseStoredRoster(null, academies, characters), null, 'null');
  eq(parseStoredRoster('x', academies, characters), null, '字符串');
  eq(parseStoredRoster({}, academies, characters), null, '空对象');
  eq(parseStoredRoster({ version: 2, slots: [] }, academies, characters), null, '版本不符');
  eq(parseStoredRoster({ version: 1, slots: 'no' }, academies, characters), null, 'slots 不是数组');
}

console.log('\n=== 4. 失效条目应被丢弃而不是崩掉 ===');
{
  const r = parseStoredRoster(
    raw([
      entry('abydos', 's10005', 's10005'),
      entry('nope', 's10000', 's10000'), // 学院不存在
      entry('gehenna', 'ghost', 's10000'), // 外观已不存在
      entry('trinity', 's10003', 's99999'), // 角色 id 不存在
      entry('trinity', 's10005', 's10005'), // 同一角色重复占格
      entry('trinity', 's10003', 's10003'),
    ]),
    academies,
    characters
  );
  eq(r.droppedCount, 4, '丢弃 4 条失效记录');
  eq(Object.values(r.slots).filter(Boolean).length, 2, '保留 2 个有效选择');
  eq(r.slots.abydos?.id, 's10005', '星野留在阿拜多斯');
  eq(r.slots.trinity?.id, 's10003', '日富美留在三一');
}

console.log('\n=== 5. 换皮肤仍算同一名角色（不能占两格） ===');
{
  const r = parseStoredRoster(
    raw([entry('abydos', 's10045', 's10005'), entry('gehenna', 's10005', 's10005')]),
    academies,
    characters
  );
  eq(r.droppedCount, 1, '后出现的同名角色被丢弃');
  eq(r.slots.abydos?.id, 's10045', '保留先出现的那个（泳装）');
  eq(r.slots.gehenna, null, '另一格没有被占用');
}

console.log('\n=== 6. 角色改属学院时以当前数据为准 ===');
{
  const r = parseStoredRoster(raw([entry('trinity', 's10010', 's10010')]), academies, characters);
  eq(r.slots.abydos?.id, 's10010', '白子被放回它真正的学院（阿拜多斯）');
  eq(r.slots.trinity, null, '三一没有被错误占格');
}

console.log('\n=== 7. teacher 字段防御 ===');
{
  eq(parseStoredRoster(raw([], 123), academies, characters).teacher, '', '非字符串 → 空');
  eq(parseStoredRoster(raw([], 'x'.repeat(100)), academies, characters).teacher.length, 24, '超长截到 24 字符');
}

console.log('\n=== 8. 真实读写往返（内存版 localStorage） ===');
{
  const mem = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    },
  };

  check(loadRoster(academies, characters) === null, '空存储读出 null');

  // 选星野的泳装 + 爱露的基础外观
  const slots = {
    abydos: {
      id: 's10045',
      icon: '/assets/students/10045.webp',
      name: '星野',
      academyId: 'abydos',
      characterId: 's10005',
      skins: characters[0].skins,
    },
    gehenna: {
      id: 's10000',
      icon: '/assets/students/10000.webp',
      name: '爱露',
      academyId: 'gehenna',
      characterId: 's10000',
      skins: characters[2].skins,
    },
    trinity: null,
  };
  saveRoster('测试老师', slots);
  check(mem.has(STORAGE_KEY), `写入到 ${STORAGE_KEY}`);

  const payload = JSON.parse(mem.get(STORAGE_KEY));
  eq(
    payload.slots,
    [
      { academyId: 'abydos', skinId: 's10045', characterId: 's10005' },
      { academyId: 'gehenna', skinId: 's10000', characterId: 's10000' },
    ],
    '只存 id 引用（含 skinId 与 characterId）'
  );
  check(!JSON.stringify(payload).includes('icon'), '没有把立绘路径等冗余字段写进存储');

  const back = loadRoster(academies, characters);
  eq(back.teacher, '测试老师', '老师名往返一致');
  eq(back.slots.abydos?.id, 's10045', '所选外观往返一致（泳装没被退回基础款）');
  eq(back.slots.abydos?.characterId, 's10005', '角色 id 往返一致');
  eq(back.slots.gehenna?.id, 's10000', '另一格往返一致');
  eq(back.slots.trinity, null, '未选学院仍为 null');
  eq(back.slots.abydos?.skins.length, 3, '带回该角色的全部外观，供再次打开弹窗高亮');

  clearRoster();
  check(!mem.has(STORAGE_KEY), 'clearRoster 后存储为空');
  check(loadRoster(academies, characters) === null, '清空后读出 null');

  mem.set(STORAGE_KEY, '{ 这不是 JSON');
  check(loadRoster(academies, characters) === null, '损坏的 JSON 读出 null 而不抛错');

  delete globalThis.window;
  check(loadRoster(academies, characters) === null, '无 window 时读出 null');
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
