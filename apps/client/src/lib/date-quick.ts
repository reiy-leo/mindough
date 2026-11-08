/**
 * 详情顶栏日期按钮显示什么（Rei 2026-11-08）：
 * - 没日期：calendar；今天（日期段含今天也算）：calendar-check；
 * - 以后：calendar-chevrons-right + 差几天（纯数字，不带 +/-）；以前：calendar-chevrons-left + 差几天。
 * 「今天」按任务时区算（taskToday），和过期判断一致。天数规则在 core dateQuickState。
 */
import { dateQuickState, taskToday, tr, type DateQuickKind, type Store, type Task } from '@mindough/core';

export interface DateQuickView {
  kind: DateQuickKind;
  /** 图标旁的数字；没日期、今天时为 null */
  count: number | null;
  /** 完整含义：「5 天后」「1 天前」「今天」「没有日期」 */
  when: string;
}

export function dateQuickView(store: Pick<Store, 'now'>, task: Pick<Task, 'scheduled_date' | 'end_date' | 'time_zone'>, deviceToday: string): DateQuickView {
  const st = dateQuickState(task, taskToday(task, store.now(), deviceToday));
  switch (st.kind) {
    case 'none':
      return { kind: 'none', count: null, when: tr('没有日期') };
    case 'today':
      return { kind: 'today', count: null, when: tr('今天') };
    case 'future':
      return { kind: 'future', count: st.days, when: tr('{n} 天后', { n: st.days }) };
    case 'past':
      return { kind: 'past', count: st.days, when: tr('{n} 天前', { n: st.days }) };
  }
}

/** 悬停提示：含义在前，后面跟日期文字；两者一样（比如自动显示时的「今天」）就只留一个。 */
export function dateQuickTip(view: DateQuickView, dateText: string): string {
  if (!dateText || dateText.toLocaleLowerCase() === view.when.toLocaleLowerCase()) return view.when;
  return `${view.when} · ${dateText}`;
}
