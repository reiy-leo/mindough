// @vitest-environment node
/** 软键盘开没开、键盘上沿在哪（手机格式栏用，Rei 2026-11-21 方案 A）。 */
import { describe, expect, it } from 'vitest';
import { KB_MIN, keyboardOf, type ViewportSample } from './soft-keyboard';

const base: ViewportSample = { innerHeight: 844, fullHeight: 844, vvHeight: 844, vvOffsetTop: 0, vvScale: 1, ime: 0 };
const k = (p: Partial<ViewportSample>) => keyboardOf({ ...base, ...p });

describe('keyboardOf', () => {
  it('没键盘：不开，上沿是窗口底', () => {
    expect(k({})).toEqual({ open: false, top: 844 });
  });

  it('iOS / 新安卓 WebView：visualViewport 变矮，布局视口不变', () => {
    expect(k({ vvHeight: 500 })).toEqual({ open: true, top: 500 });
    // 视觉视口往下滚了一点（iOS 键盘开着时常见）：上沿跟着挪
    expect(k({ vvHeight: 500, vvOffsetTop: 40 })).toEqual({ open: true, top: 540 });
  });

  it('安卓 adjustResize：整个窗口变矮，拿见过的最高窗口比', () => {
    expect(k({ innerHeight: 520, vvHeight: 520 })).toEqual({ open: true, top: 520 });
  });

  it('地址栏收起、底部工具条这种几十 px 的变化不算键盘', () => {
    expect(k({ vvHeight: 844 - KB_MIN + 1 }).open).toBe(false);
    expect(k({ vvHeight: 844 - KB_MIN }).open).toBe(true);
  });

  it('双指放大让 visualViewport 变小，不算键盘', () => {
    expect(k({ vvHeight: 422, vvScale: 2 }).open).toBe(false);
  });

  it('安卓 edge-to-edge 老 WebView：visualViewport 看不到键盘，用原生报的高度', () => {
    expect(k({ ime: 300 })).toEqual({ open: true, top: 544 });
  });

  it('原生报的和 visualViewport 都有（新 WebView）：不重复算，取靠上的那个', () => {
    expect(k({ vvHeight: 544, ime: 300 })).toEqual({ open: true, top: 544 });
  });
});
