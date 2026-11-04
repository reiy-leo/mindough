// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FileText } from 'lucide-react';
import { PICKER_GROUPS, PICKER_ICONS, TYPE_ICONS, isEmojiIcon, typeIcon } from './icons';

/** 2026-11-04 之前就能选的 60 个名字：老数据存着，一个都不能丢。 */
const OLD = 'file-text clapperboard gamepad-2 book-open folder folder-git-2 graduation-cap plane shopping-bag utensils salad user-round star heart music dumbbell briefcase notebook-pen archive party-popper heart-pulse sparkles spray-can tag leaf alarm-clock flower-2 pill wallet pen-line languages guitar palette users paw-print sprout shopping-cart scissors wrench tv mic headphones film camera car bike coffee wine code gift globe home lightbulb map-pin mountain trophy baby bookmark calendar flag'.split(' ');

describe('图标选择的图标（Rei 2026-11-04「emoji不支持」「添加更多lucide icons，包括动物、植物」）', () => {
  it('只给 Lucide 图标：每个都在 TYPE_ICONS 里，没有 emoji，名字和图形都不重复', () => {
    expect(PICKER_ICONS.filter((n) => !TYPE_ICONS[n] || isEmojiIcon(n))).toEqual([]);
    expect(new Set(PICKER_ICONS).size).toBe(PICKER_ICONS.length);
    expect(new Set(PICKER_ICONS.map((n) => TYPE_ICONS[n])).size).toBe(PICKER_ICONS.length);
    expect(PICKER_ICONS.length).toBeGreaterThanOrEqual(250);
  });
  it('folder 排第一（新建项目的默认图标），常用在最前', () => {
    expect(PICKER_ICONS[0]).toBe('folder');
    expect(PICKER_GROUPS[0]!.id).toBe('common');
  });
  it('有动物和植物', () => {
    for (const n of ['cat', 'dog', 'bird', 'fish', 'rabbit', 'turtle', 'snail', 'bug', 'squirrel', 'rat', 'panda']) expect(PICKER_ICONS).toContain(n);
    for (const n of ['leaf', 'flower', 'flower-2', 'tree-pine', 'tree-deciduous', 'tree-palm', 'sprout', 'clover', 'wheat', 'shrub']) expect(PICKER_ICONS).toContain(n);
  });
  it('以前能选的名字都还在，老数据照常画', () => {
    expect(OLD.filter((n) => !TYPE_ICONS[n] || !PICKER_ICONS.includes(n))).toEqual([]);
  });
  it('老数据里的 emoji 照常能画，不当成 Lucide，也不退回默认图标', () => {
    expect(isEmojiIcon('🏠')).toBe(true);
    expect(PICKER_ICONS.includes('🏠')).toBe(false);
    expect(typeIcon('🏠')).not.toBe(FileText);
    expect(typeIcon('cat')).toBe(TYPE_ICONS.cat);
  });
});
