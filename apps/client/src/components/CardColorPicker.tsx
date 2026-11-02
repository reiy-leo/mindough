/**
 * 倒数日卡片颜色的选择（Rei 2026-11-02「倒数日的card可以设置不同的颜色背景」）：
 * 一排圆点，第一个是「默认」（卡片原来的样子），后面 11 个预设色，按当前主题显示亮色或暗色那一套。
 * 卡片菜单「颜色…」和任务详情的「颜色」胶囊都用它。点一下就生效。
 */
import type { CSSProperties } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import { Check } from 'lucide-react';
import { CARD_COLORS, cardColorOf, type Store, type Task } from '@mindough/core';
import { useSettings } from '../lib/settings';
import { cardColorLabel, cardColorStyle } from '../lib/card-colors';
import { tr } from '../lib/i18n';

const DEFAULT = 'default';

export function CardColorPicker({ store, task, onDone }: { store: Store; task: Task; onDone?: () => void }) {
  const { theme } = useSettings();
  const value = cardColorOf(task) ?? DEFAULT;
  return (
    <RadioGroup
      aria-label={tr('卡片颜色')}
      className="cd-colors"
      orientation="horizontal"
      value={value}
      onChange={(v) => {
        store.setCardColor(task.id, v === DEFAULT ? null : v);
        onDone?.();
      }}
    >
      {[DEFAULT, ...CARD_COLORS].map((c) => {
        const s = c === DEFAULT ? null : cardColorStyle(c as (typeof CARD_COLORS)[number], theme);
        const label = cardColorLabel(c === DEFAULT ? null : (c as (typeof CARD_COLORS)[number]));
        return (
          <Radio
            key={c}
            value={c}
            aria-label={label}
            className={`cd-color${c === DEFAULT ? ' is-default' : ''}`}
            style={s ? ({ '--cd-swatch': s.bg, '--cd-swatch-fg': s.fg } as CSSProperties) : undefined}
          >
            {({ isSelected }) => (isSelected ? <Check size={14} strokeWidth={3} aria-hidden /> : null)}
          </Radio>
        );
      })}
    </RadioGroup>
  );
}
