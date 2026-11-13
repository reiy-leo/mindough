// @vitest-environment happy-dom
/**
 * 手指拖动排序（Rei 2026-11-14 05:54「手机端 拖 drag handle 没反应；长按会变灰，之后什么操作也没反应」）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useReorderGuard, isDragPress, resetDragGuard } from './drag-guard';
import { cancelTouchReorder, dropSpot, edgeSpeed, pickColumn, TOUCH_LIFT_MS, touchReorderState, useTouchReorder, type ReorderLike } from './touch-reorder';
import { resetLongPressGuard } from './long-press';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const box = (key: string, top: number, h = 40) => ({ key, top, bottom: top + h, left: 0, width: 300 });

describe('落点（纯算）', () => {
  // 被拖的是原来第 1 行（b），其余 a c d
  const rows = [box('a', 0), box('c', 80), box('d', 120)];
  it('手指过了下一行的中线才算插到它后面；落回原处返回 null', () => {
    expect(dropSpot(rows, 1, 50)).toBeNull(); // a 中线 20 以下、c 中线 100 以上：还是原处
    expect(dropSpot(rows, 1, 10)).toMatchObject({ key: 'a', dropPosition: 'before' });
    expect(dropSpot(rows, 1, 101)).toMatchObject({ key: 'd', dropPosition: 'before' });
    expect(dropSpot(rows, 1, 500)).toMatchObject({ key: 'd', dropPosition: 'after', lineY: 160 });
  });
  it('两行有间隙时横线画在间隙正中', () => {
    const gap = [box('a', 0), box('c', 46)];
    expect(dropSpot(gap, 0, 50)?.lineY).toBe(43);
  });
  it('没有别的行：不落', () => {
    expect(dropSpot([], 0, 10)).toBeNull();
  });
  it('看板：x 落在哪列，列外取最近的', () => {
    const cols = [
      { item: 'todo', left: 0, right: 200 },
      { item: 'doing', left: 212, right: 412 },
    ];
    expect(pickColumn(cols, 100)).toBe('todo');
    expect(pickColumn(cols, 206)).toBe('todo');
    expect(pickColumn(cols, 300)).toBe('doing');
    expect(pickColumn(cols, 900)).toBe('doing');
  });
  it('贴边自动滚：离边越近越快，有上限，中间不滚', () => {
    expect(edgeSpeed(400, 0, 800)).toBe(0);
    expect(edgeSpeed(790, 0, 800)).toBeGreaterThan(0);
    expect(edgeSpeed(5, 0, 800)).toBeLessThan(0);
    expect(edgeSpeed(5000, 0, 800)).toBe(18);
  });
});

// ── 接到一个列表上，用真的 pointer / touch 事件走一遍 ──
let root: Root;
let host: HTMLDivElement;
let reorders: ReorderLike[] = [];
const KEYS = ['a', 'b', 'c', 'd'];

function List() {
  const guard = useReorderGuard();
  useTouchReorder(guard, { group: 't', onReorder: (e) => reorders.push(e) });
  return (
    <div ref={guard.ref} className="task-list">
      {KEYS.map((k) => (
        <div key={k} data-key={k} draggable="true" className="list-item">
          <button className="drag-handle" style={{ pointerEvents: 'none' }}>≡</button>
          <span className="row-title">{k}</span>
        </div>
      ))}
    </div>
  );
}

const rowEl = (k: string) => host.querySelector<HTMLElement>(`[data-key="${k}"]`)!;
function layoutRows() {
  KEYS.forEach((k, i) => {
    rowEl(k).getBoundingClientRect = () => ({ left: 0, right: 300, width: 300, top: 100 + i * 40, bottom: 140 + i * 40, height: 40, x: 0, y: 100 + i * 40, toJSON() {} }) as DOMRect;
    // 把手在行左边 4–22px（React Aria 给它写了 pointer-events: none，事件落在行上，按坐标认）
    rowEl(k).querySelector<HTMLElement>('.drag-handle')!.getBoundingClientRect = () => ({ left: 4, right: 22, width: 18, top: 104 + i * 40, bottom: 136 + i * 40, height: 32, x: 4, y: 104 + i * 40, toJSON() {} }) as DOMRect;
  });
}
function pointer(type: string, el: Element, y: number, id = 1, pointerType = 'touch') {
  // 按在把手上（className drag-handle）x=12，别处 x=150
  const x = el instanceof Element && el.classList.contains('drag-handle') ? 12 : 150;
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y, isPrimary: true } as PointerEventInit);
  el.dispatchEvent(e);
}
function touch(type: string, y: number | null) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown[] };
  Object.defineProperty(e, 'touches', { value: y == null ? [] : [{ clientX: 150, clientY: y }] });
  document.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  reorders = [];
  resetDragGuard();
  resetLongPressGuard();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<List />));
  layoutRows();
});
afterEach(() => {
  cancelTouchReorder();
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const leftovers = () => document.querySelectorAll('.touch-drag-ghost, .touch-drop-line, .is-touch-drag-source, .is-touch-lifted, .is-touch-drop-target').length;

describe('手指拖动', () => {
  it('按把手就拿起，挪动跟手，松手调 onReorder（和 React Aria 同形），干净收尾', () => {
    const handle = rowEl('a').querySelector('.drag-handle')!;
    pointer('pointerdown', handle, 120);
    expect(touchReorderState().lifted).toBe(true);
    expect(isDragPress()).toBe(true); // 拿起就不算点开
    // 原生拖放这次关掉
    expect(rowEl('a').getAttribute('draggable')).toBe('false');
    const m = touch('touchmove', 130);
    expect(m.defaultPrevented).toBe(true); // 页面不滚
    touch('touchmove', 205); // 过了 c 的中线（200）：插到 d 前面
    expect(touchReorderState().dragging).toBe(true);
    expect(document.querySelector('.touch-drag-ghost')).not.toBeNull();
    expect(rowEl('a').classList.contains('is-touch-drag-source')).toBe(true);
    touch('touchend', null);
    expect(reorders).toHaveLength(1);
    expect([...reorders[0]!.keys]).toEqual(['a']);
    expect(reorders[0]!.target).toEqual({ key: 'd', dropPosition: 'before' });
    expect(leftovers()).toBe(0);
    expect(document.documentElement.classList.contains('is-touch-reordering')).toBe(false);
    expect(touchReorderState()).toMatchObject({ pressing: false, dragging: false });
  });

  it('React Aria 的把手 pointer-events: none，事件落在行上：按坐标照样认出是把手，按下就拿起', () => {
    const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: 12, clientY: 160, isPrimary: true } as PointerEventInit);
    rowEl('b').dispatchEvent(e);
    expect(touchReorderState().lifted).toBe(true);
    touch('touchend', null);
  });

  it('拖到一半 touchcancel（系统手势）：不改顺序、不留东西', () => {
    pointer('pointerdown', rowEl('b').querySelector('.drag-handle')!, 160);
    touch('touchmove', 175);
    touch('touchmove', 240);
    touch('touchcancel', null);
    expect(reorders).toHaveLength(0);
    expect(leftovers()).toBe(0);
    expect(touchReorderState().dragging).toBe(false);
  });

  it('同一根手指 pointercancel：也收掉', () => {
    pointer('pointerdown', rowEl('b').querySelector('.drag-handle')!, 160);
    touch('touchmove', 200);
    pointer('pointercancel', window as unknown as Element, 200);
    expect(reorders).toHaveLength(0);
    expect(leftovers()).toBe(0);
  });

  it('漏了 touchend（WebView 吞了）：下一次按下先把上一次收掉', () => {
    pointer('pointerdown', rowEl('b').querySelector('.drag-handle')!, 160);
    touch('touchmove', 200);
    expect(touchReorderState().dragging).toBe(true);
    pointer('pointerdown', rowEl('d').querySelector('.row-title')!, 230, 2);
    expect(touchReorderState().dragging).toBe(false);
    expect(document.querySelectorAll('.touch-drag-ghost').length).toBe(0);
    expect(reorders).toHaveLength(0);
  });

  it('长按行 450ms 拿起再挪；没到点挪远了就是滚页面，不拿起', () => {
    vi.useFakeTimers();
    pointer('pointerdown', rowEl('c').querySelector('.row-title')!, 190);
    vi.advanceTimersByTime(TOUCH_LIFT_MS - 50);
    expect(touchReorderState().lifted).toBe(false);
    const early = touch('touchmove', 192);
    expect(early.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(100);
    expect(touchReorderState().lifted).toBe(true);
    expect(rowEl('c').classList.contains('is-touch-lifted')).toBe(true);
    touch('touchmove', 110);
    touch('touchend', null);
    expect(reorders[0]!.target).toEqual({ key: 'a', dropPosition: 'before' });
    expect(leftovers()).toBe(0);

    // 滑：按下后马上挪 30px
    pointer('pointerdown', rowEl('c').querySelector('.row-title')!, 190);
    const slide = touch('touchmove', 160);
    expect(slide.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(TOUCH_LIFT_MS * 2);
    expect(touchReorderState().pressing).toBe(false);
    touch('touchend', null);
    expect(reorders).toHaveLength(1);
  });

  it('长按拿起后原地松手：什么也不改，不留浮起', () => {
    vi.useFakeTimers();
    pointer('pointerdown', rowEl('b').querySelector('.row-title')!, 160);
    vi.advanceTimersByTime(TOUCH_LIFT_MS + 10);
    const end = touch('touchend', null);
    expect(end.defaultPrevented).toBe(true); // 不再合成 click 去点开
    expect(reorders).toHaveLength(0);
    expect(leftovers()).toBe(0);
    expect(isDragPress()).toBe(true); // 松手后的尾巴里不算点开
  });

  it('手指按过以后的原生 dragstart 被拦下；鼠标按下时这行开回原生拖放', () => {
    pointer('pointerdown', rowEl('a').querySelector('.row-title')!, 120);
    const ds = new Event('dragstart', { bubbles: true, cancelable: true });
    rowEl('a').dispatchEvent(ds);
    expect(ds.defaultPrevented).toBe(true);
    touch('touchend', null);
    expect(rowEl('a').getAttribute('draggable')).toBe('false');
    pointer('pointerdown', rowEl('a').querySelector('.row-title')!, 120, 3, 'mouse');
    expect(rowEl('a').getAttribute('draggable')).toBe('true');
  });

  it('只是点一下把手：不拖、不改顺序、不留东西', () => {
    pointer('pointerdown', rowEl('a').querySelector('.drag-handle')!, 120);
    touch('touchend', null);
    expect(reorders).toHaveLength(0);
    expect(leftovers()).toBe(0);
  });
});
