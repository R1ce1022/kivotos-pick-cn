import type { Character, SlotEntry } from '@/types/students';
import type { Slots } from '@/app/favorite-students/CaptureBoard';

/**
 * 本地存储：让「选择角色的记录」在刷新/重开浏览器后仍然保留。
 *
 * 只存引用（学院 id + 角色 id + 外观 id），不存角色对象本身：
 * 角色数据是构建期内联的，一旦重新生成（改名、增删角色）旧记录就会失效，
 * 存引用可以在读取时按当前数据重新解析，避免读到过期数据。
 */

/** 存储键带版本号：结构不兼容时换 key，旧数据自然失效，无需写迁移逻辑 */
export const STORAGE_KEY = 'kivotos-pick-cn:roster:v1';

export interface StoredSlot {
  academyId: string;
  /** 所选外观（立绘）的 id */
  skinId: string;
  /** 所属角色 id，用于「一人只占一格」的校验 */
  characterId: string;
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
  /** 记录里有、但当前数据中已失效的条目数（角色或外观已不存在） */
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

/** 读取时把皮肤解析成槽位内容 */
const makeEntry = (character: Character) => (skinId: string): SlotEntry | null => {
  const skin = character.skins.find((k) => k.id === skinId);
  if (!skin) return null;
  return {
    id: skin.id,
    icon: skin.icon,
    name: character.name,
    academyId: character.academyId,
    characterId: character.id,
    skins: character.skins,
  };
};

/**
 * 把存储里的原始值解析成可用记录。
 * 纯函数：不接触 localStorage，便于单测。
 *
 * 全程防御式解析——存储内容可能被手工改过、被别的版本写过、或已过期。
 * 任何不认识的字段一律忽略，任何无效槽位一律丢弃，绝不因此让页面崩掉。
 *
 * 兼容旧版记录：旧格式只有 `studentId`（当时还没有外观功能），
 * 其值恰好等于基础外观的 id，因此回退按它解析，老用户的选择不会丢。
 */
export const parseStoredRoster = (
  raw: unknown,
  academies: { id: string }[],
  characters: Character[]
): RestoredRoster | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<StoredRoster> & { slots?: unknown };
  if (data.version !== 1) return null;
  if (!Array.isArray(data.slots)) return null;

  const academyIds = new Set(academies.map((a) => a.id));
  const characterById = new Map(characters.map((c) => [c.id, c]));

  const slots: Slots = Object.fromEntries(academies.map((a) => [a.id, null]));
  const takenCharacters = new Set<string>();
  let droppedCount = 0;

  /** 旧版记录只有 studentId（当时还没有外观功能），其值等于基础外观的 id */
  const legacyId = (entry: Record<string, unknown>) =>
    typeof entry.studentId === 'string' ? entry.studentId : '';

  for (const item of data.slots) {
    const entry = (item ?? {}) as unknown as Record<string, unknown>;
    const academyId = typeof entry.academyId === 'string' ? entry.academyId : '';
    const skinId = typeof entry.skinId === 'string' ? entry.skinId : legacyId(entry);
    const characterId = typeof entry.characterId === 'string' ? entry.characterId : '';

    if (!academyIds.has(academyId) || !skinId) {
      droppedCount++;
      continue;
    }

    // 优先按记录里的 characterId 定位；旧记录没有该字段时，按皮肤 id 反查角色
    let character = characterId ? characterById.get(characterId) : undefined;
    let built = character ? makeEntry(character)(skinId) : null;
    if (!character || !built) {
      character = characters.find((c) => c.skins.some((k) => k.id === skinId));
      built = character ? makeEntry(character)(skinId) : null;
    }

    // 角色或外观已不存在 / 记录里的角色与外观对不上 → 丢弃该条
    if (!character || !built) {
      droppedCount++;
      continue;
    }
    // 同一名角色重复占格（旧数据可能因换皮而产生）→ 丢弃后出现的
    if (takenCharacters.has(character.id)) {
      droppedCount++;
      continue;
    }

    // 角色若已改属别的学院，以当前数据为准，放回它真正的学院
    slots[character.academyId] = built;
    takenCharacters.add(character.id);
  }

  return {
    teacher: typeof data.teacher === 'string' ? data.teacher.slice(0, 24) : '',
    slots,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    droppedCount,
  };
};

/** 从本地存储读取；无记录或解析失败返回 null */
export const loadRoster = (
  academies: { id: string }[],
  characters: Character[]
): RestoredRoster | null => {
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
    return parseStoredRoster(JSON.parse(raw), academies, characters);
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
      .map(([academyId, s]) => ({ academyId, skinId: s!.id, characterId: s!.characterId })),
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
