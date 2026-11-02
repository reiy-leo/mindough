// @vitest-environment happy-dom
/** 输入法和全局快捷键（Rei 2026-11-02「做完后解锁弹窗中搜索框中，删除字符会跳转，输入中文有问题」）。 */
import { afterEach, describe, expect, it } from 'vitest';
import { imeBusy, imeEnter, typingKey } from './ime';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('imeEnter', () => {
  const ev = (key: string, isComposing = false, keyCode = 13) => ({ key, isComposing, keyCode });
  it('组字中的回车、WebKit 的 229、compositionend 后 100ms 内的回车都是选词', () => {
    expect(imeEnter(ev('Enter', true), 0, 10_000)).toBe(true);
    expect(imeEnter(ev('Enter', false, 229), 0, 10_000)).toBe(true);
    expect(imeEnter(ev('Enter'), 9_950, 10_000)).toBe(true);
  });
  it('平常的回车不是', () => {
    expect(imeEnter(ev('Enter'), 0, 10_000)).toBe(false);
    expect(imeEnter(ev('Backspace', true), 0, 10_000)).toBe(false);
  });
  it('imeBusy', () => {
    expect(imeBusy({ isComposing: true, keyCode: 0 })).toBe(true);
    expect(imeBusy({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(imeBusy({ isComposing: false, keyCode: 8 })).toBe(false);
  });
});

describe('typingKey：全局快捷键让路', () => {
  it('事件来自输入框', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(typingKey({ target: input, isComposing: false, keyCode: 8 })).toBe(true);
  });
  it('焦点在输入框里、事件却派发在列表上（Autocomplete 转发的退格、N）也让路', () => {
    const input = document.createElement('input');
    const list = document.createElement('div');
    document.body.append(input, list);
    input.focus();
    expect(document.activeElement).toBe(input);
    expect(typingKey({ target: list, isComposing: false, keyCode: 8 })).toBe(true);
  });
  it('焦点不在输入框、也不是输入法：照常处理', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    expect(typingKey({ target: btn, isComposing: false, keyCode: 78 })).toBe(false);
  });
});
