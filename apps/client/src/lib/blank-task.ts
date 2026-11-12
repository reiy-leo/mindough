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
 * - 改过属性就留下（Rei 2026-11-12 09:22「用户改过任何属性（颜色、日期、循环等）就不算空白任务、不删；只有正文空且什么都没改才丢弃」）：
 *   建好那一下记一份「属性签名」（任务行除正文、时间戳以外的字段 + 指着它的依赖、人物、类型、资料、相关、附件、打卡行），
 *   离开时正文空着、签名也没变才删；签名变了（选了颜色、日期、重复、类型…）就留下，标题位显示占位（倒数日「未命名倒数日」、别的「未提供描述」，多条按创建时间编号，Store.titleOfTask）。
 *   日历「+」的草稿同样：什么都没碰关掉直接丢；只写了字又删光、属性没动，删（已落盘，写墓碑）；改了日期等属性没写字，留下。
 *   我的一天行不算（新建时会自动放进去）。旧会话里只记了 id 没记签名的，照原来的规则（正文空就删）。
 */
import { formatRecurrence, newCountConfig, type NewTaskInput, type Store, type Task } from '@mindough/core';

export type BlankKind = 'checkin' | 'countdown';

const KEY = 'mindough:blank-drafts';
const SIG_KEY = 'mindough:blank-sigs';

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

function readSigs(): Record<string, string> {
  try {
    const v = JSON.parse(sessionStorage.getItem(SIG_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeSigs(sigs: Record<string, string>) {
  try {
    if (Object.keys(sigs).length) sessionStorage.setItem(SIG_KEY, JSON.stringify(sigs));
    else sessionStorage.removeItem(SIG_KEY);
  } catch {
    /* 存不了：离开时按原规则（正文空就删） */
  }
}

/** 稳定序列化：键排序，undefined 和 null 一样（没有这个键）。 */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined && x !== null) out[k] = stable(x);
    }
    return out;
  }
  return v;
}

/**
 * 属性签名：任务行除正文、updated_at、deleted、refs_mirror（类型 / 资料的派生签名）以外的字段，
 * 加上指着这件任务的依赖、人物、类型、资料、相关任务、附件、打卡行的 id。我的一天行不算（新建时自动加）。
 */
export function blankSignature(store: Store, id: string): string | null {
  const t = store.get('task', id);
  if (!t) return null;
  const { body_md: _b, updated_at: _u, deleted: _d, refs_mirror: _r, ...rest } = t as Task & { refs_mirror?: unknown };
  const rel: string[] = [];
  for (const d of store.list('dependency')) if (d.pred_id === id || d.succ_id === id) rel.push(`dep:${d.id}`);
  for (const x of store.list('task_person')) if (x.task_id === id) rel.push(`person:${x.id}`);
  for (const x of store.list('task_category')) if (x.task_id === id) rel.push(`cat:${x.id}`);
  for (const x of store.list('task_item')) if (x.task_id === id) rel.push(`item:${x.id}`);
  for (const l of store.list('task_link')) if (l.a_task_id === id || l.b_task_id === id) rel.push(`link:${l.id}`);
  for (const a of store.list('attachment')) if (a.owner_type === 'task' && a.owner_id === id) rel.push(`att:${a.id}`);
  for (const c of store.list('check_in')) if (c.task_id === id) rel.push(`ci:${c.id}`);
  rel.sort();
  return JSON.stringify([stable(rest), rel]);
}

function remember(store: Store, id: string) {
  writeDrafts([...readDrafts(), id]);
  const sig = blankSignature(store, id);
  if (sig) writeSigs({ ...readSigs(), [id]: sig });
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
  remember(store, t.id);
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
  remember(store, t.id);
  focusReq = { id: t.id, at: Date.now() };
  openEditor(t.id);
  return t;
}

/** 正文是空的（只有空白也算）。 */
export function isBlankBody(t: Pick<Task, 'body_md'>): boolean {
  return !t.body_md.trim();
}

/**
 * 选中的任务变了：刚建的空任务里，不是当前选中的那些——正文还空着、属性也没改过就删掉；写了字或改过属性就留下、不再管。返回删掉的 id。
 * 在 App 里随 editingId 调（详情卸载时先把没存的正文存下，再到这里，所以打了字不会被删）。
 */
export function sweepBlankTasks(store: Store, editingId: string | null): string[] {
  const drafts = readDrafts();
  if (!drafts.length) return [];
  const sigs = readSigs();
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
    const touched = id in sigs && blankSignature(store, id) !== sigs[id];
    if (t && !t.deleted && isBlankBody(t) && !touched) {
      store.deleteTask(id);
      removed.push(id);
    }
  }
  writeDrafts(keep);
  writeSigs(Object.fromEntries(keep.filter((id) => id in sigs).map((id) => [id, sigs[id]!])));
  return removed;
}
