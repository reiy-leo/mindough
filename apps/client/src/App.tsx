import { installStrictGuard, useStrictSync } from './lib/strict';
import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dialog, Heading, Modal, ModalOverlay, Button as RacButton } from 'react-aria-components';
import { Calendar, CalendarCheck2, CalendarClock, CircleCheck, ChevronRight, Hourglass, Library, MoreHorizontal, NotebookPen, Search, Settings, Inbox, Shapes, Sun, Tags, X, type LucideIcon } from 'lucide-react';
import { href, navigate, parseHash, useRoute, type Route, type SettingsSection } from './lib/router';
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
import { activeGroupEntry, activeLibraryEntry, groupIconName, libraryRoute, manageEntries, mobileTabItems, planEntries } from './lib/nav';
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
import { projectPrefsOf } from './lib/view-hooks';
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
import { swipeAxis, swipeOffset, swipeShouldClose } from './lib/drawer-swipe';

const DidaImportSheet = lazy(() => import('./components/DidaImport').then((m) => ({ default: m.DidaImportSheet })));

import { appName, tr, trc } from './lib/i18n';
import { typingKey } from './lib/ime';
import { isSearchShortcut, searchKeyLabel } from './lib/global-keys';
import { drawerInTopbar, mobileTopbar, topbarState } from './lib/mobile-topbar';
import { DrawerButton, DrawerProvider } from './components/DrawerButton';
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
/** 搜索页（Rei 2026-11-12）：手机底栏最后一格（2026-11-15 换掉「更多」）；宽屏侧栏顶上照旧是 ⌘F 浮层。 */
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
      // 「更多」页 2026-11-15 删了：App 里一进来就换成我的一天并拉出抽屉
      return null;
    case 'search':
      return <SearchPage />;
  }
});

/**
 * 手机顶栏（Rei 2026-11-12 09:41「页面都不用header」）：不写页名，左格（我的一天的日期 + 农历）、右格（页面送上来的按钮）由页面用
 * lib/topbar-slot 填。两格都空就加 is-empty，收成只剩状态栏那一截，顶上不空出一行；只有按钮加 no-lead，矮一点；读屏的页名放 sr-only。
 */
function MobileTopbarRow({ label, menu }: { label: string; menu?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasMenu = !!menu;
  const [state, setState] = useState<'' | ' is-empty' | ' no-lead'>(hasMenu ? ' no-lead' : '');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 有抽屉按钮（顶级页，Rei 2026-11-15）就不收成空行（lib/mobile-topbar topbarState）
    const check = () => setState(topbarState({ menu: hasMenu, lead: !!el.querySelector('.topbar-lead > *'), actions: !!el.querySelector('.topbar-actions > *') }));
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [hasMenu]);
  return (
    <div ref={ref} className={`topbar${state}${hasMenu ? ' has-menu' : ''}`}>
      <span className="sr-only">{label}</span>
      {menu}
      <span className="topbar-lead" id={TOPBAR_LEAD_ID} />
      <span className="topbar-actions" id={TOPBAR_SLOT_ID} />
    </div>
  );
}

