/**
 * 类型编辑改版（docs/CATEGORY-EDITOR.md 方案 C，Rei 2026-10-28「按方案C执行」）的纯逻辑：
 * - 分组（原叫「大类」，Rei 2026-11-12 改名；代码里还叫 group）：内置 6 组（身体、生活、学习和工作、爱好、人、其他）是固定 id，
 *   内置 27 个类型的默认组写在 seed/builtin-checkin-categories.ts；改到内置组的存同步偏好 `category.groups`；
 *   自定义类型默认进「其他」。组只为了好找，不影响别处怎么用类型。
 * - 自己新建的分组（Rei 2026-11-12）：一组一行偏好 `category.custom_group.<组 id>`，值是名字（组 id = "cg-" + UUIDv7，按建的先后排）；
 *   类型放进自建组记在另一个偏好 `category.custom_group_of`（"<类型 id>=<组 id>" 列表）。
 *   不往 `category.groups` 里写自建组：旧客户端读它时丢掉不认识的组、改组时整列重写，会把自建组的记录冲掉；分开存，旧客户端只会把这些类型显示在原来的内置组里。
 *   一组一行（不放进一个列表）是为了两台设备同时新建分组时不互相覆盖（偏好按行 LWW）。没有加表、加列，不用迁移。
 * - 三档：常用 / 普通 / 不显示。「常用」存同步偏好 `category.frequent`（id 列表）；「不显示」沿用 category.hidden 列。
 * - 选择器顺序（代替手动排序，Rei 2026-10-28 定）：常用的在前，其余按最近用过排（最近用过的在前），没用过的按默认组顺序接后面。
 *   「最近用过」从任务和打卡记录推出来，不另存。
 * - 搜索：名字、当前语言的名字、英文名、拼音首字母（「yd」→ 运动）都能搜。
 *
 * 为什么用偏好不加列：同 type_order / library.sidebar 的理由——改类型行会让内置类型变成「用户改过」，
 * 旧客户端只认已知列、改名时会把新列冲掉；偏好行它们原样留着、不碰。
 */
import TinyPinyin from 'tiny-pinyin';
import { POLYPHONE } from './pinyin-polyphone';
import { BUILTIN_CATEGORY_GROUPS, DEFAULT_FREQUENT_CHECKIN_CATEGORY_KEYS, BUILTIN_CATEGORY_IDS } from './seed/builtin-checkin-categories';
import type { Category } from './types';

/** 内置分组，按显示顺序。界面名字：身体、生活、学习和工作、爱好、人、其他。 */
export const CATEGORY_GROUPS = ['body', 'life', 'study', 'hobby', 'people', 'other'] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];
/** 分组 id：内置组（CategoryGroup）或自建组（"cg-…"）。 */
export type CategoryGroupId = string;
export const isCategoryGroup = (v: unknown): v is CategoryGroup => typeof v === 'string' && (CATEGORY_GROUPS as readonly string[]).includes(v);
/** 内置分组的中文名（界面上的名字走 client 的词典，这里给去重、拼音搜索用）。 */
export const CATEGORY_GROUP_ZH: Record<CategoryGroup, string> = { body: '身体', life: '生活', study: '学习和工作', hobby: '爱好', people: '人', other: '其他' };

/** 自建分组一组一行偏好的 key 前缀：`category.custom_group.<组 id>`，值是名字。 */
export const CUSTOM_GROUP_PREF_PREFIX = 'category.custom_group.';
/** 类型放进了哪个自建分组（同步偏好）：每项 "<类型 id>=<组 id>"。 */
export const CUSTOM_GROUP_OF_PREF = 'category.custom_group_of';
/** 自建分组的 id 前缀。 */
export const CUSTOM_GROUP_ID_PREFIX = 'cg-';
export const isCustomGroupId = (v: unknown): v is string => typeof v === 'string' && v.startsWith(CUSTOM_GROUP_ID_PREFIX) && v.length > CUSTOM_GROUP_ID_PREFIX.length && !v.includes('=');

/** 一个自建分组。 */
export interface CustomCategoryGroup {
  id: string;
  name: string;
}

