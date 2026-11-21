/**
 * 软键盘开着没有、键盘上沿在哪（手机编辑器的格式栏用，Rei 2026-11-21 方案 A）。
 *
 * 浏览器没有「键盘开了」的事件，只能看窗口：
 * - iOS（Safari、WKWebView）、新的安卓 WebView（M139 起）：键盘弹起时 visualViewport 变矮，布局视口不变。
 * - 安卓 adjustResize 那种：整个窗口变矮（innerHeight 也变矮），visualViewport 跟着。
 *   所以不能拿 innerHeight 比，要拿「这个宽度下见过的最高的窗口」（fullHeight）比。转屏换了宽度，重新记。
 * - 安卓 App 是 edge-to-edge（targetSdk ≥ 35），adjustResize 不起作用，老 WebView（M139 以前）里 visualViewport 也看不到键盘：
 *   原生那边（scripts/android-webview.sh）把键盘高度（CSS px）写到 window.__mindoughIme，再发 `mindough-ime` 事件，这里一起算。
 *   要下次发版才有；没有时退回只看 visualViewport。
 * - 双指放大也会让 visualViewport 变小：乘上 scale 再比。
 * 被挡住的高度超过 KB_MIN 才算键盘开着（地址栏收起、底部工具条只有几十 px）。
 */

/** 被挡住多少 px 才算键盘（手机键盘最矮也有 200 多 px；iPad 浮动键盘不挡底部，不算）。 */
export const KB_MIN = 120;

export interface ViewportSample {
  innerHeight: number;
  /** 这个宽度下见过的最高窗口（没键盘时的高度）。 */
  fullHeight: number;
  vvHeight: number;
  vvOffsetTop: number;
  vvScale: number;
  /** 原生报上来的键盘高度（CSS px），没有是 0。 */
  ime: number;
}

export interface KeyboardState {
  open: boolean;
  /** 键盘上沿（布局视口坐标，position: fixed 的 top 用它减去栏高）。 */
  top: number;
}

/** 从一次采样算键盘状态（纯函数，测试用它）。 */
export function keyboardOf(s: ViewportSample): KeyboardState {
  const scale = s.vvScale > 0 ? s.vvScale : 1;
  const vvBottom = s.vvOffsetTop + s.vvHeight;
  const imeTop = s.ime > 0 ? s.innerHeight - s.ime : Infinity;
  const top = Math.round(Math.min(s.innerHeight, vvBottom, imeTop));
  const covered = Math.max(s.fullHeight - s.vvHeight * scale, s.ime);
  return { open: covered >= KB_MIN, top };
}

declare global {
  interface Window {
    /** 安卓原生报上来的键盘高度（CSS px），见 scripts/android-webview.sh。 */
    __mindoughIme?: number;
  }
}

/** 每个宽度见过的最高窗口。 */
const tallest = new Map<number, number>();

/** 记一次窗口高度。 */
export function noteViewport(win: Window = window): number {
  const w = Math.round(win.innerWidth);
  const vv = win.visualViewport;
  const h = Math.max(win.innerHeight, vv ? vv.height * (vv.scale || 1) : 0);
  const prev = tallest.get(w) ?? 0;
  if (h > prev) tallest.set(w, h);
  return Math.max(prev, h);
}

/** 现在的采样。 */
export function sampleViewport(win: Window = window): ViewportSample {
  const fullHeight = noteViewport(win);
  const vv = win.visualViewport;
  const ime = Number(win.__mindoughIme) > 0 ? Number(win.__mindoughIme) : 0;
  return {
    innerHeight: win.innerHeight,
    fullHeight,
    vvHeight: vv ? vv.height : win.innerHeight,
    vvOffsetTop: vv ? vv.offsetTop : 0,
    vvScale: vv ? vv.scale || 1 : 1,
    ime,
  };
}

/** 测试用：清掉记下的高度。 */
export function resetViewportMemory() {
  tallest.clear();
}

let installed = false;
/** 开始记窗口高度（main.tsx 一启动就调，键盘弹起前就有没键盘时的高度；watchKeyboard 也会补调）。 */
export function installViewportMemory(win: Window = window) {
  if (installed) return;
  installed = true;
  noteViewport(win);
  win.addEventListener('resize', () => noteViewport(win), { passive: true });
  win.visualViewport?.addEventListener('resize', () => noteViewport(win), { passive: true });
  win.addEventListener('orientationchange', () => win.setTimeout(() => noteViewport(win), 300), { passive: true });
}

/** 盯着键盘：变了就回调（合到一帧里）。返回取消函数。 */
export function watchKeyboard(cb: (k: KeyboardState) => void, win: Window = window): () => void {
  installViewportMemory(win);
  let raf = 0;
  let last = '';
  const fire = () => {
    raf = 0;
    const k = keyboardOf(sampleViewport(win));
    const key = `${k.open}:${k.top}`;
    if (key === last) return;
    last = key;
    cb(k);
  };
  const schedule = () => {
    if (!raf) raf = win.requestAnimationFrame(fire);
  };
  const vv = win.visualViewport;
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  win.addEventListener('resize', schedule);
  win.addEventListener('mindough-ime', schedule);
  fire();
  // 键盘动画期间 iOS 有时只在最后发一次 resize：开头几百毫秒再看两眼
  const t1 = win.setTimeout(schedule, 150);
  const t2 = win.setTimeout(schedule, 450);
  return () => {
    if (raf) win.cancelAnimationFrame(raf);
    win.clearTimeout(t1);
    win.clearTimeout(t2);
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('mindough-ime', schedule);
  };
}
