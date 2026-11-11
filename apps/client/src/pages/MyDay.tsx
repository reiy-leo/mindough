import { GridList, GridListItem, useDragAndDrop, Button as RacButton } from 'react-aria-components';
import { ChevronRight, CircleCheck, EyeOff, Lightbulb, RotateCcw, Sun } from 'lucide-react';
import { formatDateZh, isPinnedEntry, myDaySections, recentlyUnlocked, reorderSection, suggestions, toDateKey, yesterdayUnfinished, type MyDayItem, type Task } from '@mindough/core';
import { useNow, useStore } from '../store/StoreProvider';
import { useUi } from '../lib/ui';
import { Button, Empty, OverflowMenu, Section, Tip } from '../ui/primitives';
import { useReorderGuard } from '../lib/drag-guard';
import { createToday } from '../lib/quick-add';
import { QuickAddBar } from '../components/QuickAddBar';
import { titleOf } from '../lib/view';
import { RowLead, TaskRow } from '../components/TaskRow';
import { LunarLine } from '../components/LunarLine';
import { TopbarActions } from '../lib/topbar-slot';
import { useSettings } from '../lib/settings';
import { daySuggestions, suggestionsOn } from '../lib/myday-suggest';
import { JournalCard } from '../components/journal/JournalCard';
import { visibleDayEntries } from '../lib/project-archive';
import { dayItems } from '../lib/myday-items';
import { MYDAY_SECTIONS, useListView } from '../lib/list-views';
import { categorySectionOrder, sectionTasks, sortByMood, type SectionBy } from '../lib/sections';
import { SectionedList } from '../components/SectionedList';
import { DaySortMenu, SectionMenu } from '../components/project/ProjectMenus';

import { tr } from '../lib/i18n';

