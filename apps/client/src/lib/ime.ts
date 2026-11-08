/**
 * 输入法（中文、日文组字）和搜索框（Rei 2026-11-02「做完后解锁弹窗中搜索框中，删除字符会跳转，输入中文有问题」）：
 * - 组字的时候框里是拼音（shu），这时不拿它去过滤，等上屏（compositionend）再过滤，列表不会一个字母一跳；
 * - 选词的那次回车（isComposing、WebKit 的 keyCode 229、紧跟 compositionend 的 100ms 内）不当成「提交」「新建」；
 * - 全局快捷键（N 新建、方向键换任务、打字跳到搜索框）在焦点停在输入框里时一律不管——
 *   react-aria 的 Autocomplete 会把输入框里的每个按键再派发一份到列表上，那份的 target 不是输入框，只看 target 判断不出来。
 */
import { useCallback, useEffect, useRef, useState, type CompositionEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { keepEditKeysInInput } from './backspace-guard';

type KeyLike = Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>;

/** 输入法选词的那次回车：正在组字、Safari / WebKit 里 keyCode 229，或者紧跟在 compositionend 后面（WebKit 先发 compositionend 再发回车）。 */
export function imeEnter(event: KeyLike, lastCompositionEnd: number, now = Date.now()): boolean {
  if (event.key !== 'Enter') return false;
  if (event.isComposing || event.keyCode === 229) return true;
  return now - lastCompositionEnd < 100;
}

/** 这个按键是输入法在用（组字中、或 229）。 */
export function imeBusy(event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return !!event.isComposing || event.keyCode === 229;
}

/** 元素是能打字的地方（输入框、文本框、下拉、可编辑区）。 */
export function isTypingElement(el: EventTarget | Element | null | undefined): boolean {
  const t = el as HTMLElement | null | undefined;
  if (!t || typeof t !== 'object' || !('tagName' in t)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || !!t.isContentEditable;
}

/**
 * 全局快捷键该不该让路：事件来自输入框，或者焦点此刻就在输入框里（Autocomplete 转发到列表的那份按键），
 * 或者输入法正在用这个键。
 */
export function typingKey(e: Pick<KeyboardEvent, 'target' | 'isComposing' | 'keyCode'>): boolean {
  if (imeBusy(e)) return true;
  if (isTypingElement(e.target)) return true;
  return typeof document !== 'undefined' && isTypingElement(document.activeElement);
}

/**
 * 搜索框的字：text 是框里显示的（组字时含拼音），query 是拿去过滤的（只在不组字时跟上）。
 * 把 handlers 放在输入框或它外面的容器上（composition 事件会冒泡）；onKeyDownCapture 挡住选词的那次回车，
 * 让它到不了 SearchField 的 onSubmit、Autocomplete 的「回车选中」。
 */
export function useImeQuery(initial = '') {
  const [text, setText] = useState(initial);
  const [query, setQuery] = useState(initial);
  const composing = useRef(false);
  const lastEnd = useRef(0);
  const onChange = useCallback((v: string) => {
    setText(v);
    if (!composing.current) setQuery(v);
  }, []);
  const reset = useCallback((v = '') => {
    composing.current = false;
    setText(v);
    setQuery(v);
  }, []);
  const handlers = {
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e: CompositionEvent<HTMLElement>) => {
      composing.current = false;
      lastEnd.current = Date.now();
      const el = e.target as HTMLInputElement;
      const v = typeof el?.value === 'string' ? el.value : null;
      if (v !== null) {
        setText(v);
        setQuery(v);
      } else setQuery((q) => q);
    },
    onKeyDownCapture: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (imeEnter(e.nativeEvent, lastEnd.current)) e.stopPropagation();
      // 退格、Delete 只给输入框删字，不让 Autocomplete 转发到列表（WebKit 会当成退格返回上一页，见 lib/backspace-guard.ts）
      else keepEditKeysInInput(e);
    },
  };
  /** 给自己写 onKeyDown 的输入框用：这次回车是不是输入法的。 */
  const isImeEnter = (e: KeyLike) => imeEnter(e, lastEnd.current);
  return { text, query, onChange, reset, handlers, isImeEnter, composing };
}

/**
 * 搜索词放在外面（父组件持有 query）的输入框：框里显示自己的 text，组字时不往外报，上屏后再报；
 * 外面把 query 改了（清空、选中后重置）就跟上。用法：<input value={f.value} onChange={f.onChange} {...f.handlers} />。
 */
export function useImeField(query: string, onQueryChange: (q: string) => void) {
  const [text, setText] = useState(query);
  const composing = useRef(false);
  const lastEnd = useRef(0);
  useEffect(() => {
    if (!composing.current) setText(query);
  }, [query]);
  const onChange = (e: { target: { value: string } }) => {
    const v = e.target.value;
    setText(v);
    if (!composing.current) onQueryChange(v);
  };
  const handlers = {
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e: CompositionEvent<HTMLElement>) => {
      composing.current = false;
      lastEnd.current = Date.now();
      const v = (e.target as HTMLInputElement).value;
      if (typeof v === 'string') {
        setText(v);
        onQueryChange(v);
      }
    },
  };
  const isImeEnter = (e: KeyLike) => imeEnter(e, lastEnd.current);
  return { value: text, onChange, handlers, isImeEnter };
}
