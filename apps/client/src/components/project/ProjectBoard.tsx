/**
 * 项目页「看板」视图（Rei 2026-10-26「每个项目的视图支持列表、看板、时间轴」）：
 * 按任务状态分四列（待办 / 进行中 / 完成 / 关闭），列内按当前排序。
 * 卡片拖到别的列就改成那一列的状态（结束态照常弹解锁提示、能撤销）；键盘：聚焦卡片左边的拖动把手按回车，方向键选列，回车放下（React Aria 拖放）。
 * 宽度不够时整个看板横向滚动。
 * 点卡片任何地方都打开详情（Rei 2026-11-08「项目 看板 不显示详情第三列，点击不显示详情」）：
 * 以前只有卡片里的标题按钮（TaskRow 的 .row-main，列窄时只占卡片一小半）会开，点到卡片的留白、勾选框和太阳旁边的空隙没反应。
 * 现在 GridList 的 onAction 接住卡片本身的点按 / 回车；勾选、太阳、拖动把手这些按钮自己处理，不会冒上来；拖动的尾巴（lib/drag-guard）、长按弹出行菜单后松手不算。
 * 打开的详情不在右列：桌面布局下看板视图不放右列，看板占满，详情是浮层（Rei 2026-11-09 00:28「切换到看板视图后，不要显示侧边的详情column」，
 * App 里 lib/detail-pane detailInModal 决定，浮层在 components/task/DetailModal.tsx）。这里照旧只调 ui.openEditor。
 */
import { memo, useEffect, useState } from 'react';
import { ButtonContext, CheckboxContext, GridList, GridListItem, Provider, useDragAndDrop, type DropItem } from 'react-aria-components';
import { TASK_STATUS_LABEL, type Store, type Task, type TaskStatus } from '@mindough/core';
import { useIsEditing, useUiStable } from '../../lib/ui';
import { changeStatus } from '../../lib/actions';
import { boardColumns } from '../../lib/project-view';
import { isDragPress, useReorderGuard } from '../../lib/drag-guard';
import { useTouchReorder } from '../../lib/touch-reorder';
import { titleOf } from '../../lib/view';
import { RowLead, TaskRow } from '../TaskRow';

import { tr } from '../../lib/i18n';

const DRAG_TYPE = 'application/x-mindough-task';

async function idsOf(items: readonly DropItem[]): Promise<string[]> {
  const out: string[] = [];
  for (const it of items) if (it.kind === 'text' && it.types.has(DRAG_TYPE)) out.push(await it.getText(DRAG_TYPE));
  return out;
}

/**
 * 一张卡片（2026-11-12 看板卡顿）：选中的样子只看自己这件（useIsEditing），点开 / 关掉详情时只有这一两张卡片重渲染。
 * 以前 GridList 的 dependencies 里有 ui.editingId、每行又订阅整个 UI 状态，点一张卡片，四列几百张卡片全部重渲染。
 * version 只用来让 memo 在数据变了时放行（行里读的依赖、打卡进度、类型这些不在 task 对象上）。
 */
const BoardCard = memo(function BoardCard({ store, task: t }: { store: Store; task: Task; version: number }) {
  const selected = useIsEditing(t.id);
  return (
    <GridListItem id={t.id} textValue={titleOf(store, t) || tr('任务')} className={`board-card${selected ? ' is-selected' : ''}`}>
      {/* 置顶的把手那格换成红色图钉，还是能拖到别的状态（Rei 2026-11-09） */}
      <RowLead pinned={store.isPinned(t)} dragLabel={tr('拖到别的状态')} />
      {/* 行里的勾选框、按钮不吃 GridListItem 给的按钮 / 勾选框槽位（默认槽本来就是空的）：
          GridListItem 每次重渲染（点一下卡片、焦点回来、悬停）都给新的槽位对象，不隔开的话一列几十行的按钮全部跟着重渲染 */}
      <Provider
        values={[
          [ButtonContext, NO_SLOTS],
          [CheckboxContext, NO_SLOTS],
        ]}
      >
        <TaskRow store={store} task={t} showGroup={false} showDate showMilestone />
      </Provider>
    </GridListItem>
  );
});
/** 不变的空槽位：值不变，里面的按钮、勾选框就不会因为 GridListItem 重渲染而重渲染。 */
const NO_SLOTS = {};

