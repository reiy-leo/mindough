/**
 * 等待安排：还没定哪天做、也没放进今天的事（core backlog.ts）。行上：加入我的一天（太阳）、安排日期、拖动排序。
 * 新建的任务（不是从我的一天新建的）默认都在这里。
 * 分区（Rei 2026-11-16「等待安排页右上角加分区选项：按项目、按心情、按类型」）：不分区（默认，就是原来那张能拖的清单）/ 按项目 / 按心情 / 按类型，
 * 规则和我的一天同一套（lib/sections sectionTasks：没项目、没心情、没类型的各一段放最后，置顶 / 收藏 / 紧急 / 重要不成段，空段不出现），
 * 段标题能收起（SectionedList）。分了区不能拖（同我的一天分区时），行左边照样留把手那一格，圈和标题不挪位置；段里的顺序就是手动拖的顺序。
 * 按钮：电脑在件数那行右边，手机在顶栏右边（左边是抽屉按钮）。分区方式跟着账户同步（同步偏好 list_view.backlog.section），收起状态只在本机（lib/view-prefs）。
 */
import { GridList, GridListItem, useDragAndDrop, Button as RacButton } from 'react-aria-components';
import { CalendarPlus, Inbox, Plus } from 'lucide-react';
import type { Task } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { useUi } from '../lib/ui';
import { Button, PopoverPanel } from '../ui/primitives';
import { RowLead, TaskRow } from '../components/TaskRow';
import { QuickAddBar } from '../components/QuickAddBar';
import { draftKey } from '../lib/list-draft';
import { DatePanel } from '../components/task/DatePanel';
import { titleOf } from '../lib/view';
import { useReorderGuard } from '../lib/drag-guard';
import { useTouchReorder, type ReorderLike } from '../lib/touch-reorder';

