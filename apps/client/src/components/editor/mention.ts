/**
 * 编辑器里的 @ 提及任务（Rei 2026-11-10「任务编辑器、日记编辑器中可以用@选择任务，日记中可@任务和倒数日」）。
 *
 * - 节点 taskMention：行内、整个当一个字（atom），属性 id（任务 id）和 label（markdown 里存的那段字）。
 *   画出来是胶囊（lib/task-mention.ts paintMention），按 id 取现在的标题；点一下打开那件任务。
 * - 读写：markdown 里是普通链接 `[标题](mindough://task/<id>)`。读入时 remarkTaskMentions 把这种链接换成节点；
 *   写出时写回链接，方括号里换成这件任务现在的标题（这台设备上找不到就照旧用 label）。老客户端看到的是一条普通链接。
 * - 打 @：mentionExtension 盯着光标前的字（core mentionQueryAt），有 @ 就把位置和搜索词交给外面（MdEditor 画候选浮层）。
 *   输入法组字时不动（不弹、不过滤），上屏后再看；↑ ↓ 换、回车 / Tab 选、Esc 收起（这一个 @ 不再弹，挪开再打一个才弹）。
 *   代码块、行内代码里不弹。优先级 1900：低于 ime-guard（选词的回车先给它），高于纯文字标题（回车另起一段）和行为扩展（Esc 关详情）。
 * - 任务第一行是纯文字标题（title.ts）：在第一行选中候选，插的是标题文字，不是胶囊；别处挪到第一行的胶囊也会变成文字。
 */
import { Extension, Node as TiptapNode } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { mentionHref, mentionIdOf, mentionQueryAt } from '@mindough/core';
import { mentionTitle, openMention, paintMention, subscribeMentions } from '../../lib/task-mention';
import type { MdNode, ParseSpec, SerializeSpec } from './markdown';
import { titleLocked } from './title';

/** 胶囊显示的字（复制、第一行变文字时用）：现在的标题，找不到用存着的字。 */
export const mentionText = (node: PMNode) => mentionTitle(String(node.attrs.id ?? '')) ?? String(node.attrs.label ?? '');

export const TaskMention = TiptapNode.create({
  name: 'taskMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  // 不能再套链接（写出去会成链接套链接），行内代码里也不放
  marks: 'bold italic strike underline',
  addAttributes: () => ({ id: { default: '', rendered: false }, label: { default: '', rendered: false } }),
  extendNodeSchema: () => ({ leafText: (node: PMNode) => mentionText(node) }),
  parseHTML: () => [
    {
      tag: 'a[data-task-mention]',
      priority: 60,
      getAttrs: (dom) => ({ id: (dom as HTMLElement).dataset.taskMention ?? '', label: (dom as HTMLElement).textContent ?? '' }),
    },
  ],
  renderHTML: ({ node }) => ['a', { href: mentionHref(String(node.attrs.id)), 'data-task-mention': String(node.attrs.id) }, String(node.attrs.label)],
  addNodeView() {
    return ({ node }) => {
      let cur = node;
      const dom = document.createElement('span');
      dom.className = 'task-mention-node';
      dom.contentEditable = 'false';
      const pill = document.createElement('span');
      pill.setAttribute('role', 'link');
      dom.appendChild(pill);
      const paint = () => paintMention(pill, String(cur.attrs.id), String(cur.attrs.label));
      paint();
      const off = subscribeMentions(paint);
      // 按下不放光标、不选中；松开打开（手机的点按也走 click）
      dom.addEventListener('mousedown', (e) => {
        if (e.button === 0) e.preventDefault();
      });
      dom.addEventListener('click', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        openMention(String(cur.attrs.id));
      });
      return {
        dom,
        update(next: PMNode) {
          if (next.type !== cur.type) return false;
          cur = next;
          paint();
          return true;
        },
        stopEvent: (e: Event) => e.type === 'mousedown' || e.type === 'click',
        ignoreMutation: () => true,
        destroy: off,
      };
    };
  },
});

// ───────── markdown 读写 ─────────

const textOf = (n: MdNode): string => (typeof n.value === 'string' ? n.value : (n.children ?? []).map(textOf).join(''));

/** 读入：`[字](mindough://task/<id>)` 换成 taskMention 节点（别的链接不动）。跟在 remarkAppLinks、remark-inline-links 后面。 */
export function remarkTaskMentions() {
  const walk = (node: MdNode) => {
    const kids = node.children;
    if (!kids) return;
    node.children = kids.map((c) => {
      if (c.type === 'link') {
        const id = mentionIdOf(String(c.url ?? ''));
        if (id) return { type: 'taskMention', id, label: textOf(c) } as MdNode;
      }
      walk(c);
      return c;
    });
  };
  return (tree: MdNode) => walk(tree);
}

export const mentionParse: ParseSpec[] = [
  { name: 'taskMention', match: (n) => n.type === 'taskMention', run: (s, n, t) => void s.addNode(t, { id: String(n.id ?? ''), label: String(n.label ?? '') }) },
];

