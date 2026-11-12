/**
 * Material 皮肤换成 Apple 的蓝（Rei 2026-11-13「换成和 Apple 皮肤一样的蓝」）：
 * 容器、中性色从 Apple 的蓝推出，M3 基准紫那一套一个都不留；暗色强调色 #0a84ff 和 Apple 一样。
 * 亮色强调色深一档用 #0068d9（Rei 2026-11-13「按你推荐来」）：蓝底白字 ≥ 4.5:1，Apple 的 #007aff 只有 4.0:1；
 * 「重要」提示块保留紫，暗色强调色上的字保留深蓝 #001a41。
 * 浅色容器上的字、正文、第三级文字对比度都 ≥ 4.5:1；不用 color-mix。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex } from './chip-colors';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('../skin/tokens.css');
const files = ['../skin/tokens.css', '../skin/skins.css', '../styles/app.css', '../styles/project.css'].map(read);

const ruleBody = (css: string, sel: string) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';
};
const prop = (body: string, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? '';
const cr = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!);

const light = ruleBody(tokens, "[data-skin='material']");
const dark = ruleBody(tokens, "[data-skin='material'][data-theme='dark']");
const appleLight = ruleBody(tokens, "[data-skin='apple']");
const appleDark = ruleBody(tokens, "[data-skin='apple'][data-theme='dark']");

describe('Material 皮肤的蓝', () => {
  it('亮色强调色是深一档的 #0068d9，暗色和 Apple 皮肤一样', () => {
    expect(prop(light, '--accent')).toBe('#0068d9');
    expect(prop(appleLight, '--accent')).toBe('#007aff');
    expect(prop(dark, '--accent')).toBe(prop(appleDark, '--accent'));
    expect(prop(dark, '--accent')).toBe('#0a84ff');
    expect(prop(light, '--heat-color')).toBe(prop(light, '--accent'));
    expect(prop(dark, '--heat-color')).toBe(prop(dark, '--accent'));
  });

  it('M3 基准紫一个都不留', () => {
    const purple = /#(6750a4|e8def8|eaddff|d0bcff|4f378b|381e72|21005d|625b71|fef7ff|141218|4a4458|1d192b|ccc2dc)\b|rgba\(\s*(103,\s*80,\s*164|208,\s*188,\s*255)/i;
    for (const css of files) expect(css).not.toMatch(purple);
  });

  it.each([
    ['亮', light, '--bg'],
    ['亮', light, '--surface-3'],
    ['暗', dark, '--bg'],
    ['暗', dark, '--surface-3'],
  ])('%s色 %s 上的正文、第二三级文字 ≥ 4.5:1', (_t, body, bg) => {
    for (const fg of ['--text', '--text-2', '--text-3']) expect(cr(prop(body, fg), prop(body, bg)), fg).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['亮', light],
    ['暗', dark],
  ])('%s色容器（选中底、导航选中）上的字 ≥ 4.5:1', (_t, body) => {
    expect(cr(prop(body, '--accent-soft-text'), prop(body, '--accent-soft'))).toBeGreaterThanOrEqual(4.5);
    expect(cr(prop(body, '--nav-active-text'), prop(body, '--nav-active-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('亮色蓝底白字 ≥ 4.5:1，悬停色更深', () => {
    expect(prop(light, '--accent-contrast')).toBe('#ffffff');
    expect(cr('#ffffff', prop(light, '--accent'))).toBeGreaterThanOrEqual(4.5);
    expect(cr('#ffffff', prop(light, '--accent-hover'))).toBeGreaterThan(cr('#ffffff', prop(light, '--accent')));
  });

  it('亮色焦点圈跟着新强调色', () => {
    expect(prop(light, '--focus')).toContain('rgba(0, 104, 217,');
  });

  it('暗色强调色上的字 ≥ 4.5:1（M3 暗色 on-primary 用深蓝 #001a41）', () => {
    expect(prop(dark, '--accent-contrast')).toBe('#001a41');
    expect(cr(prop(dark, '--accent-contrast'), prop(dark, '--accent'))).toBeGreaterThanOrEqual(4.5);
  });

  it('「重要」提示块保留紫', () => {
    expect(prop(light, '--alert-important')).toBe('#8944ab');
    expect(prop(dark, '--alert-important')).toBe('#bf5af2');
  });

  it('Material 两段色板不用 color-mix', () => {
    expect(light).not.toMatch(/color-mix/);
    expect(dark).not.toMatch(/color-mix/);
  });
});
