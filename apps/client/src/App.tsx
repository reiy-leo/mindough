import { installStrictGuard, useStrictSync } from './lib/strict';
import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button as RacButton } from 'react-aria-components';
import { Calendar, CalendarCheck2, CalendarClock, CircleCheck, ChevronRight, Hourglass, Library, Menu, MoreHorizontal, NotebookPen, Search, Settings, Inbox, Shapes, Sun, Tags, X, type LucideIcon } from 'lucide-react';
import { href, navigate, useRoute, type Route, type SettingsSection } from './lib/router';
import { dayItems } from './lib/myday-items';
import { openSettingsWindow } from './lib/windows';
import { isTauri } from './store/sqlite-tauri';
import { useSettings } from './lib/settings';
import { effectiveToastPosition } from './lib/toast-position';
import { useUi } from './lib/ui';
import { getAccount } from './lib/account';
import { getSyncView, syncNow } from './lib/sync';
import { createDoubleTap, tapSyncGate, tapSyncResult, type TapSyncToast } from './lib/tab-sync';
import { useStore } from './store/StoreProvider';
import { MyDayPage } from './pages/MyDay';
import { CalendarPage } from './pages/Calendar';
import { BacklogPage } from './pages/Backlog';
import { GroupDetailPage, GroupsPage } from './pages/Groups';
import { PersonDetailPage } from './pages/People';
import { LibraryItemPage, LibraryPage } from './pages/Library';
import { BUILTIN_TYPE_IDS, libraryCopy, type Group, type Store } from '@mindough/core';
import { activeGroupEntry, activeLibraryEntry, groupIconName, isMobileTab, libraryRoute, manageEntries, mobileTabItems, planEntries } from './lib/nav';
import { typeIcon } from './lib/icons';
import { librarySidebarAction } from './lib/library-sidebar';
import { useColorLevel, useDetailTint, vividVar } from './lib/color-level';
import { GroupIcon } from './components/project/GroupIcon';
import { useProjectActions } from './components/project/ProjectActions';
import { DoablePage } from './pages/Doable';
import { CheckInsPage } from './pages/CheckIns';
import { CountdownsPage } from './pages/Countdowns';
import { createBlankTask, sweepBlankTasks } from './lib/blank-task';
import { SettingsPage } from './pages/Settings';
import { JournalPage } from './pages/Journal';
import { CategoriesPage } from './pages/Categories';
import { DonePage } from './pages/Done';
import { SearchPage } from './pages/Search';
import { TaskDetail } from './components/task/TaskDetail';
import { DetailPane } from './components/task/DetailPane';
import { useMentionSource } from './lib/task-mention';
import { detailInModal, JOURNAL_MIN, listMinFor, paneFits, WIDE_MIN } from './lib/detail-pane';
import { DetailModal } from './components/task/DetailModal';
import { DeepLinks } from './components/DeepLinks';
import { TaskComposer } from './components/task/TaskComposer';
import { CommandPalette } from './components/CommandPalette';
import { toDateKey } from '@mindough/core';
import { todayDefaults } from './lib/quick-add';
import { LoginErrorBanner } from './components/LoginErrorBanner';
import { MovedBanner } from './components/MovedBanner';
import { ReminderHost } from './components/ReminderHost';
import { useLunarSubScheduler } from './lib/lunar';
import { useCalendarSubScheduler } from './lib/calendar-subs';
import { useCountdownRoll } from './lib/countdown-roll';
import { useAutoMyDay } from './lib/myday-auto';
import { MenuAt, OverflowMenu, useContextMenuAt, type MenuAction } from './ui/primitives';
import { NavReorderScope, usePinnedReorder } from './components/NavReorderScope';
import { useAppMenu } from './lib/app-menu';
import { PinnedStyleMenu } from './components/PinnedStyleMenu';
import { pinnedGrid, type PinnedStyleKind } from './lib/pinned-style';
import { PINNED_LINE_ICON, pinnedGroupIconSize } from './lib/pinned-tile';

const DidaImportSheet = lazy(() => import('./components/DidaImport').then((m) => ({ default: m.DidaImportSheet })));

import { appName, tr, trc } from './lib/i18n';
import { typingKey } from './lib/ime';
import { isSearchShortcut, searchKeyLabel } from './lib/global-keys';
import { mobileTopbar } from './lib/mobile-topbar';
import { TOPBAR_LEAD_ID, TOPBAR_SLOT_ID } from './lib/topbar-slot';
interface NavItem {
  page: Route['page'];
  label: string;
  icon: LucideIcon;
  match: Route['page'][];
  /** 列表里的 key；省略 = page。放进侧边栏的库是 lib:<类型 id>。 */
  key?: string;
  /** 点了去哪；省略 = { page }。 */
  to?: Route;
  /** 自己判断亮不亮（资料库和放进侧边栏的库）；省略 = 看 match。 */
  activeFor?: (route: Route) => boolean;
  /** 放进侧边栏的库：类型 id（右键菜单「取消在侧边栏显示」用）。 */
  libraryId?: string;
  /** 放进侧边栏的项目：项目 id（同上，Rei 2026-10-28）。 */
  groupId?: string;
}

/**
 * 导航分区（Rei 2026-10-16：「侧边栏分一下section，太乱了」）：
 * 今天（要动手的）· 计划（怎么安排）· 持续（天天记、慢慢攒的）· 管理（资料库、放进侧边栏的库、类型）；设置固定在底部。手机标签栏是固定几项（lib/nav.ts MOBILE_TABS），其余放进「更多」并分同样的组。
 * 「管理」（Rei 2026-10-26 18:02「主窗口侧边栏的“资料”section，更改成“管理”，任务入口删掉，添加一个“类型”入口」）：原来叫「资料」；
 *   小节 id 还是 library（本机记的收起状态不丢）。小节里本来没有「任务」入口，只加了「类型」。
 * 「已完成」（Rei 2026-11-08「侧边栏 管理 添加一个"已完成"入口」）：排在「类型」下面，完成和关闭的任务按结束时间列出（pages/Done.tsx）。
 * 「人物」入口删掉（Rei 2026-10-26 18:54「侧边栏的：管理-人物入口删掉」）：人物页、#/people、深链、⌘K 都照旧，从资料库标签条「人物」进。
 * 放进侧边栏的库（Rei 2026-10-26 18:55「资料库中，任何一个资料库都可以“在侧边栏显示”，“取消在侧边栏显示”」）：
 *   排在「资料库」下面，按资料库顺序；存同步偏好（core LIBRARY_SIDEBAR_PREF），所以这一节由 navSections(store) 现算。
 * 「持续」（Rei 2026-10-26「把倒数日从“打卡”中拆出来单独一个侧边栏入口，把打卡、倒数日、日记放在另一个section：持续」）：打卡、倒数日、日记。
 */
