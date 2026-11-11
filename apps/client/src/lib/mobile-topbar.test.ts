import { describe, expect, it } from 'vitest';
import { mobileTopbar } from './mobile-topbar';

describe('手机顶栏（Rei 2026-11-12：哪一页都不放搜索按钮）', () => {
  it('我的一天、待安排、可做、打卡、日历、项目列表、倒数日、资料库（含人物库）：只有标题', () => {
    for (const p of ['myday', 'backlog', 'doable', 'checkin', 'agenda', 'groups', 'countdown', 'library', 'people'] as const) expect(mobileTopbar(p)).toBe('title');
  });
  it('有自己页头的页（含搜索页）：不要顶栏这一行', () => {
    for (const p of ['group', 'done', 'journal', 'settings', 'more', 'search'] as const) expect(mobileTopbar(p as never)).toBe('none');
  });
});
