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
import { GridList, GridListItem, useDragAndDrop, type DropItem } from 'react-aria-components';
import { TASK_STATUS_LABEL, type Store, type Task, type TaskStatus } from '@mindough/core';
import { useUi } from '../../lib/ui';
import { changeStatus } from '../../lib/actions';
import { boardColumns } from '../../lib/project-view';
import { isDragPress, useReorderGuard } from '../../lib/drag-guard';
import { titleOf } from '../../lib/view';
import { RowLead, TaskRow } from '../TaskRow';

import { tr } from '../../lib/i18n';

const DRAG_TYPE = 'application/x-mindough-task';

async function idsOf(items: readonly DropItem[]): Promise<string[]> {
  const out: string[] = [];
  for (const it of items) if (it.kind === 'text' && it.types.has(DRAG_TYPE)) out.push(await it.getText(DRAG_TYPE));
  return out;
}

function Column({ store, status, tasks }: { store: Store; status: TaskStatus; tasks: Task[] }) {
  const ui = useUi();
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
  const label = TASK_STATUS_LABEL[status];
  return (
    <section className={`board-col is-${status === '待办' ? 'todo' : status === '进行中' ? 'doing' : status === '完成' ? 'done' : 'closed'}`} aria-label={label}>
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
        dependencies={[ui.editingId, store.version]}
        items={tasks}
        onAction={(key) => {
          // 拖动的尾巴、手指长按刚弹出行菜单（松手那下）都不算点开
          if (isDragPress() || document.querySelector('[role="menu"]')) return;
          ui.openEditor(String(key));
        }}
        renderEmptyState={() => <div className="board-empty">{tr('拖到这里')}</div>}
      >
        {(t) => (
          <GridListItem id={t.id} textValue={titleOf(store, t) || tr('任务')} className={`board-card${ui.editingId === t.id ? ' is-selected' : ''}`}>
            {/* 置顶的把手那格换成红色图钉，还是能拖到别的状态（Rei 2026-11-09） */}
            <RowLead pinned={!!t.pinned_at} dragLabel={tr('拖到别的状态')} />
            <TaskRow store={store} task={t} showGroup={false} showDate pinInLead />
          </GridListItem>
        )}
      </GridList>
    </section>
  );
}

export function ProjectBoard({ store, tasks }: { store: Store; tasks: Task[] }) {
  return (
    <div className="board" role="group" aria-label={tr('看板')}>
      {boardColumns(tasks).map((c) => (
        <Column key={c.status} store={store} status={c.status} tasks={c.tasks} />
      ))}
    </div>
  );
}