/** 偏好行 → 自建分组（删掉的、名字空的丢掉），按 id 排（UUIDv7，等于建的先后）。 */
export function customCategoryGroups(prefs: readonly { key: string; value: unknown; deleted?: boolean }[]): CustomCategoryGroup[] {
  const out: CustomCategoryGroup[] = [];
  for (const p of prefs) {
    if (p.deleted || !p.key.startsWith(CUSTOM_GROUP_PREF_PREFIX)) continue;
    const id = p.key.slice(CUSTOM_GROUP_PREF_PREFIX.length);
    const name = typeof p.value === 'string' ? p.value.trim() : '';
    if (isCustomGroupId(id) && name) out.push({ id, name });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 偏好值 → { 类型 id: 自建组 id }（坏项丢掉，同一个类型后写的算）。 */
export function customGroupAssignments(value: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (!Array.isArray(value)) return m;
  for (const x of value) {
    if (typeof x !== 'string') continue;
    const i = x.lastIndexOf('=');
    if (i <= 0) continue;
    const g = x.slice(i + 1);
    if (isCustomGroupId(g)) m.set(x.slice(0, i), g);
  }
  return m;
}

/** 把一个类型放进自建组（gid）或拿出来（null），返回新的偏好值。 */
export function withCustomGroupAssignment(value: unknown, id: string, gid: string | null): string[] {
  const m = customGroupAssignments(value);
  m.delete(id);
  if (gid) m.set(id, gid);
  return [...m.entries()].map(([k, g]) => `${k}=${g}`);
}

/** 显示顺序：内置前五组，自建组按建的先后，「其他」最后。 */
export function categoryGroupOrder(custom: readonly Pick<CustomCategoryGroup, 'id'>[]): CategoryGroupId[] {
  return [...CATEGORY_GROUPS.filter((g) => g !== 'other'), ...custom.map((g) => g.id), 'other'];
}

/** 分组名字统一成好比较的样子（去两头空白、全半角统一、不分大小写）。 */
export function normGroupName(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 选分组的下拉里的一项：id 和能对上搜索的名字（第一个是界面上显示的名字）。 */
export interface GroupOption {
  id: CategoryGroupId;
  names: readonly string[];
}

/**
 * 按搜索词过滤分组（名字、拼音首字母、全拼都能搜，规则同类型搜索 categoryMatches）。
 * 空搜索词原样返回；有搜索词时开头对上的在前、包含的其次、拼音对上的最后，同一档保持原来的顺序。
 */
export function filterGroupOptions<O extends GroupOption>(options: readonly O[], query: string): O[] {
  if (!query.trim()) return [...options];
  return options
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => categoryMatches(o.names, query))
    .sort((a, b) => categoryMatchRank(a.o.names, query) - categoryMatchRank(b.o.names, query) || a.i - b.i)
    .map(({ o }) => o);
}

/** 搜不到同名分组时可以新建的名字（去两头空白）；空的、和哪个分组的任一名字一样时返回 null。 */
export function groupCreateName(options: readonly GroupOption[], query: string): string | null {
  const name = query.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name) return null;
  const n = normGroupName(name);
  return options.some((o) => o.names.some((x) => x && normGroupName(x) === n)) ? null : name;
}

/** 三档。 */
export type CategoryState = 'frequent' | 'normal' | 'hidden';

/** 「常用」类型 id 列表（同步偏好）。 */
export const CATEGORY_FREQUENT_PREF = 'category.frequent';
/** 改到内置组的分组（同步偏好）：每项 "<类型 id>=<组>"。偏好值不支持对象，所以存成字符串列表。 */
export const CATEGORY_GROUP_PREF = 'category.groups';

/** 偏好值 → id 列表（坏值丢掉，去重，保持先后）。 */
export function frequentCategoryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

/** 偏好值 → { 类型 id: 组 }（坏项丢掉，同一个 id 后写的算）。 */
export function categoryGroupOverrides(value: unknown): Map<string, CategoryGroup> {
  const m = new Map<string, CategoryGroup>();
  if (!Array.isArray(value)) return m;
  for (const x of value) {
    if (typeof x !== 'string') continue;
    const i = x.lastIndexOf('=');
    if (i <= 0) continue;
    const g = x.slice(i + 1);
    if (isCategoryGroup(g)) m.set(x.slice(0, i), g);
  }
  return m;
}

/** 改一个类型的组，返回新的偏好值。改回默认组就把那一项去掉。 */
export function withCategoryGroup(value: unknown, id: string, group: CategoryGroup): string[] {
  const m = categoryGroupOverrides(value);
  m.delete(id);
  if (group !== defaultCategoryGroup(id)) m.set(id, group);
  return [...m.entries()].map(([k, g]) => `${k}=${g}`);
}

/** 默认组：内置的看 seed，自定义的是「其他」。 */
export function defaultCategoryGroup(id: string): CategoryGroup {
  return BUILTIN_CATEGORY_GROUPS[id] ?? 'other';
}

/** 一个类型在哪个组。overrides 可以带自建组（Store.categoryGroupOverrides 合好的）。 */
export function categoryGroupOf(id: string, overrides: ReadonlyMap<string, CategoryGroupId>): CategoryGroupId {
  return overrides.get(id) ?? defaultCategoryGroup(id);
}

/** 一个类型在哪一档。不显示优先（hidden 列），再看常用列表。 */
export function categoryStateOf(c: Pick<Category, 'id' | 'hidden'>, frequent: readonly string[]): CategoryState {
  if (c.hidden) return 'hidden';
  return frequent.includes(c.id) ? 'frequent' : 'normal';
}

/** 改档后的常用列表：设成常用加到最后；普通、不显示都从列表里拿掉。 */
export function withCategoryState(frequent: readonly string[], id: string, state: CategoryState): string[] {
  const rest = frequent.filter((x) => x !== id);
  return state === 'frequent' ? [...rest, id] : rest;
}

/** 每个类型最近一次用到的时间（ISO 字符串）：任务的创建时间、打卡记录的时间里最晚的那个。 */
export function categoryLastUsed(
  tasks: readonly { id: string; category?: string | null; categories?: readonly string[]; created_at: string }[],
  checkIns: readonly { task_id: string; at: string }[],
): Map<string, string> {
  const byTask = new Map<string, string[]>();
  const out = new Map<string, string>();
  const bump = (cid: string, at: string) => {
    if (at > (out.get(cid) ?? '')) out.set(cid, at);
  };
  for (const t of tasks) {
    // 一件任务能挂几个类型（Rei 2026-10-28）：每个都算用过
    const cats = t.categories ?? (t.category ? [t.category] : []);
    if (!cats.length) continue;
    byTask.set(t.id, [...cats]);
    for (const c of cats) bump(c, t.created_at);
  }
  for (const e of checkIns) for (const cid of byTask.get(e.task_id) ?? []) bump(cid, e.at);
  return out;
}

/** 组的先后：内置组按 CATEGORY_GROUPS，自建组排在「其他」前面。 */
function groupRank(g: CategoryGroupId): number {
  const i = (CATEGORY_GROUPS as readonly string[]).indexOf(g);
  return i >= 0 ? i : CATEGORY_GROUPS.length - 1.5;
}

/** 组的先后（没用过的类型按它排）：组顺序，组里按 sort。 */
function defaultRank<C extends Pick<Category, 'id' | 'sort' | 'name'>>(overrides: ReadonlyMap<string, CategoryGroupId>) {
  return (a: C, b: C) =>
    groupRank(categoryGroupOf(a.id, overrides)) - groupRank(categoryGroupOf(b.id, overrides)) ||
    a.sort - b.sort ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * 选择器里的顺序（只给 visible 里的，不显示的不出现）：
 * 1. 常用的，按设成常用的先后；
 * 2. 用过的，最近用过的在前；
 * 3. 没用过的：先放几个日常最常见的（健康、运动、学习…），再按组顺序。
 */
export function orderPickerCategories<C extends Pick<Category, 'id' | 'sort' | 'name'>>(
  visible: readonly C[],
  frequent: readonly string[],
  lastUsed: ReadonlyMap<string, string>,
  overrides: ReadonlyMap<string, CategoryGroupId> = new Map(),
): C[] {
  const byId = new Map(visible.map((c) => [c.id, c]));
  const out: C[] = [];
  const seen = new Set<string>();
  const push = (c: C | undefined) => {
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  };
  for (const id of frequent) push(byId.get(id));
  [...visible]
    .filter((c) => lastUsed.has(c.id))
    .sort((a, b) => {
      const x = lastUsed.get(a.id)!;
      const y = lastUsed.get(b.id)!;
      return x < y ? 1 : x > y ? -1 : 0;
    })
    .forEach(push);
  for (const key of DEFAULT_FREQUENT_CHECKIN_CATEGORY_KEYS) push(byId.get(BUILTIN_CATEGORY_IDS[key]));
  [...visible].sort(defaultRank(overrides)).forEach(push);
  return out;
}

// ───────────── 搜索（拼音首字母） ─────────────

let pinyinOk: boolean | null = null;
const pinyinCache = new Map<string, { initials: string[][]; full: string }>();

/** 名字的拼音：每个字可能的首字母（非汉字原样一个），和不带空格的全拼。不支持（没有中文排序数据）时只返回原文。 */
export function pinyinOf(s: string): { initials: string[][]; full: string } {
  const hit = pinyinCache.get(s);
  if (hit) return hit;
  if (pinyinOk === null) {
    try {
      pinyinOk = TinyPinyin.isSupported();
    } catch {
      pinyinOk = false;
    }
  }
  const initials: string[][] = [];
  let full = '';
  if (pinyinOk) {
    for (const t of TinyPinyin.parse(s)) {
      if (t.type === 2) {
        const py = t.target.toLowerCase();
        const alts = new Set([py[0] ?? '', ...(POLYPHONE[t.source] ?? '')]);
        initials.push([...alts].filter(Boolean));
        full += py;
      } else {
        for (const ch of t.source.toLowerCase()) {
          if (/\s/.test(ch)) continue;
          initials.push([ch]);
          full += ch;
        }
      }
    }
  } else full = s.toLowerCase().replace(/\s+/g, '');
  const r = { initials, full };
  pinyinCache.set(s, r);
  return r;
}

/** 首字母序列里有没有一段连续的能对上 term（每一位可以是多音字的任一首字母）。 */
function initialsMatch(initials: string[][], term: string): boolean {
  if (!term) return true;
  for (let start = 0; start + term.length <= initials.length; start++) {
    let ok = true;
    for (let k = 0; k < term.length; k++) {
      if (!initials[start + k]!.includes(term[k]!)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * 名字对不对得上搜索词（不分大小写）。names：存着的名字、当前语言显示名、英文名……都给进来。
 * 对得上的：任何一个名字包含搜索词；或者搜索词全是字母，能对上中文名的拼音首字母（yd → 运动）或全拼的一段（yundong）。
 */
export function categoryMatches(names: readonly string[], query: string): boolean {
  const term = query.normalize('NFKC').trim().toLowerCase();
  if (!term) return true;
  const letters = /^[a-z]+$/.test(term);
  for (const n of names) {
    if (!n) continue;
    const low = n.normalize('NFKC').toLowerCase();
    if (low.includes(term)) return true;
    if (letters && /[\u3400-\u9fff]/.test(n)) {
      const py = pinyinOf(n);
      if (initialsMatch(py.initials, term) || py.full.includes(term)) return true;
    }
  }
  return false;
}

/** 搜到的排序分：名字以搜索词开头的最前（0），包含的其次（1），拼音对上的最后（2）。 */
export function categoryMatchRank(names: readonly string[], query: string): number {
  const term = query.normalize('NFKC').trim().toLowerCase();
  let best = 2;
  for (const n of names) {
    const low = (n ?? '').normalize('NFKC').toLowerCase();
    if (low.startsWith(term)) return 0;
    if (low.includes(term)) best = 1;
  }
  return best;
}
