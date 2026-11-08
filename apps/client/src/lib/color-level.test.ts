/**
 * 色彩三档（Rei 2026-11-09）：设置值、多彩档的字色对比度、素净档倒数日卡片、color-level.css 里各档的关键规则。
 * 浏览器里三皮肤 × 亮暗 × 三档的实际效果在 LightVela 截图脚本里量。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CARD_COLORS } from '@mindough/core';
import { normalizeColorLevel, COLOR_LEVELS } from './settings';
import { contrastRatio, parseHex, readableTint } from './chip-colors';
import { cardColorVars } from './card-colors';
import { vividText, vividVar } from './color-level';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const BASES = { light: [[255, 255, 255], [236, 230, 240]], dark: [[36, 36, 38], [58, 58, 60]] } as const;
const hexOf = (rgb: readonly number[]) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

describe('色彩设置值', () => {
  it('三档，认不出来的当标准', () => {
    expect(COLOR_LEVELS).toEqual(['plain', 'standard', 'vivid']);
    expect(normalizeColorLevel('plain')).toBe('plain');
    expect(normalizeColorLevel('vivid')).toBe('vivid');
    expect(normalizeColorLevel(undefined)).toBe('standard');
    expect(normalizeColorLevel('rainbow')).toBe('standard');
  });
});

describe('多彩档字色', () => {
  // 图标色板里最难读的几种：黄、浅绿、青、浅灰，以及深色（暗色主题难读）
  const colors = ['#ffcc00', '#f7c948', '#34c759', '#5ac8fa', '#c7c7cc', '#1d4ed8', '#7c2d12', '#000000', '#ffffff'];
  it('亮暗两种主题：对底色都 ≥ 4.5:1', () => {
    for (const c of colors)
      for (const theme of ['light', 'dark'] as const) {
        const ink = readableTint(c, theme)!;
        for (const b of BASES[theme]) expect(contrastRatio(parseHex(ink)!, parseHex(hexOf(b))!), `${c} ${theme} on ${hexOf(b)}`).toBeGreaterThanOrEqual(4.5);
      }
  });
  it('本来就够深的颜色不改', () => {
    expect(readableTint('#1d4ed8', 'light')).toBe('#1d4ed8');
    expect(readableTint('#f5f5f7', 'dark')).toBe('#f5f5f7');
  });
  it('只在多彩档上色、挂变量', () => {
    expect(vividText('standard', '#ffcc00', 'light')).toBeUndefined();
    expect(vividText('plain', '#ffcc00', 'light')).toBeUndefined();
    expect(vividText('vivid', '#ffcc00', 'light')).toMatch(/^#[0-9a-f]{6}$/);
    expect(vividVar('standard', '#ff0000')).toBeUndefined();
    expect(vividVar('vivid', null)).toBeUndefined();
    expect(vividVar('vivid', '#ff0000', '--ci-color')).toEqual({ '--ci-color': '#ff0000' });
  });
});

describe('素净档倒数日卡片', () => {
  it('不管选了什么颜色（含默认）都是同一种浅灰', () => {
    for (const theme of ['light', 'dark'] as const) {
      const gray = cardColorVars({ card_color: 'gray' }, theme);
      expect(cardColorVars({ card_color: null }, theme, 'plain')).toEqual(gray);
      for (const c of CARD_COLORS) expect(cardColorVars({ card_color: c }, theme, 'plain')).toEqual(gray);
    }
  });
  it('标准、多彩照旧', () => {
    expect(cardColorVars({ card_color: null }, 'light', 'vivid')).toBeUndefined();
    expect(cardColorVars({ card_color: 'red' }, 'light', 'standard')).toEqual(cardColorVars({ card_color: 'red' }, 'light'));
  });
});

describe('color-level.css', () => {
  const css = read('../styles/color-level.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const main = read('../main.tsx');
  it('在 skins.css 后面引入（盖得过皮肤令牌）', () => {
    expect(main.indexOf("'./styles/color-level.css'")).toBeGreaterThan(main.indexOf("'./skin/skins.css'"));
  });
  it('标准档不出现在样式里（现状不变）', () => {
    expect(css).not.toMatch(/data-color-level='standard'/);
  });
  it('素净：亮暗都换强调色、红色、心情色', () => {
    for (const theme of ['light', 'dark']) {
      const block = css.match(new RegExp(`:root\\[data-color-level='plain'\\]\\[data-theme='${theme}'\\] \\{([^}]*)\\}`))?.[1] ?? '';
      for (const v of ['--accent', '--accent-contrast', '--danger', '--success', '--heat-color', '--mood-happy', '--mood-angry']) expect(block, `${theme} ${v}`).toContain(`${v}:`);
      // 只有灰：#rrggbb 三个分量几乎一样
      for (const [, hex] of block.matchAll(/:\s*#([0-9a-f]{6})\b/gi)) {
        // 允许 Apple 中性灰那种一点点偏蓝（#1d1d1f、#6e6e73，三个分量差 ≤ 6）
        const ch = [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16));
        expect(Math.max(...ch) - Math.min(...ch), `${theme} #${hex} 不是灰`).toBeLessThanOrEqual(6);
      }
    }
  });
  it('素净：过期 / 删除的灰对底色 ≥ 4.5:1', () => {
    expect(contrastRatio(parseHex('#6e6e73')!, parseHex('#ffffff')!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(parseHex('#aeaeb2')!, parseHex('#3a3a3c')!)).toBeGreaterThanOrEqual(4.5);
  });
  it('素净：图标块没色块底、行内颜色被盖掉', () => {
    expect(css).toMatch(/:root\[data-color-level='plain'\] \.icon-tile \{[^}]*background: transparent/);
    expect(css).toMatch(/--chip-color: var\(--text-2\) !important/);
    expect(css).toMatch(/\.meta-type[^{]*\{[^}]*!important/);
  });
  it('多彩：看板 / 时间轴顶边、详情顶部、打卡进度环、分区标题', () => {
    expect(css).toMatch(/vivid'\] \.main\[data-project-tint\] \.board-card \{[^}]*border-top/);
    expect(css).toMatch(/vivid'\] \.main\[data-project-tint\] \.tl-bar/);
    expect(css).toMatch(/--detail-tint/);
    expect(css).toMatch(/\.ci-ring \.ring-fill \{[^}]*--ci-color/);
    expect(css).toMatch(/\.section-title\.is-tinted/);
  });
});
