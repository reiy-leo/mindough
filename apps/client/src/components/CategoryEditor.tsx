/**
 * 类型列表（docs/CATEGORY-EDITOR.md 方案 C，Rei 2026-10-28「按方案C执行」）。只在侧栏「管理 → 类型」页（pages/Categories.tsx）用；
 * 设置里不再有类型（Rei 2026-10-28「去掉设置中的入口」）。
 *
 * - 顶上搜索框：打开就聚焦；名字、英文名、拼音首字母都能搜；↑↓ 选、回车打开；没有同名的时最后一行「新建“xxx”」。
 * - 不搜时按分组排（身体、生活、学习和工作、爱好、人、自己建的分组、其他；原叫「大类」，Rei 2026-11-12 改名），组能折叠；「不显示」的沉到最底下一组，变灰。
 * - 每行只有彩色图标块、名字、用了几次，没有按钮。顺序不用手排（Rei 2026-10-28 定：用「常用 + 最近用过」代替手动排序）。
 * - 手机上左滑一行出「常用」「不显示」。
 * - 显示为图标（Rei 2026-11-11 08:33，view='icons'）：每组排成图标格子，名字在图标下面、最多两行；点、回车、↑↓、读屏名和列表一样；
 *   格子里不左滑（改档去详情页）。搜索结果也排成格子。
 * 类型不能删：不想看到就设成不显示（挂着的任务照常显示）。
 * 内置类型（置顶、收藏、紧急、重要，Rei 2026-11-12 04:20 / 04:41）照常列出、能点开，但不能改：手机上不左滑，改档 / 换组直接不做（store 也挡）。
 * 它们单独一组「内置」（Rei 2026-11-12 07:20「分到"内置"分组中，放在最下面」），排在最下面（「不显示」那组也在它上面）；
 * 搜索结果里它们也排在别的类型后面（「新建」那行之前）。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { Button as RacButton, Input, SearchField } from 'react-aria-components';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { BUILTIN_CATEGORY_GROUP, categoryGroupOf, categoryIcon, categoryMatchRank, categoryMatches, isBuiltinCategory, normCategoryName, type Category, type CategoryGroupId, type CategoryState, type Store } from '@mindough/core';
import { IconTile, iconTileGlyphSize } from './IconTile';
import { listTileSize, pinnedTileSize } from '../lib/pinned-tile';
import { categoryNames } from './CategoryPicker';
import { useStore } from '../store/StoreProvider';
import { useUi } from '../lib/ui';
import { dataLabel, tr, trc } from '../lib/i18n';
import { imeBusy } from '../lib/ime';
import { clipName } from '../lib/toast-text';

/** 每个类型挂了多少件任务 + 项目（没删的；顺着合并算到留下的那个）。 */
export function categoryUsage(store: Store): Map<string, number> {
  const m = new Map<string, number>();
  // 一件任务能挂几个类型（Rei 2026-10-28）：每个都算一次
  for (const t of store.list('task')) for (const id of store.categoryIdsOfTask(t)) m.set(id, (m.get(id) ?? 0) + 1);
  for (const g of store.list('group')) {
    const c = store.category(g.category_id);
    if (c) m.set(c.id, (m.get(c.id) ?? 0) + 1);
  }
  return m;
}

/** 分组的名字：内置组走词典，自己建的读 store（给了 store 才认得；认不得的按「其他」）。 */
export function categoryGroupLabel(g: CategoryGroupId, store?: Pick<Store, 'customCategoryGroupName'>): string {
  const custom = store?.customCategoryGroupName(g);
  if (custom) return custom;
  switch (g) {
    case 'body':
      return trc('类型分组', '身体');
    case 'life':
      return trc('类型分组', '生活');
    case 'study':
      return trc('类型分组', '学习和工作');
    case 'hobby':
      return trc('类型分组', '爱好');
    case 'people':
      return trc('类型分组', '人');
    case BUILTIN_CATEGORY_GROUP:
      return trc('类型分组', '内置');
    default:
      return trc('类型分组', '其他');
  }
}

