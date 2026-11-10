/**
 * 高德地图（Rei 2026-11-09 定：餐厅、目的地只接高德，不接大众点评）。用的是 Web 服务 API：
 * - 搜地点：GET https://restapi.amap.com/v5/place/text（keywords、region 优先城市但不限定、show_fields=business,photos）；
 *   餐厅只搜餐饮服务（types=050000），目的地什么都搜。
 * - 取一条：GET https://restapi.amap.com/v5/place/detail?id=<POI id>（粘贴 POI id 或分享链接时用）。
 * - 分享短链 surl.amap.com/<码>：302 到 wb.amap.com/?p=<POI id>,纬度,经度,…，只读 Location 头取 POI id，不跟过去。
 * - 逆地理（地图选点后补地址）：GET https://restapi.amap.com/v3/geocode/regeo。
 * Key 从 Worker secret AMAP_KEY 读，只拼进发给 restapi.amap.com 的地址；报错、日志里都不带地址。
 * 结果都是中文（高德没有别的语言），英文界面也一样。
 */
import { LookupError, UPSTREAM_TIMEOUT_MS, type FieldValue, type LookupEnv, type LookupResult } from './types';

export type AmapKind = 'restaurant' | 'place';

const REST = 'https://restapi.amap.com';

/** 高德 POI id：B 开头 10 位大写字母数字（B0FFKKRXAZ、B000A8UIN8）。 */
export const POI_ID = /^B[0-9A-Z]{9}$/;

/** 高德错误码（infocode）→ HTTP 状态码 + 中文说明 + 状态。没列的算 502。 */
const INFOCODES: Record<string, { status: number; text: string; state?: 'unconfigured' | 'limited' }> = {
  '10001': { status: 503, text: '高德 Key 不对或已过期', state: 'unconfigured' },
  '10002': { status: 503, text: '这个高德 Key 没开通这项服务', state: 'unconfigured' },
  '10003': { status: 429, text: '高德今天的调用次数用完了，明天再试', state: 'limited' },
  '10004': { status: 429, text: '高德说请求太频繁，稍后再试', state: 'limited' },
  '10005': { status: 503, text: '高德 Key 的 IP 白名单不包括这台服务器', state: 'unconfigured' },
  '10006': { status: 503, text: '高德 Key 绑定的域名不对', state: 'unconfigured' },
  '10007': { status: 503, text: '高德数字签名不对', state: 'unconfigured' },
  '10008': { status: 503, text: '高德 Key 的安全码不对', state: 'unconfigured' },
  '10009': { status: 503, text: '高德 Key 的平台类型不对（要「Web 服务」Key）', state: 'unconfigured' },
  '10010': { status: 429, text: '高德说这台服务器今天请求太多了', state: 'limited' },
  '10011': { status: 502, text: '高德不支持这种请求方式' },
  '10012': { status: 503, text: '高德 Key 没有这项权限', state: 'unconfigured' },
  '10013': { status: 503, text: '高德 Key 已被删除', state: 'unconfigured' },
  '10014': { status: 429, text: '高德整体请求太多，稍后再试', state: 'limited' },
  '10015': { status: 504, text: '高德那边超时了' },
  '10016': { status: 502, text: '高德服务器忙，稍后再试' },
  '10017': { status: 502, text: '高德这项服务暂时不可用' },
  '10019': { status: 429, text: '高德每秒请求数超了（QPS），稍后再试', state: 'limited' },
  '10020': { status: 429, text: '高德这个接口的每秒请求数超了（QPS），稍后再试', state: 'limited' },
  '10021': { status: 429, text: '高德账号的每秒请求数超了（QPS），稍后再试', state: 'limited' },
  '10026': { status: 503, text: '高德账号被封禁了', state: 'unconfigured' },
  '10029': { status: 429, text: '高德今天的海外调用次数用完了', state: 'limited' },
  '10041': { status: 503, text: '高德 Key 没有可用的接口', state: 'unconfigured' },
  '10044': { status: 429, text: '高德账号今天的调用次数用完了，明天再试', state: 'limited' },
  '10045': { status: 429, text: '高德账号今天的海外调用次数用完了', state: 'limited' },
  '20000': { status: 400, text: '高德说请求参数不对' },
  '20001': { status: 400, text: '高德说缺了必填参数' },
  '20002': { status: 400, text: '高德说请求方式不对' },
  '20003': { status: 502, text: '高德出了未知错误' },
  '20011': { status: 400, text: '这个地点在海外，高德 Key 没有海外权限' },
  '20012': { status: 400, text: '查询里有高德不允许的内容' },
};

