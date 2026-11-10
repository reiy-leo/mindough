/**
 * 任务详情的属性胶囊行（Rei 2026-10-25 选方案 A · 胶囊行）：只显示设置过（不是默认值）的属性，
 * 没设的收进行尾「+」菜单。这里是纯逻辑：哪些属性适用、默认值是什么、设没设、清除回默认要改哪些字段。
 *
 * 默认值（= 未设置，胶囊不显示）：
 * - 类型（Rei 2026-10-28 起能挂多个）：一个都没有（PropId 叫 category）
 * - 完成方式：打勾（completion_mode = 'once'）
 * - 日期：没有（scheduled_date = null；重复任务按规则出现，不适用）
 * - 重复：一次（recurrence = null / 空）
 * - 提醒：不提醒（remind_time = null；要有日期 / 重复 / 倒数日目标日才适用，见 core canRemind）
 * - 组：不放进组（group_id = null）
 * - 心情：没记（mood = null；只有普通任务有：不重复、不是倒数日，Rei 2026-11-08「日记的心情属性在普通任务属性中也可以添加」）
 * - 颜色：默认（card_color = null；只有倒数日有，Rei 2026-11-02「倒数日的card可以设置不同的颜色背景」）
 * 资料（Rei 2026-10-28：和类型平级，跨库多选，含人物）不是胶囊：挂了就在胶囊下面按库分组列出来；
 * 一条都没挂时，「+」菜单里有「资料」（PropId refs）。以前的「资料库」「和谁有关」两个胶囊并进了资料。
 */
import { canRemind, cardColorOf, type Task } from '@mindough/core';

export type PropId = 'category' | 'refs' | 'mode' | 'date' | 'repeat' | 'remind' | 'group' | 'mood' | 'color';

/**
 * 固定顺序（Rei 2026-11-11 重排）：胶囊行和「+」菜单都按这个排。
 * ① 日期、完成方式、重复、提醒；② 资料、类型；③ 心情和其他属性（项目、卡片颜色）。
 */
export const PROP_ORDER: readonly PropId[] = ['date', 'mode', 'repeat', 'remind', 'refs', 'category', 'mood', 'group', 'color'];

/** 「+」菜单里每项属于第几组（组和组之间画分隔线）。附件在第 3 组，紧跟心情。 */
export const PROP_SECTION: Readonly<Record<AddMenuId, 1 | 2 | 3>> = {
  date: 1,
  mode: 1,
  repeat: 1,
  remind: 1,
  refs: 2,
  category: 2,
  mood: 3,
  attachment: 3,
  group: 3,
  color: 3,
};

export type PropTask = Pick<Task, 'completion_mode' | 'scheduled_date' | 'recurrence' | 'category_id' | 'remind_time' | 'group_id' | 'target_date' | 'card_color'> & { mood?: string | null };

/** 挂了几个类型、几条资料（含人物）。不给类型数时看单值 category_id。 */
export interface PropCounts {
  categories?: number;
  refs?: number;
}

/** 这件任务现在能有哪些属性（日期看重不重复，提醒要有时间可以响；类型、资料所有任务都能挂）。 */
export function applicableProps(t: PropTask): PropId[] {
  return PROP_ORDER.filter((id) => {
    if (id === 'date') return !t.recurrence;
    if (id === 'remind') return canRemind(t) || !!t.remind_time;
    // 卡片颜色只有倒数日有（倒数日页是卡片）
    if (id === 'color') return t.completion_mode === 'countdown';
    // 心情只给普通任务（打卡、倒数日没有）；以前记过的照样显示，能清掉
    if (id === 'mood') return canHaveMood(t) || !!t.mood;
    return true;
  });
}

/** 这个属性设过没有（不是默认值）。 */
export function isPropSet(id: PropId, t: PropTask, counts: PropCounts = {}): boolean {
  switch (id) {
    case 'category':
      return (counts.categories ?? (t.category_id ? 1 : 0)) > 0;
    case 'refs':
      return (counts.refs ?? 0) > 0;
    case 'mode':
      // 打卡的完成方式总显示成胶囊（勾选完成也是，Rei 2026-11-09 能和计数、计时互换）
      return t.completion_mode !== 'once' || !!t.recurrence;
    case 'date':
      return !!t.scheduled_date;
    case 'repeat':
      return !!t.recurrence;
    case 'remind':
      return !!t.remind_time;
    case 'group':
      return !!t.group_id;
    case 'mood':
      return !!t.mood;
    case 'color':
      return !!cardColorOf(t);
  }
}

/** 显示成胶囊的属性（按固定顺序）。资料不是胶囊。 */
export function setProps(t: PropTask, counts: PropCounts = {}): PropId[] {
  return applicableProps(t).filter((id) => id !== 'refs' && isPropSet(id, t, counts));
}

/** 「+」菜单里列出的属性：适用但还没设的（按固定顺序）。全都设了就是空的，「+」隐藏。 */
export function unsetProps(t: PropTask, counts: PropCounts = {}): PropId[] {
  return applicableProps(t).filter((id) => !isPropSet(id, t, counts));
}

/**
 * 清除回默认要写的字段。类型（去掉全部关联，走 store.setTaskCategories）和资料不是改任务字段，返回 null，由调用方处理。
 */
export function clearPatch(id: PropId): Partial<Task> | null {
  switch (id) {
    case 'mode':
      return { completion_mode: 'once' };
    case 'date':
      return { scheduled_date: null };
    case 'repeat':
      return { recurrence: null };
    case 'remind':
      return { remind_time: null };
    case 'group':
      return { group_id: null };
    case 'mood':
      return { mood: null };
    case 'color':
      return { card_color: null };
    case 'category':
    case 'refs':
      return null;
  }
}

/** 能记心情吗：普通任务（不重复、不是倒数日）。Rei 原话只说普通任务。 */
export function canHaveMood(t: Pick<Task, 'recurrence' | 'completion_mode'>): boolean {
  return !t.recurrence && t.completion_mode !== 'countdown';
}

/** 「+」菜单的一项：没设的属性，或者「附件」。 */
export type AddMenuId = PropId | 'attachment';

/**
 * 「+」菜单要列的项（Rei 2026-10-25「附件也收到这个下拉列表，但附件可以添加多个，添加后下拉列表中还要显示」）：
 * 没设的属性按固定顺序；能加附件时「附件」一直在（加过附件也还在），
 * 2026-11-11 起排在第 3 组心情后面（Rei「心情、附件和其他属性」），没有心情时就是第 3 组第一项。
 * 菜单是空的时「+」隐藏。
 */
export function addMenuItems(t: PropTask, counts: PropCounts = {}, canAttach = false): AddMenuId[] {
  const items: AddMenuId[] = unsetProps(t, counts);
  if (canAttach) {
    const i = items.findIndex((id) => PROP_SECTION[id] === 3 && id !== 'mood');
    items.splice(i < 0 ? items.length : i, 0, 'attachment');
  }
  return items;
}

/** 「+」菜单分成几组（空组不出），组间画分隔线（Rei 2026-11-11）。 */
export function addMenuSections(t: PropTask, counts: PropCounts = {}, canAttach = false): AddMenuId[][] {
  const items = addMenuItems(t, counts, canAttach);
  return ([1, 2, 3] as const).map((n) => items.filter((id) => PROP_SECTION[id] === n)).filter((g) => g.length > 0);
}
