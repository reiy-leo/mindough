import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Form, TextField } from 'react-aria-components';
import { WrapInput, stripNewlines } from './WrapInput';
import { Plus } from 'lucide-react';
import { useUiStable } from '../lib/ui';
import { useSettings } from '../lib/settings';
import { afterQuickAdd, quickAdd } from '../lib/quick-add';

/**
 * 列表页最上面的快速添加框（Rei 2026-10-26「我的一天、待安排、可做的中间列的header去掉，换成输入框」）。
 * 回车建任务，马上打开它（「从这里添加任务后立即打开任务」）；焦点、滚动见 lib/quick-add。
 * create 负责建任务并放到对的地方（今天 / 待安排），返回新任务的 id。
 * trailing：输入框行尾的小图标按钮。
 * meta：框下面那行小字（日期、件数），和框一起固定。
 * head：框上面的一行（我的一天的大号日期 + 排序 / 分区按钮，Rei 2026-11-09 03:48），也和框一起固定。
 * 添加框固定在列表顶上，不跟着列表滚（Rei 2026-11-02「所有的任务输入框都不随列表滚动」）：外面一层 sticky、不透明底；
 * 滚动后（顶上的哨兵看不见了）加 is-stuck，底下多一条细分隔线。
 */
/**
 * 固定在顶上的那一层滚动了没有：把 sentinel 放在 sticky 层前面（1px 高），它滚出可见区域就是 stuck。
 * 日记的输入框也用它（Rei 2026-11-02「日记中的输入框也不滚动」）。
 */
export function useStuck() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStuck(!!e && !e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { sentinel, stuck };
}

export function QuickAddBar({ placeholder, label, create, trailing, meta, head }: { placeholder: string; label: string; create: (text: string) => string; trailing?: ReactNode; meta?: ReactNode; head?: ReactNode }) {
  const ui = useUiStable();
  const { layout } = useSettings();
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const { sentinel, stuck } = useStuck();
  const add = () => {
    const id = quickAdd({ create, openEditor: ui.openEditor }, draft);
    if (!id) return;
    setDraft('');
    afterQuickAdd(id, input.current, layout);
  };
  return (
    <>
      <div ref={sentinel} className="add-bar-sentinel" aria-hidden />
      <div className={`add-bar-sticky${stuck ? ' is-stuck' : ''}`}>
        {head}
        <Form
          className="add-bar"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Plus size={18} className="add-bar-icon" aria-hidden />
          {/* 长了折行长高，不左右滚（Rei 2026-11-08）；回车照旧添加，不能换行 */}
          <TextField aria-label={label} value={draft} onChange={(v) => setDraft(stripNewlines(v))} className="add-bar-field">
            <WrapInput ref={input} value={draft} placeholder={placeholder} onSubmit={add} />
          </TextField>
          {trailing}
        </Form>
        {meta}
      </div>
    </>
  );
}
