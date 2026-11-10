/** 日历的地址（Rei 2026-11-10 侧栏「时间轴」换成「日历」）：#/calendar、旧 #/agenda、深链 view/calendar 和 view/timeline 都打开日历；设置多一项 calendar。 */
import { describe, expect, it } from 'vitest';
import { href, isSettingsSection, parseHash } from './router';
import { parseDeepLink } from './deeplink';

describe('日历地址', () => {
  it('新旧 hash 都打开日历，链接写 #/calendar', () => {
    expect(parseHash('#/calendar')).toEqual({ page: 'agenda' });
    expect(parseHash('#/agenda')).toEqual({ page: 'agenda' });
    expect(parseHash('#/calendar?task=x')).toEqual({ page: 'agenda' });
    expect(href({ page: 'agenda' })).toBe('#/calendar');
  });
  it('深链 view/calendar 和旧的 view/timeline', () => {
    const now = new Date(2026, 10, 10);
    expect(parseDeepLink('mindough://view/calendar', now)).toEqual({ kind: 'view', route: { page: 'agenda' } });
    expect(parseDeepLink('mindough://view/timeline', now)).toEqual({ kind: 'view', route: { page: 'agenda' } });
  });
  it('设置有「日历」一项', () => {
    expect(isSettingsSection('calendar')).toBe(true);
    expect(parseHash('#/settings/calendar')).toEqual({ page: 'settings', section: 'calendar' });
  });
});
