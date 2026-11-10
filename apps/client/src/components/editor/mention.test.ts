// @vitest-environment happy-dom
/**
 * @ 提及任务（Rei 2026-11-10）：markdown 往返、老数据不写回、改名后胶囊和写回跟着变、删了显示失效、
 * 打 @ 出候选（组字时不动）、选中插胶囊、第一行插文字、复制只给标题、只读 Markdown 也画胶囊。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { MemoryAdapter, Store, firstLine, plainMarkdown } from '@mindough/core';
import { createMdEditor, roundTrip, type MdEditorOptions, type MentionState } from './editor';
import { mentionAt } from './mention';
import { plainTextOf } from './clipboard';
import { mentionChoices, mentionInfo, openMention, paintMention, setMentionSource } from '../../lib/task-mention';
import { renderMarkdown } from '../../lib/markdown';

let store: Store;
const opened: string[] = [];
const notFound = vi.fn();

beforeEach(async () => {
  store = await Store.open(new MemoryAdapter(), { deviceId: 'dev-a' });
  opened.length = 0;
  notFound.mockReset();
  setMentionSource({ store, open: (id) => opened.push(id), notFound });
});
afterEach(() => setMentionSource(null));

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const changes: string[] = [];
  const states: (MentionState | null)[] = [];
  const h = createMdEditor({
    root,
    value: md,
    placeholder: '',
    label: 'x',
    onChange: (m) => changes.push(m),
    mention: { onState: (s) => states.push(s), onKey: () => false },
    ...extra,
  });
  const view = h.view();
  const done = () => {
    h.destroy();
    root.remove();
  };
  return { h, view, root, changes, states, done };
};
const type = (view: EditorView, text: string) => {
  for (const ch of text) {
    const { from, to } = view.state.selection;
    view.dispatch(view.state.tr.insertText(ch, from, to));
  }
};
const key = (view: EditorView, k: string) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  view.dom.dispatchEvent(ev);
  return ev.defaultPrevented;
};
const toEnd = (view: EditorView) => view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));

describe('markdown 读写', () => {
  it('提及往返一字不差（没有这件任务时用方括号里的字）', () => {
    const md = '看看 [写周报](mindough://task/0199f2a4-7c1e-7000-8000-1a2b3c4d5e6f) 再说\n';
    expect(roundTrip(md)).toBe(md);
    expect(roundTrip('- [ ] 先做 [买菜](mindough://task/0199f2a4-7c1e-7000-8000-000000000001)\n')).toBe('- [ ] 先做 [买菜](mindough://task/0199f2a4-7c1e-7000-8000-000000000001)\n');
  });
  it('标题里有方括号也能往返', () => {
    const md = '见 [\\[草稿\\] 方案](mindough://task/0199f2a4-7c1e-7000-8000-000000000002)\n';
    expect(roundTrip(md)).toBe(md);
  });
  it('别的链接照旧是链接', () => {
    expect(roundTrip('[官网](https://mindough.rei8t.dev)\n')).toBe('[官网](https://mindough.rei8t.dev)\n');
    expect(roundTrip('[今天](mindough://view/myday)\n')).toBe('[今天](mindough://view/myday)\n');
  });
  it('读进来是 taskMention 节点', () => {
    const { view, done } = setup('看 [写周报](mindough://task/0199f2a4-7c1e-7000-8000-1a2b3c4d5e6f)');
    const names: string[] = [];
    view.state.doc.descendants((n) => void names.push(n.type.name));
    expect(names).toContain('taskMention');
    expect(view.dom.querySelector('.task-mention')?.textContent).toBe('写周报');
    done();
  });
});

describe('标题跟着任务走', () => {
  it('改名后胶囊显示新标题；打开不写回；改了别的字时写回新标题', async () => {
    const t = store.createTask({ body_md: '写周报' });
    const md = `正文\n\n看 [写周报](mindough://task/${t.id})\n`;
    const { view, root, changes, done } = setup(md);
    expect(root.querySelector('.task-mention-title')?.textContent).toBe('写周报');
    store.updateTask(t.id, { body_md: '写月报' });
    expect(root.querySelector('.task-mention-title')?.textContent).toBe('写月报');
    expect(changes).toEqual([]);
    toEnd(view);
    type(view, '吧');
    expect(changes.at(-1)).toBe(`正文\n\n看 [写月报](mindough://task/${t.id})吧\n`);
    done();
  });
  it('删了：显示存着的字、失效样式，点了提示找不到', () => {
    const t = store.createTask({ body_md: '旧任务' });
    store.deleteTask(t.id);
    const { root, done } = setup(`正文\n\n看 [旧任务](mindough://task/${t.id})`);
    const pill = root.querySelector('.task-mention')!;
    expect(pill.classList.contains('is-missing')).toBe(true);
    expect(pill.textContent).toBe('旧任务');
    (root.querySelector('.task-mention-node') as HTMLElement).click();
    expect(notFound).toHaveBeenCalled();
    expect(opened).toEqual([]);
    done();
  });
  it('点胶囊打开那件任务', () => {
    const t = store.createTask({ body_md: '买菜' });
    const { root, done } = setup(`[买菜](mindough://task/${t.id})`);
    (root.querySelector('.task-mention-node') as HTMLElement).click();
    expect(opened).toEqual([t.id]);
    done();
  });
  it('倒数日带剩余天数，结束的标出来', () => {
    const c = store.createTask({ body_md: '新年', completion_mode: 'countdown', target_date: '2099-01-01' });
    const d = store.createTask({ body_md: '交房租' });
    store.updateTask(d.id, { status: '完成' });
    expect(mentionInfo(c.id, '').kind).toBe('countdown');
    expect(mentionInfo(c.id, '').suffix).toMatch(/\d/);
    expect(mentionInfo(d.id, '').ended).toBe(true);
    const el = document.createElement('a');
    paintMention(el, c.id, '新年');
    expect(el.classList.contains('is-countdown')).toBe(true);
    expect(el.querySelector('svg')).not.toBeNull();
  });
});

describe('打 @', () => {
  it('@ 后面的字报出来，空格收起', () => {
    const { view, states, done } = setup('正文\n\n');
    toEnd(view);
    type(view, '看@du');
    expect(states.at(-1)).toMatchObject({ query: 'du' });
    expect(mentionAt(view.state)).toMatchObject({ query: 'du' });
    type(view, ' ');
    expect(states.at(-1)).toBeNull();
    done();
  });
  it('组字时不报（不弹、不过滤）', () => {
    const { view, states, done } = setup('正文\n\n');
    toEnd(view);
    type(view, '@');
    const n = states.length;
    Object.defineProperty(view, 'composing', { configurable: true, get: () => true });
    type(view, 'dushu');
    expect(states.length).toBe(n);
    Object.defineProperty(view, 'composing', { configurable: true, get: () => false });
    type(view, '读');
    expect(states.at(-1)).toMatchObject({ query: 'dushu读' });
    done();
  });
  it('代码里、邮箱里不弹', () => {
    const { view, done } = setup('```\nx\n```\n\n');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    type(view, '@a');
    expect(mentionAt(view.state)).toBeNull();
    toEnd(view);
    type(view, 'rei@mail');
    expect(mentionAt(view.state)).toBeNull();
    done();
  });
  it('Esc 收起这一个 @，挪开再打新的又弹', () => {
    const { view, states, done } = setup('正文\n\n');
    toEnd(view);
    type(view, '@a');
    expect(key(view, 'Escape')).toBe(true);
    expect(states.at(-1)).toBeNull();
    type(view, 'b');
    expect(states.at(-1)).toBeNull();
    type(view, ' @');
    expect(states.at(-1)).toMatchObject({ query: '' });
    done();
  });
  it('浮层开着：回车交给浮层；没接就照常', () => {
    const onKey = vi.fn(() => true);
    const { view, done } = setup('正文\n\n', { mention: { onState: () => {}, onKey } });
    toEnd(view);
    type(view, '@a');
    expect(key(view, 'ArrowDown')).toBe(true);
    expect(key(view, 'Enter')).toBe(true);
    expect(onKey.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['down', 'enter']);
    done();
  });
  it('选中：@ 和搜索词换成胶囊，后面补空格，写成链接', () => {
    const t = store.createTask({ body_md: '读书 30 页' });
    const { h, view, changes, done } = setup('正文\n\n');
    toEnd(view);
    type(view, '看@ds');
    const st = mentionAt(view.state)!;
    h.insertMention({ from: st.from, to: st.to }, { id: t.id, title: '读书 30 页' });
    // 后面补的空格在行尾，写出去时去掉了
    expect(changes.at(-1)).toBe(`正文看[读书 30 页](mindough://task/${t.id})\n`);
    expect(view.state.doc.textContent.endsWith(' ')).toBe(true);
    expect(mentionAt(view.state)).toBeNull();
    done();
  });
  it('任务第一行（纯文字标题）：插的是标题文字，不是胶囊', () => {
    const t = store.createTask({ body_md: '读书' });
    const { h, view, changes, done } = setup('', { plainTitle: true });
    type(view, '跟进@d');
    const st = mentionAt(view.state)!;
    h.insertMention({ from: st.from, to: st.to }, { id: t.id, title: '读书' });
    expect(changes.at(-1)).toBe('跟进读书\n');
    done();
  });
  it('老数据第一行是提及：显示成纯文字，不写回；列表标题是那段字', () => {
    const t = store.createTask({ body_md: '买菜' });
    const md = `[买菜](mindough://task/${t.id})\n\n正文\n`;
    const { view, changes, done } = setup(md, { plainTitle: true });
    expect(view.state.doc.firstChild!.textContent).toBe('买菜');
    let has = false;
    view.state.doc.firstChild!.forEach((n) => (has ||= n.type.name === 'taskMention'));
    expect(has).toBe(false);
    expect(changes).toEqual([]);
    expect(firstLine(md)).toBe('买菜');
    done();
  });
});

describe('候选（lib/task-mention mentionChoices）', () => {
  it('任务正文：普通任务、不含自己、不含打卡和倒数日；日记多倒数日；删掉的不列', () => {
    const a = store.createTask({ body_md: '读书' });
    const b = store.createTask({ body_md: '读书会', completion_mode: 'countdown', target_date: '2099-01-01' });
    store.createTask({ body_md: '读书打卡', recurrence: 'FREQ=DAILY' });
    const d = store.createTask({ body_md: '读完' });
    store.deleteTask(d.id);
    expect(mentionChoices('task', null, 'ds').map((c) => c.id)).toEqual([a.id]);
    expect(mentionChoices('task', a.id, '读').map((c) => c.id)).toEqual([]);
    expect(mentionChoices('journal', null, 'ds').map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
  });
  it('没挂来源时是空的', () => {
    setMentionSource(null);
    expect(mentionChoices('task', null, '')).toEqual([]);
    openMention('x');
  });
});

describe('复制、搜索、只读', () => {
  it('复制出去是胶囊上的标题（现在的）', () => {
    const t = store.createTask({ body_md: '写周报' });
    const { view, done } = setup(`看 [旧名](mindough://task/${t.id}) 吧`);
    const doc = view.state.doc;
    expect(plainTextOf(new Slice(doc.content, 0, 0))).toBe('看 写周报 吧');
    done();
  });
  it('搜索按纯文本：方括号里的字', () => {
    expect(plainMarkdown('看 [写周报](mindough://task/0199f2a4-7c1e-7000-8000-1a2b3c4d5e6f)')).toBe('看 写周报');
  });
  it('只读 Markdown：渲染成胶囊占位，就地打开（#/task/<id>）', () => {
    const html = renderMarkdown('看 [写周报](mindough://task/0199f2a4-7c1e-7000-8000-1a2b3c4d5e6f)');
    expect(html).toContain('class="task-mention"');
    expect(html).toContain('data-task-mention="0199f2a4-7c1e-7000-8000-1a2b3c4d5e6f"');
    expect(html).toContain('href="#/task/0199f2a4-7c1e-7000-8000-1a2b3c4d5e6f"');
    expect(html).toContain('>写周报</a>');
  });
});
