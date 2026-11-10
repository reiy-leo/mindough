/**
 * 日历页拖动条目改日期（Rei 2026-11-11 06:55，docs/CALENDAR.md「拖动改日期」）。
 *
 * 谁能拖：标了 data-cal-drag="<任务 id>"、data-cal-role="task|countdown" 的条目（普通任务、倒数日）；订阅事件不标，打卡本来不画。
 * 落到哪：标了 data-drop-date="<YYYY-MM-DD>" 的元素（宽屏是每格的底 .cal-cell-bg，手机是每天的列表、小月历的格子）。
 *   按下、移动时用 elementsFromPoint 找指针下面的那一天，横条按在第几天就算哪天。
 *
 * 手势（和侧栏拖动排序 lib/nav-reorder 一个规矩）：
 * - 鼠标 / 触控笔：按住挪 4px 以上开始拖；没挪就是普通点击，照常打开详情。拖过以后那次点按不算（calDragSuppressed）。
 * - 手指：按住 450ms 拿起（能震就震一下），这时挪动才开始拖；拿起前挪动 > 10px、页面滚过都作废，照常滚页面（lib/long-press）。
 *   拿起后整页不滚，拖到滚动区上下边缘自动滚。拿起了不挪就松手：什么也不做（不开详情）。
 * - 拖动中：被拖的条目淡掉，一个影子跟着指针走；要落下的那几天（整段的天数）高亮。Esc 取消。
 * - 键盘：焦点在条目上按 ⌥← / ⌥→（Windows / Linux Alt+← / →）挪一天。
 *
 * 不经过 React：拖动时直接改 DOM 的 class 和影子的位置，不重渲染；松手才回调 onDrop，由页面走 Store 写库。
 * 事件挂在页面根元素上（委托），弹出的 Sheet 在根外面，自然不能拖。
 */
import { useEffect, useRef, type RefObject } from 'react';
import { addDays, diffDays, type DateKey } from '@mindough/core';
import { installLongPressGuard, longPressNow, longPressStillValid, movedTooFar } from './long-press';

export type CalDragRole = 'task' | 'countdown';

/** 鼠标挪多少开始拖。 */
export const CAL_MOUSE_DRAG_PX = 4;
/** 手指按多久拿起。 */
export const CAL_TOUCH_LIFT_MS = 450;
/** 拿起后挪多少算拖。 */
export const CAL_TOUCH_DRAG_PX = 6;
/** 拖完多久内的点按不算。 */
const SUPPRESS_MS = 400;
/** 离滚动区上下边缘多近开始自动滚。 */
const EDGE_PX = 48;

let suppressUntil = 0;
/** 刚拖完（或手指刚拿起）：这次点按不当打开详情。 */
export function calDragSuppressed(at = longPressNow()): boolean {
  return at < suppressUntil;
}
function suppress() {
  suppressUntil = longPressNow() + SUPPRESS_MS;
}

/** ⌥← / ⌥→ 挪几天（别的键回 0）。 */
export function calDragKey(e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): number {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return 0;
  if (e.key === 'ArrowLeft') return -1;
  if (e.key === 'ArrowRight') return 1;
  return 0;
}

/** 一串元素（elementsFromPoint 的结果，最上面的在前）里第一个带 data-drop-date 的那一天。 */
export function dropDateIn(els: readonly Element[], root: Element | null): DateKey | null {
  for (const el of els) {
    const hit = (el as HTMLElement).closest?.('[data-drop-date]') as HTMLElement | null;
    if (hit && (!root || root.contains(hit))) return hit.dataset.dropDate ?? null;
  }
  return null;
}

/** 整段平移后要高亮哪几天：原来的 [start, end] 挪 delta 天（最多 62 天，防坏数据）。 */
export function dropSpan(start: DateKey, end: DateKey, grabbed: DateKey, dropped: DateKey): DateKey[] {
  const delta = diffDays(grabbed, dropped);
  const len = Math.min(Math.max(diffDays(start, end), 0), 61);
  const from = addDays(start, delta);
  return Array.from({ length: len + 1 }, (_, i) => addDays(from, i));
}

export interface CalDragOptions {
  enabled: boolean;
  /** 条目原来占哪几天（高亮整段用）；不能拖就回 null。 */
  rangeOf: (id: string, role: CalDragRole) => { start: DateKey; end: DateKey } | null;
  onDrop: (id: string, role: CalDragRole, grabbed: DateKey, dropped: DateKey) => void;
  onShift: (id: string, role: CalDragRole, days: number) => void;
}

type Press = { id: string; role: CalDragRole; el: HTMLElement; grabbed: DateKey; x: number; y: number; at: number; touch: boolean; lifted: boolean; timer: number };
type Drag = Press & { ghost: HTMLElement; dx: number; dy: number; target: DateKey | null; lit: HTMLElement[]; px: number; py: number; raf: number; scroller: HTMLElement | null };

