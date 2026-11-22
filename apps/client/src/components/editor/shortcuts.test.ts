// @vitest-environment happy-dom
/**
 * 「写法和快捷键」浮层（⌘?，Rei 2026-11-03）：按键识别、Mac / 别的系统的写法、只列真有的、组字时不弹；
 * 中文界面并上全角写法、手机（格式栏 info 按钮）只列写法（Rei 2026-11-21）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@mindough/core';
import { createMdEditor } from './editor';
import { formatChord, isAppleKeyboard, isHelpShortcut, shortcutRows, shortcutTexts, showFullWidth } from './shortcuts';
import { formatHelpLabel } from './FormatBar';
import { FW_QUOTE_RE, FW_TASK_RE } from './extensions';
import { EN } from '../../i18n/en';
import * as es from '../../i18n/locales/es';
import * as ptBR from '../../i18n/locales/pt-BR';
import * as ru from '../../i18n/locales/ru';
import * as ja from '../../i18n/locales/ja';
import * as de from '../../i18n/locales/de';
import * as fr from '../../i18n/locales/fr';
import * as id from '../../i18n/locales/id';

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
    // 上下移动当前行：所有系统都是 Ctrl，Mac 上写 ⌃，不换成 ⌘
    expect(formatChord(['ctrl', '↑↓'], true)).toBe('⌃↑↓');
    expect(formatChord(['ctrl', '↑↓'], false)).toBe('Ctrl+↑↓');
    expect(shortcutTexts(true).close).toContain('⌘?');
    expect(shortcutTexts(false).combo).toContain('Ctrl');
    expect(shortcutTexts(true).clipLink).toContain('⌘K');
    expect(shortcutTexts(false).clipLink).toContain('Ctrl+K');
    expect(formatChord(['mod', 'shift', 'H'], false)).toBe('Ctrl+Shift+H');
    expect(shortcutTexts(true).highlight).toBe('点一下高亮，可以换颜色或去掉。');
    expect(shortcutTexts(true).quote).toBe('点引用左边的竖条，可以换颜色。');
    expect(shortcutTexts(true).table).toBe('表格里按 ↩ 加一行，按 ⇧↩ 加一列，按 ⌥↑↓ 移动这一行，在最后一行按 ↓ 跳出表格。');
    expect(shortcutTexts(false).table).toBe('表格里按 Enter 加一行，按 Shift+Enter 加一列，按 Ctrl+↑↓ 移动这一行，在最后一行按 ↓ 跳出表格。');
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
    expect(keys).toEqual(['⌘B', '⌘I', '⌘U', '⌘U', '1', '⌘U', '2', '⌘⌥X', '⌘⇧H', '⌘E', '⌘K', '⌘⌥1–6', '⌘⌥8', '⌘⌥7', '⌘⇧B', '⌘⌥C', '⇧↩', '⌥↑↓']);
    expect(rows.map((r) => r.md).filter(Boolean)).toEqual(['**文字**', '*文字*', '~~文字~~', '==文字==', '`代码`', '[文字](网址)', '# ', '- ', '1. ', '[] ', '> ', '```', '---', '|3x2| ', '>> ', '$x^2$']);
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

describe('全角写法（Rei 2026-11-21 15:53）', () => {
  afterEach(() => setLocale('zh'));

  it('中文界面：五条全角写法并在对应的半角后面', () => {
    expect(showFullWidth('zh')).toBe(true);
    const fw = shortcutRows({ locale: 'zh' })
      .filter((r) => r.fw)
      .map((r) => [r.md, r.fw]);
    expect(fw).toEqual([
      ['1. ', '1。 '],
      ['[] ', '【】 '],
      ['> ', '》 '],
      ['```', '··· '],
      ['>> ', '》》 '],
    ]);
  });

  it('列出来的全角写法真能触发规则（和 extensions.ts 对得上）', () => {
    const rows = shortcutRows({ locale: 'zh' });
    const fwOf = (md: string) => rows.find((r) => r.md === md)!.fw!;
    expect(FW_QUOTE_RE.test(fwOf('> '))).toBe(true);
    expect(FW_TASK_RE.test(fwOf('[] '))).toBe(true);
    // 代码块是三个中点 U+00B7（中文输入法里 ` 键打出来的）
    expect(fwOf('```').trim()).toBe('\u00b7\u00b7\u00b7');
  });

  it('别的语言不显示全角写法', () => {
    for (const l of ['en', 'es', 'pt-BR', 'ru', 'ja', 'de', 'fr', 'id']) {
      expect(showFullWidth(l)).toBe(false);
      expect(shortcutRows({ locale: l }).some((r) => r.fw)).toBe(false);
    }
    setLocale('en');
    expect(shortcutRows().some((r) => r.fw)).toBe(false);
    setLocale('zh');
    expect(shortcutRows().some((r) => r.fw)).toBe(true);
  });
});

describe('手机上从格式栏 info 按钮打开（Rei 2026-11-21 15:55）', () => {
  it('只留有写法的行，快捷键都去掉', () => {
    const all = shortcutRows({ locale: 'zh' });
    const touch = shortcutRows({ touch: true, locale: 'zh' });
    expect(touch.length).toBe(all.filter((r) => r.md).length);
    expect(touch.every((r) => r.md && r.keys.length === 0)).toBe(true);
    expect(touch.map((r) => r.label)).not.toContain('下划线');
    expect(touch.map((r) => r.label)).not.toContain('上下移动这一行');
    // 全角写法照样有
    expect(touch.find((r) => r.md === '> ')!.fw).toBe('》 ');
  });

  it('关闭说明不讲 ⌘ / Esc', () => {
    const t = shortcutTexts(true);
    expect(t.closeTouch).toBe('点任意处关闭');
    expect(t.closeTouch).not.toMatch(/⌘|Ctrl|Esc/);
  });

  it('info 按钮的读屏名和关闭说明九种语言都有（中文是 key，英文 + 七种外语都要写）', () => {
    expect(formatHelpLabel()).toBe('写法和快捷键');
    for (const k of ['写法和快捷键', '点任意处关闭']) {
      expect(EN[k], `en ${k}`).toBeTruthy();
      for (const [name, mod] of Object.entries({ es, ptBR, ru, ja, de, fr, id })) expect(mod.MESSAGES[k], `${name} ${k}`).toBeTruthy();
    }
  });
});
