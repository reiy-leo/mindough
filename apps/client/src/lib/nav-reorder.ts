/**
 * 侧边栏里置顶的项目 / 资料库拖动排序（Rei 2026-11-10「侧边栏"在侧边栏展示"的项目列表可以拖拽调整顺序」）。
 * 宽屏侧栏（含中等宽度的图标栏）和手机「更多」页共用。顺序存同步偏好（core GROUP_SIDEBAR_ORDER_PREF / LIBRARY_SIDEBAR_ORDER_PREF）。
 *
 * 为什么不用 React Aria 的 useDragAndDrop（我的一天、类型页在用）：
 * - 侧栏项是 <a> 链接，套 GridList 要改成网格行，键盘、读屏、点了跳转都得重做；
 * - 手机上要「长按拿起、挪动就拖、不挪松手出菜单」，跟现有右键 / 长按菜单（lib/long-press）合在一起，RAC 的拖动做不到；
 * - 只有一列几行，自己算位置更省事，动画也好控制。
 *
 * 手势：
 * - 鼠标 / 触控笔：按住挪 4px 以上开始拖；没挪就是普通点击。拖过的那次 click 吃掉，不跳转。右键菜单照旧。
 * - 手指：按住 450ms 拿起（行稍微浮起来，能震就震一下），这时挪动开始拖；不挪松手 → onLiftRelease（侧栏开右键同款菜单，
 *   「更多」页什么也不做）。拿起前挪动 > 10px 或页面滚动了就作废，照常滚页面（同 lib/long-press 的规矩）。
 *   拿起后整页不滚（touchmove preventDefault），拖到滚动区上下边缘会自动滚。
 * - 键盘：焦点在置顶项上按 ⌥↑ / ⌥↓（Windows / Linux Alt+↑ / ↓）上移 / 下移一位，焦点留在它身上。
 * - 拖动中按 Esc 取消，放回原处。
 *
 * 动画：被拖的那行跟着手走（浮起 + 阴影），其他行让位滑开（transform，150ms），落点画一个强调色淡底的占位格；
 * 松手时那行滑进占位格再写顺序。全部直接改 DOM 的 style，不经过 React，拖动时不重渲染。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { moveInList } from '@mindough/core';
import { installLongPressGuard, isTouchContextMenu, longPressNow, longPressStillValid, movedTooFar } from './long-press';

/** 鼠标挪多少开始拖。 */
export const MOUSE_DRAG_PX = 4;
/** 手指按多久拿起。 */
export const TOUCH_LIFT_MS = 450;
/** 拿起后挪多少算拖（不到这个数松手就是「长按」）。 */
export const TOUCH_DRAG_PX = 6;
/** 让位、落位动画时长。 */
export const SHIFT_MS = 150;
/** 拖完多久内的 click 吃掉。 */
const CLICK_SUPPRESS_MS = 400;
/** 离滚动区上下边缘多近开始自动滚。 */
const EDGE_PX = 36;

export type Slot = { top: number; height: number };

/**
 * 拖到哪儿了：被拖那行的中线越过了哪几行的中线。返回拖完以后它的下标（0..n-1）。
 * slots 是拖之前各行的位置（同一参照系），from 是被拖那行，dy 是它挪了多少。
 */
export function targetIndex(slots: readonly Slot[], from: number, dy: number): number {
  const me = slots[from];
  if (!me) return from;
  const center = me.top + me.height / 2 + dy;
  let to = 0;
  slots.forEach((s, k) => {
    if (k !== from && s.top + s.height / 2 < center) to++;
  });
  return to;
}

/** 被拖那行一格的间距（含行间空隙）：有下一行看下一行，没有看上一行，只有一行就是自己高。 */
export function pitchOf(slots: readonly Slot[], from: number): number {
  const me = slots[from]!;
  if (slots[from + 1]) return slots[from + 1]!.top - me.top;
  if (slots[from - 1]) return me.top - slots[from - 1]!.top;
  return me.height;
}

/** 别的行该让多少：from 往下拖到 to，中间的往上让一格；往上拖，中间的往下让一格。 */
export function shiftFor(k: number, from: number, to: number, pitch: number): number {
  if (k === from) return 0;
  if (from < to && k > from && k <= to) return -pitch;
  if (to < from && k >= to && k < from) return pitch;
  return 0;
}

/** 占位格（也是松手后那行要去的地方）的 top。 */
export function slotTop(slots: readonly Slot[], from: number, to: number): number {
  const me = slots[from]!;
  if (to === from) return me.top;
  const t = slots[to]!;
  // 往下拖：落在第 to 行原来的位置并底边对齐（各行一样高时就是 t.top）
  return to > from ? t.top + t.height - me.height : t.top;
}

