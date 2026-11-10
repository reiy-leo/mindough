/**
 * 高德地图选点（Rei 2026-11-10）：餐厅、目的地资料里「在地图上选点」。
 * - JS API 2.0 按需加载：点了才注入 https://webapi.amap.com/maps?v=2.0&key=…（不加 npm 依赖）。
 * - 安全密钥走代理：加载前设 window._AMapSecurityConfig.serviceHost = <API 源>/_AMapService，
 *   Worker（apps/server/src/amap-proxy.ts）附上 jscode=AMAP_JS_SECRET 转给高德；前端从不拿到安全密钥。
 * - 没配 AMAP_JS_SECRET：/api/amap/config 说 js=false，入口提示「高德地图还没配置」。
 * - 选好点以后的逆地理走 Worker 的 /api/lookup/regeo（Web 服务 Key AMAP_KEY），不用 JS API 的 Geocoder 插件。
 * Key 本身是公开的（Web 端 JS API Key，在高德控制台按域名白名单限制），Worker 的代理也只转这个 Key。
 */
import { API_BASE, authInit } from './account';

/** 高德「Web 端（JS API）」Key（公开）。和 apps/server/src/amap-proxy.ts 的 AMAP_JS_KEY 是同一个。 */
export const AMAP_JS_KEY = '46fb706833de937bf014650573f24a65';

/** 地图默认中心（没有经纬度、也没有上次选的城市时）：北京天安门。 */
export const DEFAULT_CENTER: [number, number] = [116.397428, 39.90923];

export interface AmapConfig {
  js: boolean;
  rest: boolean;
}

/** 代理放在哪：网页版同源（location.origin），原生端是 API 服务器。 */
export function amapServiceHost(): string {
  const base = API_BASE || (typeof location !== 'undefined' ? location.origin : '');
  return `${base}/_AMapService`;
}

export async function fetchAmapConfig(fetcher: typeof fetch = (...a) => fetch(...a)): Promise<AmapConfig> {
  const res = await fetcher(`${API_BASE}/api/amap/config`, authInit());
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as AmapConfig;
}

// 高德 JS API 没有自带类型，这里只写用到的几样
export interface AMapLngLat {
  getLng(): number;
  getLat(): number;
}
export interface AMapMap {
  setCenter(c: [number, number]): void;
  setZoom(z: number): void;
  on(ev: string, fn: (e: { lnglat: AMapLngLat }) => void): void;
  destroy(): void;
  addControl?(c: unknown): void;
}
export interface AMapMarker {
  setPosition(p: [number, number]): void;
  getPosition(): AMapLngLat;
  on(ev: string, fn: () => void): void;
}
export interface AMapNS {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => AMapMap;
  Marker: new (opts: Record<string, unknown>) => AMapMarker;
}

declare global {
  interface Window {
    AMap?: AMapNS;
    _AMapSecurityConfig?: { serviceHost?: string; securityJsCode?: string };
  }
}

let loading: Promise<AMapNS> | null = null;

/** 按需注入 JS API（只注入一次）；15 秒没加载完算失败，下次再点会重试。 */
export function loadAMap(timeoutMs = 15000): Promise<AMapNS> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loading) return loading;
  window._AMapSecurityConfig = { serviceHost: amapServiceHost() };
  loading = new Promise<AMapNS>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_JS_KEY}`;
    s.async = true;
    const t = setTimeout(() => fail(new Error('timeout')), timeoutMs);
    const fail = (e: Error) => {
      clearTimeout(t);
      loading = null;
      s.remove();
      reject(e);
    };
    s.onload = () => {
      clearTimeout(t);
      // 加载好了以后靠 window.AMap 判断，不再留着这个 promise
      loading = null;
      if (window.AMap) resolve(window.AMap);
      else fail(new Error('no AMap'));
    };
    s.onerror = () => fail(new Error('load'));
    document.head.appendChild(s);
  });
  return loading;
}

export interface RegeoResult {
  location: string;
  address: string;
  city: string;
  pois: Array<{ id: string; name: string; address: string; distance: number; type: string }>;
}

export class RegeoError extends Error {
  constructor(
    public status: number,
    message: string,
    public state?: string,
  ) {
    super(message);
  }
}

/** 逆地理（Worker 代理高德 Web 服务）。 */
export async function regeo(lng: number, lat: number, signal?: AbortSignal, fetcher: typeof fetch = (...a) => fetch(...a)): Promise<RegeoResult> {
  const res = await fetcher(`${API_BASE}/api/lookup/regeo?lng=${lng.toFixed(6)}&lat=${lat.toFixed(6)}`, authInit(signal ? { signal } : {}));
  const body = (await res.json().catch(() => ({}))) as RegeoResult & { error?: string; state?: string };
  if (!res.ok) throw new RegeoError(res.status, body.error ?? String(res.status), body.state);
  return body;
}
