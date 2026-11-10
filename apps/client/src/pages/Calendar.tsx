/**
 * 日历（Rei 2026-11-10「侧边栏时间轴换成"日历"」，方案 docs/CALENDAR.md）：路由仍是 agenda（#/calendar，旧 #/agenda 也行）。
 * - 视图下拉：周、月、年、多日（2–14 天）、多周（1–6 周）；每台设备记住上次的视图和参数（settings.calendarView），没记过的默认周（Rei 2026-11-11）。
 * - 任务：有日期、没结束、不重复的，按日期 / 日期段画进格子（core layoutRow 排道），只写标题；宽屏点开是居中浮层（lib/detail-pane），手机整页。
 * - 倒数日：没结束的，画在目标日那天（Rei 2026-11-11 月视图「当天有倒数日时优先显示倒数日」）。
 * - 宽屏周、多日、多周、月（Rei 2026-11-11 01:10）：格子列出当天全部条目，没有「还有 N 件」，格子按内容撑高（页面滚）；
 *   每天从上往下是倒数日 → 任务 → 订阅事件（core layoutRow 分档排道、sortDayItems）。
 *   月视图日期旁数「任务 + 打卡 + 倒数日」（core dayCount），点数字看那天的列表。打卡只算进个数，不画在任何视图、列表里（Rei 2026-11-11 01:08）。
 *   原来按天往下排的时间轴列表已经删掉（旧地址 #/agenda、view/timeline 打开的就是这一页）。
 * - 订阅事件（lib/calendar-subs）：带订阅颜色的竖线、只读，点开看详情（EventSheet）。
 * - 节假日 / 农历：日期旁的小字和「休」「班」都走 useLunar（同日期面板的 LunarMark）。
 * - 新建：格子右上角「+」→ 格子里输入，回车建那天的任务。
 * - 拖动改日期（Rei 2026-11-11 06:55，lib/cal-drag）：周、多日、多周、月能拖，年视图不拖；能拖的是任务和倒数日，订阅事件只读。
 *   有起止的整段平移、天数不变（core calDropPatch）；写入走 store.updateTask（我的一天跟着走），提示里能撤销。手机月视图从下面的列表拖到上面的小月历。
 * - 手机：月视图上面是小月历（只画点），下面是选中那天的列表；周、多日、多周按天竖排；年视图一列两个月。
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Form, TextField, Button as RacButton } from 'react-aria-components';
import { Calendar, ChevronLeft, ChevronRight, Hourglass, Plus, MapPin } from 'lucide-react';
import {
  CAL_VIEW_KINDS,
  DAYS_MAX,
  DAYS_MIN,
  WEEKS_MAX,
  WEEKS_MIN,
  calItemTier,
  calRange,
  calDropPatch,
  calPatchStart,
  calShiftPatch,
  calUndoPatch,
  type CalDatePatch,
  dayCount,
  compareDateKey,
  dueToday,
  formatDateRange,
  isFinished,
  itemsOnDay,
  layoutRow,
  normalizeCalView,
  normalizeSubColor,
  parseRecurrence,
  parseDateKey,
  plainTitleMarkdown,
  sortDayItems,
  stepCalAnchor,
  addDays,
  taskEndDate,
  toDateKey,
  weekday,
  weekdayLabel,
  weekStartsOn,
  yearMonths,
  type CalView,
  type CalViewKind,
  type DateKey,
  type Task,
} from '@mindough/core';
import { useNow, useStore } from '../store/StoreProvider';
import { Button, IconButton, InlineNumber, Select, Sheet } from '../ui/primitives';
import { PageHeader } from '../components/PageHeader';
import { WrapInput, stripNewlines } from '../components/WrapInput';
import { LunarMark } from '../components/task/DateGrid';
import { useLunar } from '../lib/lunar';
import { useCalendarEvents, type CalEvent } from '../lib/calendar-subs';
import { useSettings } from '../lib/settings';
import { calDragSuppressed, useCalDrag, type CalDragRole } from '../lib/cal-drag';
import { useUi } from '../lib/ui';
import { titleOf } from '../lib/view';
import { intlLocale, tr, trc } from '../lib/i18n';
import '../styles/calendar.css';

interface TaskItem {
  kind: 'task';
  /** 普通任务、倒数日（目标日那天）、打卡（只给月视图数个数用，每个要打卡的日子一条，不显示）。 */
  role: 'task' | 'countdown' | 'checkin';
  id: string;
  start: DateKey;
  end: DateKey;
  task: Task;
}
interface EventItem extends CalEvent {
  kind: 'event';
  role: 'event';
}
type Item = TaskItem | EventItem;

