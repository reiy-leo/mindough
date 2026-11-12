import { fieldText, mediaFieldKey, type DerivedStatus, type FieldDef, type FieldValue, type Group, type Person, type Store, type Task, type TaskType } from '@mindough/core';

/** 图片字段值：外链 / data URL 直接用，否则当作 asset id。 */
export function imageUrl(store: Store, v: FieldValue | undefined | null): string | null {
  if (typeof v !== 'string' || !v) return null;
  if (/^(https?:|data:|blob:)/.test(v)) return v;
  return store.get('asset', v)?.url ?? null;
}

export function personAvatar(store: Store, p: Person | undefined | null): string | null {
  return p ? imageUrl(store, p.avatar_asset_id) : null;
}

export function resolver(store: Store) {
  return (def: FieldDef, v: FieldValue) => (def.kind === 'person' && typeof v === 'string' ? (store.get('person', v)?.name ?? '') : fieldText(v));
}

/** 任务显示用的数据（资料库里的资料 + 任务自己的字段）。 */
export function dataOf(store: Store, task: Task) {
  return store.taskData(task);
}

/**
 * 任务标题：正文第一行（Rei 2026-11-03「任何任务的第一行都是标题」，挂了资料也一样，资料名不当标题）。
 * 所有界面都从这里取（或 core 的 taskTitle / store.titleOfTask），别自己拼。
 */
export function titleOf(store: Store, task: Task): string {
  // 没标题时带编号的占位「未命名倒数日2」「未提供描述3」（Rei 2026-11-12 09:33 / 09:34，只显示不入库）
  return store.titleOfTask(task);
}

export interface TaskView {
  task: Task;
  title: string;
  type: TaskType | undefined;
  /** 资料 + 任务字段合并后的数据。 */
  data: Record<string, FieldValue>;
  /** 缩略图：挂了资料的是第一条资料的图（没图就是 null，列表不显示缩略图）；没挂资料的照旧（类型的图片字段 / 人物头像）。 */
  media: string | null;
  /** 缩略图的版式（poster / banner / round…）：挂了资料的按资料所在的库，没挂的按任务的类型。 */
  thumbLayout: string;
  /** 挂了资料：没图时不显示缩略图（不用类型图标、不用渐变占位，Rei 2026-11-03「电影B只是显示海报缩略图」）。 */
  hasItem: boolean;
  /** 人物类型：主图是对方头像。 */
  mediaIsAvatar: boolean;
  group: Group | undefined;
  people: Person[];
  derived: DerivedStatus | undefined;
}

export function viewOf(store: Store, task: Task): TaskView {
  const type = store.get('task_type', task.type_id);
  const data = store.taskData(task);
  const item = store.itemOf(task);
  const key = mediaFieldKey(type);
  const def = type?.fields.find((f) => f.key === key);
  let media: string | null = null;
  let mediaIsAvatar = false;
  if (item) media = imageUrl(store, item.image);
  else if (def?.kind === 'person') {
    media = personAvatar(store, store.get('person', data[def.key] as string));
    mediaIsAvatar = true;
  } else if (key) media = imageUrl(store, data[key]);
  return {
    task,
    title: store.titleOfTask(task),
    data,
    thumbLayout: (item ? store.get('task_type', item.type_id)?.layout : undefined) ?? type?.layout ?? 'text',
    hasItem: !!item,
    type,
    media,
    mediaIsAvatar,
    group: store.get('group', task.group_id),
    people: store.peopleOf(task.id),
    derived: store.derived().get(task.id),
  };
}

export const STATE_CLASS: Record<string, string> = {
  完成: 'state-done',
  关闭: 'state-closed',
  可开始: 'state-ready',
  被阻塞: 'state-blocked',
};
