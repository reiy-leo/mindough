/**
 * 类型的种子。2026-11-12 起（Rei 04:20「限制只有置顶是内置类型」，04:41 加了收藏、紧急、重要）内置类型只有「置顶」「收藏」「紧急」「重要」四个
 * （BUILTIN_CATEGORIES，锁定、不能改）。
 *
 * 下面 27 个是「原来的内置类型」（原内置打卡分类，Rei 2026-10-15 定的顺序：记录、整理、游戏、玩乐、健康、运动、护肤、清洁、学习、读书、饮食、
 * 作息、冥想、服药、理财、工作、写作、语言、乐器、创作、社交、宠物、植物、采购、个人护理、维护、观影）。现在它们和自己建的类型一样：
 * 能改名、换图标颜色、换分组、改档、设成不显示。
 * - id 固定不变（UUIDv7 格式、时间戳 0，第四段 8001），老数据里任务、项目、打卡指着它们的照旧指着。
 * - 新的空库不再预置它们（Store 打开时只补「置顶」）。只有某件任务 / 项目指着其中一个、本机却没有这一行时，
 *   才按这里的定义补回那一行（内置时间戳，任何真改动都比它新，见 Store.reviveFormerCategories）。演示数据就是这样带出它们的。
 * - 行里的 builtin 列不再表示「锁定」，只表示「原来是内置的」（同名合并时还排在前面）；锁不锁只看 id（categories.ts isBuiltinCategory）。
 * - 名字照旧存中文原名，界面用 dataLabel 按当前语言显示；用户改过名就照用户写的（不固化成某一种语言）。
 */
import type { Category } from '../types';

const cid = (n: number) => `00000000-0000-7000-8001-${String(n).padStart(12, '0')}`;

/** [n, key, 名称, lucide 图标, 颜色] */
const SEED = [
  [1, 'record', '记录', 'notebook-pen', '#5e8bff'],
  [2, 'tidy', '整理', 'archive', '#a2845e'],
  [3, 'game', '游戏', 'gamepad-2', '#7d5fff'],
  [4, 'fun', '玩乐', 'party-popper', '#ff6b9a'],
  [5, 'health', '健康', 'heart-pulse', '#ff453a'],
  [6, 'sport', '运动', 'dumbbell', '#ff9f0a'],
  [7, 'skincare', '护肤', 'sparkles', '#e88ad4'],
  [8, 'clean', '清洁', 'spray-can', '#32ade6'],
  [9, 'study', '学习', 'graduation-cap', '#30b0c7'],
  [10, 'reading', '读书', 'book-open', '#34c759'],
  [11, 'diet', '饮食', 'utensils', '#ff7a45'], // 喝水、做饭
  [12, 'sleep', '作息', 'alarm-clock', '#5856d6'], // 早睡早起
  [13, 'meditation', '冥想', 'flower-2', '#af52de'],
  [14, 'medicine', '服药', 'pill', '#ff3b6b'], // 补剂
  [15, 'finance', '理财', 'wallet', '#c69c2b'], // 记账、还款
  [16, 'work', '工作', 'briefcase', '#636e7b'], // 周报、复盘
  [17, 'writing', '写作', 'pen-line', '#3a7bd5'],
  [18, 'language', '语言', 'languages', '#0fa3b1'],
  [19, 'instrument', '乐器', 'guitar', '#d4813d'],
  [20, 'create', '创作', 'palette', '#e0569b'], // 画画、摄影
  [21, 'social', '社交', 'users', '#ff8a5c'], // 联系家人朋友
  [22, 'pet', '宠物', 'paw-print', '#b07d4f'],
  [23, 'plant', '植物', 'sprout', '#4caf50'], // 浇水
  [24, 'shopping', '采购', 'shopping-cart', '#f5a623'], // 补日用品
  [25, 'personal-care', '个人护理', 'scissors', '#9c6ade'], // 剪发、剪指甲
  [26, 'maintenance', '维护', 'wrench', '#7a8a99'], // 备份、换滤芯、保养
  [27, 'watch', '观影', 'tv', '#e5484d'], // 追剧
] as const;

type SeedKey = (typeof SEED)[number][1];

