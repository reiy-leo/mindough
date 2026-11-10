import { describe, expect, it } from 'vitest';
import { PROP_ORDER, addMenuItems, addMenuSections, applicableProps, clearPatch, isPropSet, setProps, unsetProps, type PropTask , canHaveMood} from './prop-chips';

const base: PropTask = {
  completion_mode: 'once',
  scheduled_date: null,
  recurrence: null,
  category_id: null,
  remind_time: null,
  group_id: null,
  target_date: null,
  card_color: null,
};
const t = (p: Partial<PropTask> = {}): PropTask => ({ ...base, ...p });

describe('属性胶囊：默认值判定（Rei 2026-10-25 方案 A）', () => {
  it('全是默认值：一个胶囊都没有', () => {
    expect(setProps(t())).toEqual([]);
  });
  it('没类型 / 没资料 / 打勾 / 一次 / 没日期 / 不提醒 / 不放进组 都算没设', () => {
    for (const id of PROP_ORDER) expect(isPropSet(id, t())).toBe(false);
  });
  it('设过的才算：类型（几个都行）、资料、完成方式、日期、组', () => {
    expect(isPropSet('category', t(), { categories: 2 })).toBe(true);
    expect(isPropSet('category', t({ category_id: 'c' }))).toBe(true);
    expect(isPropSet('refs', t(), { refs: 1 })).toBe(true);
    expect(isPropSet('mode', t({ completion_mode: 'timer' }))).toBe(true);
    expect(isPropSet('date', t({ scheduled_date: '2026-10-16' }))).toBe(true);
    expect(isPropSet('group', t({ group_id: 'g1' }))).toBe(true);
  });
  it('胶囊按固定顺序（2026-11-11）：日期、完成方式、提醒、类型、组；资料不是胶囊', () => {
    const task = t({ group_id: 'g', scheduled_date: '2026-10-16', remind_time: '09:00', completion_mode: 'count' });
    expect(setProps(task, { categories: 2, refs: 3 })).toEqual(['date', 'mode', 'remind', 'category', 'group']);
  });
  it('重复任务：没有日期', () => {
    const task = t({ recurrence: 'FREQ=DAILY', category_id: 'c1' });
    expect(applicableProps(task)).not.toContain('date');
    // 打卡的完成方式总是胶囊（勾选完成也是，2026-11-09）
    expect(setProps(task)).toEqual(['mode', 'repeat', 'category']);
  });
});

describe('「+」菜单：列出没设的属性', () => {
  it('什么都没设：没日期时不能提醒，所以不列提醒', () => {
    expect(unsetProps(t())).toEqual(['date', 'mode', 'repeat', 'refs', 'category', 'mood', 'group']);
  });
  it('有日期就能加提醒', () => {
    expect(unsetProps(t({ scheduled_date: '2026-10-16' }))).toEqual(['mode', 'repeat', 'remind', 'refs', 'category', 'mood', 'group']);
  });
  it('挂了资料：菜单里不再有「资料」（详情里资料下面有自己的「添加资料」）', () => {
    expect(unsetProps(t(), { refs: 1 })).not.toContain('refs');
  });
  it('全都设了：菜单是空的（「+」隐藏）', () => {
    expect(unsetProps(t({ completion_mode: 'timer', recurrence: 'FREQ=DAILY', category_id: 'c', remind_time: '09:00', group_id: 'g' }), { refs: 1 })).toEqual([]);
  });
  it('设过的 + 没设的 = 适用的全部，不重不漏（资料除外）', () => {
    const task = t({ group_id: 'g', completion_mode: 'countdown', target_date: '2026-11-01' });
    expect([...setProps(task), ...unsetProps(task)].sort()).toEqual([...applicableProps(task)].sort());
  });
});

describe('清除回默认', () => {
  it('清除后的字段就是默认值，胶囊消失、回到「+」菜单', () => {
    const task = t({ completion_mode: 'timer', scheduled_date: '2026-10-16', recurrence: null, remind_time: '09:00', group_id: 'g' });
    for (const id of ['mode', 'date', 'remind', 'group'] as const) {
      const next = { ...task, ...clearPatch(id) } as PropTask;
      expect(isPropSet(id, next)).toBe(false);
    }
    const rec = t({ recurrence: 'FREQ=DAILY' });
    expect(isPropSet('repeat', { ...rec, ...clearPatch('repeat') } as PropTask)).toBe(false);
  });
  it('清掉重复后日期重新出现在「+」菜单里', () => {
    const rec = t({ recurrence: 'FREQ=WEEKLY;BYDAY=MO' });
    expect(unsetProps({ ...rec, ...clearPatch('repeat') } as PropTask)).toContain('date');
  });
  it('类型和资料交给调用方（setTaskCategories / 解开关联）', () => {
    expect(clearPatch('category')).toBeNull();
    expect(clearPatch('refs')).toBeNull();
  });
});