const noScroll = (e: TouchEvent) => {
  if (e.cancelable) e.preventDefault();
};

function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p: HTMLElement | null = el; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

export function useCalDrag(rootRef: RefObject<HTMLElement | null>, opts: CalDragOptions): void {
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !opts.enabled) return;
    let press: Press | null = null;
    let drag: Drag | null = null;
    let stopTouch: (() => void) | null = null;

    const dateAt = (x: number, y: number) => dropDateIn(document.elementsFromPoint(x, y), root);
    const sources = (id: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-cal-drag="${CSS.escape(id)}"]`));

    const clearPress = () => {
      if (press) {
        window.clearTimeout(press.timer);
        press.el.classList.remove('is-cal-lifted');
      }
      press = null;
    };

    const highlight = (d: Drag) => {
      d.lit.forEach((el) => el.classList.remove('is-drop-target'));
      d.lit = [];
      if (!d.target) return;
      const r = latest.current.rangeOf(d.id, d.role);
      const days = new Set(r ? dropSpan(r.start, r.end, d.grabbed, d.target) : [d.target]);
      for (const el of root.querySelectorAll<HTMLElement>('[data-drop-date]')) {
        if (days.has(el.dataset.dropDate as DateKey)) {
          el.classList.add('is-drop-target');
          d.lit.push(el);
        }
      }
    };

    const place = (d: Drag) => {
      d.ghost.style.transform = `translate(${d.px - d.dx}px, ${d.py - d.dy}px)`;
      const t = dateAt(d.px, d.py);
      if (t !== d.target) {
        d.target = t;
        highlight(d);
      }
    };

    // 拖到滚动区上下边缘自动滚
    const tick = () => {
      const d = drag;
      if (!d) return;
      const s = d.scroller;
      if (s) {
        const isDoc = s === document.scrollingElement;
        const top = isDoc ? 0 : s.getBoundingClientRect().top;
        const bottom = isDoc ? window.innerHeight : s.getBoundingClientRect().bottom;
        let v = 0;
        if (d.py < top + EDGE_PX) v = -Math.ceil((top + EDGE_PX - d.py) / 4);
        else if (d.py > bottom - EDGE_PX) v = Math.ceil((d.py - (bottom - EDGE_PX)) / 4);
        if (v) {
          s.scrollTop += v;
          place(d);
        }
      }
      d.raf = requestAnimationFrame(tick);
    };

    const begin = (p: Press) => {
      const rect = p.el.getBoundingClientRect();
      const ghost = p.el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-cal-drag');
      ghost.removeAttribute('id');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.classList.add('cal-drag-ghost');
      ghost.classList.remove('is-cal-lifted');
      const w = Math.min(rect.width, 240);
      const cs = getComputedStyle(p.el);
      Object.assign(ghost.style, { fontSize: cs.fontSize, padding: cs.padding, position: 'fixed', left: '0px', top: '0px', width: `${w}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none', zIndex: '2000' });
      document.body.appendChild(ghost);
      const dx = Math.min(p.x - rect.left, w - 8);
      drag = { ...p, ghost, dx, dy: p.y - rect.top, target: p.grabbed, lit: [], px: p.x, py: p.y, raf: 0, scroller: scrollerOf(root) };
      press = null;
      window.clearTimeout(p.timer);
      p.el.classList.remove('is-cal-lifted');
      sources(p.id).forEach((el) => el.classList.add('is-drag-source'));
      document.documentElement.classList.add('is-cal-dragging');
      place(drag);
      highlight(drag);
      drag.raf = requestAnimationFrame(tick);
    };

    const finish = (commit: boolean) => {
      const d = drag;
      drag = null;
      if (!d) return;
      cancelAnimationFrame(d.raf);
      d.ghost.remove();
      d.lit.forEach((el) => el.classList.remove('is-drop-target'));
      sources(d.id).forEach((el) => el.classList.remove('is-drag-source'));
      document.documentElement.classList.remove('is-cal-dragging');
      suppress();
      if (commit && d.target && d.target !== d.grabbed) latest.current.onDrop(d.id, d.role, d.grabbed, d.target);
    };

    const startPress = (e: PointerEvent): Press | null => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-cal-drag]') as HTMLElement | null;
      if (!el || !root.contains(el)) return null;
      const id = el.dataset.calDrag!;
      const role = el.dataset.calRole as CalDragRole;
      if (role !== 'task' && role !== 'countdown') return null;
      if (!latest.current.rangeOf(id, role)) return null;
      const grabbed = dateAt(e.clientX, e.clientY);
      if (!grabbed) return null;
      return { id, role, el, grabbed, x: e.clientX, y: e.clientY, at: longPressNow(), touch: e.pointerType === 'touch', lifted: false, timer: 0 };
    };

    // ── 鼠标 / 触控笔 ──
    const onMouseMove = (e: PointerEvent) => {
      if (press && !press.touch && !drag) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= CAL_MOUSE_DRAG_PX) begin(press);
      }
      if (drag && !drag.touch) {
        drag.px = e.clientX;
        drag.py = e.clientY;
        place(drag);
      }
    };
    const onMouseUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      window.removeEventListener('pointermove', onMouseMove);
      window.removeEventListener('pointerup', onMouseUp);
      window.removeEventListener('pointercancel', onMouseUp);
      clearPress();
      if (drag) finish(e.type === 'pointerup');
    };

    // ── 手指：touch 事件跟（拿起后要 preventDefault 不让页面滚） ──
    const startTouch = () => {
      const move = (e: TouchEvent) => {
        const t = e.touches[0];
        if (!t) return;
        if (press && !press.lifted) {
          if (movedTooFar(press, { x: t.clientX, y: t.clientY })) {
            clearPress();
            stop();
          }
          return;
        }
        if (e.cancelable) e.preventDefault();
        if (press && press.lifted && !drag) {
          if (Math.hypot(t.clientX - press.x, t.clientY - press.y) >= CAL_TOUCH_DRAG_PX) begin(press);
          else return;
        }
        if (drag) {
          drag.px = t.clientX;
          drag.py = t.clientY;
          place(drag);
        }
      };
      const end = (e: TouchEvent) => {
        const p = press;
        stop();
        if (drag) {
          if (e.cancelable) e.preventDefault();
          finish(e.type === 'touchend');
          return;
        }
        if (p?.lifted) {
          // 拿起了没挪：不当点按
          suppress();
          if (e.cancelable) e.preventDefault();
        }
        clearPress();
      };
      const stop = () => {
        document.removeEventListener('touchmove', move, true);
        document.removeEventListener('touchend', end, true);
        document.removeEventListener('touchcancel', end, true);
        document.removeEventListener('touchmove', noScroll, true);
        stopTouch = null;
      };
      document.addEventListener('touchmove', move, { capture: true, passive: false });
      document.addEventListener('touchend', end, { capture: true, passive: false });
      document.addEventListener('touchcancel', end, { capture: true, passive: false });
      stopTouch = stop;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (drag || press) return;
      if (e.pointerType !== 'touch' && (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return;
      const p = startPress(e);
      if (!p) return;
      press = p;
      if (p.touch) {
        installLongPressGuard();
        p.timer = window.setTimeout(() => {
          if (press !== p) return;
          if (!longPressStillValid(p.at)) {
            clearPress();
            stopTouch?.();
            return;
          }
          p.lifted = true;
          suppress();
          p.el.classList.add('is-cal-lifted');
          document.addEventListener('touchmove', noScroll, { capture: true, passive: false });
          try {
            navigator.vibrate?.(10);
          } catch {
            /* 不支持就算了 */
          }
        }, CAL_TOUCH_LIFT_MS);
        startTouch();
        return;
      }
      window.addEventListener('pointermove', onMouseMove);
      window.addEventListener('pointerup', onMouseUp);
      window.addEventListener('pointercancel', onMouseUp);
    };

    // 手指按着（或拿起后）系统发的长按菜单、浏览器自己的拖拽都拦掉
    const onContextMenu = (e: Event) => {
      if (press?.touch || drag) e.preventDefault();
    };
    const onDragStart = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-cal-drag]')) e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag) {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
        return;
      }
      const n = calDragKey(e);
      if (!n) return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-cal-drag]') as HTMLElement | null;
      if (!el || !root.contains(el)) return;
      const role = el.dataset.calRole as CalDragRole;
      if (role !== 'task' && role !== 'countdown') return;
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.calDrag!;
      latest.current.onShift(id, role, n);
      // 挪到别的行，节点会换：焦点放回同一件
      requestAnimationFrame(() => {
        const next = root.querySelector<HTMLElement>(`[data-cal-drag="${CSS.escape(id)}"]`);
        if (next && document.activeElement !== next) next.focus();
      });
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('contextmenu', onContextMenu, true);
    root.addEventListener('dragstart', onDragStart, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('contextmenu', onContextMenu, true);
      root.removeEventListener('dragstart', onDragStart, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointermove', onMouseMove);
      window.removeEventListener('pointerup', onMouseUp);
      window.removeEventListener('pointercancel', onMouseUp);
      stopTouch?.();
      clearPress();
      if (drag) finish(false);
    };
  }, [rootRef, opts.enabled]);
}
