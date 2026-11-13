/**
 * 提示（toast）多久自动关（Rei 2026-11-14 06:01「手机端的 toast 显示很长时间不自动关闭。电脑端的 toast 也要时间统一」）。
 *
 * - 时长只有两档，电脑、手机一样：没按钮的 4 秒，带按钮（撤销、查看、去设置……）的 6 秒，留出点按钮的时间。
 *   调用的地方不再自己传时长（以前 2.5–12 秒各写各的）。
 * - 按「到点时刻」算，不靠一个 setTimeout 等到底：手机切到后台、锁屏、WebView 暂停计时器时 setTimeout 会停住，
 *   回来后可能迟迟不响，提示就一直挂着。所以页面回到前台（visibilitychange / pageshow / focus）、手指或鼠标按下时，
 *   都顺手扫一遍，过点的立刻关。
 * - 鼠标停在提示上时不关（只认 pointerType = mouse），移开后接着算剩下的时间（至少再给 1 秒）。
 *   触屏点一下不算停留：手机上没有「移开」，以前很多库在触屏上把计时永远暂停，就是这个坑。
 */

/** 没按钮的提示显示多久（毫秒）。 */
export const TOAST_MS = 4000;
/** 带按钮的提示显示多久（毫秒）。 */
export const TOAST_ACTION_MS = 6000;
/** 鼠标移开后至少再显示多久。 */
export const TOAST_RESUME_MIN_MS = 1000;

export function toastDuration(t: { actions?: readonly unknown[] }): number {
  return t.actions?.length ? TOAST_ACTION_MS : TOAST_MS;
}

interface Entry {
  /** 到点时刻（now() 的单位）；停住时无意义 */
  due: number;
  /** 停住时还剩多少 */
  left: number;
  held: boolean;
}

export interface ToastTimers {
  add(id: number, ms: number): void;
  /** 鼠标进来：停住计时。 */
  hold(id: number): void;
  /** 鼠标离开：接着算剩下的。 */
  release(id: number): void;
  remove(id: number): void;
  /** 把过点的都关掉（回到前台、按下时调用）。 */
  sweep(): void;
  dispose(): void;
}

export interface TimerDeps {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export function createToastTimers(onExpire: (id: number) => void, deps: TimerDeps = {}): ToastTimers {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const items = new Map<number, Entry>();
  let handle: unknown = null;

  const schedule = () => {
    if (handle != null) clearTimer(handle);
    handle = null;
    let next = Infinity;
    for (const e of items.values()) if (!e.held && e.due < next) next = e.due;
    if (next === Infinity) return;
    handle = setTimer(sweep, Math.max(0, next - now()));
  };
  function sweep() {
    const t = now();
    const gone: number[] = [];
    for (const [id, e] of items) if (!e.held && e.due <= t) gone.push(id);
    for (const id of gone) items.delete(id);
    schedule();
    for (const id of gone) onExpire(id);
  }
  return {
    add(id, ms) {
      items.set(id, { due: now() + ms, left: ms, held: false });
      schedule();
    },
    hold(id) {
      const e = items.get(id);
      if (!e || e.held) return;
      e.left = Math.max(0, e.due - now());
      e.held = true;
      schedule();
    },
    release(id) {
      const e = items.get(id);
      if (!e || !e.held) return;
      e.held = false;
      e.due = now() + Math.max(e.left, TOAST_RESUME_MIN_MS);
      schedule();
    },
    remove(id) {
      if (items.delete(id)) schedule();
    },
    sweep,
    dispose() {
      if (handle != null) clearTimer(handle);
      handle = null;
      items.clear();
    },
  };
}
