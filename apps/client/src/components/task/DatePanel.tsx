import { useState } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { ArrowRight, CalendarArrowUp, Plus, Sofa, Sun, Sunrise, X, type LucideIcon } from 'lucide-react';
import {
  clickDay,
  formatDate,
  lunarMonthDayName,
  quickDates,
  rangeLength,
  shiftRangeTo,
  solarToLunar,
  todayIn,
  viewOf,
  weekStartsOn,
  type DateKey,
  type MonthView,
  type QuickDateKind,
} from '@mindough/core';
import { TipButton } from '../../ui/primitives';
import { LUNAR_PICK_KEY, useLunar } from '../../lib/lunar';
import { useSettings } from '../../lib/settings';
import { useStore } from '../../store/StoreProvider';
import { TimeZoneRow } from './TimeZonePicker';
import { DateGrid } from './DateGrid';
import { tr } from '../../lib/i18n';

export { LunarMark, lunarTitle } from './DateGrid';

/** 快捷按钮的图标（Rei 2026-10-25：图标按钮 + hover 提示文字）。 */
const QUICK_ICON: Record<QuickDateKind, LucideIcon> = { today: Sun, tomorrow: Sunrise, weekend: Sofa, monday: CalendarArrowUp };

/**
 * 日期面板（Rei 2026-11-01 方案 A：一张月历，点一下就生效；docs/DATE-PICKER.md）。从上到下：
 * 1. 快捷图标按钮（今天 / 明天 / 本周末 / 下周一，悬停 / 长按显示文字）；
 * 2. 已选胶囊：单日「10月29日 周四 · 九月二十」+「+ 结束日」；日期段「10月29日 周四 → 11月8日 周日 ×」+「11 天」；
 * 3. 月历（DateGrid）：点一天就存；点过「+ 结束日」后点的那天是结束日；桌面还能拖选、Shift 点；
 *    农历界面显示时（useLunar().show）格子下有农历小字，标题右边「农历」开关把月历换成按农历月翻页（记在本机 LUNAR_PICK_KEY）；
 * 4. 时区、不设日期（同一行，时区展开时「不设日期」换到下一行）。
 * 2026-11-13 收紧（Rei「参考图二，让date的popup更紧凑一点」，docs/DATE-PICKER.md「紧凑版」）：快捷按钮无边框、格子行距收小、标题行加「回到今天」。
 * 存法不变：按农历选的也存公历；每年按农历重复在「重复」里。
 */
