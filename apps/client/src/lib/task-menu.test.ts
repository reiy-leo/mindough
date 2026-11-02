import { describe, expect, it } from 'vitest';
import { detailMenu } from './task-menu';

const ids = (m: ReturnType<typeof detailMenu>) => m.map((e) => (e.separator ? `|${e.id}` : e.id)).join(' ');

describe('任务详情「…」菜单（关闭挪进菜单，Rei 2026-10-17）', () => {
  it('没做完的普通任务：我的一天 | 关闭 | 删除', () => {
    const m = detailMenu({ status: '待办', recurrence: null, completion_mode: 'once' }, false);
    expect(ids(m)).toBe('myday |close |delete');
    expect(m.find((e) => e.id === 'close')!.label).toBe('关闭');
    expect(m[0]!.label).toBe('加入我的一天');
    expect(m.at(-1)).toMatchObject({ id: 'delete', danger: true });
  });
  it('计时 / 计数任务多一项「直接标为完成」，放在关闭前面、同一组', () => {
    expect(ids(detailMenu({ status: '进行中', recurrence: null, completion_mode: 'timer' }, true))).toBe('myday |done close |delete');
    expect(detailMenu({ status: '待办', recurrence: null, completion_mode: 'count' }, true)[0]!.label).toBe('移出我的一天');
  });
  it('定期打卡：关闭叫「不再打卡」，后面是「归档」，没有直接标为完成', () => {
    const m = detailMenu({ status: '待办', recurrence: 'FREQ=DAILY', completion_mode: 'timer' }, false);
    expect(ids(m)).toBe('myday |close archive |delete');
    expect(m[2]!.label).toBe('归档');
    expect(m[1]!.label).toBe('不再打卡');
  });
  it('已关闭 / 已完成的任务：换成「重新打开」（打卡叫「恢复打卡」）', () => {
    expect(ids(detailMenu({ status: '关闭', recurrence: null, completion_mode: 'once' }, false))).toBe('myday |reopen |delete');
    expect(detailMenu({ status: '完成', recurrence: null, completion_mode: 'once' }, false)[1]!.label).toBe('重新打开');
    expect(detailMenu({ status: '关闭', recurrence: 'FREQ=DAILY', completion_mode: 'once' }, false)[1]!.label).toBe('恢复打卡');
  });
});

describe('任务列表行的右键 / 长按菜单（Rei 2026-10-25）', () => {
  it('查看详情 | 加入 / 移出我的一天', async () => {
    const { rowMenu } = await import('./task-menu');
    expect(rowMenu(false).map((e) => (e.separator ? `|${e.id}` : e.id)).join(' ')).toBe('open |myday');
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
    expect(ids(detailMenu({ status: '关闭', recurrence: 'FREQ=DAILY', completion_mode: 'once' }, false))).toBe('myday |reopen |delete');
  });
  it('普通任务没有归档', () => {
    expect(ids(detailMenu({ status: '待办', recurrence: null, completion_mode: 'once' }, false))).not.toContain('archive');
  });
  it('打卡页行菜单：查看详情 | 我的一天 | 归档；归档了的：查看详情 | 取消归档', async () => {
    const { habitMenu } = await import('./task-menu');
    expect(habitMenu(false, false).map((e) => (e.separator ? `|${e.id}` : e.id)).join(' ')).toBe('open |myday |archive');
    expect(habitMenu(true, false).map((e) => (e.separator ? `|${e.id}` : e.id)).join(' ')).toBe('open |unarchive');
  });
});
