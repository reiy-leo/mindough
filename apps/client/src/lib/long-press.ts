/**
 * 手指长按出菜单的共用判断（Rei 2026-11-05「安卓：滑动任务列表会触发右键菜单」）。
 *
 * 毛病：Android（Chrome / WebView）手指按住稍微一停再滑，系统也会发 contextmenu；以前收到就开菜单，滑列表时就弹出来了。
 * 现在的规矩：
 * - 手指发出的 contextmenu 一律不开菜单（拦掉系统那一层），手指长按只认自己计时；
 * - 计时期间手指挪动超过 10px、页面任何地方滚动了、pointercancel（浏览器接手去滚了）都作废；
 * - 到点时再看一眼：按下以后滚动过，或者刚滚完不到 300ms，也不开。
 * 鼠标右键、键盘菜单键照常。
 */

/** 手指挪动超过这么多就不算长按。 */
export const LONG_PRESS_SLOP_PX = 10;
/** 刚滚完多久以内不认长按。 */
export const SCROLL_QUIET_MS = 300;
/** 手指抬起后多久以内来的 contextmenu 还算手指发的。 */
const TOUCH_TAIL_MS = 800;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

let lastScrollAt = -Infinity;
let touchDown = 0;
let lastTouchEndAt = -Infinity;
let installedOn: EventTarget | null = null;

/** 记一次滚动（测试也用）。 */
export function noteScroll(at = now()): void {
  lastScrollAt = at;
}

/** 从 at 以后滚动过没有。 */
export function scrolledSince(at: number): boolean {
  return lastScrollAt >= at;
}

/** 刚滚完（SCROLL_QUIET_MS 以内）。 */
export function recentlyScrolled(at = now()): boolean {
  return at - lastScrollAt < SCROLL_QUIET_MS;
}

/** 挪得够远，不算长按了。 */
export function movedTooFar(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) > LONG_PRESS_SLOP_PX;
}

/** 在 document 上装滚动和手指的监听（捕获阶段：任何一层滚动都收得到）。只装一次。 */
export function installLongPressGuard(target: EventTarget | null = typeof document !== 'undefined' ? document : null): void {
  if (!target || installedOn === target) return;
  installedOn = target;
  const opts = { capture: true, passive: true } as AddEventListenerOptions;
  target.addEventListener('scroll', () => noteScroll(), opts);
  target.addEventListener('touchstart', () => {
    touchDown++;
  }, opts);
  const end = () => {
    touchDown = Math.max(0, touchDown - 1);
    lastTouchEndAt = now();
  };
  target.addEventListener('touchend', end, opts);
  target.addEventListener('touchcancel', end, opts);
}

/** 测试用：清掉记下的状态。 */
export function resetLongPressGuard(): void {
  lastScrollAt = -Infinity;
  touchDown = 0;
  lastTouchEndAt = -Infinity;
}

/** 这次 contextmenu 是不是手指发的（Android 长按 / 滑动时系统发的那种）。lastPointerType 是这块最后一次按下的 pointerType。 */
export function isTouchContextMenu(e: { nativeEvent?: unknown } | Event, lastPointerType?: string | null): boolean {
  const native = ((e as { nativeEvent?: unknown }).nativeEvent ?? e) as { pointerType?: string; sourceCapabilities?: { firesTouchEvents?: boolean } };
  if (native.pointerType === 'touch') return true;
  if (native.pointerType === 'mouse' || native.pointerType === 'pen') return false;
  if (native.sourceCapabilities?.firesTouchEvents) return true;
  if (lastPointerType === 'mouse' || lastPointerType === 'pen') return false;
  if (touchDown > 0 || now() - lastTouchEndAt < TOUCH_TAIL_MS) return true;
  return lastPointerType === 'touch';
}

/** 计时器到点时问：现在开菜单行不行（按下以后滚过、或刚滚完，就不行）。 */
export function longPressStillValid(pressedAt: number, at = now()): boolean {
  return !scrolledSince(pressedAt) && !recentlyScrolled(at);
}

export { now as longPressNow };