const VIEW_LABEL: Record<CalViewKind, () => string> = {
  week: () => trc('日历视图', '周'),
  month: () => trc('日历视图', '月'),
  year: () => trc('日历视图', '年'),
  days: () => trc('日历视图', '多日'),
  weeks: () => trc('日历视图', '多周'),
};

const timeFmt = () => new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit' });

function rangeTitle(view: CalView, from: DateKey, to: DateKey, coreFrom: DateKey, today: DateKey): string {
  const { y, m } = parseDateKey(coreFrom);
  if (view.kind === 'year') return new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', year: 'numeric' }).format(new Date(Date.UTC(y, 0, 1)));
  if (view.kind === 'month') return new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', year: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return formatDateRange(from, to, today, { year: from.slice(0, 4) !== today.slice(0, 4) || to.slice(0, 4) !== today.slice(0, 4) });
}

export function CalendarPage() {
  const store = useStore();
  const now = useNow();
  const today = toDateKey(now);
  const { settings, set, layout } = useSettings();
  const mobile = layout === 'mobile';
  const view = normalizeCalView(settings.calendarView);
  const setView = (v: CalView) => set('calendarView', v);
  const [anchor, setAnchor] = useState<DateKey>(today);
  const [picked, setPicked] = useState<DateKey>(today);
  const [openEvent, setOpenEvent] = useState<CalEvent | null>(null);
  const [dayOpen, setDayOpen] = useState<DateKey | null>(null);
  const weekStart = weekStartsOn();
  const range = calRange(view, anchor, weekStart);
  const lunar = useLunar(store);
  const events = useCalendarEvents(store);

  // 完成、关闭的不列；重复的（打卡）不画进格子；归档项目里的不列（activeTasks 已排除）
  const active = store.activeTasks();
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const t of active) {
      if (isFinished(t.status) || t.recurrence) continue;
      if (t.completion_mode === 'countdown') {
        if (t.target_date) out.push({ kind: 'task', role: 'countdown', id: t.id, start: t.target_date, end: t.target_date, task: t });
      } else if (t.scheduled_date) out.push({ kind: 'task', role: 'task', id: t.id, start: t.scheduled_date, end: taskEndDate(t) ?? t.scheduled_date, task: t });
    }
    for (const e of events) out.push({ ...e, kind: 'event', role: 'event' });
    return out.filter((it) => compareDateKey(it.end, range.from) >= 0 && compareDateKey(it.start, range.to) <= 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.version, events, range.from, range.to]);
  // 打卡：只在月视图里算（每个要打卡的日子一条），只进个数；格子、当天列表、点数字弹出的列表都不列（Rei 2026-11-11 01:08）
  const countItems: Item[] = useMemo(() => {
    if (view.kind !== 'month') return items;
    const out: Item[] = [...items];
    const habits = active.filter((t) => t.completion_mode !== 'countdown' && parseRecurrence(t.recurrence));
    for (let d = range.from; compareDateKey(d, range.to) <= 0; d = addDays(d, 1)) {
      for (const t of habits) if (dueToday(t, d)) out.push({ kind: 'task', role: 'checkin', id: `checkin:${t.id}:${d}`, start: d, end: d, task: t });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, view.kind, store.version, range.from, range.to]);

  const go = (dir: 1 | -1) => {
    const next = stepCalAnchor(view, anchor, dir);
    setAnchor(next);
    if (view.kind === 'month' || view.kind === 'year') setPicked(next);
  };
  const goToday = () => {
    setAnchor(today);
    setPicked(today);
  };
  const create = (date: DateKey, text: string) => {
    if (text.trim()) store.createTask({ body_md: plainTitleMarkdown(text.trim()), scheduled_date: date });
  };

  const toolbar = (
    <div className="cal-toolbar">
      <div className="cal-nav">
        <IconButton label={tr('上一段')} onPress={() => go(-1)}>
          <ChevronLeft size={18} />
        </IconButton>
        <Button variant="secondary" onPress={goToday}>
          {tr('今天')}
        </Button>
        <IconButton label={tr('下一段')} onPress={() => go(1)}>
          <ChevronRight size={18} />
        </IconButton>
        <h2 className="cal-range-title" aria-live="polite">
          {rangeTitle(view, range.from, range.to, range.coreFrom, today)}
        </h2>
      </div>
      <div className="cal-view-pick">
        <Select label={tr('视图')} className="cal-view-select" value={view.kind} onChange={(k) => setView({ ...view, kind: k as CalViewKind })} options={CAL_VIEW_KINDS.map((k) => ({ id: k, label: VIEW_LABEL[k]() }))} />
        {view.kind === 'days' && (
          <span className="cal-count">
            <InlineNumber label={tr('天数')} value={view.days} min={DAYS_MIN} max={DAYS_MAX} width={2} onChange={(n) => setView({ ...view, days: n })} />
            {tr('天')}
          </span>
        )}
        {view.kind === 'weeks' && (
          <span className="cal-count">
            <InlineNumber label={tr('周数')} value={view.weeks} min={WEEKS_MIN} max={WEEKS_MAX} width={2} onChange={(n) => setView({ ...view, weeks: n })} />
            {tr('周')}
          </span>
        )}
      </div>
    </div>
  );

  const onItem = (it: Item) => (it.kind === 'task' ? undefined : setOpenEvent(it));

  // 拖动改日期（年视图不拖）
  const ui = useUi();
  const rootRef = useRef<HTMLDivElement>(null);
  const applyMove = useCallback((id: string, patch: CalDatePatch | null) => {
    const task = store.get('task', id);
    if (!task || !patch || store.isLocked(task)) return;
    const undo = calUndoPatch(task, patch);
    const next = store.updateTask(id, patch);
    const start = calPatchStart(patch);
    const end = 'end_date' in patch ? next.end_date : null;
    ui.toast(
      {
        tone: 'info',
        message: tr('已把「{title}」改到{date}', { title: titleOf(store, next) || tr('无标题'), date: formatDateRange(start, end && end !== start ? end : null, today) }),
        actions: [{ label: tr('撤销'), onPress: () => store.updateTask(id, undo) }],
      },
      6000,
    );
  }, [store, ui, today]);
  useCalDrag(rootRef, {
    enabled: view.kind !== 'year',
    rangeOf: (id, role) => {
      const it = items.find((x): x is TaskItem => x.kind === 'task' && x.id === id && x.role === role);
      return it && !store.isLocked(it.task) ? { start: it.start, end: it.end } : null;
    },
    onDrop: (id, role, grabbed, dropped) => {
      const task = store.get('task', id);
      if (task) applyMove(id, calDropPatch(task, role, grabbed, dropped));
    },
    onShift: (id, role, n) => {
      const task = store.get('task', id);
      if (task) applyMove(id, calShiftPatch(task, role, n));
    },
  });

  let body: ReactNode;
  if (view.kind === 'year') {
    body = <YearView year={Number(anchor.slice(0, 4))} weekStart={weekStart} today={today} items={items} lunar={lunar} mobile={mobile} onPick={(d) => {
      setView({ ...view, kind: 'month' });
      setAnchor(d);
      setPicked(d);
    }} />;
  } else if (mobile && view.kind === 'month') {
    body = (
      <>
        <MiniMonth rows={range.rows} weekStart={weekStart} coreFrom={range.coreFrom} coreTo={range.coreTo} today={today} picked={picked} items={countItems} lunar={lunar} onPick={setPicked} />
        <DayList date={picked} today={today} items={itemsOnDay(picked, items)} lunar={lunar} onItem={onItem} onCreate={create} />
      </>
    );
  } else if (mobile) {
    body = (
      <div className="cal-day-lists">
        {range.rows.flat().map((d) => (
          <DayList key={d} date={d} today={today} items={itemsOnDay(d, items)} lunar={lunar} onItem={onItem} onCreate={create} />
        ))}
      </div>
    );
  } else if (view.kind === 'month') {
    body = <GridView view={view} rows={range.rows} weekStart={weekStart} coreFrom={range.coreFrom} coreTo={range.coreTo} today={today} items={items} countItems={countItems} lunar={lunar} onItem={onItem} onDay={setDayOpen} onCreate={create} />;
  } else {
    body = (
      <GridView view={view} rows={range.rows} weekStart={weekStart} coreFrom={range.coreFrom} coreTo={range.coreTo} today={today} items={items} lunar={lunar} onItem={onItem} onDay={setDayOpen} onCreate={create} />
    );
  }

  return (
    <div ref={rootRef} className={`page cal-page is-${view.kind}${mobile ? ' is-mobile' : ''}`}>
      <PageHeader title={trc('导航', '日历')} icon={<Calendar size={22} />} compact />
      {toolbar}
      {body}
      <EventSheet event={openEvent} onClose={() => setOpenEvent(null)} />
      <Sheet isOpen={!!dayOpen} onOpenChange={(v) => !v && setDayOpen(null)} title={dayOpen ? formatDateRange(dayOpen, null, today) : ''}>
        {dayOpen && <DayList date={dayOpen} today={today} items={itemsOnDay(dayOpen, items)} lunar={lunar} onItem={(it) => {
          if (it.kind === 'event') setOpenEvent(it);
          setDayOpen(null);
        }} onCreate={create} bare />}
      </Sheet>
    </div>
  );
}

