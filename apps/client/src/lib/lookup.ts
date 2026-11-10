/**
 * 在线找资料（M4）：调 Worker 的 /api/lookup/*（要登录）。离线或没登录时整块不出现，界面永不等网络：
 * - 选中一条在线结果：先用搜索结果马上建好资料，再在后台补详情（IMDb 编号等）和封面（Worker 拉进 R2，存 asset 引用，不热链）；
 * - 自动补全：先取结果，逐项给人看，确认后才填（图片也是这时才拉）；
 * - 书的封面：Open Library 的结果不填图、不拉图（Rei 2026-10-17，core 的 lookupCover）；豆瓣读书的带封面，同影视海报拉进 R2（Rei 2026-11-09）。
 * - 餐厅、目的地只问高德（Rei 2026-11-09）：搜的时候带上次选的城市（本机记着，优先、不限定）；照片同样拉进 R2。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  findLookupTwin,
  getLocale,
  isPlaceKind,
  itemOfLookup,
  lookupCover,
  lookupSearchText,
  type FieldValue,
  type LookupKind,
  type LookupMedia,
  type LookupResult,
  type LookupSearchResponse,
  type LookupSource,
  type Store,
  type TaskType,
} from '@mindough/core';
import { API_BASE, authInit, getAccount, subscribeAccount } from './account';
import { artShape, normalizeImage, type ArtShape } from './image';
import { uploadImage } from './upload';

export class LookupHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public state?: string,
  ) {
    super(message);
  }
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** 能不能在线找：登录了且在线。 */
export function lookupAvailable(): boolean {
  return getAccount().status === 'in' && online();
}

function subscribeAvailability(fn: () => void): () => void {
  const off = subscribeAccount(fn);
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    off();
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
}

export function useLookupAvailable(): boolean {
  return useSyncExternalStore(subscribeAvailability, lookupAvailable);
}

/** 在线查资料：中文界面按中文查，其他语言都按英文查（来源只有中英两种结果；2026-10-25 加七种语言时定的）。 */
const lang = () => (getLocale() === 'zh' ? 'zh' : 'en');

async function getJson<T>(path: string, signal?: AbortSignal, fetcher: typeof fetch = (...a) => fetch(...a)): Promise<T> {
  const res = await fetcher(`${API_BASE}${path}`, authInit(signal ? { signal } : {}));
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; state?: string };
  if (!res.ok && !('sources' in (body as object))) throw new LookupHttpError(res.status, body.error ?? String(res.status), body.state);
  return body;
}

// ───── 高德：上次选的城市（本机，不同步；下次搜的时候优先这个城市，不限定） ─────
const CITY_KEY = 'mindough:amap-city';

export function lastLookupCity(): string | null {
  try {
    return localStorage.getItem(CITY_KEY) || null;
  } catch {
    return null;
  }
}

/** 选中一条高德结果时记下它的城市（结果 fields._city，「上海市」）。 */
export function rememberLookupCity(r: Pick<LookupResult, 'source' | 'fields'>): void {
  const city = r.source === 'amap' && typeof r.fields._city === 'string' ? r.fields._city.trim() : '';
  if (!city) return;
  try {
    localStorage.setItem(CITY_KEY, city.slice(0, 40));
  } catch {
    /* 存不了就算了 */
  }
}

/** media：只要电影 / 只要剧集（影视）；alt：别的叫法，TMDB 按 q 没搜到时补搜；city：高德优先这个城市（默认上次选的）。 */
export function searchOnline(kind: LookupKind, q: string, signal?: AbortSignal, fetcher?: typeof fetch, opts: { media?: LookupMedia; alt?: string[]; city?: string | null } = {}): Promise<LookupSearchResponse> {
  const city = isPlaceKind(kind) ? (opts.city === undefined ? lastLookupCity() : opts.city) : null;
  const extra = `${opts.media && kind === 'movie' ? `&media=${opts.media}` : ''}${(opts.alt ?? []).map((a) => `&alt=${encodeURIComponent(a)}`).join('')}${city ? `&city=${encodeURIComponent(city)}` : ''}`;
  return getJson(`/api/lookup/search?kind=${kind}&q=${encodeURIComponent(q)}&lang=${lang()}${extra}`, signal, fetcher);
}

