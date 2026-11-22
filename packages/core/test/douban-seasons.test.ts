/**
 * 豆瓣单季并进剧集、每季的豆瓣 / IMDb 链接（Rei 2026-11-21）。数据照《星期三》（TMDB 119051，IMDb tt13443470）
 * 和豆瓣 2026-11-21 的搜索建议（第一季 35364243 / 2022，第二季 36208369 / 2025，第三季 36989893 / 2027，另有 2012 年的电影《星期三》20445130）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  chineseNumber,
  DOUBAN_SEASONS_KEY,
  doubanSeasonOfItem,
  doubanSeasonOfResult,
  doubanSeasonQuery,
  doubanSeasonsToSearch,
  encodeDoubanSeasons,
  isSeasonHost,
  matchDoubanSeasons,
  readDoubanSeasons,
  recordDoubanSearch,
  seasonHostOfItem,
  seasonHostOfResult,
  seasonItemsOf,
  seasonLinks,
  seasonOfName,
  withDoubanSeason,
} from '../src/douban-seasons';
import { encodeSeasons, SEASONS_KEY } from '../src/seasons';
import { findLookupTwin, type LookupResult } from '../src/lookup';
import { BUILTIN_TYPE_IDS } from '../src/seed/builtin-types';
import { MemoryAdapter } from '../src/storage/memory';
import { Store } from '../src/store';
import { setLocale } from '../src/i18n';

const movie = { id: BUILTIN_TYPE_IDS.movie };
const book = { id: BUILTIN_TYPE_IDS.book };
const NOW = new Date('2026-11-21T12:00:00Z');
const SEASONS = { tv: 'tv/119051', seasons: [{ number: 1, year: 2022, episodes: 8 }, { number: 2, year: 2025, episodes: 8 }] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type W = { id: string; type_id: string; name: string; deleted: boolean; fields: Record<string, any> };
const wed = (extra: Record<string, unknown> = {}): W => ({
  id: 'wed',
  type_id: movie.id,
  name: '星期三',
  deleted: false,
  fields: { kind: '剧集', year: 2022, imdb: 'tt13443470', _source: 'tmdb:tv/119051', [SEASONS_KEY]: encodeSeasons('tv/119051', SEASONS, NOW), ...extra },
});

const db = (id: string, name: string, year?: number, kind = '剧集', subtitle = 'Wednesday'): LookupResult => ({
  source: 'douban',
  sourceId: id,
  name,
  ...(year ? { year } : {}),
  subtitle,
  fields: { douban: id, kind, ...(year ? { year } : {}) },
  url: `https://movie.douban.com/subject/${id}/`,
});
const SUGGEST = [db('35364243', '星期三 第一季', 2022), db('36208369', '星期三 第二季', 2025), db('36989893', '星期三 第三季', 2027), db('20445130', '星期三', 2012, '电影', 'Woensdagen')];

beforeEach(() => setLocale('zh'));

describe('认出豆瓣单季', () => {
  it('名字里的季：中文数字、阿拉伯数字、英文都认；带集号、没有季的不算', () => {
    expect(seasonOfName('星期三 第二季')).toEqual({ base: '星期三', season: 2 });
    expect(seasonOfName('绝命毒师 第5季')).toEqual({ base: '绝命毒师', season: 5 });
    expect(seasonOfName('Wednesday Season 2')).toEqual({ base: 'Wednesday', season: 2 });
    expect(seasonOfName('星期三')).toBeNull();
    expect(seasonOfName('绝命毒师 S02E03')).toBeNull();
  });
  it('豆瓣结果：剧集、名字带季才算；电影、TMDB 的不算；原名去掉季标记当别名', () => {
    expect(doubanSeasonOfResult(SUGGEST[1]!)).toMatchObject({ doubanId: '36208369', season: 2, base: '星期三', alt: 'Wednesday', year: 2025 });
    expect(doubanSeasonOfResult(SUGGEST[3]!)).toBeNull();
    expect(doubanSeasonOfResult({ ...SUGGEST[1]!, source: 'tmdb', sourceId: 'tv/119051' })).toBeNull();
    expect(doubanSeasonOfResult({ ...SUGGEST[1]!, subtitle: 'Wednesday Season 2' })?.alt).toBe('Wednesday');
  });
  it('库里的资料：豆瓣来源或只填了豆瓣编号；TMDB 来源、别的库不算', () => {
    expect(doubanSeasonOfItem(movie, { name: '星期三 第二季', fields: { kind: '剧集', _source: 'douban:36208369' } })).toMatchObject({ doubanId: '36208369', season: 2 });
    expect(doubanSeasonOfItem(movie, { name: '星期三 第二季', fields: { douban: '36208369' } })).toMatchObject({ season: 2 });
    expect(doubanSeasonOfItem(movie, { name: '星期三 第二季', fields: { _source: 'tmdb:tv/119051', douban: '36208369' } })).toBeNull();
    expect(doubanSeasonOfItem(book, { name: '星期三 第二季', fields: { douban: '36208369' } })).toBeNull();
    expect(doubanSeasonOfItem(movie, { name: '星期三 第二季', fields: { kind: '剧集' } })).toBeNull();
  });
  it('整部剧：TMDB 剧集或带 IMDb 的剧集；豆瓣单季自己不算', () => {
    expect(isSeasonHost(movie, wed())).toBe(true);
    expect(isSeasonHost(movie, { name: '星期三', fields: { kind: '剧集', imdb: 'tt13443470' } })).toBe(true);
    expect(isSeasonHost(movie, { name: '星期三', fields: { kind: '剧集' } })).toBe(false);
    expect(isSeasonHost(movie, { name: '星期三 第一季', fields: { kind: '剧集', _source: 'douban:35364243', imdb: 'tt13443470' } })).toBe(false);
  });
});

describe('选豆瓣单季 → 库里的剧集', () => {
  it('同名、年份对得上：配到那一季', () => {
    expect(seasonHostOfResult([wed()], movie, SUGGEST[1]!)).toEqual({ id: 'wed', season: 2 });
    expect(seasonHostOfResult([wed()], movie, SUGGEST[0]!)).toEqual({ id: 'wed', season: 1 });
  });
  it('原名对得上也算（英文界面剧名是 Wednesday）', () => {
    expect(seasonHostOfResult([{ ...wed(), name: 'Wednesday' } as never], movie, SUGGEST[1]!)).toEqual({ id: 'wed', season: 2 });
  });
  it('年份对不上（差一年以上）不配；只有 IMDb 对上也算', () => {
    expect(seasonHostOfResult([wed()], movie, { ...SUGGEST[1]!, year: 2019 })).toBeNull();
    expect(seasonHostOfResult([{ ...wed(), name: '礼拜三' } as never], movie, { ...SUGGEST[1]!, fields: { ...SUGGEST[1]!.fields, imdb: 'tt13443470' } })).toEqual({ id: 'wed', season: 2 });
  });
  it('不知道这一季的年份：不比剧集早一年以上就行', () => {
    expect(seasonHostOfResult([wed()], movie, SUGGEST[2]!)).toEqual({ id: 'wed', season: 3 });
    expect(seasonHostOfResult([wed({ [SEASONS_KEY]: undefined })], movie, { ...SUGGEST[2]!, year: 2015 })).toBeNull();
  });
  it('两部同名同分的剧：不配', () => {
    const other = { ...wed(), id: 'wed2', fields: { ...wed().fields, imdb: 'tt0000001', _source: 'tmdb:tv/1' } };
    expect(seasonHostOfResult([wed(), other as never], movie, SUGGEST[1]!)).toBeNull();
  });
  it('已经记在剧上的编号：直接是那部', () => {
    const host = { ...wed(), name: '别的名字', fields: withDoubanSeason(wed().fields, 2, '36208369') };
    expect(seasonHostOfResult([host as never], movie, SUGGEST[1]!)).toEqual({ id: 'wed', season: 2 });
  });
  it('findLookupTwin：并进剧里的豆瓣单季认成那部剧（结果列表不再列）；没并的照旧不算', () => {
    const host = { ...wed(), fields: withDoubanSeason(wed().fields, 2, '36208369') };
    expect(findLookupTwin([host as never], movie.id, SUGGEST[1]!)).toBe('wed');
    expect(findLookupTwin([wed()], movie.id, SUGGEST[1]!)).toBeNull();
  });
});

describe('存每季的豆瓣编号', () => {
  it('记一季；同一个编号挪到新的季；坏数据当空的', () => {
    let f = withDoubanSeason({}, 2, '36208369');
    expect(readDoubanSeasons(f).ids).toEqual({ '2': '36208369' });
    f = withDoubanSeason(f, 3, '36208369');
    expect(readDoubanSeasons(f).ids).toEqual({ '3': '36208369' });
    expect(readDoubanSeasons({ [DOUBAN_SEASONS_KEY]: '{oops' }).ids).toEqual({});
    expect(readDoubanSeasons({ [DOUBAN_SEASONS_KEY]: JSON.stringify({ ids: { '1': 'x', '2': '36208369' }, tried: [1, 'a'], at: 'bad' }) })).toEqual({ v: 1, ids: { '2': '36208369' }, tried: [1], at: null });
    expect(encodeDoubanSeasons({ v: 1, ids: {}, tried: [], at: null })).toBeNull();
  });
  it('季的链接：豆瓣用记着的编号，IMDb 用剧集编号的分季列表；特别篇没有', () => {
    const it1 = { fields: withDoubanSeason(wed().fields as never, 2, '36208369') };
    expect(seasonLinks(it1, { number: 2 })).toEqual({ douban: 'https://movie.douban.com/subject/36208369/', imdb: 'https://www.imdb.com/title/tt13443470/episodes/?season=2' });
    expect(seasonLinks(it1, { number: 1 })).toEqual({ imdb: 'https://www.imdb.com/title/tt13443470/episodes/?season=1' });
    expect(seasonLinks(it1, { number: 0 })).toEqual({});
    expect(seasonLinks({ fields: {} }, { number: 1 })).toEqual({});
  });
});

describe('自动搜各季', () => {
  it('中文数字和搜的字', () => {
    expect([1, 2, 10, 12, 20, 35].map(chineseNumber)).toEqual(['一', '二', '十', '十二', '二十', '三十五']);
    expect(doubanSeasonQuery('星期三', 2)).toBe('星期三 第二季');
  });
  it('要搜的季：有年份、没编号；30 天内搜过的不再搜，新的季照搜', () => {
    expect(doubanSeasonsToSearch(movie, wed(), NOW.getTime())).toEqual([1, 2]);
    const f = recordDoubanSearch(wed().fields as never, [1, 2], { 1: '35364243' }, NOW);
    expect(doubanSeasonsToSearch(movie, { name: '星期三', fields: f }, NOW.getTime() + 1000)).toEqual([]);
    expect(doubanSeasonsToSearch(movie, { name: '星期三', fields: f }, NOW.getTime() + 31 * 24 * 3600 * 1000)).toEqual([2]);
    const more = { ...f, [SEASONS_KEY]: encodeSeasons('tv/119051', { tv: 'tv/119051', seasons: [...SEASONS.seasons, { number: 3, year: 2027, episodes: 8 }] }, NOW) };
    expect(doubanSeasonsToSearch(movie, { name: '星期三', fields: more }, NOW.getTime() + 1000)).toEqual([3]);
  });
  it('手动刷新季时：搜过的也再搜，有编号的不动（Rei 2026-11-22）', () => {
    const f = recordDoubanSearch(wed().fields as never, [1, 2], { 1: '35364243' }, NOW);
    expect(doubanSeasonsToSearch(movie, { name: '星期三', fields: f }, NOW.getTime() + 1000, true)).toEqual([2]);
  });
  it('从搜索结果配：名字、季号、年份都要对上；电影《星期三》（2012）、TMDB 没有的第三季不配', () => {
    expect(matchDoubanSeasons(wed(), SEASONS.seasons, [1, 2], SUGGEST)).toEqual({ 1: '35364243', 2: '36208369' });
    expect(matchDoubanSeasons(wed(), SEASONS.seasons, [2], SUGGEST)).toEqual({ 2: '36208369' });
  });
  it('年份差一年以上、名字不一样、同一季两个候选、已经用掉的编号：都不配', () => {
    expect(matchDoubanSeasons(wed(), SEASONS.seasons, [2], [{ ...SUGGEST[1]!, year: 2023 }])).toEqual({});
    expect(matchDoubanSeasons(wed(), SEASONS.seasons, [2], [{ ...SUGGEST[1]!, name: '周三 第二季', subtitle: 'Mercredi' }])).toEqual({});
    expect(matchDoubanSeasons(wed(), SEASONS.seasons, [2], [SUGGEST[1]!, { ...SUGGEST[1]!, sourceId: '99999999' }])).toEqual({});
    const used = { ...wed(), fields: withDoubanSeason(wed().fields, 1, '36208369') };
    expect(matchDoubanSeasons(used as never, SEASONS.seasons, [2], SUGGEST)).toEqual({});
    // 季没有年份（还没播）不配
    expect(matchDoubanSeasons(wed(), [{ number: 1, year: 2022 }, { number: 2 }], [2], SUGGEST)).toEqual({});
  });
  it('只有一季的剧：名字不写季、年份完全一样的算第 1 季', () => {
    const one = { name: '某剧', fields: { kind: '剧集', imdb: 'tt1', _source: 'tmdb:tv/9', [SEASONS_KEY]: encodeSeasons('tv/9', { tv: 'tv/9', seasons: [{ number: 1, year: 2020, episodes: 6 }] }, NOW) } };
    expect(matchDoubanSeasons(one, [{ number: 1, year: 2020 }], [1], [db('123456', '某剧', 2020, '剧集', '')])).toEqual({ 1: '123456' });
    expect(matchDoubanSeasons(one, [{ number: 1, year: 2020 }], [1], [db('123456', '某剧', 2021, '剧集', '')])).toEqual({});
  });
  it('记下搜过的：配上的不覆盖已有的，tried 30 天后清掉', () => {
    let f = recordDoubanSearch(withDoubanSeason({}, 1, '1111'), [1, 2], { 1: '35364243', 2: '36208369' }, NOW);
    expect(readDoubanSeasons(f)).toEqual({ v: 1, ids: { '1': '1111', '2': '36208369' }, tried: [1, 2], at: NOW.toISOString() });
    f = recordDoubanSearch(f, [3], {}, new Date(NOW.getTime() + 40 * 24 * 3600 * 1000));
    expect(readDoubanSeasons(f).tried).toEqual([3]);
  });
});

describe('先有豆瓣单季，再选 TMDB 剧集：并进来', () => {
  async function setup() {
    const store = await Store.open(new MemoryAdapter());
    const type = store.get('task_type', movie.id)!;
    const s2 = store.createLibraryItem(type.id, { name: '星期三 第二季', fields: { kind: '剧集', year: 2025, douban: '36208369', _source: 'douban:36208369', links: [{ label: '笔记', url: 'https://example.com/w2' }] }, note_md: '第二季更好看' });
    const s1 = store.createLibraryItem(type.id, { name: '星期三 第一季', fields: { kind: '剧集', year: 2022, douban: '35364243', _source: 'douban:35364243' } });
    const other = store.createLibraryItem(type.id, { name: '怪奇物语 第四季', fields: { kind: '剧集', year: 2022, douban: '27194292', _source: 'douban:27194292' } });
    const task = store.createTask({ body_md: '追星期三第二季', library_item_id: s2.id });
    const host = store.createLibraryItem(type.id, { name: '星期三', fields: { kind: '剧集', year: 2022, _source: 'tmdb:tv/119051' } });
    return { store, type, s1, s2, other, task, host };
  }
  it('seasonHostOfItem / seasonItemsOf 找到这部剧的单季', async () => {
    const { store, type, s1, s2, other, host } = await setup();
    const items = store.libraryItems(type.id);
    expect(seasonHostOfItem(items, type, s2)).toEqual({ id: host.id, season: 2, doubanId: '36208369' });
    expect(seasonHostOfItem(items, type, other)).toBeNull();
    expect(seasonItemsOf(items, type, host.id).map((x) => x.id).sort()).toEqual([s1.id, s2.id].sort());
  });
  it('absorbDoubanSeasons：单季打墓碑指向剧集，任务改指剧集，编号记到季上，链接和备注留下；能撤销', async () => {
    const { store, s1, s2, other, task, host } = await setup();
    const r = store.absorbDoubanSeasons(host.id)!;
    expect(r.merged).toBe(2);
    const h = store.get('library_item', host.id)!;
    expect(readDoubanSeasons(h.fields).ids).toEqual({ '1': '35364243', '2': '36208369' });
    expect(h.name).toBe('星期三');
    expect(h.fields._source).toBe('tmdb:tv/119051');
    expect(h.fields.douban).toBeUndefined();
    expect(h.fields.links).toEqual([{ label: '笔记', url: 'https://example.com/w2' }]);
    expect(h.note_md).toBe('第二季更好看');
    expect(store.get('library_item', s2.id)).toBeUndefined();
    expect(store.resolveItemId(s2.id)).toBe(host.id);
    expect(store.get('task', task.id)!.library_item_id).toBe(host.id);
    expect(store.get('library_item', other.id)!.deleted).toBe(false);
    expect(store.absorbDoubanSeasons(host.id)).toBeNull();
    store.undoMerge(r.undo);
    expect(store.get('library_item', s2.id)!.deleted).toBe(false);
    expect(store.get('task', task.id)!.library_item_id).toBe(s2.id);
    expect(store.get('library_item', host.id)!.fields[DOUBAN_SEASONS_KEY]).toBeUndefined();
  });
  it('「可能重复」认出剧集和豆瓣单季，剧集排第一个', async () => {
    const { store, type, s1, s2, host } = await setup();
    const g = store.duplicateGroups(type.id);
    expect(g).toHaveLength(1);
    expect(g[0]!.ids[0]).toBe(host.id);
    expect(new Set(g[0]!.ids)).toEqual(new Set([host.id, s1.id, s2.id]));
    expect(g[0]!.reason).toContain('豆瓣单季');
  });
  it('手动「合并到…」剧集：单季按季并进去，不拿它的名字和豆瓣编号', async () => {
    const { store, s2, host } = await setup();
    store.mergeLibraryItems(host.id, [s2.id]);
    const h = store.get('library_item', host.id)!;
    expect(h.name).toBe('星期三');
    expect(h.fields.douban).toBeUndefined();
    expect(readDoubanSeasons(h.fields).ids).toEqual({ '2': '36208369' });
  });
  it('两部剧合并：各季编号合起来，留下的那部优先', async () => {
    const store = await Store.open(new MemoryAdapter());
    const type = store.get('task_type', movie.id)!;
    const a = store.createLibraryItem(type.id, { name: '星期三', fields: { kind: '剧集', _source: 'tmdb:tv/119051', [DOUBAN_SEASONS_KEY]: encodeDoubanSeasons({ v: 1, ids: { '1': '35364243' }, tried: [], at: null })! } });
    const b = store.createLibraryItem(type.id, { name: 'Wednesday', fields: { kind: '剧集', imdb: 'tt13443470', [DOUBAN_SEASONS_KEY]: encodeDoubanSeasons({ v: 1, ids: { '1': '99999', '2': '36208369' }, tried: [], at: null })! } });
    store.mergeLibraryItems(a.id, [b.id]);
    expect(readDoubanSeasons(store.get('library_item', a.id)!.fields).ids).toEqual({ '1': '35364243', '2': '36208369' });
  });
});
