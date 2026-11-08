/**
 * 倒数日卡片的背景色（Rei 2026-11-02「倒数日的card可以设置不同的颜色背景」）：
 * 色值在 core 的 CARD_COLOR_VALUES（亮、暗各一套），这里按主题取底色，字色用 chip-colors 的算法挑黑或白（≥ 4.5:1），
 * 副字（日期、「还有 / 天」）是同一个字色降一点透明度后再验一遍对比度，不够就用实色。
 */
import type { CSSProperties } from 'react';
import { CARD_COLOR_VALUES, cardColorOf, type CardColor } from '@mindough/core';
import { AA_TEXT, contrastRatio, mix, parseHex, readableInk, toHex, type ChipTheme } from './chip-colors';
import { tr } from './i18n';

const INK_DARK = [29, 29, 31] as const;
const INK_LIGHT = [255, 255, 255] as const;

export interface CardColorStyle {
  bg: string;
  fg: string;
  /** 副字：比 fg 淡一点，仍 ≥ 4.5:1 */
  fg2: string;
  border: string;
}

export function cardColorStyle(color: CardColor, theme: ChipTheme): CardColorStyle {
  const bg = parseHex(CARD_COLOR_VALUES[color][theme])!;
  const [native, other] = theme === 'light' ? [INK_DARK, INK_LIGHT] : [INK_LIGHT, INK_DARK];
  const fg = readableInk(bg, native, other);
  // 副字：往底色里混 25%，对比度还够就用，不够就用实色
  const soft = mix(fg, bg, 0.78);
  const fg2 = contrastRatio(soft, bg) >= AA_TEXT ? soft : fg;
  const border = mix(fg, bg, 0.12);
  return { bg: toHex(bg), fg: toHex(fg), fg2: toHex(fg2), border: toHex(border) };
}

/**
 * 卡片上要挂的 CSS 变量；默认颜色返回 undefined（照原来的样子）。
 * 素净档（色彩设置，Rei 2026-11-09）不管选了什么颜色，卡片都是同一种浅灰（core 的 gray）。
 */
export function cardColorVars(task: { card_color?: string | null }, theme: ChipTheme, level: 'plain' | 'standard' | 'vivid' = 'standard'): CSSProperties | undefined {
  const c = level === 'plain' ? 'gray' : cardColorOf(task);
  if (!c) return undefined;
  const s = cardColorStyle(c, theme);
  return { '--cd-bg': s.bg, '--cd-fg': s.fg, '--cd-fg2': s.fg2, '--cd-border': s.border } as CSSProperties;
}

/** 颜色名（读屏、提示）。 */
export function cardColorLabel(c: CardColor | null): string {
  switch (c) {
    case null:
      return tr('默认');
    case 'red':
      return tr('红');
    case 'orange':
      return tr('橙');
    case 'yellow':
      return tr('黄');
    case 'green':
      return tr('绿');
    case 'teal':
      return tr('青');
    case 'blue':
      return tr('蓝');
    case 'indigo':
      return tr('靛');
    case 'purple':
      return tr('紫');
    case 'pink':
      return tr('粉');
    case 'brown':
      return tr('棕');
    case 'gray':
      return tr('灰');
  }
}
