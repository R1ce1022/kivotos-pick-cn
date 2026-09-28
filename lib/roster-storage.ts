import type { Academy, Student } from '@/types/students';
import type { Slots } from '@/app/favorite-students/CaptureBoard';

/**
 * 本地存储：让「选择学生的记录」在刷新/重开浏览器后仍然保留。
 *
 * 只存引用（学院 id + 学生 id），不存学生对象本身：
 * 学生数据是构建期内联的，一旦重新生成（改名、增删学生）旧记录就会失效，
 * 存引用可以在读取时按当前数据重新解析，避免读到过期数据。
 */

/** 存储键带版本号：结构不兼容时换 key，旧数据自然失效，无需写迁移逻辑 */
export const STORAGE_KEY = 'kivotos-pick-cn:roster:v1';

export interface StoredSlot {
  academyId: string;
  studentId: string;
}

export interface StoredRoster {
  version: 1;
  teacher: string;
  slots: StoredSlot[];
  savedAt: string;
}

export interface RestoredRoster {
  teacher: string;
  slots: Slots;
  savedAt: string;
  /** 记录里有、但当前学生数据中已不存在的条目数（例如学生被改名/移除） */
  droppedCount: number;
}

/** localStorage 未必可用（隐私模式、被策略禁用），所有访问都要能失败而不抛错 */
const storage = (): Storage | null => {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

export const isStorageAvailable = (): boolean => storage() !== null;

/**
 * 把存储里的原始值解析成可用记录。
 * 纯函数：不接触 localStorage，便于单测。
 *
 * 全程防御式解析——存储内容可能被手工改过、被别的版本写过、或已过期。
 * 任何不认识的字段一律忽略，任何无效槽位一律丢弃，绝不因此让页面崩掉。
 */
export const parseStoredRoster = (
  raw: unknown,
  academies: Academy[],
  students: Student[]
): RestoredRoster | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<StoredRoster>;
  if (data.version !== 1) return null;
  if (!Array.isArray(data.slots)) return null;

  const academyIds = new Set(academies.map((a) => a.id));
  const studentById = new Map(students.map((s) => [s.id, s]));

  const slots: Slots = Object.fromEntries(academies.map((a) => [a.id, null]));
  const takenStudents = new Set<string>();
  let droppedCount = 0;

  for (const entry of data.slots) {
    const academyId = typeof entry?.academyId === 'string' ? entry.academyId : '';
    const studentId = typeof entry?.studentId === 'string' ? entry.studentId : '';
    const student = studentById.get(studentId);

    // 学院不存在 / 学生已不存在 / 同一学生重复占格 → 丢弃该条
    if (!academyIds.has(academyId) || !student) {
      droppedCount++;
      continue;
    }
    if (takenStudents.has(studentId)) {
      droppedCount++;
      continue;
    }
    // 学生若已改属别的学院，以当前数据为准，放回它真正的学院
    slots[student.academyId] = student;
    takenStudents.add(studentId);
  }

  return {
    teacher: typeof data.teacher === 'string' ? data.teacher.slice(0, 24) : '',
    slots,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    droppedCount,
  };
};

/** 从本地存储读取；无记录或解析失败返回 null */
export const loadRoster = (academies: Academy[], students: Student[]): RestoredRoster | null => {
  const store = storage();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return parseStoredRoster(JSON.parse(raw), academies, students);
  } catch {
    return null;
  }
};

/** 写入本地存储；失败（如配额满、隐私模式）时静默忽略——存不下不该影响使用 */
export const saveRoster = (teacher: string, slots: Slots): void => {
  const store = storage();
  if (!store) return;
  const payload: StoredRoster = {
    version: 1,
    teacher,
    slots: Object.entries(slots)
      .filter(([, s]) => s !== null)
      .map(([academyId, s]) => ({ academyId, studentId: s!.id })),
    savedAt: new Date().toISOString(),
  };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* 忽略 */
  }
};

/** 清空本地存储（重置时调用） */
export const clearRoster = (): void => {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
};
