import { describe, expect, it } from 'vitest';
import { mentionAnchor, placeMentionPop, usableRect } from './mention-place';

const box = { left: 1000, top: 100, right: 1300, bottom: 600 };
const view = { top: 0, bottom: 800, width: 1366 };
const pop = { width: 300, height: 264 };

describe('usableRect：量不到的位置不认', () => {
  it('全 0 矩形（节点刚被换掉）不认', () => {
    expect(usableRect({ left: 0, top: 0, bottom: 0 })).toBe(false);
    expect(usableRect({ left: 0, top: 0, bottom: 0 }, box)).toBe(false);
  });
  it('null、NaN、高度为负不认', () => {
    expect(usableRect(null)).toBe(false);
    expect(usableRect({ left: NaN, top: 10, bottom: 20 })).toBe(false);
    expect(usableRect({ left: 10, top: 30, bottom: 20 })).toBe(false);
  });
  it('跑出编辑器框不认，框里的认', () => {
    expect(usableRect({ left: 20, top: 20, bottom: 40 }, box)).toBe(false);
    expect(usableRect({ left: 1040, top: 300, bottom: 320 }, box)).toBe(true);
    expect(usableRect({ left: 1040, top: 300, bottom: 320 })).toBe(true);
  });
  it('编辑器自己的框是 0（不在页面上）不认', () => {
    expect(usableRect({ left: 1040, top: 300, bottom: 320 }, { left: 0, top: 0, right: 0, bottom: 0 })).toBe(false);
  });
});

describe('mentionAnchor：竖直跟光标、横向跟 @', () => {
  it('同一行：左边用 @，上下用光标', () => {
    expect(mentionAnchor({ left: 1040, top: 300, bottom: 320 }, { left: 1090, top: 300, bottom: 320 })).toEqual({ left: 1040, top: 300, bottom: 320 });
  });
  it('折到下一行：跟光标', () => {
    expect(mentionAnchor({ left: 1280, top: 300, bottom: 320 }, { left: 1010, top: 322, bottom: 342 })).toEqual({ left: 1010, top: 322, bottom: 342 });
  });
  it('一边没量到用另一边，都没量到给 null', () => {
    expect(mentionAnchor(null, { left: 1, top: 2, bottom: 3 })).toEqual({ left: 1, top: 2, bottom: 3 });
    expect(mentionAnchor({ left: 1, top: 2, bottom: 3 }, null)).toEqual({ left: 1, top: 2, bottom: 3 });
    expect(mentionAnchor(null, null)).toBeNull();
  });
});

describe('placeMentionPop', () => {
  it('放在那一行下面 6px', () => {
    expect(placeMentionPop({ left: 400, top: 300, bottom: 320 }, pop, view)).toEqual({ left: 392, top: 326 });
  });
  it('下面放不下翻到上面', () => {
    expect(placeMentionPop({ left: 400, top: 700, bottom: 720 }, pop, view)).toEqual({ left: 392, top: 700 - 6 - 264 });
  });
  it('靠右边时收进窗口（右侧详情栏）', () => {
    expect(placeMentionPop({ left: 1300, top: 300, bottom: 320 }, pop, view).left).toBe(1366 - 300 - 8);
  });
  it('上下都放不下：贴下面，但不高过视口上沿', () => {
    expect(placeMentionPop({ left: 400, top: 100, bottom: 120 }, pop, { top: 0, bottom: 300, width: 390 }).top).toBe(126);
  });
});
