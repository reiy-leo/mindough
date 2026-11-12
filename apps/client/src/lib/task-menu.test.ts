import { describe, expect, it } from 'vitest';
import { detailMenu } from './task-menu';

const ids = (m: ReturnType<typeof detailMenu>) => m.map((e) => (e.separator ? `|${e.id}` : e.id)).join(' ');

describe('任务详情「…」菜单（关闭挪进菜单，Rei 2026-10-17）', () => {
  it('没做完的普通任务：我的一天 | 关闭 | 删除', () => {
    const m = detailMenu({ status: '待办', recurrence: null, completion_mode: 'once' }, false);
    expect(ids(m)).toBe('myday pin |close |delete');
    expect(m.find((e) => e.id === 'close')!.label).toBe('关闭');
    expect(m[0]!.label).toBe('加入我的一天');
    expect(m.at(-1)).toMatchObject({ id: 'delete', danger: true });
  });
  it('计时 / 计数任务多一项「直接标为完成」，放在关闭前面、同一组', () => {
    expect(ids(detailMenu({ status: '进行中', recurrence: null, completion_mode: 'timer' }, true))).toBe('myday pin |done close |delete');
    expect(detailMenu({ status: '待办', recurrence: null, completion_mode: 'count' }, true)[0]!.label).toBe('移出我的一天');
  });
  it('重复的倒数日不是打卡（Rei 2026-11-12）：照倒数日，直接标为完成 · 关闭，没有归档', () => {
    const m = detailMenu({ status: '待办', recurrence: 'FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=12', completion_mode: 'countdown' }, false);
    expect(ids(m)).toBe('myday pin |done close |delete');
    expect(m.find((e) => e.id === 'close')!.label).toBe('关闭');
  });
  it('定期打卡：关闭叫「不再打卡」，后面是「归档」，没有直接标为完成', () => {
    const m = detailMenu({ status: '待办', recurrence: 'FREQ=DAILY', completion_mode: 'timer' }, false);
    expect(ids(m)).toBe('myday pin |close archive |delete');
    expect(m[3]!.label).toBe('归档');
    expect(m[2]!.label).toBe('不再打卡');
  });
  it('已关闭 / 已完成的任务：换成「重新打开」（打卡叫「恢复打卡」）', () => {
    expect(ids(detailMenu({ status: '关闭', recurrence: null, completion_mode: 'once' }, false))).toBe('myday pin |reopen |delete');
    expect(detailMenu({ status: '完成', recurrence: null, completion_mode: 'once' }, false)[2]!.label).toBe('重新打开');
    expect(detailMenu({ status: '关闭', recurrence: 'FREQ=DAILY', completion_mode: 'once' }, false)[2]!.label).toBe('恢复打卡');
  });
});

describe('任务列表行的右键 / 长按菜单（Rei 2026-10-25）', () => {
  it('查看详情 | 加入 / 移出我的一天', async () => {
    const { rowMenu } = await import('./task-menu');
    expect(rowMenu(false).map((e) => (e.separator ? `|${e.id}` : e.id)).join(' ')).toBe('open |myday pin');
    expect(rowMenu(false)[1]!.label).toBe('加入我的一天');
    expect(rowMenu(true)[1]!.label).toBe('移出我的一天');
    expect(rowMenu(true)[0]!.label).toBe('查看详情');
  });
});

describe('打卡归档（Rei 2026-11-02）', () => {
  it('归档了的打卡：只有「取消归档」和删除，不再给我的一天、不再打卡', () => {
    const m = detailMenu({ status: '待办', recurrence: 'FREQ=DAILY', completion_mode: 'once', archived_at: '2026-11-02T01:00:00.000Z' }, false);
    expect(ids(m)).toBe('unarchive |delete');
    expect(m[0]!.label).toBe('取消归档');
  });
  it('结束了的打卡（不再打卡）没有归档项', () => {
    expect(ids(detailMenu({ status: '关闭', recurrence: 'FREQ=DAILY', completion_mode: 'once' }, false))).toBe('myday pin |reopen |delete');
  });
  it('普通任务没有归档', () => {
    expect(ids(detailMenu({ status: '待办', recurrence: null, completion_mode: 'once' }, false))).not.toContain('archive');
  });
  it('打卡页行菜单：查看详情 | 我的一天 | 归档；归档了的：查看详情 | 取消归档', async () => {
    const { habitMenu } = await import('./task-menu');
    expect(habitMenu(false, false).map((e) => (e.separator ? `|${e.id}` : e.id)).join(' ')).toBe('open |myday pin |archive');
    expect(habitMenu(true, false).map((e) => (e.separator ? `|${e.id}` : e.id)).join(' ')).toBe('open |unarchive');
  });
});

describe('任务置顶（Rei 2026-11-08）', () => {
  const line = (m: { id: string; separator?: boolean }[]) => m.map((e) => (e.separator ? `|${e.id}` : e.id)).join(' ');
  it('详情菜单：没置顶的「置顶」跟在我的一天后面；置顶了的只有「取消置顶」，不再给我的一天', () => {
    const m = detailMenu({ status: '待办', recurrence: null, completion_mode: 'once' }, false);
    expect(m[1]).toMatchObject({ id: 'pin', label: '置顶' });
    const p = detailMenu({ status: '待办', recurrence: null, completion_mode: 'once', pinned_at: '2026-11-08T01:00:00.000Z' }, true);
    expect(line(p)).toBe('unpin |close |delete');
    expect(p[0]!.label).toBe('取消置顶');
  });
  it('做完了的置顶任务照样能取消置顶', () => {
    expect(line(detailMenu({ status: '完成', recurrence: null, completion_mode: 'once', pinned_at: '2026-11-08T01:00:00.000Z' }, false))).toBe('unpin |reopen |delete');
  });
  it('行菜单、打卡行菜单', async () => {
    const { rowMenu, habitMenu } = await import('./task-menu');
    expect(line(rowMenu(true, true))).toBe('open |unpin');
    expect(line(habitMenu(false, false, true))).toBe('open |unpin |archive');
    // 归档了的打卡不给置顶
    expect(line(habitMenu(true, false, true))).toBe('open |unarchive');
  });
});
