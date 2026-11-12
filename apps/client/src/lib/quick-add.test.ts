// @vitest-environment happy-dom
/**
 * 我的一天快速添加后立即打开（Rei 2026-10-26「从这里添加任务后立即打开任务」）：
 * 建好、进今天（待安排 / 可做页进待安排）、选中；空白不建；连着加以最后一件为准；新行滚进视野。
 * 回车后光标去哪按设置「新建后光标」（Rei 2026-11-13 03:31，电脑和手机一样）：留在添加框 / 详情标题末尾（默认）/ 不放。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterQuickAdd, NEW_TASK_FOCUS_DEFAULT, normalizeNewTaskFocus, quickAdd, quickAddToday, todayDefaults, waitForMotion, wantsTitleFocus, type QuickAddDeps } from './quick-add';

function deps() {
  let n = 0;
  const log: string[] = [];
  const d: QuickAddDeps & { log: string[]; opened: (string | null)[] } = {
    log,
    opened: [],
    createTask: (i) => {
      const id = `t${++n}`;
      log.push(`create ${id} ${i.body_md}${i.scheduled_date ? ` @${i.scheduled_date}` : ''}`);
      return { id };
    },
    addToMyDay: (id, date) => log.push(`myday ${id} ${date}`),
    openEditor: (id) => {
      log.push(`open ${id}`);
      d.opened.push(id);
    },
  };
  return d;
}

describe('quickAddToday', () => {
  it('建任务、放进今天，再打开它', () => {
    const d = deps();
    expect(quickAddToday(d, '  买牛奶  ', '2026-10-26')).toBe('t1');
    expect(d.log).toEqual(['create t1 买牛奶', 'myday t1 2026-10-26', 'open t1']);
  });

  it('「默认日期：今天」开着：日期填今天，照样放进今天一次（Rei 2026-11-09）', () => {
    const d = deps();
    expect(quickAddToday(d, '买牛奶', '2026-11-09', { dateToday: true })).toBe('t1');
    expect(d.log).toEqual(['create t1 买牛奶 @2026-11-09', 'myday t1 2026-11-09', 'open t1']);
  });

  it('todayDefaults：开着带今天，关着什么都不加', () => {
    expect(todayDefaults(true, '2026-11-09')).toEqual({ scheduled_date: '2026-11-09' });
    expect(todayDefaults(false, '2026-11-09')).toEqual({});
  });

  it('空白不建也不打开', () => {
    const d = deps();
    expect(quickAddToday(d, '   ', '2026-10-26')).toBeNull();
    expect(d.log).toEqual([]);
  });

  it('连着加几件：详情停在最后一件', () => {
    const d = deps();
    quickAddToday(d, '一', '2026-10-26');
    quickAddToday(d, '二', '2026-10-26');
    quickAddToday(d, '三', '2026-10-26');
    expect(d.opened.at(-1)).toBe('t3');
  });
});

describe('quickAdd（待安排、可做）', () => {
  it('交给 create 建（进待安排），再打开它，不碰我的一天', () => {
    const d = deps();
    const id = quickAdd({ create: (b) => d.createTask({ body_md: b }).id, openEditor: d.openEditor }, ' 研究一下新相机 ');
    expect(id).toBe('t1');
    expect(d.log).toEqual(['create t1 研究一下新相机', 'open t1']);
  });

  it('空白不建', () => {
    const create = vi.fn(() => 'x');
    const openEditor = vi.fn();
    expect(quickAdd({ create, openEditor }, '\n  ')).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(openEditor).not.toHaveBeenCalled();
  });
});

describe('afterQuickAdd', () => {
  let frames: FrameRequestCallback[] = [];
  const flush = () => {
    while (frames.length) frames.shift()!(0);
  };
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    document.body.innerHTML = '<main class="main"><input id="add" /><div class="list"></div></main>';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });
  const input = () => document.getElementById('add') as HTMLInputElement;
  const addRow = (id: string) => {
    const row = document.createElement('div');
    row.dataset.taskId = id;
    const spy = vi.fn();
    row.scrollIntoView = spy;
    document.querySelector('.list')!.append(row);
    return spy;
  };

  it('留在添加框（input）：焦点不动，可以接着写，也不记详情聚焦', () => {
    input().focus();
    afterQuickAdd('t1', input(), 'input');
    expect(document.activeElement).toBe(input());
    expect(wantsTitleFocus('t1')).toBe(false);
  });

  it('详情标题末尾（title）：记下这件要聚焦标题，添加框先留着焦点（手机键盘不先收）', () => {
    input().focus();
    afterQuickAdd('t1', input(), 'title');
    expect(wantsTitleFocus('t1')).toBe(true);
    expect(wantsTitleFocus('t2')).toBe(false);
    expect(document.activeElement).toBe(input());
  });

  it('连着加：只有最后一件要聚焦标题；换成别的选项就作废', () => {
    afterQuickAdd('t1', input(), 'title');
    afterQuickAdd('t2', input(), 'title');
    expect(wantsTitleFocus('t1')).toBe(false);
    expect(wantsTitleFocus('t2')).toBe(true);
    afterQuickAdd('t3', input(), 'none');
    expect(wantsTitleFocus('t2')).toBe(false);
    expect(wantsTitleFocus('t3')).toBe(false);
  });

  it('不放光标（none）：添加框交出焦点（手机收起软键盘），也不聚焦详情', () => {
    input().focus();
    afterQuickAdd('t1', input(), 'none');
    expect(document.activeElement).not.toBe(input());
    expect(wantsTitleFocus('t1')).toBe(false);
  });

  it('新行下一帧才出现也能滚到', () => {
    afterQuickAdd('t1', input(), 'input');
    frames.shift()!(0); // 第一帧：行还没渲染
    const spy = addRow('t1');
    flush();
    expect(spy).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('连着加：只滚最后一件', () => {
    const a = addRow('t1');
    const b = addRow('t2');
    afterQuickAdd('t1', input(), 'title');
    afterQuickAdd('t2', input(), 'title');
    flush();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('新建后光标的设置值', () => {
  it('没设过、乱值都按默认「详情标题末尾」', () => {
    expect(NEW_TASK_FOCUS_DEFAULT).toBe('title');
    expect(normalizeNewTaskFocus(undefined)).toBe('title');
    expect(normalizeNewTaskFocus(null)).toBe('title');
    expect(normalizeNewTaskFocus('desktop')).toBe('title');
    expect(normalizeNewTaskFocus(1)).toBe('title');
  });
  it('三个合法值原样', () => {
    expect(normalizeNewTaskFocus('input')).toBe('input');
    expect(normalizeNewTaskFocus('title')).toBe('title');
    expect(normalizeNewTaskFocus('none')).toBe('none');
  });
});

describe('waitForMotion', () => {
  beforeEach(() => {
    // happy-dom 可能没有 document.getAnimations：补一个空的，下面再按需替换
    const d = document as Document & { getAnimations?: () => Animation[] };
    if (typeof d.getAnimations !== 'function') d.getAnimations = () => [];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  const fake = (target: Element, finished: Promise<unknown>, playState = 'running') => ({ effect: { target }, playState, finished }) as unknown as Animation;

  it('外面没动画：马上好', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    vi.spyOn(document, 'getAnimations').mockReturnValue([]);
    await expect(waitForMotion(el)).resolves.toBeUndefined();
  });

  it('等外层（详情整页推入）的动画放完，不等无关的', async () => {
    const page = document.createElement('div');
    const el = document.createElement('div');
    page.append(el);
    const other = document.createElement('div');
    document.body.append(page, other);
    let done!: () => void;
    const pushed = new Promise<void>((r) => (done = r));
    vi.spyOn(document, 'getAnimations').mockReturnValue([fake(page, pushed), fake(other, new Promise(() => {}))]);
    let ok = false;
    const p = waitForMotion(el).then(() => (ok = true));
    await Promise.resolve();
    expect(ok).toBe(false);
    done();
    await p;
    expect(ok).toBe(true);
  });

  it('动画一直不完：最多等 maxMs', async () => {
    vi.useFakeTimers();
    const page = document.createElement('div');
    const el = document.createElement('div');
    page.append(el);
    document.body.append(page);
    vi.spyOn(document, 'getAnimations').mockReturnValue([fake(page, new Promise(() => {}))]);
    let ok = false;
    const p = waitForMotion(el, 500).then(() => (ok = true));
    await vi.advanceTimersByTimeAsync(499);
    expect(ok).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(ok).toBe(true);
  });
});