/**
 * source 可以是 imdb（按 IMDb 编号经 TMDB 取）、isbn（按 ISBN 取那一版：中文界面先豆瓣读书，再 Open Library）、
 * amap（id 是高德 POI id 或分享短链；kind 说是餐厅还是目的地，餐厅才带人均）。
 */
export function fetchLookupItem(source: LookupSource | 'imdb' | 'isbn', id: string, signal?: AbortSignal, fetcher?: typeof fetch, kind?: LookupKind | null): Promise<LookupResult> {
  return getJson(`/api/lookup/item?source=${source}&id=${encodeURIComponent(id)}&lang=${lang()}${source === 'amap' && kind ? `&kind=${kind}` : ''}`, signal, fetcher);
}

/**
 * 把选中结果的封面存进 R2，返回 asset id；不行就 null（不退回热链）。
 * 先经 Worker 代拉原图（raw，豆瓣防盗链要服务端带 Referer），在本机按版式统一宽高后上传；
 * 代拉失败时退回让 Worker 直接存原图。
 */
export async function importLookupImage(store: Store, url: string, shape: ArtShape = 'square', fetcher: typeof fetch = (...a) => fetch(...a)): Promise<string | null> {
  if (!lookupAvailable()) return null;
  try {
    const res = await fetcher(`${API_BASE}/api/lookup/image`, authInit({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, raw: true }) }));
    if (res.ok) {
      const blob = await res.blob();
      const { blob: out, width, height } = await normalizeImage(blob.type ? blob : new Blob([blob], { type: res.headers.get('content-type') ?? '' }), shape);
      const up = await uploadImage(out, fetcher);
      if (up) return store.insert('asset', { sha256: up.sha256, mime: up.mime, width, height, r2_key: up.r2_key, url: up.url }).id;
    }
  } catch {
    /* 退回下面直接存原图 */
  }
  try {
    const res = await fetcher(`${API_BASE}/api/lookup/image`, authInit({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) }));
    if (!res.ok) return null;
    const up = (await res.json()) as { url: string; r2_key: string; sha256: string; mime: string };
    return store.insert('asset', { sha256: up.sha256, mime: up.mime, width: null, height: null, r2_key: up.r2_key, url: up.url }).id;
  } catch {
    return null;
  }
}

const isEmpty = (v: FieldValue | undefined) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * 选中一条在线结果：马上建资料（或用库里已有的同一条），返回资料 id 与是不是新建的；详情与封面在后台补，只补空缺。
 */
export function createItemFromLookup(store: Store, type: TaskType, r: LookupResult, deps: { fetchItem?: typeof fetchLookupItem; importImage?: typeof importLookupImage } = {}): { id: string; created: boolean } {
  rememberLookupCity(r);
  const twin = findLookupTwin(store.list('library_item'), type.id, r);
  if (twin) {
    // 库里已有（比如同名）：用它，只补空缺
    void enrich(store, type, twin, r, deps);
    return { id: twin, created: false };
  }
  const data = itemOfLookup(type, r);
  const id = store.createLibraryItem(type.id, { name: data.name, fields: data.fields }).id;
  void enrich(store, type, id, r, deps);
  return { id, created: true };
}

