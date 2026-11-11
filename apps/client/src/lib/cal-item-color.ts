/**
 * 日历条目的底色（Rei 2026-11-12 01:15「每个任务条目要有自己的背景色」）。
 *
 * 取色顺序（同详情栏顶部淡色 useDetailTint：先项目、再类型）：
 * 1. 倒数日设了卡片颜色：用卡片颜色那一套（和倒数日页的卡片同色，lib/card-colors）。
 * 2. 在项目里：项目色（core groupColor，没选过颜色的项目按 id 稳定地挑一个）。
 * 3. 挂了类型、类型有颜色：类型色。
 * 4. 都没有：默认蓝 #4786ee（图标色板里的 blue）。
 * 素净档（色彩设置）一律灰 #717171。
 *
 * 底色是类型色和主题底色混好的实色（lib/chip-colors 的 chipColors：亮 20%、暗 34%），字色按对比度挑黑或白，
 * 保证 ≥ 4.5:1；不用 color-mix（Chromium 107 不认）。订阅事件不走这里，照旧彩色竖线。
 */
import { cardColorOf, groupColor, normalizeIconColor, type Store, type Task } from '@mindough/core';
import { chipColors, type ChipTheme } from './chip-colors';
import { cardColorStyle } from './card-colors';

export const CAL_ITEM_DEFAULT = '#4786ee';
export const CAL_ITEM_PLAIN = '#717171';

export interface CalItemColors {
  bg: string;
  fg: string;
  border: string;
}

/** 条目用哪个颜色（hex）；倒数日卡片颜色另算，见 calItemColors。 */
export function calItemHex(store: Pick<Store, 'get' | 'categoryOf'>, task: Task, level: string): string {
  if (level === 'plain') return CAL_ITEM_PLAIN;
  const group = task.group_id ? store.get('group', task.group_id) : undefined;
  if (group) return groupColor(group);
  const cat = store.categoryOf?.(task);
  return normalizeIconColor(cat?.color) ?? CAL_ITEM_DEFAULT;
}

export function calItemColors(store: Pick<Store, 'get' | 'categoryOf'>, task: Task, countdown: boolean, theme: ChipTheme, level: string): CalItemColors {
  const card = countdown && level !== 'plain' ? cardColorOf(task) : null;
  if (card) {
    const s = cardColorStyle(card, theme);
    return { bg: s.bg, fg: s.fg, border: s.border };
  }
  const cc = chipColors(calItemHex(store, task, level), theme)!;
  return { bg: cc.bg, fg: cc.fg, border: cc.border };
}
