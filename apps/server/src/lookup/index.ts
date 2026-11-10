/**
 * 在线找资料（M4）：都要登录（会话或同步凭据，同 /api/assets）。状态码附中文说明。
 * - GET  /api/lookup/search?kind=movie|book|game|restaurant|place&q=…&lang=zh|en[&source=…][&media=movie|tv][&alt=别名…][&city=上海市]
 *        → { results: LookupResult[], sources: [{ source, status: ok|unconfigured|blocked|error, code?, message? }] }
 *        影视同时问 TMDB 和豆瓣（豆瓣的结果只在中文界面列出，尽力而为）；一个来源出错不影响另一个。
 *        media：只要电影或只要剧集（客户端从「电影/剧集」字段、季标记判断；季标记客户端已去掉）。
 *        TMDB 按这个名字没搜到：再用 alt 给的名字、豆瓣同名条目的原名（如英文名）补搜，原名带豆瓣的年份收窄
 *        （试跑：「海绵宝宝大电影·寻找方裤」在 TMDB 叫「海绵宝宝：深海大冒险」）。永远只给候选，不替人选。
 *        书同时问豆瓣读书和 Open Library（Rei 2026-11-09）：中文界面都列，豆瓣读书在前；英文界面名字里有汉字才问豆瓣读书。
 *        Open Library 的结果和豆瓣读书的同一本（同 ISBN，或同名同作者）不再列。
 *        餐厅、目的地只问高德（amap.ts，Rei 2026-11-09）：city 是上次选的城市，优先它、不限定；结果都是中文。
 *        所有来源都失败时返回第一个失败的状态码（如 TMDB 没配置 → 503 服务不可用）。
 * - GET  /api/lookup/item?source=tmdb|douban|doubanbook|openlibrary|steam|igdb|imdb|isbn|amap&id=…&lang=zh|en[&kind=restaurant|place] → LookupResult
 *        source=amap：id 是高德 POI id（B0FFKKRXAZ），或高德分享短链 surl.amap.com/…（只读跳转地址里的 POI id）。
 * - GET  /api/lookup/regeo?lng=…&lat=… → { location, address, city, pois }：地图选点后补地址（高德逆地理，同样走 AMAP_KEY）。
 *        source=imdb：按 IMDb 编号经 TMDB find 直接取；source=isbn：按 ISBN-10 / 13 取那一版（容许连字符、空格），
 *        中文界面先问豆瓣读书、取不到再问 Open Library，英文界面反过来。
 * - POST /api/lookup/image { url } → 把选中结果的封面拉进 R2（mindough-assets），返回同 POST /api/assets 的 { url, r2_key, sha256, mime, size }。
 *   { url, raw: true } → 只代拉原图字节回去（不存）：客户端先按版式统一宽高，再自己 POST /api/assets。
 *        只拉这几个来源的图床（防止拿 Worker 去请求任意地址）。
 * 缓存：Cache API（caches.default），每个来源的搜索结果 1 天、详情 7 天；只缓存成功的。对外请求 8 秒超时（504 网关超时）。
 */
import { requestUser, storeAsset, MAX_ASSET_BYTES, type AssetEnv } from '../assets';
import { doubanItem, searchDouban, DOUBAN_IMAGE_HEADERS } from './douban';
import { doubanBookByIsbn, doubanBookItem, searchDoubanBook } from './doubanbook';
import { openLibraryByIsbn, openLibraryItem, searchOpenLibrary, validIsbn } from './openlibrary';
import { searchSteam, steamItem } from './steam';
import { igdbItem, searchIgdb, type IgdbHit } from './igdb';
import { searchTmdb, tmdbByImdb, tmdbItem, type Media } from './tmdb';
import { amapItem, amapRegeo, searchAmap, type AmapKind } from './amap';
import { LookupError, upstream, type Lang, type LookupEnv, type LookupKind, type LookupResult, type LookupSource, type LookupSourceStatus } from './types';

export interface LookupWorkerEnv extends AssetEnv, LookupEnv {}

