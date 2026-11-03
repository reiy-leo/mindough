// @vitest-environment happy-dom
/** 「写法和快捷键」浮层（⌘?，Rei 2026-11-03）：按键识别、Mac / 别的系统的写法、只列真有的、组字时不弹。 */
import { describe, expect, it, vi } from 'vitest';
import { createMdEditor } from './editor';
import { formatChord, isAppleKeyboard, isHelpShortcut, shortcutRows, shortcutTexts } from './shortcuts';

const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 };
const win = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' };
const linux = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' };

describe('快捷键的写法', () => {
  it('Mac 用 ⌘ ⌥ ⇧，别的系统用 Ctrl+Alt+Shift', () => {
    expect(isAppleKeyboard(mac)).toBe(true);
    expect(isAppleKeyboard(win)).toBe(false);
    expect(isAppleKeyboard(linux)).toBe(false);
    expect(formatChord(['mod', 'B'], true)).toBe('⌘B');
    expect(formatChord(['mod', 'alt', 'X'], true)).toBe('⌘⌥X');
    expect(formatChord(['mod', 'shift', 'B'], false)).toBe('Ctrl+Shift+B');
    expect(formatChord(['shift', 'Enter'], true)).toBe('⇧↩');
    expect(formatChord(['shift', 'Enter'], false)).toBe('Shift+Enter');
    expect(shortcutTexts(true).close).toContain('⌘?');
    expect(shortcutTexts(false).combo).toContain('Ctrl');
  });

  it('⌘? / ⌘/ / Ctrl+? 都算，带 ⌥ 或不带 ⌘ 不算', () => {
    expect(isHelpShortcut({ metaKey: true, ctrlKey: false, altKey: false, key: '?', code: 'Slash' })).toBe(true);
    expect(isHelpShortcut({ metaKey: true, ctrlKey: false, altKey: false, key: '/', code: 'Slash' })).toBe(true);
    expect(isHelpShortcut({ metaKey: false, ctrlKey: true, altKey: false, key: '?', code: 'Slash' })).toBe(true);
    expect(isHelpShortcut({ metaKey: false, ctrlKey: false, altKey: false, key: '?', code: 'Slash' })).toBe(false);
    expect(isHelpShortcut({ metaKey: true, ctrlKey: false, altKey: true, key: '÷', code: 'Slash' })).toBe(false);
  });

  it('列的写法和快捷键都是编辑器真有的', () => {
    const rows = shortcutRows();
    const keys = rows.flatMap((r) => r.keys.map((c) => formatChord(c, true)));
    expect(keys).toEqual(['⌘B', '⌘I', '⌘U', '⌘U', '1', '⌘U', '2', '⌘⌥X', '⌘E', '⌘K', '⌘⌥1–6', '⌘⌥8', '⌘⌥7', '⌘⇧B', '⌘⌥C', '⇧↩']);
    expect(rows.map((r) => r.md).filter(Boolean)).toEqual(['**文字**', '*文字*', '~~文字~~', '`代码`', '[文字](网址)', '# ', '- ', '1. ', '[] ', '> ', '```', '---', '|3x2| ', '>> ', '$x^2$']);
  });
});

describe('编辑器里按 ⌘?', () => {
  const setup = (onHelpShortcut = vi.fn()) => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const h = createMdEditor({ root, value: '一', placeholder: '', label: 'x', onChange: () => {}, onHelpShortcut });
    return { h, view: h.view(), onHelpShortcut, done: () => (h.destroy(), root.remove()) };
  };
  const key = (el: HTMLElement, init: KeyboardEventInit & { keyCode?: number }) => {
    const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    if (init.keyCode != null) Object.defineProperty(ev, 'keyCode', { get: () => init.keyCode });
    el.dispatchEvent(ev);
    return ev;
  };

  it('开关浮层，不往外传', () => {
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    const a = setup();
    const ev = key(a.view.dom, { key: '?', code: 'Slash', metaKey: true, shiftKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(a.onHelpShortcut).toHaveBeenCalledTimes(1);
    key(a.view.dom, { key: '/', code: 'Slash', ctrlKey: true });
    expect(a.onHelpShortcut).toHaveBeenCalledTimes(2);
    expect(outside).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outside);
    a.done();
  });

  it('组字中不弹', () => {
    const a = setup();
    key(a.view.dom, { key: '?', code: 'Slash', metaKey: true, shiftKey: true, isComposing: true });
    key(a.view.dom, { key: '?', code: 'Slash', metaKey: true, shiftKey: true, keyCode: 229 });
    expect(a.onHelpShortcut).not.toHaveBeenCalled();
    a.done();
  });
});
