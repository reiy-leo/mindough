// @vitest-environment happy-dom
/** 全局搜索快捷键（Rei 2026-11-05「全局⌘K和编辑器的⌘K冲突，全局用⌘F」）。 */
import { describe, expect, it } from 'vitest';
import { isSearchShortcut, searchKeyLabel } from './global-keys';

const ev = (init: Partial<KeyboardEvent> & { defaultPrevented?: boolean } = {}) => ({
  key: 'f',
  code: 'KeyF',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  keyCode: 70,
  ...init,
});

describe('isSearchShortcut', () => {
  it('Mac：⌘F 开，Ctrl+F 不开（Mac 上 Ctrl+F 是光标右移）', () => {
    expect(isSearchShortcut(ev({ metaKey: true }), true)).toBe(true);
    expect(isSearchShortcut(ev({ ctrlKey: true }), true)).toBe(false);
    expect(isSearchShortcut(ev({ metaKey: true, ctrlKey: true }), true)).toBe(false);
  });
  it('Windows / Linux：Ctrl+F 开，Win+F 不开', () => {
    expect(isSearchShortcut(ev({ ctrlKey: true }), false)).toBe(true);
    expect(isSearchShortcut(ev({ metaKey: true }), false)).toBe(false);
  });
  it('⌘K / Ctrl+K 不再开搜索', () => {
    expect(isSearchShortcut(ev({ metaKey: true, key: 'k', code: 'KeyK' }), true)).toBe(false);
    expect(isSearchShortcut(ev({ ctrlKey: true, key: 'k', code: 'KeyK' }), false)).toBe(false);
  });
  it('带 ⌥ 或 ⇧ 的不算；没按修饰键的 F 不算', () => {
    expect(isSearchShortcut(ev({ metaKey: true, shiftKey: true, key: 'F' }), true)).toBe(false);
    expect(isSearchShortcut(ev({ metaKey: true, altKey: true, key: 'ƒ' }), true)).toBe(false);
    expect(isSearchShortcut(ev(), true)).toBe(false);
  });
  it('组字时（isComposing、WebKit 的 229）不开', () => {
    expect(isSearchShortcut(ev({ metaKey: true, isComposing: true }), true)).toBe(false);
    expect(isSearchShortcut(ev({ metaKey: true, keyCode: 229 }), true)).toBe(false);
  });
  it('页面自己拦下的 ⌘F（类型页的搜索框）不开', () => {
    expect(isSearchShortcut(ev({ metaKey: true, defaultPrevented: true }), true)).toBe(false);
  });
  it('按物理键认：别的键盘布局下 key 不是 f，code 是 KeyF 也开；没有 code 看 key', () => {
    expect(isSearchShortcut(ev({ metaKey: true, key: 'а' }), true)).toBe(true);
    expect(isSearchShortcut(ev({ ctrlKey: true, code: '', key: 'F' }), false)).toBe(true);
  });
  it('焦点在编辑器、输入框里也开（编辑器没有自己的查找）', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(isSearchShortcut(ev({ metaKey: true, target: input } as Partial<KeyboardEvent>), true)).toBe(true);
    input.remove();
  });
});

describe('searchKeyLabel', () => {
  it('Mac ⌘F，别的 Ctrl F', () => {
    expect(searchKeyLabel(true)).toBe('⌘F');
    expect(searchKeyLabel(false)).toBe('Ctrl F');
  });
});