describe('「+」菜单里的附件（Rei 2026-10-25）', () => {
  it('能加附件时「附件」排在最后', () => {
    expect(addMenuItems(t(), {}, true)).toEqual(['date', 'mode', 'repeat', 'refs', 'category', 'mood', 'attachment', 'group']);
    expect(addMenuItems(t(), {}, false)).toEqual(unsetProps(t()));
  });
  it('属性都设了，菜单里还剩「附件」，「+」不藏', () => {
    const full = t({ completion_mode: 'count', recurrence: 'FREQ=DAILY', category_id: 'c', remind_time: '09:00', group_id: 'g' });
    expect(addMenuItems(full, { refs: 1 }, true)).toEqual(['attachment']);
  });
});

describe('倒数日的卡片颜色（Rei 2026-11-02）', () => {
  it('只有倒数日有「颜色」；设了才显示胶囊，清除回默认', () => {
    expect(applicableProps(t())).not.toContain('color');
    const cd = t({ completion_mode: 'countdown', target_date: '2026-12-01' });
    expect(applicableProps(cd)).toContain('color');
    expect(isPropSet('color', cd)).toBe(false);
    expect(isPropSet('color', t({ ...cd, card_color: 'teal' }))).toBe(true);
    expect(isPropSet('color', t({ ...cd, card_color: 'nope' }))).toBe(false);
    expect(clearPatch('color')).toEqual({ card_color: null });
  });
});

describe('心情（Rei 2026-11-08）', () => {
  it('普通任务能加心情，打卡、倒数日不能', () => {
    expect(applicableProps(t())).toContain('mood');
    expect(applicableProps(t({ recurrence: 'FREQ=DAILY' }))).not.toContain('mood');
    expect(applicableProps(t({ completion_mode: 'countdown' }))).not.toContain('mood');
    expect(canHaveMood({ recurrence: null, completion_mode: 'count' })).toBe(true);
  });
  it('设了就显示成胶囊，清掉回空', () => {
    expect(setProps(t({ mood: 'happy' }))).toContain('mood');
    expect(unsetProps(t({ mood: 'happy' }))).not.toContain('mood');
    expect(clearPatch('mood')).toEqual({ mood: null });
  });
  it('打卡上以前记过的心情照样显示，能清', () => {
    expect(setProps(t({ recurrence: 'FREQ=DAILY', mood: 'sad' }))).toContain('mood');
  });
});

describe('「+」菜单分三组（Rei 2026-11-11）', () => {
  it('日期、完成方式、重复、提醒 ｜ 资料、类型 ｜ 心情、附件、项目', () => {
    expect(addMenuSections(t({ scheduled_date: '2026-10-16' }), {}, true)).toEqual([
      ['mode', 'repeat', 'remind'],
      ['refs', 'category'],
      ['mood', 'attachment', 'group'],
    ]);
  });
  it('没有日期这一项（重复任务）就跳过它，空组不出', () => {
    const rec = t({ recurrence: 'FREQ=DAILY', category_id: 'c', group_id: 'g' });
    expect(addMenuSections(rec, { refs: 1 }, true)).toEqual([['remind'], ['attachment']]);
    expect(addMenuSections(rec, { refs: 1 }, false)).toEqual([['remind']]);
  });
  it('倒数日：没有心情，附件排第 3 组第一项，卡片颜色在后', () => {
    const cd = t({ completion_mode: 'countdown', target_date: '2026-12-01' });
    expect(addMenuSections(cd, {}, true).at(-1)).toEqual(['attachment', 'group', 'color']);
  });
  it('分组拼起来就是 addMenuItems', () => {
    const task = t({ scheduled_date: '2026-10-16' });
    expect(addMenuSections(task, {}, true).flat()).toEqual(addMenuItems(task, {}, true));
  });
});
