import raw from '@/data/students.json';
import type { Academy, Student, StudentsData } from '@/types/students';

/**
 * GitHub Pages 项目页部署在子路径下（/kivotos-pick-cn/），
 * 此时 public/ 下的素材必须带上前缀，否则会 404。
 *
 * Next 只会给它自己生成的 /_next/... 路径自动加 basePath，
 * 我们写在 students.json 里的 /assets/... 它管不到，所以在这里统一处理。
 * 本地构建时该环境变量为空，路径保持原样。
 */
const BASE_PATH = (process.env.PAGES_BASE_PATH ?? '').replace(/\/$/, '');

const withBasePath = <T extends string>(p: T): string =>
  BASE_PATH && p.startsWith('/') ? `${BASE_PATH}${p}` : p;

const data = raw as unknown as StudentsData;

export const studentsData: StudentsData = {
  ...data,
  academies: data.academies.map(
    (a): Academy => ({ ...a, emblem: withBasePath(a.emblem) })
  ),
  students: data.students.map(
    (s): Student => ({ ...s, icon: withBasePath(s.icon) })
  ),
};

export { BASE_PATH };
