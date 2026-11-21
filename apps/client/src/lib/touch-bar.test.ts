import { describe, expect, it } from 'vitest';
import { isTouchBarKey, touchBarActive, touchBarLabels, TOUCH_BAR_ROUTES } from './touch-bar';

describe('Touch Bar', () => {
  it('当前页对应的按钮', () => {
    expect(touchBarActive({ page: 'myday' })).toBe('myday');
    expect(touchBarActive({ page: 'agenda' })).toBe('calendar');
    expect(touchBarActive({ page: 'groups' })).toBe('projects');
    expect(touchBarActive({ page: 'group', id: 'g1' })).toBe('projects');
    expect(touchBarActive({ page: 'checkin' })).toBe('checkin');
    expect(touchBarActive({ page: 'countdown' })).toBe('countdown');
    expect(touchBarActive({ page: 'journal', date: '2026-11-21' })).toBe('journal');
    expect(touchBarActive({ page: 'backlog' })).toBeNull();
    expect(touchBarActive({ page: 'library' })).toBeNull();
  });

  it('按钮跳去的页面再算回来还是这个按钮', () => {
    for (const [key, route] of Object.entries(TOUCH_BAR_ROUTES)) expect(touchBarActive(route)).toBe(key);
  });

  it('只认 6 个按钮名', () => {
    expect(isTouchBarKey('projects')).toBe(true);
    expect(isTouchBarKey('settings')).toBe(false);
    expect(isTouchBarKey('toString')).toBe(false);
    expect(isTouchBarKey(1)).toBe(false);
  });

  it('文字 6 项都有', () => {
    const l = touchBarLabels();
    expect(Object.keys(l)).toEqual(['myDay', 'calendar', 'projects', 'checkin', 'countdown', 'journal']);
    for (const v of Object.values(l)) expect(v).toBeTruthy();
  });
});
