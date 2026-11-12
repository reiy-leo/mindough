/**
 * 日期面板的月历（Rei 2026-11-01 方案 A）：公历月和农历月共用这一张格子，自己画（react-aria 的 Calendar 不支持农历月）。
 * - 排格子、翻页、点格子的规则都在 core date-grid.ts，这里只管画、键盘、指针。
 * - role="grid"：方向键换天，PageUp / PageDown 换月（农历页换农历月），加 Shift 换年，Home / End 到这周头尾，Enter / 空格选中，Shift+Enter 设成结束日。
 * - 桌面鼠标：按住拖过几天 = 一段；Shift 点 = 和开始日连成一段。手机只走「+ 结束日」。
 * - 标题行右边 ‹ ○ ›（Rei 2026-11-13 参照滴答清单）：○ =「回到今天」，翻回今天那个月，焦点落在今天，不改已选的日子。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import { Button as RacButton } from 'react-aria-components';
import {
  addDays,
  canStep,
  dragRange,
  gridRows,
  intlLocale,
  lunarDayName,
  lunarMonthTitle,
  monthCells,
  parseDateKey,
  rangeCellRole,
  shiftFocus,
  solarDayShort,
  solarToLunar,
  stepView,
  viewContains,
  viewOf,
  weekday,
  weekdayLabel,
  type DateKey,
  type MonthView,
} from '@mindough/core';
import { tr } from '../../lib/i18n';
import { TipButton } from '../../ui/primitives';
import type { DayLunar } from '../../lib/lunar';

/** 悬停用的完整说法：「农历九月十四 · 霜降 · 国庆节（休）」。 */
export function lunarTitle(info: DayLunar): string | undefined {
  const parts = info.label?.full ? [info.label.full] : [];
  for (const t of info.sub?.titles ?? []) if (!parts.join(' · ').includes(t)) parts.push(t);
  return parts.join(' · ') || undefined;
}

/** 格子下的农历小字 + 放假 / 补班角标（Rei 2026-10-17）。 */
export function LunarMark({ info }: { info: DayLunar }) {
  const { label, sub } = info;
  return (
    <>
      {label && <span className={`lunar-text is-${label.kind}`}>{label.text}</span>}
      {sub?.badge && <span className={`lunar-badge is-${sub.badge}`}>{sub.badge === 'off' ? tr('休') : tr('班')}</span>}
    </>
  );
}

/** 「10月29日星期四」/「Thursday, October 29」（读屏用）。 */
function longDate(d: DateKey): string {
  const { y, m, d: day } = parseDateKey(d);
  return new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long', ...(y !== new Date().getFullYear() ? { year: 'numeric' as const } : {}) }).format(new Date(Date.UTC(y, m - 1, day)));
}

function solarTitle(v: Extract<MonthView, { kind: 'solar' }>): string {
  return new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', year: 'numeric', month: 'long' }).format(new Date(Date.UTC(v.year, v.month - 1, 1)));
}

export interface DateGridProps {
  view: MonthView;
  onViewChange: (v: MonthView) => void;
  /** 键盘焦点在哪天（roving tabindex）。 */
  focus: DateKey;
  onFocusChange: (d: DateKey) => void;
  start: DateKey | null;
  end: DateKey | null;
  /** 等结束日时：悬停那天预览成一段。 */
  waitingEnd: boolean;
  today: DateKey;
  weekStart: 0 | 1;
  /** 农历界面显示（格子下农历小字）。 */
  lunar: { show: boolean; any: boolean; day: (d: DateKey) => DayLunar };
  /** 农历开关：顶上「农历」按钮（只在 lunar.show 时出现）。 */
  lunarOn: boolean;
  onLunarToggle?: () => void;
  /** 能不能选日期段（拖选 / Shift 点）。 */
  canRange: boolean;
  /** 桌面才拖选。 */
  allowDrag: boolean;
  onPick: (d: DateKey, opts: { shift: boolean }) => void;
  onDrag: (start: DateKey, end: DateKey | null) => void;
  autoFocus?: boolean;
}

