// @vitest-environment happy-dom
/**
 * 手机键盘上方的格式栏（Rei 2026-11-21 方案 A）：按钮顺序、九种语言的读屏名、每个按钮改出来的 markdown、按钮状态跟着光标、
 * 再点一下取消、组字时不动、任务第一行（纯文字标题）里格式按钮灰掉。
 */
import { describe, expect, it } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { createMdEditor, type MdEditorOptions } from './editor';
import { FORMAT_BAR_ORDER, formatBarState, nextHeading, runFormat, type FormatButtonId } from './format-bar';
import { formatButtonLabel } from './FormatBar';
import { EN } from '../../i18n/en';
import * as es from '../../i18n/locales/es';
import * as ptBR from '../../i18n/locales/pt-BR';
import * as ru from '../../i18n/locales/ru';
import * as ja from '../../i18n/locales/ja';
import * as de from '../../i18n/locales/de';
import * as fr from '../../i18n/locales/fr';
import * as id from '../../i18n/locales/id';

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: () => {}, ...extra });
  const ed = h.editor;
  const sel = (from: number, to = from) => ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, from, to)));
  const run = (b: FormatButtonId, composing = false) => runFormat(ed, b, { mention: true, composing });
  const st = (b: FormatButtonId) => formatBarState(ed, { mention: true }).buttons[b];
  const md2 = () => h.getMarkdown().trim();
  const done = () => {
    h.destroy();
    root.remove();
  };
  return { h, ed, sel, run, st, md: md2, done };
};

describe('按钮和文案', () => {
  it('顺序是 Rei 定的那样', () => {
    expect([...FORMAT_BAR_ORDER]).toEqual(['task', 'bullet', 'ordered', 'heading', 'bold', 'highlight', 'quote', 'code', 'link', 'mention', 'indent', 'outdent', 'up', 'down', 'undo']);
  });

  it('每个按钮的读屏名九种语言都有（中文是 key，英文 + 七种外语都要写）', () => {
    const keyOf: Record<string, string> = {};
    for (const b of FORMAT_BAR_ORDER) keyOf[b] = `格式|${formatButtonLabel(b)}`;
    const keys = [...Object.values(keyOf), '文字格式'];
    for (const k of keys) {
      expect(EN[k], `en ${k}`).toBeTruthy();
      for (const [name, mod] of Object.entries({ es, ptBR, ru, ja, de, fr, id })) expect(mod.MESSAGES[k], `${name} ${k}`).toBeTruthy();
    }
  });

  it('标题按钮一级一级换：正文 → 1 → 2 → 3 → 正文，4–6 级回到正文', () => {
    expect([0, 1, 2, 3, 4, 6].map(nextHeading)).toEqual([1, 2, 3, 0, 0, 0]);
  });
});

describe('点按钮改格式，再点一下取消', () => {
  it('粗体：选中的字加粗，按钮按下；再点去掉', () => {
    const t = setup('abc');
    t.sel(1, 4);
    expect(t.st('bold').active).toBe(false);
    t.run('bold');
    expect(t.md()).toBe('**abc**');
    expect(t.st('bold').active).toBe(true);
    t.run('bold');
    expect(t.md()).toBe('abc');
    t.done();
  });

  it('光标在粗体里：按钮显示按下', () => {
    const t = setup('a **bc** d');
    t.sel(4);
    expect(t.st('bold').active).toBe(true);
    t.sel(1);
    expect(t.st('bold').active).toBe(false);
    t.done();
  });

  it('清单：普通段落 → 没勾的清单项；再点 → 普通列表项', () => {
    const t = setup('abc');
    t.sel(2);
    t.run('task');
    expect(t.md()).toBe('- [ ] abc');
    expect(t.st('task').active).toBe(true);
    expect(t.st('bullet').active).toBe(false);
    t.run('task');
    expect(t.md()).toBe('- abc');
    expect(t.st('bullet').active).toBe(true);
    t.done();
  });

  it('清单项里点列表按钮：变回普通列表项；普通列表里再点：去掉列表', () => {
    const t = setup('- [x] abc');
    t.sel(4);
    t.run('bullet');
    expect(t.md()).toBe('- abc');
    t.run('bullet');
    expect(t.md()).toBe('abc');
    t.done();
  });

  it('编号列表：从清单换过去时去掉勾；再点去掉列表', () => {
    const t = setup('- [ ] a\n- [ ] b');
    t.sel(4);
    t.run('ordered');
    expect(t.md()).toBe('1. a\n2. b');
    expect(t.st('ordered').active).toBe(true);
    t.run('ordered');
    expect(t.md()).not.toMatch(/^1\./);
    t.done();
  });

  it('标题：点一下换一级，第四下回到正文', () => {
    const t = setup('abc');
    t.sel(2);
    const out: string[] = [];
    for (let i = 0; i < 4; i++) {
      t.run('heading');
      out.push(t.md());
    }
    expect(out).toEqual(['# abc', '## abc', '### abc', 'abc']);
    t.done();
  });

  it('高亮：没高亮就加黄色；光标在高亮里交给外面弹色板', () => {
    const t = setup('abc');
    t.sel(1, 4);
    expect(t.run('highlight')).toEqual({ kind: 'done' });
    expect(t.md()).toBe('==abc==');
    t.sel(2);
    expect(t.st('highlight').active).toBe(true);
    const r = t.run('highlight');
    expect(r).toEqual({ kind: 'palette', range: { from: 1, to: 4, color: 'yellow' } });
    t.done();
  });

  it('引用、行内代码', () => {
    const t = setup('abc');
    t.sel(2);
    t.run('quote');
    expect(t.md()).toBe('> abc');
    expect(t.st('quote').active).toBe(true);
    t.run('quote');
    expect(t.md()).toBe('abc');
    t.sel(1, 4);
    t.run('code');
    expect(t.md()).toBe('`abc`');
    expect(t.st('code').active).toBe(true);
    t.done();
  });

  it('链接交给外面开链接框；光标在链接里按钮按下', () => {
    const t = setup('[abc](https://a.com) d');
    t.sel(2);
    expect(t.st('link').active).toBe(true);
    expect(t.run('link')).toEqual({ kind: 'link' });
    t.done();
  });

  it('@：在光标处打 @（前面紧挨字母就先补空格），返回 @ 的位置', () => {
    const t = setup('abc');
    t.sel(4);
    expect(t.run('mention')).toEqual({ kind: 'mention', at: 5 });
    expect(t.md()).toBe('abc @');
    const u = setup('中文');
    u.sel(3);
    expect(u.run('mention')).toEqual({ kind: 'mention', at: 3 });
    expect(u.md()).toBe('中文@');
    t.done();
    u.done();
  });

  it('不能 @ 的编辑器（备注）没有 @ 按钮能点', () => {
    const t = setup('abc');
    expect(formatBarState(t.ed, { mention: false }).buttons.mention.disabled).toBe(true);
    t.done();
  });
});