type Lunar = ReturnType<typeof useLunar>;

function DayHead({ date, today, lunar, inCore, children }: { date: DateKey; today: DateKey; lunar: Lunar; inCore: boolean; children?: ReactNode }) {
  const info = lunar.any ? lunar.day(date) : null;
  const { d } = parseDateKey(date);
  return (
    <div className={`cal-day-head${date === today ? ' is-today' : ''}${inCore ? '' : ' is-outside'}${info?.sub?.badge ? ` is-${info.sub.badge}` : ''}`}>
      <span className="cal-day-num">{d === 1 ? new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1))) : d}</span>
      {info && (
        <span className="cal-day-lunar">
          <LunarMark info={info} />
        </span>
      )}
      {children}
    </div>
  );
}

function ItemButton({ it, onItem }: { it: Item; onItem: (it: Item) => void }) {
  const store = useStore();
  const ui = useUi();
  if (it.kind === 'task') {
    const title = titleOf(store, it.task) || tr('无标题');
    const id = it.task.id;
    const role: CalDragRole | undefined = it.role === 'task' || it.role === 'countdown' ? it.role : undefined;
    return (
      <RacButton
        className={`cal-item is-task${it.role !== 'task' ? ` is-${it.role}` : ''}${ui.editingId === id ? ' is-selected' : ''}`}
        data-task-id={id}
        data-cal-drag={role && !store.isLocked(it.task) ? id : undefined}
        data-cal-role={role}
        onPress={() => {
          // 刚拖完、手指刚拿起的那次点按不开详情
          if (!calDragSuppressed()) ui.openEditor(id);
        }}
        aria-label={it.role === 'countdown' ? `${tr('倒数日')} · ${title}` : title}
      >
        {it.role === 'countdown' ? <Hourglass size={12} className="cal-item-icon" aria-hidden /> : <span className="cal-item-dot" aria-hidden />}
        <span className="cal-item-text">{title}</span>
      </RacButton>
    );
  }
  const time = !it.allDay && it.startMs != null ? timeFmt().format(new Date(it.startMs)) : '';
  return (
    <RacButton className={`cal-item is-event${it.allDay ? ' is-allday' : ''}`} style={{ ['--sub' as string]: `var(--cal-${normalizeSubColor(it.color)})` } as CSSProperties} onPress={() => onItem(it)} aria-label={`${time ? `${time} ` : ''}${it.title || tr('无标题')}`}>
      {time && <span className="cal-item-time">{time}</span>}
      <span className="cal-item-text">{it.title || tr('无标题')}</span>
    </RacButton>
  );
}