import { tr } from '../lib/i18n';
import { clipName } from '../lib/toast-text';
import { useSettings } from '../lib/settings';
import { useListView } from '../lib/view-hooks';
import { BACKLOG_SECTIONS } from '../lib/list-views';
import { categorySectionOrder, sectionTasks, type SectionBy } from '../lib/sections';
import { SectionedList } from '../components/SectionedList';
import { SectionMenu } from '../components/project/ProjectMenus';
import { TopbarActions } from '../lib/topbar-slot';
export function BacklogPage() {
  const store = useStore();
  const ui = useUi();
  const today = store.today();
  const list = store.backlog(today);
  const { layout } = useSettings();
  const [view, setView] = useListView('backlog');
  const section = view.section as SectionBy;
  const sections =
    list.length && section !== 'none'
      ? sectionTasks(list, section, {
          groups: store.activeGroups(),
          ...(section === 'type' ? { categories: categorySectionOrder(store), categoryIdsOf: (t: Task) => store.categoryIdsOfTask(t) } : {}),
        })
      : null;
  const tools = (
    <span className="list-tools">
      <SectionMenu value={section} options={BACKLOG_SECTIONS} onChange={(s) => setView({ section: s })} />
    </span>
  );

  // 行尾「安排日期」：不分区和分区时一样
  const dateButton = (t: Task) => (
    <PopoverPanel
      label={tr('安排日期')}
      className="is-sheet"
      trigger={
        <RacButton className="icon-btn" aria-label={tr('安排日期')}>
          <CalendarPlus size={17} />
        </RacButton>
      }
    >
      {(close) => (
        <DatePanel
          value={t.scheduled_date}
          today={today}
          clearLabel={null}
          timeZone={t.time_zone}
          onTimeZoneChange={(tz) => store.updateTask(t.id, { time_zone: tz })}
          onChange={(d) => {
            store.updateTask(t.id, { scheduled_date: d });
            close();
            if (d) ui.toast({ message: tr('已安排到日历：「{titleOf}」', { titleOf: clipName(titleOf(store, t)) }) });
          }}
        />
      )}
    </PopoverPanel>
  );
  // 分了区：普通清单（不能拖），把手那格留空占位，和我的一天分区时一样
  const plainRows = (tasks: Task[]) => (
    <div className="task-list">
      {tasks.map((t) => (
        <div key={t.id} className={`list-item${ui.editingId === t.id ? ' is-selected' : ''}`}>
          <RowLead pinned={store.isPinned(t)} />
          <TaskRow store={store} task={t} trailing={dateButton(t)} />
        </div>
      ))}
    </div>
  );

  // 拖完不留高亮、不选中被拖的行（lib/drag-guard）
  const reorderGuard = useReorderGuard();
  const onReorder = (e: ReorderLike) => {
    const order = list.map((t) => t.id);
    const moving = [...e.keys].map(String);
    const rest = order.filter((id) => !moving.includes(id));
    const targetIdx = rest.indexOf(String(e.target.key));
    rest.splice(e.target.dropPosition === 'before' ? targetIdx : targetIdx + 1, 0, ...moving);
    store.reorderBacklog(rest);
  };
  const { dragAndDropHooks } = useDragAndDrop({
    ...reorderGuard.handlers,
    getItems: (keys) => [...keys].map((k) => ({ 'text/plain': String(k) })),
    onReorder,
  });
  // 手指拖动不走 React Aria 的原生拖放（lib/touch-reorder）
  useTouchReorder(reorderGuard, { group: 'backlog', onReorder });

  return (
    <div className="page">
      {/* 中间列不放页头（Rei 2026-10-26）：最上面是添加框，加进待安排；件数挪到列表上方的小字。
          原来页头的「新建任务」按钮去掉了，右下角的新建按钮也去掉了（Rei 2026-11-08）：N 照常打开完整的新建面板 */}
      <QuickAddBar placeholder={tr('想到什么先记下，按回车添加到等待安排')} label={tr('添加任务到等待安排')} draftKey={draftKey('backlog')} create={(body) => store.createTask({ body_md: body }).id}
        meta={
          <div className="list-meta">
            <h1 className="sr-only">{tr('等待安排')}</h1>
            <span className="list-meta-text">{list.length ? tr('{length} 件还没定哪天做', { length: list.length }) : tr('都安排好了')}</span>
            {layout !== 'mobile' && tools}
          </div>
        }
      />
      {layout === 'mobile' && <TopbarActions>{tools}</TopbarActions>}
      {sections ? (
        <SectionedList sections={sections} collapsed={view.collapsed} onCollapsedChange={(collapsed) => setView({ collapsed })} idPrefix="backlog" renderList={(tasks) => plainRows(tasks)} />
      ) : list.length ? (
        <GridList ref={reorderGuard.ref} aria-label={tr('等待安排的任务')} className="task-list" dragAndDropHooks={dragAndDropHooks} dependencies={[ui.editingId]} items={list}>
          {(t) => (
            <GridListItem id={t.id} textValue={titleOf(store, t) || tr('任务')} className={`list-item${ui.editingId === t.id ? ' is-selected' : ''}`}>
              {/* 置顶的把手那格换成红色图钉，还是能拖（Rei 2026-11-09） */}
              <RowLead pinned={store.isPinned(t)} dragLabel={tr('拖动排序')} />
              <TaskRow
                store={store}
                task={t}
                trailing={dateButton(t)}
              />
            </GridListItem>
          )}
        </GridList>
      ) : (
        <div className="empty empty-backlog">
          <div className="empty-icon">
            <Inbox size={28} />
          </div>
          <div className="empty-title">{tr('没有等待安排的事')}</div>
          <div className="empty-hint">{tr('想到什么先记下来，有空再决定哪天做。')}</div>
          <Button variant="secondary" onPress={() => ui.openQuickCreate()}>
            <Plus size={15} />
            {tr('记一件事')}</Button>
        </div>
      )}
    </div>
  );
}
