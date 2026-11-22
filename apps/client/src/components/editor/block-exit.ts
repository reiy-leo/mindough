/**
 * 方向键跳出表格（Rei 2026-11-22「最后一行，按 ↓，光标横过来了，应该是竖着的」）。
 *
 * 以前表格在正文最后，光标在最后一行按 ↓，出来的是 ProseMirror 的空隙光标（表格下面一条横线）。现在：
 * - 表格最后一行（哪一格都行）按 ↓，或最后一格末尾按 →：表格后面没有能放文字光标的块时，直接在表格后面插一个空段落，
 *   普通的竖光标放进去。一次撤销就撤掉。表格后面已经有段落，照原来的跳过去，什么都不插。
 * - 表格是正文第一块：第一行按 ↑，或第一格开头按 ←，同样在表格前面插一个空段落（代定）。
 * - 不只表格：别的块在最前 / 最后、方向键会走到空隙光标的地方，也一样插段落。现在有分割线（选中时）、表格套在引用 / 列表里、
 *   块级公式这类整块选中的。代码块不用管：Tiptap 自己会在代码块最后一行按 ↓ 时补段落；引用、列表、折叠块、提示块最后是段落，本来就没有空隙光标。
 * - 判断「会不会出空隙光标」直接用 GapCursor.valid，和 ProseMirror 自己的规则一致。
 * - 多格选区、Shift / ⌥ / Ctrl / ⌘ 加方向键、输入法组字、只读：都不管，照原来的。
 *
 * 插的空段落写回 markdown：
 * - 正文最后一个空段落本来就不写（markdown.ts「最后一个空段落是打字的地方」）。
 * - 插在别处的（表格前面、表格和分割线之间），只要还空着，写回时当它不存在（exitParas），不会多出 `<br />`；打了字就照常写。
 *   空段落留在编辑器里不删，光标离开也不删（免得撤销时对不上）；下次打开就没了，因为没写进去。
 */
import { Extension } from '@tiptap/core';
import { Fragment, type Node as PMNode, type ResolvedPos } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { closeHistory } from '@tiptap/pm/history';
import type { EditorView } from '@tiptap/pm/view';

export type ExitKey = 'ArrowDown' | 'ArrowRight' | 'ArrowUp' | 'ArrowLeft';

const forward = (k: ExitKey) => k === 'ArrowDown' || k === 'ArrowRight';
const vertical = (k: ExitKey) => k === 'ArrowDown' || k === 'ArrowUp';

/** 记着方向键插的段落（位置随改动挪）；写回时还空着的就跳过。 */
export const exitParaKey = new PluginKey<number[]>('md-exit-para');

const META = 'mdExitPara';

/** ProseMirror 判断某处能不能放空隙光标的规则（GapCursor.valid，类型里标成 internal 没导出）；万一哪天没了，当作能放。 */
const gapValid = ($pos: ResolvedPos) => {
  const valid = (GapCursor as unknown as { valid?: ($p: ResolvedPos) => boolean }).valid;
  return valid ? valid.call(GapCursor, $pos) : true;
};

/** 从 $pos 往 dir 方向还有没有能放文字光标的地方。 */
const textAhead = (doc: PMNode, pos: number, dir: 1 | -1) => !!Selection.findFrom(doc.resolve(pos), dir, true);

/** 光标所在最里层表格：表格的深度、光标在第几行。 */
function tableAt(sel: Selection): { depth: number; row: number; rows: number } | null {
  const $h = sel.$head;
  for (let d = $h.depth; d > 0; d--) {
    if ($h.node(d).type.spec.tableRole !== 'table') continue;
    if ($h.depth <= d) return null;
    return { depth: d, row: $h.index(d), rows: $h.node(d).childCount };
  }
  return null;
}

/**
 * 按方向键要不要插空段落：要就给出插段落的 tr（光标在新段落里），不要就 null（照原来的走）。
 * atEdge：光标在这一段的最后一行 / 第一行（↓ / ↑），或末尾 / 开头（→ / ←）。真编辑器里用 view.endOfTextblock 量。
 */
