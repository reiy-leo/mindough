// 选分组的可搜索下拉（Rei 2026-11-12）：列哪些项、过滤、最后一项「新建」
import { describe, expect, it } from 'vitest';
import { CATEGORY_GROUP_ZH, isCategoryGroup } from '@mindough/core';
import { groupComboItems, groupOptions } from './CategoryGroupCombo';

const ids = ['body', 'life', 'study', 'hobby', 'people', 'cg-1', 'other'];
// store.categoryGroupIds() 带着最后的固定组「内置」
const withBuiltin = [...ids, 'builtin'];
const zh = (g: string) => (isCategoryGroup(g) ? CATEGORY_GROUP_ZH[g] : g === 'cg-1' ? '旅行' : g);
const en: Record<string, string> = { body: 'Body', life: 'Life', study: 'Learning & Work', hobby: 'Hobbies', people: 'People', other: 'Other', 'cg-1': '旅行', builtin: 'Built-in' };

describe('选分组下拉', () => {
  const opts = groupOptions(ids, zh);
  it('框里是当前分组名（没打字）：列全部、按顺序，没有「新建」', () => {
    const items = groupComboItems(opts, '生活', '生活');
    expect(items.map((i) => i.id)).toEqual(ids);
    expect(items.some((i) => i.create)).toBe(false);
    expect(groupComboItems(opts, '', '生活').map((i) => i.id)).toEqual(ids);
  });
  it('打字过滤：名字、拼音首字母都行，自建组也搜得到（没有同名的，最后跟一项「新建」）', () => {
    expect(groupComboItems(opts, '爱', '生活').map((i) => i.id)).toEqual(['hobby', '__create__']);
    expect(groupComboItems(opts, 'xxhgz', '生活').map((i) => i.id)).toEqual(['study', '__create__']);
    expect(groupComboItems(opts, 'lx', '生活').map((i) => i.id)).toEqual(['cg-1', '__create__']);
  });
  it('搜不到同名的：最后一项「新建」，带去掉两头空白的名字', () => {
    const items = groupComboItems(opts, ' 健身房 ', '生活');
    expect(items.at(-1)).toEqual({ id: '__create__', label: '健身房', create: true });
    // 搜到了别的但没有同名的：前面是对上的，最后还是「新建」
    const some = groupComboItems(opts, '生', '其他');
    expect(some.map((i) => i.id)).toEqual(['life', '__create__']);
  });
  it('有同名的（不分大小写）就不出「新建」', () => {
    expect(groupComboItems(opts, '旅行', '生活').some((i) => i.create)).toBe(false);
    expect(groupComboItems(groupOptions(ids, (g) => en[g]!), 'life', 'Other').some((i) => i.create)).toBe(false);
  });
  it('换了界面语言：内置组也能用中文名搜到，中文名同名也不新建', () => {
    const o = groupOptions(ids, (g) => en[g]!);
    expect(o.find((x) => x.id === 'life')!.names).toEqual(['Life', '生活']);
    expect(groupComboItems(o, 'sh', 'Other').map((i) => i.id)).toEqual(['body', 'life', '__create__']);
    expect(groupComboItems(o, '生活', 'Other').map((i) => i.id)).toEqual(['life']);
  });
  it('固定的「内置」组（Rei 2026-11-12 07:20）不列出来，也不能借名字新建', () => {
    const o = groupOptions(withBuiltin, (g) => (g === 'builtin' ? '内置' : zh(g)));
    expect(groupComboItems(o, '生活', '生活').map((i) => i.id)).toEqual(ids);
    expect(groupComboItems(o, '内置', '生活')).toEqual([]);
    expect(groupComboItems(o, 'nz', '生活').map((i) => i.id)).toEqual(['__create__']);
    const e = groupOptions(withBuiltin, (g) => en[g]!);
    expect(e.find((x) => x.id === 'builtin')!.names).toEqual(['Built-in', '内置']);
    expect(groupComboItems(e, 'built-in', 'Other')).toEqual([]);
    expect(groupComboItems(e, '内置', 'Other')).toEqual([]);
  });
});
