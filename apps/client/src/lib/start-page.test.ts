import { describe, expect, it } from 'vitest';
import { hasPageInHash, lastPageHash, normalizeStartPage, START_PAGES, startHash } from './start-page';
import { parseHash } from './router';

describe('启动时打开', () => {
  it('认不出的值当我的一天', () => {
    expect(normalizeStartPage(undefined)).toBe('myday');
    expect(normalizeStartPage('graph')).toBe('myday');
    expect(normalizeStartPage('done')).toBe('done');
  });

  it('地址里有页面就不动（刷新、链接优先）', () => {
    expect(hasPageInHash('')).toBe(false);
    expect(hasPageInHash('#')).toBe(false);
    expect(hasPageInHash('#/')).toBe(false);
    expect(hasPageInHash('#/?task=1')).toBe(false);
    expect(hasPageInHash('#/checkin')).toBe(true);
    expect(startHash('#/checkin', 'done', null)).toBeNull();
    expect(startHash('#/task/abc', 'done', null)).toBeNull();
  });

  it('选了哪页就去哪页，每个选项都是一个真页面', () => {
    expect(startHash('', 'myday', null)).toBeNull();
    for (const p of START_PAGES) {
      if (p === 'myday' || p === 'last') continue;
      const h = startHash('', p, null)!;
      expect(h).toMatch(/^#\//);
      expect(parseHash(h).page).toBe(p);
    }
    expect(startHash('', 'agenda', null)).toBe('#/calendar');
    expect(startHash('#/', 'doable', null)).toBe('#/doable');
  });

  it('上次打开的页面', () => {
    expect(startHash('', 'last', null)).toBeNull();
    expect(startHash('', 'last', '#/groups/g1')).toBe('#/groups/g1');
    expect(startHash('', 'last', '#/library/movie/x?task=1')).toBe('#/library/movie/x');
    expect(startHash('', 'last', '#/myday')).toBeNull();
    expect(startHash('', 'last', '#/settings/about')).toBeNull();
  });

  it('记上次页面：去参数，设置、搜索、更多、做事的链接不记，日记不记哪天', () => {
    expect(lastPageHash('#/countdown?task=t1')).toBe('#/countdown');
    expect(lastPageHash('#/projects')).toBe('#/groups');
    expect(lastPageHash('#/journal/2026-11-01')).toBe('#/journal');
    expect(lastPageHash('#/settings/system')).toBeNull();
    expect(lastPageHash('#/search?q=x')).toBeNull();
    expect(lastPageHash('#/more')).toBeNull();
    expect(lastPageHash('#/task/abc')).toBeNull();
    expect(lastPageHash('#/new?text=hi')).toBeNull();
    expect(lastPageHash('')).toBeNull();
  });
});
