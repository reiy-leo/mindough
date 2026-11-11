import { describe, expect, it } from 'vitest';
import { mobileTopbar } from './mobile-topbar';

describe('手机顶栏（Rei 2026-11-11：搜索只在我的一天）', () => {
  it('我的一天：标题 + 搜索', () => {
    expect(mobileTopbar('myday')).toBe('search');
  });
  it('待安排、可做、打卡：只有标题，没有搜索', () => {
    for (const p of ['backlog', 'doable', 'checkin', 'agenda'] as const) expect(mobileTopbar(p)).toBe('title');
  });
  it('有自己页头的页：不要顶栏这一行', () => {
    for (const p of ['groups', 'group', 'countdown', 'done', 'journal', 'library', 'settings', 'more'] as const) expect(mobileTopbar(p as never)).toBe('none');
  });
});
