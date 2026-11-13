/**
 * 提示多久自动关（Rei 2026-11-14 06:01「手机端的 toast 显示很长时间不自动关闭。电脑端的 toast 也要时间统一」）。
 */
import { describe, expect, it } from 'vitest';
import { createToastTimers, toastDuration, TOAST_ACTION_MS, TOAST_MS, TOAST_RESUME_MIN_MS } from './toast-timer';

/** 假时钟：setTimer 只记下来，run() 时按时间走；frozen 时计时器不响（像手机切到后台）。 */
function fakeClock() {
  let t = 0;
  let frozen = false;
  let pending: { at: number; fn: () => void; id: number }[] = [];
  let seq = 0;
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      const id = ++seq;
      pending.push({ at: t + ms, fn, id });
      return id;
    },
    clearTimer: (h: unknown) => {
      pending = pending.filter((p) => p.id !== h);
    },
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = frozen ? undefined : pending.filter((p) => p.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        t = Math.max(t, due.at);
        pending = pending.filter((p) => p !== due);
        due.fn();
      }
      t = end;
    },
    freeze(v: boolean) {
      frozen = v;
    },
  };
}

function setup() {
  const clock = fakeClock();
  const gone: number[] = [];
  const timers = createToastTimers((id) => gone.push(id), clock);
  return { clock, gone, timers };
}

describe('toastDuration', () => {
  it('没按钮 4 秒，带按钮 6 秒', () => {
    expect(TOAST_MS).toBe(4000);
    expect(TOAST_ACTION_MS).toBe(6000);
    expect(toastDuration({})).toBe(4000);
    expect(toastDuration({ actions: [] })).toBe(4000);
    expect(toastDuration({ actions: [{ label: '撤销' }] })).toBe(6000);
  });
});

describe('createToastTimers', () => {
  it('到点就关，没到不关', () => {
    const { clock, gone, timers } = setup();
    timers.add(1, 4000);
    clock.advance(3999);
    expect(gone).toEqual([]);
    clock.advance(1);
    expect(gone).toEqual([1]);
  });

  it('几条各按各的时间关', () => {
    const { clock, gone, timers } = setup();
    timers.add(1, 6000);
    clock.advance(1000);
    timers.add(2, 4000);
    clock.advance(4000);
    expect(gone).toEqual([2]);
    clock.advance(1000);
    expect(gone).toEqual([2, 1]);
  });

  it('计时器停住（手机后台）：回来扫一遍，过点的立刻关', () => {
    const { clock, gone, timers } = setup();
    timers.add(1, 4000);
    clock.freeze(true);
    clock.advance(30000);
    expect(gone).toEqual([]);
    timers.sweep();
    expect(gone).toEqual([1]);
  });

  it('扫的时候没过点的不动', () => {
    const { clock, gone, timers } = setup();
    timers.add(1, 4000);
    clock.advance(2000);
    timers.sweep();
    expect(gone).toEqual([]);
    clock.advance(2000);
    expect(gone).toEqual([1]);
  });

  it('鼠标停住不关，移开接着算剩下的', () => {
    const { clock, gone, timers } = setup();
    timers.add(1, 4000);
    clock.advance(1000);
    timers.hold(1);
    clock.advance(20000);
    timers.sweep();
    expect(gone).toEqual([]);
    timers.release(1);
    clock.advance(2999);
    expect(gone).toEqual([]);
    clock.advance(1);
    expect(gone).toEqual([1]);
  });

  it('停到快过点才移开：至少再给 1 秒', () => {
    const { clock, gone, timers } = setup();
    timers.add(1, 4000);
    clock.advance(3900);
    timers.hold(1);
    clock.advance(5000);
    timers.release(1);
    clock.advance(TOAST_RESUME_MIN_MS - 1);
    expect(gone).toEqual([]);
    clock.advance(1);
    expect(gone).toEqual([1]);
  });

  it('停住一条不影响别的', () => {
    const { clock, gone, timers } = setup();
    timers.add(1, 4000);
    timers.add(2, 4000);
    timers.hold(1);
    clock.advance(4000);
    expect(gone).toEqual([2]);
  });

  it('手动关了的不再回调；没有的 id 不出错', () => {
    const { clock, gone, timers } = setup();
    timers.add(1, 4000);
    timers.remove(1);
    timers.hold(9);
    timers.release(9);
    timers.remove(9);
    clock.advance(10000);
    expect(gone).toEqual([]);
  });

  it('dispose 后什么都不关', () => {
    const { clock, gone, timers } = setup();
    timers.add(1, 4000);
    timers.dispose();
    clock.advance(10000);
    expect(gone).toEqual([]);
  });
});
