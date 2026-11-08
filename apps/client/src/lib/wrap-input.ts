/**
 * 添加任务的输入框折行（Rei 2026-11-08 22:38 澄清「任务输入框支持换行」：一行很长时现在会左右滚动，要多行显示）。
 * 输入框换成 textarea：长文字软折行、跟着内容长高，最多约 6 行，再多在框里滚；不能打出真的换行符。
 * - Enter（不是输入法选词那次）= 提交；Shift+Enter 什么都不做（不换行）。
 * - 粘贴、输入里的换行和以前的单行输入框一样去掉（HTML 规定 input[type=text] 去掉 CR / LF，不补空格）。
 */

/** 去掉换行符，和单行输入框一样（不补空格）。 */
export function stripNewlines(v: string): string {
  return v.replace(/[\r\n]/g, '');
}

/** 最多几行。 */
export const WRAP_MAX_ROWS = 6;

/** 这次按键怎么办：submit 提交，block 吃掉（Shift+Enter 等带修饰的回车），null 不管。ime = 输入法选词那次回车。 */
export function wrapInputKey(e: { key: string; shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }, ime: boolean): 'submit' | 'block' | null {
  if (e.key !== 'Enter' || ime) return null;
  if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return 'block';
  return 'submit';
}

/** 按内容算高度：scrollHeight，但不超过 maxRows 行（行高 + 上下内边距）。返回 [高度, 要不要内部滚]。 */
export function wrapHeight(scrollHeight: number, lineHeight: number, padding: number, maxRows = WRAP_MAX_ROWS): [number, boolean] {
  const max = Math.round(lineHeight * maxRows + padding);
  return scrollHeight > max ? [max, true] : [scrollHeight, false];
}
