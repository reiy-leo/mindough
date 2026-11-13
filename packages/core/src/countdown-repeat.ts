/**
 * 重复的倒数日（Rei 2026-11-12 03:21「倒数日如果是重复任务，过了日期就生成一个过期任务，作为这个重复任务的前置任务」）。
 *
 * - 倒数日（completion_mode = countdown）设了重复规则（task.recurrence）：target_date 是「当前那次」。
 *   目标日当天还显示「今天」；第二天起把 target_date 滚到规则的下一次（今天或以后最近的一次）。
 * - 每滚过一次，生成一条不重复的倒数日当那次的记录：正文只有第一行（标题）、同资料库类型、类型、项目、卡片颜色、时区，
 *   target_date = 过去那天，状态「待办」（Rei 2026-11-13 08:38「错过的倒数日不要直接设置成"已完成"」；以前写「完成」、done_at = 那天中午），
 *   用 FS 前后关系连成重复倒数日的前置。这条前后关系不挡重复倒数日（isCountdownRecordEdge，Store.blockingEdges）。
 *   好久没开 app、漏了好几次，就每次一条（最多 MAX_RECORDS 条，取最近的）。
 * - 多设备：记录的 id 和前后关系的 id 都由「重复倒数日 id + 那天」算出来（countdownRecordId / countdownRecordDepId），
 *   两台设备各滚一遍写的是同一行，同步按 LWW 只剩一条。老客户端看到的记录就是普通倒数日。
 * - 不滚：删了的、完成 / 关闭的、归档的（archived_at）、归档项目里的。严格模式下照样滚，但不生成记录（Store 决定）。
 * - 打卡页、补打卡、今天要打卡都不算它（checkin.ts habitRule）。
 */
import { addDays } from './dates';
import { alignRecurrence, formatRecurrence, nextOccurrence, occurrences, parseRecurrence, type Recurrence } from './recurrence';
import type { DateKey, Task } from './types';

/** 一次最多补几条记录（每天重复、一年多没开 app 时不至于一下写几百行）。 */
export const MAX_RECORDS = 400;

type CdTask = Pick<Task, 'completion_mode' | 'recurrence' | 'target_date'>;

