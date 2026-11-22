/**
 * 任务预览：任务没有单独的标题字段，标题 = 正文第一行（Rei 2026-11-03「任何任务的第一行都是标题」）。
 * 挂了资料的任务也一样，资料名不再当标题；资料只在列表里显示缩略图。
 */
import { linkLabel } from './links';
import { escapeTitleLine, stripUnderlineTags, stripWithLiterals, unescapeMarkdown } from './md-text';
import { formatMoney, moneyOf } from './money';
import { episodeOf, formatEpisode } from './episode';
import type { FieldDef, FieldValue, LinkValue, Task, TaskType } from './types';

import { dataLabel, tr } from './i18n';
import { isBlankBodyLine } from './checkin-archive';

/** 把字段值解析成显示文本（如人物字段 person_id → 姓名）。 */
export type FieldResolver = (def: FieldDef, value: FieldValue) => string;


export { UNDERLINE_TAG_RE, escapeTitleLine, plainTitleMarkdown, stripUnderlineTags, stripWithLiterals, unescapeMarkdown } from './md-text';

/** 正文摊成搜索用的文字：去掉下划线标签和反斜杠转义（draw\.io → draw.io），别的照原样。 */
export const searchableMarkdown = (md: string) => stripWithLiterals(md, stripUnderlineTags);

/**
 * 去掉 markdown 行首标记（和下划线标签、反斜杠转义），取第一条非空行。
 * 转义和行内代码先当字面量保护起来（md-text.ts）：`draw\.io` 显示 draw.io，`1\. 不是列表` 不会被当成列表去掉序号，行内代码原样。
 * 空段落（`<br />`、`&nbsp;`、单个反斜杠，见 isBlankBodyLine）也算空行跳过，不会拿「<br />」当文字。
 */
