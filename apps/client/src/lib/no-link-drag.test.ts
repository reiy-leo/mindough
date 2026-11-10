// @vitest-environment happy-dom
/**
 * 界面链接、图片拖不出系统预览（Rei 2026-11-11）：dragstart 拦界面里的 a[href] / img，编辑器和只读 Markdown 里的不拦；
 * 样式那一层（-webkit-user-drag: none）也在这里核对一遍规则还在。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { installNoLinkDrag, shouldBlockNativeDrag } from './no-link-drag';

const html = (s: string) => {
  document.body.innerHTML = s;
};
const $ = (sel: string) => document.querySelector(sel)!;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('shouldBlockNativeDrag', () => {
  it('侧栏、更多页、底栏这类界面链接要拦（含置顶项、里面的文字节点）', () => {
    html(`<nav><a class="nav-item" href="#/groups/g1"><span class="nav-label">fmtagno</span></a>
      <a class="nav-item nav-item-sub" href="#/groups/g2" draggable="false" data-reorder-group="group">项目</a></nav>`);
    expect(shouldBlockNativeDrag($('.nav-item'))).toBe(true);
    expect(shouldBlockNativeDrag($('.nav-item-sub'))).toBe(true);
    expect(shouldBlockNativeDrag($('.nav-label').firstChild)).toBe(true); // 按住的是链接里的文字也算
  });

  it('界面里的图片（列表海报、资料封面）要拦', () => {
    html(`<div class="task-row"><img class="row-thumb" src="x.png"></div>`);
    expect(shouldBlockNativeDrag($('img'))).toBe(true);
  });

  it('编辑器、只读 Markdown 里的链接和图片不拦', () => {
    html(`<div class="ProseMirror"><p><a href="https://example.com">网页</a><img src="a.png"></p></div>
      <div class="md"><a id="m" href="https://example.com">网页</a></div>`);
    expect(shouldBlockNativeDrag($('.ProseMirror a'))).toBe(false);
    expect(shouldBlockNativeDrag($('.ProseMirror img'))).toBe(false);
    expect(shouldBlockNativeDrag($('#m'))).toBe(false);
  });

  it('正文里 @ 提到的任务是界面胶囊，照拦', () => {
    html(`<div class="md"><a href="mindough://task/t1" data-task-mention="t1">任务</a></div>`);
    expect(shouldBlockNativeDrag($('a'))).toBe(true);
  });

  it('自己写了 draggable="true" 的、没有 href 的 a、别的元素不拦', () => {
    html(`<a id="d" href="#/x" draggable="true">x</a><a id="n">y</a><div id="row" draggable="true"><span id="cell">行</span></div>
      <a href="#/y"><div id="inner" draggable="true">里面自己能拖</div></a>`);
    expect(shouldBlockNativeDrag($('#cell'))).toBe(false);
    expect(shouldBlockNativeDrag($('#inner'))).toBe(false);
    expect(shouldBlockNativeDrag($('#d'))).toBe(false);
    expect(shouldBlockNativeDrag($('#n'))).toBe(false);
    expect(shouldBlockNativeDrag($('#row'))).toBe(false);
    expect(shouldBlockNativeDrag(null)).toBe(false);
  });
});

describe('installNoLinkDrag', () => {
  it('捕获阶段拦掉界面链接的 dragstart，编辑器里的放过', () => {
    const target = new EventTarget();
    installNoLinkDrag(target as unknown as Window);
    html(`<a id="ui" href="#/groups/g1">fmtagno</a><div class="ProseMirror"><a id="c" href="https://example.com">网页</a></div>`);
    const fire = (el: Element) => {
      const e = new Event('dragstart', { cancelable: true });
      Object.defineProperty(e, 'target', { value: el });
      target.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(fire($('#ui'))).toBe(true);
    expect(fire($('#c'))).toBe(false);
  });
});

describe('样式', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/app.css'), 'utf8');
  it('界面链接和图片默认 -webkit-user-drag: none，编辑器 / Markdown 里放开', () => {
    expect(css).toMatch(/a\[href\]:not\(\[draggable='true'\]\),\s*img:not\(\[draggable='true'\]\)\s*\{\s*-webkit-user-drag: none;/);
    expect(css).toMatch(/\.ProseMirror a\[href\]:not\(\[data-task-mention\]\),[\s\S]*?\.md img\s*\{\s*-webkit-user-drag: auto;/);
  });
});
