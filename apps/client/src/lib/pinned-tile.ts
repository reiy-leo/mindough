/**
 * 「显示为：图标」时彩色图标块（IconTile）的边长，各处共用，别再各写各的（Rei 2026-11-12「类型页图标比侧栏大太多」）。
 * - 电脑：侧栏放进来的项目排成图标时，格子 36×36（CSS 变量 --pinned-cell），里面的图标块 22。
 * - 手机：「更多」页放进来的项目排成图标时，格子 44×44（--pinned-cell-touch），里面的图标块 32。
 * 类型页「显示为：图标」的格子用同端的图标块边长（电脑对齐侧栏、手机对齐「更多」页），名字放在图标下面。
 * 图标字形大小由 IconTile 按边长算（iconTileGlyphSize），边长一样字形就一样。
 * 资料库放进侧栏时不画图标块，只画线条图标（20 / 24），不在这里。
 */
export const PINNED_TILE = { desktop: 22, mobile: 32 } as const;

/** 这一端图标模式的图标块边长。 */
export function pinnedTileSize(mobile: boolean): number {
  return mobile ? PINNED_TILE.mobile : PINNED_TILE.desktop;
}

/**
 * 类型页「显示为：列表」每行行首的图标块边长（Rei 2026-11-12 06:54「类型页列表模式图标还是很大」，原来 28 / 字形 16）。
 * 和侧栏项目行（18）、「更多」页项目行（20）一个量级：电脑 20（字形 12），手机 24（字形 14，略大好认好点）。
 * 搜索结果行、「新建“xxx”」那行的加号块同样大；网格模式照旧用上面的 PINNED_TILE。
 */
export const LIST_TILE = { desktop: 20, mobile: 24 } as const;

/** 这一端类型列表行的图标块边长。 */
export function listTileSize(mobile: boolean): number {
  return mobile ? LIST_TILE.mobile : LIST_TILE.desktop;
}
