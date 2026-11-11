// 分组（原「大类」，Rei 2026-11-12）：选分组下拉的过滤、新建分组、自建分组的存法
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { BUILTIN_CATEGORIES, BUILTIN_CATEGORY_IDS, PIN_CATEGORY_ID, STAR_CATEGORY_ID } from '../src/seed/builtin-checkin-categories';
import {
  BUILTIN_CATEGORY_GROUP,
  categoryGroupOf,
  isCategoryGroup,
  CATEGORY_GROUP_PREF,
  CATEGORY_GROUP_ZH,
  CATEGORY_GROUPS,
  CUSTOM_GROUP_OF_PREF,
  categoryGroupOrder,
  categoryGroupOverrides,
  customCategoryGroups,
  customGroupAssignments,
  filterGroupOptions,
  groupCreateName,
  orderPickerCategories,
  withCustomGroupAssignment,
} from '../src/category-prefs';

const builtin = CATEGORY_GROUPS.map((g) => ({ id: g, names: [CATEGORY_GROUP_ZH[g]] }));
const ids = (os: { id: string }[]) => os.map((o) => o.id);

describe('选分组：过滤', () => {
  it('空搜索词：全部、原顺序', () => {
    expect(ids(filterGroupOptions(builtin, ''))).toEqual([...CATEGORY_GROUPS]);
    expect(ids(filterGroupOptions(builtin, '   '))).toEqual([...CATEGORY_GROUPS]);
  });
  it('按名字过滤，开头对上的在前', () => {
    expect(ids(filterGroupOptions(builtin, '学习'))).toEqual(['study']);
    const opts = [...builtin, { id: 'cg-1', names: ['工作日'] }];
    // 「工作日」开头对上，「学习和工作」只是包含
    expect(ids(filterGroupOptions(opts, '工作'))).toEqual(['cg-1', 'study']);
  });
  it('拼音首字母、全拼都能搜', () => {
    expect(ids(filterGroupOptions(builtin, 'st'))).toEqual(['body']);
    expect(ids(filterGroupOptions(builtin, 'sh'))).toEqual(['body', 'life']); // 身体 shenti、生活 shenghuo
    expect(ids(filterGroupOptions(builtin, 'ah'))).toEqual(['hobby']);
    expect(ids(filterGroupOptions(builtin, 'shenghuo'))).toEqual(['life']);
    expect(ids(filterGroupOptions(builtin, 'XX'))).toEqual(['study']);
  });
  it('多个名字（界面语言名 + 中文名）任一对上就算', () => {
    const en = CATEGORY_GROUPS.map((g) => ({ id: g, names: [g === 'life' ? 'Life' : g, CATEGORY_GROUP_ZH[g]] }));
    expect(ids(filterGroupOptions(en, 'lif'))).toEqual(['life']);
    expect(ids(filterGroupOptions(en, '生'))).toEqual(['life']);
  });
  it('都对不上：空', () => {
    expect(filterGroupOptions(builtin, '旅行')).toEqual([]);
  });
});

describe('选分组：新建', () => {
  it('没有同名的才出「新建」，名字去两头空白、全角统一', () => {
    expect(groupCreateName(builtin, '  旅行 ')).toBe('旅行');
    expect(groupCreateName(builtin, '旅  行')).toBe('旅 行');
    expect(groupCreateName(builtin, '')).toBeNull();
    expect(groupCreateName(builtin, '   ')).toBeNull();
  });
  it('和已有分组任一名字一样（不分大小写、全半角）就不出', () => {
    expect(groupCreateName(builtin, '生活')).toBeNull();
    const opts = [...builtin, { id: 'cg-1', names: ['Travel'] }];
    expect(groupCreateName(opts, 'travel')).toBeNull();
    expect(groupCreateName(opts, 'ｔｒａｖｅｌ')).toBeNull();
    // 只是搜到（包含）不算同名：「生」还能新建
    expect(groupCreateName(builtin, '生')).toBe('生');
  });
});