/** 三档的名字。 */
export function categoryStateLabel(s: CategoryState): string {
  return s === 'frequent' ? trc('类型档', '常用') : s === 'normal' ? trc('类型档', '普通') : trc('类型档', '不显示');
}

/** 类型的图标块：底色是类型颜色，图标白色。和项目共用 IconTile（Rei 2026-11-04）。 */
export function CategoryTile({ c, size = 28 }: { c: Pick<Category, 'icon' | 'color'>; size?: number }) {
  return <IconTile icon={categoryIcon(c)} color={c.color} size={size} />;
}

/** 改档 / 换组 / 新建，带「撤销」提示条。 */
export function useCategoryActions() {
  const store = useStore();
  const ui = useUi();
  const setState = (id: string, state: CategoryState) => {
    const c = store.category(id);
    if (!c || store.isCategoryLocked(c.id)) return;
    const prev = store.setCategoryState(id, state);
    if (prev === state) return;
    const name = clipName(dataLabel(c.name));
    const message =
      state === 'frequent' ? tr('已把「{name}」设成常用', { name }) : state === 'hidden' ? tr('已把「{name}」设成不显示', { name }) : tr('已把「{name}」设成普通', { name });
    ui.toast({ message, actions: [{ label: tr('撤销'), onPress: () => store.setCategoryState(id, prev) }] });
  };
  const setGroup = (id: string, group: CategoryGroupId) => {
    const c = store.category(id);
    if (!c || store.isCategoryLocked(c.id)) return;
    const prev = store.categoryGroup(id);
    if (prev === group) return;
    store.setCategoryGroup(id, group);
    ui.toast({ message: tr('已把「{name}」放进「{group}」', { name: clipName(dataLabel(c.name)), group: clipName(categoryGroupLabel(group, store)) }), actions: [{ label: tr('撤销'), onPress: () => store.setCategoryGroup(id, prev) }] });
  };
  return { setState, setGroup };
}

type Row = { kind: 'cat'; c: Category } | { kind: 'create'; name: string };

export interface CategoryListProps {
  selectedId: string | null;
  /** 点一行 / 回车：打开详情。 */
  onOpen: (id: string) => void;
  /** 键盘高亮的那行变了（类型页的 ⌘1/2/3 改它）。 */
  onActive?: (id: string | null) => void;
  /** 手机：左滑出按钮、不自动聚焦搜索框。 */
  mobile?: boolean;
  searchRef?: RefObject<HTMLInputElement | null>;
  /** 显示为：列表（默认）/ 图标格子。 */
  view?: 'list' | 'icons';
  /** 搜索框右边同一行放的控件（类型页的「显示为」下拉，Rei 2026-11-12 类型页去掉页头）。 */
  searchAside?: ReactNode;
}

