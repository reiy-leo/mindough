/**
 * 手指拖动排序（Rei 2026-11-14 05:54「手机端 拖 drag handle 没反应；长按会变灰，之后什么操作也没反应」，小米 12S Ultra 安卓）。
 * 用在 React Aria GridList 做的可拖列表上：我的一天（两段各自排）、待安排、看板（跨列改状态）、资料库类型、字段。
 *
 * 为什么不交给 React Aria：它的鼠标 / 手指拖动全靠浏览器原生 HTML5 拖放（行上 draggable="true"）。
 * - 手指按住把手一挪：原生拖放要长按才起，挪动先被当成滚页面，把手「没反应」；把手上的 onPress 只认键盘 / 读屏。
 * - 长按行：安卓 Chrome / WebView 起了一次原生拖放（dragstart 已发，行被标成 data-dragging 半透明——「变灰」），
 *   之后系统拖放会话接管了手指，WebView 不把 dragover / drop / dragend 送回页面，React Aria 一直以为还在拖，
 *   整页的点按都被那次没结束的拖放吃掉——「什么操作也没反应」。桌面 Chromium 模拟测不出来（触摸不起原生拖放）。
 * 所以手指一律不走原生拖放，改走这里自己算；鼠标、键盘、读屏照旧交给 React Aria。
 *
 * 手势（同侧栏 lib/nav-reorder 的规矩）：
 * - 按把手：按下就拿起，挪 6px 开始拖（拿起后 touchmove 一律 preventDefault，页面不会抢去滚）。
 *   React Aria 给把手写了内联 pointer-events: none，手指按上去事件落在行上——原来「把手没反应」就是这个：
 *   手指其实按在行上，一挪就成了滚页面。所以把手按坐标认（onHandle）。
 * - 按行：按住 450ms 拿起（行稍微浮起，能震就震一下），然后挪动开始拖；拿起前挪 > 10px、页面滚过、
 *   浏览器接手滚动（pointercancel）都作废，照常滚页面（lib/long-press）。拿起后原地松手什么也不做，也不算点开。
 * - 拖动中：被拖的行原位变淡留着，一张同样的卡片跟手走，落点画一条强调色横线；看板拖到别的列，那一列整块染淡强调色。
 *   贴着滚动区上下沿（看板还有左右沿）自动滚。整页不滚（touchmove preventDefault）。
 * - 松手：落位，调列表自己的 onReorder（和 React Aria 的 onReorder 同一个函数，存法一样）/ 别的列的 onReceive。
 * - 任何中断都干净退出、不改顺序：touchcancel、同一根手指的 pointercancel、页面切到后台、窗口失焦、转屏 / 改窗口大小、
 *   Esc、列表被卸掉；万一漏了 touchend（WebView 吞了），下一次按下时先把上一次收掉。
 * - 原生拖放兜底：手指按下的那行临时 draggable=false，再在捕获阶段拦掉手指发起的 dragstart（React Aria 见 defaultPrevented 就不起拖）。
 *   鼠标再按下时那行改回 draggable=true，桌面照旧用 React Aria 的拖放。
 *
 * 用法：const guard = useReorderGuard(); useTouchReorder(guard, { group, onReorder }); <GridList ref={guard.ref} …>
 */
import { useEffect, useRef, type RefObject } from 'react';
import { installLongPressGuard, longPressNow, longPressStillValid, movedTooFar } from './long-press';

/** 手指按多久拿起（同侧栏）。 */
export const TOUCH_LIFT_MS = 450;
/** 拿起后挪多少开始拖。 */
export const TOUCH_DRAG_PX = 6;
/** 离滚动区边缘多近开始自动滚。 */
export const EDGE_PX = 48;
/** 拖完多久内的 click 吃掉。 */
const CLICK_SUPPRESS_MS = 400;
/** 手指按下后多久内来的 dragstart 算手指发起的。 */
const TOUCH_DRAG_WINDOW_MS = 1500;

export type DropPosition = 'before' | 'after';
/** 和 React Aria onReorder 的事件同形（只用到这几项）：同一个函数两边都能用。 */
export type ReorderLike = { keys: Set<string | number>; target: { key: string | number; dropPosition: DropPosition | 'on' } };

