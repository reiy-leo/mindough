// @vitest-environment happy-dom
/**
 * 任务第一行只能是纯文字（Rei 2026-11-03「任务的标题不渲染任何样式，或者列表，以及其他，任务标题是纯文本不渲染md」）。
 * 输入规则不触发、格式快捷键无效、第二块上来被规范、粘贴、字面文字往返、老数据标题照旧、只在任务里开。
 */
import { describe, expect, it } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { undo } from '@tiptap/pm/history';
import type { EditorView } from '@tiptap/pm/view';
import { firstLine, taskTitle } from '@mindough/core';
import { baseSchema, createMdEditor, markdownIO, type MdEditorOptions } from './editor';
import { isFormatShortcut, normalizeTitleDoc, serializeWithTitle } from './title';

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  root.className = 'md-editor-root';
  document.body.appendChild(root);
  const changes: string[] = [];
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', plainTitle: true, onChange: (m) => changes.push(m), ...extra });
  const view = h.view();
  const done = () => {
    h.destroy();
    root.remove();
  };
  return { h, view, root, changes, done };
};
const type = (view: EditorView, text: string) => {
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
};
const key = (view: EditorView, k: string, mods: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
  view.dom.dispatchEvent(ev);
  return ev.defaultPrevented;
};
const transfer = (data: Record<string, string>) =>
  ({ getData: (t: string) => data[t] ?? '', files: [], types: Object.keys(data), items: [] }) as unknown as DataTransfer;
const paste = (view: EditorView, dt: DataTransfer) => {
  const ev = new Event('paste', { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(ev, 'clipboardData', { value: dt });
  return view.someProp('handlePaste', (f) => f(view, ev, view.state.doc.slice(0, 0)));
};
const at = (view: EditorView, pos: number) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
const endOfFirst = (view: EditorView) => at(view, view.state.doc.firstChild!.nodeSize - 1);
/** 第一块：类型名、有没有格式、文字。 */
const first = (view: EditorView) => {
  const n = view.state.doc.firstChild!;
  let marks = 0;
  n.descendants((c) => void (marks += c.marks.length));
  return { type: n.type.name, marks, text: n.textContent };
};
const plain = (text: string) => ({ type: 'paragraph', marks: 0, text });

describe('第一行打 markdown 不变', () => {
  it.each(['# ', '## ', '- ', '* ', '+ ', '1. ', '> ', '>> ', '[] ', '[x] ', '```', '---', '|3x2| ', '$$ ', '$x$', '**粗**', '*斜*', '_斜_', '~~删~~', '`码`', '[字](https://a.com)', '<https://a.com>', 'https://a.com '])('「%s」', (s) => {
    const { view, done } = setup('');
    type(view, s);
    expect(first(view)).toEqual(plain(s));
    expect(view.state.doc.childCount).toBe(1);
    done();
  });

  it('「**不是粗体** # 1. x」原样存，读回来、显示的标题都一样', () => {
    const s = '**不是粗体** # 1. x';
    const { view, h, done } = setup('');
    type(view, s);
    const md = h.getMarkdown();
    expect(md).toBe('\\*\\*不是粗体\\*\\* # 1. x\n');
    expect(firstLine(md)).toBe(s);
    expect(taskTitle({ body_md: md })).toBe(s);
    done();
    const again = setup(md);
    expect(first(again.view)).toEqual(plain(s));
    expect(again.h.getMarkdown()).toBe(md);
    again.done();
  });

  it('第二行照常：「# 」变标题、「- 」变列表', () => {
    const { view, h, done } = setup('标题');
    endOfFirst(view);
    key(view, 'Enter');
    type(view, '# 小节');
    expect(view.state.doc.child(1).type.name).toBe('heading');
    expect(h.getMarkdown()).toBe('标题\n\n# 小节\n');
    done();
  });
});

describe('第一行的快捷键', () => {
  it.each([
    ['b', { metaKey: true }],
    ['i', { ctrlKey: true }],
    ['u', { metaKey: true }],
    ['e', { metaKey: true }],
    ['k', { metaKey: true }],
    ['1', { metaKey: true, altKey: true, code: 'Digit1' }],
    ['8', { metaKey: true, altKey: true, code: 'Digit8' }],
    ['7', { metaKey: true, altKey: true, code: 'Digit7' }],
    ['c', { metaKey: true, altKey: true, code: 'KeyC' }],
    ['x', { metaKey: true, altKey: true, code: 'KeyX' }],
    ['B', { metaKey: true, shiftKey: true, code: 'KeyB' }],
    ['8', { metaKey: true, shiftKey: true, code: 'Digit8' }],
  ] as [string, KeyboardEventInit][])('%s %o 无效', (k, mods) => {
    const { view, h, changes, done } = setup('标题\n\n正文');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)));
    expect(key(view, k, mods)).toBe(true);
    type(view, '新');
    expect(first(view)).toEqual(plain('新'));
    expect(h.getMarkdown()).toBe('新\n\n正文\n');
    expect(changes.at(-1)).toBe('新\n\n正文\n');
    done();
  });

  it('⌘K 不打开链接框', () => {
    let opened = 0;
    const { view, done } = setup('标题', { onLinkShortcut: () => opened++ });
    endOfFirst(view);
    key(view, 'k', { metaKey: true });
    expect(opened).toBe(0);
    done();
  });

  it('第二行的 ⌘B 照常', () => {
    const { view, h, done } = setup('标题\n\n正文');
    const p = view.state.doc.firstChild!.nodeSize + 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, p, p + 2)));
    // happy-dom 不是 Mac：Tiptap 的 Mod 是 Ctrl
    key(view, 'b', { ctrlKey: true });
    expect(h.getMarkdown()).toBe('标题\n\n**正文**\n');
    done();
  });

  it('Shift+回车、回车：另起一段，不插硬换行', () => {
    const { view, h, done } = setup('');
    type(view, 'ab');
    at(view, 2);
    key(view, 'Enter', { shiftKey: true });
    expect(view.state.doc.childCount).toBe(2);
    expect(h.getMarkdown()).toBe('a\n\nb\n');
    done();
  });

  it('|a|b| 回车不变表格', () => {
    const { view, done } = setup('');
    type(view, '|a|b|');
    key(view, 'Enter');
    expect(first(view)).toEqual(plain('|a|b|'));
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    done();
  });

  it('isFormatShortcut：⌘Z、⌘A、⌘C、⌘V、⌘↩ 不拦', () => {
    const ev = (key: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key, metaKey: true, ...init });
    for (const k of ['z', 'a', 'c', 'v', 'x', 'Enter', 'ArrowLeft', 'Backspace']) expect(isFormatShortcut(ev(k))).toBe(false);
    expect(isFormatShortcut(ev('z', { shiftKey: true }))).toBe(false);
  });
});

