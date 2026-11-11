import { describe, expect, it } from 'vitest';
import { LIST_TILE, PINNED_LINE_ICON, PINNED_TILE, listTileSize, pinnedGroupIconSize, pinnedTileSize } from './pinned-tile';
import { iconTileGlyphSize } from '../components/IconTile';

describe('图标模式的图标块边长（Rei 2026-11-12，类型页对齐侧栏）', () => {
  it('电脑 22、手机 32', () => {
    expect(pinnedTileSize(false)).toBe(22);
    expect(pinnedTileSize(true)).toBe(32);
  });
  it('字形跟着边长：电脑 13、手机 19', () => {
    expect(iconTileGlyphSize(PINNED_TILE.desktop)).toBe(13);
    expect(iconTileGlyphSize(PINNED_TILE.mobile)).toBe(19);
  });
});

describe('类型页列表行的图标块边长（Rei 2026-11-12 06:54「列表模式图标还是很大」）', () => {
  it('电脑 20、手机 24，都比原来的 28 小', () => {
    expect(listTileSize(false)).toBe(20);
    expect(listTileSize(true)).toBe(24);
  });
  it('字形：电脑 12、手机 14', () => {
    expect(iconTileGlyphSize(LIST_TILE.desktop)).toBe(12);
    expect(iconTileGlyphSize(LIST_TILE.mobile)).toBe(14);
  });
});

describe('侧栏放进来的项目图标（Rei 2026-11-12 07:40「素净模式…统一成资料库图标大小」）', () => {
  it('素净档和资料库线条图标一样大：电脑 20、手机 24', () => {
    expect(pinnedGroupIconSize(false, true)).toBe(PINNED_LINE_ICON.desktop);
    expect(pinnedGroupIconSize(true, true)).toBe(PINNED_LINE_ICON.mobile);
    expect(PINNED_LINE_ICON).toEqual({ desktop: 20, mobile: 24 });
  });
  it('标准、多彩档照旧是彩色块 22 / 32', () => {
    expect(pinnedGroupIconSize(false, false)).toBe(22);
    expect(pinnedGroupIconSize(true, false)).toBe(32);
  });
});