export function DatePanel({
  value,
  today,
  onChange,
  clearLabel = tr('不设日期'),
  quick = true,
  timeZone,
  onTimeZoneChange,
  end = null,
  onRangeChange,
}: {
  value: DateKey | null;
  today: DateKey;
  onChange: (d: DateKey | null) => void;
  clearLabel?: string | null;
  quick?: boolean;
  /** 任务时区（空 = 跟着设备）。给了 onTimeZoneChange 才显示「时区」一行（Rei 2026-10-25）。 */
  timeZone?: string | null;
  onTimeZoneChange?: (tz: string) => void;
  /** 日期段的结束日（空 = 单日）。 */
  end?: DateKey | null;
  /**
   * 给了才能选日期段（Rei 2026-10-26）：出现「+ 结束日」，桌面能拖选、Shift 点。
   * done = 选完了（点了一天、拖完、点了快捷项），弹层可以关；去掉结束日时 done = false，面板留着。
   */
  onRangeChange?: (start: DateKey | null, end: DateKey | null, done: boolean) => void;
}) {
  const store = useStore();
  const { layout } = useSettings();
  // 快捷「今天 / 明天…」和月历上的「今天」按所选时区的今天算
  const zoneToday = timeZone ? todayIn(timeZone, store.now()) : today;
  const lunar = useLunar(store);
  const canRange = !!onRangeChange;
  const ranged = canRange && !!value && !!end && end > value;
  const [lunarPick, setLunarPick] = useState(() => localStorage.getItem(LUNAR_PICK_KEY) === 'lunar');
  const lunarOn = lunar.show && lunarPick;
  const [focus, setFocus] = useState<DateKey>(() => value ?? zoneToday);
  const [view, setView] = useState<MonthView>(() => viewOf(value ?? zoneToday, lunarOn ? 'lunar' : 'solar'));
  const [waitingEnd, setWaitingEnd] = useState(false);
  const [said, setSaid] = useState('');

  const jumpTo = (d: DateKey, kind = view.kind) => {
    setFocus(d);
    setView(viewOf(d, kind));
  };
  const toggleLunar = () => {
    const next = !lunarOn;
    setLunarPick(next);
    localStorage.setItem(LUNAR_PICK_KEY, next ? 'lunar' : 'solar');
    setView(viewOf(focus, next ? 'lunar' : 'solar'));
  };

  const announce = (start: DateKey | null, e: DateKey | null) => {
    if (!start) return setSaid('');
    setSaid(e && e > start ? tr('日期段 {start} 到 {end}，{n} 天', { start: chipDate(start, zoneToday), end: chipDate(e, zoneToday), n: rangeLength(start, e) }) : tr('日期设为 {date}', { date: chipDate(start, zoneToday) }));
  };
  const commit = (start: DateKey | null, e: DateKey | null, done: boolean) => {
    setWaitingEnd(false);
    announce(start, e);
    if (canRange) onRangeChange!(start, e, done);
    else onChange(start);
  };
  const pick = (d: DateKey, opts: { shift: boolean }) => {
    setFocus(d);
    const r = clickDay({ start: value, end, waitingEnd }, d, { canRange, shift: opts.shift });
    commit(r.start, r.end, r.done);
  };
  const pickQuick = (d: DateKey) => {
    jumpTo(d);
    // 日期段里点快捷项：开始挪到那天，天数不变
    const r = ranged ? shiftRangeTo({ start: value, end }, d) : { start: d, end: null };
    commit(r.start, r.end, true);
  };
  const quickSelected = (d: DateKey) => value === d && !ranged;
  const lunarOf = (d: DateKey) => {
    const l = lunar.show ? solarToLunar(d) : null;
    return l ? lunarMonthDayName(l.month, l.day, l.leap) : null;
  };
  const mobile = layout === 'mobile';

  return (
    <div className={`date-panel${lunar.any ? ' has-lunar' : ''}${ranged ? ' is-range' : ''}`}>
      {quick && (
        <div className="date-quick">
          {quickDates(zoneToday).map((q) => {
            const Icon = QUICK_ICON[q.kind];
            const on = quickSelected(q.date);
            return (
              <TipButton key={q.kind} tip={q.label} isPressed={on} className={`date-quick-item${on ? ' is-selected' : ''}`} onPress={() => pickQuick(q.date)}>
                <Icon size={18} aria-hidden />
              </TipButton>
            );
          })}
        </div>
      )}
      {value && (
        <div className="date-chips" role="group" aria-label={tr('已选的日期')}>
          <RacButton className="date-chip is-start" onPress={() => jumpTo(value)}>
            <span className="date-chip-text">{chipDate(value, zoneToday)}</span>
            {!ranged && !waitingEnd && lunarOf(value) && <span className="date-chip-lunar">{lunarOf(value)}</span>}
          </RacButton>
          {(ranged || waitingEnd) && <ArrowRight size={14} className="date-chip-arrow" aria-hidden />}
          {ranged ? (
            <>
              <span className="date-chip is-end">
                <RacButton className="date-chip-main" onPress={() => jumpTo(end!)}>
                  {chipDate(end!, zoneToday)}
                </RacButton>
                <RacButton className="date-chip-x" aria-label={tr('去掉结束日')} onPress={() => commit(value, null, false)}>
                  <X size={13} aria-hidden />
                </RacButton>
              </span>
              <span className="date-chip-days">{tr('{n} 天', { n: rangeLength(value, end) })}</span>
            </>
          ) : waitingEnd ? (
            <RacButton className="date-chip is-waiting" aria-pressed onPress={() => setWaitingEnd(false)}>
              {tr('选结束日')}
            </RacButton>
          ) : (
            canRange && (
              <RacButton className="date-chip is-add" aria-label={tr('加结束日，变成日期段')} onPress={() => setWaitingEnd(true)}>
                <Plus size={13} aria-hidden />
                {tr('结束日')}
              </RacButton>
            )
          )}
        </div>
      )}
      <DateGrid
        view={view}
        onViewChange={setView}
        focus={focus}
        onFocusChange={setFocus}
        start={value}
        end={ranged ? end : null}
        waitingEnd={waitingEnd}
        today={zoneToday}
        weekStart={weekStartsOn()}
        lunar={lunar}
        lunarOn={lunarOn}
        onLunarToggle={toggleLunar}
        canRange={canRange}
        allowDrag={!mobile}
        onPick={pick}
        onDrag={(s, e) => {
          setFocus(e ?? s);
          commit(s, e, true);
        }}
        autoFocus
      />
      {waitingEnd && <p className="date-hint">{mobile ? tr('点结束那天') : tr('点结束那天；按住 Shift 点，或从开始日拖过去也行')}</p>}
      {lunarOn && view.kind === 'lunar' && <p className="date-hint">{tr('大字农历、小字公历。存的还是公历日期；要每年按农历重复，去「重复」里选「每年农历」。')}</p>}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      {(onTimeZoneChange || (clearLabel && value)) && <div className="date-foot">
        {onTimeZoneChange && <TimeZoneRow value={timeZone ?? null} date={value ?? zoneToday} onChange={onTimeZoneChange} />}
        {clearLabel && value && (
          <RacButton className="date-clear" onPress={() => commit(null, null, true)}>
            {clearLabel}
          </RacButton>
        )}
      </div>}
    </div>
  );
}

/** 胶囊上的日期：「10月29日 周四」；不在今年时带年份。 */
function chipDate(d: DateKey, today: DateKey): string {
  return formatDate(d, { weekday: true, year: d.slice(0, 4) !== today.slice(0, 4) });
}

