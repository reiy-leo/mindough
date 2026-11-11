import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Button as RacButton, Dialog, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator } from 'react-aria-components';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, ChevronDown, Hourglass, LayoutGrid, LayoutList, Paintbrush, PanelRight, Repeat } from 'lucide-react';
import { cardColorOf, describeRecurrence, formatDateZh, formatTaskDate, parseRecurrence, toDateKey, weekStartsOn, type Task } from '@mindough/core';
import { useLunarUi } from '../lib/lunar';
import { useDateDisplay } from '../lib/date-display';
import { useNow, useStore } from '../store/StoreProvider';
import { useUi } from '../lib/ui';
import { ChipPicker, Empty, MenuAt, NewButton, OverflowMenu, useContextMenuAt, type MenuAction } from '../ui/primitives';
import { CardColorPicker } from '../components/CardColorPicker';
import { cardColorStyle, cardColorVars } from '../lib/card-colors';
import { useColorLevel } from '../lib/color-level';
import { useSettings } from '../lib/settings';
import { CategoryLabel, CategoryLabels, NO_CATEGORY } from '../components/CategoryPicker';
import { SectionedList } from '../components/SectionedList';
import { SECTION_LABEL } from '../components/project/ProjectMenus';
import { categorySectionOrder, type SectionBy } from '../lib/sections';
import { COUNTDOWN_SECTIONS, COUNTDOWN_SORTS, COUNTDOWN_VIEWS, sectionCountdowns, sortCountdowns, useCountdownPrefs, type CountdownDir, type CountdownSort, type CountdownView } from '../lib/countdown-view';
import { titleOf } from '../lib/view';
import { typeIcon } from '../lib/icons';
import { tr } from '../lib/i18n';
import { trx } from '../lib/trx';
import { createBlankTask } from '../lib/blank-task';


/**
 * 倒数日（Rei 2026-10-26「把倒数日从“打卡”中拆出来单独一个侧边栏入口」）：
 * 以前是打卡页最下面的一节，现在单独一页，在侧边栏「持续」里。点开是任务详情（提醒、农历重复都在详情里）。
 * 类型（Rei 2026-10-26，和打卡、项目共用一套）：能按类型筛选；只列有倒数日挂着的类型，一个都没挂就不出筛选条。
 *
 * 页头去掉（Rei 2026-11-12 01:09）：一行工具栏，左边三个下拉 视图 / 排序 / 分区，右边新建（原来在页头右边）；
 * 类型筛选照旧在下面一行。原来的「排列方式：按日期 / 按类型」并进分区（不分区 / 按类型）。
 * 视图、排序、分区本机记住（lib/countdown-view.ts），默认 卡片、到期日期正序、不分区，和原来一样。手机上页名在顶栏（lib/mobile-topbar）。
 */

/** 一条倒数日的菜单（卡片、列表行共用）：右键 / 长按 / ··· 出「查看详情 ｜ 颜色…」，颜色弹层挂在外框上。 */
function useCountdownMenu(t: Task) {
  const ui = useUi();
  const menu = useContextMenuAt();
  const [picking, setPicking] = useState(false);
  const items: MenuAction[] = [
    { id: 'open', label: tr('查看详情'), icon: <PanelRight size={16} />, onAction: () => ui.openEditor(t.id) },
    { id: 'color', label: tr('颜色…'), icon: <Paintbrush size={16} />, separator: true, onAction: () => window.setTimeout(() => setPicking(true), 0) },
  ];
  return { menu, items, picking, setPicking };
}