export function MyDayPage() {
  const store = useStore();
  const ui = useUi();
  const now = useNow();
  const today = toDateKey(now);
  const { layout, settings, set } = useSettings();
  const showSugg = suggestionsOn(settings);
  const inlineCheckIn = layout !== 'mobile';
  const tasks = store.list('task');
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // 归档了的项目里的任务不显示（lib/project-archive，Rei 2026-11-05）
  const entries = visibleDayEntries(store, store.list('my_day'));
  const checkIns = store.list('check_in');
  // 置顶的任务每天都在，排最上面（Rei 2026-11-08，lib/myday-items）
  const items = dayItems(store, now);
  const yesterday = yesterdayUnfinished(entries, byId, checkIns, today, now, store.pinnedAt);
  const yIds = new Set(yesterday.map((t) => t.id));
  // 建议关着（设置 → 任务「显示建议」）就不算，连「刚解锁」也不算
  const sugg = daySuggestions(showSugg, () => {
    const derived = store.derived();
    const unlocked = recentlyUnlocked(tasks, store.edges(), derived, new Date(now.getTime() - 24 * 3600_000).toISOString());
    return suggestions({ tasks, entries, checkIns, derived, recentlyUnlocked: unlocked, today, now, groups: store.list('group'), pinOf: store.pinnedAt }).filter((s) => !yIds.has(s.task.id));
  });
  // 标题右边「…」→「隐藏建议」：和设置里的开关是同一个；提示里说去哪儿打开，也能直接撤销
  const hideSuggestions = () => {
    set('myDaySuggestions', false);
    ui.toast({ message: tr('建议已隐藏。想再看，去设置 → 任务，打开「显示建议」。'), actions: [{ label: tr('撤销'), onPress: () => set('myDaySuggestions', true) }] }, 6000);
  };
  // 分两段（Rei 2026-11-08）：未完成在上、已完成在下；各段自己拖动排序，勾上就挪到已完成段
  const { open, done } = myDaySections(items);
  const doneOpen = settings.myDayDoneOpen !== false;
  // 分区和排序（Rei 2026-11-08）：只管「未完成」段；置顶的总在最上面、不进分区；都是默认（不分区、手动）时照旧能拖
  const [view, setView] = useListView('myday');
  const custom = view.section !== 'none' || view.sort === 'mood';
  const pinnedOpen = open.filter((i) => isPinnedEntry(i.entry));
  const restOpen = open.filter((i) => !isPinnedEntry(i.entry));
  const sortedRest = view.sort === 'mood' ? sortByMood(restOpen.map((i) => ({ ...i, mood: i.task.mood }))) : restOpen;
  const byTask = new Map(sortedRest.map((i) => [i.task.id, i]));
  const daySections = custom ? sectionTasks(sortedRest.map((i) => i.task), view.section as SectionBy, {
        groups: store.activeGroups(),
        ...(view.section === 'type' ? { categories: categorySectionOrder(store), categoryIdsOf: (t: Task) => store.categoryIdsOfTask(t) } : {}),
      }) : null;
  // 分区 / 按心情排时不能拖，但行左边照样留把手那一格（Rei 2026-11-12 01:19「分区时置顶任务的图钉很挤」）：
  // 以前这里是普通清单，图钉塞进行左边 12px 留白、紧贴勾选圈，圈也比不分区时往左 26px；
  // 现在和不分区（DayList）同一套 .list-item + RowLead：那格是同宽占位，圈、标题都和不分区时一样。
  // 2026-11-12 05:00 起置顶不放图钉，标题加粗（Rei「置顶的任务在任务列表中不显示前面的 pin icon，而是用粗体显示任务标题」）
  const plainRows = (list: MyDayItem[]) => (
    <div className="task-list">
      {list.map((i) => (
        <div key={i.task.id} className={`list-item${ui.editingId === i.task.id ? ' is-selected' : ''}`}>
          <RowLead pinned={isPinnedEntry(i.entry)} />
          <TaskRow store={store} task={i.task} showMyDay={false} doneOverride={i.done} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="page">
      {/* 中间列不放页头（Rei 2026-10-26「我的一天、待安排、可做的中间列的header去掉，换成输入框」）。
          日期和排序 / 分区挪到添加框上面（Rei 2026-11-09 03:48「把输入框下面的日期（去掉进度），排序和分区按钮，移动到上面，日期放大」）：
          日期用页标题的字号（各皮肤的 .page-title），不再显示完成数；这一行和添加框一起固定在顶上 */}
      <QuickAddBar
        placeholder={tr('今天要做什么？按回车添加')}
        label={tr('添加任务到今天')}
        create={(body) => createToday(store, body, today, { dateToday: settings.myDayDefaultToday })}
        head={
          layout === 'mobile' ? (
            // 手机不放页头（Rei 2026-11-12 01:56「我的一天、等待安排、过期积压不显示顶部的页头」）：大号日期和农历去掉，读屏留 h1；
            // 排序 / 分区按钮挪到顶栏右边（顶栏左边写「我的一天」），状态还在这一页
            <>
              <h1 className="sr-only">{tr('我的一天')} · {formatDateZh(today)}</h1>
              <TopbarActions>
                <span className="list-tools">
                  <DaySortMenu value={view.sort} onChange={(sort) => setView({ sort })} />
                  <SectionMenu value={view.section as SectionBy} options={MYDAY_SECTIONS} onChange={(section) => setView({ section })} />
                </span>
              </TopbarActions>
            </>
          ) : (
          <div className="myday-head">
            <div className="myday-head-text">
              <h1 className="page-title myday-date">
                <span className="sr-only">{tr('我的一天')} · </span>
                {formatDateZh(today)}
              </h1>
              <LunarLine date={today} className="myday-lunar" />
            </div>
            <span className="list-tools">
              <DaySortMenu value={view.sort} onChange={(sort) => setView({ sort })} />
              <SectionMenu value={view.section as SectionBy} options={MYDAY_SECTIONS} onChange={(section) => setView({ section })} />
            </span>
          </div>
          )
        }
      />

      {items.length ? (
        <>
          {open.length > 0 && (
            <section className="section myday-open">
              {/* 只有一段时不放段标题，和以前一样就是一张清单 */}
              {done.length > 0 && !daySections && (
                <div className="section-head">
                  <h2 className="section-title">
                    {tr('未完成')} <span className="count">{open.length}</span>
                  </h2>
                </div>
              )}
              {custom ? (
                <>
                  {pinnedOpen.length > 0 && plainRows(pinnedOpen)}
                  {daySections ? (
                    <SectionedList
                      sections={daySections}
                      collapsed={view.collapsed}
                      onCollapsedChange={(collapsed) => setView({ collapsed })}
                      idPrefix="myday"
                      renderList={(list) => plainRows(list.map((t) => byTask.get(t.id)!).filter(Boolean))}
                    />
                  ) : (
                    plainRows(sortedRest)
                  )}
                </>
              ) : (
                <DayList section="open" label={tr('今天的任务')} list={open} all={items} today={today} />
              )}
            </section>
          )}
          {done.length > 0 && (
            <section className={`section myday-done${doneOpen ? ' is-open' : ''}`}>
              <RacButton className="habit-archived-toggle" aria-expanded={doneOpen} aria-controls="myday-done-list" onPress={() => set('myDayDoneOpen', !doneOpen)}>
                <ChevronRight size={15} className="habit-archived-chevron" aria-hidden />
                <CircleCheck size={15} aria-hidden />
                <span className="section-title">
                  {tr('已完成')} <span className="count">{done.length}</span>
                </span>
              </RacButton>
              {doneOpen && <DayList id="myday-done-list" section="done" label={tr('今天做完的任务')} list={done} all={items} today={today} />}
            </section>
          )}
        </>
      ) : (
        <Empty icon={<Sun size={28} />} title={tr('今天还是空的')} hint={tr('在上面直接写，或按 ⌘F / Ctrl+F 从全部任务里挑几件加进来')} />
      )}

      {yesterday.length > 0 && (
        <Section
          title={
            <>
              <RotateCcw size={15} /> {tr('昨天没做完')} <span className="count">{yesterday.length}</span>
            </>
          }
          extra={
            <Button variant="ghost" onPress={() => yesterday.forEach((t) => store.addToMyDay(t.id, today))}>
              {tr('全部带回今天')}</Button>
          }
        >
          <div className="task-list plain carry-list">
            {yesterday.map((t) => (
              <TaskRow
                key={t.id}
                store={store}
                task={t}
                showMyDay={false}
                showCheckIn={inlineCheckIn}
                trailing={
                  <Tip content={tr('带回今天')}>
                    <Button variant="tonal" className="small carry-btn" aria-label={tr('带回今天')} onPress={() => store.addToMyDay(t.id, today)}>
                      <Sun size={14} className="carry-icon" aria-hidden />
                      <span className="carry-label">{tr('带回今天')}</span>
                    </Button>
                  </Tip>
                }
              />
            ))}
          </div>
        </Section>
      )}

      {sugg.length > 0 && (
        <Section
          title={
            <>
              <Lightbulb size={15} /> {tr('建议')} <span className="count">{sugg.length}</span>
            </>
          }
          extra={<OverflowMenu label={tr('建议操作')} items={[{ id: 'hide', label: tr('隐藏建议'), icon: <EyeOff size={16} />, onAction: hideSuggestions }]} />}
        >
          <div className="task-list plain">
            {sugg.map((s) => (
              <TaskRow
                key={s.task.id}
                store={store}
                task={s.task}
                showMyDay={false}
                showDate
                showCheckIn={inlineCheckIn}
                // 行尾不放「今天到期」徽章和「+ 加入」（Rei 2026-10-25「任何情况下都不显示这两个按钮」）：
                // 到期看元信息里的日期，加入我的一天用行的右键 / 长按菜单（TaskRow）
              />
            ))}
          </div>
        </Section>
      )}

      <JournalCard />
    </div>
  );
}

/** 我的一天的一段：能拖动排序（只在段内），拖完拼回整天的顺序（core reorderSection）。 */
function DayList({ id, section, label, list, all, today }: { id?: string; section: 'open' | 'done'; label: string; list: MyDayItem[]; all: MyDayItem[]; today: string }) {
  const store = useStore();
  const ui = useUi();
  // 拖完不留高亮、不选中被拖的行（lib/drag-guard）
  const reorderGuard = useReorderGuard();
  const { dragAndDropHooks } = useDragAndDrop({
    ...reorderGuard.handlers,
    getItems: (keys) => [...keys].map((k) => ({ 'text/plain': String(k) })),
    onReorder: (e) => {
      const order = list.map((i) => i.task.id);
      const moving = [...e.keys].map(String);
      // 置顶的总在最上面（Rei 2026-11-08）：拖它不动；拖到置顶的上面也一样排在置顶的下面（core reorderSection 去掉置顶的）
      if (list.some((i) => isPinnedEntry(i.entry) && moving.includes(i.task.id))) return;
      const rest = order.filter((x) => !moving.includes(x));
      const targetIdx = rest.indexOf(String(e.target.key));
      const insertAt = e.target.dropPosition === 'before' ? targetIdx : targetIdx + 1;
      rest.splice(insertAt, 0, ...moving);
      store.reorderMyDay(today, reorderSection(all, section, rest));
    },
  });
  return (
    <GridList id={id} ref={reorderGuard.ref} aria-label={label} className="task-list" dragAndDropHooks={dragAndDropHooks} dependencies={[ui.editingId]} items={list.map((i) => ({ ...i, id: i.task.id }))}>
      {(item) => (
        <GridListItem id={item.id} textValue={titleOf(store, item.task).slice(0, 40) || tr('任务')} className={`list-item${ui.editingId === item.id ? ' is-selected' : ''}`}>
          {/* 置顶的总在最上面，不能拖（Rei 2026-11-08）；把手那格留空（2026-11-12 起置顶不放图钉，标题加粗） */}
          <RowLead pinned={isPinnedEntry(item.entry)} dragLabel={isPinnedEntry(item.entry) ? undefined : tr('拖动排序')} />
          <TaskRow
            store={store}
            task={item.task}
            showMyDay={false}
            doneOverride={item.done}
            // 行尾不放 ×（Rei 2026-10-25「删除my day中的条目右侧的x按钮」）：移出我的一天用行的右键 / 长按菜单或详情里的太阳
          />
        </GridListItem>
      )}
    </GridList>
  );
}
