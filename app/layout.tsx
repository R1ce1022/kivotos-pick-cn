import type { Metadata, Viewport } from 'next';
import { BASE_PATH } from '@/lib/students-data';
import './globals.css';

export const metadata: Metadata = {
  title: '按学院选最爱学生 | 基辅托斯选择器',
  description:
    '从每个学院挑出你最喜欢的一名《蔚蓝档案》学生，填满 15 个学院格，然后一键保存成图片。',
  // 注意：public/ 下的图标不会被 Next 自动加上 basePath，需要手动处理
  icons: {
    icon: [
      { url: `${BASE_PATH}/favicon.ico`, sizes: '64x64', type: 'image/x-icon' },
      { url: `${BASE_PATH}/favicon.svg`, type: 'image/svg+xml' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1220',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
