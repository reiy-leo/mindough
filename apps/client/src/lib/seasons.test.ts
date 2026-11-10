/**
 * 剧集的季：资料页打开时缺季数据才补拉一次（Rei 2026-11-11）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_TYPE_IDS, MemoryAdapter, readSeasons, SEASONS_KEY, seasonsOf, Store } from '@mindough/core';
import { refreshSeasons, resetSeasonsTried } from './seasons';

const RES = { tv: 'tv/1399', seasons: [{ number: 1, year: 2011, episodes: 10, poster: '/s1.jpg' }, { number: 0, episodes: 3 }] };

beforeEach(() => resetSeasonsTried());

describe('剧集的季（客户端）', () => {
  it('缺季数据：拉一次写进资料，再打开不拉', async () => {
    const store = await Store.open(new MemoryAdapter());
    const type = store.get('task_type', BUILTIN_TYPE_IDS.movie)!;
    const it1 = store.createLibraryItem(type.id, { name: '权力的游戏', fields: { kind: '剧集', _source: 'tmdb:tv/1399' } });
    const fetcher = vi.fn(async () => RES);
    expect(await refreshSeasons(store, type, it1.id, fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('tv/1399', undefined);
    const cur = store.get('library_item', it1.id)!;
    expect(readSeasons(cur.fields)?.ref).toBe('tv/1399');
    expect(seasonsOf(type, cur).map((s) => s.number)).toEqual([1, 0]);
    expect(cur.fields.kind).toBe('剧集');
    resetSeasonsTried();
    expect(await refreshSeasons(store, type, it1.id, fetcher)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('电影、只有豆瓣编号的剧集不拉', async () => {
    const store = await Store.open(new MemoryAdapter());
    const type = store.get('task_type', BUILTIN_TYPE_IDS.movie)!;
    const fetcher = vi.fn(async () => RES);
    const m = store.createLibraryItem(type.id, { name: '盗梦空间', fields: { kind: '电影', imdb: 'tt1375666' } });
    const d = store.createLibraryItem(type.id, { name: '某剧', fields: { kind: '剧集', _source: 'douban:1' } });
    expect(await refreshSeasons(store, type, m.id, fetcher)).toBe(false);
    expect(await refreshSeasons(store, type, d.id, fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('拉不到：不写，这次会话不再试；页面关掉取消的下次还会拉', async () => {
    const store = await Store.open(new MemoryAdapter());
    const type = store.get('task_type', BUILTIN_TYPE_IDS.movie)!;
    const it1 = store.createLibraryItem(type.id, { name: '绝命毒师', fields: { kind: '剧集', imdb: 'tt0903747' } });
    const fail = vi.fn(async () => {
      throw new Error('503');
    });
    expect(await refreshSeasons(store, type, it1.id, fail)).toBe(false);
    expect(store.get('library_item', it1.id)!.fields[SEASONS_KEY]).toBeUndefined();
    expect(await refreshSeasons(store, type, it1.id, fail)).toBe(false);
    expect(fail).toHaveBeenCalledTimes(1);

    const it2 = store.createLibraryItem(type.id, { name: '风骚律师', fields: { kind: '剧集', imdb: 'tt3032476' } });
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await refreshSeasons(store, type, it2.id, fail, ctrl.signal)).toBe(false);
    const ok = vi.fn(async () => RES);
    expect(await refreshSeasons(store, type, it2.id, ok)).toBe(true);
  });

  it('拉的时候来源换了：不写旧的', async () => {
    const store = await Store.open(new MemoryAdapter());
    const type = store.get('task_type', BUILTIN_TYPE_IDS.movie)!;
    const it1 = store.createLibraryItem(type.id, { name: 'X', fields: { kind: '剧集', _source: 'tmdb:tv/1' } });
    const fetcher = vi.fn(async () => {
      store.updateLibraryItem(it1.id, { fields: { kind: '剧集', _source: 'tmdb:tv/2' } });
      return RES;
    });
    expect(await refreshSeasons(store, type, it1.id, fetcher)).toBe(false);
    expect(store.get('library_item', it1.id)!.fields[SEASONS_KEY]).toBeUndefined();
  });
});