/** 是重复的倒数日吗（规则看得懂才算；老客户端看不懂的规则当不重复）。 */
export function isRecurringCountdown(t: Pick<Task, 'completion_mode' | 'recurrence'>): boolean {
  return t.completion_mode === 'countdown' && !!parseRecurrence(t.recurrence);
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

/** UUID 形状的确定 id（版本位 7、时间戳段为 0，和 taskLinkId、prefId 同一种写法）。 */
function stableId(key: string): string {
  const hex = [fnv(key), fnv(key, 0x01234567), fnv(key, 0x89abcdef), fnv(key, 0x2468ace0)].map((n) => n.toString(16).padStart(8, '0')).join('');
  return `00000000-${hex.slice(0, 4)}-7${hex.slice(5, 8)}-8${hex.slice(9, 12)}-${hex.slice(12, 24)}`;
}

/** 重复倒数日 taskId 在 date 那次的记录 id。 */
export function countdownRecordId(taskId: string, date: DateKey): string {
  return stableId(`cd_record\u0000${taskId}\u0000${date}`);
}

/** 那条记录 → 重复倒数日的前后关系行 id。 */
export function countdownRecordDepId(taskId: string, date: DateKey): string {
  return stableId(`cd_record_dep\u0000${taskId}\u0000${date}`);
}

export interface CountdownRoll {
  /** 过去了的那几次（从早到晚），每次一条记录。 */
  past: DateKey[];
  /** 新的 target_date（今天或以后最近的一次）。 */
  next: DateKey;
}

/**
 * 要不要滚、滚到哪：目标日早于 today 才滚（当天还是「今天」）。
 * 过去的几次 = 原来的目标日 + 它之后、今天之前规则上的每一次；新的目标日 = 今天或以后最近的一次。
 * 规则看不懂、找不到下一次（农历超出范围）返回 null，不动。
 */
export function planCountdownRoll(t: CdTask, today: DateKey): CountdownRoll | null {
  if (t.completion_mode !== 'countdown' || !t.target_date || t.target_date >= today) return null;
  const r = parseRecurrence(t.recurrence);
  if (!r) return null;
  const next = nextOccurrence(r, today);
  if (!next) return null;
  const between = occurrences(r, addDays(t.target_date, 1), addDays(today, -1));
  const past = [t.target_date, ...between];
  return { past: past.length > MAX_RECORDS ? past.slice(-MAX_RECORDS) : past, next };
}

/**
 * 改重复倒数日的目标日或规则时一起收拾（Store.createTask / updateTask 调；只看倒数日、规则看得懂的）：
 * - 改了目标日：规则跟着落到这天（alignRecurrence：每年换月日、每月换几号…）。
 * - 目标日要落在规则上、而且不早于今天：从「目标日和今天里晚的那天」起找规则的下一次。
 *   所以给重复倒数日选了一个过去的日子（生日填出生那天），目标日直接变成今年或明年那天，不会补出一串记录；
 *   改了规则（每月 20 号 → 5 号）目标日挪到新规则的下一次。
 * 返回要补进 patch 的字段（没有要改的返回空对象）。
 */
export function normalizeCountdownRepeat(cur: CdTask | null, patch: Partial<CdTask>, today: DateKey): Partial<CdTask> {
  const next: CdTask = {
    completion_mode: patch.completion_mode ?? cur?.completion_mode ?? 'once',
    recurrence: patch.recurrence !== undefined ? patch.recurrence : (cur?.recurrence ?? null),
    target_date: patch.target_date !== undefined ? patch.target_date : (cur?.target_date ?? null),
  };
  if (next.completion_mode !== 'countdown' || !next.target_date) return {};
  let r: Recurrence | null = parseRecurrence(next.recurrence);
  if (!r) return {};
  const out: Partial<CdTask> = {};
  const dateChanged = patch.target_date !== undefined && patch.target_date !== (cur?.target_date ?? null);
  const ruleChanged = patch.recurrence !== undefined && patch.recurrence !== (cur?.recurrence ?? null);
  if (dateChanged && !ruleChanged) {
    const aligned = alignRecurrence(r, next.target_date);
    if (aligned !== r) {
      r = aligned;
      const rule = formatRecurrence(r);
      if (rule !== next.recurrence) out.recurrence = rule;
    }
  }
  if (!dateChanged && !ruleChanged) return out;
  const from = next.target_date > today ? next.target_date : today;
  const target = nextOccurrence(r, from);
  if (target && target !== next.target_date) out.target_date = target;
  return out;
}

/**
 * 倒数日只认 target_date（倒数日页、日历、提醒都看它）。有日期的任务改成倒数日（日历格子「+」建的任务、详情里切完成方式），
 * 日期在 scheduled_date 里、target_date 空着：倒数日页、日历都不列它，再加上重复，详情里的日期胶囊也藏起来，整条就「不见了」
 * （Rei 2026-11-12 07:57「我新建了一个前天的倒数日，添加了每年重复，这个倒数日不见了」）。
 * 所以倒数日没有目标日、却有日期时，把日期挪成目标日（日期段取开始那天），scheduled_date / end_date 清空，只留一个日子。
 * 返回要补进 patch 的字段（不用改返回空对象）。Store.createTask / updateTask 在 normalizeCountdownRepeat 之前调，
 * 打开时 Store.repairCountdownDates 也用它修已经变成这样的旧数据。
 */
export function fillCountdownTarget(
  cur: Pick<Task, 'completion_mode' | 'target_date' | 'scheduled_date'> | null,
  patch: Partial<Pick<Task, 'completion_mode' | 'target_date' | 'scheduled_date'>>,
): Partial<Pick<Task, 'target_date' | 'scheduled_date' | 'end_date'>> {
  const mode = patch.completion_mode ?? cur?.completion_mode ?? 'once';
  const target = patch.target_date !== undefined ? patch.target_date : (cur?.target_date ?? null);
  const date = patch.scheduled_date !== undefined ? patch.scheduled_date : (cur?.scheduled_date ?? null);
  if (mode !== 'countdown' || target || !date) return {};
  return { target_date: date, scheduled_date: null, end_date: null };
}

/**
 * 这条前后关系是不是「那次的记录 → 重复倒数日」（Store.writeCountdownRecord 写的）：前置是倒数日、有目标日，
 * id 恰好是 countdownRecordId(后续, 前置的目标日)。这种关系不挡后续（Store.blockingEdges）：记录现在是待办，
 * 要是照常挡，重复倒数日会一直「还在等 N 件事」，点完一条记录还会被当成「刚解锁」放进我的一天。
 */
export function isCountdownRecordEdge(e: { succ_id: string }, pred: Pick<Task, 'id' | 'completion_mode' | 'target_date'> | null | undefined): boolean {
  return !!pred && pred.completion_mode === 'countdown' && !!pred.target_date && pred.id === countdownRecordId(e.succ_id, pred.target_date);
}

/**
 * 老版本自动写的完成时间吗（迁移 Store.restoreAutoDoneCountdownRecords 用）：老版本生成记录时 done_at = recordDoneAt(那天)，
 * 即生成那台设备本机时区的那天 12:00:00.000。换算成 UTC 是整分钟，离「那天 UTC 中午」不超过 14 小时（时区偏移 −12 到 +14）。
 * 手动点完成写的是点的那一刻（老记录本来就是完成，要先重新打开再点），几乎不会恰好落在整分钟的 0 秒 0 毫秒上。
 */
export function isAutoRecordDoneAt(doneAt: string | null | undefined, date: DateKey): boolean {
  if (!doneAt) return false;
  if (doneAt === recordDoneAt(date)) return true;
  const ms = Date.parse(doneAt);
  if (!Number.isFinite(ms) || ms % 60_000 !== 0) return false;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const noonUtc = Date.UTC(y, m - 1, d, 12, 0, 0);
  return Math.abs(ms - noonUtc) <= 14 * 3600_000;
}

/** 那次记录的完成时间：那天本机中午（老版本生成记录时用；现在只用来认出老版本自动写的完成，见 isAutoRecordDoneAt）。 */
export function recordDoneAt(date: DateKey): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/** 正文第一行（记录只抄标题）。 */
export function bodyFirstLine(body: string): string {
  return (body ?? '').split('\n')[0] ?? '';
}

