/**
 * 豆瓣单季并进剧集、每季自动配豆瓣链接（Rei 2026-11-21），用《星期三》的真实编号。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_TYPE_IDS, encodeSeasons, MemoryAdapter, readDoubanSeasons, SEASONS_KEY, Store, setLocale, type LookupResult, type LookupSearchResponse } from '@mindough/core';
import { createItemFromLookup, lookupPickToast } from './lookup';
import { refreshDoubanSeasons, resetDoubanSeasonsTried } from './douban-seasons';

const NOW = new Date();
const SEASONS = { tv: 'tv/119051', seasons: [{ number: 1, year: 2022, episodes: 8 }, { number: 2, year: 2025, episodes: 8 }] };
const db = (id: string, name: string, year: number, kind = '剧集', subtitle = 'Wednesday'): LookupResult => ({ source: 'douban', sourceId: id, name, year, subtitle, fields: { douban: id, kind, year }, url: `https://movie.douban.com/subject/${id}/` });
const S1 = db('35364243', '星期三 第一季', 2022);
const S2 = db('36208369', '星期三 第二季', 2025);
const TMDB: LookupResult = { source: 'tmdb', sourceId: 'tv/119051', name: '星期三', year: 2022, fields: { kind: '剧集', year: 2022 }, url: 'https://www.themoviedb.org/tv/119051' };
const ok = (results: LookupResult[]): LookupSearchResponse => ({ results, sources: [{ source: 'douban', status: 'ok' }] });
const noFetch = { fetchItem: vi.fn(async () => Promise.reject(new Error('offline'))), importImage: vi.fn(async () => null) };

async function open() {
  const store = await Store.open(new MemoryAdapter());
  return { store, type: store.get('task_type', BUILTIN_TYPE_IDS.movie)! };
}

beforeEach(() => {
  setLocale('zh');
  resetDoubanSeasonsTried();
});

describe('选豆瓣单季', () => {
  it('库里有《星期三》剧集：不新建，豆瓣编号记到第 2 季，提示一句', async () => {
    const { store, type } = await open();
    const host = store.createLibraryItem(type.id, { name: '星期三', fields: { kind: '剧集', year: 2022, imdb: 'tt13443470', _source: 'tmdb:tv/119051', [SEASONS_KEY]: encodeSeasons('tv/119051', SEASONS) } });
    const before = store.libraryItems(type.id).length;
    const pick = createItemFromLookup(store, type, S2, noFetch);
    expect(pick).toMatchObject({ id: host.id, created: false, season: 2 });
    expect(store.libraryItems(type.id)).toHaveLength(before);
    expect(readDoubanSeasons(store.get('library_item', host.id)!.fields).ids).toEqual({ '2': '36208369' });
    expect(lookupPickToast(store, pick)?.message).toBe('豆瓣链接记到了「星期三」第 2 季');
  });
  it('库里没有这部剧：照旧新建一条', async () => {
    const { store, type } = await open();
    const pick = createItemFromLookup(store, type, S2, noFetch);
    expect(pick.created).toBe(true);
    expect(store.get('library_item', pick.id)!.name).toBe('星期三 第二季');
  });
});

describe('选 TMDB 剧集', () => {
  it('库里的豆瓣单季并进新建的剧集，任务改指剧集；提示能撤销', async () => {
    const { store, type } = await open();
    const s2 = createItemFromLookup(store, type, S2, noFetch).id;
    const task = store.createTask({ body_md: '看星期三', library_item_id: s2 });
    const pick = createItemFromLookup(store, type, TMDB, noFetch);
    expect(pick.created).toBe(true);
    expect(pick.absorbed?.merged).toBe(1);
    expect(store.get('library_item', s2)).toBeUndefined();
    expect(store.get('task', task.id)!.library_item_id).toBe(pick.id);
    expect(readDoubanSeasons(store.get('library_item', pick.id)!.fields).ids).toEqual({ '2': '36208369' });
    const note = lookupPickToast(store, pick)!;
    expect(note.message).toBe('豆瓣单季已并进「星期三」');
    note.undo!();
    expect(store.get('library_item', s2)!.name).toBe('星期三 第二季');
    expect(store.get('task', task.id)!.library_item_id).toBe(s2);
  });
});

describe('每季自动配豆瓣链接', () => {
  async function show() {
    const { store, type } = await open();
    const it1 = store.createLibraryItem(type.id, { name: '星期三', fields: { kind: '剧集', year: 2022, imdb: 'tt13443470', _source: 'tmdb:tv/119051', [SEASONS_KEY]: encodeSeasons('tv/119051', SEASONS) } });
    return { store, type, it1 };
  }
  it('按剧名搜一次就配上两季，不再逐季搜；再打开不搜', async () => {
    const { store, type, it1 } = await show();
    const search = vi.fn(async () => ok([S1, S2, db('20445130', '星期三', 2012, '电影', 'Woensdagen')]));
    expect(await refreshDoubanSeasons(store, type, it1.id, search)).toBe(true);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('星期三', undefined);
    expect(readDoubanSeasons(store.get('library_item', it1.id)!.fields)).toMatchObject({ ids: { '1': '35364243', '2': '36208369' }, tried: [1, 2] });
    resetDoubanSeasonsTried();
    expect(await refreshDoubanSeasons(store, type, it1.id, search)).toBe(false);
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('剧名搜不全：没配上的季按「剧名 第N季」再搜；配不上就记成搜过、不乱配', async () => {
    const { store, type, it1 } = await show();
    const search = vi.fn(async (q: string) => ok(q === '星期三 第二季' ? [{ ...S2, year: 2019 }] : [S1]));
    expect(await refreshDoubanSeasons(store, type, it1.id, search)).toBe(true);
    expect(search.mock.calls.map((c) => c[0])).toEqual(['星期三', '星期三 第二季']);
    expect(readDoubanSeasons(store.get('library_item', it1.id)!.fields)).toMatchObject({ ids: { '1': '35364243' }, tried: [1, 2] });
  });
  it('豆瓣拦了（不是 ok）：什么都不记，下次再来', async () => {
    const { store, type, it1 } = await show();
    const search = vi.fn(async () => ({ results: [], sources: [{ source: 'douban' as const, status: 'blocked' as const, code: 502 }] }));
    expect(await refreshDoubanSeasons(store, type, it1.id, search)).toBe(false);
    expect(store.get('library_item', it1.id)!.fields._douban_seasons).toBeUndefined();
  });
  it('手动刷新季（all）：没编号的季再搜一遍，已有的编号不丢（Rei 2026-11-22）', async () => {
    const { store, type, it1 } = await show();
    const first = vi.fn(async (q: string) => ok(q === '星期三' ? [S1] : []));
    expect(await refreshDoubanSeasons(store, type, it1.id, first)).toBe(true);
    expect(readDoubanSeasons(store.get('library_item', it1.id)!.fields)).toMatchObject({ ids: { '1': '35364243' }, tried: [1, 2] });
    // 平常再来不搜（30 天内搜过）；手动的不管，只搜第 2 季，第 1 季的编号留着
    resetDoubanSeasonsTried();
    const again = vi.fn(async () => ok([{ ...S1, sourceId: '99999999' }, S2]));
    expect(await refreshDoubanSeasons(store, type, it1.id, again)).toBe(false);
    expect(again).not.toHaveBeenCalled();
    expect(await refreshDoubanSeasons(store, type, it1.id, again, undefined, { all: true })).toBe(true);
    expect(again).toHaveBeenCalledTimes(1);
    expect(readDoubanSeasons(store.get('library_item', it1.id)!.fields).ids).toEqual({ '1': '35364243', '2': '36208369' });
    // 都有编号了：手动的也不搜
    expect(await refreshDoubanSeasons(store, type, it1.id, again, undefined, { all: true })).toBe(false);
    expect(again).toHaveBeenCalledTimes(1);
  });
  it('没有季数据、电影：不搜', async () => {
    const { store, type } = await open();
    const a = store.createLibraryItem(type.id, { name: '星期三', fields: { kind: '剧集', _source: 'tmdb:tv/119051' } });
    const m = store.createLibraryItem(type.id, { name: '沙丘2', fields: { kind: '电影', imdb: 'tt15239678' } });
    const search = vi.fn(async () => ok([]));
    expect(await refreshDoubanSeasons(store, type, a.id, search)).toBe(false);
    expect(await refreshDoubanSeasons(store, type, m.id, search)).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });
});
