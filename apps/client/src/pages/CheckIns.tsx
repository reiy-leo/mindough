import { useCallback, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Menu, MenuItem, MenuTrigger, Popover, Button as RacButton } from 'react-aria-components';
import { Activity, Archive, ArchiveRestore, ArrowLeft, CalendarCheck2, Check, ListFilter, ChevronRight, CircleCheck, Ellipsis, Flame, GripHorizontal, History, PanelRight, Pin, PinOff, Plus, Sun, SunDim, Timer } from 'lucide-react';
import {
  buildRatioIndex,
  describeRecurrence,
  dueToday,
  entriesFor,
  isFinished,
  parseRecurrence,
  taskStreak,
  toDateKey,
  type DateKey,
  type Task,
} from '@mindough/core';
import { useNow, useStore } from '../store/StoreProvider';
import { CategoryLabel, CategoryLabels, NO_CATEGORY } from '../components/CategoryPicker';
import { useUi } from '../lib/ui';
import { useSettings } from '../lib/settings';
import { Button, Empty, MenuAt, Section, Segmented, Tip, TipButton, useContextMenuAt, type MenuAction } from '../ui/primitives';
import { useColorLevel, vividVar } from '../lib/color-level';
import { habitMenu } from '../lib/task-menu';
import { archiveHabit, toggleMyDay, togglePin } from '../lib/actions';
import { createBlankTask } from '../lib/blank-task';
import { isHeatmapOpen, toggleHeatmapOpen } from '../lib/habit-heatmap';
import { Heatmap } from '../components/Heatmap';
import { CheckInControl } from '../components/CheckInControl';
import { MakeupButton } from '../components/MakeupButton';
import { HoverTip } from '../ui/HoverTip';
import { useStuck } from '../components/QuickAddBar';
import { titleOf } from '../lib/view';

