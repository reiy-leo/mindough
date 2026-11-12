/**
 * 提示（toast）显示在哪儿（Rei 2026-11-13 06:16「toast通知的位置可以在设置-通知中设置：顶部、底部、右上角、右下角」）。
 * 设置里没有「通知」项，放在设置 → 提醒，叫「通知位置」。
 * - 默认底部居中，和以前一样。
 * - 只记在本机（Settings.toastPosition），不同步：各台设备屏幕大小不一样。
 * - 手机布局屏幕窄，右上角按顶部居中、右下角按底部居中显示。
 */
import type { LayoutKind } from '../skin/platform';

export const TOAST_POSITIONS = ['top', 'bottom', 'top-right', 'bottom-right'] as const;
export type ToastPosition = (typeof TOAST_POSITIONS)[number];
export const TOAST_POSITION_DEFAULT: ToastPosition = 'bottom';

/** 存的值认不出来（老数据、手改）就当底部。 */
export function normalizeToastPosition(v: unknown): ToastPosition {
  return typeof v === 'string' && (TOAST_POSITIONS as readonly string[]).includes(v) ? (v as ToastPosition) : TOAST_POSITION_DEFAULT;
}

/** 实际摆在哪：手机布局没有右侧角落，右上 → 顶部，右下 → 底部。 */
export function effectiveToastPosition(v: unknown, layout: LayoutKind): ToastPosition {
  const p = normalizeToastPosition(v);
  if (layout !== 'mobile') return p;
  return p === 'top-right' ? 'top' : p === 'bottom-right' ? 'bottom' : p;
}
