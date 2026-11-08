/**
 * 心情的 12 格选择（日记输入框和任务的「心情」属性共用，Rei 2026-11-08「日记的心情属性在普通任务属性中也可以添加」）。
 * 点已选的那格 = 取消（onPick(null)）。样式 .jmood-grid / .jmood-opt 在 journal.css。
 */
import { Button as RacButton } from 'react-aria-components';
import { MOOD_IDS, moodLabel, type MoodId } from '@mindough/core';
import { tr } from '../../lib/i18n';
import { MoodIcon } from './MoodIcon';

export function MoodGrid({ value, onPick }: { value: string | null | undefined; onPick: (mood: MoodId | null) => void }) {
  return (
    <div className="jmood-grid" role="group" aria-label={tr('心情')}>
      {MOOD_IDS.map((id) => (
        <RacButton key={id} className={`jmood-opt${value === id ? ' is-selected' : ''}`} aria-pressed={value === id} onPress={() => onPick(value === id ? null : id)}>
          <MoodIcon mood={id} size={30} />
          <span>{moodLabel(id)}</span>
        </RacButton>
      ))}
    </div>
  );
}
