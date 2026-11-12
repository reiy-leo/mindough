/**
 * 边打边存（Rei 2026-11-13 06:19「任务编辑器现在unfocus才会保存，更改成实时保存，而不是unfocus才保存。任务列表中也要实时更新标题绑定。」）
 *
 * 任务正文、打卡描述打字后停 300 ms 就写进本地库（列表标题跟着变）；一直不停地打，最多 2 秒也存一次。
 * 离开编辑器、按 Esc、关掉详情、切到别的任务、页面藏到后台 / 关掉、打卡前：马上把没存的存下去。
 * 输入法正在选字（composition）时不存，选完字再按 300 ms 算。
 *
 * 这里只管写本地库。推给别的设备另有同步引擎的防抖（core sync/engine.ts，本机写入后 1.5 秒没有新写入才推，
 * 推的时候同一行只推最新一份），所以不会每个字发一次请求。
 */

/** 停手多久存（毫秒）。 */
export const LIVE_SAVE_MS = 300;
/** 一直在打：最多隔多久也存一次（毫秒）。 */
export const LIVE_SAVE_MAX_MS = 2000;

export interface LiveSaverTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
  now: () => number;
}

const defaultTimers: LiveSaverTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export interface LiveSaver {
  /** 有改动：排一次存（防抖）。 */
  schedule(): void;
  /** 有没存的就马上存（输入法选字中也存：离开、关掉时不能丢字）。 */
  flush(): void;
  /** 丢掉排着的那次（不存）。 */
  cancel(): void;
  /** 有没有排着没存的。 */
  readonly pending: boolean;
}

/**
 * save：真正写库的函数（自己判断有没有变化）。composing：输入法是不是正在选字，选字中到点了就再等一轮。
 */
export function createLiveSaver(
  save: () => void,
  opts: { delay?: number; maxWait?: number; composing?: () => boolean; timers?: LiveSaverTimers } = {},
): LiveSaver {
  const delay = opts.delay ?? LIVE_SAVE_MS;
  const maxWait = opts.maxWait ?? LIVE_SAVE_MAX_MS;
  const composing = opts.composing ?? imeComposing;
  const t = opts.timers ?? defaultTimers;
  let timer: unknown = null;
  /** 这一串改动里第一下的时间（算最多等多久）。 */
  let first: number | null = null;
  const clear = () => {
    if (timer !== null) t.clear(timer);
    timer = null;
  };
  const run = () => {
    clear();
    first = null;
    save();
  };
  const arm = (ms: number) => {
    clear();
    timer = t.set(() => {
      timer = null;
      // 选字中：不存，再等一轮（选完字 onChange 会再排一次）
      if (composing()) return arm(delay);
      run();
    }, ms);
  };
  return {
    schedule() {
      const now = t.now();
      if (first === null) first = now;
      arm(Math.max(0, Math.min(delay, first + maxWait - now)));
    },
    flush() {
      if (timer === null && first === null) return;
      run();
    },
    cancel() {
      clear();
      first = null;
    },
    get pending() {
      return timer !== null || first !== null;
    },
  };
}

// —— 输入法选字状态：整页听 compositionstart / compositionend（编辑器和文本框都算） ——
let composingNow = false;
let listening = false;

/** 输入法是不是正在选字。 */
export function imeComposing(): boolean {
  if (!listening && typeof document !== 'undefined') {
    listening = true;
    document.addEventListener('compositionstart', () => (composingNow = true), true);
    document.addEventListener('compositionend', () => (composingNow = false), true);
    // 选字时切走窗口，有的浏览器不发 compositionend
    window.addEventListener('blur', () => (composingNow = false));
  }
  return composingNow;
}

/** 页面藏到后台、关掉（pagehide）时调 fn；返回取消。 */
export function onPageHide(fn: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const vis = () => document.visibilityState === 'hidden' && fn();
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('pagehide', fn);
  return () => {
    document.removeEventListener('visibilitychange', vis);
    window.removeEventListener('pagehide', fn);
  };
}

// 模块一加载就开始听，免得第一次查之前那次 compositionstart 漏掉
if (typeof document !== 'undefined') imeComposing();