export function CategoryList({ selectedId, onOpen, onActive, mobile, searchRef, view = 'list', searchAside }: CategoryListProps) {
  const icons = view === 'icons';
  const store = useStore();
  const ui = useUi();
  const { setState } = useCategoryActions();
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [swiped, setSwiped] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const all = store.categories(true);
  const counts = categoryUsage(store);
  const frequent = store.frequentCategoryIds();
  const overrides = store.categoryGroupOverrides();
  const term = q.trim();

  // 搜索结果：对得上的（不显示的也搜得到，好改回来），开头对上的在前，内置类型排在最后（同「内置」组在最下面）；没有同名的就加一行「新建」
  const matches = useMemo(() => {
    if (!term) return null;
    const order = new Map(store.pickerCategories().map((c, i) => [c.id, i]));
    return all
      .filter((c) => categoryMatches(categoryNames(c), term))
      .sort(
        (a, b) =>
          Number(isBuiltinCategory(a)) - Number(isBuiltinCategory(b)) ||
          categoryMatchRank(categoryNames(a), term) - categoryMatchRank(categoryNames(b), term) ||
          (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999),
      );
  }, [all, term, store]);
  const exact = term ? all.find((c) => categoryNames(c).some((n) => normCategoryName(n) === normCategoryName(term))) : undefined;

  // 分组按顺序（内置前五组、自己建的、其他），组里常用的在前、再按原来的顺序；没类型的组不出；不显示的单独一组；
  // 固定的「内置」组（置顶、收藏、紧急、重要）永远在最下面（Rei 2026-11-12 07:20）
  const groupIds = store.categoryGroupIds();
  const sections = useMemo(() => {
    const out: { key: string; label: string; items: Category[] }[] = [];
    const vis = all.filter((c) => !c.hidden);
    const section = (g: string) => {
      const items = vis.filter((c) => categoryGroupOf(c.id, overrides) === g);
      items.sort((a, b) => Number(frequent.includes(b.id)) - Number(frequent.includes(a.id)));
      if (items.length) out.push({ key: g, label: categoryGroupLabel(g, store), items });
    };
    for (const g of groupIds) if (g !== BUILTIN_CATEGORY_GROUP) section(g);
    const hidden = all.filter((c) => c.hidden && categoryGroupOf(c.id, overrides) !== BUILTIN_CATEGORY_GROUP);
    if (hidden.length) out.push({ key: 'hidden', label: trc('类型档', '不显示'), items: hidden });
    section(BUILTIN_CATEGORY_GROUP);
    return out;
  }, [all, overrides, frequent, groupIds, store]);

  const rows: Row[] = matches
    ? [...matches.map((c) => ({ kind: 'cat' as const, c })), ...(exact ? [] : [{ kind: 'create' as const, name: term }])]
    : sections.flatMap((s) => (collapsed.has(s.key) ? [] : s.items.map((c) => ({ kind: 'cat' as const, c }))));
  const rowId = (r: Row) => (r.kind === 'cat' ? r.c.id : 'create');
  const activeIndex = rows.findIndex((r) => rowId(r) === active);

  useEffect(() => onActive?.(active && active !== 'create' ? active : null), [active, onActive]);
  // 搜索词变了：高亮第一行
  useEffect(() => {
    setActive(term ? (rows[0] ? rowId(rows[0]) : null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);
  // 高亮的那行滚进视野
  useEffect(() => {
    if (!active) return;
    listRef.current?.querySelector(`[data-row="${CSS.escape(active)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const create = (name: string) => {
    const taken = store.categoryNameTaken(name);
    const c = store.createCategory(name);
    setQ('');
    onOpen(c.id);
    if (!taken) ui.toast({ tone: 'success', message: tr('已新建「{name}」', { name: clipName(dataLabel(c.name)) }) });
  };
  const press = (r: Row) => (r.kind === 'cat' ? onOpen(r.c.id) : create(r.name));

  const onSearchKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      const i = activeIndex < 0 ? (d > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, activeIndex + d));
      setActive(rowId(rows[i]!));
    } else if (e.key === 'Enter' && !imeBusy(e.nativeEvent)) {
      const r = rows[activeIndex] ?? (term ? rows[0] : undefined);
      if (r) {
        e.preventDefault();
        press(r);
      }
    }
  };

  const toggleSection = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  // 图标格子里的图标块和同端侧栏图标模式一样大（电脑 22、手机 32，lib/pinned-tile）
  const tile = pinnedTileSize(!!mobile);
  // 列表行行首的图标块小一号（电脑 20、手机 24，lib/pinned-tile，Rei 2026-11-12 06:54）
  const listTile = listTileSize(!!mobile);
  const addTile = icons ? tile : listTile;
  const row = (c: Category) =>
    icons ? (
      <CategoryCell
        key={c.id}
        c={c}
        tile={tile}
        count={counts.get(c.id) ?? 0}
        hidden={!!c.hidden}
        selected={selectedId === c.id}
        active={active === c.id}
        onPress={() => {
          setActive(c.id);
          onOpen(c.id);
        }}
      />
    ) : (
    <CategoryRow
      key={c.id}
      c={c}
      tile={listTile}
      count={counts.get(c.id) ?? 0}
      state={c.hidden ? 'hidden' : frequent.includes(c.id) ? 'frequent' : 'normal'}
      selected={selectedId === c.id}
      active={active === c.id}
      mobile={!!mobile && !store.isCategoryLocked(c.id)}
      swiped={swiped === c.id}
      onSwipe={(open) => setSwiped(open ? c.id : null)}
      onPress={() => {
        setActive(c.id);
        onOpen(c.id);
      }}
      onState={(s) => {
        setSwiped(null);
        setState(c.id, s);
      }}
    />
    );

  const search = (
    <SearchField aria-label={tr('搜索类型')} value={q} onChange={setQ} className="cat-search cat-list-search" autoFocus={!mobile}>
      <Search size={14} aria-hidden className="cat-search-icon" />
      <Input
        ref={searchRef}
        className="input"
        placeholder={tr('搜类型，或者输入名字新建')}
        role="combobox"
        aria-expanded
        aria-controls="cat-list-rows"
        aria-activedescendant={active ? `cat-row-${active}` : undefined}
        onKeyDown={onSearchKey}
      />
    </SearchField>
  );

  return (
    <div className="cat-list">
      {searchAside ? (
        <div className="cat-list-search-row">
          {search}
          {searchAside}
        </div>
      ) : (
        search
      )}
      {/* 搜索框不动，下面的行和说明一起滚（类型页上它是唯一会滚的地方，Rei 2026-11-03） */}
      <div className="cat-list-scroll">
      <div className={`cat-list-rows${icons ? ' is-icons' : ''}${mobile ? ' is-touch' : ''}`} style={{ '--cat-tile': `${listTile}px` } as CSSProperties} id="cat-list-rows" role="listbox" aria-label={trc('分类', '类型')} ref={listRef}>
        {matches ? (
          <div className={icons ? 'cat-grid' : 'cat-match-rows'}>
            {matches.map(row)}
            {!exact && (
              <div
                id="cat-row-create"
                data-row="create"
                role="option"
                aria-selected={active === 'create'}
                className={icons ? `cat-cell cat-item-create${active === 'create' ? ' is-active' : ''}` : `cat-item cat-item-create${active === 'create' ? ' is-active' : ''}`}
                onClick={() => create(term)}
              >
                <span className={`icon-tile icon-tile-add${addTile <= 20 ? ' is-small' : ''}`} aria-hidden style={{ '--tile-size': `${addTile}px` } as CSSProperties}>
                  <Plus size={iconTileGlyphSize(addTile)} />
                </span>
                <span className={icons ? 'cat-cell-name' : 'cat-item-name'}>{tr('新建“{q}”', { q: term })}</span>
              </div>
            )}
          </div>
        ) : (
          sections.map((s) => (
            <div key={s.key} className={`cat-section${s.key === 'hidden' ? ' is-hidden-group' : ''}`} role="group" aria-label={s.label}>
              <RacButton className="cat-section-head" aria-expanded={!collapsed.has(s.key)} onPress={() => toggleSection(s.key)}>
                <ChevronDown size={14} aria-hidden className={collapsed.has(s.key) ? 'is-collapsed' : undefined} />
                <span className="cat-section-label">{s.label}</span>
                <span className="cat-section-count">{s.items.length}</span>
              </RacButton>
              {!collapsed.has(s.key) && <div className={icons ? 'cat-grid' : 'cat-section-rows'}>{s.items.map(row)}</div>}
            </div>
          ))
        )}
      </div>
      <p className="foot-note cat-list-note">
        {mobile
          ? icons
            ? tr('类型不能删，不想看到就设成不显示；已经挂着的任务和项目照常显示。')
            : tr('左滑一行可以设成常用或不显示。类型不能删，不想看到就设成不显示。') : tr('↑↓ 选，回车打开；{mod}1、{mod}2、{mod}3 切常用、普通、不显示。类型不能删。', { mod: modKey() })}
      </p>
      </div>
    </div>
  );
}

/** ⌘（Mac）或 Ctrl。 */
export function modKey(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';
}

const SWIPE_W = 168;

/**
 * 图标格子里的一个类型（显示为图标时）：彩色图标块（IconTile，边长同端侧栏图标模式，tile）+ 下面的名字，名字最多两行、超出省略号，title 给全名。
 * 读屏名、点按、键盘高亮和列表的行一样；「常用」不出小标签（格子太窄），不显示的变淡。
 */
function CategoryCell({ c, tile, count, hidden, selected, active, onPress }: { c: Category; tile: number; count: number; hidden: boolean; selected: boolean; active: boolean; onPress: () => void }) {
  const name = dataLabel(c.name);
  const label = count ? tr('{name}，用了 {n} 次', { name, n: count }) : name;
  return (
    <div
      id={`cat-row-${c.id}`}
      data-row={c.id}
      role="option"
      aria-selected={selected || active}
      aria-label={label}
      title={name}
      tabIndex={-1}
      className={`cat-cell${hidden ? ' is-hidden' : ''}${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
      onClick={onPress}
    >
      <CategoryTile c={c} size={tile} />
      <span className="cat-cell-name">{name}</span>
    </div>
  );
}

function CategoryRow({
  c,
  tile,
  count,
  state,
  selected,
  active,
  mobile,
  swiped,
  onSwipe,
  onPress,
  onState,
}: {
  c: Category;
  tile: number;
  count: number;
  state: CategoryState;
  selected: boolean;
  active: boolean;
  mobile: boolean;
  swiped: boolean;
  onSwipe: (open: boolean) => void;
  onPress: () => void;
  onState: (s: CategoryState) => void;
}) {
  const name = dataLabel(c.name);
  const drag = useRef<{ x: number; y: number; dx: number; on: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  const offset = drag.current?.on ? dx : swiped ? -SWIPE_W : 0;
  const down = (e: ReactPointerEvent) => {
    if (!mobile || e.pointerType === 'mouse') return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, on: false };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(mx) < 10) return;
      d.on = true;
    }
    d.dx = Math.min(0, Math.max(-SWIPE_W - 24, mx + (swiped ? -SWIPE_W : 0)));
    setDx(d.dx);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    onSwipe(d.dx < -SWIPE_W / 2);
    setDx(0);
    suppressClick.current = true;
  };
  const suppressClick = useRef(false);
  const label = count ? tr('{name}，用了 {n} 次', { name, n: count }) : name;
  return (
    <div className={`cat-item-wrap${swiped ? ' is-swiped' : ''}${drag.current?.on ? ' is-dragging' : ''}`}>
      {mobile && (
        <div className="cat-swipe-actions" aria-hidden={!swiped}>
          <button type="button" className="cat-swipe-btn is-frequent" tabIndex={swiped ? 0 : -1} onClick={() => onState(state === 'frequent' ? 'normal' : 'frequent')}>
            {state === 'frequent' ? tr('取消常用') : trc('类型档', '常用')}
          </button>
          <button type="button" className="cat-swipe-btn is-hide" tabIndex={swiped ? 0 : -1} onClick={() => onState(state === 'hidden' ? 'normal' : 'hidden')}>
            {state === 'hidden' ? tr('显示') : trc('类型档', '不显示')}
          </button>
        </div>
      )}
      <div
        id={`cat-row-${c.id}`}
        data-row={c.id}
        role="option"
        aria-selected={selected || active}
        aria-label={label}
        tabIndex={-1}
        className={`cat-item${state === 'hidden' ? ' is-hidden' : ''}${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
        style={offset ? ({ transform: `translateX(${offset}px)` } as CSSProperties) : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (swiped) return onSwipe(false);
          onPress();
        }}
      >
        <CategoryTile c={c} size={tile} />
        <span className="cat-item-name">{name}</span>
        {state === 'frequent' && <span className="cat-item-tag">{trc('类型档', '常用')}</span>}
        {count > 0 && <span className="cat-count">{count}</span>}
      </div>
    </div>
  );
}
