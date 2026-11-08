// @vitest-environment happy-dom
/** 严格模式（Rei 2026-11-08）：漏网写入被 Store 拦下时，全局接住并给提示，不当成错误。 */
import { describe, expect, it } from 'vitest';
import { MemoryAdapter, Store, StrictModeError } from '@mindough/core';
import { installStrictGuard, isStrictError } from './strict';

describe('严格模式的全局提示', () => {
  it('认得 StrictModeError', () => {
    expect(isStrictError(new StrictModeError())).toBe(true);
    expect(isStrictError(new Error('x'))).toBe(false);
  });

  it('error 事件里的 StrictModeError：提示一次并 preventDefault，别的错误不管', () => {
    const got: string[] = [];
    const off = installStrictGuard((m) => got.push(m));
    const ev = new ErrorEvent('error', { error: new StrictModeError(), cancelable: true });
    window.dispatchEvent(ev);
    expect(got).toEqual(['严格模式下已完成的任务不能修改']);
    expect(ev.defaultPrevented).toBe(true);
    const other = new ErrorEvent('error', { error: new Error('别的'), cancelable: true });
    window.dispatchEvent(other);
    expect(got).toHaveLength(1);
    expect(other.defaultPrevented).toBe(false);
    off();
    window.dispatchEvent(new ErrorEvent('error', { error: new StrictModeError(), cancelable: true }));
    expect(got).toHaveLength(1);
  });

  it('Store 开着严格模式时改完成的任务会抛 StrictModeError，重新打开后能改', async () => {
    const store = await Store.open(new MemoryAdapter(), { deviceId: 'd' });
    const t = store.createTask({ body_md: 'a' }, { joinMyDay: false });
    store.completeTask(t.id);
    store.strictDone = true;
    expect(store.isLocked(t.id)).toBe(true);
    expect(() => store.updateTask(t.id, { body_md: 'b' })).toThrow(StrictModeError);
    store.reopenTask(t.id);
    store.updateTask(t.id, { body_md: 'b' });
    expect(store.get('task', t.id)!.body_md).toBe('b');
  });
});