/** 原来的 27 个内置类型的 id（key → id）。 */
export const FORMER_BUILTIN_CATEGORY_IDS = Object.fromEntries(SEED.map(([n, key]) => [key, cid(n)])) as Record<SeedKey, string>;
/** @deprecated 旧名字，等同 FORMER_BUILTIN_CATEGORY_IDS（2026-11-12 起它们不再是内置的）。 */
export const BUILTIN_CATEGORY_IDS = FORMER_BUILTIN_CATEGORY_IDS;
/** @deprecated 旧名字（打卡分类时代），同一份 id。 */
export const BUILTIN_CHECKIN_CATEGORY_IDS = FORMER_BUILTIN_CATEGORY_IDS;

/** 原来的 27 个内置类型的定义（老数据缺行时按它补回；新库不预置）。 */
export const FORMER_BUILTIN_CATEGORIES: readonly Category[] = SEED.map(([n, , name, icon, color], i) => ({
  id: cid(n),
  updated_at: '0000000000000-0000-builtin',
  deleted: false,
  name,
  icon,
  color,
  builtin: true,
  hidden: false,
  sort: i + 1,
  merged_into: null,
}));
const FORMER_BY_ID = new Map(FORMER_BUILTIN_CATEGORIES.map((c) => [c.id, c]));
/** 原来内置的那一行的定义（不是原内置 id 返回 undefined）。 */
export const formerBuiltinCategory = (id: string | null | undefined): Category | undefined => (id ? FORMER_BY_ID.get(id) : undefined);

/**
 * 内置类型「置顶」（Rei 2026-11-12 03:44「置顶任务应该用"类型"，一个叫做"置顶"的类型」、03:46「有置顶类型就置顶。没就不置顶」）。
 * 任务挂了它就是置顶，没挂就不置顶（见 Store.pinnedAt）。
 * 不在上面 27 个的 SEED 里：它不进任何默认分组（落在「其他」），也不进「常用」的默认几个。id 号 28，永不复用。
 * 2026-11-12 04:20 起它是唯一的内置类型：类型页照常列出、能点开看，但名字、图标、颜色、分组、档位都不能改（Store 里也挡住），
 * 老客户端改过的，新客户端打开或同步到时改回这里的定义（Store.settlePinCategory）。
 */
export const PIN_CATEGORY_ID = cid(28);
export const PIN_CATEGORY: Category = {
  id: PIN_CATEGORY_ID,
  updated_at: '0000000000000-0000-builtin',
  deleted: false,
  name: '置顶',
  icon: 'pin',
  color: '#ff3b30',
  builtin: true,
  hidden: false,
  sort: SEED.length + 1,
  merged_into: null,
};
/**
 * 标记类的内置类型（Rei 2026-11-12 04:41「内置类型再添加几个"收藏"（任务列表中任务标题是黑黄色）、"紧急"（……黑红色）、"重要"（……黑蓝色）」）。
 * 挂了它们的任务，任务列表里标题文字变色（同时挂了几个，紧急 > 重要 > 收藏，见 MARK_ORDER）。和「置顶」一样锁定、不当主类型、
 * 按类型分区时不单独成段。id 号 29–31，永不复用。图标块的颜色只用在类型页、选择器里；标题的颜色在客户端按皮肤和亮暗定。
 */
export const STAR_CATEGORY_ID = cid(29);
export const URGENT_CATEGORY_ID = cid(30);
export const IMPORTANT_CATEGORY_ID = cid(31);
const mark = (id: string, name: string, icon: string, color: string, sort: number): Category => ({
  id,
  updated_at: '0000000000000-0000-builtin',
  deleted: false,
  name,
  icon,
  color,
  builtin: true,
  hidden: false,
  sort,
  merged_into: null,
});
export const STAR_CATEGORY = mark(STAR_CATEGORY_ID, '收藏', 'star', '#f5a623', SEED.length + 2);
export const URGENT_CATEGORY = mark(URGENT_CATEGORY_ID, '紧急', 'siren', '#e5484d', SEED.length + 3);
export const IMPORTANT_CATEGORY = mark(IMPORTANT_CATEGORY_ID, '重要', 'flag', '#0a84ff', SEED.length + 4);