export function DateGrid(p: DateGridProps) {
  const { view, focus, start, end, today, lunar } = p;
  const lunarPage = view.kind === 'lunar';
  const rows = useMemo(() => gridRows(monthCells(view, p.weekStart)), [view, p.weekStart]);
  const gridRef = useRef<HTMLTableElement>(null);
  const [hover, setHover] = useState<DateKey | null>(null);
  // 拖选：按下那天、拖到哪天；拖过了就吞掉随后的 click
  const drag = useRef<{ from: DateKey; to: DateKey } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ start: DateKey; end: DateKey | null } | null>(null);
  const swallowClick = useRef(false);
  const keyFocus = useRef(false);

  // 焦点跟着 focus 走（键盘换天 / 翻页后）
  useLayoutEffect(() => {
    if (!keyFocus.current) return;
    keyFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus();
  }, [focus, view]);
  useEffect(() => {
    if (p.autoFocus) gridRef.current?.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus({ preventScroll: true });
    // 只在打开时
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!dragPreview) return;
    const up = () => {
      const d = drag.current;
      drag.current = null;
      setDragPreview(null);
      if (d && d.from !== d.to) {
        swallowClick.current = true;
        const r = dragRange(d.from, d.to);
        p.onDrag(r.start, r.end);
      }
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragPreview, p]);

  const moveFocus = (d: DateKey, nextView?: MonthView) => {
    keyFocus.current = true;
    if (nextView) p.onViewChange(nextView);
    else if (!viewContains(view, d)) p.onViewChange(viewOf(d, view.kind));
    p.onFocusChange(d);
  };
  const page = (n: number, unit: 'month' | 'year') => {
    const r = shiftFocus(focus, view, n, unit);
    if (r) moveFocus(r.date, r.view);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    const ws = p.weekStart;
    const dow = (weekday(focus) - ws + 7) % 7;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -dow, End: 6 - dow };
    if (k in step) {
      e.preventDefault();
      moveFocus(addDays(focus, step[k]!));
    } else if (k === 'PageUp' || k === 'PageDown') {
      e.preventDefault();
      page(k === 'PageUp' ? -1 : 1, e.shiftKey ? 'year' : 'month');
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      p.onPick(focus, { shift: e.shiftKey && p.canRange });
    }
  };

  // 高亮：拖选中 > 等结束时悬停预览 > 已选
  const shown = dragPreview ?? (p.waitingEnd && start && hover && hover !== start ? dragRange(start, hover) : { start, end });
  const title = lunarPage ? lunarMonthTitle(view.year, view.month, view.leap) : null;
  const heading = title ? `${title.month} ${title.year}` : solarTitle(view as Extract<MonthView, { kind: 'solar' }>);
  const headDays = Array.from({ length: 7 }, (_, i) => (i + p.weekStart) % 7);

  return (
    <div className={`date-grid${lunarPage ? ' is-lunar-page' : ''}`}>
      <header className="calendar-head">
        <h3 className="calendar-title" aria-live="polite">
          {title ? (
            <>
              {title.month}
              <span className="calendar-title-sub">{title.year}</span>
            </>
          ) : (
            heading
          )}
        </h3>
        {lunar.show && p.onLunarToggle && (
          <RacButton className={`lunar-toggle${p.lunarOn ? ' is-on' : ''}`} aria-pressed={p.lunarOn} aria-label={tr('按农历看月历')} onPress={p.onLunarToggle}>
            {tr('农历')}
          </RacButton>
        )}
        <RacButton className="icon-btn" aria-label={tr('上个月')} isDisabled={!canStep(view, -1)} onPress={() => p.onViewChange(stepView(view, -1)!)}>
          <ChevronLeft size={16} />
        </RacButton>
        <TipButton tip={tr('回到今天')} className="icon-btn calendar-today-btn" onPress={() => moveFocus(today, viewOf(today, view.kind))}>
          <Circle size={11} strokeWidth={2.25} aria-hidden />
        </TipButton>
        <RacButton className="icon-btn" aria-label={tr('下个月')} isDisabled={!canStep(view, 1)} onPress={() => p.onViewChange(stepView(view, 1)!)}>
          <ChevronRight size={16} />
        </RacButton>
      </header>
      <table ref={gridRef} className="calendar-grid" role="grid" aria-label={heading} onKeyDown={onKeyDown} onPointerLeave={() => setHover(null)}>
        <thead>
          <tr>
            {headDays.map((d) => (
              <th key={d} className="calendar-dow" scope="col" abbr={weekdayLabel(d, 'long')}>
                {weekdayLabel(d, 'narrow')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map(({ date, inMonth }) => {
                const info = lunar.any ? lunar.day(date) : null;
                const role = rangeCellRole(shown, date);
                const ranged = !!shown.end;
                const selected = role === 'single' || role === 'start' || role === 'end';
                const { m, d } = parseDateKey(date);
                const extra = info ? [info.label?.full, ...(info.sub?.titles ?? []).filter((t) => !info.label?.full.includes(t))].filter(Boolean).join(' · ') : '';
                const label = [longDate(date), extra, date === today ? tr('今天') : '', selected ? tr('已选') : role === 'middle' ? tr('在日期段里') : ''].filter(Boolean).join(tr('，')); // 读屏的分隔：中文「，」，英文「, 」
                // 农历页：大字农历日子，小字公历（1 号写「11月」）；节日节气照样标在小字上
                let big: string | number = d;
                let small: ReactNode = info ? <LunarMark info={info} /> : null;
                if (lunarPage) {
                  const l = solarToLunar(date);
                  big = l ? lunarDayName(l.day) : d;
                  const special = info?.label && info.label.kind !== 'day' && info.label.kind !== 'month' ? info.label : null;
                  small = (
                    <>
                      {special ? <span className={`lunar-text is-${special.kind}`}>{special.text}</span> : <span className="lunar-text is-solar">{solarDayShort(m, d)}</span>}
                      {info?.sub?.badge && <span className={`lunar-badge is-${info.sub.badge}`}>{info.sub.badge === 'off' ? tr('休') : tr('班')}</span>}
                    </>
                  );
                }
                const tdClass = ['calendar-td', role && ranged ? `in-range is-range-${role}` : '', inMonth ? '' : 'is-outside'].filter(Boolean).join(' ');
                return (
                  <td key={date} role="gridcell" className={tdClass} aria-selected={selected || role === 'middle'}>
                    <div
                      role="button"
                      tabIndex={date === focus ? 0 : -1}
                      data-date={date}
                      aria-label={label}
                      {...(info ? { title: lunarTitle(info) } : {})}
                      className={[
                        'calendar-cell',
                        date === today ? 'is-today' : '',
                        selected ? 'is-selected' : '',
                        role === 'middle' ? 'is-range-middle' : '',
                        inMonth ? '' : 'is-outside',
                        p.waitingEnd && hover === date ? 'is-hover-end' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onFocus={() => date !== focus && p.onFocusChange(date)}
                      onPointerEnter={(e: PointerEvent) => {
                        if (e.pointerType === 'mouse') setHover(date);
                        if (drag.current && date !== drag.current.to) {
                          drag.current.to = date;
                          setDragPreview(dragRange(drag.current.from, date));
                        }
                      }}
                      onPointerDown={(e: PointerEvent) => {
                        if (!p.canRange || !p.allowDrag || e.pointerType !== 'mouse' || e.button !== 0 || e.shiftKey) return;
                        drag.current = { from: date, to: date };
                        setDragPreview({ start: date, end: null });
                      }}
                      onClick={(e) => {
                        if (swallowClick.current) {
                          swallowClick.current = false;
                          return;
                        }
                        p.onPick(date, { shift: e.shiftKey && p.canRange });
                      }}
                    >
                      {info || lunarPage ? (
                        <>
                          <span className="calendar-num">{big}</span>
                          {small}
                        </>
                      ) : (
                        big
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
