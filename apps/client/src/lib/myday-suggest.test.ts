import { describe, expect, it, vi } from 'vitest';
import { daySuggestions, suggestionsOn } from './myday-suggest';

describe('我的一天的建议开关', () => {
  it('默认开：没存过、存了 true 都算开，只有 false 算关', () => {
    expect(suggestionsOn({} as { myDaySuggestions: boolean })).toBe(true);
    expect(suggestionsOn({ myDaySuggestions: true })).toBe(true);
    expect(suggestionsOn({ myDaySuggestions: false })).toBe(false);
  });

  it('开着：照常算建议', () => {
    const compute = vi.fn(() => ['a', 'b']);
    expect(daySuggestions(true, compute)).toEqual(['a', 'b']);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('关着：不算建议，直接给空列表', () => {
    const compute = vi.fn(() => ['a']);
    expect(daySuggestions(false, compute)).toEqual([]);
    expect(compute).not.toHaveBeenCalled();
  });
});