describe('缩进、移动、撤销', () => {
  it('缩进、减少缩进只在列表里能用', () => {
    const t = setup('abc\n\n- a\n- b');
    t.sel(2);
    expect(t.st('indent').disabled).toBe(true);
    expect(t.st('outdent').disabled).toBe(true);
    // 第二项 b 里
    let pos = -1;
    t.ed.state.doc.descendants((n, at) => {
      if (n.isText && n.text === 'b') pos = at;
    });
    t.sel(pos + 1);
    expect(t.st('indent').disabled).toBe(false);
    t.run('indent');
    expect(t.md()).toBe('abc\n\n- a\n  - b');
    t.run('outdent');
    expect(t.md()).toBe('abc\n\n- a\n- b');
    t.done();
  });

  it('上移、下移挪当前这一块，到头了灰掉', () => {
    const t = setup('one\n\ntwo');
    t.sel(2);
    expect(t.st('up').disabled).toBe(true);
    expect(t.st('down').disabled).toBe(false);
    t.run('down');
    expect(t.md()).toBe('two\n\none');
    expect(t.st('down').disabled).toBe(true);
    t.run('up');
    expect(t.md()).toBe('one\n\ntwo');
    t.done();
  });

  it('撤销：没改过灰掉，加粗后能撤回去', () => {
    const t = setup('abc');
    expect(t.st('undo').disabled).toBe(true);
    t.sel(1, 4);
    t.run('bold');
    expect(t.st('undo').disabled).toBe(false);
    t.run('undo');
    expect(t.md()).toBe('abc');
    t.done();
  });
});

describe('什么时候不动', () => {
  it('输入法正在组字：什么都不做', () => {
    const t = setup('abc');
    t.sel(1, 4);
    expect(t.run('bold', true)).toEqual({ kind: 'skip' });
    expect(t.run('mention', true)).toEqual({ kind: 'skip' });
    expect(t.md()).toBe('abc');
    t.done();
  });

  it('任务第一行是纯文字标题：格式按钮灰掉、点了不动，@ 和撤销还能用；第二行照常', () => {
    const t = setup('标题\n\n正文', { plainTitle: true });
    t.sel(2);
    for (const b of ['task', 'bullet', 'ordered', 'heading', 'bold', 'highlight', 'quote', 'code', 'link', 'indent', 'outdent'] as const) {
      expect(t.st(b).disabled, b).toBe(true);
      expect(t.run(b), b).toEqual({ kind: 'skip' });
    }
    expect(t.st('mention').disabled).toBe(false);
    expect(t.md()).toBe('标题\n\n正文');
    t.sel(5, 7);
    expect(t.st('bold').disabled).toBe(false);
    t.run('bold');
    expect(t.md()).toBe('标题\n\n**正文**');
    t.done();
  });

  it('代码块里格式按钮灰掉', () => {
    const t = setup('```\ncode\n```');
    t.sel(2);
    expect(t.st('bold').disabled).toBe(true);
    expect(t.st('mention').disabled).toBe(true);
    t.done();
  });

  it('只读：都灰掉', () => {
    const t = setup('abc', { readOnly: true });
    expect(FORMAT_BAR_ORDER.every((b) => t.st(b).disabled)).toBe(true);
    t.done();
  });
});
