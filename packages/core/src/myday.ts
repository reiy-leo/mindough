/**
 * 我的一天：按本机日期的清单。零点后自动换一天；没做完的不顺延，放进“昨天没做完”。
 */
import { addDays, toDateKey } from './dates';
import { dueToday, isHabit, progressOn } from './checkin';
import type { DerivedStatus } from './dag';
import { inArchivedGroup, isGroupArchived } from './group';
import { isFinished, type CheckIn, type DateKey, type Group, type MyDayEntry, type Task } from './types';
import { formatHlc } from './hlc';

import { tr } from './i18n';
import { taskToday } from './timezone';
import { taskEndDate } from './date-range';
import { MAKEUP_ENTRY_PREFIX, makeupNode, makeupStarted, makeupState } from './makeup';
export function entriesFor(entries: readonly MyDayEntry[], date: DateKey): MyDayEntry[] {
  const seen = new Set<string>();
  // 同一 task_id + date 只保留一条（同步时按此合并）
  return entries
    .filter((e) => !e.deleted && e.date === date)
    .sort((a, b) => a.sort - b.sort || (a.added_at < b.added_at ? -1 : a.added_at > b.added_at ? 1 : a.id < b.id ? -1 : 1))
    .filter((e) => (seen.has(e.task_id) ? false : (seen.add(e.task_id), true)));
}

/** 任务在 date 那天是否算“做完”：已结束（完成 / 关闭），或打卡任务当天周期达标。 */
export function isDoneOn(task: Task, checkIns: readonly CheckIn[], date: DateKey, now: Date): boolean {
  if (isFinished(task.status)) return true;
  if (isHabit(task)) {
    return progressOn(task, checkIns.filter((c) => c.task_id === task.id), date, now).met;
  }
  return false;
}

export interface MyDayItem {
  entry: MyDayEntry;
  task: Task;
  done: boolean;
}

