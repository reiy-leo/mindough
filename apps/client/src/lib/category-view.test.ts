import { describe, expect, it } from 'vitest';
import { normalizeCategoryView } from './category-view';

describe('类型页显示为列表 / 图标（Rei 2026-11-11 08:33）', () => {
  it('默认列表，认不出的值也当列表', () => {
    expect(normalizeCategoryView(undefined)).toBe('list');
    expect(normalizeCategoryView('grid')).toBe('list');
    expect(normalizeCategoryView('icons')).toBe('icons');
  });
});
