/**
 * 列表页顶部的快速添加（Rei 2026-10-26「从这里添加任务后立即打开任务」；我的一天、待安排、可做都用，组件见 components/QuickAddBar）：
 * 回车建一件任务、放到这一页该放的地方（我的一天放进今天，待安排、可做进待安排），马上选中它——和点列表里一行一样（三列在右列、中等宽度两栏、手机整页推入，hash 写 ?task=id）。
 *
 * 焦点：照详情打开的老规矩，打开详情不抢焦点，也不把光标塞进正文。
 * - 宽屏 / 中等宽度：光标留在添加框里，可以接着写下一件；连着加几件，详情显示最后一件。
 * - 手机：详情整页盖住列表，添加框收起焦点，软键盘随之落下；要写正文再点正文。
 * 新任务滚到看得见的地方；连着加时只滚最后一件。
 */
import { plainTitleMarkdown } from '@mindough/core';
import type { LayoutKind } from '../skin/platform';

export interface QuickAddDeps {
  createTask: (input: { body_md: string; scheduled_date?: string }) => { id: string };
  addToMyDay: (taskId: string, date: string) => void;
  openEditor: (taskId: string | null) => void;
}

/** 建任务（create 负责放到哪）、打开详情。空白不建，返回 null。 */
export function quickAdd(deps: { create: (text: string) => string; openEditor: (taskId: string | null) => void }, text: string): string | null {
  const body = text.trim();
  if (!body) return null;
  // 打的字就是标题：按字面文字存（Rei 2026-11-03「任务标题是纯文本不渲染md」）
  const id = deps.create(plainTitleMarkdown(body));
  deps.openEditor(id);
  return id;
}

/** 我的一天：建任务、放进今天、打开详情。空白不建，返回 null。 */
export function quickAddToday(deps: QuickAddDeps, text: string, today: string, opts: { dateToday?: boolean } = {}): string | null {
  return quickAdd({ create: (body) => createToday(deps, body, today, opts), openEditor: deps.openEditor }, text);
}

/**
 * 我的一天的 create：建任务并放进今天。
 * dateToday（设置 → 任务 → 我的一天「默认日期：今天」，Rei 2026-11-09）：日期也填今天。
 * 这时 Store.createTask 自己会把它放进今天（joinMyDayOnToday），下面的 addToMyDay 找到同一行直接返回，不会多一行。
 */
export function createToday(deps: Pick<QuickAddDeps, 'createTask' | 'addToMyDay'>, body: string, today: string, opts: { dateToday?: boolean } = {}): string {
  const t = deps.createTask({ body_md: body, ...todayDefaults(!!opts.dateToday, today) });
  deps.addToMyDay(t.id, today);
  return t.id;
}

/**
 * 「默认日期：今天」（Rei 2026-11-09）的新建默认值：开着就带上今天的日期，关着什么都不加。
 * 我的一天（设置 → 任务，本机）和项目（group.default_date_today，同步）共用：添加框、按 N 打开的新建面板都走它。
 * 日期是今天的任务 Store.createTask 会自己放进今天的我的一天（joinMyDayOnToday），行 id 由任务 + 日期算，后面再 addToMyDay / 自动加都是同一行。
 */
export function todayDefaults(on: boolean, today: string): { scheduled_date?: string } {
  return on ? { scheduled_date: today } : {};
}

let scrollToken = 0;

/**
 * 加完以后的收尾：手机上让添加框交出焦点（收起软键盘），再把新行滚进视野。
 * 列表要等下一帧才渲染出新行，所以放到 requestAnimationFrame 里；连着加时旧的那次作废。
 */
export function afterQuickAdd(taskId: string, input: HTMLElement | null, layout: LayoutKind, root: ParentNode = document): void {
  if (layout === 'mobile') input?.blur();
  const token = ++scrollToken;
  const scroll = (tries: number) => {
    if (token !== scrollToken) return;
    const row = root.querySelector<HTMLElement>(`.main [data-task-id="${CSS.escape(taskId)}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
    else if (tries > 0) requestAnimationFrame(() => scroll(tries - 1));
  };
  requestAnimationFrame(() => scroll(3));
}