/** 键盘上移 / 下移一位的新顺序（到头了返回 null）。 */
export function keyboardMove(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  return moveInList(ids, id, j);
}

/** ⌥↑ / ⌥↓（Alt+↑ / ↓）：上移 / 下移。别的键返回 0。 */
export function reorderKey(e: { key: string; altKey: boolean; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): -1 | 0 | 1 {
  if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return 0;
  if (e.key === 'ArrowUp') return -1;
  if (e.key === 'ArrowDown') return 1;
  return 0;
}

function scrollParent(el: HTMLElement): HTMLElement {
  let p = el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

type Drag = {
  id: string;
  el: HTMLElement;
  items: HTMLElement[];
  slots: Slot[];
  from: number;
  to: number;
  startY: number;
  y: number;
  scroller: HTMLElement;
  startScroll: number;
  placeholder: HTMLElement | null;
  raf: number;
};

type Press = {
  id: string;
  el: HTMLElement;
  pointerType: string;
  x: number;
  y: number;
  at: number;
  timer: number;
  lifted: boolean;
};

let suppressClickUntil = 0;

/** 拖完的那次 click 不当成点链接（在捕获阶段拦）。 */
function installClickSuppressor() {
  if (typeof window === 'undefined' || (window as unknown as { __navReorderClick?: boolean }).__navReorderClick) return;
  (window as unknown as { __navReorderClick?: boolean }).__navReorderClick = true;
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

const noScroll = (e: TouchEvent) => {
  if (e.cancelable) e.preventDefault();
};

export type NavReorder = {
  /** 给每个能拖的项：data 属性、手势、键盘、右键。 */
  itemProps: (id: string, extra?: { onContextMenu?: (e: ReactMouseEvent<HTMLElement>) => void }) => {
    'data-reorder-id': string;
    'data-reorder-group': string;
    'aria-keyshortcuts': string;
    draggable: false;
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
    onDragStart: (e: { preventDefault: () => void }) => void;
  };
};

/**
 * group：这一串的名字（同一个容器里只拖同组的）；ids：眼下的顺序；onCommit：拖完的新顺序；
 * onLiftRelease：手指长按拿起又原地松开（侧栏开菜单用）。
 */
export function useNavReorder({
  group,
  ids,
  onCommit,
  onLiftRelease,
}: {
  group: string;
  ids: readonly string[];
  onCommit: (ids: string[]) => void;
  onLiftRelease?: (id: string, at: { x: number; y: number }) => void;
}): NavReorder {
  const drag = useRef<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const lastPointer = useRef<string | null>(null);
  const pendingClear = useRef<HTMLElement[] | null>(null);
  const latest = useRef({ ids, onCommit, onLiftRelease });
  latest.current = { ids, onCommit, onLiftRelease };
  const idsKey = ids.join('\n');

  // 顺序写进去、React 按新顺序排好以后，再把拖动时留在 DOM 上的 transform 清掉（在绘制前，不闪）
  useLayoutEffect(() => {
    const els = pendingClear.current;
    if (!els) return;
    pendingClear.current = null;
    for (const el of els) resetStyle(el);
  }, [idsKey]);

  const resetStyle = (el: HTMLElement) => {
    el.style.transition = '';
    el.style.transform = '';
    el.style.zIndex = '';
    el.classList.remove('is-reorder-dragging', 'is-reorder-lifted', 'is-reorder-dropping');
  };

  const endTouchListeners = useRef<(() => void) | null>(null);

  const cleanupPress = useCallback(() => {
    const p = press.current;
    if (p) {
      window.clearTimeout(p.timer);
      p.el.classList.remove('is-reorder-lifted');
    }
    press.current = null;
  }, []);

  const finish = useCallback((commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    endTouchListeners.current?.();
    endTouchListeners.current = null;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    document.documentElement.classList.remove('is-nav-reordering');
    suppressClickUntil = longPressNow() + CLICK_SUPPRESS_MS;
    const others = d.items;
    const to = commit ? d.to : d.from;
    // 滑进占位格（transform 是相对布局位置的，滚动不影响）
    d.el.classList.remove('is-reorder-dragging');
    d.el.classList.add('is-reorder-dropping');
    d.el.style.transition = `transform ${SHIFT_MS}ms var(--ease, ease)`;
    d.el.style.transform = `translateY(${slotTop(d.slots, d.from, to) - d.slots[d.from]!.top}px)`;
    if (!commit) others.forEach((el) => {
      if (el !== d.el) el.style.transform = '';
    });
    window.setTimeout(() => {
      d.placeholder?.remove();
      const cur = latest.current.ids;
      const order = d.items.map((el) => el.dataset.reorderId!);
      const next = moveInList(order, d.id, to);
      if (commit && to !== d.from && next.join() !== cur.join()) {
        // 先关掉过渡，React 换完顺序后在 layout effect 里清 transform
        others.forEach((el) => (el.style.transition = 'none'));
        pendingClear.current = others;
        latest.current.onCommit(next);
        // 万一顺序没变（比如同步刚好改回去），下一帧也清掉
        requestAnimationFrame(() => {
          if (pendingClear.current === others) {
            pendingClear.current = null;
            others.forEach(resetStyle);
          }
        });
      } else {
        others.forEach(resetStyle);
      }
    }, SHIFT_MS);
  }, []);

  const layout = useCallback((d: Drag) => {
    const dyRaw = d.y - d.startY + (d.scroller.scrollTop - d.startScroll);
    const me = d.slots[d.from]!;
    const first = d.slots[0]!;
    const last = d.slots[d.slots.length - 1]!;
    // 不拖出这一串：最多超出半行
    const dy = Math.max(first.top - me.top - me.height / 2, Math.min(last.top - me.top + me.height / 2, dyRaw));
    d.el.style.transform = `translateY(${dy}px)`;
    const to = targetIndex(d.slots, d.from, dy);
    if (to !== d.to) {
      d.to = to;
      const pitch = pitchOf(d.slots, d.from);
      d.items.forEach((el, k) => {
        if (el === d.el) return;
        el.style.transform = `translateY(${shiftFor(k, d.from, to, pitch)}px)`;
      });
      if (d.placeholder) d.placeholder.style.transform = `translateY(${slotTop(d.slots, d.from, to) - me.top}px)`;
    }
  }, []);

  const tick = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    // 贴着滚动区上下边缘就自动滚
    const sr = d.scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : d.scroller.getBoundingClientRect();
    let v = 0;
    if (d.y < sr.top + EDGE_PX) v = -Math.ceil((sr.top + EDGE_PX - d.y) / 6);
    else if (d.y > sr.bottom - EDGE_PX) v = Math.ceil((d.y - (sr.bottom - EDGE_PX)) / 6);
    if (v) {
      d.scroller.scrollTop += v;
      layout(d);
    }
    d.raf = requestAnimationFrame(tick);
  }, [layout]);

  const begin = useCallback((id: string, el: HTMLElement, y: number) => {
    const parent = el.parentElement;
    if (!parent) return false;
    const items = [...parent.querySelectorAll<HTMLElement>(':scope > [data-reorder-group]')].filter((x) => x.dataset.reorderGroup === group);
    const from = items.indexOf(el);
    if (from < 0 || items.length < 2) return false;
    const slots = items.map((x) => ({ top: x.offsetTop, height: x.offsetHeight }));
    const scroller = scrollParent(el);
    // 占位格：落点处一个强调色淡底的格子，圆角跟行一样
    const ph = document.createElement('div');
    ph.className = 'nav-drop-slot';
    ph.setAttribute('aria-hidden', 'true');
    const cs = getComputedStyle(el);
    Object.assign(ph.style, {
      top: `${slots[from]!.top}px`,
      left: `${el.offsetLeft}px`,
      width: `${el.offsetWidth}px`,
      height: `${slots[from]!.height}px`,
      borderRadius: cs.borderRadius,
    });
    // 放在最后：不打断 .more-item + .more-item 这类相邻选择器
    parent.appendChild(ph);
    items.forEach((x) => {
      if (x !== el) x.style.transition = `transform ${SHIFT_MS}ms var(--ease, ease)`;
    });
    el.style.transition = 'none';
    el.style.zIndex = '3';
    el.classList.remove('is-reorder-lifted');
    el.classList.add('is-reorder-dragging');
    document.documentElement.classList.add('is-nav-reordering');
    const d: Drag = { id, el, items, slots, from, to: from, startY: y, y, scroller, startScroll: scroller.scrollTop, placeholder: ph, raf: 0 };
    drag.current = d;
    d.raf = requestAnimationFrame(tick);
    return true;
  }, [group, tick]);

  // 鼠标：window 上跟
  const onWindowPointerMove = useCallback((e: PointerEvent) => {
    const p = press.current;
    if (p && !drag.current && p.pointerType !== 'touch') {
      if (Math.abs(e.clientY - p.y) >= MOUSE_DRAG_PX || Math.abs(e.clientX - p.x) >= MOUSE_DRAG_PX * 2) {
        const { id, el, y } = p;
        cleanupPress();
        if (!begin(id, el, y)) return;
      }
    }
    const d = drag.current;
    if (d && e.pointerType !== 'touch') {
      d.y = e.clientY;
      layout(d);
    }
  }, [begin, cleanupPress, layout]);

  const onWindowPointerUp = useCallback((e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerUp);
    cleanupPress();
    if (drag.current) finish(e.type === 'pointerup');
  }, [cleanupPress, finish, onWindowPointerMove]);

  // 手指：touch 事件跟（拿起后要 preventDefault 不让页面滚，pointer 事件做不到）
  const startTouchTracking = useCallback(() => {
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const p = press.current;
      if (p && !p.lifted) {
        // 还没拿起：挪远了就是在滑页面
        if (movedTooFar(p, { x: t.clientX, y: t.clientY })) {
          cleanupPress();
          stop();
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      if (p && p.lifted && !drag.current) {
        if (Math.abs(t.clientY - p.y) >= TOUCH_DRAG_PX) {
          const { id, el, y } = p;
          cleanupPress();
          if (!begin(id, el, y)) return;
        } else return;
      }
      const d = drag.current;
      if (d) {
        d.y = t.clientY;
        layout(d);
      }
    };
    const end = (e: TouchEvent) => {
      const p = press.current;
      stop();
      if (drag.current) {
        finish(e.type === 'touchend');
        return;
      }
      if (p?.lifted) {
        // 拿起了没挪：当长按
        suppressClickUntil = longPressNow() + CLICK_SUPPRESS_MS;
        if (e.cancelable) e.preventDefault();
        cleanupPress();
        latest.current.onLiftRelease?.(p.id, { x: p.x, y: p.y });
        return;
      }
      cleanupPress();
    };
    const stop = () => {
      document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', end, true);
      document.removeEventListener('touchcancel', end, true);
      document.removeEventListener('touchmove', noScroll, true);
      endTouchListeners.current = null;
    };
    document.addEventListener('touchmove', move, { capture: true, passive: false });
    document.addEventListener('touchend', end, { capture: true, passive: false });
    document.addEventListener('touchcancel', end, { capture: true, passive: false });
    endTouchListeners.current = stop;
  }, [begin, cleanupPress, finish, layout]);

  useEffect(() => {
    installClickSuppressor();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
      endTouchListeners.current?.();
      cleanupPress();
      const d = drag.current;
      if (d) {
        cancelAnimationFrame(d.raf);
        d.placeholder?.remove();
        d.items.forEach(resetStyle);
        drag.current = null;
        document.documentElement.classList.remove('is-nav-reordering');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemProps: NavReorder['itemProps'] = (id, extra) => ({
    'data-reorder-id': id,
    'data-reorder-group': group,
    'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown',
    draggable: false,
    onDragStart: (e) => e.preventDefault(),
    onPointerDown: (e) => {
      lastPointer.current = e.pointerType;
      if (drag.current || press.current) return;
      const el = e.currentTarget;
      if (e.pointerType === 'touch') {
        installLongPressGuard();
        const at = longPressNow();
        const p: Press = {
          id,
          el,
          pointerType: 'touch',
          x: e.clientX,
          y: e.clientY,
          at,
          lifted: false,
          timer: window.setTimeout(() => {
            if (press.current !== p) return;
            // 按下以后滚过、或刚滚完：在滑，不拿起
            if (!longPressStillValid(at)) {
              cleanupPress();
              return;
            }
            p.lifted = true;
            el.classList.add('is-reorder-lifted');
            document.addEventListener('touchmove', noScroll, { capture: true, passive: false });
            try {
              navigator.vibrate?.(10);
            } catch {
              /* 不支持就算了 */
            }
          }, TOUCH_LIFT_MS),
        };
        press.current = p;
        startTouchTracking();
        return;
      }
      // 鼠标：只有一个就没什么可拖的，照常点
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || latest.current.ids.length < 2) return;
      press.current = { id, el, pointerType: e.pointerType, x: e.clientX, y: e.clientY, at: longPressNow(), timer: 0, lifted: false };
      window.addEventListener('pointermove', onWindowPointerMove);
      window.addEventListener('pointerup', onWindowPointerUp);
      window.addEventListener('pointercancel', onWindowPointerUp);
    },
    onKeyDown: (e) => {
      const delta = reorderKey(e);
      if (!delta) return;
      e.preventDefault();
      const next = keyboardMove(latest.current.ids, id, delta);
      if (!next) return;
      latest.current.onCommit(next);
      // 换完顺序 DOM 节点挪了，焦点可能丢：放回去
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-reorder-group="${CSS.escape(group)}"][data-reorder-id="${CSS.escape(id)}"]`);
        if (el && document.activeElement !== el) el.focus();
      });
    },
    onContextMenu: (e) => {
      // 手指发的 contextmenu（Android 长按）一律不开系统菜单，长按由上面的计时管
      if (isTouchContextMenu(e, lastPointer.current) || press.current?.lifted || drag.current) {
        e.preventDefault();
        return;
      }
      extra?.onContextMenu?.(e);
    },
  });

  return { itemProps };
}
