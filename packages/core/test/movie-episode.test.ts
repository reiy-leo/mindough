/**
 * 电影不显示「看到哪」（Rei 2026-11-08「任务属性 资料 影视：电影不显示看到哪」）。
 */
import { describe, expect, it } from 'vitest';
import { isMovieItem, taskFieldsFor, taskFieldsOf } from '../src/library';
import { BUILTIN_TASK_TYPES, BUILTIN_TYPE_IDS } from '../src/seed/builtin-types';

const movieType = BUILTIN_TASK_TYPES.find((t) => t.id === BUILTIN_TYPE_IDS.movie)!;
const item = (fields: Record<string, unknown>) => ({ fields }) as never;
const keys = (fs: { kind: string }[]) => fs.map((f) => f.kind);

describe('电影不显示看到哪', () => {
  it('影视库本来有「看到哪」', () => {
    expect(keys(taskFieldsOf(movieType))).toContain('episode');
  });
  it('电影/剧集 选了电影：不显示；剧集照常', () => {
    expect(keys(taskFieldsFor(movieType, [item({ kind: '电影' })]))).not.toContain('episode');
    expect(keys(taskFieldsFor(movieType, [item({ kind: '剧集' })]))).toContain('episode');
  });
  it('没选就看来源：TMDB movie/… 是电影，tv/… 是剧集；豆瓣、没来源的照常显示', () => {
    expect(isMovieItem(item({ _source: 'tmdb:movie/550' }))).toBe(true);
    expect(isMovieItem(item({ _source: 'tmdb:tv/1399' }))).toBe(false);
    expect(isMovieItem(item({ _source: 'douban:1292052' }))).toBe(false);
    expect(isMovieItem(item({}))).toBe(false);
    expect(isMovieItem(null)).toBe(false);
    // 自己选的「剧集」优先于来源
    expect(isMovieItem(item({ kind: '剧集', _source: 'tmdb:movie/550' }))).toBe(false);
  });
  it('挂了几部：都是电影才藏；有一部剧集就显示；没挂资料照常', () => {
    expect(keys(taskFieldsFor(movieType, [item({ kind: '电影' }), item({ _source: 'tmdb:movie/1' })]))).not.toContain('episode');
    expect(keys(taskFieldsFor(movieType, [item({ kind: '电影' }), item({ kind: '剧集' })]))).toContain('episode');
    expect(keys(taskFieldsFor(movieType, []))).toContain('episode');
  });
  it('别的任务字段不受影响', () => {
    const all = taskFieldsOf(movieType).filter((f) => f.kind !== 'episode').map((f) => f.key);
    expect(taskFieldsFor(movieType, [item({ kind: '电影' })]).map((f) => f.key)).toEqual(all);
  });
});