async function enrich(store: Store, type: TaskType, id: string, r: LookupResult, deps: { fetchItem?: typeof fetchLookupItem; importImage?: typeof importLookupImage }) {
  const fetchItem = deps.fetchItem ?? fetchLookupItem;
  const importImage = deps.importImage ?? importLookupImage;
  let full = r;
  try {
    // 高德的搜索结果已经是全的（show_fields=business,photos），不再取一遍省配额
    if (r.source !== 'amap') full = await fetchItem(r.source, r.sourceId);
  } catch {
    /* 详情拿不到就用搜索结果 */
  }
  const image = lookupCover(full).image ?? lookupCover(r).image;
  const asset = image ? await importImage(store, image, artShape(type)) : null;
  const cur = store.get('library_item', id);
  if (!cur || cur.deleted) return;
  const fields = { ...cur.fields };
  let changed = false;
  for (const [k, v] of Object.entries(itemOfLookup(type, full).fields)) {
    if (isEmpty(fields[k])) {
      fields[k] = v;
      changed = true;
    }
  }
  const patch: Parameters<Store['updateLibraryItem']>[1] = {};
  if (changed) patch.fields = fields;
  if (asset && !cur.image) patch.image = asset;
  if (Object.keys(patch).length) store.updateLibraryItem(id, patch);
}

export interface OnlineSearchState {
  /** unavailable：有要找的，但没登录或没网（界面要说一声，不能整栏不见，Rei 2026-10-28）。 */
  status: 'idle' | 'unavailable' | 'loading' | 'done' | 'error';
  /** status 是 unavailable 时：为什么找不了。 */
  reason?: 'signed_out' | 'offline';
  results: LookupResult[];
  sources: LookupSearchResponse['sources'];
  error?: LookupHttpError;
}

const IDLE: OnlineSearchState = { status: 'idle', results: [], sources: [] };

/**
 * 边打字边在线找：防抖 350 毫秒，新的输入取消上一次请求；离线、没登录、空查询都不找。
 * 输入框里的原文进来：季标记（第三季、S03）去掉、按剧集搜；粘贴的 IMDb / 豆瓣编号或链接、书的 ISBN 直接按编号取（也只是一条候选，要人点）。
 */
export function useOnlineSearch(kind: LookupKind | null, text: string, delay = 350): OnlineSearchState {
  const available = useLookupAvailable();
  const [state, setState] = useState<OnlineSearchState>(IDLE);
  const seq = useRef(0);
  const parsed = lookupSearchText(text, kind);
  const key = parsed ? JSON.stringify(parsed) : '';
  useEffect(() => {
    const my = ++seq.current;
    const q = key ? (JSON.parse(key) as NonNullable<ReturnType<typeof lookupSearchText>>) : null;
    if (!kind || !q) {
      setState(IDLE);
      return;
    }
    if (!available) {
      setState({ status: 'unavailable', reason: online() ? 'signed_out' : 'offline', results: [], sources: [] });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: 'loading' }));
    const run = (): Promise<LookupSearchResponse> => {
      if (q.by === 'name') return searchOnline(kind, q.q, ctrl.signal, undefined, q.media ? { media: q.media } : {});
      const fits = q.source === 'amap' ? isPlaceKind(kind) : q.source === 'isbn' || q.source === 'doubanbook' ? kind === 'book' : kind === 'movie';
      if (!fits) return searchOnline(kind, text.trim(), ctrl.signal);
      const source: LookupSource = q.source === 'imdb' ? 'tmdb' : q.source === 'isbn' ? 'openlibrary' : q.source;
      return fetchLookupItem(q.source, q.id, ctrl.signal, undefined, kind).then(
        (r) => ({ results: [r], sources: [{ source, status: 'ok' as const }] }),
        (e: unknown) => {
          if (e instanceof LookupHttpError && e.status === 404) return { results: [], sources: [{ source, status: 'ok' as const }] };
          if (e instanceof LookupHttpError && e.state === 'unconfigured') return { results: [], sources: [{ source, status: 'unconfigured' as const, code: e.status }] };
          if (e instanceof LookupHttpError && e.state === 'limited') return { results: [], sources: [{ source, status: 'limited' as const, code: e.status }] };
          throw e;
        },
      );
    };
    const t = setTimeout(() => {
      run()
        .then((res) => my === seq.current && setState({ status: 'done', results: res.results ?? [], sources: res.sources ?? [] }))
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || my !== seq.current) return;
          setState({ status: 'error', results: [], sources: [], error: e instanceof LookupHttpError ? e : new LookupHttpError(0, String(e)) });
        });
    }, delay);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [kind, key, available, delay]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
