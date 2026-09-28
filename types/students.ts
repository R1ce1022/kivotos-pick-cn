export interface Student {
  /** 站内唯一 id：普通学生为 s10000，NPC 为 npc-arona */
  id: string;
  /** 简体中文名 */
  name: string;
  /** 所属学院 id */
  academyId: string;
  /** 头像路径 */
  icon: string;
  /** 检索别名：韩文名 / 英文名 / 路径名 */
  aliases: string[];
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
  count: number;
}

export interface StudentsData {
  generatedAt: string;
  source: {
    data: string;
    icons: string;
    npcIcons: string;
    note: string;
  };
  stats: {
    total: number;
    base: number;
    npc: number;
    variantExcluded: number;
    collabExcluded: number;
  };
  academies: Academy[];
  students: Student[];
}