export const mentionSerialize: Record<string, SerializeSpec> = {
  taskMention: {
    node: (s, node) => {
      const id = String(node.attrs.id ?? '');
      const label = mentionText(node) || String(node.attrs.label ?? '');
      s.addNode('link', label ? [{ type: 'text', value: label }] : [], undefined, { url: mentionHref(id), title: null });
    },
  },
};

// ───────── 打 @ ─────────

/** 正在打的 @：from 是 @ 的位置，to 是光标，query 是 @ 后面的字。 */
export interface MentionState {
  from: number;
  to: number;
  query: string;
}

export interface MentionHooks {
  /** 有 / 没有正在打的 @（位置或搜索词变了也通知）。 */
  onState: (s: MentionState | null) => void;
  /** 浮层开着时的按键；返回 true = 浮层接了（回车选中了一条）。 */
  onKey: (key: 'up' | 'down' | 'enter') => boolean;
}

export const mentionKey = new PluginKey('md-mention');

/** 光标前有没有正在打的 @（不看组字、焦点；代码里不算）。 */
export function mentionAt(state: EditorState): MentionState | null {
  const sel = state.selection;
  if (!sel.empty || !(sel instanceof TextSelection)) return null;
  const $p = sel.$from;
  const parent = $p.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  if ($p.marks().some((m) => m.type.name === 'code')) return null;
  // 行内的非文字节点（胶囊、公式、硬换行）各算一个字，位置才对得上
  const before = parent.textBetween(0, $p.parentOffset, undefined, '\ufffc');
  const m = mentionQueryAt(before);
  if (!m) return null;
  return { from: $p.start() + m.at, to: sel.from, query: m.query };
}

/** 把 [from, to)（@ 和搜索词）换成提及；第一行是纯文字标题时换成标题文字。光标放在后面。 */
export function insertMention(view: EditorView, range: { from: number; to: number }, task: { id: string; title: string }) {
  const { state } = view;
  const size = state.doc.content.size;
  if (range.from < 0 || range.to > size || range.from > range.to) return;
  const schema = state.schema;
  let tr = state.tr;
  if (titleLocked(state, range.from)) {
    tr = task.title ? tr.insertText(task.title, range.from, range.to) : tr.delete(range.from, range.to);
    tr.setSelection(TextSelection.create(tr.doc, range.from + task.title.length));
  } else {
    const node = schema.nodes.taskMention!.create({ id: task.id, label: task.title });
    const next = state.doc.textBetween(range.to, Math.min(range.to + 1, state.doc.resolve(range.to).end()), '', '\ufffc');
    const nodes = /^\s/.test(next) ? [node] : [node, schema.text(' ')];
    tr = tr.replaceWith(range.from, range.to, nodes);
    tr.setSelection(TextSelection.create(tr.doc, range.from + node.nodeSize + 1));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

const composing = (view: EditorView, e: KeyboardEvent) => e.isComposing || e.keyCode === 229 || view.composing;

export function mentionExtension(hooks: () => MentionHooks) {
  return Extension.create({
    name: 'mindoughMention',
    priority: 1900,
    addProseMirrorPlugins() {
      /** 现在开着的 @；Esc 收起的那个 @ 的位置（光标还在它后面就不再弹）。 */
      let current: MentionState | null = null;
      let dismissed: number | null = null;
      let lastKey = '';
      const report = (s: MentionState | null) => {
        current = s;
        const k = s ? `${s.from}:${s.to}:${s.query}` : '';
        if (k === lastKey) return;
        lastKey = k;
        hooks().onState(s);
      };
      const check = (view: EditorView) => {
        // 组字时不弹、不过滤：浮层停在上屏前的样子，上屏后再看
        if (view.composing) return;
        if (!view.editable) return report(null);
        let s = mentionAt(view.state);
        if (!s) dismissed = null;
        else if (s.from === dismissed) s = null;
        report(s);
      };
      return [
        new Plugin({
          key: mentionKey,
          view(view) {
            return {
              update: (v) => check(v),
              destroy: () => {
                if (current) hooks().onState(null);
                current = null;
              },
            };
          },
          props: {
            handleDOMEvents: {
              compositionend: (view) => {
                // ProseMirror 收完组字会再派一个事务；万一没有（文字没变），这里补看一眼
                setTimeout(() => !view.isDestroyed && check(view), 30);
                return false;
              },
              focus: (view) => {
                setTimeout(() => !view.isDestroyed && check(view), 0);
                return false;
              },
            },
            handleKeyDown(view, event) {
              if (!current || composing(view, event)) return false;
              if (event.metaKey || event.ctrlKey || event.altKey) return false;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                hooks().onKey(event.key === 'ArrowDown' ? 'down' : 'up');
                event.preventDefault();
                return true;
              }
              if ((event.key === 'Enter' && !event.shiftKey) || (event.key === 'Tab' && !event.shiftKey)) {
                if (!hooks().onKey('enter')) return false;
                event.preventDefault();
                event.stopPropagation();
                return true;
              }
              if (event.key === 'Escape') {
                dismissed = current.from;
                report(null);
                event.preventDefault();
                event.stopPropagation();
                return true;
              }
              return false;
            },
          },
        }),
      ];
    },
  });
}
