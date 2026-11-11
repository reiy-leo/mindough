import { describe, expect, it } from 'vitest';
import { normalizePinnedStyle, pinnedGrid, pinnedGroupGrid } from './pinned-style';

describe('侧栏项目显示为列表 / 图标（Rei 2026-11-11）', () => {
  it('默认列表，认不出的值也当列表', () => {
    expect(normalizePinnedStyle(undefined)).toBe('list');
    expect(normalizePinnedStyle('grid')).toBe('list');
    expect(normalizePinnedStyle('icons')).toBe('icons');
  });
  it('只有选了图标、且不是中等宽度的图标栏才排成网格', () => {
    expect(pinnedGroupGrid({ pinnedGroupStyle: 'icons' }, false)).toBe(true);
    expect(pinnedGroupGrid({ pinnedGroupStyle: 'icons' }, true)).toBe(false);
    expect(pinnedGroupGrid({ pinnedGroupStyle: 'list' }, false)).toBe(false);
  });
});

describe('侧栏资料库显示为列表 / 图标（Rei 2026-11-12）', () => {
  it('资料库和项目各看各的设置', () => {
    expect(pinnedGrid({ pinnedGroupStyle: 'icons' }, 'library', false)).toBe(false);
    expect(pinnedGrid({ pinnedLibraryStyle: 'icons' }, 'library', false)).toBe(true);
    expect(pinnedGrid({ pinnedLibraryStyle: 'icons' }, 'group', false)).toBe(false);
    expect(pinnedGrid({ pinnedLibraryStyle: 'icons', pinnedGroupStyle: 'list' }, 'library', true)).toBe(false);
  });
  it('没存过就是列表', () => {
    expect(pinnedGrid({}, 'library', false)).toBe(false);
  });
});
