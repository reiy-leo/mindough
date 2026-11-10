/**
 * 高德 JS API 安全密钥代理（Rei 2026-11-10）：前端设 window._AMapSecurityConfig = { serviceHost: '<API 源>/_AMapService' }，
 * JS API 发给高德的服务请求都先到这里，Worker 附上 jscode=AMAP_JS_SECRET 再转给高德（高德文档「通过代理服务器转发」）：
 * - /_AMapService/v4/map/styles   → https://webapi.amap.com/v4/map/styles（自定义地图样式）
 * - /_AMapService/v3/vectordata/… → https://fmap01.amap.com/v3/vectordata/…（旧版文档的矢量数据）
 * - /_AMapService/…               → https://restapi.amap.com/…（Web 服务）
 * 安全密钥只在 Worker 机密里，不进前端、不进 git、不打印。只转 GET，而且只转带我们自己 JS Key 的请求，免得被拿去给别的 Key 用。
 * GET /api/amap/config → { js: true|false, rest: true|false }：前端据此提示「高德地图还没配置」。
 */
import type { LookupEnv } from './lookup/types';

/** Web 端（JS API）Key：公开的，前端也写着同一个（apps/client/src/lib/amap.ts）。 */
export const AMAP_JS_KEY = '46fb706833de937bf014650573f24a65';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });

export function amapProxyTarget(pathname: string): string | null {
  const rest = pathname.slice('/_AMapService'.length);
  if (!rest.startsWith('/') || rest.includes('..')) return null;
  if (rest.startsWith('/v4/map/styles')) return `https://webapi.amap.com${rest}`;
  if (rest.startsWith('/v3/vectordata/')) return `https://fmap01.amap.com${rest}`;
  return `https://restapi.amap.com${rest}`;
}

export async function handleAmapProxy(req: Request, env: LookupEnv, url: URL): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '600' } });
  if (req.method !== 'GET') return json({ error: '405 方法不允许：请用 GET' }, 405);
  if (!env.AMAP_JS_SECRET) return json({ status: '0', info: 'MINDOUGH_NO_JS_SECRET', error: '503 服务不可用：未配置高德安全密钥（Worker 机密 AMAP_JS_SECRET）' }, 503);
  const target = amapProxyTarget(url.pathname);
  if (!target) return json({ error: '404 未找到' }, 404);
  const params = new URLSearchParams(url.search);
  if (params.get('key') !== AMAP_JS_KEY) return json({ error: '403 无权限：只转发念头团自己的高德 Key' }, 403);
  params.delete('jscode');
  params.set('jscode', env.AMAP_JS_SECRET);
  let res: Response;
  try {
    res = await fetch(`${target}?${params}`, { headers: { 'user-agent': req.headers.get('user-agent') ?? 'Mindough', referer: req.headers.get('referer') ?? '' }, signal: AbortSignal.timeout(10000) });
  } catch {
    return json({ error: '502 错误网关：连不上高德' }, 502);
  }
  const out = new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' } });
  return out;
}

export function handleAmapConfig(env: LookupEnv): Response {
  return json({ js: !!env.AMAP_JS_SECRET, rest: !!env.AMAP_KEY });
}
