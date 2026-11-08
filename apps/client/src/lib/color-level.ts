/**
 * 色彩三档（Rei 2026-11-09「设置 → 外观 → 色彩」）：素净 / 标准 / 多彩，默认标准，只存本机。
 * - 素净 plain：只有黑白灰。大部分靠 styles/color-level.css 把强调色、状态色、心情色、类型 / 项目色换成灰；
 *   用 JS 算颜色的地方（倒数日卡片、心情河流）在这里判断。
 * - 标准 standard：和以前一样。
 * - 多彩 vivid：项目 / 类型颜色铺得更开（任务行项目名、分区标题、宽屏项目页淡底、看板 / 时间轴顶边、详情栏顶部、打卡进度环）。
 */
import { useLayoutEffect, type CSSProperties } from 'react';
import { groupColor, normalizeIconColor, type Store } from '@mindough/core';
import { normalizeColorLevel, useSettings, type ColorLevel } from './settings';
import { readableTint, type ChipTheme } from './chip-colors';

export function useColorLevel(): ColorLevel {
  const { settings } = useSettings();
  return normalizeColorLevel(settings.colorLevel);
}

/** 多彩档才给字上色：返回能读的字色（≥ 4.5:1），别的档返回 undefined（照原样）。 */
export function vividText(level: ColorLevel, color: string | null | undefined, theme: ChipTheme): string | undefined {
  if (level !== 'vivid') return undefined;
  return readableTint(color, theme) ?? undefined;
}

/** 多彩档在元素上挂一个颜色变量（--vivid-color），样式在 color-level.css 里按需取；别的档不挂。 */
export function vividVar(level: ColorLevel, color: string | null | undefined, name = '--vivid-color'): CSSProperties | undefined {
  if (level !== 'vivid' || !color) return undefined;
  return { [name]: color } as CSSProperties;
}

/**
 * 多彩档：详情栏顶部铺一条淡色（项目色，没有项目用类型色；纯文字类型不算）。
 * 颜色挂在 <html> 的 --detail-tint 上：右列、手机整页、看板浮层（挂在 body 下）都继承得到，详情组件本身不用改。样式在 color-level.css。
 */
export function useDetailTint(store: Store, editingId: string | null | undefined): void {
  const level = useColorLevel();
  const task = editingId ? store.get('task', editingId) : undefined;
  const group = task?.group_id ? store.get('group', task.group_id) : undefined;
  const type = task ? store.get('task_type', task.type_id) : undefined;
  const tint = level !== 'vivid' || !task ? null : group ? groupColor(group) : type && type.layout !== 'text' ? normalizeIconColor(type.color) : null;
  useLayoutEffect(() => {
    const el = document.documentElement;
    if (!tint) return;
    el.style.setProperty('--detail-tint', tint);
    return () => {
      el.style.removeProperty('--detail-tint');
    };
  }, [tint]);
}
