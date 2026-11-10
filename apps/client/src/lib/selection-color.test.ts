/**
 * 选中文字的底色（Rei 2026-11-10「安卓端 任务编辑器中，选择标题和内容时背景会变成黑色」）：
 * 三个皮肤亮暗都有自己的 ::selection 底色，是半透明的浅底，不写 color（选中的字保持原色），
 * 不用 var() / color-mix（老 WebView、部分 Chromium 版本在 ::selection 里不认），节点选中时照旧透明。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../styles/app.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** 选择器正好是 sel 的那条规则的声明体 */
const ruleBody = (sel: string) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1];
};
const alphaOf = (body: string) => Number(/background-color:\s*rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\s*\)/.exec(body)?.[1]);

const RULES = [
  '::selection',
  "[data-skin='apple'][data-theme='dark'] ::selection",
  "[data-skin='winui'] ::selection",
  "[data-skin='winui'][data-theme='dark'] ::selection",
  "[data-skin='material'] ::selection",
  "[data-skin='material'][data-theme='dark'] ::selection",
];

describe('选中文字的底色', () => {
  it.each(RULES)('%s：半透明强调色底，不改字色、不用 var / color-mix', (sel) => {
    const body = ruleBody(sel);
    expect(body, sel).toBeDefined();
    const a = alphaOf(body!);
    expect(a).toBeGreaterThanOrEqual(0.15);
    expect(a).toBeLessThanOrEqual(0.5);
    expect(body).not.toMatch(/(^|[^-])color:/);
    expect(body).not.toMatch(/var\(|color-mix/);
  });
  it('节点选中（.ProseMirror-hideselection）压回透明，且比皮肤规则更具体', () => {
    expect(css).toMatch(/html \.ProseMirror\.ProseMirror-hideselection ::selection,\s*html \.ProseMirror\.ProseMirror-hideselection::selection \{\s*background-color: transparent;/);
    // 在皮肤规则后面
    expect(css.indexOf('ProseMirror-hideselection ::selection')).toBeGreaterThan(css.indexOf("[data-skin='material'][data-theme='dark'] ::selection"));
  });
});