export type TouchReorderOptions = {
  /** 同组的列表之间能互相拖（看板各列同组）；只有一个列表就是在自己里面排。 */
  group: string;
  /** 这一行能不能拖（我的一天置顶的不能）。 */
  canDrag?: (key: string) => boolean;
  /** 在本列表里换位置。没有就是本列表里不排（看板列内）。 */
  onReorder?: (e: ReorderLike) => void;
  /** 从同组别的列表拖进来。 */
  onReceive?: (keys: string[]) => void;
};

type Guard = { ref: RefObject<HTMLElement | null>; handlers: { onDragStart: () => void; onDragEnd: () => void } };
type Entry = { opts: TouchReorderOptions; guard: Guard['handlers'] };

const registry = new Map<HTMLElement, { current: Entry }>();

/** 拖到哪：插在某行前 / 后，或丢进同组别的列表。 */
export type Target =
  | { kind: 'same'; key: string; dropPosition: DropPosition; lineY: number; left: number; width: number }
  | { kind: 'other'; list: HTMLElement }
  | null;

type Box = { key: string; top: number; bottom: number; left: number; width: number };

/**
 * 纯算：手指在 y，同列表除被拖那行以外的各行 rows（屏幕坐标，按顺序），被拖那行原来排在 others 的第 origin 个之前。
 * 返回插到哪（落在原处返回 null：松手不动）。
 */
export function dropSpot(rows: readonly Box[], origin: number, y: number): { key: string; dropPosition: DropPosition; lineY: number; left: number; width: number } | null {
  if (!rows.length) return null;
  let at = rows.findIndex((r) => y < (r.top + r.bottom) / 2);
  if (at < 0) at = rows.length;
  if (at === origin) return null;
  if (at < rows.length) {
    const r = rows[at]!;
    const prev = rows[at - 1];
    // 两行中间（有间隙时画在间隙正中）
    const lineY = prev && prev.bottom <= r.top ? (prev.bottom + r.top) / 2 : r.top;
    return { key: r.key, dropPosition: 'before', lineY, left: r.left, width: r.width };
  }
  const last = rows[rows.length - 1]!;
  return { key: last.key, dropPosition: 'after', lineY: last.bottom, left: last.left, width: last.width };
}

/** 看板这种并排的同组列表：x 落在哪一列（落在列外取横向最近的）。 */
export function pickColumn<T>(cols: readonly { item: T; left: number; right: number }[], x: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const c of cols) {
    const d = x < c.left ? c.left - x : x > c.right ? x - c.right : 0;
    if (d < bestD) {
      bestD = d;
      best = c.item;
    }
  }
  return best;
}

/** 贴边自动滚的速度：离边越近越快，最多一帧 18px。 */
export function edgeSpeed(pos: number, start: number, end: number, edge = EDGE_PX): number {
  if (pos < start + edge) return -Math.min(18, Math.ceil((start + edge - pos) / 4));
  if (pos > end - edge) return Math.min(18, Math.ceil((pos - (end - edge)) / 4));
  return 0;
}