export function blockExitTr(state: EditorState, key: ExitKey, atEdge: boolean): Transaction | null {
  const sel = state.selection;
  const fwd = forward(key);
  const dir = fwd ? 1 : -1;
  const { doc } = state;
  let top: number; // 光标所在顶层块的下标
  if (sel instanceof TextSelection) {
    if (!sel.empty || !atEdge || sel.$head.depth < 2) return null; // 顶层段落本身不归这里管
    const $h = sel.$head;
    // → / ← 只认真在一段的末尾 / 开头
    if (!vertical(key) && $h.parentOffset !== (fwd ? $h.parent.content.size : 0)) return null;
    top = $h.index(0);
    // 光标前方（这一段以外）还有字的地方：一般就照原来的走；表格例外——↓ 在最后一行任意格、↑ 在第一行任意格都算到头
    const pastBlock = fwd ? $h.after() : $h.before();
    if (textAhead(doc, pastBlock, dir)) {
      const t = vertical(key) ? tableAt(sel) : null;
      if (!t || t.row !== (fwd ? t.rows - 1 : 0)) return null;
      const tablePast = fwd ? $h.after(t.depth) : $h.before(t.depth);
      if (textAhead(doc, tablePast, dir)) return null;
    }
  } else if (sel instanceof NodeSelection && sel.$from.depth === 0) {
    top = sel.$from.index(0);
  } else return null; // 多格选区、空隙光标、选中了里面的节点
  const node = doc.child(top);
  let edge = 0;
  for (let i = 0; i < top; i++) edge += doc.child(i).nodeSize;
  if (fwd) edge += node.nodeSize;
  // 这一块外面那一边已经有能放光标的块了（段落、标题……），照原来的走过去
  if (textAhead(doc, edge, dir)) return null;
  // 那里不会出空隙光标（ProseMirror 自己的规则），也不管
  if (!gapValid(doc.resolve(edge))) return null;
  const para = state.schema.nodes.paragraph;
  if (!para) return null;
  const tr = state.tr.insert(edge, para.create());
  tr.setSelection(TextSelection.create(tr.doc, edge + 1));
  tr.setMeta(META, edge);
  return closeHistory(tr).scrollIntoView();
}

/** 写回前去掉还空着的方向键段落（正文最后那个本来就不写，这里一起去掉也一样）。没有就原样返回。 */
export function withoutExitParas(state: EditorState, doc: PMNode = state.doc): PMNode {
  const at = exitParaKey.getState(state);
  if (!at?.length || doc !== state.doc) return doc;
  const drop = new Set(at);
  const kept: PMNode[] = [];
  let pos = 0;
  let changed = false;
  doc.forEach((n) => {
    if (drop.has(pos) && n.type.name === 'paragraph' && n.content.size === 0 && doc.childCount > 1) changed = true;
    else kept.push(n);
    pos += n.nodeSize;
  });
  if (!changed || !kept.length) return doc;
  return doc.copy(Fragment.fromArray(kept));
}

const composing = (view: EditorView, e: KeyboardEvent) => e.isComposing || e.keyCode === 229 || view.composing;
const DIR: Record<ExitKey, 'down' | 'right' | 'up' | 'left'> = { ArrowDown: 'down', ArrowRight: 'right', ArrowUp: 'up', ArrowLeft: 'left' };

/** 优先级 1650：低于移动行（1700，⌥↑↓ / Ctrl+↑↓ 先过它），高于表格、空隙光标自带的方向键处理。 */
export function blockExitExtension() {
  return Extension.create({
    name: 'mindoughBlockExit',
    priority: 1650,
    addProseMirrorPlugins() {
      return [
        new Plugin<number[]>({
          key: exitParaKey,
          state: {
            init: () => [],
            apply(tr, prev, _old, next) {
              const added = tr.getMeta(META) as number | undefined;
              let list = prev;
              if (tr.docChanged && list.length) {
                list = list
                  .map((p) => tr.mapping.mapResult(p, 1))
                  .filter((r) => !r.deleted)
                  .map((r) => r.pos)
                  // 还是顶层的空段落才记着；打了字的就不管了
                  .filter((p) => {
                    const $p = next.doc.resolve(p);
                    const n = $p.depth === 0 ? next.doc.nodeAt(p) : null;
                    return !!n && n.type.name === 'paragraph' && n.content.size === 0;
                  });
              }
              if (added != null) list = [...list.filter((p) => p !== added), added];
              return list;
            },
          },
          props: {
            handleKeyDown(view, event) {
              const key = event.key as ExitKey;
              if (!(key in DIR) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
              if (!view.editable || composing(view, event)) return false;
              const sel = view.state.selection;
              const atEdge = sel instanceof TextSelection ? view.endOfTextblock(DIR[key]) : true;
              const tr = blockExitTr(view.state, key, atEdge);
              if (!tr) return false;
              event.preventDefault();
              view.dispatch(tr);
              return true;
            },
          },
        }),
      ];
    },
  });
}