interface NavSection {
  id: 'today' | 'plan' | 'ongoing' | 'library';
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'today',
    get title() { return tr('今天'); },
    items: [
      { page: 'myday', get label() { return tr('我的一天'); }, icon: Sun, match: ['myday'] },
      { page: 'backlog', get label() { return tr('等待安排'); }, icon: Inbox, match: ['backlog'] },
      { page: 'doable', get label() { return tr('过期积压'); }, icon: CalendarClock, match: ['doable'] },
    ],
  },
  {
    id: 'plan',
    get title() { return tr('计划'); },
    items: [
      { page: 'agenda', get label() { return trc('导航', '日历'); }, icon: Calendar, match: ['agenda'] },
      { page: 'groups', get label() { return trc('导航', '项目'); }, icon: Shapes, match: ['groups', 'group'] },
    ],
  },
  {
    id: 'ongoing',
    get title() { return trc('导航', '持续'); },
    items: [
      { page: 'checkin', get label() { return trc('导航', '打卡'); }, icon: CalendarCheck2, match: ['checkin'] },
      { page: 'countdown', get label() { return tr('倒数日'); }, icon: Hourglass, match: ['countdown'] },
      // 日记：手机标签栏第四项（Rei 2026-11-10；以前在「更多」里）
      { page: 'journal', get label() { return tr('日记'); }, icon: NotebookPen, match: ['journal'] },
    ],
  },
  {
    id: 'library',
    get title() { return trc('导航', '管理'); },
    items: [
      { page: 'library', get label() { return tr('资料库'); }, icon: Library, match: ['library', 'libitem', 'people', 'person'] },
      { page: 'types', get label() { return trc('分类', '类型'); }, icon: Tags, match: ['types'] },
      { page: 'done', get label() { return trc('导航', '已完成'); }, icon: CircleCheck, match: ['done'] },
    ],
  },
];
const NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);
const LIBRARY_ITEM = NAV.find((n) => n.page === 'library')!;
const AGENDA_ITEM = NAV.find((n) => n.page === 'agenda')!;
const GROUPS_ITEM = NAV.find((n) => n.page === 'groups')!;
const TYPES_ITEM = NAV.find((n) => n.page === 'types')!;
const DONE_ITEM = NAV.find((n) => n.page === 'done')!;

/** 侧边栏各节；「计划」一节带上放进侧边栏的项目（lib/nav.ts planEntries），「管理」一节带上放进侧边栏的库（manageEntries）。 */
function navSections(store: Store): NavSection[] {
  const pinned = store.sidebarLibraries();
  const pinnedIds = pinned.map((t) => t.id);
  const pinnedGroups = store.sidebarGroups();
  const pinnedGroupIds = pinnedGroups.map((g) => g.id);
  return NAV_SECTIONS.map((sec) => {
    if (sec.id === 'plan') {
      const items = planEntries(pinnedGroups).map((e): NavItem => {
        if (e.kind === 'agenda') return AGENDA_ITEM;
        if (e.kind === 'groups') return { ...GROUPS_ITEM, activeFor: (r) => activeGroupEntry(r, pinnedGroupIds) === 'groups' };
        const g = pinnedGroups.find((x) => x.id === e.groupId)!;
        return {
          key: `group:${g.id}`,
          page: 'group',
          to: { page: 'group', id: g.id },
          label: g.name,
          icon: typeIcon(groupIconName(g.icon)) as LucideIcon,
          match: [],
          activeFor: (r) => activeGroupEntry(r, pinnedGroupIds) === g.id,
          groupId: g.id,
        };
      });
      return { id: sec.id, title: sec.title, items };
    }
    if (sec.id !== 'library') return sec;
    const items = manageEntries(pinned).map((e): NavItem => {
      if (e.kind === 'library') return { ...LIBRARY_ITEM, activeFor: (r) => activeLibraryEntry(r, pinnedIds) === 'library' };
      if (e.kind === 'types') return TYPES_ITEM;
      if (e.kind === 'done') return DONE_ITEM;
      const t = pinned.find((x) => x.id === e.typeId)!;
      const to = libraryRoute(t.id);
      return {
        key: `lib:${t.id}`,
        page: to.page,
        to,
        label: libraryCopy(t).short,
        icon: typeIcon(t.icon) as LucideIcon,
        match: [],
        activeFor: (r) => activeLibraryEntry(r, pinnedIds) === t.id,
        libraryId: t.id,
      };
    });
    return { id: sec.id, title: sec.title, items };
  });
}
const SETTINGS: NavItem = { page: 'settings', get label() { return tr('设置'); }, icon: Settings, match: ['settings'] };
/** 搜索页（Rei 2026-11-12）：手机「更多」页最上面一行进（标签栏是定好的四项 + 更多，不加第五项）；宽屏侧栏顶上照旧是 ⌘F 浮层。 */
const SEARCH: NavItem = { page: 'search', get label() { return tr('搜索'); }, icon: Search, match: ['search'] };
/** 有任务列表的页面：宽屏上右列常驻（没选中时是空状态）；别的页面（日记、资料库、设置…）只在打开任务时才出现右列。
 *  项目总览页（groups）只有项目卡片，不算（Rei 2026-11-11「项目列表页 不显示任务详情侧边栏」，详情走浮层，见 detailInModal）。 */
const LIST_PAGES: Route['page'][] = ['myday', 'backlog', 'agenda', 'group', 'doable', 'checkin', 'countdown', 'done'];
const COLLAPSED_KEY = 'mindough:nav_collapsed';

function useCollapsed() {
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      return next;
    });
  return [collapsed, toggle] as const;
}

