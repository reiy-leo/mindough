/**
 * 剧集的季：资料页打开时缺季数据才补拉一次（Rei 2026-11-11）；标题旁的刷新按钮整份重拉（Rei 2026-11-22）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_TYPE_IDS, encodeSeasons, MemoryAdapter, readSeasons, SEASONS_KEY, seasonsOf, setLocale, Store, type SeasonsResponse } from '@mindough/core';
import { refreshSeasons, refreshSeasonsNow, resetSeasonsTried, seasonsBusy, seasonsRefreshMessage } from './seasons';
import { LookupHttpError } from './lookup';

const RES: SeasonsResponse = { tv: 'tv/1399', seasons: [{ number: 1, year: 2011, episodes: 10, poster: '/s1.jpg' }, { number: 0, episodes: 3 }] };

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

  it('存了很久也不自动重拉（去掉了 30 天重拉）', async () => {
    const store = await Store.open(new MemoryAdapter());
    const type = store.get('task_type', BUILTIN_TYPE_IDS.movie)!;
    const old = encodeSeasons('tv/1399', RES, new Date('2024-01-01T00:00:00Z'));
    const it1 = store.createLibraryItem(type.id, { name: '权力的游戏', fields: { kind: '剧集', _source: 'tmdb:tv/1399', [SEASONS_KEY]: old } });
    const fetcher = vi.fn(async () => RES);
    expect(await refreshSeasons(store, type, it1.id, fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('手动刷新季（Rei 2026-11-22）', () => {
  const MORE: SeasonsResponse = { tv: 'tv/1399', seasons: [...RES.seasons, { number: 2, year: 2012, episodes: 10 }] };
  async function show(fields: Record<string, string> = {}) {
    const store = await Store.open(new MemoryAdapter());
    const type = store.get('task_type', BUILTIN_TYPE_IDS.movie)!;
    const it1 = store.createLibraryItem(type.id, { name: '权力的游戏', fields: { kind: '剧集', _source: 'tmdb:tv/1399', [SEASONS_KEY]: encodeSeasons('tv/1399', RES), ...fields } });
    return { store, type, it1 };
  }
  const opts = (fetcher: (ref: string) => Promise<SeasonsResponse>) => ({ fetcher, searchDouban: null, check: () => 'ok' as const });

  it('TMDB 补了一季：整份重拉写回，拉的时候算正在拉；没变就不写', async () => {
    const { store, type, it1 } = await show();
    let during = false;
    const fetcher = vi.fn(async () => {
      during = seasonsBusy(it1.id);
      return MORE;
    });
    expect(await refreshSeasonsNow(store, type, it1.id, opts(fetcher))).toEqual({ ok: true, changed: true });
    expect(during).toBe(true);
    expect(seasonsBusy(it1.id)).toBe(false);
    expect(fetcher).toHaveBeenCalledWith('tv/1399', undefined);
    expect(seasonsOf(type, store.get('library_item', it1.id)!).map((s) => s.number)).toEqual([1, 2, 0]);
    const before = store.get('library_item', it1.id)!.fields[SEASONS_KEY];
    expect(await refreshSeasonsNow(store, type, it1.id, opts(async () => MORE))).toEqual({ ok: true, changed: false });
    expect(store.get('library_item', it1.id)!.fields[SEASONS_KEY]).toBe(before);
  });

  it('拉过但一季都没有：也能刷新', async () => {
    const { store, type, it1 } = await show({ [SEASONS_KEY]: encodeSeasons('tv/1399', { tv: 'tv/1399', seasons: [] }) });
    expect(await refreshSeasonsNow(store, type, it1.id, opts(async () => RES))).toEqual({ ok: true, changed: true });
    expect(seasonsOf(type, store.get('library_item', it1.id)!)).toHaveLength(2);
  });

  it('失败不动旧的：HTTP 错误带状态码，网络错误、离线、没登录分开说', async () => {
    setLocale('zh');
    const { store, type, it1 } = await show();
    const before = store.get('library_item', it1.id)!.fields[SEASONS_KEY];
    const r502 = await refreshSeasonsNow(store, type, it1.id, opts(async () => Promise.reject(new LookupHttpError(502, 'bad gateway'))));
    expect(r502).toEqual({ ok: false, reason: 'http', status: 502 });
    expect(seasonsRefreshMessage(r502)).toEqual({ tone: 'error', message: '季没刷新：502 网关错误' });
    expect(seasonsRefreshMessage({ ok: false, reason: 'http', status: 418 })!.message).toBe('季没刷新：418');
    const net = await refreshSeasonsNow(store, type, it1.id, opts(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(seasonsRefreshMessage(net)!.message).toBe('季没刷新：没连上服务器');
    expect(store.get('library_item', it1.id)!.fields[SEASONS_KEY]).toBe(before);
    const never = vi.fn(async () => RES);
    expect(await refreshSeasonsNow(store, type, it1.id, { fetcher: never, searchDouban: null, check: () => 'offline' })).toEqual({ ok: false, reason: 'offline' });
    expect(await refreshSeasonsNow(store, type, it1.id, { fetcher: never, searchDouban: null, check: () => 'signed_out' })).toEqual({ ok: false, reason: 'signed_out' });
    expect(never).not.toHaveBeenCalled();
    expect(seasonsRefreshMessage({ ok: false, reason: 'offline' })!.message).toBe('现在没联网，联网后才能刷新季');
    expect(seasonsRefreshMessage({ ok: true, changed: false })).toEqual({ message: '季已经是最新的' });
    expect(seasonsRefreshMessage({ ok: false, reason: 'aborted' })).toBeNull();
  });

  it('正在拉时再点不重复拉；拉的时候来源换了不写', async () => {
    const { store, type, it1 } = await show();
    let release!: () => void;
    const slow = vi.fn(() => new Promise<SeasonsResponse>((r) => (release = () => r(MORE))));
    const p = refreshSeasonsNow(store, type, it1.id, opts(slow));
    expect(await refreshSeasonsNow(store, type, it1.id, opts(slow))).toEqual({ ok: false, reason: 'busy' });
    store.updateLibraryItem(it1.id, { fields: { ...store.get('library_item', it1.id)!.fields, _source: 'tmdb:tv/42' } });
    release();
    expect(await p).toEqual({ ok: false, reason: 'gone' });
    expect(slow).toHaveBeenCalledTimes(1);
  });
});
