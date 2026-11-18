/**
 * 任务详情「关系」里的「先做完这些 / 做完后解锁」两组（Rei 2026-11-18「前置任务和后置任务可以拖拽更换」）。
 *
 * 一组里的任务拖到另一组，就把这条前后关系换个方向：从「先做完这些」拖到「做完后解锁」，
 * 那件就从这件的前置变成后续（删 A → B，连 B → A），反过来一样（lib/actions tryReverseDependency）。
 * - 会绕成圈的、自动连上的（打卡存档、循环倒数日的记录）放下也不换，提示一句为什么。
 * - 组里没有排序字段（dependency 表没有 sort），所以组内不拖着排，只能拖到另一组；拖进本组什么也不做。
 * - 拖起来以后另一组整块是落点（不分插在哪一行前后）；另一组本来是空的、平时不显示，拖动时才出来，写「拖到这里」。
 * - 电脑：React Aria 的拖放（GridList + useDragAndDrop，同看板），整行能拖，不放把手。
 * - 手机：长按约半秒拿起再拖（lib/touch-reorder，不走原生拖放、不显示把手），两组同一个 group、上下叠（axis: 'y'）。
 * - 严格模式锁住的任务、没有前后关系的方向都不能拖。
 * 点一行打开那件任务（GridList onAction）；拖动的尾巴不算点开（lib/drag-guard）。
 */
import type { ReactNode } from 'react';
import { Button as RacButton, GridList, GridListItem, useDragAndDrop, type DropItem } from 'react-aria-components';
import { Check, X } from 'lucide-react';
import type { Store, Task } from '@mindough/core';
import { useUi } from '../../lib/ui';
import { tryReverseDependency } from '../../lib/actions';
import { isDragPress, useReorderGuard } from '../../lib/drag-guard';
import { useTouchReorder } from '../../lib/touch-reorder';
import { titleOf } from '../../lib/view';
import { taskStateText } from './TaskSearch';
import { tr } from '../../lib/i18n';

export type DepKind = 'pred' | 'succ';

/** 两组各用一种拖动类型：只收另一组拖来的，本组的拖不进本组。 */
const DRAG_TYPE: Record<DepKind, string> = { pred: 'application/x-mindough-dep-pred', succ: 'application/x-mindough-dep-succ' };
const other = (k: DepKind): DepKind => (k === 'pred' ? 'succ' : 'pred');

/** 整组是一个落点：不画插在哪一行前后的线。 */
const ROOT_ONLY = { getDropTargetFromPoint: () => ({ type: 'root' as const }) };

async function idsOf(items: readonly DropItem[], type: string): Promise<string[]> {
  const out: string[] = [];
  for (const it of items) if (it.kind === 'text' && it.types.has(type)) out.push(await it.getText(type));
  return out;
}

/** 拖动开始 / 结束的状态改动放到下一帧：电脑上在 dragstart 里同步改 DOM（露出空组），Chrome 会把这次拖动取消掉。 */
const later = (fn: () => void) => window.setTimeout(fn, 0);

export function DepList({
  store,
  task,
  kind,
  list,
  label,
  extra,
  locked,
  dragging,
  onDragging,
}: {
  store: Store;
  task: Task;
  kind: DepKind;
  list: Task[];
  label: string;
  extra?: ReactNode;
  /** 严格模式锁住：不能拖、也不收。 */
  locked: boolean;
  /** 眼下从哪一组拖起来的（两组共用一份，Relations 管）。 */
  dragging: DepKind | null;
  onDragging: (k: DepKind | null) => void;
}) {
  const ui = useUi();
  const base = useReorderGuard();
  // 拖起 / 放下时告诉 Relations：另一组（空的也是）亮出来当落点。手指拖动也走这一对（lib/touch-reorder 调 guard.handlers）
  const guard = {
    ref: base.ref,
    handlers: {
      onDragStart: () => {
        base.handlers.onDragStart();
        later(() => onDragging(kind));
      },
      onDragEnd: () => {
        base.handlers.onDragEnd();
        later(() => onDragging(null));
      },
    },
  };
  // 拖进来的是另一组的：从「先做完这些」来的（id → 这件）在「做完后解锁」放下换成 这件 → id；反过来一样
  const receive = (ids: string[]) => {
    for (const id of ids) {
      if (kind === 'succ') tryReverseDependency(store, ui, id, task.id);
      else tryReverseDependency(store, ui, task.id, id);
    }
  };
  const { dragAndDropHooks } = useDragAndDrop({
    ...guard.handlers,
    getItems: (keys) =>
      [...keys].map((k) => {
        const t = store.get('task', String(k));
        return { [DRAG_TYPE[kind]]: String(k), 'text/plain': t ? titleOf(store, t) : String(k) };
      }),
    acceptedDragTypes: [DRAG_TYPE[other(kind)]],
    getDropOperation: () => 'move',
    dropTargetDelegate: ROOT_ONLY,
    onRootDrop: (e) => void idsOf(e.items, DRAG_TYPE[other(kind)]).then(receive),
  });
  useTouchReorder(guard, {
    group: 'dep',
    axis: 'y',
    canDrag: () => !locked,
    onReceive: (ids) => {
      if (!locked) receive(ids);
    },
  });
  const isTarget = !!dragging && dragging !== kind;
  // 空组平时不显示；拖另一组的时候出来接
  const hidden = !list.length && !isTarget;
  return (
    <div data-touch-reorder-zone className={`rel-group${hidden ? ' is-idle-empty' : ''}${isTarget ? ' is-drop-zone' : ''}`} aria-hidden={hidden || undefined}>
      <div className="rel-head">
        <span>{label}</span>
        {extra}
      </div>
      <GridList
        ref={guard.ref}
        aria-label={label}
        className="rel-list"
        items={list}
        dependencies={[store.version]}
        {...(locked ? {} : { dragAndDropHooks })}
        onAction={(key) => {
          if (isDragPress()) return;
          ui.openEditor(String(key));
        }}
        renderEmptyState={() => <div className="rel-drop-empty">{tr('拖到这里')}</div>}
      >
        {(t) => <DepRow store={store} task={task} t={t} kind={kind} />}
      </GridList>
    </div>
  );
}

function DepRow({ store, task, t, kind }: { store: Store; task: Task; t: Task; kind: DepKind }) {
  const state = t.status === '完成' ? 'done' : t.status === '关闭' ? 'closed' : 'open';
  const meta = taskStateText(store, t);
  const title = titleOf(store, t);
  const remove = () => (kind === 'pred' ? store.removeDependency(t.id, task.id) : store.removeDependency(task.id, t.id));
  return (
    <GridListItem id={t.id} textValue={title || tr('任务')} className={`rel-item is-${state}`}>
      <span className="rel-dot" aria-label={state === 'done' ? tr('已完成') : state === 'closed' ? tr('已关闭') : tr('未完成')}>
        {state === 'done' ? <Check size={11} strokeWidth={3} /> : state === 'closed' ? <X size={11} strokeWidth={3} /> : null}
      </span>
      <span className="rel-title">{title}</span>
      {meta && state === 'open' && <span className="rel-meta">{meta}</span>}
      <RacButton className="icon-btn rel-remove" aria-label={tr('去掉和「{title}」的关系', { title })} onPress={remove}>
        <X size={14} />
      </RacButton>
    </GridListItem>
  );
}
