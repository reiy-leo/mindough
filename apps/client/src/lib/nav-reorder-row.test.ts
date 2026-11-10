// @vitest-environment happy-dom
/**
 * 置顶项目行右边带 ···（Rei 2026-11-11 02:56「添加到侧边栏的项目，右键菜单换成右侧的『···』」）：
 * 拖动排序挂在外层 div 上，圆角取里面的链接，键盘挪完焦点回到链接；样式里 ··· 的显示规矩也核对一遍。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { reorderFocusOf, reorderShapeOf } from './nav-reorder';

function row(html: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  document.body.append(box);
  return box.firstElementChild as HTMLElement;
}

describe('置顶项目行外面套一层（行右边的 ···）', () => {
  it('形状取里面标了 data-reorder-shape 的链接，没套就是自己', () => {
    const r = row('<div data-reorder-id="g1"><a href="#/groups/g1" data-reorder-shape>A</a><span><button aria-label="更多">…</button></span></div>');
    expect(reorderShapeOf(r).tagName).toBe('A');
    const a = row('<a href="#/groups/g2" data-reorder-id="g2">B</a>');
    expect(reorderShapeOf(a)).toBe(a);
  });

  it('键盘挪完焦点回到链接，不落在 ··· 上；链接本身就是行时原样', () => {
    const r = row('<div data-reorder-id="g1"><a href="#/groups/g1">A</a><span><button>…</button></span></div>');
    expect(reorderFocusOf(r)?.tagName).toBe('A');
    const a = row('<a href="#/groups/g2">B</a>');
    expect(reorderFocusOf(a)).toBe(a);
    expect(reorderFocusOf(null)).toBeNull();
  });
});

describe('行右边 ··· 的样式', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/app.css'), 'utf8');
  it('有鼠标时悬停 / 键盘聚焦才显示，触屏常显，拖动时藏起来', () => {
    expect(css).toMatch(/\.nav-item-split:hover \.nav-item-more/);
    expect(css).toMatch(/\.nav-pinned-row:has\(:focus-visible\) \.nav-item-more/);
    expect(css).toMatch(/@media \(hover: none\) \{\s*\.nav-item-more\.icon-btn \{\s*opacity: 1;/);
    expect(css).toMatch(/html\.is-nav-reordering \.nav-pinned-row \.nav-item-more \{\s*opacity: 0;/);
  });
  it('链接给 ··· 让出位置，名字不压在按钮下面', () => {
    expect(css).toMatch(/\.nav-item-split > \.nav-item,\s*\[data-skin\] \.nav-item-split > \.nav-item \{\s*padding-inline-end: 36px;/);
  });
});
