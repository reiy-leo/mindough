/**
 * 打卡页、倒数日页的「新建」不再弹新建面板（Rei 2026-11-09 01:31）：直接建一条空任务，选中，宽屏在右列详情打开、
 * 手机推入整页详情，光标进正文第一行。完成方式、目标、重复规则、目标日期、卡片颜色都在详情的属性胶囊里改。
 *
 * - 打卡：每天重复、计数、目标 2 次（计数最少 2，Rei 2026-11-09 01:30），单位空、默认步长。
 * - 倒数日：目标日期空着（详情里「选一天」），没选日期前不在倒数日页的卡片里。
 * - 正文空着离开（选了别的、取消选中、换页面、手机返回）：这条自动删掉，不留空任务。写了字就是正常任务。
 *   哪几条是「刚建的空任务」记在 sessionStorage，刷新后还认得；离开时才看正文，打字中途不会删。
 * - 日历的「+」/「添加」（Rei 2026-11-12 06:52「改成和看板模式弹窗同一个组件」）也走这里：createDateDraftTask 建一条日期是那天的
 *   草稿任务（Store.createDraftTask：只在内存里，不落盘、不进 outbox），宽屏在日历的详情浮层（DetailModal）打开、手机推入整页详情，
 *   光标在第一行。第一次有改动它就转成普通任务落盘；什么都没改就关掉，直接丢掉，同步队列里没有它。
 *   改了属性（比如日期）但正文还空着关掉：和打卡 / 倒数日一样删掉（这时已经落盘，会写一条墓碑）。
 */
import { formatRecurrence, newCountConfig, type NewTaskInput, type Store, type Task } from '@mindough/core';

export type BlankKind = 'checkin' | 'countdown';

const KEY = 'mindough:blank-drafts';

function readDrafts(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeDrafts(ids: string[]) {
  try {
    if (ids.length) sessionStorage.setItem(KEY, JSON.stringify(ids));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* 存不了就算了：最多留下一条空任务 */
  }
}

/** 这一类空任务的默认值。categoryId：页面上筛选着某个类型就带上。 */
export function blankInput(kind: BlankKind, categoryId: string | null = null): NewTaskInput {
  const base: NewTaskInput = { body_md: '', ...(categoryId ? { category_id: categoryId } : {}) };
  if (kind === 'countdown') return { ...base, completion_mode: 'countdown', target_date: null };
  return { ...base, recurrence: formatRecurrence({ kind: 'daily' }), completion_mode: 'count', target_value: 2, unit: null, count_config: newCountConfig(null) };
}

// 光标进正文：建好那一下记住 id，详情的正文编辑器挂上时取一次（2 秒内有效，React 严格模式重复挂载也认）
let focusReq: { id: string; at: number } | null = null;

export function wantsBodyFocus(id: string): boolean {
  return !!focusReq && focusReq.id === id && Date.now() - focusReq.at < 2000;
}

/** 建一条空任务并选中（ui.openEditor），返回它。之前留着的空任务（不是这条）照规则清掉。 */
export function createBlankTask(store: Store, openEditor: (id: string | null) => void, kind: BlankKind, categoryId: string | null = null): Task {
  const t = store.createTask(blankInput(kind, categoryId), { joinMyDay: false });
  writeDrafts([...readDrafts(), t.id]);
  focusReq = { id: t.id, at: Date.now() };
  openEditor(t.id);
  return t;
}

/**
 * 日历「+」：建一条日期是 date 的草稿任务并选中，光标进正文第一行（Rei 2026-11-12 06:52）。
 * 日期规则同原来日历「+」弹的新建面板：只带日期（日历没有时间格），不进等待安排；日期是今天的，落盘时进今天的我的一天。
 */
export function createDateDraftTask(store: Store, openEditor: (id: string | null) => void, date: string): Task {
  const t = store.createDraftTask({ body_md: '', scheduled_date: date });
  writeDrafts([...readDrafts(), t.id]);
  focusReq = { id: t.id, at: Date.now() };
  openEditor(t.id);
  return t;
}

/** 正文是空的（只有空白也算）。 */
export function isBlankBody(t: Pick<Task, 'body_md'>): boolean {
  return !t.body_md.trim();
}

/**
 * 选中的任务变了：刚建的空任务里，不是当前选中的那些——正文还空着就删掉，写了字就不再管。返回删掉的 id。
 * 在 App 里随 editingId 调（详情卸载时先把没存的正文存下，再到这里，所以打了字不会被删）。
 */
export function sweepBlankTasks(store: Store, editingId: string | null): string[] {
  const drafts = readDrafts();
  if (!drafts.length) return [];
  const keep: string[] = [];
  const removed: string[] = [];
  for (const id of drafts) {
    if (id === editingId) {
      keep.push(id);
      continue;
    }
    // 日历「+」的草稿还没碰过：直接丢掉，什么都不写
    if (store.discardDraftTask(id)) {
      removed.push(id);
      continue;
    }
    const t = store.get('task', id);
    if (t && !t.deleted && isBlankBody(t)) {
      store.deleteTask(id);
      removed.push(id);
    }
  }
  writeDrafts(keep);
  return removed;
}
