import { describe, expect, it } from 'vitest';
import { BUILTIN_CATEGORIES, ICON_COLOR_HEXES } from '@mindough/core';
import { AA_TEXT, chipColors, contrastRatio, luminance, parseHex, readableInk } from './chip-colors';

// 色板（core icon-color.ts，2026-11-04 起类型和项目共用）+ 老色板，老数据里还有
const SWATCHES = [...ICON_COLOR_HEXES, '#ff3b30', '#ff6b5b', '#ff9f0a', '#ffcc00', '#c58b3d', '#34c759', '#00a6a6', '#0a84ff', '#2f80ed', '#5e5ce6', '#7c5cff', '#af52de', '#ff2d55', '#8e8e93'];

describe('对比度公式（WCAG 2.x）', () => {
  it('黑白 21:1，同色 1:1', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([10, 20, 30], [10, 20, 30])).toBeCloseTo(1, 5);
  });
  it('已知值：#777 对白 ≈ 4.48', () => {
    expect(contrastRatio(parseHex('#777777')!, [255, 255, 255])).toBeCloseTo(4.48, 2);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
  it('解析 #rgb / #rrggbb，别的返回 null', () => {
    expect(parseHex('#0af')).toEqual([0, 170, 255]);
    expect(parseHex('34C759')).toEqual([52, 199, 89]);
    expect(parseHex('var(--accent)')).toBeNull();
    expect(chipColors('oklch(50% 0.1 30)', 'light')).toBeNull();
  });
  it('首选字色不够时换另一个；都不够退到纯黑 / 纯白', () => {
    const mid = parseHex('#777777')!;
    const ink = readableInk(mid, [255, 255, 255], [90, 90, 90]);
    expect(contrastRatio(ink, mid)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('类型筛选胶囊的配色（Rei 2026-11-01）', () => {
  const colors = [...new Set([...BUILTIN_CATEGORIES.map((c) => c.color), ...SWATCHES])];
  // 再扫一遍色轮，自定义颜色也要过
  for (let h = 0; h < 360; h += 15)
    for (const l of [25, 50, 75]) {
      const a = Math.min(l / 100, 1 - l / 100);
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
      };
      colors.push(`#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    }

  for (const theme of ['light', 'dark'] as const)
    it(`${theme}：没选中、选中的字都 ≥ 4.5:1（${colors.length} 种颜色）`, () => {
      for (const c of colors) {
        const cc = chipColors(c, theme);
        expect(cc, `${c} 认不出`).not.toBeNull();
        if (!cc) continue;
        expect(contrastRatio(parseHex(cc.fg)!, parseHex(cc.bg)!), `${c} 没选中`).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(parseHex(cc.selFg)!, parseHex(cc.selBg)!), `${c} 选中`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });

  it('选中是整块类型色，和没选中的浅底分得开', () => {
    for (const theme of ['light', 'dark'] as const) {
      const cc = chipColors('#34c759', theme)!;
      expect(cc.selBg).toBe('#34c759');
      expect(cc.bg).not.toBe(cc.selBg);
      expect(contrastRatio(parseHex(cc.bg)!, parseHex(cc.selBg)!)).toBeGreaterThan(1.3);
    }
  });

  it('底色带着类型色：浅色主题比白色暗、暗色主题比基色亮', () => {
    expect(luminance(parseHex(chipColors('#0a84ff', 'light')!.bg)!)).toBeLessThan(0.9);
    expect(luminance(parseHex(chipColors('#0a84ff', 'dark')!.bg)!)).toBeGreaterThan(luminance([36, 36, 38]));
  });
});