/** 窗口是不是比宽屏窄（中等宽度：侧边栏收成图标栏）。 */
function useNarrow(): boolean {
  const query = `(max-width: ${WIDE_MIN - 0.02}px)`;
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** 日记页右列放不放得下（lib/detail-pane paneFits，看窗口宽度）；只在跨过分界时重渲染。 */
function useJournalPaneFits(): boolean {
  const [fits, setFits] = useState(() => paneFits(window.innerWidth, JOURNAL_MIN));
  useEffect(() => {
    const on = () => setFits(paneFits(window.innerWidth, JOURNAL_MIN));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return fits;
}

function NavLink({ item, active, badge, onOpen, compact, rail }: { item: NavItem; active: boolean; badge?: number; onOpen?: () => void; compact?: boolean; rail?: boolean }) {
  if (item.libraryId || item.groupId) return <PinnedLink item={item} active={active} compact={compact} rail={rail} />;
  const Icon = item.icon;
  return (
    <a
      href={href(item.to ?? ({ page: item.page } as Route))}
      draggable={false}
      onClick={
        onOpen
          ? (e) => {
              e.preventDefault();
              onOpen();
            }
          : undefined
      }
      className={`nav-item${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} title={item.label}>
      <span className="nav-icon">
        <Icon size={18} />
      </span>
      <span className="nav-label">{item.label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </a>
  );
}

/** 放进侧边栏的库 / 项目：缩进一点挂在「资料库」/「项目」下面；列表里行右边 ··· 开菜单（2026-11-11），图标样式 / 图标栏右键。 */
function PinnedLink({ item, active, compact, rail }: { item: NavItem; active: boolean; compact?: boolean; rail?: boolean }) {
  const store = useStore();
  const g = item.groupId ? store.get('group', item.groupId) : null;
  // 列表样式：项目菜单从行右边的 ··· 进，不再右键 / 长按（Rei 2026-11-11 02:56）；图标样式、960 图标栏没地方放 ···，照旧右键 / 长按
  if (g) return compact || rail ? <PinnedGroupLink item={item} active={active} group={g} compact={compact} /> : <PinnedGroupRow item={item} active={active} group={g} />;
  // 资料库那一串同样（Rei 2026-11-11 04:27）：列表里行右边 ···，960 图标栏照旧右键
  // 「显示为：图标」（Rei 2026-11-12）同项目：只放图标，右键 / 长按出菜单
  return compact || rail ? <PinnedLibraryLink item={item} active={active} compact={compact} /> : <PinnedLibraryRow item={item} active={active} />;
}

/**
 * 放进侧边栏的项目，列表样式（Rei 2026-11-11 02:56「添加到侧边栏的项目，右键菜单换成右侧的『···』」）：
 * 行右边一个 ···，点开就是项目页那个菜单（编辑、在侧边栏显示、归档、解散、删除）；有鼠标时悬停这一行或键盘聚焦才显示，触屏常显（同「项目」那行的 ···）。
 * 不再有右键菜单（全局拦掉了浏览器自带的，右键什么也不出），手指长按只管拖动排序，拿起没挪松开什么也不做。
 * 拖动排序挂在外面这层 div 上（lib/nav-reorder 认直接子元素），··· 跟着整行一起挪；按 ··· 不会拿起这一行。
 */
function PinnedGroupRow({ item, active, group }: { item: NavItem; active: boolean; group: Group }) {
  const store = useStore();
  const actions = useProjectActions(store, group);
  return (
    <PinnedNavRow item={item} active={active} reorderId={group.id} items={actions.items} icon={<GroupIcon group={group} size={18} />}>
      {actions.dialogs}
    </PinnedNavRow>
  );
}

/**
 * 放进侧边栏的资料库，列表样式（Rei 2026-11-11 04:27，照置顶项目做）：行右边 ··· 开原来那个菜单（取消在侧边栏显示），
 * 不再右键 / 长按出菜单；长按只拖动排序。960 图标栏照旧右键（PinnedLibraryLink）。
 */
function PinnedLibraryRow({ item, active }: { item: NavItem; active: boolean }) {
  const store = useStore();
  const Icon = item.icon;
  const t = item.libraryId ? store.get('task_type', item.libraryId) : null;
  const action = t ? librarySidebarAction(store, t) : null;
  const colorLevel = useColorLevel();
  return (
    <PinnedNavRow
      item={item}
      active={active}
      reorderId={item.libraryId}
      items={action ? [action] : []}
      icon={<Icon size={18} />}
      iconStyle={vividVar(colorLevel, t?.color)}
    />
  );
}

/** 侧栏置顶项目 / 资料库的一行（列表样式）：外层 div 挂拖动排序，里面链接 + 右边 ···。 */
function PinnedNavRow({
  item,
  active,
  reorderId,
  items,
  icon,
  iconStyle,
  children,
}: {
  item: NavItem;
  active: boolean;
  reorderId: string | undefined;
  items: MenuAction[];
  icon: ReactNode;
  iconStyle?: CSSProperties | undefined;
  children?: ReactNode;
}) {
  const reorder = usePinnedReorder(reorderId);
  return (
    <div className="nav-item-split nav-pinned-row" {...reorder.props}>
      <a
        href={href(item.to!)}
        draggable={false}
        data-reorder-shape
        className={`nav-item nav-item-sub${active ? ' is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        title={item.label}
      >
        <span className="nav-icon" style={iconStyle}>
          {icon}
        </span>
        <span className="nav-label">{item.label}</span>
      </a>
      {items.length > 0 && <RowMoreMenu label={tr('「{name}」的更多操作', { name: item.label })} items={items} className="nav-item-more" />}
      {children}
    </div>
  );
}

/** 置顶项目行右边的 ···：按下、按键不往外传，免得被外层当成拖动排序（长按拿起、⌥↑ / ⌥↓）。 */
function RowMoreMenu({ label, items, className }: { label: string; items: MenuAction[]; className: string }) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <span className="row-more-slot" onPointerDown={stop} onKeyDown={stop} onContextMenu={stop}>
      <OverflowMenu label={label} items={items} icon={<MoreHorizontal size={16} aria-hidden />} className={className} />
    </span>
  );
}

/** 放进侧边栏的项目，图标样式 / 960 图标栏：没地方放 ···，右键 / 长按出项目页那个菜单（Rei 2026-11-01）。 */
/** compact：「显示为：图标」时只放图标（Rei 2026-11-11），名字在悬停提示和读屏名里；手指长按没挪松开出的菜单顶上写项目名。 */
function PinnedGroupLink({ item, active, group, compact }: { item: NavItem; active: boolean; group: Group; compact?: boolean }) {
  const store = useStore();
  // 能拖动排序时（Rei 2026-11-10，components/NavReorderScope）：手指长按由拖动接管，拿起没挪就松开再开这个菜单
  const menu = useContextMenuAt({ longPress: false });
  const reorder = usePinnedReorder(group.id, { onContextMenu: menu.props.onContextMenu, openMenu: menu.open });
  const actions = useProjectActions(store, group);
  // 素净档项目图标和资料库图标一样大（Rei 2026-11-12，lib/pinned-tile pinnedGroupIconSize）
  const plain = useColorLevel() === 'plain';
  return (
    <>
      <a
        href={href(item.to!)}
        draggable={false}
        {...menu.props}
        {...reorder.props}
        onClick={(e) => {
          if (menu.consumeLongPress()) e.preventDefault();
        }}
        className={`nav-item nav-item-sub${compact ? ' nav-item-tile' : ''}${active ? ' is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-label={compact ? item.label : undefined}
        title={item.label}
      >
        <span className="nav-icon">
          <GroupIcon group={group} size={compact ? pinnedGroupIconSize(false, plain) : 18} />
        </span>
        {!compact && <span className="nav-label">{item.label}</span>}
      </a>
      <MenuAt at={menu.at} label={item.label} heading={compact ? item.label : undefined} items={actions.items} onClose={menu.close} />
      {actions.dialogs}
    </>
  );
}

/** 放进侧边栏的资料库，图标样式 / 960 图标栏：没地方放 ···，照旧右键出「取消在侧边栏显示」。
 *  compact：「显示为：图标」时只放图标（Rei 2026-11-12，同项目），名字在悬停提示和读屏名里；手指长按没挪松开出的菜单顶上写名字。 */
function PinnedLibraryLink({ item, active, compact }: { item: NavItem; active: boolean; compact?: boolean | undefined }) {
  const store = useStore();
  const menu = useContextMenuAt({ longPress: false });
  const reorder = usePinnedReorder(item.libraryId, { onContextMenu: menu.props.onContextMenu, openMenu: menu.open });
  const Icon = item.icon;
  const t = item.libraryId ? store.get('task_type', item.libraryId) : null;
  const action = t ? librarySidebarAction(store, t) : null;
  // 多彩档（色彩设置，Rei 2026-11-09）：置顶的资料库图标用类型颜色
  const colorLevel = useColorLevel();
  return (
    <>
      <a
        href={href(item.to!)}
        draggable={false}
        {...menu.props}
        {...reorder.props}
        onClick={(e) => {
          if (menu.consumeLongPress()) e.preventDefault();
        }}
        className={`nav-item nav-item-sub${compact ? ' nav-item-tile' : ''}${active ? ' is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-label={compact ? item.label : undefined}
        title={item.label}
      >
        <span className="nav-icon" style={vividVar(colorLevel, t?.color)}>
          <Icon size={compact ? PINNED_LINE_ICON.desktop : 18} />
        </span>
        {!compact && <span className="nav-label">{item.label}</span>}
      </a>
      {action && <MenuAt at={menu.at} label={item.label} heading={compact ? item.label : undefined} items={[action]} onClose={menu.close} />}
    </>
  );
}

/**
 * 页面本体不跟着 App 重渲染（2026-11-12 看板卡顿）：App 订阅整个 UI 状态，点开 / 关掉一件任务的详情 App 就重渲染一遍；
 * 以前页面也跟着整页重来（240 件的看板点一下卡片要 0.5–1 秒）。route 只在换页时换对象（lib/router useRoute），
 * 页面自己订阅 Store、设置、UI，数据变了照样更新。
 */
const Page = memo(function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'myday':
      return <MyDayPage />;
    case 'agenda':
      return <CalendarPage />;
    case 'backlog':
      return <BacklogPage />;
    case 'groups':
      return <GroupsPage />;
    case 'group':
      return <GroupDetailPage id={route.id} />;
    case 'people':
      // 人物库：资料库里的「人物」
      return <LibraryPage typeId={BUILTIN_TYPE_IDS.person} />;
    case 'library':
      return <LibraryPage {...(route.typeId ? { typeId: route.typeId } : {})} />;
    case 'libitem':
      return <LibraryItemPage typeId={route.typeId} id={route.id} />;
    case 'person':
      return <PersonDetailPage id={route.id} />;
    case 'doable':
      return <DoablePage />;
    case 'checkin':
      return <CheckInsPage />;
    case 'countdown':
      return <CountdownsPage />;
    case 'journal':
      return <JournalPage {...(route.date ? { date: route.date } : {})} />;
    case 'settings':
      return <SettingsPage {...(route.section ? { section: route.section } : {})} />;
    case 'types':
      return <CategoriesPage {...(route.id ? { id: route.id } : {})} />;
    case 'done':
      return <DonePage />;
    case 'more':
      return <MorePage />;
    case 'search':
      return <SearchPage />;
  }
});

/**
 * 手机顶栏（Rei 2026-11-12 09:41「页面都不用header」）：不写页名，左格（我的一天的日期 + 农历）、右格（页面送上来的按钮）由页面用
 * lib/topbar-slot 填。两格都空就加 is-empty，收成只剩状态栏那一截，顶上不空出一行；只有按钮加 no-lead，矮一点；读屏的页名放 sr-only。
 */
function MobileTopbarRow({ label }: { label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'' | ' is-empty' | ' no-lead'>('');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const lead = !!el.querySelector('.topbar-lead > *');
      const acts = !!el.querySelector('.topbar-actions > *');
      setState(lead ? '' : acts ? ' no-lead' : ' is-empty');
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return (
    <div ref={ref} className={`topbar${state}`}>
      <span className="sr-only">{label}</span>
      <span className="topbar-lead" id={TOPBAR_LEAD_ID} />
      <span className="topbar-actions" id={TOPBAR_SLOT_ID} />
    </div>
  );
}

function MorePage() {
  const store = useStore();
  const sections = [
    // 搜索放最上面一行，自成一组（Rei 2026-11-12：手机各页不再有搜索按钮）
    { id: 'search', title: '', items: [SEARCH] },
    ...navSections(store).map((sec) => ({ id: sec.id, title: sec.title, items: sec.items.filter((n) => n.key || !isMobileTab(n.page)) })),
    { id: 'settings', title: '', items: [SETTINGS] },
  ].filter((sec) => sec.items.length > 0);
  return (
    <div className="page">
      {/* 手机不放页头（Rei 2026-11-12 09:41「页面都不用header」），读屏留 h1 */}
      <h1 className="sr-only">{tr('更多')}</h1>
      {sections.map((sec) => (
        <section key={sec.id} className="more-section" aria-label={sec.title || sec.items[0]?.label}>
          {sec.title && <h2 className="more-section-title">{sec.title}</h2>}
          <div className="card more-list">
            <PinnedScope items={sec.items}>
              <MoreItems items={sec.items} />
            </PinnedScope>
          </div>
        </section>
      ))}
    </div>
  );
}

/** 一行属于哪一串置顶：项目 / 资料库，别的行不算。 */
function pinnedKindOf(n: NavItem): PinnedStyleKind | null {
  return n.groupId ? 'group' : n.libraryId ? 'library' : null;
}

/** 「项目」/「资料库」那行（不是放进来的某一个）：这一串有东西时右边放 ··· 切「显示为」。 */
function anchorKindOf(n: NavItem): PinnedStyleKind | null {
  if (n.key) return null;
  return n.page === 'groups' ? 'group' : n.page === 'library' ? 'library' : null;
}

const PINNED_GRID_LABEL: Record<PinnedStyleKind, () => string> = {
  group: () => tr('放进侧边栏的项目'),
  library: () => tr('放进侧边栏的资料库'),
};

/**
 * 侧栏一节里的项（Rei 2026-11-11 项目「显示为：列表 / 图标」，2026-11-12 资料库也跟上）：放进侧栏的项目 / 资料库各连成一串；
 * 这一串选了图标（且不是中等宽度的图标栏）时，包进一个会折行的网格（data-reorder-layout="grid"，拖动排序按网格算）。
 * 有放进来的项目 / 资料库时，「项目」/「资料库」那行右边多一个 ···（PinnedStyleMenu），两串各管各的设置。
 */
function SidebarItems({ items, narrow, render }: { items: NavItem[]; narrow: boolean; render: (n: NavItem, compact: boolean) => ReactNode }) {
  const { settings } = useSettings();
  const has = (k: PinnedStyleKind) => items.some((n) => pinnedKindOf(n) === k);
  const out: ReactNode[] = [];
  let run: NavItem[] = [];
  let runKind: PinnedStyleKind | null = null;
  const flush = () => {
    if (!run.length || !runKind) return;
    const k = runKind;
    if (pinnedGrid(settings, k, narrow))
      out.push(
        <div key={`pinned-${k}`} className="nav-pinned-grid" data-reorder-layout="grid" role="group" aria-label={PINNED_GRID_LABEL[k]()}>
          {run.map((n) => render(n, true))}
        </div>,
      );
    else out.push(...run.map((n) => render(n, false)));
    run = [];
    runKind = null;
  };
  for (const n of items) {
    const k = pinnedKindOf(n);
    if (k) {
      if (k !== runKind) flush();
      runKind = k;
      run.push(n);
      continue;
    }
    flush();
    const anchor = anchorKindOf(n);
    if (anchor && has(anchor) && !narrow)
      out.push(
        <div key={`${anchor}-row`} className="nav-item-split">
          {render(n, false)}
          <PinnedStyleMenu kind={anchor} className="nav-item-more" />
        </div>,
      );
    else out.push(render(n, false));
  }
  flush();
  return <>{out}</>;
}

/** 「更多」页一节里的行；放进侧栏的项目 / 资料库同侧栏一样按各自的「显示为」排（手机没有图标栏，只看设置）。 */
function MoreItems({ items }: { items: NavItem[] }) {
  const { settings } = useSettings();
  const has = (k: PinnedStyleKind) => items.some((n) => pinnedKindOf(n) === k);
  const out: ReactNode[] = [];
  let run: NavItem[] = [];
  let runKind: PinnedStyleKind | null = null;
  const flush = () => {
    if (!run.length || !runKind) return;
    const k = runKind;
    if (pinnedGrid(settings, k, false))
      out.push(
        <div key={`pinned-${k}`} className="more-item more-pinned-grid" data-reorder-layout="grid" role="group" aria-label={PINNED_GRID_LABEL[k]()}>
          {run.map((n) => (
            <MoreTile key={n.key} item={n} />
          ))}
        </div>,
      );
    else out.push(...run.map((n) => <MoreLink key={n.key} item={n} />));
    run = [];
    runKind = null;
  };
  for (const n of items) {
    const k = pinnedKindOf(n);
    if (k) {
      if (k !== runKind) flush();
      runKind = k;
      run.push(n);
      continue;
    }
    flush();
    const anchor = anchorKindOf(n);
    out.push(<MoreLink key={n.key ?? n.page} item={n} {...(anchor && has(anchor) ? { menu: anchor } : {})} />);
  }
  flush();
  return <>{out}</>;
}

/** 「更多」页的一行；置顶的项目 / 资料库能长按拖动排序（Rei 2026-11-10），长按没挪就松开什么也不做。menu：「项目」/「资料库」那行右边放哪一串的 ···。 */
function MoreLink({ item: n, menu }: { item: NavItem; menu?: PinnedStyleKind }) {
  const store = useStore();
  const g = n.groupId ? store.get('group', n.groupId) : null;
  if (g) return <MoreGroupRow item={n} group={g} />;
  if (n.libraryId) return <MoreLibraryRow item={n} />;
  return <MoreLinkPlain item={n} {...(menu ? { menu } : {})} />;
}

/** 「更多」页放进侧栏的项目，列表样式：行右边常显 ···，点开项目菜单（Rei 2026-11-11 02:56）；长按只拖动排序，拿起没挪松开什么也不做。 */
function MoreGroupRow({ item: n, group: g }: { item: NavItem; group: Group }) {
  const store = useStore();
  const actions = useProjectActions(store, g);
  return (
    <MorePinnedRow item={n} reorderId={g.id} items={actions.items}>
      {actions.dialogs}
    </MorePinnedRow>
  );
}

/** 「更多」页放进侧栏的资料库：同项目，行右边常显 ··· 开原来那个菜单（取消在侧边栏显示，Rei 2026-11-11 04:27）；长按只拖动排序。 */
function MoreLibraryRow({ item: n }: { item: NavItem }) {
  const store = useStore();
  const t = n.libraryId ? store.get('task_type', n.libraryId) : null;
  const action = t ? librarySidebarAction(store, t) : null;
  return <MorePinnedRow item={n} reorderId={n.libraryId} items={action ? [action] : []} />;
}

function MorePinnedRow({ item: n, reorderId, items, children }: { item: NavItem; reorderId: string | undefined; items: MenuAction[]; children?: ReactNode }) {
  const reorder = usePinnedReorder(reorderId);
  const Icon = n.icon;
  return (
    <div className="more-item more-item-split more-item-sub" {...reorder.props}>
      <a className="more-item-link" href={href(n.to!)} draggable={false}>
        <span className="more-icon">
          <Icon size={20} />
        </span>
        <span className="grow">{n.label}</span>
        <ChevronRight size={16} className="muted" />
      </a>
      {items.length > 0 && <RowMoreMenu label={tr('「{name}」的更多操作', { name: n.label })} items={items} className="more-item-more" />}
      {children}
    </div>
  );
}

function MoreLinkPlain({ item: n, menu }: { item: NavItem; menu?: PinnedStyleKind }) {
  const Icon = n.icon;
  const reorder = usePinnedReorder(n.groupId ?? n.libraryId);
  const link = (
    <a className={`${menu ? 'more-item-link' : 'more-item'}${n.libraryId || n.groupId ? ' more-item-sub' : ''}`} href={href(n.to ?? ({ page: n.page } as Route))} draggable={false} {...reorder.props}>
      <span className="more-icon">
        <Icon size={20} />
      </span>
      <span className="grow">{n.label}</span>
      <ChevronRight size={16} className="muted" />
    </a>
  );
  if (!menu) return link;
  return (
    <div className="more-item more-item-split">
      {link}
      <PinnedStyleMenu kind={menu} className="more-item-more" />
    </div>
  );
}

/** 「更多」页「显示为：图标」时的一个项目 / 资料库图标：读屏名、悬停提示是名字；长按拿起没挪就松开，出它的菜单（顶上写名字）。 */
function MoreTile({ item: n }: { item: NavItem }) {
  const store = useStore();
  const g = n.groupId ? store.get('group', n.groupId) : null;
  if (g) return <MoreTileOf item={n} group={g} />;
  return n.libraryId ? <MoreLibraryTile item={n} /> : null;
}

/** 「更多」页放进来的资料库，「显示为：图标」（Rei 2026-11-12）：同项目图标，菜单是原来那个「取消在侧边栏显示」。图标同「更多」页列表行。 */
function MoreLibraryTile({ item: n }: { item: NavItem }) {
  const store = useStore();
  const menu = useContextMenuAt({ longPress: false });
  const reorder = usePinnedReorder(n.libraryId, { onContextMenu: menu.props.onContextMenu, openMenu: menu.open });
  const t = n.libraryId ? store.get('task_type', n.libraryId) : null;
  const action = t ? librarySidebarAction(store, t) : null;
  const Icon = n.icon;
  return (
    <>
      <a
        className="more-tile more-tile-lib"
        href={href(n.to!)}
        draggable={false}
        {...menu.props}
        {...reorder.props}
        onClick={(e) => {
          if (menu.consumeLongPress()) e.preventDefault();
        }}
        aria-label={n.label}
        title={n.label}
      >
        <span className="more-icon">
          <Icon size={PINNED_LINE_ICON.mobile} />
        </span>
      </a>
      {action && <MenuAt at={menu.at} label={n.label} heading={n.label} items={[action]} onClose={menu.close} />}
    </>
  );
}

function MoreTileOf({ item: n, group: g }: { item: NavItem; group: Group }) {
  const store = useStore();
  const menu = useContextMenuAt({ longPress: false });
  const reorder = usePinnedReorder(g.id, { onContextMenu: menu.props.onContextMenu, openMenu: menu.open });
  const actions = useProjectActions(store, g);
  const plain = useColorLevel() === 'plain';
  return (
    <>
      <a
        className="more-tile"
        href={href(n.to!)}
        draggable={false}
        {...menu.props}
        {...reorder.props}
        onClick={(e) => {
          if (menu.consumeLongPress()) e.preventDefault();
        }}
        aria-label={n.label}
        title={n.label}
      >
        <GroupIcon group={g} size={pinnedGroupIconSize(true, plain)} />
      </a>
      <MenuAt at={menu.at} label={n.label} heading={n.label} items={actions.items} onClose={menu.close} />
      {actions.dialogs}
    </>
  );
}

/** 一节里置顶的项目 / 资料库组成一串拖动范围（「计划」里是项目，「管理」里是资料库）；没有置顶的就原样。 */
function PinnedScope({ items, children }: { items: NavItem[]; children: ReactNode }) {
  const groupIds = items.flatMap((n) => (n.groupId ? [n.groupId] : []));
  const libIds = items.flatMap((n) => (n.libraryId ? [n.libraryId] : []));
  if (groupIds.length) return <NavReorderScope kind="group" ids={groupIds}>{children}</NavReorderScope>;
  if (libIds.length) return <NavReorderScope kind="library" ids={libIds}>{children}</NavReorderScope>;
  return <>{children}</>;
}

export function Toasts() {
  const ui = useUi();
  // 位置在设置 → 提醒 →「通知位置」，只存本机；手机右上 / 右下按顶部 / 底部居中（lib/toast-position）
  const { settings, layout } = useSettings();
  const pos = effectiveToastPosition(settings.toastPosition, layout);
  return (
    <div className="toasts" data-pos={pos} role="status" aria-live="polite">
      {ui.toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.tone ?? 'info'}`}
          // 电脑上鼠标停在提示上先不关，移开接着算；触屏点按不算停留（lib/toast-timer）
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') ui.holdToast(t.id);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') ui.releaseToast(t.id);
          }}
        >
          <span className="toast-msg">{t.message}</span>
          {t.actions?.map((a) => (
            <RacButton
              key={a.label}
              className="toast-action"
              onPress={() => {
                a.onPress();
                ui.dismiss(t.id);
              }}
            >
              {a.label}
            </RacButton>
          ))}
          <RacButton className="toast-close" aria-label={tr('关闭')} onPress={() => ui.dismiss(t.id)}>
            <X size={14} />
          </RacButton>
        </div>
      ))}
    </div>
  );
}

/** N 快速新建的默认值：项目页带上项目，「默认日期：今天」开着带上今天。打卡页、倒数日页的 N 和页头「新建」一样，直接建空任务进详情（lib/blank-task）。 */
function newTaskDefaults(route: Route, store: Store, myDayDefaultToday: boolean, today: string) {
  // 「默认日期：今天」（Rei 2026-11-09）：项目开着（group.default_date_today）、我的一天页设置里开着，日期填今天
  if (route.page === 'group') return { group_id: route.id, ...todayDefaults(store.get('group', route.id)?.default_date_today === true, today) };
  if (route.page === 'myday') return todayDefaults(myDayDefaultToday, today);
  return {};
}

/** 不显示滚动条（还能滚）的页面：任务列表（Rei 2026-11-08「侧边栏、任务列表的scrollbar不显示」）、打卡页（Rei 2026-11-11）、资料库列表 / 资料详情 / 人物详情（Rei 2026-11-11 资料库只滚内容）；侧栏总是不显示。编辑器、日记、设置等照旧。 */
const HIDE_SCROLLBAR_PAGES: Route['page'][] = ['myday', 'backlog', 'doable', 'agenda', 'group', 'done', 'checkin', 'library', 'libitem', 'person'];

export function App() {
  const route = useRoute();
  const ui = useUi();
  const store = useStore();
  useLunarSubScheduler(store);
  useCalendarSubScheduler(store);
  useAutoMyDay(store);
  // 打卡 / 倒数日「新建」出来的空任务：正文空着离开就删（lib/blank-task，Rei 2026-11-09 01:31）
  useEffect(() => void sweepBlankTasks(store, ui.editingId), [store, ui.editingId]);
  // 严格模式（Rei 2026-11-08）：开关告诉 Store；漏网的写入被拦时给提示
  useStrictSync(store);
  // 重复的倒数日过了目标日滚到下一次（Rei 2026-11-12 03:21，lib/countdown-roll）；放在严格模式同步后面
  useCountdownRoll(store);
  // 多彩档（色彩设置，Rei 2026-11-09）：详情栏顶部的项目 / 类型淡色
  useDetailTint(store, ui.editingId);
  useEffect(() => installStrictGuard((message) => ui.toast({ message })), [ui]);
  // 正文里的 @ 提及胶囊（Rei 2026-11-10）：按 id 取标题、点了打开详情（lib/task-mention.ts）
  const { toast: uiToast, openEditor: uiOpenEditor } = ui;
  const mentionNotFound = useCallback(() => uiToast({ tone: 'error', message: tr('找不到这件任务') }), [uiToast]);
  useMentionSource(store, uiOpenEditor, mentionNotFound);
  // 手机标签栏双击「我的一天」立即同步（Rei 2026-11-13，lib/tab-sync）：单击照常切页，300ms 内第二下才同步，结果用 toast 说
  const [tapSyncing, setTapSyncing] = useState(false);
  const tapBusy = useRef(false);
  const myDayTap = useRef(createDoubleTap());
  const onMyDayTap = useCallback(
    (e: { timeStamp: number }) => {
      if (!myDayTap.current(e.timeStamp)) return;
      const show = (t: TapSyncToast) =>
        uiToast({ tone: t.tone, message: t.message, actions: t.toSettings ? [{ label: tr('去设置'), onPress: () => navigate({ page: 'settings', section: 'account' }) }] : undefined });
      const gate = tapSyncGate(getAccount(), getSyncView(), navigator.onLine !== false, tapBusy.current);
      if (gate) return show(gate);
      tapBusy.current = true;
      setTapSyncing(true);
      navigator.vibrate?.(10);
      void syncNow().then(() => {
        tapBusy.current = false;
        setTapSyncing(false);
        show(tapSyncResult(getSyncView()));
      });
    },
    [uiToast],
  );
  const { setDidaImportOpen } = ui;
  const { layout, platform, settings } = useSettings();
  // 桌面 app（Tauri）：设置是单独的窗口（Rei 2026-10-26）；Web 和手机仍是页面
  const settingsInWindow = isTauri() && (platform === 'macos' || platform === 'windows' || platform === 'linux');
  const openSettings = useCallback(
    (section?: SettingsSection) => void openSettingsWindow({ ...(section ? { section } : {}), title: tr('设置'), macOverlay: platform === 'macos' }),
    [platform],
  );
  useAppMenu({ importDida: useCallback(() => setDidaImportOpen(true), [setDidaImportOpen]), openSettings: useCallback(() => openSettings(), [openSettings]) });
  // 走到 #/settings（深链 view/settings、手机布局「更多」里的设置、旧链接）：开设置窗口，主窗口退回原来的页面
  useEffect(() => {
    if (!settingsInWindow || route.page !== 'settings') return;
    openSettings(route.section);
    if (history.length > 1) history.back();
    else location.replace('#/myday');
  }, [settingsInWindow, route, openSettings]);
  const isActive = (n: NavItem) => (n.activeFor ? n.activeFor(route) : n.match.includes(route.page));
  const sections = navSections(store);
  const nav = sections.flatMap((s) => s.items);
  const [collapsed, toggleSection] = useCollapsed();
  // 归档项目里藏起来的不算（lib/project-archive）
  // 置顶的任务也算（Rei 2026-11-08，lib/myday-items）
  const todayCount = dayItems(store).length;

  // 快捷键：⌘F / Ctrl+F 搜索（lib/global-keys.ts，编辑器里也开；⌘K 只留给编辑器加链接）；⌘, / Ctrl+, 设置；N 快速新建（不在输入框时）
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === ',') {
        e.preventDefault();
        if (settingsInWindow) openSettings();
        else navigate({ page: 'settings' });
      } else if (isSearchShortcut(e)) {
        e.preventDefault();
        ui.setPaletteOpen(true);
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'n' && !typingKey(e) && !ui.paletteOpen && !ui.quickCreate) {
        e.preventDefault();
        if (route.page === 'checkin' || route.page === 'countdown') createBlankTask(store, ui.openEditor, route.page);
        else ui.openQuickCreate(newTaskDefaults(route, store, settings.myDayDefaultToday, store.today()), { myDay: route.page === 'myday' });
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [ui, store, route, settingsInWindow, openSettings, settings.myDayDefaultToday]);

  const backlogCount = store.backlog(store.today()).length;
  const current = [...nav, SETTINGS].find(isActive);
  // 中等宽度：侧边栏是图标栏，小节标题不显示，收起的小节也照样列出来（不然点不开）
  const narrow = useNarrow();
  const selected = !!store.get('task', ui.editingId);
  // 项目页看板视图、侧栏日历页、项目总览页：不要右列，详情用浮层（Rei 2026-11-09 00:28「切换到看板视图后，不要显示侧边的详情column」、2026-11-10 时间轴「点击任务不显示详情侧边栏」、2026-11-11「项目列表页 不显示任务详情侧边栏」，lib/detail-pane detailInModal）。
  // 切进看板那一下把开着的详情收起来；切回列表右列照旧（空状态或之后点开的任务）。
  // 日记页：右列放上去日记还剩 JOURNAL_MIN 才并排，不然详情用浮层盖在日记上，不挤日记（Rei 2026-11-13 01:21「正确应该不要挤压」）。
  const journalFits = useJournalPaneFits();
  const boardModal = layout === 'desktop' && detailInModal(route, settings.projectViews, journalFits ? Infinity : 0);
  const wasBoardModal = useRef(boardModal);
  const wasJournalFits = useRef(journalFits);
  useEffect(() => {
    // 只是拉窗口让日记页在右列和浮层之间切换时，开着的那件照样开着；换页、切看板才收起
    const byResize = route.page === 'journal' && journalFits !== wasJournalFits.current;
    if (boardModal && !wasBoardModal.current && !byResize) ui.openEditor(null);
    wasBoardModal.current = boardModal;
    wasJournalFits.current = journalFits;
  }, [boardModal, journalFits, route.page, ui]);
  // 右下角浮动的新建按钮整个去掉了（Rei 2026-11-08 23:00 任务列表页、23:35「上面那些页的「+」都去掉」打卡、倒数日、资料库、人物、类型、设置、手机「更多」）。
  // 各页用自己的入口：任务列表顶上的添加框、打卡 / 倒数日页头按钮、资料库「添加」、资料详情「用它新建任务」、人物「新建相关任务」、类型搜索框里新建；N 照常开新建面板。

  let shell: ReactNode;
  if (layout === 'desktop') {
    shell = (
      <div className={`app app-desktop${narrow ? ' is-narrow' : ''}${selected && !boardModal ? ' has-detail' : ''}${LIST_PAGES.includes(route.page) ? '' : ' no-list'}${boardModal ? ' detail-modal' : ''}`}>
        <aside className="sidebar">
          {/* macOS 无标题栏时给红绿灯让位、可拖动窗口（双击放大）；其他平台不显示 */}
          <div className="titlebar-space" data-tauri-drag-region aria-hidden />
          <RacButton className="sidebar-search" aria-label={tr('搜索')} onPress={() => ui.setPaletteOpen(true)}>
            <Search size={15} />
            <span className="grow">{tr('搜索')}</span>
            <kbd className="kbd">{searchKeyLabel()}</kbd>
          </RacButton>
          <nav className="nav" aria-label={tr('主导航')}>
            {sections.map((sec) => {
              const isCollapsed = !narrow && collapsed.includes(sec.id) && !sec.items.some(isActive);
              return (
                <div key={sec.id} className="nav-section" role="group" aria-labelledby={`nav-sec-${sec.id}`}>
                  <RacButton id={`nav-sec-${sec.id}`} className="nav-section-title" aria-expanded={!isCollapsed} onPress={() => toggleSection(sec.id)}>
                    <span>{sec.title}</span>
                    <ChevronRight size={12} aria-hidden className={`nav-section-chevron${isCollapsed ? '' : ' is-open'}`} />
                  </RacButton>
                  {!isCollapsed && (
                    <PinnedScope items={sec.items}>
                      <SidebarItems items={sec.items} narrow={narrow} render={(n, compact) => <NavLink key={n.key ?? n.page} item={n} active={isActive(n)} compact={compact} rail={narrow} badge={n.page === 'myday' ? todayCount : n.page === 'backlog' ? backlogCount : undefined} />} />
                    </PinnedScope>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="sidebar-foot">
            {settingsInWindow ? <NavLink item={SETTINGS} active={false} onOpen={() => openSettings()} /> : <NavLink item={SETTINGS} active={isActive(SETTINGS)} />}
          </div>
        </aside>
        {/* 中间一列：当前视图的列表 */}
        <div className="main-col">
          <main className="main" data-hide-scrollbar={HIDE_SCROLLBAR_PAGES.includes(route.page) || undefined}>
            <div className="titlebar-space" data-tauri-drag-region aria-hidden />
            <div className="main-scroll">
              <MovedBanner />
              <LoginErrorBanner />
              {!(settingsInWindow && route.page === 'settings') && <ErrorBoundary resetKey={route}><Page route={route} /></ErrorBoundary>}
            </div>
          </main>
        </div>
        {boardModal ? <DetailModal /> : <DetailPane listMin={listMinFor(route.page)} />}
      </div>
    );
  } else {
    const tabs = mobileTabItems(NAV);
    // 双击「我的一天」立即同步（lib/tab-sync）：单击不拦，照常切页
    const moreActive = !tabs.some(isActive);
    const topbar = mobileTopbar(route.page);
    shell = (
      <div className={`app app-mobile${selected ? ' has-detail' : ''}`}>
        {/* 顶栏不放搜索按钮（Rei 2026-11-12，搜索在「更多」页进单独的搜索页），也不写页名（09:41），只放我的一天的日期和页面送上来的按钮；
            有自己页头的页整行不要，只留状态栏那一截（lib/mobile-topbar） */}
        {topbar === 'none' ? (
          <div className="topbar-inset" aria-hidden />
        ) : (
          <MobileTopbarRow label={current?.label ?? appName()} />
        )}
        <main className="main" data-hide-scrollbar={HIDE_SCROLLBAR_PAGES.includes(route.page) || undefined}>
          <MovedBanner />
          <LoginErrorBanner />
          {!(settingsInWindow && route.page === 'settings') && <ErrorBoundary resetKey={route}><Page route={route} /></ErrorBoundary>}
        </main>
        <nav className="tabbar" aria-label={tr('主导航')}>
          {tabs.map((n) => {
            const Icon = n.icon;
            const myday = n.page === 'myday';
            return (
              <a
                key={n.page}
                href={href({ page: n.page } as Route)}
                draggable={false}
                className={`tab-item${isActive(n) ? ' is-active' : ''}${myday && tapSyncing ? ' is-syncing' : ''}`}
                aria-current={isActive(n) ? 'page' : undefined}
                onClick={myday ? onMyDayTap : undefined}
              >
                <span className="tab-icon">
                  <Icon size={20} />
                </span>
                <span className="tab-label">{n.label}</span>
              </a>
            );
          })}
          <a href="#/more" draggable={false} className={`tab-item${moreActive ? ' is-active' : ''}`} onClick={(e) => { if (route.page === 'more') { e.preventDefault(); navigate({ page: 'myday' }); } }}>
            <span className="tab-icon">
              <Menu size={20} />
            </span>
            <span className="tab-label">{tr('更多')}</span>
          </a>
        </nav>
        {/* 手机：任务详情整页推入（不是底部弹窗），返回 / 右滑 / 系统返回键回到列表 */}
        <ErrorBoundary resetKey={ui.editingId}><TaskDetail mode="page" /></ErrorBoundary>
      </div>
    );
  }

  return (
    <>
      {shell}
      <TaskComposer />
      <ReminderHost />
      <CommandPalette />
      {ui.didaImportOpen && (
        <Suspense fallback={null}>
          <DidaImportSheet isOpen={ui.didaImportOpen} onOpenChange={ui.setDidaImportOpen} />
        </Suspense>
      )}
      <Toasts />
      <DeepLinks />
    </>
  );
}
