/**
 * 全局搜索的快捷键（Rei 2026-11-05「全局⌘K和编辑器的⌘K冲突，全局用⌘F」）：
 * - Mac / iPad 外接键盘按 ⌘F，Windows / Linux 按 Ctrl+F，打开全局搜索（⌘K 面板 CommandPalette）。
 *   网页版会挡掉浏览器自带的「查找」，这是有意的。
 * - 焦点在编辑器、输入框里也开：编辑器没有自己的查找。输入法组字时不开。
 * - ⌘K / Ctrl+K 不再开搜索，只留给编辑器加链接（extensions.ts）。
 * - 类型页自己的 ⌘F（跳到类型搜索框）先拦下来、调 preventDefault，这里看到 defaultPrevented 就不开。
 */
import { imeBusy } from './ime';
import { isAppleKeyboard } from '../components/editor/shortcuts';

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'keyCode'> & { defaultPrevented?: boolean };

/** 主键是不是 F：按物理键认（别的键盘布局、⌥ 改了字也认），没有 code 时看 key。 */
const isF = (e: KeyLike) => (e.code ? e.code === 'KeyF' : e.key.toLowerCase() === 'f');

/** 这一下是不是开全局搜索：Mac ⌘F，别的系统 Ctrl+F；不带 ⌥ ⇧，不在组字，没被页面自己的 ⌘F 拦下。 */
export function isSearchShortcut(e: KeyLike, mac: boolean = isAppleKeyboard()): boolean {
  if (e.defaultPrevented || imeBusy(e)) return false;
  if (e.altKey || e.shiftKey) return false;
  if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return false;
  return isF(e);
}

/** 搜索框和提示里显示的快捷键：Mac「⌘F」，别的「Ctrl F」（侧栏的小键帽）。 */
export const searchKeyLabel = (mac: boolean = isAppleKeyboard()) => (mac ? '⌘F' : 'Ctrl F');
