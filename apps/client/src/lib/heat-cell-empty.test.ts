/**
 * 活动图空格子（Rei 2026-11-12 00:35：打卡卡片选中后变淡蓝，浅灰空格子和底色分不清）：
 * 空格子、无需打卡的格子用半透明的文字色叠在卡片底上，随底色变深 / 变亮；
 * 三个皮肤亮暗 + 素净 Material 都写死 rgba，不用 var() / color-mix（Chromium 107 不认 color-mix）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('../skin/tokens.css');
const level = read('../styles/color-level.css');
const app = read('../styles/app.css');

const blockOf = (css: string, sel: string) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1];
};
const rgba = (body: string, name: string) => {
  const m = new RegExp(`${name}:\\s*rgba\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\s*\\)`).exec(body);
  return m ? m.slice(1).map(Number) : null;
};

const THEMES: [string, string][] = [
  [tokens, "[data-skin='apple']"],
  [tokens, "[data-skin='apple'][data-theme='dark']"],
  [tokens, "[data-skin='winui']"],
  [tokens, "[data-skin='winui'][data-theme='dark']"],
  [tokens, "[data-skin='material']"],
  [tokens, "[data-skin='material'][data-theme='dark']"],
  [level, ":root[data-color-level='plain'][data-skin='material'][data-theme='light']"],
  [level, ":root[data-color-level='plain'][data-skin='material'][data-theme='dark']"],
];

describe('活动图空格子', () => {
  it.each(THEMES.map(([, s]) => s))('%s：空格子 / 无需打卡都是半透明 rgba，空格子比无需打卡深', (sel) => {
    const css = THEMES.find(([, s]) => s === sel)![0];
    // 同一个选择器可能有几块（tokens.css 分段写），找带 --heat-empty 的那块
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bodies = [...css.matchAll(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'gm'))].map((m) => m[1]!);
    const body = bodies.find((b) => b.includes('--heat-cell-empty'));
    expect(body, sel).toBeDefined();
    const e = rgba(body!, '--heat-cell-empty');
    const f = rgba(body!, '--heat-cell-free');
    expect(e, sel).not.toBeNull();
    expect(f, sel).not.toBeNull();
    expect(e![3]).toBeGreaterThanOrEqual(0.07);
    expect(e![3]).toBeLessThanOrEqual(0.15);
    expect(f![3]).toBeLessThan(e![3]!);
    expect(f![3]).toBeGreaterThan(0);
  });
  it('.heat-cell 用 --heat-cell-empty，无需打卡用 --heat-cell-free，都不用 color-mix', () => {
    const cell = blockOf(app, '.heat-cell');
    expect(cell).toMatch(/background:\s*var\(--heat-cell-empty/);
    const free = blockOf(app, '.heat-cell.is-free');
    expect(free).toMatch(/background:\s*var\(--heat-cell-free/);
    expect(free).not.toMatch(/color-mix/);
  });
  it('达标格子不变：lv-3 还是打卡颜色', () => {
    expect(blockOf(app, '.heat-cell.lv-3')).toMatch(/background:\s*var\(--hc\)/);
  });
});
