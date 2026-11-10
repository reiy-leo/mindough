import { compareDateKey, isFinished, isTaskOverdue, taskEndDate, toDateKey, type Task } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { Empty } from '../ui/primitives';
import { TaskRow } from '../components/TaskRow';
import { QuickAddBar } from '../components/QuickAddBar';
import { SectionedList } from '../components/SectionedList';
import { useListView } from '../lib/list-views';
import { backlogSections } from '../lib/sections';

import { tr } from '../lib/i18n';

/**
 * 过期积压（侧栏「今天 → 过期积压」，原名「积压」，路由仍是 doable；原来的「可做」，Rei 2026-11-04「在侧边栏的“可做”更换成“积压”，
 * 显示所有没完成的任务，过期的倒序显示」「积压的是有日期的」「待安排的是没日期的」）：
 * 所有定了日期、还没做完的任务（待办 / 进行中），不算打卡、倒数日、重复任务。
 * - 「已过期」：日期（日期段看结束日）早于今天的，最近过期的在最上面，越早越往下。
 * - 「还没到期」（原叫「接下来」）：今天和以后的、日期段还没过完的，按到期日（日期段看结束日）从近到远。
 * 没日期的在「待安排」里，这里不放。
 * 按日期分段（Rei 2026-11-10「按照这个来：昨天，过去7天，过去一个月，过去一年，更远」，19:1x 最后一段改叫「超过一年」）：
 * 过期的分成 5 段（lib/sections backlogSections，按过期天数 1 / 2–7 / 8–30 / 31–365 / 更早），段内照旧最近过期在上；没到期的在最后一段。
 * 只有这一种模式（Rei 2026-11-10「过期积压不显示分区按钮，只有按日期分区这一种模式」）：右上角没有分区按钮，也没有「不分区」。
 * 段标题点一下收起 / 展开（SectionedList，和我的一天、项目页分区一样），收起了哪几段记在本机 settings.listViews.doable.collapsed。
 * 页名 Rei 2026-11-10 改成「过期积压」（原「积压」），路由不变。
 */
export function DoablePage() {
  const store = useStore();
  const now = store.now();
  const today = toDateKey(now);
  const last = (t: Task) => (t.end_date && t.scheduled_date && t.end_date > t.scheduled_date ? t.end_date : t.scheduled_date!);
  // 归档了的项目里的任务不算（Rei 2026-11-05）
  const open = store.activeTasks().filter((t) => t.scheduled_date && !isFinished(t.status) && !t.recurrence && t.completion_mode !== 'countdown');
  const overdue = open.filter((t) => isTaskOverdue(t, now, today)).sort((a, b) => compareDateKey(last(b), last(a)));
  // 按到期日排（日期段看结束日）：开始日很早、还没过完的日期段不会排到最前（原来按开始日）
  const upcoming = open.filter((t) => !isTaskOverdue(t, now, today)).sort((a, b) => compareDateKey(taskEndDate(a)!, taskEndDate(b)!) || compareDateKey(a.scheduled_date!, b.scheduled_date!));
  const [view, setView] = useListView('doable');
  const rows = (list: Task[]) => (
    <div className="task-list plain">
      {list.map((t) => (
        <TaskRow key={t.id} store={store} task={t} showDate />
      ))}
    </div>
  );
  return (
    <div className="page">
      {/* 中间列不放页头（Rei 2026-10-26）：最上面是添加框，新建的进待安排（没日期） */}
      <QuickAddBar
        placeholder={tr('现在想做什么？按回车添加到等待安排')}
        label={tr('添加任务到等待安排')}
        create={(body) => store.createTask({ body_md: body }).id}
        meta={
          <div className="list-meta">
            <h1 className="sr-only">{tr('过期积压')}</h1>
            <span className="list-meta-text">
              {overdue.length ? tr('{n} 件定了日期还没做完，{m} 件已过期', { n: open.length, m: overdue.length }) : tr('{n} 件定了日期还没做完', { n: open.length })}
            </span>
          </div>
        }
      />
      {open.length === 0 && <Empty title={tr('定了日期的都做完了')} />}
      <SectionedList
        sections={backlogSections(overdue, upcoming, now, today)}
        collapsed={view.collapsed}
        onCollapsedChange={(collapsed) => setView({ collapsed })}
        idPrefix="doable"
        renderList={(list) => rows(list)}
      />
    </div>
  );
}
