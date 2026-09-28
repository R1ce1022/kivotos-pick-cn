/**
 * 学院配置表（繁体/韩文站 → 简体中文镜像）
 *
 * schaleCodes: SchaleDB 数据里 School 字段的英文枚举，一个中文学院可对应多个枚举
 * emblem:      校徽图片在 public/ 下的文件名，以及可用下载源（按顺序尝试）
 */

export const ACADEMIES = [
  {
    id: 'abydos',
    name: '阿拜多斯高中',
    short: '阿拜多斯',
    schaleCodes: ['Abydos'],
    emblem: 'abydos.png',
  },
  {
    id: 'gehenna',
    name: '格黑娜学园',
    short: '格黑娜',
    schaleCodes: ['Gehenna'],
    emblem: 'gehenna.png',
  },
  {
    id: 'millennium',
    name: '千年科学学园',
    short: '千年',
    schaleCodes: ['Millennium'],
    emblem: 'millennium.png',
  },
  {
    id: 'trinity',
    name: '三一综合学园',
    short: '三一',
    schaleCodes: ['Trinity'],
    emblem: 'trinity.png',
  },
  {
    id: 'arius',
    name: '阿里乌斯分校',
    short: '阿里乌斯',
    schaleCodes: ['Arius'],
    emblem: 'arius.png',
  },
  {
    id: 'hyakkiyako',
    name: '百鬼夜行联合学园',
    short: '百鬼夜行',
    schaleCodes: ['Hyakkiyako'],
    emblem: 'hyakkiyako.png',
  },
  {
    id: 'shanhaijing',
    name: '山海经高级中学',
    short: '山海经',
    schaleCodes: ['Shanhaijing'],
    emblem: 'shanhaijing.png',
  },
  {
    id: 'redwinter',
    name: '红冬联邦学园',
    short: '红冬',
    schaleCodes: ['RedWinter'],
    emblem: 'redwinter.png',
  },
  {
    id: 'valkyrie',
    name: '瓦尔基里警察学校',
    short: '瓦尔基里',
    schaleCodes: ['Valkyrie'],
    emblem: 'valkyrie.png',
  },
  {
    id: 'srt',
    name: 'SRT特殊学园',
    short: 'SRT',
    schaleCodes: ['SRT'],
    emblem: 'srt.png',
  },
  {
    id: 'highlander',
    name: '海兰德铁道学园',
    short: '海兰德',
    schaleCodes: ['Highlander'],
    emblem: 'highlander.png',
  },
  {
    id: 'wildhunt',
    name: '狂猎艺术学园',
    short: '狂猎',
    schaleCodes: ['WildHunt'],
    emblem: 'wildhunt.png',
  },
  {
    id: 'odyssey',
    name: '奥德赛海洋学校',
    short: '奥德赛',
    schaleCodes: ['Odyssey'],
    emblem: 'odyssey.png',
  },
  {
    id: 'other',
    name: '其他 · 无归属',
    short: '其他',
    schaleCodes: ['ETC', 'Sakugawa'],
    emblem: 'other.png',
  },
  {
    id: 'gsc',
    name: '学生总会',
    short: '学生总会',
    schaleCodes: ['GSC'],
    emblem: 'gsc.png',
  },
];

/** 校徽下载源：SchaleDB 官方仓库优先，缺失的新学院回退到镜像源 */
export const SCHOOL_EMBLEM_SOURCES = {
  abydos: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_ABYDOS_W.png'],
  arius: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_ARIUS_W.png'],
  gehenna: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_GEHENNA_W.png'],
  hyakkiyako: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_HYAKKIYAKO_W.png'],
  millennium: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_MILLENNIUM_W.png'],
  redwinter: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_REDWINTER_W.png'],
  shanhaijing: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_SHANHAIJING_W.png'],
  srt: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_SRT_W.png'],
  trinity: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_TRINITY_W.png'],
  valkyrie: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_VALKYRIE_W.png'],
  tokiwadai: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_TOKIWADAI_W.png'],
  other: ['https://raw.githubusercontent.com/lonqie/SchaleDB/main/images/schoolicon/School_Icon_ETC_W.png'],
  // 以下 3 个是较新学院，SchaleDB 仓库尚无对应校徽，改用原站镜像
  highlander: ['https://blue-archive-pick.vercel.app/assets/schools/highlander.png'],
  wildhunt: ['https://blue-archive-pick.vercel.app/assets/schools/wildhunt.png'],
  odyssey: ['https://blue-archive-pick.vercel.app/assets/schools/odyssey.png'],
  gsc: ['https://blue-archive-pick.vercel.app/assets/schools/gsc.png'],
};

/** 学生头像源（SchaleDB 官方 CDN，与原站图像字节一致） */
export const STUDENT_ICON_URL = (id) => `https://schaledb.com/images/student/icon/${id}.webp`;

/**
 * 剧情 NPC：SchaleDB 的 students 表里没有这些人，头像也不在 SchaleDB CDN 上，
 * 只能从镜像源取图。中文名为社区通行译名（人工整理）。
 * academy 字段对应 ACADEMIES.id
 */
