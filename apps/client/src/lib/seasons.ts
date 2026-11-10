/**
 * 剧集的季（Rei 2026-11-11）：资料页打开时，剧集缺季数据（或来源换了、存了超过 30 天）就在后台补拉一次，
 * 写进资料的 `_seasons`（跟着资料同步）；拉不到不写，这次打开不再重试（同一条资料一次会话只试一次）。
 * 规则在 core/seasons.ts，这里只管什么时候拉。
 */
import { useEffect } from 'react';
import { encodeSeasons, needsSeasonsFetch, SEASONS_KEY, type LibraryItem, type SeasonsResponse, type Store, type TaskType } from '@mindough/core';
import { fetchSeasons, useLookupAvailable } from './lookup';

const tried = new Set<string>();

/** 测试用：清掉「这次会话已经试过」的记录。 */
export function resetSeasonsTried(): void {
  tried.clear();
}

/**
 * 需要就拉一次季，拉到写进资料；返回有没有写。fetcher 给测试换掉网络。
 * 写之前再看一眼资料：删了、来源又换了就不写。
 */
export async function refreshSeasons(store: Store, type: TaskType, itemId: string, fetcher: (ref: string, signal?: AbortSignal) => Promise<SeasonsResponse> = fetchSeasons, signal?: AbortSignal): Promise<boolean> {
  const item = store.get('library_item', itemId);
  if (!item || item.deleted) return false;
  const ref = needsSeasonsFetch(type, item);
  if (!ref) return false;
  const key = `${itemId}|${ref}`;
  if (tried.has(key)) return false;
  tried.add(key);
  let res: SeasonsResponse;
  try {
    res = await fetcher(ref, signal);
  } catch {
    // 是页面关了取消的：下次打开还要拉
    if (signal?.aborted) tried.delete(key);
    return false;
  }
  const cur = store.get('library_item', itemId);
  if (!cur || cur.deleted || needsSeasonsFetch(type, cur) !== ref) return false;
  store.updateLibraryItem(itemId, { fields: { ...cur.fields, [SEASONS_KEY]: encodeSeasons(ref, res) } });
  return true;
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