const STATUS_ZH: Record<number, string> = { 400: '请求有误', 404: '未找到', 429: '请求太多', 502: '错误网关', 503: '服务不可用', 504: '网关超时' };

/** infocode → LookupError（「429 请求太多：高德今天的调用次数用完了，明天再试（10003）」）。 */
export function amapError(infocode: string | undefined, info?: string): LookupError {
  const hit = infocode ? INFOCODES[infocode] : undefined;
  const status = hit?.status ?? 502;
  const text = hit?.text ?? `高德返回错误${info ? ` ${info}` : ''}`;
  return new LookupError(status, `${status} ${STATUS_ZH[status] ?? ''}：${text}（${infocode ?? '?'}）`, hit?.state ?? 'error');
}

export function amapUnconfigured(): LookupError {
  return new LookupError(503, '503 服务不可用：未配置高德 Key（Worker 机密 AMAP_KEY）', 'unconfigured');
}

interface AmapPhoto {
  title?: string | [];
  url?: string;
}

export interface AmapPoi {
  id: string;
  name: string;
  type?: string;
  typecode?: string;
  address?: string | [];
  location?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
  citycode?: string;
  adcode?: string;
  business?: {
    tel?: string;
    cost?: string;
    rating?: string;
    opentime_today?: string;
    opentime_week?: string;
    business_area?: string;
    alias?: string;
    keytag?: string;
  };
  photos?: AmapPhoto[];
}

interface AmapBody {
  status?: string;
  info?: string;
  infocode?: string;
  pois?: AmapPoi[];
}

