/**
 * 网络辅助：Node 原生 fetch 不会读 Windows 的 IE/系统代理设置，
 * 直连境外站点容易被 ECONNRESET。这里自动探测系统代理并挂上 dispatcher。
 *
 * 优先级：环境变量 HTTPS_PROXY/HTTP_PROXY > Windows 注册表里的系统代理 > 直连
 */
import { execFileSync } from 'node:child_process';
// 必须用 undici 自己的 fetch：ProxyAgent 与 Node 内置 fetch 不是同一份实现，
// 混用会抛 UND_ERR_INVALID_ARG (invalid onRequestStart method)
import { fetch as undiciFetch, ProxyAgent } from 'undici';

function normalizeProxyUrl(raw) {
  if (!raw) return null;
  let url = raw.trim();
  if (!url) return null;
  // 注册表里可能写成 "host:port" 或 "http=host:port;https=host:port"
  if (!/^https?:\/\//i.test(url)) {
    const forHttps = /https=([^;]+)/i.exec(url);
    url = (forHttps ? forHttps[1] : url.split(';')[0]).replace(/^[a-z]+=/i, '');
    url = `http://${url}`;
  }
  return url;
}

function proxyFromRegistry() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyServer',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const m = /ProxyServer\s+REG_SZ\s+(.+)/.exec(out);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function detectProxyUrl() {
  const fromEnv =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy;
  return normalizeProxyUrl(fromEnv) ?? normalizeProxyUrl(proxyFromRegistry());
}

const proxyUrl = detectProxyUrl();
let dispatcher;

if (proxyUrl) {
  // 本机代理（如 Clash / v2ray）通常不需要认证
  dispatcher = new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false } });
  console.log(`ℹ 使用代理: ${proxyUrl}`);
} else {
  console.log('ℹ 未探测到代理，直连');
}

/** 带代理与重试的 fetch */
export async function netFetch(url, { retries = 3, timeoutMs = 30000, ...init } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await undiciFetch(url, {
        ...init,
        dispatcher,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

/** 便捷方法：取文本 */
export async function fetchText(url, opts) {
  const res = await netFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

/** 便捷方法：取二进制 */
export async function fetchBuffer(url, opts) {
  const res = await netFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