/** 今天的清单：完成的沉到底部，其余按 sort。 */
export function myDayItems(
  entries: readonly MyDayEntry[],
  tasksById: ReadonlyMap<string, Task>,
  checkIns: readonly CheckIn[],
  date: DateKey,
  now: Date,
): MyDayItem[] {
  const items: MyDayItem[] = [];
  for (const entry of entriesFor(entries, date)) {
    const task = tasksById.get(entry.task_id);
    if (!task || task.deleted) continue;
    items.push({ entry, task, done: isDoneOn(task, checkIns, date, now) });
  }
  return [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
}

/** 置顶的虚拟行 id 前缀：这些行不在 my_day 表里，别拿去写（移出、排序都不对它们做）。 */
export const PINNED_ENTRY_PREFIX = 'pinned:';

/** 我的一天里这一项是置顶带进来的虚拟行吗。 */
export function isPinnedEntry(e: Pick<MyDayEntry, 'id'>): boolean {
  return e.id.startsWith(PINNED_ENTRY_PREFIX);
}

/**
 * 任务的置顶时间（置顶的排序键）；没置顶 = null / undefined。
 * 2026-11-12 起置顶看任务挂没挂内置类型「置顶」（Rei 03:46「有置顶类型就置顶。没就不置顶」），要读类型表，
 * 所以纯函数都收一个 pinOf：界面和 Store 传 store.pinnedAt；不传时退回 task.pinned_at（测试、老调用）。
 */
export type PinOf = (task: Task) => string | null | undefined;
export const pinnedAtOf: PinOf = (task) => task.pinned_at;

/** 只看 task.pinned_at 的旧判断（Rei 2026-11-08）。界面上判断置顶用 store.isPinned。 */
export function isPinned(task: { pinned_at?: string | null } | null | undefined): boolean {
  return !!task?.pinned_at;
}

/**
 * 置顶的任务那天在我的一天里的样子（Rei 2026-11-08「任务支持置顶，置顶的任务在我的一天中永远显示，直到用户手动关闭」）。
 * 不读 my_day 表：每天都在，改日期移出、移出当天、项目的「出现在我的一天」开关都管不着。
 * - 没做完：在。打卡看那天的周期达没达标（isDoneOn）。
 * - 做完了：只在做完那天（done_at 的本机日期）出现，落进「已完成」段；之后不显示，但还是置顶，重新打开就回来。
 * - 删了的、打卡归档了的、在归档项目里的不显示。
 * 多件置顶的，最近置顶的在上。行是虚拟的（id 带 PINNED_ENTRY_PREFIX，updated_at 空）。
 */
export function pinnedDayItems(
  tasks: Iterable<Task>,
  groups: readonly Pick<Group, 'id' | 'deleted' | 'archived_at'>[] | ReadonlyMap<string, Pick<Group, 'deleted' | 'archived_at'>>,
  checkIns: readonly CheckIn[],
  date: DateKey,
  now: Date,
  pinOf: PinOf = pinnedAtOf,
): MyDayItem[] {
  const gm = groups instanceof Map ? groups : new Map((groups as readonly Pick<Group, 'id' | 'deleted' | 'archived_at'>[]).map((g) => [g.id, g]));
  const out: Array<MyDayItem & { pin: string }> = [];
  for (const task of tasks) {
    const pin = pinOf(task);
    if (!pin || task.deleted || task.archived_at || inArchivedGroup(task, gm)) continue;
    const done = isDoneOn(task, checkIns, date, now);
    // 只做一次的做完了：只留做完那天
    if (done && !task.recurrence && (!task.done_at || toDateKey(new Date(task.done_at)) !== date)) continue;
    const entry: MyDayEntry = { id: PINNED_ENTRY_PREFIX + task.id, updated_at: '', deleted: false, task_id: task.id, date, sort: -Infinity, added_at: pin };
    out.push({ entry, task, done, pin });
  }
  return out
    .sort((a, b) => (a.pin > b.pin ? -1 : a.pin < b.pin ? 1 : a.task.id < b.task.id ? -1 : 1))
    .map(({ pin: _pin, ...item }) => item);
}

/**
 * 把置顶的放到当天清单最前面（同一件任务也有 my_day 行的，只留置顶那一项）。
 * 再分段（myDaySections）时，置顶的在「未完成」段最上面，比新加进来的还靠上。
 */
export function withPinned(items: readonly MyDayItem[], pinned: readonly MyDayItem[]): MyDayItem[] {
  if (!pinned.length) return [...items];
  const ids = new Set(pinned.map((i) => i.task.id));
  return [...pinned, ...items.filter((i) => !ids.has(i.task.id))];
}

/** 今天要打卡的虚拟行 id 前缀（Rei 2026-11-09 01:27）：不在 my_day 表里，拖动时才落成真行（Store.reorderMyDay）。 */
export const CHECKIN_ENTRY_PREFIX = 'checkin:';

/** 我的一天里这一项是「今天要打卡」带进来的虚拟行吗。 */
export function isCheckInEntry(e: Pick<MyDayEntry, 'id'>): boolean {
  return e.id.startsWith(CHECKIN_ENTRY_PREFIX);
}

/**
 * 这件打卡今天该自动出现在我的一天吗（不看移出过没有）：按重复规则今天要打（dueToday：没结束 / 不再打卡、没归档、建了之后），
 * 没删、不在归档的项目里、没置顶（置顶的走 pinnedDayItems）。达没达标都算：达标的在「已完成」段。
 */
export function isCheckInDayCandidate(
  task: Task,
  groups: ReadonlyMap<string, Pick<Group, 'deleted' | 'archived_at'>>,
  date: DateKey,
  pinOf: PinOf = pinnedAtOf,
): boolean {
  return !task.deleted && !pinOf(task) && dueToday(task, date) && !inArchivedGroup(task, groups);
}

/**
 * 今天要打卡的打卡任务自动出现在我的一天（Rei 2026-11-09 01:27「打卡任务，如果今天有节点，也要显示在我的一天中」）。
 * 和置顶一样是虚拟行，不写 my_day：每天按重复规则算，各设备算出来一样，不进同步。
 * seen：这一天 my_day 表里已经有行（活的、墓碑都算）的任务。活的照常由 myDayItems 出；墓碑 = 用户移出了当天（removeFromMyDay 写的），这一天不再出现。
 * 排序：按任务自己的 sort（打卡页的顺序），放在当天手动加的后面。
 */
export function checkInDayItems(
  tasks: Iterable<Task>,
  groups: readonly Pick<Group, 'id' | 'deleted' | 'archived_at'>[] | ReadonlyMap<string, Pick<Group, 'deleted' | 'archived_at'>>,
  checkIns: readonly CheckIn[],
  date: DateKey,
  now: Date,
  seen: ReadonlySet<string>,
  pinOf: PinOf = pinnedAtOf,
): MyDayItem[] {
  const gm = groups instanceof Map ? groups : new Map((groups as readonly Pick<Group, 'id' | 'deleted' | 'archived_at'>[]).map((g) => [g.id, g]));
  const out: MyDayItem[] = [];
  for (const task of tasks) {
    if (seen.has(task.id) || !isCheckInDayCandidate(task, gm, date, pinOf)) continue;
    const entry: MyDayEntry = { id: CHECKIN_ENTRY_PREFIX + task.id, updated_at: '', deleted: false, task_id: task.id, date, sort: Infinity, added_at: `${date}T00:00:00.000Z` };
    out.push({ entry, task, done: isDoneOn(task, checkIns, date, now) });
  }
  return out.sort((a, b) => a.task.sort - b.task.sort || (a.task.id < b.task.id ? -1 : 1));
}

/** 这件打卡今天在我的一天里是虚拟行吗（Store.isInMyDay 用）：候选、且这一天 my_day 表里没有它的行（活的、墓碑都没有）。 */
export function isVirtualCheckInToday(
  task: Task,
  groups: ReadonlyMap<string, Pick<Group, 'deleted' | 'archived_at'>>,
  allEntries: Iterable<Pick<MyDayEntry, 'task_id' | 'date'>>,
  date: DateKey,
  pinOf: PinOf = pinnedAtOf,
): boolean {
  if (!isCheckInDayCandidate(task, groups, date, pinOf)) return false;
  for (const e of allEntries) if (e.task_id === task.id && e.date === date) return false;
  return true;
}

/**
 * 补打卡带进我的一天（Rei 2026-11-09 01:52，见 makeup.ts）：点了补打卡那天写的是真行（Store.startMakeup → addToMyDay），
 * 之后几天只要还能补（makeupNode 还是同一个节点、没达标、没到下一个节点）、而且开始过（makeupStarted），就每天出一条虚拟行。
 * 这一天 my_day 表里已经有它的行（活的、墓碑都算，seen）就不出：活的由 myDayItems 出，墓碑 = 用户今天移出了。
 * 补完那天那条真行落进「已完成」段（isDoneOn 看今天所在周期 = 被补的节点）；第二天不再出现。
 */
export function makeupDayItems(
  tasks: Iterable<Task>,
  groups: readonly Pick<Group, 'id' | 'deleted' | 'archived_at'>[] | ReadonlyMap<string, Pick<Group, 'deleted' | 'archived_at'>>,
  entries: Iterable<Pick<MyDayEntry, 'task_id' | 'date' | 'deleted'>>,
  checkIns: readonly CheckIn[],
  date: DateKey,
  now: Date,
  seen: ReadonlySet<string>,
  pinOf: PinOf = pinnedAtOf,
): MyDayItem[] {
  const gm = groups instanceof Map ? groups : new Map((groups as readonly Pick<Group, 'id' | 'deleted' | 'archived_at'>[]).map((g) => [g.id, g]));
  const list = [...entries];
  const out: MyDayItem[] = [];
  for (const task of tasks) {
    if (seen.has(task.id) || pinOf(task) || inArchivedGroup(task, gm)) continue;
    const st = makeupState(task, checkIns, date, now);
    if (!st || !makeupStarted(task.id, list, st.node, addDays(date, -1))) continue;
    // 补完了：只在补完那天（有这一天记的事件）留在「已完成」段，之后不再出现
    if (st.met && !st.events.some((e) => toDateKey(new Date(e.at)) === date)) continue;
    const entry: MyDayEntry = { id: MAKEUP_ENTRY_PREFIX + task.id, updated_at: '', deleted: false, task_id: task.id, date, sort: Infinity, added_at: `${date}T00:00:00.000Z` };
    out.push({ entry, task, done: st.met });
  }
  return out.sort((a, b) => a.task.sort - b.task.sort || (a.task.id < b.task.id ? -1 : 1));
}

/** 这件打卡今天在我的一天里是补打卡的虚拟行吗（Store.isInMyDay / reorderMyDay 用）。 */
export function isVirtualMakeupToday(
  task: Task,
  groups: ReadonlyMap<string, Pick<Group, 'deleted' | 'archived_at'>>,
  allEntries: Iterable<Pick<MyDayEntry, 'task_id' | 'date' | 'deleted'>>,
  checkIns: readonly CheckIn[],
  date: DateKey,
  now: Date,
  pinOf: PinOf = pinnedAtOf,
): boolean {
  const list = [...allEntries];
  if (list.some((e) => e.task_id === task.id && e.date === date)) return false;
  return makeupDayItems([task], groups, list, checkIns, date, now, new Set(), pinOf).length > 0;
}

/**
 * 我的一天分两段（Rei 2026-11-08「未完成、完成两个 section 显示」）：未完成在上，已完成在下，各自按 sort。
 * 「已完成」就是 isDoneOn：完成、关闭，和当天周期达标的打卡。
 */
export function myDaySections(items: readonly MyDayItem[]): { open: MyDayItem[]; done: MyDayItem[] } {
  return { open: items.filter((i) => !i.done), done: items.filter((i) => i.done) };
}

/** 一段里拖完的新顺序拼回整天的顺序（另一段原样），给 reorderMyDay。 */
export function reorderSection(items: readonly MyDayItem[], section: 'open' | 'done', newIds: readonly string[]): string[] {
  // 置顶的是虚拟行，不参与排序（Rei 2026-11-08：总在最上面）
  const pinned = new Set(items.filter((i) => isPinnedEntry(i.entry)).map((i) => i.task.id));
  const { open, done } = myDaySections(items);
  const ids = (xs: MyDayItem[]) => xs.map((i) => i.task.id);
  const out = section === 'open' ? [...newIds, ...ids(done)] : [...ids(open), ...newIds];
  return out.filter((id) => !pinned.has(id));
}

/** 昨天加入但没做完、今天也还没加入的任务。 */
export function yesterdayUnfinished(
  entries: readonly MyDayEntry[],
  tasksById: ReadonlyMap<string, Task>,
  checkIns: readonly CheckIn[],
  today: DateKey,
  now: Date,
  pinOf: PinOf = pinnedAtOf,
): Task[] {
  const yesterday = addDays(today, -1);
  const todayIds = new Set(entriesFor(entries, today).map((e) => e.task_id));
  const out: Task[] = [];
  for (const e of entriesFor(entries, yesterday)) {
    if (todayIds.has(e.task_id)) continue;
    const t = tasksById.get(e.task_id);
    // 置顶的今天本来就在（Rei 2026-11-08），不用带回
    if (!t || t.deleted || t.archived_at || pinOf(t)) continue;
    // 补打卡还在补的（Rei 2026-11-09 01:52）今天由 makeupDayItems 带着，不用再列进「昨天没做完」
    if (isHabit(t) && makeupNode(t, checkIns, today, now) && makeupNode(t, checkIns, yesterday, now) === makeupNode(t, checkIns, today, now)) continue;
    // 重复任务看的是昨天那个周期；普通任务看现在的状态
    if (isHabit(t) ? !isDoneOn(t, checkIns, yesterday, now) : !isFinished(t.status)) out.push(t);
  }
  return out;
}

export type SuggestionReason = '今天到期' | '这几天要做' | '今天要打卡' | '刚解锁' | '倒数日到了';
/** 建议理由的显示文字（内部值是中文，显示按当前语言）。 */
export const SUGGESTION_REASON_LABEL: Record<SuggestionReason, string> = {
  get 今天到期() { return tr('今天到期'); },
  get 这几天要做() { return tr('这几天要做'); },
  get 今天要打卡() { return tr('今天要打卡'); },
  get 刚解锁() { return tr('刚解锁'); },
  get 倒数日到了() { return tr('倒数日到了'); },
};

export interface Suggestion {
  task: Task;
  reason: SuggestionReason;
}

export interface SuggestionInput {
  tasks: readonly Task[];
  entries: readonly MyDayEntry[];
  checkIns: readonly CheckIn[];
  derived: ReadonlyMap<string, DerivedStatus>;
  /** 最近解锁的任务 id（例如过去 24 小时内前置刚完成的）。 */
  recentlyUnlocked: readonly string[];
  today: DateKey;
  now: Date;
  /**
   * 全部项目（Rei 2026-11-02）。给了的话，开着「出现在我的一天」的项目里的任务不进建议（它们自动进我的一天，见 autoMyDayTasks）。
   * 不给就和以前一样，都建议。
   */
  groups?: readonly Group[];
  /** 置顶时间（Store.pinnedAt）；不给就看 task.pinned_at。置顶的不进建议。 */
  pinOf?: PinOf;
}

/**
 * 今天该做的任务和理由：今天到期 / 过期、日期段含今天、倒数日到了、今天要打卡、刚解锁。只算没结束的，不看在不在我的一天里。
 * 建议（suggestions）和项目任务自动进我的一天（autoMyDayTasks）都从这里挑。
 */
export function dueTodayCandidates({ tasks, checkIns, derived, recentlyUnlocked, today, now }: Omit<SuggestionInput, 'entries' | 'groups'>): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (task: Task, reason: SuggestionReason) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    out.push({ task, reason });
  };
  // 归档了的打卡不进建议，也不自动加进我的一天（Rei 2026-11-02）
  const live = tasks.filter((t) => !t.deleted && !isFinished(t.status) && !t.archived_at);
  // 到期按任务时区的今天（Rei 2026-10-25 任务时区；没设时区就是 today）
  // 日期段（Rei 2026-10-26）：今天落在段里、还没到结束日的是「这几天要做」；到了结束日或过了才算「今天到期」
  for (const t of live) {
    if (!t.scheduled_date || t.recurrence) continue;
    const zoneToday = taskToday(t, now, today);
    if (t.scheduled_date > zoneToday) continue;
    const end = taskEndDate(t)!;
    push(t, end > zoneToday ? '这几天要做' : '今天到期');
  }
  for (const t of live) if (t.completion_mode === 'countdown' && t.target_date === taskToday(t, now, today)) push(t, '倒数日到了');
  for (const t of live)
    if (dueToday(t, today) && !progressOn(t, checkIns.filter((c) => c.task_id === t.id), today, now).met) push(t, '今天要打卡');
  const byId = new Map(live.map((t) => [t.id, t]));
  for (const id of recentlyUnlocked) {
    const t = byId.get(id);
    if (t && derived.get(id)?.state === '可开始') push(t, '刚解锁');
  }
  return out;
}

