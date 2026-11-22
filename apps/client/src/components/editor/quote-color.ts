/**
 * 引用块换颜色（Rei 2026-11-22「blockquote 和 highlight 一样支持多种颜色，点击 blockquote 的左侧切换颜色，左边颜色浓一点」）。
 *
 * 颜色和高亮共用 Notion 九色（灰、棕、橙、黄、绿、蓝、紫、粉、红），外加「默认」（没颜色，和以前一样）。
 * 左边竖条用这个色的浓色（Notion 的文字色），底用同色的浅色（和高亮同一组），亮暗各一套，在 styles/editor.css。
 *
 * 存法：默认引用照旧是 `> 文字`。带颜色的在引用第一行放一个 HTML 注释：
 *     > <!-- color: red -->
 *     > 文字
 *   GitHub、Obsidian 这类阅读器不显示注释，看到的还是普通引用；纯文本里一眼看得懂；引用里的 markdown 不受影响。
 *   读入时只认「引用的第一块就是这一个注释、颜色是九色之一」，别的注释照旧当 HTML 留着。
 *
 * 换色：点引用左边的竖条（手机上点击区更宽），弹和高亮一样的色板（MdEditor.tsx）。点竖条不挪光标；点字照常进去编辑。
 * 换一次色是一步撤销。
 */
import { Extension } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { HIGHLIGHT_COLORS, type HighlightColor } from './highlight';
import type { MdNode, SerializeSpec } from './markdown';

export type QuoteColor = HighlightColor;
export const QUOTE_COLORS = HIGHLIGHT_COLORS;

/** 认的颜色名；别的（含空）是 null = 默认。 */
export const quoteColorOf = (v: unknown): QuoteColor | null => ((QUOTE_COLORS as readonly string[]).includes(String(v ?? '').toLowerCase()) ? (String(v).toLowerCase() as QuoteColor) : null);

/** 引用第一行的颜色注释：`<!-- color: red -->`（空格随意、大小写都行、`=` 也认）。 */
export const QUOTE_COLOR_COMMENT_RE = /^<!--\s*color\s*[:=]\s*([a-z]+)\s*-->$/i;

export const quoteColorComment = (c: QuoteColor) => `<!-- color: ${c} -->`;

/** 块级 HTML 已经包进了段落（markdown.ts 的 remarkHtmlTransformer）；两种都认。 */
const commentColor = (n: MdNode | undefined): QuoteColor | null => {
  if (!n) return null;
  let v: string | null = null;
  if (n.type === 'html') v = String(n.value ?? '');
  else if (n.type === 'paragraph' && n.children?.length === 1 && n.children[0]!.type === 'html') v = String(n.children[0]!.value ?? '');
  if (v == null) return null;
  const m = QUOTE_COLOR_COMMENT_RE.exec(v.trim());
  return m ? quoteColorOf(m[1]) : null;
};

/** mdast：第一块是颜色注释的引用，记下颜色（node.color），去掉那块。 */
export function liftQuoteColors(tree: MdNode) {
  const walk = (node: MdNode) => {
    node.children?.forEach(walk);
    if (node.type !== 'blockquote' || !node.children?.length) return;
    const color = commentColor(node.children[0]);
    if (!color) return;
    node.children.shift();
    node.color = color;
    if (!node.children.length) node.children.push({ type: 'paragraph', children: [] });
  };
  walk(tree);
}

/** remark 插件：读入时认颜色注释；写出时注释和下一块之间不空行（`> <!-- color: red -->` 下一行紧跟 `> 文字`）。 */
export function remarkQuoteColor(this: { data(): Record<string, unknown[]> }) {
  const data = this.data() as Record<string, unknown[] | undefined>;
  (data.toMarkdownExtensions ??= []).push({
    join: [(left: MdNode) => (left.type === 'html' && left.data?.quoteColorMarker ? 0 : undefined)],
  });
  return (tree: MdNode) => liftQuoteColors(tree);
}

