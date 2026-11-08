/**
 * 详情顶栏的心情按钮（Rei 2026-11-08 23:44「任务详情 顶部工具栏添加一个心情按钮，点击后可以换心情」）。
 * 放在日期按钮右边、剪贴板按钮左边。没心情时是暗淡的 Lucide SmilePlus，有心情时是那张小脸；
 * 点开是共用的 MoodGrid，和属性胶囊里的「心情」是同一份数据（task.mood），选了就换、点已选的那张取消。
 * 只给能有心情的任务（lib/prop-chips canHaveMood：不重复、不是倒数日）；严格模式下锁住的任务灰掉。
 */
import { useRef, useState, type RefObject } from 'react';
import { Button as RacButton, Dialog, Popover } from 'react-aria-components';
import { SmilePlus } from 'lucide-react';
import { moodLabel, type Store, type Task } from '@mindough/core';
import { tr } from '../../lib/i18n';
import { Tip } from '../../ui/primitives';
import { MoodIcon } from '../journal/MoodIcon';
import { MoodGrid } from '../journal/MoodGrid';

export function MoodQuickButton({ store, task, isDisabled = false }: { store: Store; task: Task; isDisabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const mood = task.mood || null;
  const label = mood ? tr('{label}：{value}', { label: tr('心情'), value: moodLabel(mood) }) : tr('设置心情');
  return (
    <>
      <Tip content={label}>
        <RacButton
          ref={ref}
          className={`icon-btn mood-quick${mood ? ' is-set' : ''}`}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          isDisabled={isDisabled}
          onPress={() => setOpen(true)}
        >
          {mood ? <MoodIcon mood={mood} size={20} /> : <SmilePlus size={18} aria-hidden />}
        </RacButton>
      </Tip>
      {open && (
        <Popover triggerRef={ref as RefObject<HTMLElement>} isOpen onOpenChange={(o) => !o && setOpen(false)} className="popover popover-panel is-sheet" placement="bottom start" offset={6}>
          <Dialog className="popover-dialog" aria-label={tr('心情')}>
            <div className="pop-section">
              <MoodGrid
                value={mood}
                onPick={(m) => {
                  store.updateTask(task.id, { mood: m });
                  setOpen(false);
                }}
              />
            </div>
          </Dialog>
        </Popover>
      )}
    </>
  );
}