function ColorPopover({ task, anchor, onClose }: { task: Task; anchor: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const store = useStore();
  return (
    <Popover triggerRef={anchor} isOpen onOpenChange={(o) => !o && onClose()} className="popover popover-panel" placement="bottom start" offset={6}>
      <Dialog className="popover-dialog" aria-label={tr('卡片颜色')}>
        <div className="pop-section">
          <div className="pop-title">{tr('卡片颜色')}</div>
          <CardColorPicker store={store} task={task} onDone={onClose} />
        </div>
      </Dialog>
    </Popover>
  );
}

/** 重复的倒数日（Rei 2026-11-12）：日期后面一个小的重复图标，悬停 / 读屏是规则（「每年11月12日」）。 */
function RepeatMark({ task, today }: { task: Task; today: string }) {
  const lunarUi = useLunarUi();
  const r = parseRecurrence(task.recurrence);
  if (!r) return null;
  const s = describeRecurrence(r, { lunar: lunarUi, today });
  return (
    <span className="countdown-repeat" title={s} role="img" aria-label={s}>
      <Repeat size={12} aria-hidden />
    </span>
  );
}

function DaysText({ n }: { n: number }) {
  return <>{n === 0 ? <b>{tr('今天')}</b> : n > 0 ? trx('还有 {n} 天', { n: <b>{n}</b> }, { count: n }, { wrap: 'countdown-affix' }) : trx('已过 {n} 天', { n: <b>{-n}</b> }, { count: -n }, { wrap: 'countdown-affix' })}</>;
}

/**
 * 一张倒数日卡片：点了打开详情；右键 / 长按 / 右上角 ··· 出菜单「查看详情 ｜ 颜色…」。
 * 背景色（Rei 2026-11-02「倒数日的card可以设置不同的颜色背景」）存在 task.card_color，字色按对比度挑黑或白（lib/card-colors.ts）。
 */
function CountdownCard({ task: t, n, withCat }: { task: Task; n: number; withCat: boolean }) {
  const store = useStore();
  const ui = useUi();
  const { theme } = useSettings();
  const colorLevel = useColorLevel();
  const today = toDateKey(useNow());
  const dateMode = useDateDisplay();
  const { menu, items, picking, setPicking } = useCountdownMenu(t);
  const wrapRef = useRef<HTMLDivElement>(null);
  const type = store.get('task_type', t.type_id);
  const Icon = typeIcon(type?.icon);
  const c = withCat ? store.categoryOf(t) : undefined;
  const vars = cardColorVars(t, theme, colorLevel);
  return (
    <div ref={wrapRef} className={`countdown-card-wrap${vars ? ' has-color' : ''}`} style={vars} {...menu.props}>
      <RacButton
        className={`card countdown-card${vars ? ' has-color' : ''}${ui.editingId === t.id ? ' is-selected' : ''}`}
        data-task-id={t.id}
        aria-current={ui.editingId === t.id ? 'true' : undefined}
        onPress={() => {
          if (menu.consumeLongPress()) return;
          ui.openEditor(t.id);
        }}
      >
        <span className="countdown-title">
          {type && type.layout !== 'text' && <Icon size={14} style={vars ? undefined : { color: type.color }} />}
          {titleOf(store, t)}
        </span>
        <span className="countdown-num">
          <DaysText n={n} />
        </span>
        <span className="countdown-date">
          {dateMode === 'auto' ? formatDateZh(t.target_date!) : formatTaskDate(t.target_date!, { mode: dateMode, today })}
          <RepeatMark task={t} today={today} />
          {c && <CategoryLabels cats={store.categoriesOfTask(t)} size={12} />}
        </span>
      </RacButton>
      <OverflowMenu label={tr('倒数日操作')} items={items} className="countdown-card-more" />
      <MenuAt at={menu.at} label={tr('倒数日操作')} items={items} onClose={menu.close} />
      {picking && <ColorPopover task={t} anchor={wrapRef} onClose={() => setPicking(false)} />}
    </div>
  );
}

/**
 * 列表视图的一行（Rei 2026-11-12「像任务列表那样一行一个，标题在左、倒数天数在右」）：
 * 行首一个小色点 = 卡片颜色（没设颜色、素净档不画，留同宽的空位让标题对齐）；点了开详情，右键 / 长按同卡片的菜单。
 */
function CountdownRow({ task: t, n }: { task: Task; n: number }) {
  const store = useStore();
  const ui = useUi();
  const { theme } = useSettings();
  const colorLevel = useColorLevel();
  const { menu, items, picking, setPicking } = useCountdownMenu(t);
  const wrapRef = useRef<HTMLDivElement>(null);
  const type = store.get('task_type', t.type_id);
  const Icon = typeIcon(type?.icon);
  const cc = colorLevel === 'plain' ? null : cardColorOf(t);
  const dot = cc ? cardColorStyle(cc, theme).bg : null;
  const selected = ui.editingId === t.id;
  return (
    <div ref={wrapRef} className={`task-row countdown-row${selected ? ' is-selected' : ''}${n < 0 ? ' is-past' : ''}`} {...menu.props}>
      <RacButton
        className="row-main countdown-row-main"
        data-task-id={t.id}
        aria-current={selected ? 'true' : undefined}
        onPress={() => {
          if (menu.consumeLongPress()) return;
          ui.openEditor(t.id);
        }}
      >
        <span className={`countdown-dot${dot ? '' : ' is-none'}`} style={dot ? ({ '--cd-dot': dot } as CSSProperties) : undefined} aria-hidden />
        {type && type.layout !== 'text' && <Icon size={14} className="countdown-row-icon" style={{ color: type.color }} aria-hidden />}
        <span className="row-title countdown-row-title">{titleOf(store, t)}</span>
        <RepeatMark task={t} today={toDateKey(new Date())} />
        <span className="countdown-row-days">
          <DaysText n={n} />
        </span>
      </RacButton>
      <MenuAt at={menu.at} label={tr('倒数日操作')} items={items} onClose={menu.close} />
      {picking && <ColorPopover task={t} anchor={wrapRef} onClose={() => setPicking(false)} />}
    </div>
  );
}

const VIEW_LABEL: Record<CountdownView, () => string> = { card: () => tr('卡片'), list: () => tr('列表') };
const VIEW_ICON = { card: LayoutGrid, list: LayoutList } as const;
const SORT_LABEL: Record<CountdownSort, () => string> = { target: () => tr('到期日期'), added: () => tr('添加日期') };

function CheckItem({ id, icon, children }: { id: string; icon?: ReactNode; children: string }) {
  return (
    <MenuItem id={id} className="menu-item menu-check" textValue={children}>
      {({ isSelected }) => (
        <>
          {icon}
          <span className="menu-check-text">{children}</span>
          <span className="menu-check-mark" aria-hidden>
            {isSelected && <Check size={15} />}
          </span>
        </>
      )}
    </MenuItem>
  );
}

/** 左上角的下拉按钮：写当前那项 + 向下箭头，样子同打卡页的排列方式下拉（.checkin-arrange-btn）。 */
function DropButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RacButton className="btn btn-quiet checkin-arrange-btn" aria-label={label}>
      {children}
      <ChevronDown size={15} aria-hidden />
    </RacButton>
  );
}