describe('第二块上来被规范', () => {
  const removeFirst = (view: EditorView) => view.dispatch(view.state.tr.delete(0, view.state.doc.firstChild!.nodeSize));

  it.each([
    ['标题\n\n## 小节 **粗**', plain('小节 粗'), '小节 粗\n'],
    ['标题\n\n- 一\n- 二', plain('一'), '一\n\n- 二\n'],
    ['标题\n\n- [ ] 清单\n- [x] 完成', plain('清单'), '清单\n\n- [x] 完成\n'],
    ['标题\n\n1. 一\n2. 二', plain('一'), '一\n\n1. 二\n'],
    ['标题\n\n> 引用 *斜*\n>\n> 第二段', plain('引用 斜'), '引用 斜\n\n> 第二段\n'],
    ['标题\n\n```js\nlet a\nlet b\n```', plain('let a'), 'let a\n\n```js\nlet b\n```\n'],
    ['标题\n\n**粗** [链](https://a.com) `码` <u>下</u>', plain('粗 链 码 下'), '粗 链 码 下\n'],
    ['标题\n\n一行\\\n第二行', plain('一行'), '一行\n\n第二行\n'],
  ] as [string, ReturnType<typeof plain>, string][])('%s', (md, expected, out) => {
    const { view, h, done } = setup(md);
    removeFirst(view);
    expect(first(view)).toEqual(expected);
    expect(h.getMarkdown()).toBe(out);
    done();
  });

  it('分隔线、表格上来：前面补一个空段落', () => {
    const { view, done } = setup('标题\n\n---\n\n正文');
    removeFirst(view);
    expect(first(view)).toEqual(plain(''));
    expect(view.state.doc.child(1).type.name).toBe('horizontalRule');
    done();
  });

  it('退格把第一行删空再退格：第二块的列表变成纯文字', () => {
    const { view, done } = setup('a\n\n- 列表');
    // 选中第一行的字删掉，再在空行退格：列表项上来
    view.dispatch(view.state.tr.delete(1, 2));
    at(view, 1);
    key(view, 'Delete');
    expect(first(view).type).toBe('paragraph');
    expect(first(view).marks).toBe(0);
    done();
  });

  it('拖进来 / 程序改成标题、加粗：马上改回纯文字', () => {
    const { view, h, done } = setup('标题\n\n正文');
    view.dispatch(view.state.tr.setNodeMarkup(0, view.state.schema.nodes.heading, { level: 1 }));
    expect(first(view)).toEqual(plain('标题'));
    view.dispatch(view.state.tr.addMark(1, 3, view.state.schema.marks.bold!.create()));
    expect(first(view)).toEqual(plain('标题'));
    expect(h.getMarkdown()).toBe('标题\n\n正文\n');
    done();
  });

  it('撤销以后第一块也还是纯文字', () => {
    const { view, done } = setup('标题\n\n# 小节');
    view.dispatch(view.state.tr.delete(0, view.state.doc.firstChild!.nodeSize));
    expect(first(view)).toEqual(plain('小节'));
    undo(view.state, view.dispatch);
    expect(first(view)).toEqual(plain('标题'));
    expect(view.state.doc.child(1).type.name).toBe('heading');
    done();
  });
});

