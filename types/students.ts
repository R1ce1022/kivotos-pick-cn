/** 一个角色可选的一套外观（立绘）。基础外观即该角色的默认形态。 */
export interface StudentSkin {
  /** 站内唯一 id：普通角色为 s10000，NPC 为 npc-arona；同时也是头像文件名 */
  id: string;
  /**
   * 外观名。基础外观是角色名（「星野」），其余是 SchaleDB 的形态名（「星野（泳装）」）。
   * 仅用于内部标识与无障碍标签，界面与导出图都不显示。
   */
  name: string;
  /** 头像路径 */
  icon: string;
  /** 是否为该角色的默认外观 */
  isBase: boolean;
}

/**
 * 一个角色（data/students.json 里 students[] 的形状）。
 * 学生数统计的是角色数，外观通过 skins 表达——
 * 切换外观只换立绘，不改变角色身份、所属学院与去重口径。
 */
export interface Character {
  /** 角色 id，取默认外观的 id */
  id: string;
  /** 角色中文名（不含形态后缀） */
  name: string;
  /** 所属学院 id */
  academyId: string;
  /** 可选外观，至少 1 套，按展示顺序排列（基础外观通常在最前） */
  skins: StudentSkin[];
}

/**
 * 槽位里实际存放的内容：角色 + 已选外观的摊平结果。
 * 只出现在运行时（data/students.json 里没有这个形状）。
 */
export interface SlotEntry {
  /** 所选外观的 id，同时也是头像文件名 */
  id: string;
  /** 所选外观的立绘路径 */
  icon: string;
  /** 角色中文名 */
  name: string;
  academyId: string;
  /** 所属角色 id，用于「一人只占一格」的去重与本地存储校验 */
  characterId: string;
  /** 该角色的全部可选外观，供再次打开弹窗时高亮当前外观 */
  skins: StudentSkin[];
}

export interface Academy {
  id: string;
  /** 全称，如「阿拜多斯高中」 */
  name: string;
  /** 简称，用于标签页，如「阿拜多斯」 */
  short: string;
  /** 校徽路径 */
  emblem: string;
  /** 强调色：导出图里该学院头像上方的彩色横条，取自原站 */
  accent: string;
  /** 该学院的角色数（不是外观数） */
  count: number;
}

export interface StudentsData {
  generatedAt: string;
  /** 页脚展示用的日期（构建时已固化，避免渲染期做时区相关格式化） */
  generatedDate: string;
  source: {
    data: string;
    icons: string;
    npcIcons: string;
    note: string;
  };
  stats: {
    /** 角色数 */
    total: number;
    base: number;
    npc: number;
    /** 可选立绘总数 = 角色数 + extraSkins */
    skinTotal: number;
    /** 除基础外观以外的可选外观数 */
    extraSkins: number;
    /** 来自换装/异格的额外外观数 */
    variantSkins: number;
    /** 只有变体形态、没有基础形态的角色数（其首套外观即默认） */
    variantOnlyCharacters: number;
    /** 同名形态被丢弃的数量（如星野的两套「武装」，观感重复只留一套） */
    duplicateFormsDropped: number;
    /** 已知的 SchaleDB 重复条目被丢弃的数量（如 10144 冒牌雪玲） */
    droppedDuplicates: number;
    /** ＊形态被拆成独立学生的数量（如「白子＊恐怖」） */
    terrorSplit: number;
    collabExcluded: number;
  };
  academies: Academy[];
  students: Character[];
}