function ViewDrop({ value, onChange }: { value: CountdownView; onChange: (v: CountdownView) => void }) {
  const name = VIEW_LABEL[value]();
  return (
    <MenuTrigger>
      <DropButton label={tr('视图：{name}', { name })}>
        <span className="checkin-arrange-name">{name}</span>
      </DropButton>
      <Popover className="popover menu-popover" placement="bottom start" offset={4}>
        <Menu
          className="menu"
          aria-label={tr('视图')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[value]}
          onSelectionChange={(keys) => {
            const k = [...keys][0];
            if (k === 'card' || k === 'list') onChange(k);
          }}
        >
          {COUNTDOWN_VIEWS.map((v) => {
            const I = VIEW_ICON[v];
            return (
              <CheckItem key={v} id={v} icon={<I size={16} />}>
                {VIEW_LABEL[v]()}
              </CheckItem>
            );
          })}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/** 排序：同一个菜单两组（排序依据 / 顺序），各自打勾，同项目页的排序菜单。按钮上写依据，后面一个正序 / 倒序的小图标。 */
function SortDrop({ sort, dir, onChange }: { sort: CountdownSort; dir: CountdownDir; onChange: (sort: CountdownSort, dir: CountdownDir) => void }) {
  const name = SORT_LABEL[sort]();
  const DirIcon = dir === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow;
  return (
    <MenuTrigger>
      <DropButton label={tr('排序：{name}，{dir}', { name, dir: dir === 'asc' ? tr('正序') : tr('倒序') })}>
        <span className="checkin-arrange-name">{name}</span>
        <DirIcon size={14} className="countdown-dir-icon" aria-hidden />
      </DropButton>
      <Popover className="popover menu-popover" placement="bottom start" offset={4}>
        <Menu className="menu" aria-label={tr('排序')}>
          <MenuSection
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[sort]}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              if (k === 'target' || k === 'added') onChange(k, dir);
            }}
          >
            <Header className="menu-header">{tr('排序依据')}</Header>
            {COUNTDOWN_SORTS.map((s) => (
              <CheckItem key={s} id={s}>
                {SORT_LABEL[s]()}
              </CheckItem>
            ))}
          </MenuSection>
          <Separator className="menu-sep" />
          <MenuSection
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[dir]}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              if (k === 'asc' || k === 'desc') onChange(sort, k);
            }}
          >
            <Header className="menu-header">{tr('顺序')}</Header>
            <CheckItem id="asc" icon={<ArrowUpNarrowWide size={16} />}>
              {tr('正序')}
            </CheckItem>
            <CheckItem id="desc" icon={<ArrowDownWideNarrow size={16} />}>
              {tr('倒序')}
            </CheckItem>
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

