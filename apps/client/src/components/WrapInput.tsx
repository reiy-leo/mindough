/**
 * 添加任务的输入框：看着是一行，长了自动折行长高，最多 6 行（Rei 2026-11-08）。规则见 lib/wrap-input.ts。
 * 用在列表顶上的添加框（QuickAddBar）和时间轴每天的添加框。
 */
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { TextArea } from 'react-aria-components';
import { imeEnter } from '../lib/ime';
import { stripNewlines, wrapHeight, wrapInputKey } from '../lib/wrap-input';

export const WrapInput = forwardRef<HTMLTextAreaElement, { value: string; onSubmit: () => void; placeholder?: string; className?: string }>(function WrapInput({ value, onSubmit, placeholder, className = 'add-bar-input' }, fwd) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(fwd, () => ref.current!, []);
  const lastEnd = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const [h, scroll] = wrapHeight(el.scrollHeight, line, pad);
    el.style.height = `${h}px`;
    el.style.overflowY = scroll ? 'auto' : 'hidden';
  }, [value]);
  return (
    <TextArea
      ref={ref}
      rows={1}
      // 手机软键盘的回车键：和以前的单行框一样是「前往 / 提交」，按了就添加
      enterKeyHint="go"
      className={`${className} is-wrap`}
      placeholder={placeholder}
      onCompositionEnd={() => (lastEnd.current = Date.now())}
      onKeyDown={(e) => {
        const act = wrapInputKey(e, imeEnter(e.nativeEvent, lastEnd.current));
        if (!act) return;
        e.preventDefault();
        if (act === 'submit') onSubmit();
      }}
    />
  );
});
export { stripNewlines };