/** 项目开着「出现在我的一天」吗（没有这个字段的老数据算开）。 */
export function groupAutoMyDay(group: Pick<Group, 'my_day_auto'> | null | undefined): boolean {
  return !!group && group.my_day_auto !== false;
}

/** 任务在开着「出现在我的一天」的项目里（项目删了的、归档了的不算）。 */
function inAutoGroup(task: Task, groups: ReadonlyMap<string, Group>): boolean {
  if (!task.group_id) return false;
  const g = groups.get(task.group_id);
  return !!g && !g.deleted && !isGroupArchived(g) && groupAutoMyDay(g);
}

const groupMap = (groups: readonly Group[] | undefined) => new Map((groups ?? []).map((g) => [g.id, g]));

/**
 * 建议区：今天到期的、今天要打卡的、刚解锁的；已在今天清单里的、会自动进我的一天的（开着开关的项目里的）不再建议。
 * 归档了的项目里的任务也不建议（Rei 2026-11-05）。
 */
export function suggestions(input: SuggestionInput): Suggestion[] {
  const inToday = new Set(entriesFor(input.entries, input.today).map((e) => e.task_id));
  const groups = groupMap(input.groups);
  // 置顶的每天都在我的一天里（Rei 2026-11-08），不再建议
  // 今天要打的打卡自己就在我的一天里（Rei 2026-11-09，checkInDayItems），不再建议；移出了当天的也不再建议
  const pinOf = input.pinOf ?? pinnedAtOf;
  return dueTodayCandidates(input).filter((s) => !inToday.has(s.task.id) && !pinOf(s.task) && !inAutoGroup(s.task, groups) && !inArchivedGroup(s.task, groups) && !isCheckInDayCandidate(s.task, groups, input.today, pinOf));
}