export const SEARCH_TTL = 24 * 3600;
export const ITEM_TTL = 7 * 24 * 3600;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const KIND_SOURCES: Record<LookupKind, LookupSource[]> = { movie: ['tmdb', 'douban'], book: ['doubanbook', 'openlibrary'], game: ['steam', 'igdb'], restaurant: ['amap'], place: ['amap'] };

/** Cache API：Worker 里是 caches.default；单测（node）里没有就直接查。 */
interface CacheLike {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, res: Response): Promise<void>;
}
const cacheOf = (): CacheLike | null => (globalThis as { caches?: { default?: CacheLike } }).caches?.default ?? null;

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const cache = cacheOf();
  const req = new Request(`https://lookup-cache.mindough.internal/v1/${key}`);
  if (cache) {
    const hit = await cache.match(req).catch(() => undefined);
    if (hit) return (await hit.json()) as T;
  }
  const value = await fn();
  if (cache) await cache.put(req, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` } })).catch(() => {});
  return value;
}

const langOf = (url: URL): Lang => (url.searchParams.get('lang') === 'en' ? 'en' : 'zh');

interface SearchOpts {
  media?: Media;
  year?: number;
  kind?: AmapKind;
  city?: string;
}

function searchOne(env: LookupEnv, source: LookupSource, q: string, lang: Lang, opts: SearchOpts = {}): Promise<LookupResult[]> {
  const key = `search/${source}/${lang}/${opts.media ?? 'all'}/${opts.year ?? ''}/${opts.kind ?? ''}/${encodeURIComponent(opts.city ?? '')}/${encodeURIComponent(q.toLowerCase())}`;
  return cached(key, SEARCH_TTL, () => {
    switch (source) {
      case 'tmdb':
        return searchTmdb(env, q, lang, opts);
      case 'douban':
        return searchDouban(q);
      case 'doubanbook':
        return searchDoubanBook(q);
      case 'openlibrary':
        return searchOpenLibrary(q, lang);
      case 'steam':
        return searchSteam(q, lang);
      case 'igdb':
        return searchIgdb(env, q, lang);
      case 'amap':
        return searchAmap(env, q, opts.kind ?? 'place', opts.city);
    }
  });
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s·・.,，。:：!！?？'"“”()（）\-—]+/g, '');

const CJK = /[\u3400-\u9fff]/;
const mediaOf = (r: LookupResult): Media => (r.fields.kind === '剧集' ? 'tv' : 'movie');

export interface SearchQuery {
  media?: Media;
  /** 别的叫法（英文名 / 原名），TMDB 按 q 没搜到时补搜。 */
  alt?: string[];
  /** 高德：优先这个城市（不限定）。 */
  city?: string;
}

export async function lookupSearch(env: LookupEnv, kind: LookupKind, q: string, lang: Lang, only?: LookupSource, query: SearchQuery = {}): Promise<{ status: number; body: { results: LookupResult[]; sources: LookupSourceStatus[] } }> {
  let sources = KIND_SOURCES[kind];
  if (only) sources = sources.filter((s) => s === only);
  // 豆瓣的结果全是中文：英文界面不列出；但中文名在 TMDB 搜不到时要靠它给原名，所以名字里有汉字就照样问
  else if (lang === 'en' && !CJK.test(q)) sources = sources.filter((s) => s !== 'douban' && s !== 'doubanbook');
  const media = kind === 'movie' ? query.media : undefined;
  const amapOpts: SearchOpts = kind === 'restaurant' || kind === 'place' ? { kind, ...(query.city ? { city: query.city } : {}) } : {};
  const settled = await Promise.allSettled(sources.map((s) => searchOne(env, s, q, lang, s === 'tmdb' ? { ...(media ? { media } : {}) } : s === 'amap' ? amapOpts : {})));
  const lists = new Map<LookupSource, LookupResult[]>();
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const source = sources[i]!;
    // 只要电影 / 只要剧集：豆瓣的结果也按它过滤
    lists.set(source, media && kind === 'movie' ? r.value.filter((x) => mediaOf(x) === media) : r.value);
  });
  // TMDB 按这个名字没搜到：用别名、豆瓣给的原名补搜（最多试 3 个）
  const tmdbIdx = sources.indexOf('tmdb');
  if (tmdbIdx >= 0 && settled[tmdbIdx]!.status === 'fulfilled' && lists.get('tmdb')!.length === 0) {
    const tries: Array<{ name: string; year?: number }> = (query.alt ?? []).filter(Boolean).map((name) => ({ name }));
    for (const d of lists.get('douban') ?? []) if (d.subtitle && d.subtitle !== q) tries.push({ name: d.subtitle, ...(d.year ? { year: d.year } : {}) });
    const seenName = new Set([q.toLowerCase()]);
    for (const t of tries.filter((x) => !seenName.has(x.name.toLowerCase()) && seenName.add(x.name.toLowerCase())).slice(0, 3)) {
      try {
        let hit = await searchOne(env, 'tmdb', t.name, lang, { ...(media ? { media } : {}), ...(media && t.year ? { year: t.year } : {}) });
        if (!media && t.year) hit = hit.filter((x) => !x.year || Math.abs(x.year - t.year!) <= 1);
        if (hit.length) {
          lists.set('tmdb', hit);
          break;
        }
      } catch {
        break;
      }
    }
  }
  const statuses: LookupSourceStatus[] = [];
  const results: LookupResult[] = [];
  const seen = new Set<string>();
  settled.forEach((r, i) => {
    const source = sources[i]!;
    if (r.status === 'fulfilled') {
      statuses.push({ source, status: 'ok' });
      // 英文界面：豆瓣只拿来补搜，不列出
      if (source === 'douban' && lang === 'en') return;
      for (const x of lists.get(source) ?? []) {
        // 豆瓣与 TMDB 同名同年的算一条，留先来的（TMDB）
        const k = `${norm(x.name)}|${x.year ?? ''}`;
        if (source === 'douban' && seen.has(k)) continue;
        // 书：豆瓣读书在前；Open Library 里同 ISBN、或同名同作者的算同一本，不再列（年份不比：一个是这一版、一个是首版）
        if (kind === 'book') {
          const isbn = typeof x.fields.isbn === 'string' ? `isbn:${x.fields.isbn}` : '';
          const byAuthor = `book:${norm(x.name)}|${norm(String(x.fields.author ?? ''))}`;
          if (source === 'openlibrary' && ((isbn && seen.has(isbn)) || seen.has(byAuthor))) continue;
          if (isbn) seen.add(isbn);
          seen.add(byAuthor);
          results.push(x);
          continue;
        }
        // IGDB 和 Steam 是同一款（IGDB 带的 Steam 链接对得上，或同名同年）：留 Steam 那条
        if (source === 'igdb') {
          const { steamId, ...rest } = x as IgdbHit;
          if ((steamId && seen.has(`steam:${steamId}`)) || seen.has(k)) continue;
          seen.add(k);
          results.push(rest);
          continue;
        }
        seen.add(k);
        if (source === 'steam') seen.add(`steam:${x.sourceId}`);
        results.push(x);
      }
    } else {
      const e = r.reason;
      if (e instanceof LookupError) statuses.push({ source, status: e.state, code: e.status, message: e.message });
      else statuses.push({ source, status: 'error', code: 500, message: '500 服务器出错' });
    }
  });
  const anyOk = statuses.some((s) => s.status === 'ok');
  const status = anyOk || statuses.length === 0 ? 200 : (statuses[0]!.code ?? 502);
  return { status, body: { results, sources: statuses } };
}

/** 按 ISBN：中文界面先豆瓣读书（中文书多、带封面），英文界面先 Open Library；前一个取不到再问另一个，都不行报前一个的错。 */
async function byIsbn(raw: string, lang: Lang): Promise<LookupResult> {
  const isbn = raw.replace(/[\s-]/g, '').toUpperCase();
  if (!validIsbn(isbn)) throw new LookupError(400, '400 请求有误：ISBN 要是 10 位或 13 位（如 9787536692930），校验位要对');
  const order = lang === 'zh' ? [() => doubanBookByIsbn(isbn), () => openLibraryByIsbn(isbn)] : [() => openLibraryByIsbn(isbn), () => doubanBookByIsbn(isbn)];
  try {
    return await order[0]!();
  } catch (first) {
    try {
      return await order[1]!();
    } catch {
      throw first;
    }
  }
}

export function lookupItem(env: LookupEnv, source: string, id: string, lang: Lang, kind: AmapKind = 'place'): Promise<LookupResult> {
  const key = `item/${source}/${lang}/${encodeURIComponent(id)}`;
  switch (source) {
    case 'tmdb':
      return cached(key, ITEM_TTL, () => tmdbItem(env, id, lang));
    case 'imdb':
      return cached(key, ITEM_TTL, () => tmdbByImdb(env, id.toLowerCase(), lang));
    case 'douban':
      return cached(key, ITEM_TTL, () => doubanItem(id));
    case 'doubanbook':
      return cached(key, ITEM_TTL, () => doubanBookItem(id));
    case 'openlibrary':
      return cached(key, ITEM_TTL, () => openLibraryItem(id));
    case 'isbn':
      return cached(`item/isbn/${lang}/${encodeURIComponent(id.replace(/[\s-]/g, '').toUpperCase())}`, ITEM_TTL, () => byIsbn(id, lang));
    case 'steam':
      return cached(key, ITEM_TTL, () => steamItem(id, lang));
    case 'igdb':
      return cached(key, ITEM_TTL, () => igdbItem(env, id.toLowerCase(), lang));
    case 'amap':
      // 高德的营业时间、评分会变：详情只缓存 1 天
      return cached(`item/amap/${kind}/${encodeURIComponent(id)}`, SEARCH_TTL, () => amapItem(env, id, kind));
    default:
      return Promise.reject(new LookupError(400, '400 请求有误：source 只能是 tmdb、douban、doubanbook、openlibrary、steam、igdb、imdb、isbn、amap'));
  }
}

/** 能拉进 R2 的图床（来源的官方图片域名）。没有 Open Library：它的书不带封面；豆瓣读书的封面也在 img*.doubanio.com（Rei 2026-11-09 同意取）；高德的照片在 store.is.autonavi.com 和 aos-comment.amap.com。 */
export function allowedImageHost(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return h === 'image.tmdb.org' || h === 'images.igdb.com' || h.endsWith('.steamstatic.com') || /^img\d+\.doubanio\.com$/.test(h) || h === 'store.is.autonavi.com' || h === 'aos-comment.amap.com';
}

async function importImage(req: Request, env: LookupWorkerEnv, who: string): Promise<Response> {
  let body: { url?: unknown; raw?: unknown };
  try {
    body = (await req.json()) as { url?: unknown; raw?: unknown };
  } catch {
    return json({ error: '400 请求有误：要 JSON { url }' }, 400);
  }
  // raw：只代拉原图回给客户端（客户端统一裁成版式尺寸后再走 POST /api/assets），不存 R2
  const raw = body.raw === true;
  if (!raw && !env.FILES) return json({ error: '503 服务不可用：图片存储还没配置' }, 503);
  const url = typeof body.url === 'string' ? body.url : '';
  if (!allowedImageHost(url)) return json({ error: '400 请求有误：只能拉 TMDB、豆瓣、Steam、IGDB、高德的图片' }, 400);
  let res: Response;
  try {
    res = await upstream('图床', url, { headers: new URL(url).hostname.endsWith('doubanio.com') ? DOUBAN_IMAGE_HEADERS : {} }, 10000);
  } catch (e) {
    const err = e as LookupError;
    return json({ error: err.message ?? '502 错误网关' }, err.status ?? 502);
  }
  if (res.status === 404) return json({ error: '404 未找到：这张图已经没有了' }, 404);
  if (!res.ok) return json({ error: `502 错误网关：图床返回 ${res.status}` }, 502);
  const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(mime)) return json({ error: '415 不支持的格式：拉到的不是图片' }, 415);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_ASSET_BYTES) return json({ error: '413 内容太大：图片不能超过 10 MB' }, 413);
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) return json({ error: '502 错误网关：拉到的是空文件' }, 502);
  if (buf.byteLength > MAX_ASSET_BYTES) return json({ error: '413 内容太大：图片不能超过 10 MB' }, 413);
  if (raw) return new Response(buf, { headers: { 'content-type': mime, 'cache-control': 'no-store' } });
  return json(await storeAsset(env.FILES!, who, buf, mime, new URL(req.url).origin));
}

export async function handleLookup(req: Request, env: LookupWorkerEnv, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;
  const known = path === '/api/lookup/search' || path === '/api/lookup/item' || path === '/api/lookup/image' || path === '/api/lookup/regeo';
  if (!known) return json({ error: '404 未找到' }, 404);
  const wantMethod = path === '/api/lookup/image' ? 'POST' : 'GET';
  if (method !== wantMethod) return json({ error: `405 方法不允许：请用 ${wantMethod}` }, 405);
  const who = await requestUser(req, env);
  if (who instanceof Response) return who;
  if (path === '/api/lookup/image') return importImage(req, env, who);

  const lang = langOf(url);
  if (path === '/api/lookup/regeo') {
    const lng = Number(url.searchParams.get('lng'));
    const lat = Number(url.searchParams.get('lat'));
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90 || !url.searchParams.get('lng') || !url.searchParams.get('lat'))
      return json({ error: '400 请求有误：lng、lat 要是经纬度数字' }, 400);
    try {
      return json(await cached(`regeo/${lng.toFixed(6)},${lat.toFixed(6)}`, SEARCH_TTL, () => amapRegeo(env, lng, lat)));
    } catch (e) {
      if (e instanceof LookupError) return json({ error: e.message, state: e.state }, e.status);
      return json({ error: '500 服务器出错' }, 500);
    }
  }
  if (path === '/api/lookup/search') {
    const kind = url.searchParams.get('kind') as LookupKind | null;
    const q = (url.searchParams.get('q') ?? '').trim();
    const only = (url.searchParams.get('source') ?? '') as LookupSource | '';
    if (!kind || !(kind in KIND_SOURCES)) return json({ error: '400 请求有误：kind 只能是 movie、book、game、restaurant、place' }, 400);
    if (!q) return json({ error: '400 请求有误：q 不能为空' }, 400);
    if (q.length > 200) return json({ error: '400 请求有误：q 太长了' }, 400);
    if (only && !KIND_SOURCES[kind].includes(only)) return json({ error: `400 请求有误：${kind} 没有 ${only} 这个来源` }, 400);
    const mediaParam = url.searchParams.get('media');
    const media = mediaParam === 'movie' || mediaParam === 'tv' ? mediaParam : undefined;
    const alt = url.searchParams.getAll('alt').map((s) => s.trim()).filter((s) => s && s.length <= 200).slice(0, 3);
    const city = (url.searchParams.get('city') ?? '').trim().slice(0, 40);
    const { status, body } = await lookupSearch(env, kind, q, lang, only || undefined, { ...(media ? { media } : {}), alt, ...(city ? { city } : {}) });
    return json(status === 200 ? body : { ...body, error: body.sources[0]?.message }, status);
  }
  const source = url.searchParams.get('source') ?? '';
  const id = (url.searchParams.get('id') ?? '').trim();
  if (!id) return json({ error: '400 请求有误：id 不能为空' }, 400);
  try {
    const k = url.searchParams.get('kind');
    return json(await lookupItem(env, source, id, lang, k === 'restaurant' ? 'restaurant' : 'place'));
  } catch (e) {
    if (e instanceof LookupError) return json({ error: e.message, state: e.state }, e.status);
    return json({ error: '500 服务器出错' }, 500);
  }
}
