import { describe, expect, it } from 'vitest';
import { LIST_TILE, PINNED_TILE, listTileSize, pinnedTileSize } from './pinned-tile';
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
