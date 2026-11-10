/**
 * 剧集的季（Rei 2026-11-11「影视库里的剧集显示 seasons」）。
 */
import { describe, expect, it } from 'vitest';
import { encodeSeasons, isShowItem, needsSeasonsFetch, readSeasons, seasonMeta, seasonPosterUrl, seasonsOf, seasonsRef, seasonSubtitle, seasonTitle, SEASONS_KEY, SEASONS_MAX_AGE_MS, sortSeasons } from '../src/seasons';
import { BUILTIN_TYPE_IDS } from '../src/seed/builtin-types';
import { setLocale } from '../src/i18n';

const movie = { id: BUILTIN_TYPE_IDS.movie };
const book = { id: BUILTIN_TYPE_IDS.book };
const item = (fields: Record<string, unknown>) => ({ fields }) as never;
const RES = {
  tv: 'tv/1399',
  seasons: [
    { number: 0, name: '特别篇', year: 2010, episodes: 14, poster: '/s0.jpg' },
    { number: 2, name: '第 2 季', year: 2012, episodes: 10 },
    { number: 1, name: '第 1 季', year: 2011, episodes: 10, poster: '/s1.jpg' },
  ],
};

describe('哪些资料算剧集', () => {
  it('影视库里选了剧集，或者没选但来源是 TMDB 剧集；电影、别的库不算', () => {
    expect(isShowItem(movie, item({ kind: '剧集' }))).toBe(true);
    expect(isShowItem(movie, item({ _source: 'tmdb:tv/1399' }))).toBe(true);
    expect(isShowItem(movie, item({ kind: '电影', _source: 'tmdb:tv/1399' }))).toBe(false);
    expect(isShowItem(movie, item({ _source: 'tmdb:movie/550' }))).toBe(false);
    expect(isShowItem(movie, item({}))).toBe(false);
    expect(isShowItem(book, item({ kind: '剧集' }))).toBe(false);
  });
  it('拉季用的编号：TMDB 剧集编号优先，其次 IMDb；只有豆瓣的没有', () => {
    expect(seasonsRef(movie, item({ _source: 'tmdb:tv/1399', imdb: 'tt0944947' }))).toBe('tv/1399');
    expect(seasonsRef(movie, item({ kind: '剧集', _source: 'douban:3016187', imdb: 'TT0944947' }))).toBe('tt0944947');
    expect(seasonsRef(movie, item({ kind: '剧集', _source: 'douban:3016187' }))).toBeNull();
    expect(seasonsRef(movie, item({ kind: '电影', imdb: 'tt1375666' }))).toBeNull();
  });
});

describe('存和读', () => {
  const now = new Date('2026-11-11T00:00:00Z');
  const stored = (ref = 'tv/1399', at = now) => ({ _source: 'tmdb:tv/1399', [SEASONS_KEY]: encodeSeasons(ref, RES, at) });

  it('写成 JSON 文字，读回来一样；坏的当没有', () => {
    const r = readSeasons(stored());
    expect(r).toMatchObject({ v: 1, ref: 'tv/1399', tv: 'tv/1399', at: now.toISOString() });
    expect(r!.seasons).toHaveLength(3);
    expect(readSeasons({ [SEASONS_KEY]: '{oops' })).toBeNull();
    expect(readSeasons({ [SEASONS_KEY]: '{"v":2}' })).toBeNull();
    expect(readSeasons({})).toBeNull();
  });
  it('不收奇怪的海报路径和负数季', () => {
    const raw = encodeSeasons('tv/1', { tv: 'tv/1', seasons: [{ number: -1, episodes: 1 }, { number: 1, episodes: 3, poster: 'https://x/a.jpg' }] as never });
    expect(readSeasons({ [SEASONS_KEY]: raw })!.seasons).toEqual([{ number: 1, episodes: 3 }]);
  });
  it('没存过、来源换了、超过 30 天才重拉', () => {
    const t = now.getTime();
    expect(needsSeasonsFetch(movie, item({ _source: 'tmdb:tv/1399' }), t)).toBe('tv/1399');
    expect(needsSeasonsFetch(movie, item(stored()), t + 1000)).toBeNull();
    expect(needsSeasonsFetch(movie, item(stored()), t + SEASONS_MAX_AGE_MS + 1)).toBe('tv/1399');
    expect(needsSeasonsFetch(movie, item({ ...stored(), _source: 'tmdb:tv/42' }), t)).toBe('tv/42');
    expect(needsSeasonsFetch(movie, item({ ...stored(), kind: '电影' }), t)).toBeNull();
  });
  it('来源换了还没重拉：不显示旧的季', () => {
    expect(seasonsOf(movie, item({ ...stored(), _source: 'tmdb:tv/42' }))).toEqual([]);
    expect(seasonsOf(movie, item(stored())).map((s) => s.number)).toEqual([1, 2, 0]);
  });
});

describe('显示', () => {
  it('特别篇放最后', () => {
    expect(sortSeasons(RES.seasons).map((s) => s.number)).toEqual([1, 2, 0]);
  });
  it('中文：第 N 季 / 特别篇，年份 · 集数；默认季名不另外显示', () => {
    setLocale('zh');
    expect(seasonTitle({ number: 3 })).toBe('第 3 季');
    expect(seasonTitle({ number: 0 })).toBe('特别篇');
    expect(seasonMeta({ year: 2011, episodes: 10 })).toBe('2011 · 10 集');
    expect(seasonMeta({ episodes: 0 })).toBe('');
    expect(seasonSubtitle({ number: 1, name: '第 1 季' })).toBeNull();
    expect(seasonSubtitle({ number: 1, name: '第一季' })).toBeNull();
    expect(seasonSubtitle({ number: 1, name: 'Season 1' })).toBeNull();
    expect(seasonSubtitle({ number: 1, name: '水之书' })).toBe('水之书');
  });
  it('英文：Season N / Specials，单复数', () => {
    setLocale('en');
    expect(seasonTitle({ number: 2 })).toBe('Season 2');
    expect(seasonTitle({ number: 0 })).toBe('Specials');
    expect(seasonMeta({ year: 2011, episodes: 1 })).toBe('2011 · 1 episode');
    expect(seasonMeta({ episodes: 8 })).toBe('8 episodes');
    setLocale('zh');
  });
  it('海报小图走 TMDB w154', () => {
    expect(seasonPosterUrl('/s1.jpg')).toBe('https://image.tmdb.org/t/p/w154/s1.jpg');
    expect(seasonPosterUrl(undefined)).toBeNull();
  });
});