/** 标题标记：哪个类型 → 哪种颜色。 */
export type TitleMark = 'urgent' | 'important' | 'star';
/** 同时挂了几个时谁说了算：紧急 > 重要 > 收藏（Rei 没说，代定：越急越该先看见）。 */
export const MARK_ORDER: readonly [TitleMark, string][] = [
  ['urgent', URGENT_CATEGORY_ID],
  ['important', IMPORTANT_CATEGORY_ID],
  ['star', STAR_CATEGORY_ID],
];

/** 内置类型：置顶、收藏、紧急、重要（新库只预置这四个，都锁定）。 */
export const BUILTIN_CATEGORIES: readonly Category[] = [PIN_CATEGORY, STAR_CATEGORY, URGENT_CATEGORY, IMPORTANT_CATEGORY];
const BUILTIN_BY_ID = new Map(BUILTIN_CATEGORIES.map((c) => [c.id, c]));
/** 内置类型的定义（不是内置的 id 返回 undefined）。 */
export const builtinCategoryDef = (id: string | null | undefined): Category | undefined => (id ? BUILTIN_BY_ID.get(id) : undefined);
/** @deprecated 旧名字（打卡分类时代）。 */
export const BUILTIN_CHECKIN_CATEGORIES = BUILTIN_CATEGORIES;

/**
 * 原来的内置类型的默认分组（原叫大类；docs/CATEGORY-EDITOR.md 方案 C，Rei 2026-10-28 按默认）。组 id 见 category-prefs.ts 的 CATEGORY_GROUPS。
 * 用户改过的存同步偏好 category.groups，不改这里。
 */
const GROUP_OF: Record<SeedKey, 'body' | 'life' | 'study' | 'hobby' | 'people'> = {
  health: 'body', sport: 'body', sleep: 'body', meditation: 'body', medicine: 'body', skincare: 'body', 'personal-care': 'body', diet: 'body',
  tidy: 'life', clean: 'life', shopping: 'life', maintenance: 'life', plant: 'life', pet: 'life', finance: 'life',
  study: 'study', reading: 'study', writing: 'study', language: 'study', work: 'study', record: 'study',
  game: 'hobby', fun: 'hobby', watch: 'hobby', instrument: 'hobby', create: 'hobby',
  social: 'people',
};
/** 原来的内置类型 id → 默认分组（改到别的组存偏好，见 category-prefs.ts）。 */
export const BUILTIN_CATEGORY_GROUPS: Record<string, 'body' | 'life' | 'study' | 'hobby' | 'people'> = Object.fromEntries(
  SEED.map(([n, key]) => [cid(n), GROUP_OF[key]]),
);

/** 还没用过几个分类时，「常用」先放这几个（按日常最常见的打卡）。 */
export const DEFAULT_FREQUENT_CHECKIN_CATEGORY_KEYS: readonly SeedKey[] = ['health', 'sport', 'study', 'reading', 'diet', 'sleep'];

/**
 * 「常用」分类：先按用到它的重复任务件数（多的在前，件数一样按最近一次用到），再用默认几个补齐到 n 个。
 * 只返回 visible 里的（隐藏的不算常用）。纯函数，界面经 Store.frequentCheckInCategories 调用。
 */
export function pickFrequentCategories<C extends { id: string }>(
  visible: readonly C[],
  usage: readonly { categoryId: string | null; at: string }[],
  n = 6,
): C[] {
  const byId = new Map(visible.map((c) => [c.id, c]));
  const stat = new Map<string, { count: number; last: string }>();
  for (const u of usage) {
    if (!u.categoryId || !byId.has(u.categoryId)) continue;
    const s = stat.get(u.categoryId) ?? { count: 0, last: '' };
    s.count++;
    if (u.at > s.last) s.last = u.at;
    stat.set(u.categoryId, s);
  }
  const used = [...stat.entries()]
    .sort((a, b) => b[1].count - a[1].count || (a[1].last < b[1].last ? 1 : a[1].last > b[1].last ? -1 : 0))
    .map(([id]) => byId.get(id)!);
  const out = used.slice(0, n);
  for (const key of DEFAULT_FREQUENT_CHECKIN_CATEGORY_KEYS) {
    if (out.length >= n) break;
    const c = byId.get(FORMER_BUILTIN_CATEGORY_IDS[key]);
    if (c && !out.includes(c)) out.push(c);
  }
  for (const c of visible) {
    if (out.length >= n) break;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}
