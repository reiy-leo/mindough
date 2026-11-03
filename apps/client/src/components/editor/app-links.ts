/**
 * 读入时把正文里裸的「scheme://…」变成链接（Rei 2026-11-03「codex://threads/… 这种 deeplink 点了没反应」）。
 * GFM 的自动链接只认 http(s) / www / 邮箱，别的 App 的链接（codex://、obsidian://、vscode://…）只是普通文字，点不了。
 * 跟在 remarkGfm 后面跑：只改 text 节点，链接、代码里的不动；挡掉的协议（javascript: file: …）不变链接。
 * 写回去是 <codex://…>（和裸的 https 网址写回 <https://…> 一样）。
 */
import { findBareAppLinks } from '../../lib/link-scheme';
import type { MdNode } from './markdown';

const SKIP = new Set(['link', 'linkReference', 'inlineCode', 'code', 'html', 'math', 'inlineMath', 'definition']);

function walk(node: MdNode) {
  const kids = node.children;
  if (!kids || SKIP.has(node.type)) return;
  const next: MdNode[] = [];
  for (const child of kids) {
    if (child.type !== 'text' || typeof child.value !== 'string') {
      walk(child);
      next.push(child);
      continue;
    }
    const text = child.value;
    const hits = findBareAppLinks(text);
    if (!hits.length) {
      next.push(child);
      continue;
    }
    let at = 0;
    for (const h of hits) {
      if (h.start > at) next.push({ type: 'text', value: text.slice(at, h.start) } as MdNode);
      next.push({ type: 'link', url: h.url, title: null, children: [{ type: 'text', value: h.url } as MdNode] } as unknown as MdNode);
      at = h.end;
    }
    if (at < text.length) next.push({ type: 'text', value: text.slice(at) } as MdNode);
  }
  node.children = next;
}

export function remarkAppLinks() {
  return (tree: MdNode) => walk(tree);
}
