// @vitest-environment happy-dom
/**
 * 格式栏最右边的 info 按钮（Rei 2026-11-21 15:55）：固定在最右、不跟前面的按钮一起横滑，读屏名经 tr()，
 * 按下不抢焦点（键盘不收），点了交给外面开关「写法和快捷键」浮层，开着时显示按下。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { addLocaleMessages, setLocale } from '@mindough/core';
import { createMdEditor } from './editor';
import { FormatBar } from './FormatBar';
import * as ja from '../../i18n/locales/ja';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let edRoot: HTMLDivElement;
let h: ReturnType<typeof createMdEditor>;
beforeEach(() => {
  host = document.createElement('div');
  edRoot = document.createElement('div');
  document.body.append(edRoot, host);
  h = createMdEditor({ root: edRoot, value: '一', placeholder: '', label: 'x', onChange: () => {} });
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  h.destroy();
  host.remove();
  edRoot.remove();
  setLocale('zh');
});

const render = (props: { onHelp?: () => void; helpOpen?: boolean } = {}) => {
  const onHelp = props.onHelp ?? vi.fn();
  act(() =>
    root.render(
      <FormatBar editor={h.editor} keyboardTop={600} mention composing={() => false} onResult={() => {}} onHelp={onHelp} helpOpen={!!props.helpOpen} />,
    ),
  );
  const bar = host.querySelector('.md-format-bar') as HTMLElement;
  const info = host.querySelector('.md-format-help') as HTMLButtonElement;
  return { bar, info, onHelp };
};

describe('格式栏的 info 按钮', () => {
  it('在最右边，不在横滑的那一排里', () => {
    const { bar, info } = render();
    expect(info).toBeTruthy();
    expect(info.parentElement).toBe(bar);
    expect(bar.lastElementChild).toBe(info);
    expect(bar.querySelector('.md-format-bar-scroll')!.contains(info)).toBe(false);
    expect(info.querySelector('svg.lucide-info')).toBeTruthy();
  });

  it('读屏名经 tr()：中文「写法和快捷键」，换语言跟着变', () => {
    expect(render().info.getAttribute('aria-label')).toBe('写法和快捷键');
    addLocaleMessages('ja', ja.MESSAGES);
    setLocale('ja');
    expect(render().info.getAttribute('aria-label')).toBe(ja.MESSAGES['写法和快捷键']);
  });

  it('按下不抢焦点，点了交给外面开关浮层；开着时显示按下', () => {
    const { info, onHelp } = render();
    expect(info.tabIndex).toBe(-1);
    expect(info.getAttribute('aria-expanded')).toBe('false');
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    info.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    act(() => info.click());
    expect(onHelp).toHaveBeenCalledTimes(1);
    const open = render({ helpOpen: true }).info;
    expect(open.classList.contains('is-active')).toBe(true);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    // 浮层「点哪儿都收起」认这个标记，不去抢它的开关
    expect(open.hasAttribute('data-help-toggle')).toBe(true);
  });
});
