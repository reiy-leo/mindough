// @vitest-environment happy-dom
/**
 * 前后关系拖到另一组换方向（Rei 2026-11-18「前置任务和后置任务可以拖拽更换」）：
 * 手指长按拿起，拖到「做完后解锁」放下 → A → B 换成 B → A；会绕成圈、自动连上的（打卡存档）放下也不换，提示为什么；
 * 另一组空着时平时不显示，拖起来才出来接；严格模式锁住的拖不起来。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryAdapter, Store, predecessorsOf, successorsOf, taskTitle, type Task } from '@mindough/core';

const toast = vi.fn();
const openEditor = vi.fn();
vi.mock('../../lib/ui', () => ({ useUi: () => ({ toast, openEditor }) }));
vi.mock('../../lib/view', () => ({ titleOf: (_s: unknown, t: Task | string) => (typeof t === 'string' ? t : taskTitle({ body_md: t.body_md })) }));

import { DepList, type DepKind } from './DepList';
import { resetDragGuard } from '../../lib/drag-guard';
import { resetLongPressGuard } from '../../lib/long-press';
import { cancelTouchReorder, TOUCH_LIFT_MS } from '../../lib/touch-reorder';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let store: Store;

function Harness({ task, locked = false }: { task: Task; locked?: boolean; v: number }) {
  const [dragging, setDragging] = useState<DepKind | null>(null);
  const edges = store.edges();
  const of = (ids: string[]) => ids.map((id) => store.get('task', id)!).filter(Boolean);
  return (
    <div className="relations">
      {(['pred', 'succ'] as const).map((k) => (
        <DepList key={k} store={store} task={task} kind={k} list={of(k === 'pred' ? predecessorsOf(edges, task.id) : successorsOf(edges, task.id))} label={k} locked={locked} dragging={dragging} onDragging={setDragging} />
      ))}
    </div>
  );
}
const render = (task: Task, locked = false) => act(() => root.render(<Harness task={task} locked={locked} v={store.version} />));

const rect = (top: number, h: number) => ({ left: 0, right: 300, width: 300, top, bottom: top + h, height: h, x: 0, y: top, toJSON() {} }) as DOMRect;
const groups = () => [...host.querySelectorAll<HTMLElement>('.rel-group')];
const lists = () => groups().map((g) => g.querySelector<HTMLElement>('[role="grid"]')!);
const rowsIn = (i: number) => [...lists()[i]!.querySelectorAll<HTMLElement>('[data-key]')];
/** 先做完这些在 100–200，做完后解锁在 220–320；每组的行从组顶 +30 起，一行 36。 */
function layout() {
  groups().forEach((g, gi) => {
    const top = 100 + gi * 120;
    g.getBoundingClientRect = () => rect(top, 100);
    lists()[gi]!.getBoundingClientRect = () => rect(top + 30, 70);
    rowsIn(gi).forEach((r, ri) => (r.getBoundingClientRect = () => rect(top + 30 + ri * 36, 36)));
  });
}
function pointerDown(el: Element, y: number) {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: 150, clientY: y, isPrimary: true } as PointerEventInit));
}
function touch(type: string, y: number | null) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown[] };
  Object.defineProperty(e, 'touches', { value: y == null ? [] : [{ clientX: 150, clientY: y }] });
  document.dispatchEvent(e);
}
/** 长按 pred 组第 i 行，拖到 y 放下。 */
function dragRow(groupIndex: number, i: number, toY: number) {
  layout();
  const row = rowsIn(groupIndex)[i]!;
  const y = row.getBoundingClientRect().top + 18;
  act(() => pointerDown(row.querySelector('.rel-title')!, y));
  act(() => void vi.advanceTimersByTime(TOUCH_LIFT_MS + 20));
  // 拿起以后另一组（空的也是）亮出来
  act(() => void vi.advanceTimersByTime(10));
  layout();
  act(() => touch('touchmove', y + 10));
  act(() => touch('touchmove', toY));
  act(() => touch('touchend', null));
  act(() => void vi.advanceTimersByTime(10));
}
const pairs = () => store.edges().map((e) => `${store.get('task', e.pred_id)!.body_md}>${store.get('task', e.succ_id)!.body_md}`).sort();

