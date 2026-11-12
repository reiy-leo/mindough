/**
 * 打卡正文存档（Rei 2026-11-13 05:01「打卡任务 每次任务完成时 如果有内容（除了标题外），则新建一个完成的前置任务，
 * 打卡任务中的内容被移动到这个前置任务中，打卡重复任务的内容部分清空。」）。
 *
 * 纯规则都在这里：正文怎么拆成标题和其余内容、什么算「有内容」、新任务的正文和 id。
 * 写入在 Store.checkIn / undoCheckIn（archiveCheckInBody / retractCheckInArchive）。
 */
import type { DateKey } from './types';

/** 空行和空段落不算内容：只有空白、编辑器写出的空段落 `<br />`、`&nbsp;`、单个反斜杠（硬换行）的行。 */
export function isBlankBodyLine(line: string): boolean {
  const s = line.trim();
  if (!s) return true;
  if (/^<br\s*\/?\s*>$/i.test(s)) return true;
  return /^(?:&nbsp;|\u00a0|\\)+$/.test(s);
}

export interface SplitBody {
  /** 标题行（原样的 markdown，第一条不是空行 / 空段落的行）；没有就是空字符串。 */
  title: string;
  /** 标题下面的内容，去掉首尾空行；全是空行 / 空段落时是空字符串。 */
  rest: string;
}

/** 把打卡正文拆成标题行和其余内容。 */
export function splitCheckInBody(md: string): SplitBody {
  const lines = (md ?? '').split(/\r?\n/);
  const at = lines.findIndex((l) => !isBlankBodyLine(l));
  if (at < 0) return { title: '', rest: '' };
  const after = lines.slice(at + 1);
  let a = 0;
  let b = after.length;
  while (a < b && isBlankBodyLine(after[a]!)) a++;
  while (b > a && isBlankBodyLine(after[b - 1]!)) b--;
  return { title: lines[at]!, rest: after.slice(a, b).join('\n') };
}

/** 标题下面有没有内容（空行、空段落不算）。 */
export function hasBodyBelowTitle(md: string): boolean {
  return !!splitCheckInBody(md).rest;
}

/**
 * 存档任务的标题：打卡标题 + 「 · 」+ 节点日期（这次打卡算哪天，补打卡就是被补的那天），如「读书 · 2026-11-13」。
 * 日期写成 YYYY-MM-DD：写进正文就固定了，不跟界面语言变，换了语言也读得懂。打卡没标题时只写日期。
 */
export function archiveTitle(title: string, node: DateKey): string {
  const t = title.trim();
  return t ? `${t} · ${node}` : node;
}

/** 存档任务的正文：标题一行，空一行，接原来标题下面的内容。 */
export function archiveBody(title: string, node: DateKey, rest: string): string {
  const head = archiveTitle(title, node);
  return rest ? `${head}\n\n${rest}` : head;
}

/** 撤回存档时，内容接回打卡正文末尾（打卡正文里后来又写了字也留着，空一行接上）。 */
export function restoreCheckInBody(current: string, rest: string): string {
  if (!rest) return current;
  const cur = (current ?? '').replace(/\s+$/, '');
  return cur ? `${cur}\n\n${rest}` : rest;
}

function fnv(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function stableId(key: string): string {
  const hex = [fnv(key), fnv(key, 0x01234567), fnv(key, 0x89abcdef), fnv(key, 0x2468ace0)].map((n) => n.toString(16).padStart(8, '0')).join('');
  return `00000000-${hex.slice(0, 4)}-7${hex.slice(5, 8)}-8${hex.slice(9, 12)}-${hex.slice(12, 24)}`;
}

/**
 * 存档任务的 id：由「打卡 + 节点 + 第几条」算出来。两台设备离线各自在同一个节点达标，生成的是同一行，同步后只剩一条。
 * 同一个节点撤销后又达标（又写了新内容）用下一个序号；被撤回 / 删掉的那条（墓碑）可以再用。
 */
export function checkInArchiveId(taskId: string, node: string, n = 1): string {
  return stableId(`ci_archive\u0000${taskId}\u0000${node}\u0000${n}`);
}

/** 存档任务 → 打卡的前后关系行 id。 */
export function checkInArchiveDepId(archiveId: string): string {
  return stableId(`ci_archive_dep\u0000${archiveId}`);
}

/** 一个节点最多找几条序号（防呆，正常一两条）。 */
export const MAX_ARCHIVES_PER_NODE = 200;
