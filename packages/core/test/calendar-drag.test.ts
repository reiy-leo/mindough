/**
 * 日历拖动改日期（Rei 2026-11-11 06:55）：整段平移、倒数日、原地不改、不能拖的、撤销、键盘挪一天；
 * 再经 Store.updateTask 看我的一天跟着走（改成今天进、改走移出）。
 */
import { describe, expect, it } from 'vitest';
import { calDropPatch, calPatchStart, calShiftPatch, calUndoPatch, canDragCalItem } from '../src/calendar/drag';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { toDateKey } from '../src/dates';
import { local } from './helpers';

const t = (scheduled_date: string | null, end_date: string | null = null, target_date: string | null = null) => ({ scheduled_date, end_date, target_date });

describe('calDropPatch', () => {
  it('只有日期的任务：改成落下那天', () => {
    expect(calDropPatch(t('2026-11-10'), 'task', '2026-11-10', '2026-11-13')).toEqual({ scheduled_date: '2026-11-13', end_date: null });
    expect(calDropPatch(t('2026-11-10'), 'task', '2026-11-10', '2026-11-08')).toEqual({ scheduled_date: '2026-11-08', end_date: null });
  });

  it('有起止的任务整段平移，天数不变；按在第几天就从第几天算', () => {
    // 11-10 ~ 11-12，按在 11-11，放到 11-15 → 往后 4 天
    expect(calDropPatch(t('2026-11-10', '2026-11-12'), 'task', '2026-11-11', '2026-11-15')).toEqual({ scheduled_date: '2026-11-14', end_date: '2026-11-16' });
    // 跨月、跨年
    expect(calDropPatch(t('2026-12-30', '2027-01-02'), 'task', '2026-12-30', '2027-01-31')).toEqual({ scheduled_date: '2027-01-31', end_date: '2027-02-03' });
  });

  it('倒数日改目标日', () => {
    expect(calDropPatch(t(null, null, '2026-12-25'), 'countdown', '2026-12-25', '2026-12-31')).toEqual({ target_date: '2026-12-31' });
    expect(calDropPatch(t(null), 'countdown', '2026-12-25', '2026-12-31')).toBeNull();
  });

  it('拖回原来那天不改', () => {
    expect(calDropPatch(t('2026-11-10', '2026-11-12'), 'task', '2026-11-12', '2026-11-12')).toBeNull();
  });

  it('订阅事件、打卡不能拖', () => {
    expect(canDragCalItem('event')).toBe(false);
    expect(canDragCalItem('checkin')).toBe(false);
    expect(canDragCalItem('task')).toBe(true);
    expect(canDragCalItem('countdown')).toBe(true);
    expect(calDropPatch(t('2026-11-10'), 'event', '2026-11-10', '2026-11-11')).toBeNull();
    expect(calDropPatch(t('2026-11-10'), 'checkin', '2026-11-10', '2026-11-11')).toBeNull();
  });

  it('没日期的任务不改；结束日不晚于开始日的当单日', () => {
    expect(calDropPatch(t(null), 'task', '2026-11-10', '2026-11-11')).toBeNull();
    expect(calDropPatch(t('2026-11-10', '2026-11-10'), 'task', '2026-11-10', '2026-11-11')).toEqual({ scheduled_date: '2026-11-11', end_date: null });
  });

  it('撤销字段、新开始日、键盘挪一天', () => {
    const task = t('2026-11-10', '2026-11-12');
    const p = calDropPatch(task, 'task', '2026-11-10', '2026-11-11')!;
    expect(calUndoPatch(task, p)).toEqual({ scheduled_date: '2026-11-10', end_date: '2026-11-12' });
    expect(calPatchStart(p)).toBe('2026-11-11');
    const cd = t(null, null, '2026-12-25');
    expect(calUndoPatch(cd, calDropPatch(cd, 'countdown', '2026-12-25', '2026-12-26')!)).toEqual({ target_date: '2026-12-25' });
    expect(calShiftPatch(task, 'task', -1)).toEqual({ scheduled_date: '2026-11-09', end_date: '2026-11-11' });
    expect(calShiftPatch(cd, 'countdown', 1)).toEqual({ target_date: '2026-12-26' });
    expect(calShiftPatch(t(null), 'task', 1)).toBeNull();
  });
});

describe('拖动后经 Store.updateTask：我的一天跟着走', () => {
  async function open() {
    const now = local(2026, 11, 11, 9).getTime();
    return Store.open(new MemoryAdapter(), { deviceId: 'dev1', now: () => new Date(now) });
  }

  it('拖到今天进我的一天，拖走移出；撤销回到原样', async () => {
    const store = await open();
    const today = toDateKey(store.now());
    const task = store.createTask({ body_md: '写周报', scheduled_date: '2026-11-13' });
    expect(store.isInMyDay(task.id, today)).toBe(false);
    const p1 = calDropPatch(task, 'task', '2026-11-13', today)!;
    const undo1 = calUndoPatch(task, p1);
    const moved = store.updateTask(task.id, p1);
    expect(moved.scheduled_date).toBe(today);
    expect(store.isInMyDay(task.id, today)).toBe(true);
    store.updateTask(task.id, undo1);
    expect(store.get('task', task.id)!.scheduled_date).toBe('2026-11-13');
    expect(store.isInMyDay(task.id, today)).toBe(false);
  });

  it('段任务平移后天数不变；整段挪出今天就移出我的一天', async () => {
    const store = await open();
    const today = toDateKey(store.now());
    const task = store.createTask({ body_md: '出差', scheduled_date: '2026-11-10', end_date: '2026-11-12' });
    expect(store.isInMyDay(task.id, today)).toBe(true);
    const after = store.updateTask(task.id, calDropPatch(task, 'task', '2026-11-11', '2026-11-18')!);
    expect([after.scheduled_date, after.end_date]).toEqual(['2026-11-17', '2026-11-19']);
    expect(store.isInMyDay(task.id, today)).toBe(false);
  });
});