describe('自建分组：存法', () => {
  it('偏好行 → 自建组：删掉的、名字空的、坏 id 丢掉，按 id 排', () => {
    const rows = [
      { key: 'category.custom_group.cg-02', value: '旅行' },
      { key: 'category.custom_group.cg-01', value: ' 家人 ' },
      { key: 'category.custom_group.cg-03', value: '', deleted: false },
      { key: 'category.custom_group.cg-04', value: '删了', deleted: true },
      { key: 'category.custom_group.bad', value: '坏' },
      { key: 'category.groups', value: ['a=life'] },
    ];
    expect(customCategoryGroups(rows)).toEqual([
      { id: 'cg-01', name: '家人' },
      { id: 'cg-02', name: '旅行' },
    ]);
  });
  it('分组顺序：内置前五组、自建组、「其他」，固定的「内置」组最后', () => {
    expect(categoryGroupOrder([{ id: 'cg-1' }, { id: 'cg-2' }])).toEqual(['body', 'life', 'study', 'hobby', 'people', 'cg-1', 'cg-2', 'other', 'builtin']);
  });
  it('放进自建组的记录：只认 cg- 开头的组，同一类型后写的算；拿出来就删那一项', () => {
    expect([...customGroupAssignments(['a=cg-1', 'b=life', 'a=cg-2', 3, '=cg-1'])]).toEqual([['a', 'cg-2']]);
    expect(withCustomGroupAssignment(['a=cg-1', 'b=cg-1'], 'a', null)).toEqual(['b=cg-1']);
    expect(withCustomGroupAssignment(['b=cg-1'], 'a', 'cg-2')).toEqual(['b=cg-1', 'a=cg-2']);
  });
  it('旧客户端读 category.groups 看不到自建组（不会把它写进去）', () => {
    expect(categoryGroupOverrides(['a=cg-1']).size).toBe(0);
  });
  it('没用过的类型按分组排：自建组排在「其他」前', () => {
    const cats = [
      { id: 'x', sort: 1, name: 'x' },
      { id: 'y', sort: 2, name: 'y' },
    ];
    const order = orderPickerCategories(cats, [], new Map(), new Map([['x', 'other'], ['y', 'cg-1']]));
    expect(ids(order)).toEqual(['y', 'x']);
  });
});

describe('Store：新建分组、放进去、换回内置组', () => {
  it('新建后能选上，跟着同步偏好走', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a' });
    const c = s.createCategory('滑雪');
    expect(s.categoryGroup(c.id)).toBe('other');
    const gid = s.createCategoryGroup('  户外 ')!;
    expect(gid).toMatch(/^cg-/);
    expect(s.customCategoryGroups()).toEqual([{ id: gid, name: '户外' }]);
    expect(s.categoryGroupIds()).toEqual(['body', 'life', 'study', 'hobby', 'people', gid, 'other', 'builtin']);
    expect(s.customCategoryGroupName(gid)).toBe('户外');
    s.setCategoryGroup(c.id, gid);
    expect(s.categoryGroup(c.id)).toBe(gid);
    expect(s.pref(CUSTOM_GROUP_OF_PREF)).toEqual([`${c.id}=${gid}`]);
    // 不写进旧客户端读的 category.groups
    expect(s.pref(CATEGORY_GROUP_PREF)).toBeUndefined();
    // 换回内置组：自建组那一项去掉
    s.setCategoryGroup(c.id, 'hobby');
    expect(s.categoryGroup(c.id)).toBe('hobby');
    expect(s.pref(CUSTOM_GROUP_OF_PREF)).toEqual([]);
    expect(s.pref(CATEGORY_GROUP_PREF)).toEqual([`${c.id}=hobby`]);
  });
  it('同名不新建：内置组中文名、已有自建组（不分大小写）返回那一组；空名字 null', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a' });
    expect(s.createCategoryGroup('生活')).toBe('life');
    const a = s.createCategoryGroup('Trip')!;
    expect(s.createCategoryGroup('trip')).toBe(a);
    expect(s.createCategoryGroup('  ')).toBeNull();
    expect(s.customCategoryGroups()).toHaveLength(1);
  });
  it('两个组各一行偏好：后建的排后面；不认识的组 id 不让放', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a' });
    const a = s.createCategoryGroup('甲')!;
    const b = s.createCategoryGroup('乙')!;
    expect(s.customCategoryGroups().map((g) => g.id)).toEqual([a, b]);
    const sport = BUILTIN_CATEGORY_IDS.sport;
    s.setCategoryGroup(sport, 'cg-nope');
    expect(s.categoryGroup(sport)).toBe('body');
  });
  it('自建组的偏好行被删了：类型回到原来的组', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a' });
    const gid = s.createCategoryGroup('临时')!;
    const sport = BUILTIN_CATEGORY_IDS.sport;
    s.setCategoryGroup(sport, gid);
    expect(s.categoryGroup(sport)).toBe(gid);
    const row = s.list('pref').find((p) => p.key === `category.custom_group.${gid}`)!;
    s.update('pref', row.id, { deleted: true });
    expect(s.categoryGroup(sport)).toBe('body');
    expect(s.categoryGroupIds()).not.toContain(gid);
  });
});

