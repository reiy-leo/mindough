/**
 * 退格不乱跳（Rei 2026-11-08「弹窗的搜索框，backspace删除时会错误地关闭窗口并乱跳转」）。
 *
 * 根因：WebKit（macOS / iOS 的 App 用的 WKWebView）默认开着「退格 = 返回上一页」：keydown 的 Backspace 落在不能打字的元素上、
 * 又没人 preventDefault，就 history.back()。念头团的路由在 hash 里，返回一下，详情的 `?task=` 没了、或回到上一个页面，
 * 详情里打开的弹窗跟着卸掉——看起来就是「删字时窗口关了、跳到别处」。
 * 搜索框本身能打字，为什么会落到别的元素上：react-aria 的 Autocomplete（挑任务、币种）把输入框里的每个按键再造一份，
 * 派发到列表或列表里高亮的那一项上（useAutocomplete.mjs），这份的 target 是列表，WebKit 就当成「在页面上按了退格」。
 * Chromium（Windows、Android、网页版）早就没有退格返回，所以只在 Mac / iOS 上出现；Playwright 的 Linux WebKit 也不返回，测不出来。
 *
 * 两层：
 * 1. 源头：Autocomplete 的输入框外层挂 `keepEditKeysInInput`（捕获阶段），Backspace / Delete 不再交给 Autocomplete 转发，
 *    只留给输入框自己删字。不能在转发出去的那份上 preventDefault：Autocomplete 看到被拦了，会把原来的按键也拦掉，字就删不掉了。
 * 2. 兜底：`installBackspaceGuard` 在 window 上听 keydown（冒泡阶段，组件自己的处理都跑完了）：
 *    Backspace / Delete 落在不能打字的元素上、焦点也不在能打字的地方、没人处理过，就 preventDefault，WebKit 不再返回。
 *    焦点在输入框、文本框、编辑器里，或者输入法在组字时，一律不碰。
 */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { isEditable } from './no-select';

export const EDIT_KEYS = new Set(['Backspace', 'Delete']);

/** 这次 Backspace / Delete 该不该拦下（不让 WebKit 拿去返回上一页）。 */
export function shouldBlockEditKey(e: Pick<KeyboardEvent, 'key' | 'target' | 'defaultPrevented' | 'isComposing' | 'keyCode'>, active: unknown): boolean {
  if (!EDIT_KEYS.has(e.key) || e.defaultPrevented) return false;
  if (e.isComposing || e.keyCode === 229) return false;
  if (isEditable(e.target)) return false;
  // 焦点在能打字的地方：这多半是 Autocomplete 转发的那份，拦了会让输入框删不了字
  if (isEditable(active)) return false;
  return true;
}

/** 兜底：装在 window 上，返回卸载函数。 */
export function installBackspaceGuard(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const on = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (shouldBlockEditKey(e, typeof document !== 'undefined' ? document.activeElement : null)) e.preventDefault();
  };
  target.addEventListener('keydown', on);
  return () => target.removeEventListener('keydown', on);
}

/**
 * 源头：挂在 Autocomplete 外层的 onKeyDownCapture。输入框里的 Backspace / Delete 到此为止（不再往下交给 Autocomplete 转发），
 * 默认行为照常，字照样删。别的键不管。
 */
export function keepEditKeysInInput(e: ReactKeyboardEvent<HTMLElement>): void {
  if (EDIT_KEYS.has(e.key) && isEditable(e.target)) e.stopPropagation();
}
