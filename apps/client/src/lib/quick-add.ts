/**
 * 列表页顶部的快速添加（Rei 2026-10-26「从这里添加任务后立即打开任务」；我的一天、待安排、可做都用，组件见 components/QuickAddBar）：
 * 回车建一件任务、放到这一页该放的地方（我的一天放进今天，待安排、可做进待安排），马上选中它——和点列表里一行一样（三列在右列、中等宽度两栏、手机整页推入，hash 写 ?task=id）。
 *
 * 焦点：回车以后光标去哪，看设置 → 任务 →「新建后光标」（Rei 2026-11-13 03:31，电脑和手机一样，取代原来电脑留在框里、手机收键盘的规则）：
 * - input「留在添加框」：可以接着写下一件，连着加几件，详情显示最后一件；手机上键盘也不收。
 * - title「详情标题末尾」（默认）：详情打开、动画放完，光标放到详情第一行（标题）末尾，不全选。
 * - none「不放光标」：添加框交出焦点，详情照常打开、不抢焦点，手机键盘收起。
 * 存在同步的偏好 tasks.new_task_focus（跟着账户走，各设备一样）。
 * 新任务滚到看得见的地方；连着加时只滚最后一件。
 */
import { plainTitleMarkdown, type FieldValue } from '@mindough/core';

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

/** 「新建后光标」的三种（Rei 2026-11-13 03:31）。 */
export const NEW_TASK_FOCUS = ['input', 'title', 'none'] as const;
export type NewTaskFocus = (typeof NEW_TASK_FOCUS)[number];
/** 同步偏好的键；没设过就是默认「详情标题末尾」。 */
export const NEW_TASK_FOCUS_PREF = 'tasks.new_task_focus';
export const NEW_TASK_FOCUS_DEFAULT: NewTaskFocus = 'title';

export function normalizeNewTaskFocus(v: FieldValue | undefined): NewTaskFocus {
  return typeof v === 'string' && (NEW_TASK_FOCUS as readonly string[]).includes(v) ? (v as NewTaskFocus) : NEW_TASK_FOCUS_DEFAULT;
}

// 光标进详情标题末尾：回车那一下记住 id，详情的正文编辑器挂上时取（3 秒内有效：编辑器第一次要按需加载，React 严格模式重复挂载也认）
let titleReq: { id: string; at: number } | null = null;

export function wantsTitleFocus(id: string): boolean {
  return !!titleReq && titleReq.id === id && Date.now() - titleReq.at < 3000;
}

/**
 * 等 el 外面（含它自己）正在放的动画放完：手机详情整页推入（page-push 0.26s）、详情浮层升起（rise 0.2s）。
 * 宽屏右列没有动画，马上就好。最多等 maxMs，动画被取消也算完。
 */
export function waitForMotion(el: Element, maxMs = 800): Promise<void> {
  const doc = el.ownerDocument;
  const all = typeof doc.getAnimations === 'function' ? doc.getAnimations() : [];
  const mine = all.filter((a) => {
    const t = (a.effect as KeyframeEffect | null)?.target;
    return !!t && a.playState === 'running' && (t === el || t.contains(el));
  });
  if (!mine.length) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, maxMs);
    void Promise.all(mine.map((a) => a.finished.catch(() => undefined))).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

let scrollToken = 0;

/**
 * 加完以后的收尾：按「新建后光标」放焦点，再把新行滚进视野。
 * - input：什么都不动，焦点本来就在添加框；
 * - title：记下要把光标放进这件的详情标题末尾（TaskDetail 读 wantsTitleFocus）；焦点先留在添加框，详情编辑器拿走时手机键盘不会先收再弹；
 * - none：添加框交出焦点（手机收起软键盘）。
 * 列表要等下一帧才渲染出新行，所以放到 requestAnimationFrame 里；连着加时旧的那次作废。
 */
export function afterQuickAdd(taskId: string, input: HTMLElement | null, focus: NewTaskFocus, root: ParentNode = document): void {
  if (focus === 'none') input?.blur();
  titleReq = focus === 'title' ? { id: taskId, at: Date.now() } : null;
  const token = ++scrollToken;
  const scroll = (tries: number) => {
    if (token !== scrollToken) return;
    const row = root.querySelector<HTMLElement>(`.main [data-task-id="${CSS.escape(taskId)}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
    else if (tries > 0) requestAnimationFrame(() => scroll(tries - 1));
  };
  requestAnimationFrame(() => scroll(3));
}
