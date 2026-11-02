import { describe, expect, it } from 'vitest';
import { CARD_COLORS } from '@mindough/core';
import { cardColorStyle, cardColorVars } from './card-colors';
import { contrastRatio, parseHex } from './chip-colors';

describe('倒数日卡片颜色（Rei 2026-11-02）', () => {
  it('每个预设色、亮暗两种主题：字和副字对底色都 ≥ 4.5:1', () => {
    for (const c of CARD_COLORS)
      for (const theme of ['light', 'dark'] as const) {
        const s = cardColorStyle(c, theme);
        const bg = parseHex(s.bg)!;
        expect(contrastRatio(parseHex(s.fg)!, bg), `${c} ${theme}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(parseHex(s.fg2)!, bg), `${c} ${theme} 副字`).toBeGreaterThanOrEqual(4.5);
      }
  });
  it('默认和不认识的名字：不挂变量', () => {
    expect(cardColorVars({ card_color: null }, 'light')).toBeUndefined();
    expect(cardColorVars({ card_color: 'magenta' }, 'dark')).toBeUndefined();
    expect(cardColorVars({ card_color: 'teal' }, 'dark')).toHaveProperty('--cd-bg');
  });
});