function scrollParentY(el: HTMLElement): HTMLElement {
  let p = el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
function scrollParentX(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const ox = getComputedStyle(p).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) return p;
    p = p.parentElement;
  }
  return null;
}
const viewRect = (el: HTMLElement) => {
  if (el === document.scrollingElement || el === document.documentElement || el === document.body) return { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  const r = el.getBoundingClientRect();
  return { top: Math.max(0, r.top), bottom: Math.min(window.innerHeight, r.bottom), left: Math.max(0, r.left), right: Math.min(window.innerWidth, r.right) };
};

const rowsOf = (list: HTMLElement) => [...list.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-key'));
const keyOf = (row: HTMLElement) => row.getAttribute('data-key') ?? '';

type Press = {
  list: HTMLElement;
  row: HTMLElement;
  key: string;
  entry: { current: Entry };
  pointerId: number;
  x: number;
  y: number;
  at: number;
  timer: number;
  lifted: boolean;
};
type Drag = Press & {
  ghost: HTMLElement;
  line: HTMLElement;
  offX: number;
  offY: number;
  /** 只有自己一个列表：卡片只上下走。 */
  solo: boolean;
  /** 被拖那行原来在别的行里排第几（落回这里 = 不动）。 */
  origin: number;
  scrollY: HTMLElement;
  scrollX: HTMLElement | null;
  snap: string;
  target: Target;
  over: HTMLElement | null;
  raf: number;
  cx: number;
  cy: number;
};

let press: Press | null = null;
let drag: Drag | null = null;
let suppressClickUntil = 0;
let lastTouchDownAt = -Infinity;
let installed = false;

function lift(p: Press) {
  p.lifted = true;
  p.row.classList.add('is-touch-lifted');
  // 拿起就算「在拖」：松手那下不当点开（React Aria 的行 onAction、行里的 onPress 都看 isDragPress）
  p.entry.current.guard.onDragStart();
}

function clearPress() {
  if (!press) return;
  window.clearTimeout(press.timer);
  press.row.classList.remove('is-touch-lifted');
  press = null;
}

function begin(p: Press) {
  const rect = p.row.getBoundingClientRect();
  // 跟手的卡片：同一行复制一份，套一层和列表同名的壳（卡片、圆角、底色的样式写在列表上），放在 body 上 fixed
  const ghost = document.createElement('div');
  ghost.className = `${p.list.className} touch-drag-ghost`;
  ghost.setAttribute('aria-hidden', 'true');
  const clone = p.row.cloneNode(true) as HTMLElement;
  for (const el of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    el.removeAttribute('id');
    el.removeAttribute('data-key');
    for (const a of ['data-hovered', 'data-pressed', 'data-focused', 'data-focus-visible', 'data-dragging']) el.removeAttribute(a);
  }
  clone.classList.remove('is-touch-lifted', 'is-touch-drag-source');
  ghost.appendChild(clone);
  Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
  document.body.appendChild(ghost);
  const line = document.createElement('div');
  line.className = 'touch-drop-line';
  line.setAttribute('aria-hidden', 'true');
  line.style.display = 'none';
  document.body.appendChild(line);
  p.row.classList.remove('is-touch-lifted');
  p.row.classList.add('is-touch-drag-source');
  document.documentElement.classList.add('is-touch-reordering');
  const group = p.entry.current.opts.group;
  const solo = [...registry.keys()].filter((l) => l.isConnected && l.getAttribute('data-touch-reorder') === group).length < 2;
  const others = rowsOf(p.list);
  const scrollX = solo ? null : scrollParentX(p.list);
  const d: Drag = {
    ...p,
    ghost,
    line,
    offX: p.x - rect.left,
    offY: p.y - rect.top,
    solo,
    origin: others.indexOf(p.row),
    scrollY: scrollParentY(p.list),
    scrollX,
    snap: scrollX?.style.scrollSnapType ?? '',
    target: null,
    over: null,
    raf: 0,
    cx: p.x,
    cy: p.y,
  };
  // 横向贴边滚时别让 scroll-snap 往回吸
  if (scrollX) scrollX.style.scrollSnapType = 'none';
  drag = d;
  press = null;
  layout(d);
  d.raf = requestAnimationFrame(tick);
}

function setOver(d: Drag, list: HTMLElement | null) {
  if (d.over === list) return;
  d.over?.classList.remove('is-touch-drop-target');
  d.over = list;
  list?.classList.add('is-touch-drop-target');
}

function layout(d: Drag) {
  const rect = d.row.getBoundingClientRect();
  const x = d.solo ? rect.left : d.cx - d.offX;
  d.ghost.style.transform = `translate(${x - parseFloat(d.ghost.style.left)}px, ${d.cy - d.offY - parseFloat(d.ghost.style.top)}px)`;
  const group = d.entry.current.opts.group;
  let list = d.list;
  if (!d.solo) {
    const lists = [...registry.keys()].filter((l) => l.isConnected && l.getAttribute('data-touch-reorder') === group);
    list = pickColumn(lists.map((l) => {
      const zone = (l.closest('[data-touch-reorder-zone]') as HTMLElement | null) ?? l;
      const r = zone.getBoundingClientRect();
      return { item: l, left: r.left, right: r.right };
    }), d.cx) ?? d.list;
  }
  if (list !== d.list) {
    const ok = !!registry.get(list)?.current.opts.onReceive;
    d.target = ok ? { kind: 'other', list } : null;
    setOver(d, ok ? list : null);
    d.line.style.display = 'none';
    return;
  }
  setOver(d, null);
  if (!d.entry.current.opts.onReorder) {
    d.target = null;
    d.line.style.display = 'none';
    return;
  }
  const rows = rowsOf(d.list)
    .filter((r) => r !== d.row)
    .map((r) => {
      const b = r.getBoundingClientRect();
      return { key: keyOf(r), top: b.top, bottom: b.bottom, left: b.left, width: b.width };
    });
  const origin = rowsOf(d.list).indexOf(d.row);
  const spot = dropSpot(rows, origin, d.cy);
  d.target = spot ? { kind: 'same', ...spot } : null;
  if (spot) {
    Object.assign(d.line.style, { display: '', top: `${spot.lineY - 1}px`, left: `${spot.left + 8}px`, width: `${Math.max(0, spot.width - 16)}px` });
  } else d.line.style.display = 'none';
}

/** 固定在滚动区顶上的东西（添加框、项目页头、分段头…）和手机底部标签栏：贴边自动滚的边要从它们算起，不然手指够不着。 */
const STICKY_TOP = '.add-bar-sticky, .project-head-sticky, .checkin-head-sticky, .sticky-head, .types-back-bar';
export function visibleBand(scroller: HTMLElement): { top: number; bottom: number } {
  const vr = viewRect(scroller);
  let { top, bottom } = vr;
  const root = scroller === document.scrollingElement ? document : scroller;
  root.querySelectorAll<HTMLElement>(STICKY_TOP).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height && r.top <= top + 2 && r.bottom > top && r.bottom < (top + bottom) / 2) top = r.bottom;
  });
  const bar = document.querySelector<HTMLElement>('.tabbar');
  if (bar) {
    const r = bar.getBoundingClientRect();
    if (r.height && r.top < bottom && r.top > (top + bottom) / 2) bottom = r.top;
  }
  return { top, bottom };
}