describe('粘贴到第一行', () => {
  it('一行：原样当文字', () => {
    const { view, h, done } = setup('');
    expect(paste(view, transfer({ 'text/plain': '# **粗** [链](https://a.com)' }))).toBe(true);
    expect(first(view)).toEqual(plain('# **粗** [链](https://a.com)'));
    expect(firstLine(h.getMarkdown())).toBe('# **粗** [链](https://a.com)');
    done();
  });

  it('多行：第一行纯文字，后面照常当 markdown', () => {
    const { view, h, done } = setup('');
    paste(view, transfer({ 'text/plain': '- 标题\n- 列表\n\n**粗**' }));
    expect(first(view)).toEqual(plain('- 标题'));
    expect(h.getMarkdown()).toBe('\\- 标题\n\n- 列表\n\n**粗**\n');
    done();
  });

  it('网页内容（有 HTML）：也只取纯文字', () => {
    const { view, done } = setup('前后');
    at(view, 2);
    paste(view, transfer({ 'text/html': '<b>粗</b>', 'text/plain': '粗' }));
    expect(first(view)).toEqual(plain('前粗后'));
    done();
  });

  it('粘到第二行照常', () => {
    const { view, h, done } = setup('标题\n\n正文');
    at(view, view.state.doc.content.size - 1);
    paste(view, transfer({ 'text/plain': '**粗**' }));
    expect(h.getMarkdown()).toBe('标题\n\n正文**粗**\n');
    done();
  });
});

describe('老数据', () => {
  it.each([
    ['# 标题\n\n正文', '标题'],
    ['- 列表项\n- 二', '列表项'],
    ['**粗体** 标题', '粗体 标题'],
    ['> 引用', '引用'],
    ['- [ ] 清单', '清单'],
  ])('%s：打开显示成纯文字，不写回；标题照旧', (md, title) => {
    expect(taskTitle({ body_md: md })).toBe(title);
    const { view, changes, done } = setup(md);
    expect(first(view)).toEqual(plain(title));
    expect(changes).toEqual([]);
    done();
  });

  it('同步下来的新值也规范，不写回', () => {
    const { view, h, changes, done } = setup('标题');
    h.setMarkdown('## 别处改的\n\n正文');
    expect(first(view)).toEqual(plain('别处改的'));
    expect(changes).toEqual([]);
    done();
  });

  it('改了别处才按新样子存', () => {
    const { view, changes, done } = setup('# 标题\n\n正文');
    at(view, view.state.doc.content.size - 1);
    type(view, '！');
    expect(changes.at(-1)).toBe('标题\n\n正文！\n');
    done();
  });

  it('normalizeTitleDoc / serializeWithTitle 不建编辑器也能用', () => {
    const io = markdownIO(baseSchema());
    const doc = normalizeTitleDoc(io.parse('### *a_b*\n\n正文'));
    expect(serializeWithTitle(io, doc)).toBe('a\\_b\n\n正文\n');
  });
});

describe('只在任务里开', () => {
  it('不开 plainTitle（日记、备注）：第一行照常变格式', () => {
    const { view, h, done } = setup('', { plainTitle: false });
    type(view, '# ');
    expect(view.state.doc.firstChild!.type.name).toBe('heading');
    type(view, '大');
    expect(h.getMarkdown()).toBe('# 大\n');
    done();
  });
});