/**
 * 今天要自动放进我的一天的任务（Rei 2026-11-02「直接出现在我的一天，而不是出现在的建议里」）：
 * 开着「出现在我的一天」的项目里、今天该做的（条件同建议）。
 * seen 是这一天已经有过行的任务（在里面的、移出过的都算）：这些不再加，所以移出后当天不会再冒出来。
 * 不看「显示建议」开关：这不是建议。
 */
export function autoMyDayTasks(input: Omit<SuggestionInput, 'entries' | 'groups'> & { groups: readonly Group[]; seen: ReadonlySet<string> }): Suggestion[] {
  const groups = groupMap(input.groups);
  return dueTodayCandidates(input).filter((s) => !input.seen.has(s.task.id) && inAutoGroup(s.task, groups) && isCurrentFor(s.task, input.today, input.now));
}

/**
 * 有日期的任务「当前」吗（Rei 2026-11-08「项目"出现在我的一天"，只有当前的显示在我的一天，过期的、没到的都不显示」）：
 * 日期是今天，或日期段含今天（设备的今天或任务时区的今天）。没日期的（打卡、倒数日、刚解锁的没日期任务）不看这条，照旧。
 */
export function isCurrentFor(task: Pick<Task, 'scheduled_date' | 'end_date' | 'time_zone' | 'recurrence'>, today: DateKey, now: Date): boolean {
  if (!task.scheduled_date || task.recurrence) return true;
  return keepsMyDayAfterDate(task.scheduled_date, task.end_date ?? null, [today, taskToday(task, now, today)]);
}