function AddInline({ date, onCreate, onDone }: { date: DateKey; onCreate: (d: DateKey, text: string) => void; onDone: () => void }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    onCreate(date, draft);
    setDraft('');
    onDone();
  };
  return (
    <Form
      className="add-bar inline cal-add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextField aria-label={tr('添加到{formatDateZh}', { formatDateZh: formatDateRange(date, null) })} value={draft} onChange={(v) => setDraft(stripNewlines(v))} className="add-bar-field" autoFocus onBlur={submit}>
        <WrapInput value={draft} placeholder={tr('写下一件事，按回车添加')} onSubmit={submit} />
      </TextField>
    </Form>
  );
}

/**
 * 宽屏周、多日、多周、月（Rei 2026-11-11 01:10）：每格列出当天全部条目，没有「还有 N 件」，行按内容撑高。
 * 排道分档：倒数日 → 任务 → 订阅事件，每天从上往下都是这个顺序；多天的任务、事件照旧画成跨格横条。
 * 给了 countItems（月视图）时，日期旁写「任务 + 打卡 + 倒数日」的个数，点了看那天的列表。
 */
function GridView(p: { view: CalView; rows: DateKey[][]; weekStart: 0 | 1; coreFrom: DateKey; coreTo: DateKey; today: DateKey; items: Item[]; countItems?: Item[]; lunar: Lunar; onItem: (it: Item) => void; onDay: (d: DateKey) => void; onCreate: (d: DateKey, text: string) => void }) {
  const [adding, setAdding] = useState<DateKey | null>(null);
  const cols = p.rows[0]?.length ?? 7;
  const tall = p.view.kind === 'week' || p.view.kind === 'days';
  const month = p.view.kind === 'month';
  const showDow = cols === 7 || tall;
  // 同一档里的先后：事件全天在前、再按时间（任务的先后 layoutRow 自己按开始日和长短排）
  const ordered = useMemo(() => sortDayItems('', p.items), [p.items]);
  return (
    <div className={`cal-grid${tall ? ' is-tall' : ''}${month ? ' is-month' : ''}`} style={{ ['--cols' as string]: cols } as CSSProperties} role="grid" aria-label={tr('日历')}>
      {showDow && (
        <div className="cal-dow" role="row">
          {(p.rows[0] ?? []).map((d) => (
            <div key={d} role="columnheader" className="cal-dow-cell">
              {weekdayLabel(weekday(d), 'short')}
            </div>
          ))}
        </div>
      )}
      {p.rows.map((row) => {
        const { placed } = layoutRow(row, ordered, (x) => calItemTier(x.role));
        const lanes = placed.reduce((m, x) => Math.max(m, x.lane + 1), 0);
        return (
          <div key={row[0]} className="cal-row" role="row" style={{ gridTemplateRows: `auto repeat(${lanes}, auto) auto 1fr`, ['--lanes' as string]: lanes } as CSSProperties}>
            {row.map((d, c) => (
              <div key={`bg-${d}`} className={`cal-cell-bg${d === p.today ? ' is-today' : ''}`} style={{ gridColumn: c + 1, gridRow: '1 / -1' }} data-drop-date={d} aria-hidden />
            ))}
            {row.map((d, c) => {
              const count = p.countItems ? dayCount(d, p.countItems) : 0;
              return (
                <div key={d} role="gridcell" className="cal-cell" style={{ gridColumn: c + 1, gridRow: 1 }} data-date={d}>
                  <DayHead date={d} today={p.today} lunar={p.lunar} inCore={compareDateKey(d, p.coreFrom) >= 0 && compareDateKey(d, p.coreTo) <= 0}>
                    <RacButton className="cal-cell-add" aria-label={tr('添加到{formatDateZh}', { formatDateZh: formatDateRange(d, null) })} onPress={() => setAdding(d)}>
                      <Plus size={14} />
                    </RacButton>
                    {count > 0 && (
                      <RacButton className="cal-cell-count" aria-label={`${formatDateRange(d, null)} · ${tr('{n} 件任务、打卡和倒数日', { n: count })}`} onPress={() => p.onDay(d)}>
                        {count}
                      </RacButton>
                    )}
                  </DayHead>
                </div>
              );
            })}
            {placed.map((x) => (
              <div
                key={x.item.id}
                className={`cal-slot${x.contLeft ? ' cont-left' : ''}${x.contRight ? ' cont-right' : ''}${x.span > 1 ? ' is-span' : ''}`}
                style={{ gridColumn: `${x.col + 1} / span ${x.span}`, gridRow: x.lane + 2 }}
              >
                <ItemButton it={x.item} onItem={p.onItem} />
              </div>
            ))}
            {adding && row.includes(adding) && (
              <div className="cal-add-slot" style={{ gridColumn: row.indexOf(adding) + 1, gridRow: lanes + 2 }}>
                <AddInline date={adding} onCreate={p.onCreate} onDone={() => setAdding(null)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniMonth(p: { rows: DateKey[][]; weekStart: 0 | 1; coreFrom: DateKey; coreTo: DateKey; today: DateKey; picked: DateKey; items: Item[]; lunar: Lunar; onPick: (d: DateKey) => void }) {
  return (
    <div className="cal-mini" role="grid" aria-label={tr('日历')}>
      <div className="cal-mini-row cal-dow" role="row">
        {(p.rows[0] ?? []).map((d) => (
          <div key={d} role="columnheader" className="cal-dow-cell">
            {weekdayLabel(weekday(d), 'narrow')}
          </div>
        ))}
      </div>
      {p.rows.map((row) => (
        <div key={row[0]} className="cal-mini-row" role="row">
          {row.map((d) => {
            const count = dayCount(d, p.items);
            const ev = count ? null : itemsOnDay(d, p.items).find((it): it is EventItem => it.kind === 'event');
            const inCore = compareDateKey(d, p.coreFrom) >= 0 && compareDateKey(d, p.coreTo) <= 0;
            const info = p.lunar.any ? p.lunar.day(d) : null;
            return (
              <RacButton
                key={d}
                className={`cal-mini-cell${d === p.today ? ' is-today' : ''}${d === p.picked ? ' is-picked' : ''}${inCore ? '' : ' is-outside'}`}
                data-drop-date={d}
                onPress={() => p.onPick(d)}
                aria-label={count ? `${formatDateRange(d, null)} · ${tr('{n} 件任务、打卡和倒数日', { n: count })}` : formatDateRange(d, null)}
                aria-pressed={d === p.picked}
              >
                <span className="cal-mini-num">{parseDateKey(d).d}</span>
                {info && <span className="cal-mini-lunar"><LunarMark info={info} /></span>}
                {/* 同宽屏月视图：数任务 + 打卡 + 倒数日；只有订阅事件的画一个彩色点 */}
                <span className="cal-mini-count" aria-hidden>
                  {count > 0 ? count : ev ? <i style={{ ['--sub' as string]: `var(--cal-${normalizeSubColor(ev.color)})` } as CSSProperties} /> : null}
                </span>
              </RacButton>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DayList(p: { date: DateKey; today: DateKey; items: Item[]; lunar: Lunar; onItem: (it: Item) => void; onCreate: (d: DateKey, text: string) => void; bare?: boolean }) {
  const [adding, setAdding] = useState(false);
  const info = p.lunar.any ? p.lunar.day(p.date) : null;
  // 倒数日 → 任务 → 订阅事件（全天在前，再按时间）（Rei 2026-11-11 01:10）；打卡不进列表
  const sorted = sortDayItems(p.date, p.items);
  return (
    <section className={`cal-day-list${p.date === p.today ? ' is-today' : ''}`} aria-label={formatDateRange(p.date, null)} data-drop-date={p.bare ? undefined : p.date}>
      {!p.bare && (
        <h3 className="cal-day-list-head">
          <span>{formatDateRange(p.date, null, p.today)}</span>
          <span className="cal-day-list-dow">{weekdayLabel(weekday(p.date), 'short')}</span>
          {info && <span className="cal-day-lunar"><LunarMark info={info} /></span>}
        </h3>
      )}
      <div className="cal-day-items">
        {sorted.map((it) => (
          <ItemButton key={it.id} it={it} onItem={p.onItem} />
        ))}
        {!sorted.length && !adding && <div className="cal-empty">{tr('这天没有安排')}</div>}
        {adding ? (
          <AddInline date={p.date} onCreate={p.onCreate} onDone={() => setAdding(false)} />
        ) : (
          <RacButton className="cal-day-add" onPress={() => setAdding(true)}>
            <Plus size={14} /> {tr('添加')}
          </RacButton>
        )}
      </div>
    </section>
  );
}

function YearView(p: { year: number; weekStart: 0 | 1; today: DateKey; items: Item[]; lunar: Lunar; mobile: boolean; onPick: (d: DateKey) => void }) {
  const months = yearMonths(p.year, p.weekStart);
  const busy = useMemo(() => {
    const s = new Set<DateKey>();
    for (const it of p.items) for (let d = it.start; compareDateKey(d, it.end) <= 0 && s.size < 5000; d = nextDay(d)) s.add(d);
    return s;
  }, [p.items]);
  const dows = months[0]!.cells.slice(0, 7).map((_, i) => (p.weekStart + i) % 7);
  return (
    <div className="cal-year">
      {months.map(({ month, cells }) => (
        <div key={month} className="cal-year-month">
          <div className="cal-year-title">{new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', month: 'long' }).format(new Date(Date.UTC(p.year, month - 1, 1)))}</div>
          <div className="cal-year-grid">
            {dows.map((d) => (
              <span key={`h${d}`} className="cal-year-dow">
                {weekdayLabel(d, 'narrow')}
              </span>
            ))}
            {cells.map((d, i) =>
              d ? (
                <RacButton
                  key={d}
                  className={`cal-year-day${d === p.today ? ' is-today' : ''}${busy.has(d) ? ' has-items' : ''}${p.lunar.holidays && p.lunar.day(d).sub?.badge ? ` is-${p.lunar.day(d).sub!.badge}` : ''}`}
                  onPress={() => p.onPick(d)}
                  aria-label={formatDateRange(d, null)}
                >
                  {parseDateKey(d).d}
                </RacButton>
              ) : (
                <span key={`e${i}`} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const nextDay = (d: DateKey) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

function EventSheet({ event, onClose }: { event: CalEvent | null; onClose: () => void }) {
  const today = toDateKey(new Date());
  let when = '';
  if (event) {
    if (event.allDay) when = `${formatDateRange(event.startDate, event.endDate === event.startDate ? null : event.endDate, today)} · ${tr('全天')}`;
    else if (event.startMs != null) {
      const f = new Intl.DateTimeFormat(intlLocale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
      const t = timeFmt();
      const s = new Date(event.startMs);
      const e = new Date(event.endMs ?? event.startMs);
      when = event.endDate === event.startDate ? `${f.format(s)} – ${t.format(e)}` : `${f.format(s)} – ${f.format(e)}`;
    }
  }
  return (
    <Sheet isOpen={!!event} onOpenChange={(v) => !v && onClose()} title={event?.title || tr('无标题')} className="cal-event-sheet">
      {event && (
        <div className="cal-event" style={{ ['--sub' as string]: `var(--cal-${normalizeSubColor(event.color)})` } as CSSProperties}>
          <div className="cal-event-when">{when}</div>
          {event.location && (
            <div className="cal-event-loc">
              <MapPin size={14} aria-hidden /> {event.location}
            </div>
          )}
          {event.description && <div className="cal-event-desc">{event.description}</div>}
          <div className="cal-event-from">
            <span className="cal-sub-swatch" aria-hidden /> {tr('来自订阅「{name}」，只能看，不能改。', { name: event.subName })}
          </div>
        </div>
      )}
    </Sheet>
  );
}
