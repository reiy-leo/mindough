// @vitest-environment happy-dom
/**
 * 任务正文、打卡描述边打边存（Rei 2026-11-13 06:19「任务编辑器现在unfocus才会保存，更改成实时保存」）：
 * 停手 300 ms 写进库（列表标题跟着变），不用失焦；切任务、关掉、页面藏起、打卡前不丢字；输入法选字中不存。
 * 编辑器换成一个文本框（真编辑器的打字在 e2e 里验），这里只验存的时机。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryAdapter, Store, type Task } from '@mindough/core';

vi.mock('../../lib/ui', () => ({ useUi: () => ({ toast: vi.fn() }) }));
vi.mock('../editor/LazyMdEditor', () => ({
  LazyMdEditor: ({ value, onChange, onBlur }: { value: string; onChange: (v: string) => void; onBlur?: () => void }) => (
    <textarea aria-label="正文" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
  ),
}));

import { Body } from './TaskDetail';
import { CheckInNote } from './CheckInNote';
import { flushTaskEdits } from '../../lib/body-flush';
import { LIVE_SAVE_MS } from '../../lib/live-save';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let store: Store;
beforeEach(async () => {
  store = await Store.open(new MemoryAdapter(), { deviceId: 'd' });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.useFakeTimers();
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  host.remove();
});

/** 和详情一样：跟着库重渲染，按任务 id 重挂。 */
function Harness({ id, note = false }: { id: string; note?: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick((n) => n + 1)), []);
  const task = store.get('task', id) as Task;
  return note ? <CheckInNote key={id} store={store} task={task} /> : <Body key={id} store={store} task={task} placeholder="" />;
}
const render = (id: string, note = false) => act(() => root.render(<Harness id={id} note={note} />));
const box = () => host.querySelector('textarea') as HTMLTextAreaElement;
function type(text: string) {
  act(() => {
    const el = box();
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    set.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('任务正文边打边存', () => {
  it('不失焦：停手 300 ms 写进库，标题跟着变；之前不写', () => {
    const t = store.createTask({ body_md: '买菜' });
    render(t.id);
    type('买菜和水果');
    wait(LIVE_SAVE_MS - 50);
    expect(store.get('task', t.id)!.body_md).toBe('买菜');
    wait(60);
    expect(store.get('task', t.id)!.body_md).toBe('买菜和水果');
    expect(store.titleOfTask(store.get('task', t.id)!)).toBe('买菜和水果');
    // 编辑器里的字没被库灌回来改掉
    expect(box().value).toBe('买菜和水果');
  });

  it('连打几下只写一次库', () => {
    const t = store.createTask({ body_md: 'a' });
    render(t.id);
    const writes = vi.fn();
    const off = store.onLocalWrite(writes);
    for (const s of ['ab', 'abc', 'abcd', 'abcde']) {
      type(s);
      wait(100);
    }
    wait(LIVE_SAVE_MS);
    off();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(store.get('task', t.id)!.body_md).toBe('abcde');
  });

  it('切到别的任务：刚打的字马上存下，不等防抖', () => {
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    render(a.id);
    type('A 改了');
    render(b.id);
    expect(store.get('task', a.id)!.body_md).toBe('A 改了');
    expect(box().value).toBe('B');
  });

  it('页面藏起来：排着的马上存', () => {
    const t = store.createTask({ body_md: 'x' });
    render(t.id);
    type('xy');
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(store.get('task', t.id)!.body_md).toBe('xy');
  });

  it('打卡前先存（lib/body-flush）', () => {
    const t = store.createTask({ body_md: 'x' });
    render(t.id);
    type('x 刚写的');
    act(() => flushTaskEdits(t.id));
    expect(store.get('task', t.id)!.body_md).toBe('x 刚写的');
  });

  it('输入法选字中不存，选完字再存', () => {
    const t = store.createTask({ body_md: '你' });
    render(t.id);
    act(() => void document.dispatchEvent(new Event('compositionstart')));
    type('你h');
    wait(LIVE_SAVE_MS * 3);
    expect(store.get('task', t.id)!.body_md).toBe('你');
    act(() => void document.dispatchEvent(new Event('compositionend')));
    type('你好');
    wait(LIVE_SAVE_MS);
    expect(store.get('task', t.id)!.body_md).toBe('你好');
  });
});

describe('打卡描述边打边存', () => {
  it('停手 300 ms 写进库；切任务不丢', () => {
    const t = store.createTask({ body_md: '跑步', completion_mode: 'count', recurrence: { freq: 'daily', interval: 1 } } as never);
    const u = store.createTask({ body_md: '刷牙', completion_mode: 'count', recurrence: { freq: 'daily', interval: 1 } } as never);
    render(t.id, true);
    type('慢跑');
    wait(LIVE_SAVE_MS + 10);
    expect(store.get('task', t.id)!.checkin_note).toBe('慢跑');
    type('慢跑 5 公里');
    render(u.id, true);
    expect(store.get('task', t.id)!.checkin_note).toBe('慢跑 5 公里');
  });
});