/** 自动加进来的行（syncAutoMyDay 写的：added_at 是那天 00:00Z 的字面值；拖过排序也不变）。手动加的 added_at 是真实时刻。 */
export function isAutoEntry(e: Pick<MyDayEntry, 'added_at' | 'date'>): boolean {
  return e.added_at === `${e.date}T00:00:00.000Z`;
}

/**
 * 自动加进来、现在已经不当前的行（比如早上加进来时还算，规则改了以后过期的那批）：那天就不显示。手动加的不受影响。只是不显示，不删行。
 */
export function isStaleAutoEntry(e: Pick<MyDayEntry, 'added_at' | 'date'>, task: Task | undefined, now: Date): boolean {
  return !!task && isAutoEntry(e) && !isCurrentFor(task, e.date, now);
}

/**
 * 新加进我的一天的行排最上面（Rei 2026-11-08「添加到我的一天的任务放在最上面」）：sort 用「负的加入毫秒数」，越晚加越小、越靠上；
 * 也一定比当天已有的行都小（拖过的行是 1..N，同一毫秒连着加的往上叠）。sort 只是数字，老客户端照样按从小到大排，看到的也是新的在上。
 */
export function topSort(entries: Iterable<MyDayEntry>, date: DateKey, atMs: number): number {
  let min = Infinity;
  for (const e of entries) if (!e.deleted && e.date === date && e.sort < min) min = e.sort;
  return Math.min(-Math.floor(atMs), min - 1);
}

