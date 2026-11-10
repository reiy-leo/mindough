/** 资料库卡片小字：目的地不显示地址等小字，别的库照旧（Rei 2026-11-11）。 */
import { describe, expect, it } from 'vitest';
import { BUILTIN_TYPE_IDS } from '@mindough/core';
import { tileShowsSub, tileSubText } from './lib-tile';

describe('资料库卡片小字', () => {
  it('目的地只显示名字：没有地址、也没有任务数', () => {
    expect(tileShowsSub({ id: BUILTIN_TYPE_IDS.travel })).toBe(false);
    expect(tileSubText({ id: BUILTIN_TYPE_IDS.travel }, '上海市虹口区水电路1281号', '2 件任务')).toBe('');
  });
  it('餐厅照旧显示地址和任务数', () => {
    expect(tileSubText({ id: BUILTIN_TYPE_IDS.restaurant }, '上海市杨浦区国定路335号', '1 件任务')).toBe('上海市杨浦区国定路335号 · 1 件任务');
  });
  it('影视、书等照旧，空的部分不留分隔点', () => {
    expect(tileSubText({ id: BUILTIN_TYPE_IDS.movie }, '诺兰 · 2014', '')).toBe('诺兰 · 2014');
    expect(tileSubText({ id: BUILTIN_TYPE_IDS.book }, '', '3 件任务')).toBe('3 件任务');
    expect(tileSubText({ id: BUILTIN_TYPE_IDS.book }, '', '')).toBe('');
  });
});
