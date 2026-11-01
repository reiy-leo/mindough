/**
 * 任务的日期：胶囊行「日期」和详情顶栏的日期快捷按钮（Rei 2026-10-29「任务和日记 editor 要行为一致」）共用这一份。
 * - dateChipState：设没设、过没过期、读屏念什么（胶囊和按钮都用它）；
 * - TaskDatePicker：日期面板 + 存法（点一天就存并收起；日期段见 DatePanel，方案 A）；
 * - DateQuickButton：顶栏左边只有图标的按钮，设了日期高亮，过期变红，点开就是上面那个面板。
 */
import { useRef, useState, type RefObject } from 'react';
import { Button as RacButton, Dialog, Popover } from 'react-aria-components';
import { CalendarDays } from 'lucide-react';
import { formatTaskDate, formatTaskDateRange, isDateRange, isFinished, isTaskOverdue, taskToday, timeZoneBadge, type DateDisplay, type Store, type Task } from '@mindough/core';
import { Tip } from '../../ui/primitives';
import { useDateDisplay } from '../../lib/date-display';
import { tr } from '../../lib/i18n';
import { DatePanel } from './DatePanel';

export interface DateChipState {
  set: boolean;
  /** 过期了（做完、关掉的不算） */
  danger: boolean;
  /** 日期的文字（带时区小字），没设时为空 */
  text: string;
  /** 按钮的读屏文字：「日期：明天」/「设日期」 */
  aria: string;
}

/** 按任务时区的今天说「明天」、判断过期；时区和设备不同时后面带「UTC−4」（Rei 2026-10-25 任务时区）。 */
export function dateChipState(store: Pick<Store, 'now'>, task: Task, today: string, mode: DateDisplay): DateChipState {
  if (!task.scheduled_date) return { set: false, danger: false, text: '', aria: tr('设日期') };
  const zoneToday = taskToday(task, store.now(), today);
  const s = isDateRange(task)
    ? formatTaskDateRange(task.scheduled_date, task.end_date, { mode, today: zoneToday, timeZone: task.time_zone })
    : formatTaskDate(task.scheduled_date, { mode, today: zoneToday, timeZone: task.time_zone });
  const badge = mode === 'ymd-tz' ? null : timeZoneBadge(task, task.scheduled_date);
  const text = badge ? `${s} ${badge}` : s;
  const danger = isTaskOverdue(task, store.now(), today) && !isFinished(task.status);
  return { set: true, danger, text, aria: tr('{label}：{value}', { label: tr('日期'), value: danger ? tr('{date}，已过期', { date: text }) : text }) };
}

/** 日期面板 + 存法。onDone：选完了（点了一天、拖完、点了快捷项；去掉结束日时不收起）。 */
export function TaskDatePicker({ store, task, today, onDone }: { store: Store; task: Task; today: string; onDone: () => void }) {
  const patch = (p: Partial<Task>) => store.updateTask(task.id, p);
  return (
    <DatePanel
      value={task.scheduled_date}
      today={today}
      timeZone={task.time_zone}
      onTimeZoneChange={(tz) => patch({ time_zone: tz })}
      end={task.end_date}
      onChange={(v) => {
        patch({ scheduled_date: v, end_date: null });
        onDone();
      }}
      onRangeChange={(start, end, done) => {
        patch({ scheduled_date: start, end_date: end });
        if (done) onDone();
      }}
    />
  );
}

/** 详情顶栏左边的日期快捷按钮：只有图标，没字。 */
export function DateQuickButton({ store, task, today }: { store: Store; task: Task; today: string }) {
  const mode = useDateDisplay();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const st = dateChipState(store, task, today, mode);
  return (
    <>
      <Tip content={st.set ? st.text : tr('设日期')}>
        <RacButton
          ref={ref}
          className={`icon-btn date-quick${st.set ? ' is-set' : ''}${st.danger ? ' is-danger' : ''}`}
          aria-label={st.aria}
          aria-haspopup="dialog"
          aria-expanded={open}
          onPress={() => setOpen(true)}
        >
          <CalendarDays size={18} aria-hidden />
        </RacButton>
      </Tip>
      {open && (
        <Popover triggerRef={ref as RefObject<HTMLElement>} isOpen onOpenChange={(o) => !o && setOpen(false)} className="popover popover-panel is-sheet" placement="bottom start" offset={6}>
          <Dialog className="popover-dialog" aria-label={tr('日期')}>
            <TaskDatePicker store={store} task={task} today={today} onDone={() => setOpen(false)} />
          </Dialog>
        </Popover>
      )}
    </>
  );
}
