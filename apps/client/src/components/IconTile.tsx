/**
 * 图标块（Rei 2026-11-04「类型的图标也和项目图标一样，共用样式和图标」）：彩色圆角方块 + 白色 Lucide 图标。
 * 类型、资料库、项目凡是画图标的地方都用它，别再自己拼底色和图标。
 * - icon：Lucide 图标名，或老数据里的 emoji（照常显示，emoji 自己有颜色）。项目的 `lucide:名字` 先用 groupIconName 去掉前缀，或者直接用 GroupIcon。
 * - color：#rrggbb；空就用中性灰。色板见 core 的 icon-color.ts。
 * - size：方块边长（px），图标按比例缩：小块（≤ 16px）图标占得多一点，不然看不清。
 * 形状按皮肤：Apple 圆角方块、WinUI 小圆角、Material 圆形（skin/skins.css）。
 */
import type { CSSProperties } from 'react';
import { typeIcon } from '../lib/icons';

export function iconTileGlyphSize(size: number): number {
  return Math.max(8, Math.round(size * (size <= 16 ? 0.68 : 0.58)));
}

export function IconTile({ icon, color, size = 28, className }: { icon: string | null | undefined; color: string | null | undefined; size?: number; className?: string }) {
  const I = typeIcon(icon ?? undefined);
  return (
    <span
      className={`icon-tile${size <= 20 ? ' is-small' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--tile-color': color || undefined, '--tile-size': `${size}px` } as CSSProperties}
      aria-hidden
    >
      <I size={iconTileGlyphSize(size)} />
    </span>
  );
}