/**
 * 自动加的行（autoMyDayTasks）的 sort：按「它变成今天该做」的时刻排，各设备从同样的数据算出来一样。
 * 时刻取任务和它前置里最晚的 updated_at（改日期、前置刚做完），不早于那天 00:00（UTC 字面，和 added_at 一样）。
 * 当天一打开就加进来的排在当天手动加的下面；白天因为改了日期、刚解锁加进来的排在那一刻之前加的上面。
 */
export function autoSort(date: DateKey, updatedAts: readonly string[]): number {
  let ms = Date.parse(`${date}T00:00:00.000Z`);
  for (const u of updatedAts) {
    const m = Number(u.slice(0, 13));
    if (/^\d{13}-/.test(u) && m > ms) ms = m;
  }
  return -ms;
}

/**
 * 改日期后还留在今天的我的一天吗（Rei 2026-11-08「用户设置的日期不是今天时 取消我的一天」）：
 * 清空日期留着；新的日期（段）含今天留着；其他（以后、以前）移出。todays 给设备的今天和任务时区的今天，含其中一个就算今天。
 */
export function keepsMyDayAfterDate(start: DateKey | null, end: DateKey | null, todays: readonly DateKey[]): boolean {
  if (!start) return true;
  const last = end && end > start ? end : start;
  return todays.some((d) => start <= d && d <= last);
}

