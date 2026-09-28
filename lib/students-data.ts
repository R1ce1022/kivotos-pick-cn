import raw from '@/data/students.json';
import type { StudentsData } from '@/types/students';

/**
 * GitHub Pages 项目页部署在子路径下（/kivotos-pick-cn/），
 * public/ 下的素材路径必须带前缀，否则会 404。
 *
 * 两个要点：
 *  1) 必须用 NEXT_PUBLIC_ 前缀，非该前缀的 process.env.* 不会进入客户端代码；
 *  2) 转换直接写在数据加载处，不要再经过一层模块导出再解构，
 *     否则容易在打包后出现「服务端带前缀、客户端水合后变回无前缀」的不一致。
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_PAGES_BASE_PATH ?? '').replace(/\/$/, '');

const withBasePath = (p: string): string => (BASE_PATH && p.startsWith('/') ? `${BASE_PATH}${p}` : p);

const data = raw as unknown as StudentsData;

/** 已按部署前缀处理好的学生数据；页面与导出逻辑都只用这一份 */
export const studentsData: StudentsData = {
  ...data,
  stats: data.stats,
  academies: data.academies.map((a) => ({ ...a, emblem: withBasePath(a.emblem) })),
  students: data.students.map((s) => ({ ...s, icon: withBasePath(s.icon) })),
};