/** 写出：带颜色的引用第一块放注释。 */
export const quoteColorSerialize: Record<string, SerializeSpec> = {
  blockquote: {
    node: (s, node) => {
      s.openNode('blockquote');
      const c = quoteColorOf(node.attrs.color);
      if (c) s.addNode('html', undefined, quoteColorComment(c), { data: { quoteColorMarker: true } });
      s.next(node.content).closeNode();
    },
  },
};

// ───────── 换色 ─────────

/** pos 处那个引用块换成 color（null = 默认）；pos 不是引用块、颜色没变给 null。 */
export function setQuoteColorTr(state: EditorState, pos: number, color: QuoteColor | null): Transaction | null {
  const node = pos >= 0 && pos < state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (!node || node.type.name !== 'blockquote') return null;
  if (quoteColorOf(node.attrs.color) === color) return null;
  // 单独成一步撤销（连着换几次色也一次撤一步，不和前后的打字并在一起）
  return closeHistory(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, color }));
}

/** 点了一个引用块的竖条：位置（引用块前面）、现在的颜色、点的地方（屏幕坐标，色板贴着放）。 */
export interface QuoteHit {
  pos: number;
  color: QuoteColor | null;
  anchor: { left: number; top: number; bottom: number };
}

export interface QuoteColorHooks {
  onBarClick?: (hit: QuoteHit) => void;
}

/**
 * 竖条的点击区：引用块边框外沿往外 out、往里 inside（像素）。手机（粗指针）宽一些。
 * 和 styles/editor.css 里 blockquote::before 的位置一一对应（往外那一截靠 ::before 接住点击）；往里不超过竖条加左内边距，免得点不到第一个字。
 */
export function barHitZone(coarse: boolean) {
  return coarse ? { out: 12, inside: 16 } : { out: 4, inside: 12 };
}

/** 点在 blockquote 元素左边那条点击区里吗（只看 x）。 */
export function inBar(clientX: number, rectLeft: number, coarse: boolean) {
  const z = barHitZone(coarse);
  return clientX >= rectLeft - z.out && clientX <= rectLeft + z.inside;
}

const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** 从点中的元素往上找最近的、在编辑器里的 blockquote，且点在它的竖条上。 */
function barTarget(dom: HTMLElement, event: MouseEvent): HTMLElement | null {
  let el = (event.target as HTMLElement | null)?.closest?.('blockquote') as HTMLElement | null;
  const coarse = isCoarse() || (event as PointerEvent).pointerType === 'touch';
  // 嵌套引用：点到外层竖条时 target 是外层；点到内层竖条时 target 是内层，都按 x 判断，内层不中再看外层
  while (el && dom.contains(el)) {
    if (inBar(event.clientX, el.getBoundingClientRect().left, coarse)) return el;
    el = el.parentElement?.closest('blockquote') as HTMLElement | null;
  }
  return null;
}

export const quoteColorKey = new PluginKey('md-quote-color');

/** 点引用块左边竖条弹色板（只在能编辑时）；点竖条不挪光标、不弹键盘。 */
export function quoteColorExtension(hooks: () => QuoteColorHooks = () => ({})) {
  return Extension.create({
    name: 'mindoughQuoteColor',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: quoteColorKey,
          props: {
            handleDOMEvents: {
              mousedown(view, event) {
                if (!view.editable || event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
                const el = barTarget(view.dom, event);
                if (!el) return false;
                let pos: number;
                try {
                  pos = view.posAtDOM(el, 0) - 1;
                } catch {
                  return false;
                }
                const node: PMNode | null = pos >= 0 ? view.state.doc.nodeAt(pos) : null;
                if (!node || node.type.name !== 'blockquote') return false;
                event.preventDefault();
                const r = el.getBoundingClientRect();
                hooks().onBarClick?.({ pos, color: quoteColorOf(node.attrs.color), anchor: { left: r.left, top: event.clientY - 8, bottom: event.clientY + 8 } });
                return true;
              },
            },
          },
        }),
      ];
    },
  });
}
