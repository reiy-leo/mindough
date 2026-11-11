import { describe, expect, it } from 'vitest';
import { PINNED_TILE, pinnedTileSize } from './pinned-tile';
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
