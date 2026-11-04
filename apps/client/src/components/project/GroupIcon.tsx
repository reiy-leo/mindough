import { groupColor, groupIconName, type Group } from '@mindough/core';
import { IconTile } from '../IconTile';

/**
 * 项目图标（Rei 2026-11-01「项目的图标、名称要可以编辑」；2026-11-04 起和类型一样画成彩色方块，见 IconTile）。
 * group.icon 是 emoji 或 `lucide:名字`，这里去掉前缀；颜色用 group.color，没选过按 id 挑（core 的 groupColor）。
 * 凡是显示项目图标的地方都用它，别直接把 group.icon 当文字放上去（不然 lucide 图标会显示成「lucide:briefcase」）。
 */
export function GroupIcon({ group, size = 18, className }: { group: Pick<Group, 'icon'> & { id?: string; color?: string | null }; size?: number; className?: string }) {
  return <IconTile icon={groupIconName(group.icon)} color={groupColor(group)} size={size} {...(className ? { className } : {})} />;
}
