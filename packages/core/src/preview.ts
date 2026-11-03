/** 任务预览：没有标题，列表里显示 body_md 首行；有类型主字段时用主字段。 */
import { linkLabel } from './links';
import { stripUnderlineTags, stripWithLiterals } from './md-text';
import { formatMoney, moneyOf } from './money';
import { episodeOf, formatEpisode } from './episode';
import type { FieldDef, FieldValue, LinkValue, Task, TaskType } from './types';

import { dataLabel, tr } from './i18n';

/** 把字段值解析成显示文本（如人物字段 person_id → 姓名）。 */
export type FieldResolver = (def: FieldDef, value: FieldValue) => string;


export { UNDERLINE_TAG_RE, escapeTitleLine, plainTitleMarkdown, stripUnderlineTags, stripWithLiterals, unescapeMarkdown } from './md-text';

/** 正文摊成搜索用的文字：去掉下划线标签和反斜杠转义（draw\.io → draw.io），别的照原样。 */
export const searchableMarkdown = (md: string) => stripWithLiterals(md, stripUnderlineTags);

/**
 * 去掉 markdown 行首标记（和下划线标签、反斜杠转义），取第一条非空行。
 * 转义和行内代码先当字面量保护起来（md-text.ts）：`draw\.io` 显示 draw.io，`1\. 不是列表` 不会被当成列表去掉序号，行内代码原样。
 */
export function firstLine(md: string): string {
  for (const raw of md.split(/\r?\n/)) {
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

/** 卡片标题：类型主字段 → 正文首行 → “空白任务”。 */
export function taskTitle(
  task: Pick<Task, 'body_md' | 'type_data'>,
  type?: Pick<TaskType, 'fields'> | null,
  resolve?: FieldResolver,
): string {
  const def = type?.fields.find((f) => f.primary);
  if (def) {
    const raw = task.type_data[def.key];
    const v = raw !== undefined && raw !== null && resolve ? resolve(def, raw) : fieldText(raw);
    if (v) return v;
  }
  return firstLine(task.body_md) || tr('空白任务');
}

/** 卡片副标题：有主字段时显示正文首行。 */
export function taskSubtitle(task: Pick<Task, 'body_md' | 'type_data'>, type?: Pick<TaskType, 'fields'> | null): string {
  const key = primaryFieldKey(type);
  if (key && fieldText(task.type_data[key])) return firstLine(task.body_md);
  return '';
}
