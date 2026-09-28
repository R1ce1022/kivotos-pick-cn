import type { NextConfig } from 'next';
import path from 'node:path';

/**
 * GitHub Pages 的项目页部署在子路径下（https://<用户>.github.io/<仓库>/），
 * 此时必须设置 basePath，否则 /assets/... 与 /_next/... 会 404。
 *
 * 这里只在 CI 里通过环境变量开启，本地 npm run build / preview 保持根路径不变，
 * 两边互不影响。
 */
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  // 纯静态导出：产物是 out/ 下的静态文件，不需要 Node 服务器
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // 明确根目录，避免 Next 向上找到 C:\Users\<用户> 的 lockfile 而告警
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
