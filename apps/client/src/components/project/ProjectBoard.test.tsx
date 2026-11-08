// @vitest-environment happy-dom
/**
 * 看板点卡片任何地方都打开详情（Rei 2026-11-08「项目 看板 不显示详情第三列，点击不显示详情」）。
 * 以前只有卡片里的标题按钮会开，点到卡片留白没反应；拖动的尾巴不算点开。
 * 2026-11-09 起看板视图不放右列，打开的详情是浮层（DetailModal，测试在 components/task/DetailModal.test.tsx）；这里只管点卡片会不会 openEditor。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Store, Task } from '@mindough/core';

const ui = vi.hoisted(() => ({ editingId: null as string | null, openEditor: vi.fn() }));
const drag = vi.hoisted(() => ({ pressing: false }));
vi.mock('../../lib/ui', () => ({ useUi: () => ui }));
vi.mock('../../lib/actions', () => ({ changeStatus: vi.fn() }));
vi.mock('../../lib/view', () => ({ titleOf: (_s: unknown, t: Task) => t.body_md }));
vi.mock('../../lib/drag-guard', () => ({ isDragPress: () => drag.pressing, useReorderGuard: () => ({ ref: { current: null }, handlers: {} }) }));
// 卡片里的行换成最小的样子：标题按钮 + 一段留白
vi.mock('../TaskRow', () => ({
  TaskRow: ({ task }: { task: Task }) => (
    <div className="task-row" data-task-id={task.id}>
      <button type="button" className="row-main">{task.body_md}</button>
      <span className="gap">留白</span>
    </div>
  ),
}));

import { ProjectBoard } from './ProjectBoard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (id: string, status: Task['status']): Task => ({ id, body_md: `任务 ${id}`, status, deleted: false, sort: 1, created_at: '2026-11-08T00:00:00.000Z' } as unknown as Task);
const tasks = [mk('a', '待办'), mk('b', '进行中')];
const store = { version: 1, get: (_t: string, id: string) => tasks.find((t) => t.id === id) } as unknown as Store;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  ui.openEditor.mockReset();
  ui.editingId = null;
  drag.pressing = false;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<ProjectBoard store={store} tasks={tasks} />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const card = (id: string) => host.querySelector(`.board-card[data-key="${id}"]`) as HTMLElement;
function press(el: Element) {
  act(() => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }));
  });
}

describe('看板卡片点开详情', () => {
  it('点卡片的留白：打开这件', () => {
    press(card('b').querySelector('.gap')!);
    expect(ui.openEditor).toHaveBeenCalledWith('b');
  });

  it('点卡片本身（拖动把手和行之间的空隙）：也打开', () => {
    press(card('a'));
    expect(ui.openEditor).toHaveBeenCalledWith('a');
  });

  it('拖动的尾巴不算点开', () => {
    drag.pressing = true;
    press(card('a').querySelector('.gap')!);
    expect(ui.openEditor).not.toHaveBeenCalled();
  });

  it('聚焦卡片按回车：也打开（浮层详情同样能用键盘打开）', () => {
    const el = card('b');
    act(() => el.focus());
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(ui.openEditor).toHaveBeenCalledWith('b');
  });

  it('打开了详情、长按弹出的行菜单还在：松手那下不再开', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    try {
      press(card('a').querySelector('.gap')!);
      expect(ui.openEditor).not.toHaveBeenCalled();
    } finally {
      menu.remove();
    }
  });

  it('选中的卡片带 is-selected', () => {
    ui.editingId = 'b';
    act(() => root.render(<ProjectBoard store={store} tasks={[...tasks]} />));
    expect(card('b').classList.contains('is-selected')).toBe(true);
    expect(card('a').classList.contains('is-selected')).toBe(false);
  });
});
