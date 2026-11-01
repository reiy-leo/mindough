import { groupIconName } from '@mindough/core';
import { typeIcon } from '../../lib/icons';

/**
 * 项目图标（Rei 2026-11-01「项目的图标、名称要可以编辑」）：group.icon 是 emoji 或 `lucide:名字`，
 * 两种都画成同样大小的图标。凡是显示项目图标的地方都用它，别直接把 group.icon 当文字放上去
 * （不然 lucide 图标会显示成「lucide:briefcase」）。
 */
export function GroupIcon({ icon, size = 16, className }: { icon: string | null | undefined; size?: number; className?: string }) {
  const I = typeIcon(groupIconName(icon));
  return (
    <span className={`group-glyph${className ? ` ${className}` : ''}`} aria-hidden>
      <I size={size} />
    </span>
  );
}
