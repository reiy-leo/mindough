/**
 * 打卡达标后不能再加（Rei 2026-11-09 01:05「打卡 计数 完成4/4 居然还能继续加，不应该这样」）。
 */
import { describe, expect, it } from 'vitest';
import { capCheckIn, CheckInMetError } from '../src/checkin';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { local } from './helpers';

async function open(now = local(2026, 11, 9, 10)) {
  let t = now.getTime();
  const store = await Store.open(new MemoryAdapter(), { deviceId: 'dev1', now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms) };
}

describe('capCheckIn', () => {
  it('达标后加量、开始、继续都拦；减量、暂停、结束不拦', () => {
    const met = { met: true, value: 4, target: 4 };
    expect(capCheckIn('count', met, 'add', 1).blocked).toBe(true);
    expect(capCheckIn('count', met, 'add', -1)).toEqual({ blocked: false, amount: -1 });
    expect(capCheckIn('once', { met: true, value: 1, target: 1 }, 'add', 1).blocked).toBe(true);
    expect(capCheckIn('timer', { met: true, value: 1, target: 1 }, 'start', 0).blocked).toBe(true);
    expect(capCheckIn('timer', { met: true, value: 1, target: 1 }, 'resume', 0).blocked).toBe(true);
    expect(capCheckIn('timer', { met: true, value: 1, target: 1 }, 'stop', 0).blocked).toBe(false);
    expect(capCheckIn('countdown', { met: true, value: 0, target: null }, 'add', 1).blocked).toBe(false);
  });
  it('计数没达标：最多加到目标', () => {
    expect(capCheckIn('count', { met: false, value: 3, target: 4 }, 'add', 2)).toEqual({ blocked: false, amount: 1 });
    expect(capCheckIn('count', { met: false, value: 1800, target: 2000 }, 'add', 330)).toEqual({ blocked: false, amount: 200 });
    expect(capCheckIn('count', { met: false, value: 0.1, target: 0.3 }, 'add', 1)).toEqual({ blocked: false, amount: 0.2 });
    expect(capCheckIn('count', { met: false, value: 1, target: 4 }, 'add', 2)).toEqual({ blocked: false, amount: 2 });
  });
});

describe('Store.checkIn 达标后', () => {
  it('计数每天 4 次：4/4 后 +1 抛 CheckInMetError，数据不变；撤销最后一次回到 3/4 又能加', async () => {
    const { store, advance } = await open();
    const t = store.createTask({ completion_mode: 'count', target_value: 4, recurrence: 'FREQ=DAILY' });
    for (let i = 0; i < 4; i++) {
      store.checkIn(t.id, 'add', 1);
      advance(1000);
    }
    expect(store.progress(t.id)).toMatchObject({ value: 4, met: true });
    const before = store.list('check_in').length;
    expect(() => store.checkIn(t.id, 'add', 1)).toThrow(CheckInMetError);
    expect(store.list('check_in').length).toBe(before);
    store.undoCheckIn(store.lastCountAdd(t.id)!.id);
    expect(store.progress(t.id)).toMatchObject({ value: 3, met: false });
    const r = store.checkIn(t.id, 'add', 5);
    expect(r.event.amount).toBe(1);
    expect(store.progress(t.id)).toMatchObject({ value: 4, met: true });
  });
  it('第二天是新周期，照常能加', async () => {
    const { store, advance } = await open();
    const t = store.createTask({ completion_mode: 'count', target_value: 1, recurrence: 'FREQ=DAILY' });
    store.checkIn(t.id, 'add', 1);
    expect(() => store.checkIn(t.id, 'add', 1)).toThrow(CheckInMetError);
    advance(24 * 3600_000);
    expect(store.checkIn(t.id, 'add', 1).progress.met).toBe(true);
  });
  it('计时达标后不能再开始', async () => {
    const { store, advance } = await open();
    const t = store.createTask({ completion_mode: 'timer', target_value: 60_000, recurrence: 'FREQ=DAILY' });
    store.checkIn(t.id, 'start');
    advance(61_000);
    store.checkIn(t.id, 'stop');
    expect(store.progress(t.id)!.met).toBe(true);
    expect(() => store.checkIn(t.id, 'start')).toThrow(CheckInMetError);
  });
});
