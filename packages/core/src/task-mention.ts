/**
 * 正文里 @ 提及任务（Rei 2026-11-10「任务编辑器、日记编辑器中可以用@选择任务，日记中可@任务和倒数日」）。
 *
 * 存法：正文还是 markdown，提及写成一条普通链接 `[标题](mindough://task/<任务id>)`。
 * - 地址就是 DEEPLINKS.md 里的任务深链，老客户端、别的编辑器看到的是一条能点的链接，不会坏。
 * - 方括号里的标题只是备用的字：新客户端显示时按 id 取这件任务现在的标题，改了名胶囊跟着变；
 *   编辑器写回时顺手换成当时的标题。搜索、⌘F、复制都按这段字算。
 *
 * 能 @ 谁：
 * - 任务正文里：普通任务（勾选完成、不重复），不列打卡、倒数日，也不列这件任务自己。
 * - 日记里：普通任务和倒数日（完成方式是倒数日的任务）。
 * - 删掉的不列；完成、关闭的排在后面，标「已结束」。
 */
import { isFinished, type Task } from './types';
import { isCheckInTask } from './checkin';
import { taskMatchRank, taskTextMatches } from './task-match';

/** 提及的地址前缀（任务深链）。 */
export const MENTION_PREFIX = 'mindough://task/';

/** 任务 id → 提及的地址。 */
export const mentionHref = (id: string) => `${MENTION_PREFIX}${id}`;

/** 地址是不是提及：是就返回任务 id。id 只收字母、数字和连字符（uuid），后面不能再带路径、参数。 */
export function mentionIdOf(href: string | null | undefined): string | null {
  if (!href) return null;
  const m = /^mindough:\/\/task\/([0-9a-z-]{8,64})\/?$/i.exec(href.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** 在哪个编辑器里 @：任务正文、日记。 */
export type MentionScope = 'task' | 'journal';

/** 提及的是哪种：普通任务、倒数日。 */
export type MentionKind = 'task' | 'countdown';

/** 任务算哪种；打卡（重复、计时、计数）返回 null。 */
export function mentionKind(t: Pick<Task, 'completion_mode' | 'recurrence'>): MentionKind | null {
  if (t.completion_mode === 'countdown') return 'countdown';
  return isCheckInTask(t) ? null : 'task';
}

/** 这个编辑器里能不能 @ 它。 */
export function mentionable(t: Pick<Task, 'completion_mode' | 'recurrence' | 'deleted'>, scope: MentionScope): boolean {
  if (t.deleted) return false;
  const k = mentionKind(t);
  return k === 'task' || (k === 'countdown' && scope === 'journal');
}

export interface MentionCandidate {
  id: string;
  title: string;
  kind: MentionKind;
  /** 完成或关闭了。 */
  ended: boolean;
}

export interface MentionQuery {
  scope: MentionScope;
  /** 正在编辑的这件任务（任务正文里不列自己）。 */
  selfId?: string | null;
  /** @ 后面打的字；空 = 全部。 */
  query: string;
  /** 任务的标题（和列表行一样：正文第一行去掉 markdown）。 */
  titleOf: (t: Task) => string;
  /** 最多列几条（默认 50）。 */
  limit?: number;
}

/**
 * 候选：按标题搜（不分大小写、空格不算、拼音首字母 / 全拼，和挑任务、⌘F 同一套 taskTextMatches），不搜正文。
 * 顺序：没结束的在前；同一组里标题以搜索词开头 > 标题包含 > 拼音对上；再按最近改过的在前。
 */
export function mentionCandidates(tasks: readonly Task[], q: MentionQuery): MentionCandidate[] {
  const term = q.query.trim();
  const out: (MentionCandidate & { rank: number; at: string })[] = [];
  for (const t of tasks) {
    if (t.id === q.selfId || !mentionable(t, q.scope)) continue;
    const title = q.titleOf(t);
    if (term && !taskTextMatches(title, '', term)) continue;
    out.push({ id: t.id, title, kind: mentionKind(t)!, ended: isFinished(t.status), rank: term ? taskMatchRank(title, term) : 0, at: t.updated_at });
  }
  out.sort((a, b) => Number(a.ended) - Number(b.ended) || a.rank - b.rank || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return out.slice(0, q.limit ?? 50).map(({ id, title, kind, ended }) => ({ id, title, kind, ended }));
}

/**
 * 光标前面这段字里有没有正在打的 @：返回 @ 在这段里的位置和后面的搜索词。
 * - 全角 ＠ 也算。@ 前面是字母、数字（邮箱 a@b.com）不算；行首、空格、标点、汉字后面都算。
 * - 搜索词不含空格和另一个 @，最多 32 个字；打了空格就收起。
 */
export function mentionQueryAt(textBefore: string): { at: number; query: string } | null {
  const m = /(^|[^A-Za-z0-9_])([@＠])([^\s@＠]{0,32})$/u.exec(textBefore);
  if (!m) return null;
  return { at: m.index + m[1]!.length, query: m[3]! };
}
