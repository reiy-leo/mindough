/**
 * 手机键盘上方的格式栏（Rei 2026-11-21 11:22「先做A」）。按钮做什么、什么时候灰掉见 format-bar.ts；什么时候出现由 MdEditor 管
 * （触屏、编辑器有焦点、软键盘开着，lib/soft-keyboard.ts）。
 *
 * - 贴在键盘上沿，整屏宽，一行图标能横着滑。
 * - 按下不抢焦点（pointerdown / mousedown 都 preventDefault）：键盘不收、光标不丢；按钮也不进 Tab 顺序。
 * - 放在编辑器里面、position: fixed（不放 body：弹层 / 新建面板会把点在外面的当成「点了外面」关掉自己，和 @ 浮层一样）。
 *   外面哪层有 transform 时 fixed 是相对那一层的：先放到 0,0 量出那一层的原点，再减掉。
 * - 三种皮肤各一套样子（styles/editor.css .md-format-bar），亮暗都有；不用 color-mix()。
 */
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import type { Editor } from '@tiptap/core';
import {
  ArrowDown,
  ArrowUp,
  AtSign,
  Bold,
  Code,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Link,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  ListTodo,
  TextQuote,
  Undo2,
} from 'lucide-react';
import { tr, trc } from '../../lib/i18n';
import { FORMAT_BAR_ORDER, formatBarState, runFormat, type FormatBarState, type FormatButtonId, type FormatResult } from './format-bar';

type Icon = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

const ICONS: Record<FormatButtonId, Icon> = {
  task: ListTodo,
  bullet: List,
  ordered: ListOrdered,
  heading: Heading,
  bold: Bold,
  highlight: Highlighter,
  quote: TextQuote,
  code: Code,
  link: Link,
  mention: AtSign,
  indent: ListIndentIncrease,
  outdent: ListIndentDecrease,
  up: ArrowUp,
  down: ArrowDown,
  undo: Undo2,
};
const HEADING_ICONS: Record<number, Icon> = { 1: Heading1, 2: Heading2, 3: Heading3 };

/** 读屏念的名字（每次取：换语言后跟着变）。格式名和「写法和快捷键」浮层共用语境「格式」。 */
export function formatButtonLabel(id: FormatButtonId): string {
  switch (id) {
    case 'task':
      return trc('格式', '清单');
    case 'bullet':
      return trc('格式', '列表');
    case 'ordered':
      return trc('格式', '编号列表');
    case 'heading':
      return trc('格式', '标题');
    case 'bold':
      return trc('格式', '粗体');
    case 'highlight':
      return trc('格式', '高亮');
    case 'quote':
      return trc('格式', '引用');
    case 'code':
      return trc('格式', '行内代码');
    case 'link':
      return trc('格式', '链接');
    case 'mention':
      return trc('格式', '提到任务或日期');
    case 'indent':
      return trc('格式', '缩进');
    case 'outdent':
      return trc('格式', '减少缩进');
    case 'up':
      return trc('格式', '上移');
    case 'down':
      return trc('格式', '下移');
    case 'undo':
      return trc('格式', '撤销');
  }
}

/** 会按下 / 弹起的按钮（读屏念「已按下」）；别的是一次性的动作。 */
const TOGGLES = new Set<FormatButtonId>(['task', 'bullet', 'ordered', 'heading', 'bold', 'highlight', 'quote', 'code', 'link']);

export interface FormatBarProps {
  editor: Editor;
  /** 键盘上沿（布局视口坐标）。 */
  keyboardTop: number;
  /** 能打 @（任务正文、日记）。 */
  mention: boolean;
  /** 输入法正在组字（MdEditor 自己记的，加上 ProseMirror 的）。 */
  composing: () => boolean;
  onResult: (r: FormatResult) => void;
}

export function FormatBar({ editor, keyboardTop, mention, composing, onResult }: FormatBarProps) {
  const el = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<FormatBarState>(() => formatBarState(editor, { mention }));
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  // 光标、内容一变就重算按钮状态
  useEffect(() => {
    const update = () => {
      if (!editor.isDestroyed) setState(formatBarState(editor, { mention }));
    };
    update();
    editor.on('transaction', update);
    editor.on('selectionUpdate', update);
    return () => {
      editor.off('transaction', update);
      editor.off('selectionUpdate', update);
    };
  }, [editor, mention]);

  // 贴在键盘上沿：fixed 的参照可能被外面的 transform 改掉，量出原点再减
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const prevL = node.style.left;
    const prevT = node.style.top;
    node.style.left = '0px';
    node.style.top = '0px';
    const o = node.getBoundingClientRect();
    node.style.left = prevL;
    node.style.top = prevT;
    const next = { left: -o.left, top: keyboardTop - node.offsetHeight - o.top, width: window.innerWidth };
    if (!pos || Math.abs(pos.left - next.left) > 0.5 || Math.abs(pos.top - next.top) > 0.5 || pos.width !== next.width) setPos(next);
  }); // 每次渲染都对一下（键盘、外层动画都会让它变）

  const press = (id: FormatButtonId) => {
    const r = runFormat(editor, id, { mention, composing: composing() });
    if (r.kind !== 'skip') onResult(r);
  };

  return (
    <div
      ref={el}
      className="md-format-bar"
      role="toolbar"
      aria-label={tr('文字格式')}
      aria-orientation="horizontal"
      style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { left: 0, top: 0, visibility: 'hidden' }}
      // 按下不抢焦点：键盘不收、光标不丢（点在按钮之间的空处也一样）
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="md-format-bar-scroll">
        {FORMAT_BAR_ORDER.map((id) => {
          if (id === 'mention' && !mention) return null;
          const s = state.buttons[id];
          const IconC = id === 'heading' && state.heading >= 1 && state.heading <= 3 ? HEADING_ICONS[state.heading]! : ICONS[id];
          const label = formatButtonLabel(id);
          return (
            <button
              key={id}
              type="button"
              tabIndex={-1}
              className={`md-format-btn${s.active ? ' is-active' : ''}`}
              data-format={id}
              aria-label={label}
              title={label}
              aria-pressed={TOGGLES.has(id) ? s.active : undefined}
              disabled={s.disabled}
              onClick={() => press(id)}
            >
              <IconC size={20} strokeWidth={s.active ? 2.4 : 2} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
