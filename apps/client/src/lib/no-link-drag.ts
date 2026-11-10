/**
 * 界面里的链接、图片拖不出系统的拖拽预览（Rei 2026-11-11：Mac 客户端拖侧栏项目时出现 WebKit 的链接预览，
 * 白卡片写着标题和 tauri://localhost#/groups/… 网址，还带绿色加号）。
 *
 * 侧栏、「更多」页、底栏、设置列表、资料库卡片、返回链接这些都是 <a href>，WebKit / Chromium 默认能把它当链接拖走。
 * 能拖动排序的地方（侧栏置顶项、React Aria 的列表）用的是自己的拖动，系统这层预览不该出来。
 *
 * 两层：
 * - app.css 开头：a[href]、img 默认 -webkit-user-drag: none（WebKit、Chromium、WebView2 都认），根本不开始拖；
 * - 这里在捕获阶段拦 dragstart：拖的是链接或图片本身就 preventDefault（Firefox 不认 -webkit-user-drag，靠这层）。
 *
 * 不拦的：
 * - 编辑器和只读 Markdown（.ProseMirror、.md）里的链接、图片：那是用户自己的内容，拖出去当网址用说得过去；
 *   正文里 @ 提到的任务（a[data-task-mention]）例外，它是界面胶囊，照拦；
 * - 自己写了 draggable="true" 的元素（React Aria 拖动排序的行）：dragstart 的 target 是行本身，不是里面的链接，本来就不在拦的范围。
 */

/** 用户内容：里面的链接、图片照常能拖出去。 */
export const CONTENT_SELECTOR = '.ProseMirror, .md';

interface ElLike {
  tagName?: string;
  closest?: (selector: string) => unknown;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
  parentElement?: ElLike | null;
}

function asElement(target: unknown): ElLike | null {
  let el = target as ElLike | null | undefined;
  if (el && typeof el.closest !== 'function') el = el.parentElement ?? null; // 文字节点按父元素算
  return el && typeof el.closest === 'function' ? el : null;
}

/** 这次原生拖动要不要拦：拖的是界面里的链接或图片（按住的是链接里的图标、文字也算）。 */
export function shouldBlockNativeDrag(target: unknown): boolean {
  const start = asElement(target);
  if (!start) return false;
  // 离按下处最近的「能拖的东西」：链接、图片，或自己声明 draggable="true" 的（React Aria 拖动排序的行、将来要做「拖出链接」的）
  const el = start.closest!('a[href], img, [draggable="true"]') as ElLike | null;
  if (!el || el.getAttribute?.('draggable') === 'true') return false;
  const isLink = (el.tagName ?? '').toLowerCase() === 'a';
  if (isLink && el.hasAttribute?.('data-task-mention')) return true;
  return el.closest!(CONTENT_SELECTOR) == null;
}

let installed = false;

/** 装一次（main.tsx）；测试可以传自己的事件目标。 */
export function installNoLinkDrag(win: Pick<Window, 'addEventListener'> = window) {
  const isGlobal = typeof window !== 'undefined' && win === window;
  if (isGlobal && installed) return;
  if (isGlobal) installed = true;
  win.addEventListener(
    'dragstart',
    (e: Event) => {
      if (shouldBlockNativeDrag(e.target)) e.preventDefault();
    },
    true,
  );
}