import { tr, trc } from '../lib/i18n';
import { useLunarUi } from '../lib/lunar';
export function CheckInsPage() {
  const store = useStore();
  const ui = useUi();
  const head = useStuck();
  const { layout, settings, set } = useSettings();
  const colorLevel = useColorLevel();
  const now = useNow();
  const today = toDateKey(now);
  const lunarUi = useLunarUi();
  // 归档了的项目里的打卡不列（Rei 2026-11-05），在项目页里还看得到
  const tasks = store.activeTasks();
  const checkIns = store.list('check_in');
  const idx = useMemo(() => buildRatioIndex(tasks, checkIns, now), [store.version, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayRatio = useCallback((d: DateKey) => idx.dayRatio(d), [idx]);

  // 类型下拉和「编辑」按钮去掉了（Rei 2026-11-10 08:27「打卡页 不显示 类型dropdown和编辑btn」）：打卡页不再按类型筛选，
  // 想按类型看用「按类型」排列；改类型去侧栏「类型」页
  const [arrange, setArrange] = useState<'today' | 'category'>('today');
  // 归档了的（Rei 2026-11-02「打卡任务可以归档」）不在主列表里，放在最下面折叠的「已归档」一节
  const liveRecurring = tasks.filter((t) => parseRecurrence(t.recurrence) && !isFinished(t.status));
  const allRecurring = liveRecurring.filter((t) => !t.archived_at);
  const allArchived = liveRecurring.filter((t) => !!t.archived_at).sort((a, b) => (b.archived_at! < a.archived_at! ? -1 : 1));
  // 页头下拉（Rei 2026-11-09 01:59「右侧显示一个dropdown图标按钮，1. 显示所有的活着的打卡任务，2. 显示已经归档的打卡任务」）：
  // today = 默认（正在计时 / 今天要打卡 / 可以补打 / 已打卡）；all = 全部没归档的；archived = 只看归档的。不记，每次进来都是 today
  const [view, setView] = useState<'today' | 'all' | 'archived'>('today');
  // 行的右键 / 长按菜单：整页一个，记下是哪一行
  const menu = useContextMenuAt();
  const menuTask = useRef<string | null>(null);
  const bindMenu = (id: string) => ({
    ...menu.props,
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => {
      menuTask.current = id;
      menu.props.onContextMenu(e);
    },
    onPointerDownCapture: (e: ReactPointerEvent<HTMLElement>) => {
      menuTask.current = id;
      menu.props.onPointerDownCapture(e);
    },
  });
  const dayIds = new Set(entriesFor(store.list('my_day'), today).map((e) => e.task_id));
  const menuItems = (): MenuAction[] => {
    const id = menuTask.current;
    const t = id ? store.get('task', id) : undefined;
    if (!t) return [];
    const inDay = dayIds.has(t.id) || !!t.pinned_at;
    const icon = { open: <PanelRight size={16} />, myday: inDay ? <SunDim size={16} /> : <Sun size={16} />, pin: <Pin size={16} />, unpin: <PinOff size={16} />, archive: <Archive size={16} />, unarchive: <ArchiveRestore size={16} /> };
    return habitMenu(!!t.archived_at, inDay, !!t.pinned_at).map((e) => ({
      ...e,
      icon: icon[e.id],
      onAction: () => {
        if (e.id === 'open') ui.openEditor(t.id);
        else if (e.id === 'myday') toggleMyDay(store, ui, t.id);
        else if (e.id === 'pin' || e.id === 'unpin') togglePin(store, ui, t.id);
        else archiveHabit(store, ui, t.id, e.id === 'archive');
      },
    }));
  };
  // 类型（Rei 2026-10-26：和项目、倒数日共用一套）：顺着合并找到留下的那个
  const catOf = (t: Task) => store.categoryOf(t);
  // 一件任务能挂几个类型（Rei 2026-10-28）：筛选看挂没挂这个类型；按类型分组时放在第一个类型下面（不重复出现）
  const hasCat = (t: Task, id: string) => store.categoryIdsOfTask(t).includes(id);
  // 筛选标签：只列出有重复任务挂着的类型（按类型顺序，不显示的也算，挂着就列），有没类型的再加一个“没有类型”
  // 「按类型」排列用：只列有打卡挂着的类型
  const usedCats = store.categories(true).filter((c) => allRecurring.some((t) => hasCat(t, c.id)));
  const recurring = allRecurring;
  const archived = allArchived;
  const dueNow = recurring.filter((t) => dueToday(t, today));
  // 按今天排（Rei 2026-11-09 01:05「今天打卡完成的放在已打卡section，不是今天的打卡不显示」）：
  // 今天要打、还没达标的在上；今天达标的进「已打卡」（可折叠，本机记住，默认展开）；今天不用打的不列（「按类型」里还看得到）
  const dueOpen = dueNow.filter((t) => !store.progress(t.id, today)?.met);
  const dueMet = dueNow.filter((t) => store.progress(t.id, today)?.met);
  const doneOpen = settings.checkInsDoneOpen !== false;
  // 可以补打（Rei 2026-11-09 01:52）：今天不用打、上一个节点没达标、还没到下一个节点的（core makeupNode）；严格模式下不给补
  const makeupList = settings.strictMode ? [] : recurring.filter((t) => !dueToday(t, today) && !!store.makeupNode(t.id, today));
  const running = tasks.filter((t) => t.completion_mode === 'timer' && !t.archived_at && store.progress(t.id, today)?.running);
  const title = (t: Task) => titleOf(store, t);

  const row = (t: Task) => {
    const s = taskStreak(t, store.checkInsOf(t.id), now);
    const type = store.get('task_type', t.type_id);
    const color = type?.color && type.layout !== 'text' ? type.color : undefined;
    const open = isHeatmapOpen(settings.habitHeatmapOpen, t.id);
    const heatId = `habit-heat-${t.id}`;
    return (
      <div key={t.id} className={`habit-row${ui.editingId === t.id ? ' is-selected' : ''}${open ? ' is-heat-open' : ''}${t.archived_at ? ' is-archived' : ''}`} data-task-id={t.id} style={vividVar(colorLevel, store.categoriesOfTask(t)[0]?.color ?? color, '--ci-color')} {...bindMenu(t.id)}>
        {/* 左上角活动图标：展开 / 收起这张卡片的活动图（只存本机）；和打开详情的按钮分开，点它不会打开详情 */}
        <TipButton
          tip={open ? tr('隐藏活动图') : tr('显示活动图')}
          isExpanded={open}
          controls={open ? heatId : undefined}
          className={`habit-heat-dot${open ? ' is-on' : ''}`}
          onPress={() => set('habitHeatmapOpen', toggleHeatmapOpen(settings.habitHeatmapOpen, t.id))}
        >
          {/* 圆点换成 activity 图标（Rei 2026-11-09 03:46「打卡左上角的"显示活动图"小圆点换成activity」）：收起是淡灰，展开是打卡颜色 */}
          <Activity size={15} className="habit-heat-dot-mark" style={color ? ({ '--heat-color-local': color } as CSSProperties) : undefined} aria-hidden />
        </TipButton>
        <RacButton
          className="habit-main"
          aria-current={ui.editingId === t.id ? 'true' : undefined}
          onPress={() => {
            if (menu.consumeLongPress()) return;
            ui.openEditor(t.id);
          }}
        >
          <span className="habit-title">{title(t)}</span>
          <span className="habit-meta">
            {arrange !== 'category' && catOf(t) && <CategoryLabels cats={store.categoriesOfTask(t)} size={12} />}
            {describeRecurrence(parseRecurrence(t.recurrence), { lunar: lunarUi, today })}
            {s && (
              // 只放图标 + 数字（Rei 2026-11-09 03:43「连续用grip-horizontal。连续和最长(图标用ellipsis)的文字都不显示」）；
              // 「连续 N 天」「最长 N 天」在悬停提示和读屏名里
              <>
                <HoverTip className="habit-streak" tip={tr('连续 {current} 天', { current: s.current })}>
                  <GripHorizontal size={12} className={s.current > 0 ? 'streak-on' : ''} aria-hidden />
                  {s.current}
                </HoverTip>
                <HoverTip className="habit-streak" tip={tr('最长 {best} 天', { best: s.best })}>
                  <Ellipsis size={12} aria-hidden />
                  {s.best}
                </HoverTip>
              </>
            )}
          </span>
        </RacButton>
        <div className="habit-action">
          {t.archived_at ? (
            <RacButton className="btn btn-quiet habit-unarchive" onPress={() => archiveHabit(store, ui, t.id, false)}>
              <ArchiveRestore size={15} aria-hidden />
              {tr('取消归档')}
            </RacButton>
          ) : (
            <>
              <MakeupButton store={store} task={t} />
              <CheckInControl store={store} task={t} compact={layout === 'mobile'} />
            </>
          )}
        </div>
        {open && (
          <div className="habit-heat">
            <Heatmap
              mini
              fit
              id={heatId}
              end={today}
              ratioFor={(d) => idx.taskRatio(t.id, d)}
              madeUp={(d) => idx.madeUp(t.id, d)}
              color={color}
              label={tr('{title} 的打卡记录', { title: title(t) })}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page checkin-page">
      {/* 页头去掉（Rei 2026-11-10 08:27「打卡页 去掉标题和下方统计信息」「按今天、按类型btn group放到左边」）：
          一行工具栏，左边「按今天 / 按类型」（所有 / 已归档视图里换成「回到今天」），右边新建和「显示哪些打卡」。
          手机上标题在顶栏（App 的 HEADERLESS_PAGES） */}
      {/* 没有可见标题，读屏还是要有页面名（同等待安排、过期积压） */}
      <h1 className="sr-only">{view === 'all' ? tr('所有打卡') : view === 'archived' ? tr('已归档的打卡') : trc('导航', '打卡')}</h1>
      {/* 工具栏和顶部活动图固定在顶上，只有下面的分区滚（Rei 2026-11-11「打卡页只滚动下面的 sections」）；滚动条藏起来（App 的 HIDE_SCROLLBAR_PAGES） */}
      <div ref={head.sentinel} className="add-bar-sentinel" aria-hidden />
      <div className={`checkin-head-sticky${head.stuck ? ' is-stuck' : ''}`}>
      <div className="filter-row checkin-toolbar">
        {view !== 'today' ? (
          <RacButton className="btn btn-quiet checkin-back" onPress={() => setView('today')}>
            <ArrowLeft size={16} aria-hidden />
            {tr('回到今天')}
          </RacButton>
        ) : allRecurring.length > 0 ? (
          <Segmented
            label={tr('排列方式')}
            value={arrange}
            onChange={setArrange}
            options={[
              { id: 'today', label: tr('按今天') },
              { id: 'category', label: tr('按类型') },
            ]}
          />
        ) : (
          <span />
        )}
        <div className="checkin-head-actions">
          {/* 只放图标（Rei 2026-11-09 01:59「新建按钮只显示图标」），文字在悬停提示和读屏名里 */}
          <Tip content={tr('新建打卡')}>
            <Button
              variant="primary"
              className="btn-icon-only"
              aria-label={tr('新建打卡')}
              // 不弹新建面板（Rei 2026-11-09 01:31）：直接建一条空打卡，在详情里打开（lib/blank-task）
              onPress={() => createBlankTask(store, ui.openEditor, 'checkin', null)}
            >
              <Plus size={18} aria-hidden />
            </Button>
          </Tip>
          <MenuTrigger>
            <Tip content={tr('显示哪些打卡')}>
              <RacButton className={`icon-btn${view !== 'today' ? ' is-active' : ''}`} aria-label={tr('显示哪些打卡')}>
                <ListFilter size={18} aria-hidden />
              </RacButton>
            </Tip>
            <Popover className="popover menu-popover" placement="bottom end" offset={4}>
              {/* 单选；再点一次选中的那项 = 取消选择，回到默认的今天 */}
              <Menu
                className="menu"
                aria-label={tr('显示哪些打卡')}
                selectionMode="single"
                selectedKeys={view === 'today' ? [] : [view]}
                onSelectionChange={(keys) => {
                  const k = [...keys][0];
                  setView(k === 'all' || k === 'archived' ? k : 'today');
                }}
              >
                {([['all', tr('所有打卡'), <CalendarCheck2 key="i" size={16} aria-hidden />], ['archived', tr('已归档的打卡'), <Archive key="i" size={16} aria-hidden />]] as const).map(([id, label, icon]) => (
                  <MenuItem key={id} id={id} className="menu-item menu-check" textValue={label}>
                    {({ isSelected }) => (
                      <>
                        {icon}
                        <span className="menu-check-text">{label}</span>
                        <span className="menu-check-mark" aria-hidden>
                          {isSelected && <Check size={15} />}
                        </span>
                      </>
                    )}
                  </MenuItem>
                ))}
              </Menu>
            </Popover>
          </MenuTrigger>
        </div>
      </div>

      {/* 顶部活动图由设置 → 打卡的开关管（Rei 2026-11-10 08:30），默认关 */}
      {view === 'today' && settings.checkInsYearHeatmap && (
      <section className="card heatmap-card">
        <div className="heatmap-card-head">
          <span className="section-title">{tr('过去一年')}</span>
          <span className="muted small">{tr('每格是一天，颜色越深，那天完成得越多')}</span>
        </div>
        <Heatmap end={today} ratioFor={dayRatio} label={tr('过去一年的打卡热力图')} />
      </section>
      )}
      </div>

      {view === 'all' ? (
        // 所有没归档的打卡平铺：今天要打的在前，其余按打卡页的顺序；类型筛选照样管
        recurring.length ? (
          <div className="habit-list">{[...recurring].sort((a, b) => Number(dueToday(b, today)) - Number(dueToday(a, today)) || a.sort - b.sort).map(row)}</div>
        ) : (
          <Empty title={tr('还没有打卡')} />
        )
      ) : view === 'archived' ? (
        archived.length ? <div className="habit-list">{archived.map(row)}</div> : <Empty title={tr('没有归档的打卡')} />
      ) : arrange === 'category' ? (
        <>
          {[...usedCats.map((c) => ({ key: c.id, c })), { key: NO_CATEGORY, c: undefined }].map(({ key, c }) => {
            const list = recurring.filter((t) => (c ? catOf(t)?.id === c.id : !catOf(t)));
            if (!list.length) return null;
            // 同一类型里：今天要打卡的在前
            list.sort((a, b) => Number(dueToday(b, today)) - Number(dueToday(a, today)));
            return (
              <Section key={key} title={c ? <CategoryLabel c={c} size={15} /> : tr('没有类型')} extra={<span className="muted small">{tr('{length} 项', { length: list.length })}</span>}>
                <div className="habit-list">{list.map(row)}</div>
              </Section>
            );
          })}
          {!recurring.length && <Empty title={tr('还没有打卡')} />}
        </>
      ) : (
        <>
      {running.length > 0 && (
        <Section title={<><Timer size={15} /> {tr('正在计时')}</>}>
          <div className="habit-list">{running.map(row)}</div>
        </Section>
      )}

      <Section title={<><Flame size={15} /> {tr('今天要打卡')}</>}>
        {dueOpen.some((t) => !running.includes(t)) ? (
          <div className="habit-list">{dueOpen.filter((t) => !running.includes(t)).map(row)}</div>
        ) : dueNow.length ? (
          running.length ? null : <Empty title={tr('今天要打的都打完了')} />
        ) : (
          <Empty title={tr('今天没有要打卡的')} />
        )}
      </Section>

      {makeupList.length > 0 && (
        <Section title={<><History size={15} /> {tr('可以补打')}</>} extra={<span className="muted small">{tr('到下一次之前都能补')}</span>}>
          <div className="habit-list">{makeupList.filter((t) => !running.includes(t)).map(row)}</div>
        </Section>
      )}

      {dueMet.length > 0 && (
        <section className={`section habit-archived habit-done${doneOpen ? ' is-open' : ''}`}>
          <RacButton className="habit-archived-toggle" aria-expanded={doneOpen} aria-controls="habit-done-list" onPress={() => set('checkInsDoneOpen', !doneOpen)}>
            <ChevronRight size={15} className="habit-archived-chevron" aria-hidden />
            <CircleCheck size={15} aria-hidden />
            <span className="section-title">{tr('已打卡')}</span>
            <span className="muted small">{tr('{length} 项', { length: dueMet.length })}</span>
          </RacButton>
          {doneOpen && (
            <div id="habit-done-list" className="habit-list">
              {dueMet.map(row)}
            </div>
          )}
        </section>
      )}
        </>
      )}

      <MenuAt at={menu.at} label={tr('打卡操作')} items={menu.at ? menuItems() : []} onClose={menu.close} />
    </div>
  );
}