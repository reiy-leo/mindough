/**
 * 从折叠块里复制（Rei 2026-11-05「details/summary 中复制任何内容，粘贴出来会带上 <details> <summary> 标记」）。
 *
 * ProseMirror 复制时拿的是带上层节点的切片（selection.content() 会带 parents），选区在折叠块里时，
 * 切片外面还包着一层 details，写成 markdown 就成了 `<details><summary>…</summary>…</details>`。
 * - unwrapOpenDetails：选区起点 / 终点在折叠块里面（切片在那一头是「开着的」），就把这层 details 拆掉，
 *   只留里面的内容；带上的标题变成一段普通文字。text/html 和 text/plain 都走它（transformCopied）。
 * - flattenDetails：整块折叠块都选上了，复制成纯文字时也不出现标签：标题一段 + 正文。
 *   只用在 text/plain；text/html 里整块的折叠块照旧（粘回编辑器还是折叠块，别的 App 里只是普通的 div，没有标签字）。
 */
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';

const DETAILS = 'details';
const SUMMARY = 'details_summary';

/** 标题 → 一段普通文字（空标题不要）。 */
function summaryToParagraph(summary: PMNode): PMNode | null {
  const para = summary.type.schema.nodes.paragraph;
  if (!para) return null;
  return para.create(null, summary.content);
}

/** 拆开一个 details：标题换成段落，正文原样。 */
function detailsChildren(details: PMNode, keepEmptySummary: boolean): PMNode[] {
  const out: PMNode[] = [];
  details.forEach((child) => {
    if (child.type.name === SUMMARY) {
      if (!keepEmptySummary && child.content.size === 0) return;
      const p = summaryToParagraph(child);
      if (p) out.push(p);
    } else out.push(child);
  });
  return out;
}

/** 选区在折叠块里开头 / 结尾：拆掉外面那层 details（可能套好几层）。 */
export function unwrapOpenDetails(slice: Slice): Slice {
  let { content, openStart, openEnd } = slice;
  for (let guard = 0; guard < 50; guard++) {
    const first = content.firstChild;
    const last = content.lastChild;
    const single = content.childCount === 1;
    const headOpen = !!first && first.type.name === DETAILS && openStart > 0;
    const tailOpen = !!last && last.type.name === DETAILS && openEnd > 0;
    if (!headOpen && !tailOpen) break;
    const nodes: PMNode[] = [];
    content.forEach((n) => nodes.push(n));
    if (single) {
      // 同一个 details 两头都开着（或只开一头）：整个拆开
      // 起点开着的标题保持开着（是段落了），起点不开时空标题也不要
      const inner = detailsChildren(first!, headOpen && first!.firstChild?.type.name === SUMMARY);
      if (!inner.length) break;
      content = Fragment.fromArray(inner);
      openStart = headOpen ? openStart - 1 : 0;
      openEnd = tailOpen ? openEnd - 1 : 0;
      // 起点在正文里（切片里没有标题）、或在标题里：拆完后第一个孩子的开深度不变，合法
      continue;
    }
    let changed = false;
    if (headOpen) {
      const inner = detailsChildren(first!, first!.firstChild?.type.name === SUMMARY);
      nodes.splice(0, 1, ...inner);
      openStart -= 1;
      changed = true;
    }
    if (tailOpen) {
      const tailNode = nodes[nodes.length - 1]!;
      const inner = detailsChildren(tailNode, false);
      nodes.splice(nodes.length - 1, 1, ...inner);
      openEnd -= 1;
      changed = true;
    }
    if (!changed || !nodes.length) break;
    content = Fragment.fromArray(nodes);
  }
  if (content === slice.content) return slice;
  // 开深度不能超过实际层数（拆到最后只剩空内容等极端情况）
  openStart = Math.min(openStart, depthAtStart(content));
  openEnd = Math.min(openEnd, depthAtEnd(content));
  return new Slice(content, openStart, openEnd);
}

function depthAtStart(f: Fragment): number {
  let d = 0;
  for (let n = f.firstChild; n && !n.isLeaf && !n.isText; n = n.firstChild) d++;
  return d;
}
function depthAtEnd(f: Fragment): number {
  let d = 0;
  for (let n = f.lastChild; n && !n.isLeaf && !n.isText; n = n.lastChild) d++;
  return d;
}

/** 纯文字复制用：把片段里所有（整块选上的）折叠块摊平成「标题一段 + 正文」，一层层往里找。 */
export function flattenDetails(fragment: Fragment): Fragment {
  let found = false;
  const walk = (f: Fragment): Fragment => {
    const out: PMNode[] = [];
    f.forEach((n) => {
      if (n.type.name === DETAILS) {
        found = true;
        walk(Fragment.fromArray(detailsChildren(n, false))).forEach((c) => out.push(c));
        return;
      }
      if (n.isLeaf || n.isTextblock) out.push(n);
      else out.push(n.copy(walk(n.content)));
    });
    return Fragment.fromArray(out);
  };
  const next = walk(fragment);
  return found ? next : fragment;
}