function tick() {
  const d = drag;
  if (!d) return;
  let moved = false;
  const vr = visibleBand(d.scrollY);
  const vy = edgeSpeed(d.cy, vr.top, vr.bottom);
  if (vy) {
    const before = d.scrollY.scrollTop;
    d.scrollY.scrollTop += vy;
    moved = d.scrollY.scrollTop !== before;
  }
  if (d.scrollX) {
    const hr = viewRect(d.scrollX);
    const vx = edgeSpeed(d.cx, hr.left, hr.right, 32);
    if (vx) {
      const before = d.scrollX.scrollLeft;
      d.scrollX.scrollLeft += vx;
      moved = moved || d.scrollX.scrollLeft !== before;
    }
  }
  if (moved) layout(d);
  d.raf = requestAnimationFrame(tick);
}

/** 收尾。commit：照落点改顺序 / 状态；否则原样放回。 */
function finish(commit: boolean) {
  const d = drag;
  drag = null;
  stopTracking();
  if (!d) return;
  cancelAnimationFrame(d.raf);
  d.ghost.remove();
  d.line.remove();
  setOver(d, null);
  d.row.classList.remove('is-touch-drag-source', 'is-touch-lifted');
  document.documentElement.classList.remove('is-touch-reordering');
  if (d.scrollX) d.scrollX.style.scrollSnapType = d.snap;
  suppressClickUntil = longPressNow() + CLICK_SUPPRESS_MS;
  const t = commit ? d.target : null;
  try {
    if (t?.kind === 'same') d.entry.current.opts.onReorder?.({ keys: new Set([d.key]), target: { key: t.key, dropPosition: t.dropPosition } });
    else if (t?.kind === 'other') registry.get(t.list)?.current.opts.onReceive?.([d.key]);
  } finally {
    d.entry.current.guard.onDragEnd();
  }
}

/** 拿起了没拖就松手 / 被打断：只收拿起。 */
function releasePress(cancelled: boolean) {
  const p = press;
  if (!p) return;
  const wasLifted = p.lifted;
  clearPress();
  stopTracking();
  if (wasLifted) {
    if (!cancelled) suppressClickUntil = longPressNow() + CLICK_SUPPRESS_MS;
    p.entry.current.guard.onDragEnd();
  }
}

