/**
 * 图标选择（项目面板、项目 ··· 换图标、资料库、类型页共用）。
 * 2026-11-02 重做（Rei「确保设计符合对应的皮肤，项目弹窗中的这个图标部分也太难看了吧」「优化一下」）：
 * - 紧凑网格：格子 38px 正方、间距 4px，按宽度自动排；图标 20px；整块限高、在里面滚。
 * - 按用途分组带小标题（lib/icons 的 PICKER_GROUPS）；搜索时不分组，直接列结果，搜不到给空状态。
 * - 选中的格子是实心（形状、颜色按皮肤，见 styles/types.css），打开时滚到看得见。
 * - emoji：顶上和搜索框一行的一个同尺寸小格，打进一个 emoji 就生效，没有「用这个」按钮；当前是 emoji 时它显示选中。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Input, SearchField, Button as RacButton } from 'react-aria-components';
import { useImeQuery } from '../lib/ime';
import { Search, SmilePlus } from 'lucide-react';
import { categoryMatches } from '@mindough/core';
import { PICKER_GROUPS, PICKER_ICONS, isEmojiIcon, typeIcon } from '../lib/icons';
import { ICON_KEYWORDS } from '../lib/icon-keywords';
import { tr } from '../lib/i18n';

/** 第一个字形（emoji 可能是好几个码位拼的：肤色、ZWJ 家庭、旗子）。 */
export function firstGrapheme(s: string): string {
  const t = s.trim();
  if (!t) return '';
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) for (const g of new Seg(undefined, { granularity: 'grapheme' }).segment(t)) return g.segment;
  return [...t].slice(0, 2).join('');
}

/** 输入框里打的字 → 要用的 emoji（取最后打进去的那个字形，不是 emoji 就是 null）。 */
export function emojiFromInput(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // 已经有一个再打一个：用新打的（去掉开头那个）
  const first = firstGrapheme(t);
  const rest = t.slice(first.length).trim();
  const pick = rest ? firstGrapheme(rest) : first;
  return isEmojiIcon(pick) ? pick : isEmojiIcon(first) ? first : null;
}

const GROUP_LABEL: Record<string, () => string> = {
  common: () => tr('常用'),
  fun: () => tr('娱乐'),
  work: () => tr('学习工作'),
  travel: () => tr('出行'),
  life: () => tr('生活'),
  health: () => tr('健康'),
  other: () => tr('其它'),
};
const groupLabel = (id: string) => (GROUP_LABEL[id] ?? GROUP_LABEL.other!)();

export function IconPicker({ value, onChange, searchable }: { value: string; onChange: (icon: string) => void; searchable?: boolean }) {
  // 组字时不拿拼音去搜（Rei 2026-11-02，lib/ime.ts）
  const ime = useImeQuery();
  const isEmoji = isEmojiIcon(value);
  const [emoji, setEmoji] = useState(isEmoji ? value : '');
  useEffect(() => setEmoji(isEmojiIcon(value) ? value : ''), [value]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const query = ime.query.trim();
  const found = query ? PICKER_ICONS.filter((n) => categoryMatches([n.replace(/-\d+$/, '').replace(/-/g, ' '), ...(ICON_KEYWORDS[n] ?? '').split(' ')], query)) : [];

  // 打开时把选中的格子滚进可见范围（只滚这一块，不带着外面的弹窗一起滚）
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const cell = box?.querySelector<HTMLElement>('.icon-cell.is-selected');
    if (!box || !cell) return;
    const top = cell.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + cell.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 2 + cell.offsetHeight / 2);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cell = (n: string) => {
    const I = typeIcon(n);
    const on = value === n;
    return (
      <RacButton key={n} className={`icon-cell${on ? ' is-selected' : ''}`} aria-label={n} aria-pressed={on} onPress={() => onChange(n)}>
        <I size={20} />
      </RacButton>
    );
  };

  return (
    <div className="icon-picker">
      <div className="icon-picker-top">
        {searchable && (
          <SearchField aria-label={tr('搜索图标')} value={ime.text} onChange={ime.onChange} className="cat-search icon-search">
            <Search size={14} aria-hidden className="cat-search-icon" />
            <Input className="input" placeholder={tr('搜图标，比如“书”“运动”')} {...ime.handlers} />
          </SearchField>
        )}
        {/* emoji 小格：打进一个 emoji 就用它 */}
        <label className={`icon-cell icon-emoji${isEmoji ? ' is-selected' : ''}${emoji ? ' has-value' : ''}`} title={tr('用一个 emoji')}>
          {!emoji && <SmilePlus size={20} aria-hidden className="icon-emoji-ph" />}
          <input
            className="icon-emoji-input"
            aria-label={tr('用一个 emoji')}
            value={emoji}
            inputMode="text"
            autoComplete="off"
            onChange={(e) => {
              const v = e.currentTarget.value;
              const pick = emojiFromInput(v);
              if (pick) {
                setEmoji(pick);
                if (pick !== value) onChange(pick);
              } else setEmoji(v.trim() ? emoji : '');
            }}
          />
        </label>
        {!searchable && <span className="muted small icon-emoji-hint">{tr('点下面的图标，或者在左边这格打一个 emoji')}</span>}
      </div>
      <div ref={scrollRef} className="icon-scroll">
        {query ? (
          found.length ? (
            <div className="icon-grid" role="group" aria-label={tr('搜索结果')}>
              {found.map(cell)}
            </div>
          ) : (
            <div className="icon-none">
              <Search size={18} aria-hidden />
              <span>{tr('没有对得上的图标')}</span>
              <span className="muted small">{tr('换个词试试，或者在右上角打一个 emoji')}</span>
            </div>
          )
        ) : (
          PICKER_GROUPS.map((g) => (
            <div key={g.id} className="icon-group" role="group" aria-label={groupLabel(g.id)}>
              <div className="icon-group-title">{groupLabel(g.id)}</div>
              <div className="icon-grid">{g.icons.map(cell)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
