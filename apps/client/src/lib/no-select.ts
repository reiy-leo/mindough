/**
 * 界面文字不能选（Rei 2026-11-04「界面不能selection」）：像原生 App 一样，侧栏、按钮、列表行、标签、
 * 菜单这些拖选、双击都不出选区，手机长按也不出系统的选字和放大镜。样式在 app.css 开头：
 * 根节点 user-select: none，下面这些地方再打开（编辑器、输入框、Markdown 只读内容、标了 data-selectable 的）。
 *
 * ⌘A / Ctrl+A：焦点在输入框或编辑器里照常全选；不在的话不选整页——
 * 选区已经落在某段能选的内容里（比如发出去的日记正文）就只选这一段，否则什么也不做。
 * Tauri 菜单栏「编辑 → 全选」点鼠标那一下走的是原生命令、不经过这里，但它也只会选中能选的内容。
 */

/** 能打字的地方。 */
export const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
/** 只读但要能选、能复制的内容：Markdown 渲染结果、只读编辑器、单独标出来的。 */
export const SELECTABLE_SELECTOR = '.md, .ProseMirror, [data-selectable]';

interface ClosestLike {
  closest?: (selector: string) => unknown;
  parentElement?: ClosestLike | null;
}

function closestOf(target: unknown, selector: string): unknown {
  let el = target as ClosestLike | null | undefined;
  if (el && typeof el.closest !== 'function') el = el.parentElement ?? null; // 文字节点按父元素算
  if (!el || typeof el.closest !== 'function') return null;
  return el.closest(selector) ?? null;
}

/** 焦点在能打字的地方。 */
export function isEditable(target: unknown): boolean {
  return closestOf(target, EDITABLE_SELECTOR) != null;
}

/** 包着这个节点的、能选的只读内容块（没有就 null）。 */
export function selectableBlock(node: unknown): unknown {
  return closestOf(node, SELECTABLE_SELECTOR);
}

/** 是不是 ⌘A（Mac）/ Ctrl+A：不带 Shift、Alt。 */
export function isSelectAllKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean {
  if (e.shiftKey || e.altKey) return false;
  if (!(e.metaKey || e.ctrlKey)) return false;
  return e.code === 'KeyA' || e.key === 'a' || e.key === 'A';
}

interface DocLike {
  activeElement: unknown;
  getSelection(): { anchorNode: unknown; selectAllChildren(n: Node): void } | null;
}

/** 装上 ⌘A 拦截；返回卸载函数。 */
export function installSelectAllGuard(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  doc: DocLike = document,
): () => void {
  const on = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (e.defaultPrevented || !isSelectAllKey(e)) return;
    if (isEditable(e.target) || isEditable(doc.activeElement)) return;
    e.preventDefault();
    const sel = doc.getSelection();
    const block = sel ? selectableBlock(sel.anchorNode) : null;
    if (sel && block) sel.selectAllChildren(block as Node);
  };
  target.addEventListener('keydown', on);
  return () => target.removeEventListener('keydown', on);
}
