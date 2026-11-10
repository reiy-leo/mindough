/**
 * 日历（Rei 2026-11-10「侧边栏时间轴换成"日历"」，方案 docs/CALENDAR.md）：路由仍是 agenda（#/calendar，旧 #/agenda 也行）。
 * - 视图下拉：周、月、年、多日（2–14 天）、多周（1–6 周）；每台设备记住上次的视图和参数（settings.calendarView）。
 * - 任务：有日期、没结束、不重复的，按日期 / 日期段画进格子（core layoutRow 排道），只写标题；宽屏点开是居中浮层（lib/detail-pane），手机整页。
 * - 订阅事件（lib/calendar-subs）：带订阅颜色的竖线、只读，点开看详情（EventSheet）。
 * - 节假日 / 农历：日期旁的小字和「休」「班」都走 useLunar（同日期面板的 LunarMark）。
 * - 新建：格子右上角「+」→ 格子里输入，回车建那天的任务。拖动改日期没做（待 Rei 确认）。
 * - 手机：月视图上面是小月历（只画点），下面是选中那天的列表；周、多日、多周按天竖排；年视图一列两个月。
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Form, TextField, Button as RacButton } from 'react-aria-components';
import { Calendar, ChevronLeft, ChevronRight, Plus, MapPin } from 'lucide-react';
import {
  CAL_VIEW_KINDS,
  DAYS_MAX,
  DAYS_MIN,
  WEEKS_MAX,
  WEEKS_MIN,
  calRange,
  compareDateKey,
  formatDateRange,
  isFinished,
  itemsOnDay,
  layoutRow,
  normalizeCalView,
  normalizeSubColor,
  parseDateKey,
  plainTitleMarkdown,
  stepCalAnchor,
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
import { useUi } from '../lib/ui';
import { titleOf } from '../lib/view';
import { intlLocale, tr, trc } from '../lib/i18n';
import '../styles/calendar.css';

interface TaskItem {
  kind: 'task';
  id: string;
  start: DateKey;
  end: DateKey;
  task: Task;
}
interface EventItem extends CalEvent {
  kind: 'event';
}
type Item = TaskItem | EventItem;

const VIEW_LABEL: Record<CalViewKind, () => string> = {
  week: () => trc('日历视图', '周'),
  month: () => trc('日历视图', '月'),
  year: () => trc('日历视图', '年'),
  days: () => trc('日历视图', '多日'),
  weeks: () => trc('日历视图', '多周'),
};

/** 每格最多几道（多了显示「还有 N 件」）。 */
const MAX_LANES: Record<CalViewKind, number> = { week: 12, days: 12, weeks: 4, month: 3, year: 0 };

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

  // 同时间轴（Rei 2026-11-10）：完成、关闭的不列；重复的（打卡）不上日历；归档项目里的不列（activeTasks 已排除）
  const tasks = store.activeTasks().filter((t) => t.scheduled_date && !t.recurrence && !isFinished(t.status));
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const t of tasks) out.push({ kind: 'task', id: t.id, start: t.scheduled_date!, end: taskEndDate(t) ?? t.scheduled_date!, task: t });
    for (const e of events) out.push({ ...e, kind: 'event' });
    return out.filter((it) => compareDateKey(it.end, range.from) >= 0 && compareDateKey(it.start, range.to) <= 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.version, events, range.from, range.to]);

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
        <MiniMonth rows={range.rows} weekStart={weekStart} coreFrom={range.coreFrom} coreTo={range.coreTo} today={today} picked={picked} items={items} lunar={lunar} onPick={setPicked} />
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
  } else {
    body = (
      <GridView view={view} rows={range.rows} weekStart={weekStart} coreFrom={range.coreFrom} coreTo={range.coreTo} today={today} items={items} lunar={lunar} onItem={onItem} onMore={setDayOpen} onCreate={create} />
    );
  }

  return (
    <div className={`page cal-page is-${view.kind}${mobile ? ' is-mobile' : ''}`}>
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

function ItemButton({ it, onItem, compact }: { it: Item; onItem: (it: Item) => void; compact?: boolean }) {
  const store = useStore();
  const ui = useUi();
  if (it.kind === 'task') {
    const title = titleOf(store, it.task) || tr('无标题');
    return (
      <RacButton className={`cal-item is-task${ui.editingId === it.id ? ' is-selected' : ''}`} data-task-id={it.id} onPress={() => ui.openEditor(it.id)} aria-label={title}>
        <span className="cal-item-dot" aria-hidden />
        <span className="cal-item-text">{title}</span>
      </RacButton>
    );
  }
  const time = !it.allDay && it.startMs != null ? timeFmt().format(new Date(it.startMs)) : '';
  return (
    <RacButton className={`cal-item is-event${it.allDay ? ' is-allday' : ''}`} style={{ ['--sub' as string]: `var(--cal-${normalizeSubColor(it.color)})` } as CSSProperties} onPress={() => onItem(it)} aria-label={`${time ? `${time} ` : ''}${it.title || tr('无标题')}`}>
      {!compact && time && <span className="cal-item-time">{time}</span>}
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

function GridView(p: { view: CalView; rows: DateKey[][]; weekStart: 0 | 1; coreFrom: DateKey; coreTo: DateKey; today: DateKey; items: Item[]; lunar: Lunar; onItem: (it: Item) => void; onMore: (d: DateKey) => void; onCreate: (d: DateKey, text: string) => void }) {
  const [adding, setAdding] = useState<DateKey | null>(null);
  const cols = p.rows[0]?.length ?? 7;
  const maxLanes = MAX_LANES[p.view.kind];
  const tall = p.view.kind === 'week' || p.view.kind === 'days';
  const showDow = cols === 7 || tall;
  return (
    <div className={`cal-grid${tall ? ' is-tall' : ''}`} style={{ ['--cols' as string]: cols } as CSSProperties} role="grid" aria-label={tr('日历')}>
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
        const { placed, perDay } = layoutRow(row, p.items);
        const shown = placed.filter((x) => x.lane < maxLanes);
        const lanes = shown.reduce((m, x) => Math.max(m, x.lane + 1), 0);
        const shownPerDay = row.map((_, c) => shown.filter((x) => c >= x.col && c < x.col + x.span).length);
        return (
          <div key={row[0]} className="cal-row" role="row" style={{ gridTemplateRows: `auto repeat(${maxLanes + 2}, auto)`, ['--lanes' as string]: lanes } as CSSProperties}>
            {row.map((d, c) => (
              <div key={`bg-${d}`} className={`cal-cell-bg${d === p.today ? ' is-today' : ''}`} style={{ gridColumn: c + 1, gridRow: '1 / -1' }} aria-hidden />
            ))}
            {row.map((d, c) => (
              <div key={d} role="gridcell" className="cal-cell" style={{ gridColumn: c + 1, gridRow: 1 }} data-date={d}>
                <DayHead date={d} today={p.today} lunar={p.lunar} inCore={compareDateKey(d, p.coreFrom) >= 0 && compareDateKey(d, p.coreTo) <= 0}>
                  <RacButton className="cal-cell-add" aria-label={tr('添加到{formatDateZh}', { formatDateZh: formatDateRange(d, null) })} onPress={() => setAdding(d)}>
                    <Plus size={14} />
                  </RacButton>
                </DayHead>
              </div>
            ))}
            {shown.map((x) => (
              <div
                key={x.item.id}
                className={`cal-slot${x.contLeft ? ' cont-left' : ''}${x.contRight ? ' cont-right' : ''}${x.span > 1 ? ' is-span' : ''}`}
                style={{ gridColumn: `${x.col + 1} / span ${x.span}`, gridRow: x.lane + 2 }}
              >
                <ItemButton it={x.item as Item} onItem={p.onItem} />
              </div>
            ))}
            {row.map((d, c) =>
              perDay[c]! > shownPerDay[c]! ? (
                <div key={`more-${d}`} className="cal-more-slot" style={{ gridColumn: c + 1, gridRow: maxLanes + 2 }}>
                  <RacButton className="cal-more" onPress={() => p.onMore(d)}>
                    {tr('还有 {n} 件', { n: perDay[c]! - shownPerDay[c]! })}
                  </RacButton>
                </div>
              ) : null,
            )}
            {adding && row.includes(adding) && (
              <div className="cal-add-slot" style={{ gridColumn: row.indexOf(adding) + 1, gridRow: maxLanes + 3 }}>
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
            const n = itemsOnDay(d, p.items);
            const inCore = compareDateKey(d, p.coreFrom) >= 0 && compareDateKey(d, p.coreTo) <= 0;
            const info = p.lunar.any ? p.lunar.day(d) : null;
            return (
              <RacButton
                key={d}
                className={`cal-mini-cell${d === p.today ? ' is-today' : ''}${d === p.picked ? ' is-picked' : ''}${inCore ? '' : ' is-outside'}`}
                onPress={() => p.onPick(d)}
                aria-label={formatDateRange(d, null)}
                aria-pressed={d === p.picked}
              >
                <span className="cal-mini-num">{parseDateKey(d).d}</span>
                {info && <span className="cal-mini-lunar"><LunarMark info={info} /></span>}
                <span className="cal-mini-dots" aria-hidden>
                  {n.slice(0, 3).map((it) => (
                    <i key={it.id} className={it.kind === 'event' ? 'is-event' : 'is-task'} style={it.kind === 'event' ? ({ ['--sub' as string]: `var(--cal-${normalizeSubColor(it.color)})` } as CSSProperties) : undefined} />
                  ))}
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
  const sorted = [...p.items].sort((a, b) => {
    const ta = a.kind === 'event' ? (a.allDay ? 0 : 1) : 2;
    const tb = b.kind === 'event' ? (b.allDay ? 0 : 1) : 2;
    return ta - tb || (a.kind === 'event' && b.kind === 'event' ? (a.startMs ?? 0) - (b.startMs ?? 0) : 0);
  });
  return (
    <section className={`cal-day-list${p.date === p.today ? ' is-today' : ''}`} aria-label={formatDateRange(p.date, null)}>
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
          <RacButton className="agenda-add" onPress={() => setAdding(true)}>
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
