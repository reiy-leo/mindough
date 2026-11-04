/**
 * 「图标和颜色」选择面板（Rei 2026-11-04 统一）：上面一排颜色，下面图标格子。
 * 类型页、资料库编辑器（TypeManager）、新建 / 编辑项目（ProjectSheet）、项目页左上角换图标（ProjectActions）都用它。
 * 颜色用 core 的 ICON_COLORS（18 个，按色相排），最后一格自己调；老数据里不在色板上的颜色照常显示，自己调那格是选中的。
 */
import type { CSSProperties } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { ICON_COLORS } from '@mindough/core';
import { IconPicker } from './IconPicker';
import { tr } from '../lib/i18n';

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const v = (value ?? '').toLowerCase();
  const custom = !ICON_COLORS.some((c) => c.hex === v);
  return (
    <div className="swatches" role="radiogroup" aria-label={tr('颜色')}>
      {ICON_COLORS.map((c) => (
        <RacButton key={c.id} className={`swatch${v === c.hex ? ' is-selected' : ''}`} style={{ '--swatch': c.hex } as CSSProperties} aria-label={c.hex} aria-pressed={v === c.hex} onPress={() => onChange(c.hex)} />
      ))}
      <label className={`swatch swatch-custom${custom ? ' is-selected' : ''}`} style={{ '--swatch': value } as CSSProperties} title={tr('自己调')}>
        <input type="color" aria-label={tr('自己调颜色')} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#4786ee'} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

/** 颜色 + 图标。color 是现在显示的颜色（没选过的项目传默认色），icon 是图标名（不带 lucide: 前缀）。 */
export function IconStylePicker({
  color,
  icon,
  onColor,
  onIcon,
  className,
}: {
  color: string;
  icon: string;
  onColor: (c: string) => void;
  onIcon: (icon: string) => void;
  className?: string;
}) {
  return (
    <div className={`icon-style${className ? ` ${className}` : ''}`}>
      <ColorPicker value={color} onChange={onColor} />
      <IconPicker value={icon} onChange={onIcon} />
    </div>
  );
}
