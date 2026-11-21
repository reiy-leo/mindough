/**
 * 剧集每季的豆瓣链接（Rei 2026-11-21）：「季」一节显示时，还没有豆瓣编号的季在后台按「剧名」「剧名 第N季」去豆瓣搜，
 * 名字、季号、年份都对得上、又只有一条候选的才记下（写进资料的 `_douban_seasons`，跟着同步）。配不上就不显示。
 * 规则在 core douban-seasons.ts，这里只管什么时候搜。同一条资料一次会话只试一次；30 天内搜过的季不再搜。
 */
import { useEffect } from 'react';
import { DOUBAN_SEASON_QUERIES, doubanSeasonQuery, doubanSeasonsToSearch, matchDoubanSeasons, recordDoubanSearch, seasonsOf, type LibraryItem, type LookupResult, type LookupSearchResponse, type Store, type TaskType } from '@mindough/core';
import { searchDoubanMovies, useLookupAvailable } from './lookup';

const tried = new Set<string>();

/** 测试用：清掉「这次会话已经试过」的记录。 */
export function resetDoubanSeasonsTried(): void {
  tried.clear();
}

type Search = (q: string, signal?: AbortSignal) => Promise<LookupSearchResponse>;

/** 豆瓣这次有没有好好回话（被拦去验证页、出错 → 不算搜过，下次再来）。 */
const answered = (res: LookupSearchResponse) => (res.sources ?? []).some((s) => s.source === 'douban' && s.status === 'ok');

/**
 * 需要就搜一轮，搜完把配上的编号、搜过的季写进资料；返回有没有写。search 给测试换掉网络。
 * 先按剧名搜一次（豆瓣常把各季一起列出来），没配上的季再按「剧名 第N季」逐个搜，一轮最多 DOUBAN_SEASON_QUERIES 次。
 */
export async function refreshDoubanSeasons(store: Store, type: TaskType, itemId: string, search: Search = searchDoubanMovies, signal?: AbortSignal): Promise<boolean> {
  const item = store.get('library_item', itemId);
  if (!item || item.deleted) return false;
  const want = doubanSeasonsToSearch(type, item);
  if (!want.length) return false;
  const key = `${itemId}|${want.join(',')}`;
  if (tried.has(key)) return false;
  tried.add(key);
  const seasons = seasonsOf(type, item);
  const results: LookupResult[] = [];
  const searched = new Set<number>();
  let matched: Record<number, string> = {};
  let queries = 0;
  let broken = false;
  const run = async (q: string): Promise<boolean> => {
    queries++;
    const res = await search(q, signal);
    if (!answered(res)) return false;
    results.push(...(res.results ?? []));
    matched = matchDoubanSeasons(item, seasons, want, results);
    return true;
  };
  try {
    if (!(await run(item.name))) broken = true;
    for (const n of want) {
      if (broken || matched[n] || queries >= DOUBAN_SEASON_QUERIES) continue;
      if (await run(doubanSeasonQuery(item.name, n))) searched.add(n);
      else broken = true;
    }
  } catch {
    // 页面关了取消的：下次打开还要搜
    if (signal?.aborted) {
      tried.delete(key);
      return false;
    }
    broken = true;
  }
  for (const n of Object.keys(matched)) searched.add(Number(n));
  if (!searched.size) return false;
  const cur = store.get('library_item', itemId);
  if (!cur || cur.deleted) return false;
  // 搜一半被拦：只记配上的季，别的下次再搜
  const done = broken ? [...searched].filter((n) => matched[n]) : [...searched];
  if (!done.length) return false;
  const fields = recordDoubanSearch(cur.fields, done, matched);
  if (JSON.stringify(fields) === JSON.stringify(cur.fields)) return false;
  store.updateLibraryItem(itemId, { fields });
  return true;
}

/** 资料页「季」一节用：登录、在线、季已经拉到时按需搜。 */
export function useDoubanSeasonsRefresh(store: Store, type: TaskType | null | undefined, item: LibraryItem | null | undefined): void {
  const available = useLookupAvailable();
  const want = type && item ? doubanSeasonsToSearch(type, item).join(',') : '';
  const id = item?.id;
  useEffect(() => {
    if (!available || !want || !type || !id) return;
    const ctrl = new AbortController();
    void refreshDoubanSeasons(store, type, id, searchDoubanMovies, ctrl.signal);
    return () => ctrl.abort();
  }, [available, want, id]); // eslint-disable-line react-hooks/exhaustive-deps
}
