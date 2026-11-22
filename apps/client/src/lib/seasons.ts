/**
 * 剧集的季（Rei 2026-11-11）：资料页打开时，剧集没存过季数据（或来源换了）就在后台补拉一次，
 * 写进资料的 `_seasons`（跟着资料同步）；拉不到不写，这次打开不再重试（同一条资料一次会话只试一次）。
 * 存了多久不管（Rei 2026-11-22 去掉了存满 30 天自动重拉）：TMDB 后来补了季，点「季」标题旁的刷新按钮，
 * 走 refreshSeasonsNow 整份重拉。规则在 core/seasons.ts，这里只管什么时候拉。
 */
import { useEffect, useSyncExternalStore } from 'react';
import { encodeSeasons, httpStatusZh, needsSeasonsFetch, sameSeasons, seasonsRef, SEASONS_KEY, type LibraryItem, type SeasonsResponse, type Store, type TaskType } from '@mindough/core';
import { getAccount } from './account';
import { refreshDoubanSeasons } from './douban-seasons';
import { fetchSeasons, fetchSeasonsFresh, LookupHttpError, searchDoubanMovies, useLookupAvailable } from './lookup';
import { tr } from './i18n';

type Fetcher = (ref: string, signal?: AbortSignal) => Promise<SeasonsResponse>;

const tried = new Set<string>();

/** 测试用：清掉「这次会话已经试过」的记录。 */
export function resetSeasonsTried(): void {
  tried.clear();
  busy.clear();
}

// ───── 正在拉的资料（后台补拉和手动刷新共用，按钮转圈、禁用看这个） ─────
const busy = new Map<string, number>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function hold(itemId: string): () => void {
  busy.set(itemId, (busy.get(itemId) ?? 0) + 1);
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const n = (busy.get(itemId) ?? 1) - 1;
    if (n > 0) busy.set(itemId, n);
    else busy.delete(itemId);
    emit();
  };
}

export const seasonsBusy = (itemId: string): boolean => busy.has(itemId);

/** 这条资料的季正在拉吗。 */
export function useSeasonsBusy(itemId: string | null | undefined): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => !!itemId && busy.has(itemId),
  );
}

/**
 * 需要就拉一次季，拉到写进资料；返回有没有写。fetcher 给测试换掉网络。
 * 写之前再看一眼资料：删了、来源又换了就不写。
 */
export async function refreshSeasons(store: Store, type: TaskType, itemId: string, fetcher: Fetcher = fetchSeasons, signal?: AbortSignal): Promise<boolean> {
  const item = store.get('library_item', itemId);
  if (!item || item.deleted) return false;
  const ref = needsSeasonsFetch(type, item);
  if (!ref) return false;
  const key = `${itemId}|${ref}`;
  if (tried.has(key)) return false;
  tried.add(key);
  const release = hold(itemId);
  let res: SeasonsResponse;
  try {
    res = await fetcher(ref, signal);
  } catch {
    // 是页面关了取消的：下次打开还要拉
    if (signal?.aborted) tried.delete(key);
    return false;
  } finally {
    release();
  }
  const cur = store.get('library_item', itemId);
  if (!cur || cur.deleted || needsSeasonsFetch(type, cur) !== ref) return false;
  store.updateLibraryItem(itemId, { fields: { ...cur.fields, [SEASONS_KEY]: encodeSeasons(ref, res) } });
  return true;
}

/** 手动刷新的结果。changed：列表变了（没变就不写，免得白白同步一次）。 */
export type SeasonsRefreshResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'offline' | 'signed_out' | 'busy' | 'gone' | 'network' | 'aborted' }
  | { ok: false; reason: 'http'; status: number };

/** 能不能在线刷新：没联网 / 没登录。 */
function availability(): 'ok' | 'offline' | 'signed_out' {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return getAccount().status === 'in' ? 'ok' : 'signed_out';
}

