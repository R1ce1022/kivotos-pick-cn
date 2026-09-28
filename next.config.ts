import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // 纯静态导出：产物是 out/ 下的静态文件，不需要 Node 服务器
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  // 明确根目录，避免 Next 向上找到 C:\Users\<用户> 的 lockfile 而告警
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