/** 高德有时用空数组代替空字符串（「city": []」）。 */
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** 请求高德，只在这里拼 Key；出错不带地址（地址里有 Key）。 */
async function amapGet<T extends { status?: string; info?: string; infocode?: string }>(env: LookupEnv, path: string, params: Record<string, string>): Promise<T> {
  if (!env.AMAP_KEY) throw amapUnconfigured();
  const qs = new URLSearchParams({ key: env.AMAP_KEY, ...params });
  let res: Response;
  try {
    res = await fetch(`${REST}${path}?${qs}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new LookupError(504, '504 网关超时：高德地图没有及时回应');
    throw new LookupError(502, '502 错误网关：连不上高德地图');
  }
  if (res.status === 429) throw new LookupError(429, '429 请求太多：高德地图限流了，稍后再试', 'limited');
  if (!res.ok) throw new LookupError(502, `502 错误网关：高德地图返回 ${res.status}`);
  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    throw new LookupError(502, '502 错误网关：高德地图返回的不是 JSON');
  }
  if (body.status !== '1') throw amapError(body.infocode, body.info);
  return body;
}

/** 照片只要 https（高德给的有 http://store.is.autonavi.com，换成 https 一样能取）。 */
export function amapPhoto(url: string | undefined): string | undefined {
  const u = str(url);
  if (!u) return undefined;
  return u.replace(/^http:\/\//i, 'https://');
}

/** 列表小图：store.is.autonavi.com 的图能按尺寸缩（operate=merge），评论图床不能，就用原图。 */
export function amapThumb(url: string | undefined): string | undefined {
  const u = amapPhoto(url);
  if (!u) return undefined;
  if (/^https:\/\/store\.is\.autonavi\.com\/showpic\/[0-9a-f]+$/i.test(u)) return `${u}?operate=merge&w=160&h=90&position=5`;
  return u;
}

/** 类别：「餐饮服务;中餐厅;火锅店」→「中餐厅 · 火锅店」；多个类别用 | 分开的，每个都取大类后面的。 */
export function amapCategory(type: string | undefined): string {
  const out: string[] = [];
  for (const group of str(type).split('|')) {
    const parts = group.split(';').map((s) => s.trim()).filter(Boolean);
    const tail = parts.length > 1 ? parts.slice(1) : parts;
    for (const p of tail) if (!out.includes(p)) out.push(p);
  }
  return out.join(' · ');
}

/** 城市 / 区：「上海市 黄浦区」；直辖市省和市同名只写一次。 */
export function amapArea(p: Pick<AmapPoi, 'pname' | 'cityname' | 'adname'>): string {
  const parts: string[] = [];
  for (const s of [str(p.cityname) || str(p.pname), str(p.adname)]) if (s && !parts.includes(s)) parts.push(s);
  return parts.join(' ');
}

/** 地图链接：高德的地点详情页（电脑、手机都能开，手机上能跳高德地图 App）。 */
export const amapPoiUrl = (id: string) => `https://uri.amap.com/poidetail?poiid=${id}&src=mindough`;

/** 高德标点链接（没有 POI id、只有经纬度时）。 */
export const amapMarkerUrl = (lnglat: string, name: string) => `https://uri.amap.com/marker?position=${lnglat}&name=${encodeURIComponent(name)}&src=mindough`;

const num = (s: string | undefined): number | undefined => {
  const n = Number(str(s));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** 一条 POI → 资料。fields 的 key 对应内置「餐厅」「目的地」的字段（见 core seed/builtin-types.ts）。 */
export function amapResult(p: AmapPoi, kind: AmapKind): LookupResult {
  const b = p.business ?? {};
  const category = amapCategory(p.type);
  const area = amapArea(p);
  const address = str(p.address);
  const photo = (p.photos ?? []).map((x) => amapPhoto(x.url)).find(Boolean);
  const fields: Record<string, FieldValue> = { amap: p.id };
  if (address) fields.address = address;
  if (area) fields.city = area;
  if (str(p.location)) fields.location = str(p.location);
  const tel = str(b.tel).split(';').map((s) => s.trim()).filter(Boolean).join(' / ');
  if (tel) fields.phone = tel;
  if (category) fields.category = category;
  const rating = num(b.rating);
  if (rating) fields.rating = rating;
  const cost = num(b.cost);
  if (cost && kind === 'restaurant') fields.cost = { amount: cost, currency: 'CNY' };
  const hours = str(b.opentime_week) || str(b.opentime_today);
  if (hours) fields.hours = hours;
  // 记住城市（下次搜的时候优先这个城市，不限定）：下划线开头的键不是类型字段，不会存进资料
  const city = str(p.cityname) || str(p.pname);
  if (city) fields._city = city;
  return {
    source: 'amap',
    sourceId: p.id,
    name: str(p.name),
    ...(photo ? { image: photo } : {}),
    ...(photo ? { thumb: amapThumb((p.photos ?? []).find((x) => amapPhoto(x.url))?.url) } : {}),
    subtitle: [category, [area.replace(/\s+/g, ''), address].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    fields,
    url: amapPoiUrl(p.id),
  };
}

/** 搜地点。city 是上次选的城市（优先、不限定）。 */
export async function searchAmap(env: LookupEnv, q: string, kind: AmapKind, city?: string): Promise<LookupResult[]> {
  const params: Record<string, string> = { keywords: q, show_fields: 'business,photos', page_size: '10', page_num: '1' };
  if (kind === 'restaurant') params.types = '050000';
  if (city) {
    params.region = city;
    params.city_limit = 'false';
  }
  const body = await amapGet<AmapBody>(env, '/v5/place/text', params);
  return (body.pois ?? []).filter((p) => p.id && str(p.name)).map((p) => amapResult(p, kind));
}

/** 按 POI id 取一条（id 也可以是 surl.amap.com 分享短链）。 */
export async function amapItem(env: LookupEnv, raw: string, kind: AmapKind): Promise<LookupResult> {
  let id = raw.trim();
  if (!POI_ID.test(id)) id = (await resolveAmapShare(id)) ?? '';
  if (!POI_ID.test(id)) throw new LookupError(400, '400 请求有误：认不出高德地点编号（B 开头 10 位），也不是高德分享链接');
  const body = await amapGet<AmapBody>(env, '/v5/place/detail', { id, show_fields: 'business,photos' });
  const p = body.pois?.[0];
  if (!p) throw new LookupError(404, '404 未找到：高德地图上没有这个地点');
  return amapResult(p, kind);
}

/** 从高德的各种链接里认 POI id（不发请求）：?p=B0…,…、poiid=B0…、/place/B0…、/detail/B0…、id=B0…。 */
export function poiIdOfUrl(url: string): string | null {
  const s = decodeURIComponent(url);
  const m = /[?&](?:p|poiid|id|q)=(B[0-9A-Z]{9})(?=$|[,&#])/.exec(s) ?? /\/(?:place|detail|poi)\/(B[0-9A-Z]{9})(?=$|[/?#])/.exec(s) ?? /poiid=(B[0-9A-Z]{9})/.exec(s);
  return m ? m[1]! : null;
}

/** 高德分享短链（surl.amap.com/<码>）→ POI id：只请求这一个域名、不跟跳转，读 Location。 */
export async function resolveAmapShare(raw: string): Promise<string | null> {
  const direct = poiIdOfUrl(raw);
  if (direct) return direct;
  let u: URL;
  try {
    u = new URL(raw.replace(/^http:/i, 'https:'));
  } catch {
    return null;
  }
  if (u.hostname.toLowerCase() !== 'surl.amap.com' || !/^\/[0-9A-Za-z]{4,20}/.test(u.pathname)) return null;
  const code = /^\/([0-9A-Za-z]{4,20})/.exec(u.pathname)![1]!;
  let res: Response;
  try {
    res = await fetch(`https://surl.amap.com/${code}`, { redirect: 'manual', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch {
    throw new LookupError(502, '502 错误网关：打不开这个高德分享链接');
  }
  const loc = res.headers.get('location');
  if (!loc) throw new LookupError(404, '404 未找到：这个高德分享链接已经失效，或者分享的不是地点');
  return poiIdOfUrl(loc);
}

export interface RegeoResult {
  /** 「121.487590,31.238251」 */
  location: string;
  address: string;
  city: string;
  /** 附近最近的地点（可能是空的）。 */
  pois: Array<{ id: string; name: string; address: string; distance: number; type: string }>;
}

interface RegeoBody {
  status?: string;
  info?: string;
  infocode?: string;
  regeocode?: {
    formatted_address?: string | [];
    addressComponent?: { province?: string | []; city?: string | []; district?: string | [] };
    pois?: Array<{ id?: string; name?: string; address?: string | []; distance?: string; type?: string }>;
  };
}

/** 逆地理：经纬度 → 地址、城市 / 区、附近地点（地图选点后补地址用）。 */
export async function amapRegeo(env: LookupEnv, lng: number, lat: number): Promise<RegeoResult> {
  const location = `${lng.toFixed(6)},${lat.toFixed(6)}`;
  const body = await amapGet<RegeoBody>(env, '/v3/geocode/regeo', { location, extensions: 'all', radius: '200' });
  const r = body.regeocode ?? {};
  const c = r.addressComponent ?? {};
  const area = amapArea({ pname: str(c.province), cityname: str(c.city), adname: str(c.district) });
  const pois = (r.pois ?? [])
    .filter((p) => p.id && str(p.name))
    .map((p) => ({ id: p.id!, name: str(p.name), address: str(p.address), distance: Math.round(Number(p.distance ?? 0) || 0), type: amapCategory(p.type) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);
  return { location, address: str(r.formatted_address), city: area, pois };
}