export interface SeasonsRefreshOptions {
  fetcher?: Fetcher;
  /** 豆瓣搜索（顺带重配每季的豆瓣编号）；传 null 不配。 */
  searchDouban?: typeof searchDoubanMovies | null;
  check?: () => 'ok' | 'offline' | 'signed_out';
  signal?: AbortSignal;
}

/**
 * 「季」标题旁的刷新按钮（Rei 2026-11-22「在季列表旁加个「刷新」按钮」）：马上从 TMDB 整份重拉（带 fresh=1，Worker 不读缓存），
 * 拉到写回 `_seasons`；拉不到不动旧的。成功后顺带在后台把还没配上豆瓣编号的季再搜一遍
 * （30 天内搜过的也搜；已有的编号不动），不等它搜完。
 */
export async function refreshSeasonsNow(store: Store, type: TaskType, itemId: string, opts: SeasonsRefreshOptions = {}): Promise<SeasonsRefreshResult> {
  const { fetcher = fetchSeasonsFresh, searchDouban = searchDoubanMovies, check = availability, signal } = opts;
  const item = store.get('library_item', itemId);
  const ref = item && !item.deleted ? seasonsRef(type, item) : null;
  if (!item || item.deleted || !ref) return { ok: false, reason: 'gone' };
  const can = check();
  if (can !== 'ok') return { ok: false, reason: can };
  if (busy.has(itemId)) return { ok: false, reason: 'busy' };
  tried.add(`${itemId}|${ref}`); // 后台补拉别跟着再拉一遍
  const release = hold(itemId);
  let res: SeasonsResponse;
  try {
    res = await fetcher(ref, signal);
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'aborted' };
    if (e instanceof LookupHttpError) return { ok: false, reason: 'http', status: e.status };
    return { ok: false, reason: 'network' };
  } finally {
    release();
  }
  const cur = store.get('library_item', itemId);
  if (!cur || cur.deleted || seasonsRef(type, cur) !== ref) return { ok: false, reason: 'gone' };
  const changed = !sameSeasons(cur.fields, ref, res);
  if (changed) store.updateLibraryItem(itemId, { fields: { ...cur.fields, [SEASONS_KEY]: encodeSeasons(ref, res) } });
  if (searchDouban) void refreshDoubanSeasons(store, type, itemId, searchDouban, undefined, { all: true }).catch(() => false);
  return { ok: true, changed };
}

/** HTTP 状态码带中文说明：「502 网关错误」；没有说明的只写数字。 */
const withCode = (code: number) => (httpStatusZh(code) ? `${code} ${httpStatusZh(code)}` : String(code));

/** 刷新结果给提示用的话；不用提示（取消、正在拉）→ null。 */
export function seasonsRefreshMessage(r: SeasonsRefreshResult): { tone?: 'error'; message: string } | null {
  if (r.ok) return { message: r.changed ? tr('季已更新') : tr('季已经是最新的') };
  switch (r.reason) {
    case 'offline':
      return { tone: 'error', message: tr('现在没联网，联网后才能刷新季') };
    case 'signed_out':
      return { tone: 'error', message: tr('登录后才能刷新季，到设置里登录') };
    case 'http':
      return { tone: 'error', message: tr('季没刷新：{code}', { code: withCode(r.status) }) };
    case 'network':
      return { tone: 'error', message: tr('季没刷新：没连上服务器') };
    default:
      return null;
  }
}

/** 资料页用：登录、在线时按需补拉。 */
export function useSeasonsRefresh(store: Store, type: TaskType | null | undefined, item: LibraryItem | null | undefined): void {
  const available = useLookupAvailable();
  const ref = type && item ? needsSeasonsFetch(type, item) : null;
  const id = item?.id;
  useEffect(() => {
    if (!available || !ref || !type || !id) return;
    const ctrl = new AbortController();
    void refreshSeasons(store, type, id, fetchSeasons, ctrl.signal);
    return () => ctrl.abort();
  }, [available, ref, id]); // eslint-disable-line react-hooks/exhaustive-deps
}