function SectionDrop({ value, onChange }: { value: SectionBy; onChange: (v: SectionBy) => void }) {
  const name = SECTION_LABEL[value]();
  return (
    <MenuTrigger>
      <DropButton label={tr('分区：{name}', { name })}>
        <span className="checkin-arrange-name">{name}</span>
      </DropButton>
      <Popover className="popover menu-popover" placement="bottom start" offset={4}>
        <Menu
          className="menu"
          aria-label={tr('分区')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[value]}
          onSelectionChange={(keys) => {
            const k = String([...keys][0] ?? '');
            if ((COUNTDOWN_SECTIONS as readonly string[]).includes(k)) onChange(k as SectionBy);
          }}
        >
          {COUNTDOWN_SECTIONS.map((s) => (
            <CheckItem key={s} id={s}>
              {SECTION_LABEL[s]()}
            </CheckItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

export function CountdownsPage() {
  const store = useStore();
  const ui = useUi();
  const now = useNow();
  const today = toDateKey(now);
  const [prefs, setPrefs] = useCountdownPrefs();
  const daysOf = (t: Task) => store.progress(t.id, today)?.value ?? 0;
  // 归档了的项目里的倒数日不列（Rei 2026-11-05）
  const countdowns = sortCountdowns(
    store
      .activeTasks()
      .filter((t) => t.completion_mode === 'countdown' && t.target_date && t.status !== '关闭')
      .map((t) => ({ t, n: daysOf(t) })),
    prefs.sort,
    prefs.dir,
  );
  const [cat, setCat] = useState<string>('all');
  const catOf = (t: Task) => store.categoryOf(t);
  // 一件任务能挂几个类型（Rei 2026-10-28）：筛选看挂没挂这个类型
  const hasCat = (t: Task, id: string) => store.categoryIdsOfTask(t).includes(id);
  const usedCats = store.categories(true).filter((c) => countdowns.some(({ t }) => hasCat(t, c.id)));
  const hasUncategorized = countdowns.some(({ t }) => !catOf(t));
  const shown = cat === 'all' ? countdowns : countdowns.filter(({ t }) => (cat === NO_CATEGORY ? !catOf(t) : hasCat(t, cat)));
  const nOf = new Map(shown.map((e) => [e.t.id, e.n]));
  const sections = sectionCountdowns(
    shown.map((e) => e.t),
    prefs.section,
    {
      now,
      today,
      weekStart: weekStartsOn(),
      ...(prefs.section === 'type' ? { categories: categorySectionOrder(store), categoryIdsOf: (t: Task) => store.categoryIdsOfTask(t) } : {}),
    },
  );
  // 不弹新建面板（Rei 2026-11-09 01:31）：直接建一条空倒数日，在详情里打开、日期在详情里选（lib/blank-task）
  const newCountdown = () => createBlankTask(store, ui.openEditor, 'countdown', cat !== 'all' && cat !== NO_CATEGORY ? cat : null);
  // 按类型分区时卡片上不再写类型（段标题就是），同原来的「按类型」排列
  const render = (list: Task[]) =>
    prefs.view === 'list' ? (
      <div className="task-list plain countdown-list">
        {list.map((t) => (
          <CountdownRow key={t.id} task={t} n={nOf.get(t.id) ?? 0} />
        ))}
      </div>
    ) : (
      <div className="countdown-grid">
        {list.map((t) => (
          <CountdownCard key={t.id} task={t} n={nOf.get(t.id) ?? 0} withCat={prefs.section !== 'type'} />
        ))}
      </div>
    );

  return (
    <div className="page countdown-page">
      {/* 没有可见标题，读屏还是要有页面名（同打卡页） */}
      <h1 className="sr-only">{tr('倒数日')}</h1>
      <div className="filter-row checkin-toolbar countdown-toolbar">
        <div className="countdown-menus">
          {countdowns.length > 0 && (
            <>
              <ViewDrop value={prefs.view} onChange={(view) => setPrefs({ view })} />
              <SortDrop sort={prefs.sort} dir={prefs.dir} onChange={(sort, dir) => setPrefs({ sort, dir })} />
              <SectionDrop value={prefs.section} onChange={(section) => setPrefs({ section })} />
            </>
          )}
        </div>
        <div className="checkin-head-actions">
          {/* 原来在页头右边，只放图标（Rei 2026-11-09 01:59），文字在悬停提示和读屏名里 */}
          <NewButton label={tr('新建倒数日')} onPress={newCountdown} />
        </div>
      </div>
      {countdowns.length > 0 && usedCats.length > 0 && (
        <div className="filter-row checkin-filters">
          <ChipPicker
            label={tr('按类型筛选')}
            value={cat}
            onChange={setCat}
            options={[
              { id: 'all', label: tr('全部 {length}', { length: countdowns.length }) },
              ...usedCats.map((c) => ({ id: c.id, label: <CategoryLabel c={c} plain />, color: c.color })),
              ...(hasUncategorized ? [{ id: NO_CATEGORY, label: tr('没有类型') }] : []),
            ]}
          />
        </div>
      )}
      {countdowns.length ? (
        sections ? (
          <SectionedList sections={sections} collapsed={prefs.collapsed} onCollapsedChange={(collapsed) => setPrefs({ collapsed })} idPrefix="countdown" renderList={(list) => render(list)} />
        ) : (
          render(shown.map((e) => e.t))
        )
      ) : (
        <Empty icon={<Hourglass size={28} />} title={tr('还没有倒数日')} hint={tr('考试、纪念日、出发那天，记下来看看还有几天。')} />
      )}
    </div>
  );
}
