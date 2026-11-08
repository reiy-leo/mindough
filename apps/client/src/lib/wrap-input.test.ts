import { describe, expect, it } from 'vitest';
import { stripNewlines, wrapHeight, wrapInputKey, WRAP_MAX_ROWS } from './wrap-input';

const k = (key: string, mods: Partial<Record<'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey', boolean>> = {}) => ({ key, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...mods });

describe('添加框折行（Rei 2026-11-08）', () => {
  it('回车提交，Shift+回车不换行，输入法选词的回车不管', () => {
    expect(wrapInputKey(k('Enter'), false)).toBe('submit');
    expect(wrapInputKey(k('Enter', { shiftKey: true }), false)).toBe('block');
    expect(wrapInputKey(k('Enter', { altKey: true }), false)).toBe('block');
    expect(wrapInputKey(k('Enter'), true)).toBeNull();
    expect(wrapInputKey(k('a'), false)).toBeNull();
  });
  it('换行符和单行输入框一样去掉', () => {
    expect(stripNewlines('第一行\n第二行\r\n第三行')).toBe('第一行第二行第三行');
    expect(stripNewlines('没有换行')).toBe('没有换行');
  });
  it('跟着内容长高，最多 6 行，再多在框里滚', () => {
    expect(WRAP_MAX_ROWS).toBe(6);
    expect(wrapHeight(34, 20, 14)).toEqual([34, false]);
    expect(wrapHeight(74, 20, 14)).toEqual([74, false]);
    expect(wrapHeight(134, 20, 14)).toEqual([134, false]);
    expect(wrapHeight(300, 20, 14)).toEqual([134, true]);
  });
});
