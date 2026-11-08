/**
 * 清单项的勾悬停是手指（Rei 2026-11-08「TODO hover 时鼠标样式是编辑」）：WebKit 给伪元素命中的是 li，所以 pointer 要写在 li 上，
 * 文字部分改回文字光标；只读时都是箭头。浏览器里的实测在 LightVela 截图脚本（work/shots-tool/myday-sections.mjs）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../../styles/editor.css', import.meta.url)), 'utf8');
const LI = ".md-editor-content li[data-item-type='task']";
const rule = (sel: string) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\n|,\\s*)${esc}\\s*(,[^{]*)?\\{[^}]*\\}`, 'g');
};
const bodyOf = (sel: string) => [...css.matchAll(rule(sel))].map((m) => m[0]).join('\n');

describe('清单勾的鼠标样式', () => {
  it('li 本身是手指（勾和左边热区），::before 也是', () => {
    expect(bodyOf(LI)).toMatch(/cursor: pointer/);
    expect(bodyOf(`${LI}::before`)).toMatch(/cursor: pointer/);
  });
  it('li 里面的文字是文字光标', () => {
    expect(bodyOf(`${LI} > *`)).toMatch(/cursor: text/);
  });
  it('只读时勾是箭头', () => {
    expect(bodyOf(".md-editor-content[contenteditable='false'] li[data-item-type='task']")).toMatch(/cursor: default/);
  });
});