/** 侧栏各节：电脑侧栏和手机抽屉（Rei 2026-11-15）共用。小节标题能点开收起，收起状态两边共用一份（本机）。 */
function NavSections({
  sections,
  isActive,
  narrow,
  collapsed,
  onToggle,
  badge,
  idPrefix = '',
}: {
  sections: NavSection[];
  isActive: (n: NavItem) => boolean;
  narrow: boolean;
  collapsed: string[];
  onToggle: (id: string) => void;
  badge: (n: NavItem) => number | undefined;
  idPrefix?: string;
}) {
  return (
    <nav className="nav" aria-label={tr('主导航')}>
      {sections.map((sec) => {
        const isCollapsed = !narrow && collapsed.includes(sec.id) && !sec.items.some(isActive);
        const titleId = `${idPrefix}nav-sec-${sec.id}`;
        return (
          <div key={sec.id} className="nav-section" role="group" aria-labelledby={titleId}>
            <RacButton id={titleId} className="nav-section-title" aria-expanded={!isCollapsed} onPress={() => onToggle(sec.id)}>
              <span>{sec.title}</span>
              <ChevronRight size={12} aria-hidden className={`nav-section-chevron${isCollapsed ? '' : ' is-open'}`} />
            </RacButton>
            {!isCollapsed && (
              <PinnedScope items={sec.items}>
                <SidebarItems items={sec.items} narrow={narrow} render={(n, compact) => <NavLink key={n.key ?? n.page} item={n} active={isActive(n)} compact={compact} rail={narrow} badge={badge(n)} />} />
              </PinnedScope>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * 手机抽屉侧栏（Rei 2026-11-15「手机端导航改版」）：顶级页顶栏左边的按钮拉出来，内容就是电脑侧栏（分组、角标、放进侧边栏的项目 / 资料库，设置在底部）。
 * - 用 React Aria 的 ModalOverlay + Modal + Dialog：读屏是模态对话框，打开时焦点进抽屉、关掉回到按钮；Esc、点遮罩关。
 * - 安卓系统返回：弹层进一条浏览记录（lib/back-layers），返回就关抽屉，不退页面。
 * - 点导航项：先换页再关（router.navigate 会换掉弹层那条记录，返回不用多按一下）。
 * - 向左滑关（lib/drawer-swipe）：抽屉跟手，松手拖过三成宽或甩得快就关。
 * - 外观在皮肤层（skin/skins.css .drawer），动画看 prefers-reduced-motion。
 */
function MobileDrawer({ isOpen, onOpenChange, children }: { isOpen: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null; dx: number; v: number } | null>(null);
  const panel = () => body.current?.closest<HTMLElement>('.drawer') ?? null;
  const close = () => onOpenChange(false);
  const onClick = (e: ReactMouseEvent) => {
    if (e.defaultPrevented) return;
    const a = (e.target as Element).closest('a[href]');
    const h = a?.getAttribute('href') ?? '';
    if (!h.startsWith('#')) return;
    e.preventDefault();
    navigate(parseHash(h));
    close();
  };
  const onTouchStart = (e: ReactTouchEvent) => {
    const t = e.touches[0];
    drag.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, t: e.timeStamp, axis: null, dx: 0, v: 0 } : null;
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    const d = drag.current;
    const t = e.touches[0];
    const el = panel();
    if (!d || !t || !el || d.axis === 'y') return;
    const dx = t.clientX - d.x;
    d.axis ??= swipeAxis(dx, t.clientY - d.y);
    if (d.axis !== 'x') return;
    const dt = Math.max(1, e.timeStamp - d.t);
    d.v = (dx - d.dx) / dt;
    d.dx = dx;
    d.t = e.timeStamp;
    el.style.transition = 'none';
    el.style.transform = `translateX(${swipeOffset(dx, el.offsetWidth)}px)`;
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    const el = panel();
    if (!d || d.axis !== 'x' || !el) return;
    const off = swipeOffset(d.dx, el.offsetWidth);
    el.style.transition = '';
    if (swipeShouldClose(off, d.v, el.offsetWidth)) {
      // 退场动画从手指松开的位置接着往左走（.drawer[data-exiting] 的 --drawer-from）
      el.style.setProperty('--drawer-from', `${off}px`);
      el.style.transform = '';
      close();
    } else el.style.transform = '';
  };
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="drawer-overlay">
      <Modal className="drawer">
        <Dialog className="drawer-dialog" aria-labelledby="drawer-title">
          <div
            ref={body}
            className="drawer-body"
            onClick={onClick}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
          >
            <Heading slot="title" id="drawer-title" className="drawer-title">
              {appName()}
            </Heading>
            {children}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
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
  // 手机抽屉侧栏（Rei 2026-11-15）：顶级页顶栏左边的按钮拉出来
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  useEffect(() => {
    if (layout !== 'mobile') setDrawerOpen(false);
  }, [layout]);
  // 「更多」页删了（2026-11-15）：旧链接 #/more 换成我的一天，手机上顺手拉出抽屉（原来「更多」里的入口都在那）
  useEffect(() => {
    if (route.page !== 'more') return;
    location.replace(`${location.pathname}${location.search}${href({ page: 'myday' })}`);
    if (layout === 'mobile') setDrawerOpen(true);
  }, [route.page, layout]);

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
  const navBadge = (n: NavItem) => (n.key ? undefined : n.page === 'myday' ? todayCount : n.page === 'backlog' ? backlogCount : undefined);
  const current = [...nav, SETTINGS].find(isActive);
  // 中等宽度：侧边栏是图标栏，小节标题不显示，收起的小节也照样列出来（不然点不开）
  const narrow = useNarrow();
  const selected = !!store.get('task', ui.editingId);
  // 项目页看板视图、侧栏日历页、项目总览页：不要右列，详情用浮层（Rei 2026-11-09 00:28「切换到看板视图后，不要显示侧边的详情column」、2026-11-10 时间轴「点击任务不显示详情侧边栏」、2026-11-11「项目列表页 不显示任务详情侧边栏」，lib/detail-pane detailInModal）。
  // 切进看板那一下把开着的详情收起来；切回列表右列照旧（空状态或之后点开的任务）。
  // 日记页：右列放上去日记还剩 JOURNAL_MIN 才并排，不然详情用浮层盖在日记上，不挤日记（Rei 2026-11-13 01:21「正确应该不要挤压」）。
  const journalFits = useJournalPaneFits();
  // 项目视图是同步偏好（lib/view-prefs），收起状态在本机设置：两边合起来看（projectPrefsOf）
  const boardModal = layout === 'desktop' && detailInModal(route, route.page === 'group' ? { [route.id]: projectPrefsOf(store, settings.projectViews, route.id) } : {}, journalFits ? Infinity : 0);
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
          <NavSections sections={sections} isActive={isActive} narrow={narrow} collapsed={collapsed} onToggle={toggleSection} badge={navBadge} />
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
    // 底栏：固定四项 + 最后一格「搜索」（Rei 2026-11-15 换掉「更多」）
    const tabs = [...mobileTabItems(NAV), SEARCH];
    const topbar = mobileTopbar(route.page);
    // 抽屉按钮（Rei 2026-11-15）：顶上没有自己工具行的页放在顶栏左边；打卡、日历、项目这些放在页面自己第一行的最左边（2026-11-16，lib/mobile-topbar drawerInTopbar），
    // 按钮本身是 components/DrawerButton，开关经 DrawerProvider 传下去
    const drawerButton = drawerInTopbar(route) ? <DrawerButton /> : undefined;
    shell = (
      <div className={`app app-mobile${selected ? ' has-detail' : ''}`}>
        {/* 顶栏不放搜索按钮（Rei 2026-11-12，搜索在底栏），也不写页名（09:41），只放抽屉按钮（顶级页，2026-11-15）、我的一天的日期和页面送上来的按钮；
            有自己页头的页整行不要，只留状态栏那一截（lib/mobile-topbar） */}
        {topbar === 'none' ? (
          <div className="topbar-inset" aria-hidden />
        ) : (
          <MobileTopbarRow label={current?.label ?? appName()} menu={drawerButton} />
        )}
        <main className="main" data-hide-scrollbar={HIDE_SCROLLBAR_PAGES.includes(route.page) || undefined}>
          <MovedBanner />
          <LoginErrorBanner />
          {!(settingsInWindow && route.page === 'settings') && <ErrorBoundary resetKey={route}><Page route={route} /></ErrorBoundary>}
        </main>
        <nav className="tabbar" aria-label={tr('主导航')}>
          {tabs.map((n) => {
            const Icon = n.icon;
            // 双击「我的一天」立即同步（lib/tab-sync）：单击不拦，照常切页
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
        </nav>
        {/* 手机：任务详情整页推入（不是底部弹窗），返回 / 右滑 / 系统返回键回到列表 */}
        <ErrorBoundary resetKey={ui.editingId}><TaskDetail mode="page" /></ErrorBoundary>
        <MobileDrawer isOpen={drawerOpen} onOpenChange={setDrawerOpen}>
          <NavSections sections={sections} isActive={isActive} narrow={false} collapsed={collapsed} onToggle={toggleSection} badge={navBadge} idPrefix="drawer-" />
          <div className="sidebar-foot drawer-foot">
            <NavLink item={SETTINGS} active={isActive(SETTINGS)} />
          </div>
        </MobileDrawer>
      </div>
    );
  }

  return (
    <DrawerProvider isOpen={drawerOpen} open={openDrawer}>
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
    </DrawerProvider>
  );
}
