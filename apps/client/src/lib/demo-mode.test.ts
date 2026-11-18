// @vitest-environment happy-dom
/** 演示模式（Rei 2026-11-18，lib/demo-mode）：本机标记、按模式分开的键。 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_MODE_KEY, isDemoMode, modeKey, readDemoFlag, setActiveDemo, writeDemoFlag } from './demo-mode';
import { draftKey } from './list-draft';

beforeEach(() => localStorage.clear());
afterEach(() => setActiveDemo(false));

describe('演示模式标记', () => {
  it('没有标记 = 还没判断（null），认不出的值也当没有', () => {
    expect(readDemoFlag()).toBeNull();
    localStorage.setItem(DEMO_MODE_KEY, 'yes');
    expect(readDemoFlag()).toBeNull();
  });

  it('写进去读得回来，只存在本机 localStorage', () => {
    writeDemoFlag(true);
    expect(localStorage.getItem(DEMO_MODE_KEY)).toBe('1');
    expect(readDemoFlag()).toBe('1');
    writeDemoFlag(false);
    expect(readDemoFlag()).toBe('0');
  });

  it('页面定下模式以后以它为准，换标记要重载才算', () => {
    setActiveDemo(true);
    writeDemoFlag(false);
    expect(isDemoMode()).toBe(true);
  });
});

describe('按模式分开的本机键', () => {
  it('演示模式加 :demo，生产不变', () => {
    setActiveDemo(false);
    expect(modeKey('mindough:blank-drafts')).toBe('mindough:blank-drafts');
    setActiveDemo(true);
    expect(modeKey('mindough:blank-drafts')).toBe('mindough:blank-drafts:demo');
  });

  it('列表草稿：演示里打的字不会出现在生产库的添加框里', () => {
    setActiveDemo(false);
    expect(draftKey('myday')).toBe('mindough:draft:myday');
    setActiveDemo(true);
    expect(draftKey('myday')).toBe('mindough:demo:draft:myday');
    expect(draftKey('group', 'g1')).toBe('mindough:demo:draft:group:g1');
  });
});
