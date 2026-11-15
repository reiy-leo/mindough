import { describe, expect, it } from 'vitest';
import { hasDrawerButton, mobileTopbar, topbarState } from './mobile-topbar';
import type { Route } from './router';

describe('手机顶栏（Rei 2026-11-12：哪一页都不放搜索按钮、不写页名）', () => {
  it('我的一天、待安排、可做、打卡、日历、项目列表、倒数日、日记、资料库（含人物库）、类型、已完成、设置：有顶栏这一格（不写页名，只放抽屉按钮 / 日期 / 按钮）', () => {
    for (const p of ['myday', 'backlog', 'doable', 'checkin', 'agenda', 'groups', 'countdown', 'journal', 'library', 'people', 'types', 'done', 'settings'] as const) expect(mobileTopbar(p)).toBe('bar');
  });
  it('有自己页头的页（详情页、搜索页）：不要顶栏这一行', () => {
    for (const p of ['group', 'person', 'libitem', 'search'] as const) expect(mobileTopbar(p as never)).toBe('none');
  });
});

describe('抽屉按钮（Rei 2026-11-15 手机导航改版）', () => {
  it('顶级页都有', () => {
    for (const page of ['myday', 'backlog', 'doable', 'agenda', 'groups', 'checkin', 'countdown', 'journal', 'library', 'people', 'types', 'done', 'settings'] as const)
      expect(hasDrawerButton({ page } as Route)).toBe(true);
    expect(hasDrawerButton({ page: 'library', typeId: 't1' })).toBe(true);
  });
  it('有「返回」的二级页和搜索页没有', () => {
    expect(hasDrawerButton({ page: 'settings', section: 'appearance' })).toBe(false);
    expect(hasDrawerButton({ page: 'group', id: 'g' })).toBe(false);
    expect(hasDrawerButton({ page: 'libitem', typeId: 't', id: 'i' })).toBe(false);
    expect(hasDrawerButton({ page: 'person', id: 'p' })).toBe(false);
    expect(hasDrawerButton({ page: 'search' })).toBe(false);
  });
  it('有抽屉按钮就不收成空行', () => {
    expect(topbarState({ menu: true, lead: false, actions: false })).toBe(' no-lead');
    expect(topbarState({ menu: true, lead: true, actions: true })).toBe('');
    expect(topbarState({ menu: false, lead: false, actions: true })).toBe(' no-lead');
    expect(topbarState({ menu: false, lead: false, actions: false })).toBe(' is-empty');
  });
});
