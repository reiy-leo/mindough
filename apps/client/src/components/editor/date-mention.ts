/**
 * 编辑器里 @ 插进去的日期、时间（Rei 2026-11-20 12:08，存法见 core date-mention.ts）。
 *
 * - 节点 dateMention：行内、整个当一个字（atom），属性 ms（Unix 毫秒）和 label（markdown 方括号里存的绝对写法）。
 *   画出来是胶囊（lib/date-mention.ts paintDateMention）：绝对 / 相对显示跟着设置走，悬停是完整时间；点它不做事。
 * - 读写：`[2026-11-20 12:03](__datetime:<毫秒>)`。读入时 remarkDateMentions 把这种链接换成节点，写出时原样写回链接，
 *   方括号里一直是存着的 label，不随显示设置变。它不是链接 mark，所以补 https://、链接框、链接浮层都碰不到它。
 * - 复制出去是 label 的字（leafText）；任务第一行纯文字标题里插的是 label 文字，别处挪到第一行的胶囊也变成文字（title.ts）。
 */
import { Node as TiptapNode } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { dateMentionHref, dateMentionMsOf, type DateMention } from '@mindough/core';
import { paintDateMention, subscribeDateMentions } from '../../lib/date-mention';
import type { MdNode, ParseSpec, SerializeSpec } from './markdown';
import { titleLocked } from './title';

const msOf = (node: PMNode) => Number(node.attrs.ms) || 0;
const labelOf = (node: PMNode) => String(node.attrs.label ?? '');

export const DateMentionNode = TiptapNode.create({
  name: 'dateMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  // 不能再套链接（写出去会成链接套链接），行内代码里也不放
  marks: 'bold italic strike underline',
  addAttributes: () => ({ ms: { default: 0, rendered: false }, label: { default: '', rendered: false } }),
  // extendNodeSchema 会套到每一种节点上：只给自己加 leafText，别盖掉 taskMention 的
  extendNodeSchema: (ext) => (ext.name === 'dateMention' ? { leafText: (node: PMNode) => labelOf(node) } : {}),
  parseHTML: () => [
    {
      tag: 'span[data-date-mention]',
      priority: 60,
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const ms = dateMentionMsOf(`__datetime:${el.dataset.dateMention ?? ''}`);
        return ms == null ? false : { ms, label: el.dataset.label ?? el.textContent ?? '' };
      },
    },
  ],
  renderHTML: ({ node }) => ['span', { 'data-date-mention': String(msOf(node)), 'data-label': labelOf(node) }, labelOf(node)],
  addNodeView() {
    return ({ node }) => {
      let cur = node;
      const dom = document.createElement('span');
      dom.className = 'date-mention-node';
      dom.contentEditable = 'false';
      const pill = document.createElement('span');
      dom.appendChild(pill);
      const paint = () => paintDateMention(pill, msOf(cur), labelOf(cur));
      paint();
      const off = subscribeDateMentions(paint);
      return {
        dom,
        update(next: PMNode) {
          if (next.type !== cur.type) return false;
          cur = next;
          paint();
          return true;
        },
        ignoreMutation: () => true,
        destroy: off,
      };
    };
  },
});

// ───────── markdown 读写 ─────────

const textOf = (n: MdNode): string => (typeof n.value === 'string' ? n.value : (n.children ?? []).map(textOf).join(''));

/** 读入：`[字](__datetime:<毫秒>)` 换成 dateMention 节点（别的链接不动）。 */
export function remarkDateMentions() {
  const walk = (node: MdNode) => {
    const kids = node.children;
    if (!kids) return;
    node.children = kids.map((c) => {
      if (c.type === 'link') {
        const ms = dateMentionMsOf(String(c.url ?? ''));
        if (ms != null) return { type: 'dateMention', ms, label: textOf(c) } as MdNode;
      }
      walk(c);
      return c;
    });
  };
  return (tree: MdNode) => walk(tree);
}

export const dateMentionParse: ParseSpec[] = [
  { name: 'dateMention', match: (n) => n.type === 'dateMention', run: (s, n, t) => void s.addNode(t, { ms: Number(n.ms) || 0, label: String(n.label ?? '') }) },
];

export const dateMentionSerialize: Record<string, SerializeSpec> = {
  dateMention: {
    node: (s, node) => {
      const label = labelOf(node);
      s.addNode('link', label ? [{ type: 'text', value: label }] : [], undefined, { url: dateMentionHref(msOf(node)), title: null });
    },
  },
};

/** 把 [from, to)（@ 和搜索词）换成日期胶囊；第一行是纯文字标题时换成 label 文字。光标放在后面。 */
export function insertDateMention(view: EditorView, range: { from: number; to: number }, d: DateMention) {
  const { state } = view;
  const size = state.doc.content.size;
  if (range.from < 0 || range.to > size || range.from > range.to) return;
  const schema = state.schema;
  let tr = state.tr;
  if (titleLocked(state, range.from) || !schema.nodes.dateMention) {
    tr = tr.insertText(d.label, range.from, range.to);
    tr.setSelection(TextSelection.create(tr.doc, range.from + d.label.length));
  } else {
    const node = schema.nodes.dateMention.create({ ms: d.ms, label: d.label });
    const next = state.doc.textBetween(range.to, Math.min(range.to + 1, state.doc.resolve(range.to).end()), '', '\ufffc');
    const nodes = /^\s/.test(next) ? [node] : [node, schema.text(' ')];
    tr = tr.replaceWith(range.from, range.to, nodes);
    tr.setSelection(TextSelection.create(tr.doc, range.from + node.nodeSize + 1));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}
