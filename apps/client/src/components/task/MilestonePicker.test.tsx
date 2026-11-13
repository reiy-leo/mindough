// @vitest-environment happy-dom
/**
 * 里程碑选择（Rei 2026-11-13「显示为一个可搜索的dropdown，搜索可以选择，也可以新建」）：
 * 列这个项目的里程碑；打字过滤；没有同名时最后一行「新建」，回车就建并选上；同名不再给新建；清除里程碑；
 * 改名重名不让存；归档后不再列（现在挂的那个仍列着、带「已归档」）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryAdapter, Store } from '@mindough/core';

const toast = vi.fn();
vi.mock('../../lib/ui', () => ({ useUi: () => ({ toast }) }));

import { MilestoneList } from './MilestonePicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let store: Store;
let gid: string;
let tid: string;
const done = vi.fn();
beforeEach(async () => {
  store = await Store.open(new MemoryAdapter(), { deviceId: 'd' });
  gid = store.insert('group', { name: '装修', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true }).id;
  tid = store.createTask({ body_md: '量尺寸', group_id: gid }).id;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  toast.mockClear();
  done.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function Harness() {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick((n) => n + 1)), []);
  const t = store.get('task', tid)!;
  return <MilestoneList store={store} groupId={gid} value={store.milestoneOf(t)?.id ?? null} onChange={(id) => store.setTaskMilestone(tid, id)} onDone={done} autoFocus={false} />;
}
const render = () => act(() => root.render(<Harness />));
const input = () => host.querySelector('input.cat-select-input') as HTMLInputElement;
const options = () => [...host.querySelectorAll('[role="option"]')].map((li) => (li.querySelector('.milestone-option-name')?.textContent ?? '').trim());
function type(el: HTMLInputElement, text: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const key = (el: HTMLElement, k: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
const milestoneOfTask = () => store.milestoneOf(store.get('task', tid))?.name ?? null;

describe('里程碑下拉', () => {
  it('空项目：提示能新建；打字后最后一行是「新建」，回车建好并选上', () => {
    render();
    expect(host.textContent).toContain('这个项目还没有里程碑');
    type(input(), ' 设计 ');
    expect(options()).toEqual(['新建里程碑“设计”']);
    key(input(), 'Enter');
    expect(milestoneOfTask()).toBe('设计');
    expect(store.milestones(gid).map((m) => m.name)).toEqual(['设计']);
    expect(done).toHaveBeenCalled();
  });

  it('打字过滤；完全同名（忽略大小写）不给新建；↓ 回车选中', () => {
    store.createMilestone(gid, '设计');
    store.createMilestone(gid, '施工');
    store.createMilestone(gid, 'Beta 验收');
    render();
    expect(options()).toEqual(['设计', '施工', 'Beta 验收']);
    type(input(), '施');
    expect(options()).toEqual(['施工', '新建里程碑“施”']);
    type(input(), 'beta 验收');
    expect(options()).toEqual(['Beta 验收']);
    type(input(), '');
    key(input(), 'ArrowDown');
    key(input(), 'Enter');
    expect(milestoneOfTask()).toBe('施工');
  });

  it('别的项目的里程碑不列', () => {
    const other = store.insert('group', { name: '搬家', icon: '📦', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true }).id;
    store.createMilestone(other, '打包');
    store.createMilestone(gid, '设计');
    render();
    expect(options()).toEqual(['设计']);
  });

  it('清除里程碑', () => {
    const m = store.createMilestone(gid, '设计')!;
    store.setTaskMilestone(tid, m.id);
    render();
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === '清除里程碑')!;
    expect(btn).toBeTruthy();
    act(() => btn.click());
    expect(milestoneOfTask()).toBeNull();
  });

  it('现在挂的里程碑归档了照样列着、带「已归档」；别的归档里程碑不列', () => {
    const a = store.createMilestone(gid, '设计')!;
    const b = store.createMilestone(gid, '施工')!;
    store.setTaskMilestone(tid, a.id);
    store.setMilestoneArchived(a.id, true);
    store.setMilestoneArchived(b.id, true);
    render();
    expect(options()).toEqual(['设计']);
    expect(host.querySelector('.milestone-option-tag')?.textContent).toBe('已归档');
    // 搜归档的同名：「新建」就是取消归档
    type(input(), '施工');
    expect(options()).toEqual(['新建里程碑“施工”']);
    key(input(), 'Enter');
    expect(store.get('milestone', b.id)!.archived_at).toBeNull();
    expect(milestoneOfTask()).toBe('施工');
  });
});
