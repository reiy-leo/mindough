import { describe, expect, it } from 'vitest';
import { gridShift, gridTargetIndex, keyboardMove, pitchOf, reorderKey, shiftFor, slotTop, targetIndex, type Slot } from './nav-reorder';

// 四行，每行 36 高、间隔 2（侧栏 .nav-section gap 2px）
const slots: Slot[] = [0, 38, 76, 114].map((top) => ({ top, height: 36 }));

describe('侧栏置顶项拖动排序（Rei 2026-11-10）', () => {
  it('中线越过别的行的中线才换位', () => {
    expect(targetIndex(slots, 0, 0)).toBe(0);
    expect(targetIndex(slots, 0, 19)).toBe(0); // 中线 37 < 第二行中线 56
    expect(targetIndex(slots, 0, 39)).toBe(1);
    expect(targetIndex(slots, 0, 200)).toBe(3);
    expect(targetIndex(slots, 3, -39)).toBe(2);
    expect(targetIndex(slots, 3, -500)).toBe(0);
    expect(targetIndex(slots, 1, 0)).toBe(1);
  });

  it('让位：往下拖中间的往上让一格，往上拖中间的往下让一格，别的不动', () => {
    const p = pitchOf(slots, 0);
    expect(p).toBe(38);
    expect([0, 1, 2, 3].map((k) => shiftFor(k, 0, 2, p))).toEqual([0, -38, -38, 0]);
    expect([0, 1, 2, 3].map((k) => shiftFor(k, 3, 1, p))).toEqual([0, 38, 38, 0]);
    expect([0, 1, 2, 3].map((k) => shiftFor(k, 2, 2, p))).toEqual([0, 0, 0, 0]);
    expect(pitchOf(slots, 3)).toBe(38);
    expect(pitchOf([{ top: 0, height: 40 }], 0)).toBe(40);
  });

  it('占位格落在目标行原来的位置', () => {
    expect(slotTop(slots, 0, 2)).toBe(76);
    expect(slotTop(slots, 3, 0)).toBe(0);
    expect(slotTop(slots, 1, 1)).toBe(38);
  });

  it('键盘 ⌥↑ / ⌥↓ 上移下移，到头不动；别的组合键不算', () => {
    expect(keyboardMove(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(keyboardMove(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(keyboardMove(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(keyboardMove(['a', 'b', 'c'], 'c', 1)).toBeNull();
    const k = (key: string, mods: Partial<Record<'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey', boolean>> = {}) =>
      reorderKey({ key, altKey: false, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });
    expect(k('ArrowUp', { altKey: true })).toBe(-1);
    expect(k('ArrowDown', { altKey: true })).toBe(1);
    expect(k('ArrowDown')).toBe(0);
    expect(k('ArrowDown', { altKey: true, metaKey: true })).toBe(0);
    expect(k('ArrowLeft', { altKey: true })).toBe(0);
  });
});

describe('图标网格（Rei 2026-11-11 侧栏项目「显示为：图标」）', () => {
  // 一行 3 格、每格 40 宽 36 高、间距 4：第 4 格折到第二行
  const g = [0, 1, 2, 3, 4].map((i) => ({ left: (i % 3) * 44, top: Math.floor(i / 3) * 40, width: 40, height: 36 }));
  it('落点是离被拖那格中心最近的格子，横竖都算', () => {
    expect(gridTargetIndex(g, 0, 0, 0)).toBe(0);
    expect(gridTargetIndex(g, 0, 44, 0)).toBe(1);
    expect(gridTargetIndex(g, 0, 44, 40)).toBe(4);
    expect(gridTargetIndex(g, 0, 88, 40)).toBe(2);
    expect(gridTargetIndex(g, 4, -44, -40)).toBe(0);
    // 还没过一半，留在原地
    expect(gridTargetIndex(g, 0, 20, 0)).toBe(0);
  });
  it('别的格子挪到新顺序里自己那一格（折行处跨行挪）', () => {
    // 第 0 格拖到第 4 格：1..4 各往前挪一格，第 3 格从第二行挪到第一行末尾
    expect(gridShift(g, 1, 0, 4)).toEqual({ x: -44, y: 0 });
    expect(gridShift(g, 3, 0, 4)).toEqual({ x: 88, y: -40 });
    expect(gridShift(g, 0, 0, 4)).toEqual({ x: 44, y: 40 });
    // 往前拖：中间的往后挪
    expect(gridShift(g, 2, 4, 1)).toEqual({ x: -88, y: 40 });
    expect(gridShift(g, 0, 4, 1)).toEqual({ x: 0, y: 0 });
  });
  it('键盘：网格里 ⌥← / ⌥→ 也能前后挪，列表里不认', () => {
    const e = (key: string) => ({ key, altKey: true, metaKey: false, ctrlKey: false, shiftKey: false });
    expect(reorderKey(e('ArrowLeft'), true)).toBe(-1);
    expect(reorderKey(e('ArrowRight'), true)).toBe(1);
    expect(reorderKey(e('ArrowLeft'))).toBe(0);
    expect(reorderKey(e('ArrowUp'), true)).toBe(-1);
  });
});
