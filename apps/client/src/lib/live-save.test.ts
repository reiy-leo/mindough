// @vitest-environment happy-dom
/** 边打边存的防抖（Rei 2026-11-13 06:19，lib/live-save）。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveSaver, imeComposing, LIVE_SAVE_MAX_MS, LIVE_SAVE_MS, onPageHide } from './live-save';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createLiveSaver', () => {
  it('停手 300 ms 才存一次，连打不每个字存', () => {
    const save = vi.fn();
    const s = createLiveSaver(save, { composing: () => false });
    for (let i = 0; i < 5; i++) {
      s.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LIVE_SAVE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(s.pending).toBe(false);
  });

  it('一直在打：最多 2 秒也存一次', () => {
    const save = vi.fn();
    const s = createLiveSaver(save, { composing: () => false });
    for (let t = 0; t < LIVE_SAVE_MAX_MS + 200; t += 100) {
      s.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush：排着的马上存；没排着的不存', () => {
    const save = vi.fn();
    const s = createLiveSaver(save, { composing: () => false });
    s.flush();
    expect(save).not.toHaveBeenCalled();
    s.schedule();
    s.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('cancel：丢掉排着的', () => {
    const save = vi.fn();
    const s = createLiveSaver(save, { composing: () => false });
    s.schedule();
    s.cancel();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it('输入法选字中到点不存，选完字再存', () => {
    const save = vi.fn();
    let composing = true;
    const s = createLiveSaver(save, { composing: () => composing });
    s.schedule();
    vi.advanceTimersByTime(LIVE_SAVE_MS * 3);
    expect(save).not.toHaveBeenCalled();
    composing = false;
    vi.advanceTimersByTime(LIVE_SAVE_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('输入法状态与页面隐藏', () => {
  it('compositionstart / compositionend 跟着变', () => {
    document.dispatchEvent(new Event('compositionstart'));
    expect(imeComposing()).toBe(true);
    document.dispatchEvent(new Event('compositionend'));
    expect(imeComposing()).toBe(false);
  });

  it('pagehide 调回调，取消后不调', () => {
    const fn = vi.fn();
    const off = onPageHide(fn);
    window.dispatchEvent(new Event('pagehide'));
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    window.dispatchEvent(new Event('pagehide'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
