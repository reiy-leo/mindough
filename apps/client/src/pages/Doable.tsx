import { logicalToday, type Task } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { Empty } from '../ui/primitives';
import { TaskRow } from '../components/TaskRow';
import { SectionedList } from '../components/SectionedList';
import { useListView } from '../lib/list-views';
import { backlogSections } from '../lib/sections';

import { tr } from '../lib/i18n';

/**
 * 过期积压（侧栏「今天 → 过期积压」，原名「积压」，路由仍是 doable；原来的「可做」，Rei 2026-11-04「在侧边栏的“可做”更换成“积压”，
 * 显示所有没完成的任务，过期的倒序显示」「积压的是有日期的」「待安排的是没日期的」）：
 * 只放已经过期的任务（Rei 2026-11-11 02:40「过期积压页里不能有未到期的任务，只列已过期的」）：定了日期、还没做完（待办 / 进行中）、
 * 结束日（日期段看结束日）早于今天的，不算打卡、倒数日、重复任务（core overdueBacklogTasks / Store.overdueBacklog）。
 * 今天和以后到期的、日期段还没过完的都不放（原来最后一段「还没到期」去掉了）；没日期的在「等待安排」里。
 * 按过期天数分 5 段（Rei 2026-11-10「按照这个来：昨天，过去7天，过去一个月，过去一年，更远」，最后一段改叫「超过一年」）：
 * 昨天 1 / 过去 7 天 2–7 / 过去一个月 8–30 / 过去一年 31–365 / 超过一年 ≥366（lib/sections backlogSections），段内最近过期在上。
 * 只有这一种模式（Rei 2026-11-10「过期积压不显示分区按钮，只有按日期分区这一种模式」）：右上角没有分区按钮，也没有「不分区」。
 * 段标题点一下收起 / 展开（SectionedList，和我的一天、项目页分区一样），收起了哪几段记在本机 settings.listViews.doable.collapsed。
 * 页名 Rei 2026-11-10 改成「过期积压」（原「积压」），路由不变。
 * 顶上没有件数小字（Rei 2026-11-12 10:20 去掉「N 件已过期」），也就没有固定在顶上的那一块。
 */
export function DoablePage() {
  const store = useStore();
  const now = store.now();
  const today = logicalToday(now);
  // 归档了的项目里的任务不算（Rei 2026-11-05）；最近过期在上
  const overdue = store.overdueBacklog(now, today);
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
      {/* 没有添加框（Rei 2026-11-12 02:03：过期积压不应有新的 / 未来的任务，电脑和手机都去掉）；新建走 N（新建面板，建好进等待安排）或别的页。
          也不放页头（2026-10-26 起中间列不放、2026-11-12 01:56 手机也不放），顶上也不写「N 件已过期」（Rei 2026-11-12 10:20「顶部不显示"125件已过期"这种统计信息」，
          电脑和手机都去掉）：只留读屏 h1，最上面直接是第一段（昨天 / 过去 7 天…）。 */}
      <h1 className="sr-only">{tr('过期积压')}</h1>
      {overdue.length === 0 && <Empty title={tr('没有过期的任务')} />}
      <SectionedList
        sections={backlogSections(overdue, now, today)}
        collapsed={view.collapsed}
        onCollapsedChange={(collapsed) => setView({ collapsed })}
        idPrefix="doable"
        renderList={(list) => rows(list)}
      />
    </div>
  );
}
