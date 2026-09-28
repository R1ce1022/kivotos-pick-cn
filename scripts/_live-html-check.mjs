import fs from 'node:fs';
import { netFetch } from './net.mjs';

const url = 'https://r1ce1022.github.io/kivotos-pick-cn/favorite-students/';
const html = await (await netFetch(url)).text();

const prefixedStudents = (html.match(/\/kivotos-pick-cn\/assets\/students\//g) || []).length;
const bareStudents = (html.match(/(?<!kivotos-pick-cn)\/assets\/students\//g) || []).length;
const prefixedSchools = (html.match(/\/kivotos-pick-cn\/assets\/schools\//g) || []).length;
const bareSchools = (html.match(/(?<!kivotos-pick-cn)\/assets\/schools\//g) || []).length;

console.log('=== 线上 HTML 内的素材路径 ===');
console.log('  带前缀 students:', prefixedStudents, '| schools:', prefixedSchools);
console.log('  无前缀 students:', bareStudents, '| schools:', bareSchools);

const i = html.indexOf('assets/schools/abydos.png');
console.log('\n首个 abydos 引用上下文:');
console.log('  ...' + html.slice(Math.max(0, i - 90), i + 60) + '...');

// 内联 JSON 里的 icon 字段
const iconBare = html.includes('"icon":"/assets/students/');
const iconPrefixed = html.includes('"icon":"/kivotos-pick-cn/assets/students/');
console.log('\n  内联数据 "icon":"/assets/students/  :', iconBare);
console.log('  内联数据 "icon":"/kivotos-pick-cn/...  :', iconPrefixed);

// 找 self.__next_f 里的数据片段
const m = html.match(/"icon":"[^"]*10005[^"]*"/);
console.log('\n  10005 的 icon 字段:', m ? m[0] : '(未找到)');
const m2 = html.match(/"emblem":"[^"]*abydos[^"]*"/);
console.log('  abydos 的 emblem 字段:', m2 ? m2[0] : '(未找到)');
