import { describe, expect, it } from 'vitest';
import { mobileTopbar } from './mobile-topbar';

describe('手机顶栏（Rei 2026-11-12：哪一页都不放搜索按钮、不写页名）', () => {
  it('我的一天、待安排、可做、打卡、日历、项目列表、倒数日、资料库（含人物库）、类型、已完成、更多、设置：有顶栏这一格（不写页名，只放日期 / 按钮）', () => {
    for (const p of ['myday', 'backlog', 'doable', 'checkin', 'agenda', 'groups', 'countdown', 'library', 'people', 'types', 'done', 'more', 'settings'] as const) expect(mobileTopbar(p)).toBe('bar');
  });
  it('有自己页头的页（详情页、日记、搜索页）：不要顶栏这一行', () => {
    for (const p of ['group', 'person', 'libitem', 'journal', 'search'] as const) expect(mobileTopbar(p as never)).toBe('none');
  });
});