export function firstLine(md: string): string {
  for (const raw of md.split(/\r?\n/)) {
    if (isBlankBodyLine(raw)) continue;
    const line = stripWithLiterals(raw, (s) =>
      stripUnderlineTags(s)
        .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/, '')
        .replace(/[*_`~]/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'),
    ).trim();
    if (line) return line;
  }
  return '';
}

export function fieldText(v: FieldValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !Array.isArray(v)) {
    if ('amount' in v) {
      const m = moneyOf(v);
      return m ? formatMoney(m) : '';
    }
    const e = episodeOf(v);
    return e ? formatEpisode(e) : '';
  }
  if (Array.isArray(v)) return (v as Array<string | LinkValue>).map((x) => (typeof x === 'string' ? dataLabel(x) : x && typeof x === 'object' ? linkLabel(x) : '')).filter(Boolean).join(tr('、'));
  // 选项值（电影 / 剧集、PC（Steam）…）是存着的中文，显示按当前语言
  return typeof v === 'string' ? dataLabel(v) : String(v);
}

export function primaryFieldKey(type: Pick<TaskType, 'fields'> | null | undefined): string | null {
  return type?.fields.find((f) => f.primary)?.key ?? null;
}

export function mediaFieldKey(type: Pick<TaskType, 'fields'> | null | undefined): string | null {
  return type?.fields.find((f) => f.media)?.key ?? null;
}

/**
 * 没标题（正文第一行空）时显示的占位，只显示、不写进正文（Rei 2026-11-12 09:33 / 09:34）：
 * 倒数日「未命名倒数日」，别的任务「未提供描述」；同一类里有好几条时按创建时间编号，第一条不带数字，后面「…2」「…3」。
 * 编号由 Store.titleOfTask 算（要看全部任务）；这里 n 不给就是不带数字的那个。
 */
export function untitledLabel(countdown: boolean, n = 1): string {
  if (countdown) return n > 1 ? tr('未命名倒数日{n}', { n }) : tr('未命名倒数日');
  return n > 1 ? tr('未提供描述{n}', { n }) : tr('未提供描述');
}

/**
 * 第一行空着、下面还有内容（Rei 2026-11-22 18:26「这种情况的话，标题显示"未命名标题" 然后加上时间戳」）：
 * 第一行是空行或空段落（isBlankBodyLine：空白、`<br />`、`&nbsp;`、单个反斜杠），后面至少有一行不是空的（图片、链接也算）。
 * 正文全空的不算，照旧用 untitledLabel。
 */
export function hasBlankTitleLine(md: string): boolean {
  const lines = (md ?? '').split(/\r?\n/);
  return lines.length > 1 && isBlankBodyLine(lines[0]!) && lines.slice(1).some((l) => !isBlankBodyLine(l));
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 时间点按本机时区写成 YYYY-MM-DD HH:mm（「未命名标题」后面那段）；解析不了返回空字符串。 */
export function localStamp(at: string | Date | null | undefined): string {
  if (!at) return '';
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 第一行空着时的标题：「未命名标题 2026-11-22 18:26」，时间是任务的创建时间（本机时区）。只显示，不写进正文、不入库。
 * 时间各语言都写 YYYY-MM-DD HH:mm（和打卡存档标题的日期一样，换了语言也读得懂），前面的字按语言翻。没有创建时间就只写「未命名标题」。
 */
export function blankTitleLabel(createdAt: string | null | undefined): string {
  const time = localStamp(createdAt);
  return time ? tr('未命名标题 {time}', { time }) : tr('未命名标题');
}

/**
 * 任务标题：第一行空着、下面有内容 → 「未命名标题 + 创建时间」（blankTitleLabel）；
 * 否则正文第一行（去掉 markdown 记号）→ 没有就是占位（untitledLabel，不带编号）。
 * 界面上要带编号的用 Store.titleOfTask；core 的搜索、提醒等不带编号的地方用它。
 */
export function taskTitle(task: Pick<Task, 'body_md'> & Partial<Pick<Task, 'completion_mode' | 'created_at'>>): string {
  if (hasBlankTitleLine(task.body_md)) return blankTitleLabel(task.created_at);
  return firstLine(task.body_md) || untitledLabel(task.completion_mode === 'countdown');
}

/**
 * 2026-11-03 之前，类型有主字段（影视、游戏…）的任务标题是资料名（主字段的值）。迁移和新建时补第一行用：
 * 返回那时的标题来源；没有主字段或主字段空着返回 ''。
 */
export function itemTitleOf(
  task: Pick<Task, 'type_data'>,
  type?: Pick<TaskType, 'fields'> | null,
  resolve?: FieldResolver,
): string {
  const def = type?.fields.find((f) => f.primary);
  if (!def) return '';
  const raw = task.type_data[def.key];
  return (raw !== undefined && raw !== null && resolve ? resolve(def, raw) : fieldText(raw)).trim();
}

/** 一行是不是「纯文字标题」的存法（escapeTitleLine 写出来的样子）：读成文字再转义一遍，和原来一字不差。 */
export function isPlainTitleLine(line: string): boolean {
  const l = line.trim();
  return !!l && escapeTitleLine(unescapeMarkdown(l)) === l;
}

/**
 * 正文缺不缺标题行：第一条非空行不是纯文字（空、`## 想看理由`、列表、引用、带格式…）就算缺。
 * 新客户端写的正文第一行总是纯文字（编辑器 plainTitle），所以缺标题行的只会是旧客户端写的、或空正文。
 */
export function needsTitleLine(md: string): boolean {
  const first = md.split(/\r?\n/).find((l) => l.trim());
  return first === undefined || !isPlainTitleLine(first);
}

/** 把 name 当第一行（按纯文字转义）放到正文最前面，原来的内容空一行接在后面。 */
export function withTitleLine(md: string, name: string): string {
  const head = escapeTitleLine(name);
  if (!head) return md;
  const rest = md.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, '');
  return rest ? `${head}\n\n${rest}` : head;
}

/** 挂了资料的任务新建时的正文：资料名当第一行（纯文字），下面接库的正文模板（Rei 2026-11-03）。新建面板和 createTask 共用。 */
export function itemTaskBody(name: string, template: string | null | undefined): string {
  return withTitleLine(template ? dataLabel(template) : '', name);
}