/** 把眼下的一切收掉、不改顺序（打断）。 */
export function cancelTouchReorder() {
  if (drag) finish(false);
  else releasePress(true);
}

const onTouchMove = (e: TouchEvent) => {
  const t = e.touches[0];
  if (!t) return;
  const p = press;
  if (p && !p.lifted) {
    // 还没拿起：挪远了就是在滑页面
    if (movedTooFar(p, { x: t.clientX, y: t.clientY })) releasePress(true);
    return;
  }
  if (!p && !drag) return;
  if (e.cancelable) e.preventDefault();
  if (p && p.lifted && !drag) {
    if (Math.hypot(t.clientX - p.x, t.clientY - p.y) < TOUCH_DRAG_PX) return;
    begin(p);
  }
  const d = drag;
  if (!d) return;
  d.cx = t.clientX;
  d.cy = t.clientY;
  layout(d);
};
const onTouchEnd = (e: TouchEvent) => {
  // 还有别的手指按着：不算完
  if (e.touches.length) return;
  if (drag) {
    if (e.cancelable) e.preventDefault();
    finish(e.type === 'touchend');
    return;
  }
  const lifted = press?.lifted;
  if (lifted && e.cancelable) e.preventDefault();
  releasePress(e.type === 'touchcancel');
};
const onPointerCancel = (e: PointerEvent) => {
  const cur = drag ?? press;
  if (!cur || e.pointerId !== cur.pointerId) return;
  // 浏览器 / 系统把这根手指收走了（开始滚动、系统手势）：不管到哪一步都作废
  cancelTouchReorder();
};
const onContextMenu = (e: Event) => {
  if (press || drag) e.preventDefault();
};
const onVisibility = () => {
  if (document.visibilityState === 'hidden') cancelTouchReorder();
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && (drag || press?.lifted)) {
    e.preventDefault();
    e.stopPropagation();
    cancelTouchReorder();
  }
};

let tracking = false;
function startTracking() {
  if (tracking) return;
  tracking = true;
  const opt = { capture: true, passive: false } as AddEventListenerOptions;
  document.addEventListener('touchmove', onTouchMove, opt);
  document.addEventListener('touchend', onTouchEnd, opt);
  document.addEventListener('touchcancel', onTouchEnd, opt);
  window.addEventListener('pointercancel', onPointerCancel, true);
  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('blur', cancelTouchReorder);
  window.addEventListener('resize', cancelTouchReorder);
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisibility);
}
function stopTracking() {
  if (!tracking) return;
  tracking = false;
  const opt = { capture: true } as EventListenerOptions;
  document.removeEventListener('touchmove', onTouchMove, opt);
  document.removeEventListener('touchend', onTouchEnd, opt);
  document.removeEventListener('touchcancel', onTouchEnd, opt);
  window.removeEventListener('pointercancel', onPointerCancel, true);
  window.removeEventListener('contextmenu', onContextMenu, true);
  window.removeEventListener('blur', cancelTouchReorder);
  window.removeEventListener('resize', cancelTouchReorder);
  window.removeEventListener('keydown', onKey, true);
  document.removeEventListener('visibilitychange', onVisibility);
}

/** 手指按在这一行的拖动把手上没有（按坐标）。 */
export function onHandle(row: HTMLElement, x: number, y: number): boolean {
  const h = row.querySelector<HTMLElement>('.drag-handle:not(.is-placeholder)');
  if (!h) return false;
  const r = h.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const left = Math.min(r.left, row.getBoundingClientRect().left);
  return x >= left && x <= r.right + 6 && y >= r.top && y <= r.bottom;
}

