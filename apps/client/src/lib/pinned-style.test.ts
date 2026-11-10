import { describe, expect, it } from 'vitest';
import { normalizePinnedStyle, pinnedGroupGrid } from './pinned-style';

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