/** FNV-1a 32 位。 */
function fnv(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 某件任务某一天在我的一天里的行 id（2026-11-02 起新加的行都用它）：UUID 形状，各设备算出来一样。
 * 两台设备同一天各自加了同一件，是同一行，同步时按 LWW 合并，不会出现两条；移出后再加，是把墓碑翻回来。
 * 以前加的行是随机的 UUIDv7，照样能读（entriesFor 按 task_id + date 去重）。
 */
export function myDayEntryId(taskId: string, date: DateKey): string {
  const key = `my_day\u0000${taskId}\u0000${date}`;
  const hex = [fnv(key), fnv(key, 0x01234567), fnv(key, 0x89abcdef), fnv(key, 0x2468ace0)].map((n) => n.toString(16).padStart(8, '0')).join('');
  return `00000000-${hex.slice(0, 4)}-7${hex.slice(5, 8)}-8${hex.slice(9, 12)}-${hex.slice(12, 24)}`;
}

/**
 * 自动加进我的一天的行用的 updated_at：比任何真实写入都早的固定值。
 * 各设备写出来一模一样（同 id、同内容、同时间戳），合并时谁也不覆盖谁；
 * 用户在哪台设备上移出，墓碑都带真实时间戳，比它新。别的设备离线时自动加的那一行，同步后会被墓碑盖掉，不会复活。
 */
export const AUTO_MY_DAY_HLC = formatHlc(0, 0, 'auto');

/**
 * 最近解锁：可开始的任务里，有前置在 since 之后完成的。
 */
export function recentlyUnlocked(
  tasks: readonly Task[],
  edges: readonly { pred_id: string; succ_id: string }[],
  derived: ReadonlyMap<string, DerivedStatus>,
  sinceIso: string,
): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out = new Set<string>();
  for (const e of edges) {
    const pred = byId.get(e.pred_id);
    if (pred?.status === '完成' && pred.done_at && pred.done_at >= sinceIso && derived.get(e.succ_id)?.state === '可开始') out.add(e.succ_id);
  }
  return [...out];
}