function onPointerDown(e: PointerEvent) {
  const target = e.target instanceof Element ? e.target : null;
  const list = target?.closest<HTMLElement>('[data-touch-reorder]');
  const row = target?.closest<HTMLElement>('[data-key]');
  if (e.pointerType !== 'touch') {
    // 鼠标 / 触控笔：手指按过时关掉的原生拖放开回来，桌面照旧用 React Aria
    if (row && list && row.parentElement === list && row.getAttribute('draggable') === 'false' && row.dataset.touchUndrag) {
      row.setAttribute('draggable', 'true');
      delete row.dataset.touchUndrag;
    }
    return;
  }
  lastTouchDownAt = longPressNow();
  // 上一次没收干净（漏了 touchend / touchcancel）：这次按下先收掉
  if ((drag || press) && e.isPrimary) cancelTouchReorder();
  if (drag || press) {
    // 第二根手指：还没拿起就当在捏 / 滚，作废；拖动中不理
    if (press && !press.lifted) releasePress(true);
    return;
  }
  if (!list || !row || row.parentElement !== list) return;
  const entry = registry.get(list);
  if (!entry) return;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  const key = keyOf(row);
  const { opts } = entry.current;
  if (opts.canDrag && !opts.canDrag(key)) return;
  const others = [...registry.keys()].some((l) => l !== list && l.isConnected && l.getAttribute('data-touch-reorder') === opts.group);
  if (!others && (!opts.onReorder || rowsOf(list).length < 2)) return;
  // 这一行这次不走原生拖放（安卓长按会起一个收不回来的原生拖放）
  if (row.getAttribute('draggable') === 'true') {
    row.setAttribute('draggable', 'false');
    row.dataset.touchUndrag = '1';
  }
  installLongPressGuard();
  const at = longPressNow();
  // 把手按坐标认：React Aria 给把手写了内联 pointer-events: none（鼠标从整行起原生拖放），手指按上去事件落在行上。
  // 往左算到行的左边、往右多 6px，好按一些
  const handle = onHandle(row, e.clientX, e.clientY);
  const p: Press = { list, row, key, entry, pointerId: e.pointerId, x: e.clientX, y: e.clientY, at, timer: 0, lifted: false };
  press = p;
  startTracking();
  if (handle) {
    // 把手：按下就拿起
    lift(p);
    return;
  }
  p.timer = window.setTimeout(() => {
    if (press !== p) return;
    // 按下以后滚过、或刚滚完：在滑，不拿起
    if (!longPressStillValid(at)) {
      releasePress(true);
      return;
    }
    lift(p);
    try {
      navigator.vibrate?.(10);
    } catch {
      /* 不支持就算了 */
    }
  }, TOUCH_LIFT_MS);
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerdown', onPointerDown, true);
  // 手指发起的原生拖放一律拦掉（React Aria 见 defaultPrevented 就不起拖、不把行标成 data-dragging）
  window.addEventListener(
    'dragstart',
    (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t?.closest('[data-touch-reorder]')) return;
      if (press || drag || longPressNow() - lastTouchDownAt < TOUCH_DRAG_WINDOW_MS) e.preventDefault();
    },
    true,
  );
  window.addEventListener(
    'click',
    (e) => {
      if (longPressNow() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        suppressClickUntil = 0;
      }
    },
    true,
  );
}

/** 测试用：眼下的状态。 */
export function touchReorderState() {
  return { pressing: !!press, lifted: !!press?.lifted, dragging: !!drag, target: drag?.target ?? null };
}

/**
 * 给一个 GridList 接上手指拖动。guard 是 useReorderGuard() 的返回值（用它的 ref 找列表，拖动开始 / 结束时调它的 handlers）。
 */
export function useTouchReorder(guard: Guard, opts: TouchReorderOptions) {
  const entry = useRef<Entry>({ opts, guard: guard.handlers });
  entry.current = { opts, guard: guard.handlers };
  useEffect(() => {
    install();
  }, []);
  // 每次渲染都核对一下列表元素（列表可能条件渲染、换了节点）
  useEffect(() => {
    const el = guard.ref.current;
    if (!el) return;
    el.setAttribute('data-touch-reorder', opts.group);
    registry.set(el, entry);
    return () => {
      // 每次重渲染都会先清再挂；只有真卸掉（节点不在页面上了）才收掉拖动，不留浮着的卡片
      if (registry.get(el) === entry) registry.delete(el);
      window.setTimeout(() => {
        if (el.isConnected) return;
        if ((drag && drag.list === el) || (press && press.list === el)) cancelTouchReorder();
      }, 0);
    };
  });
}