/**
 * 一列先放够一屏的卡片，其余等看板画出来以后补齐（2026-11-12 看板卡顿）：240 件的项目切到看板，一次挂四列几百张卡片
 * （每张都带拖放、勾选、按钮）要卡半秒多；先出每列前 BOARD_FIRST 张，看板马上出来，下一帧起每列各用一个任务把剩下的一次补齐
 * （列和列错开 BOARD_GAP 毫秒，不挤成一次长卡顿）。补齐以后和以前一样，滚动时不再有额外的活。列头的数字一直是全部件数。
 * 试过「滚到列底附近再补」：每补一批都要重建这一列的集合，深滚时一卡几百毫秒，比一次补齐差，没用。
 */
const BOARD_FIRST = 20;
const BOARD_GAP = 40;
function useColumnLimit(total: number, order: number) {
  const [full, setFull] = useState(false);
  const more = !full && total > BOARD_FIRST;
  useEffect(() => {
    if (!more) return;
    let t = 0;
    const raf = requestAnimationFrame(() => {
      t = window.setTimeout(() => setFull(true), order * BOARD_GAP);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [more, order]);
  return more ? BOARD_FIRST : total;
}

function Column({ store, status, tasks, order }: { store: Store; status: TaskStatus; tasks: Task[]; order: number }) {
  const ui = useUiStable();
  const limit = useColumnLimit(tasks.length, order);
  const guard = useReorderGuard();
  const moveHere = async (items: readonly DropItem[]) => {
    for (const id of await idsOf(items)) changeStatus(store, ui, id, status);
  };
  const { dragAndDropHooks } = useDragAndDrop({
    ...guard.handlers,
    getItems: (keys) =>
      [...keys].map((k) => {
        const t = store.get('task', String(k));
        return { [DRAG_TYPE]: String(k), 'text/plain': t ? titleOf(store, t) : String(k) };
      }),
    acceptedDragTypes: [DRAG_TYPE],
    getDropOperation: () => 'move',
    onRootDrop: (e) => void moveHere(e.items),
    onInsert: (e) => void moveHere(e.items),
    onItemDrop: (e) => void moveHere(e.items),
  });
  // 手指拖动不走 React Aria 的原生拖放（lib/touch-reorder）：各列同组，拖到别的列改状态；列内不排
  useTouchReorder(guard, {
    group: 'board',
    onReceive: (ids) => {
      for (const id of ids) changeStatus(store, ui, id, status);
    },
  });
  const label = TASK_STATUS_LABEL[status];
  return (
    <section data-touch-reorder-zone className={`board-col is-${status === '待办' ? 'todo' : status === '进行中' ? 'doing' : status === '完成' ? 'done' : 'closed'}`} aria-label={label}>
      <header className="board-col-head">
        <span className="board-col-dot" aria-hidden />
        <span className="board-col-title">{label}</span>
        <span className="board-col-count">{tasks.length}</span>
      </header>
      <GridList
        ref={guard.ref}
        aria-label={tr('{status}的任务', { status: label })}
        className="board-list"
        dragAndDropHooks={dragAndDropHooks}
        dependencies={[store.version]}
        items={limit < tasks.length ? tasks.slice(0, limit) : tasks}
        onAction={(key) => {
          // 拖动的尾巴、手指长按刚弹出行菜单（松手那下）都不算点开
          if (isDragPress() || document.querySelector('[role="menu"]')) return;
          ui.openEditor(String(key));
        }}
        renderEmptyState={() => <div className="board-empty">{tr('拖到这里')}</div>}
      >
        {(t) => <BoardCard store={store} task={t} version={store.version} />}
      </GridList>
    </section>
  );
}

export function ProjectBoard({ store, tasks }: { store: Store; tasks: Task[] }) {
  return (
    <div className="board" role="group" aria-label={tr('看板')}>
      {boardColumns(tasks).map((c, i) => (
        <Column key={c.status} store={store} status={c.status} tasks={c.tasks} order={i} />
      ))}
    </div>
  );
}