beforeEach(async () => {
  vi.useFakeTimers();
  toast.mockReset();
  openEditor.mockReset();
  resetDragGuard();
  resetLongPressGuard();
  store = await Store.open(new MemoryAdapter(), { deviceId: 'd' });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  cancelTouchReorder();
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('拖到另一组换方向', () => {
  it('「先做完这些」里的 A 拖到「做完后解锁」：A → B 换成 B → A，提示新方向；空的那组拖起来才出现', () => {
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    store.addDependency(a.id, b.id);
    render(b);
    // 做完后解锁空着：平时藏着
    expect(groups()[1]!.classList.contains('is-idle-empty')).toBe(true);
    layout();
    const row = rowsIn(0)[0]!;
    act(() => pointerDown(row.querySelector('.rel-title')!, 148));
    act(() => void vi.advanceTimersByTime(TOUCH_LIFT_MS + 30));
    expect(groups()[1]!.classList.contains('is-idle-empty')).toBe(false);
    expect(groups()[1]!.classList.contains('is-drop-zone')).toBe(true);
    expect(groups()[1]!.textContent).toContain('拖到这里');
    layout();
    act(() => touch('touchmove', 158));
    act(() => touch('touchmove', 270));
    expect(lists()[1]!.classList.contains('is-touch-drop-target')).toBe(true);
    act(() => touch('touchend', null));
    act(() => void vi.advanceTimersByTime(10));
    expect(pairs()).toEqual(['B>A']);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'info', message: '已换方向：做完「B」，就能开始「A」' }));
    render(b);
    expect(rowsIn(0)).toHaveLength(0);
    expect(rowsIn(1).map((r) => r.querySelector('.rel-title')!.textContent)).toEqual(['A']);
    // 拖完不算点开
    expect(openEditor).not.toHaveBeenCalled();
    // 再从「做完后解锁」拖回「先做完这些」
    dragRow(1, 0, 150);
    expect(pairs()).toEqual(['A>B']);
  });

  it('在本组里拖来拖去：什么都不改（组内没有顺序可排）', () => {
    const a = store.createTask({ body_md: 'A' });
    const c = store.createTask({ body_md: 'C' });
    const b = store.createTask({ body_md: 'B' });
    store.addDependency(a.id, b.id);
    store.addDependency(c.id, b.id);
    render(b);
    dragRow(0, 0, 180);
    expect(pairs()).toEqual(['A>B', 'C>B']);
    expect(toast).not.toHaveBeenCalled();
  });

  it('会绕成圈：A → X → B 还在，A 拖到「做完后解锁」不换，提示圈', () => {
    const a = store.createTask({ body_md: 'A' });
    const x = store.createTask({ body_md: 'X' });
    const b = store.createTask({ body_md: 'B' });
    store.addDependency(a.id, b.id);
    store.addDependency(a.id, x.id);
    store.addDependency(x.id, b.id);
    render(b);
    const i = rowsIn(0).findIndex((r) => r.querySelector('.rel-title')!.textContent === 'A');
    dragRow(0, i, 270);
    expect(pairs()).toEqual(['A>B', 'A>X', 'X>B']);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error', message: '换不了方向：这样会绕成一个圈（A → X → B → A）' }));
  });

  it('打卡存正文生成的那条（自动连上的）：放下也不换，提示', () => {
    const h = store.createTask({ body_md: '读书\n\n第三章', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=DAILY' });
    store.checkIn(h.id, 'add', 2);
    const before = pairs();
    expect(before).toHaveLength(1);
    render(store.get('task', h.id)!);
    dragRow(0, 0, 270);
    expect(pairs()).toEqual(before);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error', message: '这条前后关系是自动连上的，不能换方向' }));
  });

  it('严格模式锁住的：拖不起来', () => {
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    store.addDependency(a.id, b.id);
    render(b, true);
    dragRow(0, 0, 270);
    expect(pairs()).toEqual(['A>B']);
    expect(groups()[1]!.classList.contains('is-idle-empty')).toBe(true);
  });

  it('点一行打开那件任务', () => {
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    store.addDependency(a.id, b.id);
    render(b);
    vi.advanceTimersByTime(1000);
    const row = rowsIn(0)[0]!;
    act(() => {
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 2, pointerType: 'mouse', button: 0, isPrimary: true } as PointerEventInit));
      row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 2, pointerType: 'mouse', button: 0, isPrimary: true } as PointerEventInit));
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(openEditor).toHaveBeenCalledWith(a.id);
  });
});