export const NPC_STUDENTS = [
  { slug: 'npc-arona', name: '阿罗娜', academyId: 'other' },
  { slug: 'npc-plana', name: '普拉娜', academyId: 'other' },
  { slug: 'npc-rin', name: '琳', academyId: 'gsc' },
  { slug: 'npc-momoka', name: '桃香', academyId: 'gsc' },
  { slug: 'npc-aoi', name: '碧', academyId: 'gsc' },
  { slug: 'npc-ayumu', name: '步', academyId: 'gsc' },
  { slug: 'npc-haine', name: '妃涅', academyId: 'gsc' },
  { slug: 'npc-kaya', name: '华耶', academyId: 'gsc' },
  { slug: 'npc-sumomo', name: '菫', academyId: 'gsc' },
  { slug: 'npc-false-president', name: '冒牌学生会长', academyId: 'gsc' },
  { slug: 'npc-gsc-president', name: '学生会长', academyId: 'gsc' },
  { slug: 'npc-smiling-professor', name: '笑眯眯教授', academyId: 'other' },
  { slug: 'npc-ohr', name: '奥尔', academyId: 'other' },
  { slug: 'npc-sof', name: '索芙', academyId: 'other' },
  { slug: 'npc-sora', name: '空', academyId: 'other' },
  { slug: 'npc-ein', name: '艾因', academyId: 'other' },
  { slug: 'npc-mai', name: '舞', academyId: 'other' },
  { slug: 'npc-malkuth', name: '马尔库特', academyId: 'other' },
  { slug: 'npc-akemi', name: '朱音', academyId: 'other' },
  { slug: 'npc-shinon', name: '诗音', academyId: 'other' },
  { slug: 'npc-suiko', name: '翠子', academyId: 'other' },
  { slug: 'npc-youko', name: '洋子', academyId: 'other' },
  { slug: 'npc-nagomi', name: '和', academyId: 'other' },
  { slug: 'npc-ayame', name: '绫女', academyId: 'hyakkiyako' },
  { slug: 'npc-azami', name: '浅海', academyId: 'hyakkiyako' },
  { slug: 'npc-kokuriko', name: '心子', academyId: 'hyakkiyako' },
  { slug: 'npc-kuzunoha', name: '葛叶', academyId: 'hyakkiyako' },
  { slug: 'npc-shuro', name: '朱鹭', academyId: 'hyakkiyako' },
  { slug: 'npc-natsuki', name: '夏希', academyId: 'hyakkiyako' },
  { slug: 'npc-arata', name: '新', academyId: 'hyakkiyako' },
  { slug: 'npc-nanami', name: '七海', academyId: 'odyssey' },
  { slug: 'npc-makina', name: '牧名', academyId: 'odyssey' },
  { slug: 'npc-minato', name: '凑', academyId: 'odyssey' },
  { slug: 'npc-mitsuki', name: '美月', academyId: 'odyssey' },
  { slug: 'npc-sanae', name: '早苗', academyId: 'odyssey' },
  { slug: 'npc-sayuri', name: '小百合', academyId: 'odyssey' },
  { slug: 'npc-ami', name: '亚美', academyId: 'odyssey' },
  { slug: 'npc-sumika', name: '澄香', academyId: 'odyssey' },
  { slug: 'npc-manami', name: '真奈美', academyId: 'wildhunt' },
  { slug: 'npc-akira', name: '晶', academyId: 'wildhunt' },
  { slug: 'npc-tsumugi', name: '纺', academyId: 'wildhunt' },
  { slug: 'npc-hiromi', name: '广美', academyId: 'wildhunt' },
  { slug: 'npc-mayumi', name: '真由美', academyId: 'gehenna' },
  { slug: 'npc-shouko', name: '祥子', academyId: 'gehenna' },
  { slug: 'npc-karen', name: '花莲', academyId: 'gehenna' },
  { slug: 'npc-mirai', name: '未来', academyId: 'millennium' },
  { slug: 'npc-tsubasa', name: '翼', academyId: 'millennium' },
  { slug: 'npc-maia', name: '玛伊亚', academyId: 'arius' },
  { slug: 'npc-misuzu', name: '美铃', academyId: 'valkyrie' },
  { slug: 'npc-yukino', name: '雪乃', academyId: 'srt' },
  { slug: 'npc-suou', name: '苏芳', academyId: 'highlander' },
  { slug: 'npc-rana', name: '拉娜', academyId: 'redwinter' },
  { slug: 'npc-yume', name: '梦', academyId: 'abydos' },
  { slug: 'npc-kaguya', name: '辉夜', academyId: 'shanhaijing' },
  { slug: 'npc-kanae', name: '佳苗', academyId: 'shanhaijing' },
  { slug: 'npc-kai', name: '凯', academyId: 'shanhaijing' },
];

/**
 * 联动角色：原站只在资源里保留了头像，实际选择列表中不出现。
 * 这里同样保留头像资源，仅用于「素材完整度对齐」。
 */
export const COLLAB_STUDENTS = [
  { slug: '10079', name: '御坂美琴', academyId: 'other' },
  { slug: '10080', name: '食蜂操祈', academyId: 'other' },
  { slug: '20007', name: '初音未来', academyId: 'other' },
  { slug: '26011', name: '佐天泪子', academyId: 'other' },
];

/** NPC 头像源（SchaleDB 无此资源，取自镜像源） */
export const MIRROR_BASE = 'https://blue-archive-pick.vercel.app';
export const NPC_ICON_URL = (slug) => `${MIRROR_BASE}/assets/students/${slug}.webp`;

/** 简中学生数据源 */
export const SCHALE_STUDENTS_URL = 'https://schaledb.com/data/cn/students.min.json';

/** 本地缓存与输出路径 */
export const CACHE_DIR = 'scripts/.cache';
export const PUBLIC_STUDENTS_DIR = 'public/assets/students';
export const PUBLIC_SCHOOLS_DIR = 'public/assets/schools';
export const STUDENTS_JSON = 'data/students.json';
