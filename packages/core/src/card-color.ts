/**
 * 倒数日卡片的背景色（Rei 2026-11-02「倒数日的card可以设置不同的颜色背景」）。
 * task.card_color 存预设色的名字，不存色值：亮、暗主题各用各的色值，字色在界面上按对比度挑黑或白。
 * 空 = 默认（卡片原来的样子）。名字不认识（以后加的颜色、手改的数据）也当默认。
 */
export const CARD_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'brown', 'gray'] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/** 亮、暗主题下的底色。亮色偏浅、暗色偏深，都不刺眼；字色交给界面按对比度挑。 */
export const CARD_COLOR_VALUES: Record<CardColor, { light: string; dark: string }> = {
  red: { light: '#f9d4d0', dark: '#7a2620' },
  orange: { light: '#fbdcbf', dark: '#7c3f12' },
  yellow: { light: '#f8ebaf', dark: '#6b5510' },
  green: { light: '#cfeccf', dark: '#24572b' },
  teal: { light: '#c6ebe6', dark: '#145651' },
  blue: { light: '#cfe2fb', dark: '#1d4579' },
  indigo: { light: '#d8d8f8', dark: '#33337a' },
  purple: { light: '#e6d5f5', dark: '#552a78' },
  pink: { light: '#f8d3e4', dark: '#76234b' },
  brown: { light: '#e6d6c6', dark: '#5a3e2b' },
  gray: { light: '#e0e0e3', dark: '#45454b' },
};

export function isCardColor(v: unknown): v is CardColor {
  return typeof v === 'string' && (CARD_COLORS as readonly string[]).includes(v);
}

/** 读任务上的颜色：认识的名字原样返回，别的都是 null（默认）。 */
export function cardColorOf(task: { card_color?: string | null }): CardColor | null {
  return isCardColor(task.card_color) ? task.card_color : null;
}