describe('固定分组「内置」（Rei 2026-11-12 07:20）', () => {
  it('只放置顶、收藏、紧急、重要，排在所有分组最下面', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a' });
    for (const c of BUILTIN_CATEGORIES) expect(s.categoryGroup(c.id)).toBe(BUILTIN_CATEGORY_GROUP);
    const gid = s.createCategoryGroup('户外')!;
    expect(s.categoryGroupIds().at(-1)).toBe(BUILTIN_CATEGORY_GROUP);
    expect(s.categoryGroupIds().indexOf('other')).toBeGreaterThan(s.categoryGroupIds().indexOf(gid));
    // 别的类型都不在这一组
    const mine = s.createCategory('滑雪');
    expect(s.categoryGroup(mine.id)).toBe('other');
    expect(s.categories(true).filter((c) => s.categoryGroup(c.id) === BUILTIN_CATEGORY_GROUP).map((c) => c.id).sort()).toEqual(BUILTIN_CATEGORIES.map((c) => c.id).sort());
  });
  it('自建类型换不进「内置」组；也不能新建叫「内置」的分组', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a' });
    const mine = s.createCategory('滑雪');
    s.setCategoryGroup(mine.id, BUILTIN_CATEGORY_GROUP);
    expect(s.categoryGroup(mine.id)).toBe('other');
    expect(s.pref(CATEGORY_GROUP_PREF)).toBeUndefined();
    expect(s.createCategoryGroup('内置')).toBeNull();
    expect(s.createCategoryGroup(' 内置 ')).toBeNull();
    expect(s.customCategoryGroups()).toHaveLength(0);
    expect(isCategoryGroup(BUILTIN_CATEGORY_GROUP)).toBe(false);
  });
  it('旧数据：偏好里给置顶记过分组（category.groups / custom_group_of）、给别的类型写了 =builtin，都不认', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a' });
    const gid = s.createCategoryGroup('户外')!;
    const mine = s.createCategory('滑雪');
    s.setPref(CATEGORY_GROUP_PREF, [`${PIN_CATEGORY_ID}=other`, `${STAR_CATEGORY_ID}=body`, `${mine.id}=builtin`]);
    s.setPref(CUSTOM_GROUP_OF_PREF, [`${PIN_CATEGORY_ID}=${gid}`]);
    expect(s.categoryGroup(PIN_CATEGORY_ID)).toBe(BUILTIN_CATEGORY_GROUP);
    expect(s.categoryGroup(STAR_CATEGORY_ID)).toBe(BUILTIN_CATEGORY_GROUP);
    expect(s.categoryGroup(mine.id)).toBe('other');
    // 纯函数：overrides 里硬塞也不算
    expect(categoryGroupOf(PIN_CATEGORY_ID, new Map([[PIN_CATEGORY_ID, 'life']]))).toBe(BUILTIN_CATEGORY_GROUP);
    expect(categoryGroupOf('x', new Map([['x', BUILTIN_CATEGORY_GROUP]]))).toBe('other');
  });
  it('没用过的类型按分组排时，内置类型排在「其他」后面', () => {
    const cats = [
      { id: PIN_CATEGORY_ID, sort: 1, name: '置顶' },
      { id: 'x', sort: 2, name: 'x' },
    ];
    expect(ids(orderPickerCategories(cats, [], new Map(), new Map()))).toEqual(['x', PIN_CATEGORY_ID]);
  });
});
