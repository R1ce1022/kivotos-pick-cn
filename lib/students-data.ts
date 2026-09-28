import data from '@/data/students.json';
import type { StudentsData } from '@/types/students';

/**
 * 学生数据在构建时直接内联进页面（与原站一致：纯静态、无接口请求）。
 */
export const studentsData = data as unknown as StudentsData;
