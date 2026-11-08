import { compareDateKey, isFinished, isTaskOverdue, toDateKey, type Task } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { Empty, Section } from '../ui/primitives';
import { TaskRow } from '../components/TaskRow';
import { QuickAddBar } from '../components/QuickAddBar';
import { SectionMenu } from '../components/project/ProjectMenus';
import { DATE_SECTIONS, useListView, type DateSection } from '../lib/list-views';

import { tr } from '../lib/i18n';

/**
 * 积压（侧栏「今天 → 积压」，路由仍是 doable；原来的「可做」，Rei 2026-11-04「在侧边栏的“可做”更换成“积压”，
 * 显示所有没完成的任务，过期的倒序显示」「积压的是有日期的」「待安排的是没日期的」）：
 * 所有定了日期、还没做完的任务（待办 / 进行中），不算打卡、倒数日、重复任务。
 * - 「已过期」：日期（日期段看结束日）早于今天的，最近过期的在最上面，越早越往下。
 * - 「接下来」：今天和以后的，按日期从近到远。
 * 没日期的在「待安排」里，这里不放。
 * 右上角分区（Rei 2026-11-08「所有列表支持不分区」）：按日期（默认，上面两段）/ 不分区（一张清单，顺序不变：过期的在前）。
 */
export function DoablePage() {
  const store = useStore();
  const now = store.now();
  const today = toDateKey(now);
  const last = (t: Task) => (t.end_date && t.scheduled_date && t.end_date > t.scheduled_date ? t.end_date : t.scheduled_date!);
  // 归档了的项目里的任务不算（Rei 2026-11-05）
  const open = store.activeTasks().filter((t) => t.scheduled_date && !isFinished(t.status) && !t.recurrence && t.completion_mode !== 'countdown');
  const overdue = open.filter((t) => isTaskOverdue(t, now, today)).sort((a, b) => compareDateKey(last(b), last(a)));
  const upcoming = open.filter((t) => !isTaskOverdue(t, now, today)).sort((a, b) => compareDateKey(a.scheduled_date!, b.scheduled_date!));
  const [view, setView] = useListView('doable');
  const section = view.section as DateSection;
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
        placeholder={tr('现在想做什么？按回车添加到待安排')}
        label={tr('添加任务到待安排')}
        create={(body) => store.createTask({ body_md: body }).id}
        meta={
          <div className="list-meta">
            <h1 className="sr-only">{tr('积压')}</h1>
            <span className="list-meta-text">
              {overdue.length ? tr('{n} 件定了日期还没做完，{m} 件已过期', { n: open.length, m: overdue.length }) : tr('{n} 件定了日期还没做完', { n: open.length })}
            </span>
            <span className="list-tools">
              <SectionMenu value={section} options={DATE_SECTIONS} plain="date" onChange={(v) => setView({ section: v })} />
            </span>
          </div>
        }
      />
      {open.length === 0 && <Empty title={tr('定了日期的都做完了')} />}
      {section === 'none' ? (
        open.length > 0 && rows([...overdue, ...upcoming])
      ) : (
        <>
          {overdue.length > 0 && <Section title={tr('已过期')}>{rows(overdue)}</Section>}
          {upcoming.length > 0 && <Section title={tr('接下来')}>{rows(upcoming)}</Section>}
        </>
      )}
    </div>
  );
}
