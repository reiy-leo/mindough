/**
 * 心情河流（Rei 2026-11-05 定稿，docs/JOURNAL.md「2026-11-05：心情河流」）：日记左栏活动图下面，取代心情条形列表。
 * - 整块铺满剩下的高度，一行一天（最上面最近），颜色按附近几天各心情的条数混出来（core mood-river），不标刻度。
 * - 不规则软边、约 6 秒一次呼吸、色带缓慢漂移（lib/mood-river-paint）；系统开了「减少动态效果」就停在静止画面。
 * - 低分辨率画布 + CSS 放大，约 15 帧；页面看不见、区域滚出视口时不画。
 * - 右上角「最近 30 天 ⌄」弹出年份 + 12 个月（没日记的灰掉），选了只画那个月；底部「最近 30 天」回默认。
 * - 下面一排心情胶囊（名字 + 这段时间的条数），点了按心情筛日记，河里这种颜色更浓、其他变淡。
 * - 悬停 / 手指按住一处：「10月12日 · 焦虑 2 条」。
 * - 这段时间一条都没有：中性的淡灰雾照样呼吸，中间一行「写下第一篇日记，这里就有颜色了」。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  fillRiverGaps,
  formatDate,
  getLocale,
  intlLocale,
  mixOklabTo,
  oklabLightness,
  toneOklab,
  moodLabel,
  monthShort,
  riverDayAt,
  riverProfile,
  riverSeed,
  type MoodId,
  type RiverData,
  type RiverRange,
} from '@mindough/core';
import { useSettings } from '../../lib/settings';
import { canvasSize, paintRiver, type Rgb } from '../../lib/mood-river-paint';
import { PopoverPanel } from '../../ui/primitives';
import { MoodIcon } from './MoodIcon';
import { tr } from '../../lib/i18n';

const FRAME_MS = 66; // 约 15 帧

/** 「2026年10月」/「October 2026」。 */
export function riverMonthTitle(year: number, month: number): string {
  if (getLocale() === 'zh') return `${year}年${month}月`; // i18n-ignore 中文分支
  return new Intl.DateTimeFormat(intlLocale(), { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function yearTitle(year: number): string {
  if (getLocale() === 'zh') return `${year}年`; // i18n-ignore 中文分支
  return String(year);
}
export function riverRangeLabel(range: RiverRange): string {
  return range.kind === 'recent' ? tr('最近 30 天') : riverMonthTitle(range.year, range.month);
}

/** 任意 CSS 颜色 → RGB（画一个像素读回来）。认不出的写法（如老 WebView 不认 color-mix）用 fallback，不再当成黑色。 */
function makeColorReader() {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true });
  return (css: string, fallback: Rgb): Rgb => {
    if (!g || !css) return fallback;
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = '#010203';
    g.fillStyle = css;
    if (g.fillStyle === '#010203') return fallback;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  };
}
const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

interface Palette {
  dark: boolean;
  bg: string;
  text: string;
  moods: Record<string, string>;
  /** 素净档（色彩设置）：空状态那股也不带紫 */
  plain?: boolean;
}

function usePalette(host: HTMLElement | null): Palette | null {
  const { skin, theme, settings } = useSettings();
  const colorLevel = settings.colorLevel;
  const [p, setP] = useState<Palette | null>(null);
  useLayoutEffect(() => {
    if (!host) return;
    const cs = getComputedStyle(host);
    const read = makeColorReader();
    const v = (name: string) => cs.getPropertyValue(name).trim();
    const dark = document.documentElement.dataset.theme === 'dark';
    const bg = toHex(read(v('--bg'), dark ? [28, 28, 30] : [255, 255, 255]));
    const text = toHex(read(v('--text'), dark ? [242, 242, 247] : [28, 28, 30]));
    const moods: Record<string, string> = {};
    for (const name of Object.keys(MOOD_FALLBACK)) moods[name] = toHex(read(v(`--mood-${name}`), MOOD_FALLBACK[name]!));
    setP({ dark, bg, text, moods, plain: document.documentElement.dataset.colorLevel === 'plain' });
  }, [host, skin, theme, colorLevel]);
  return p;
}
const MOOD_FALLBACK: Record<string, Rgb> = {
  happy: [247, 201, 92],
  excited: [255, 159, 10],
  grateful: [244, 160, 181],
  content: [48, 209, 88],
  calm: [64, 200, 224],
  okay: [169, 182, 198],
  bored: [184, 178, 162],
  tired: [142, 134, 255],
  anxious: [156, 141, 242],
  sad: [100, 168, 255],
  irritated: [245, 158, 114],
  angry: [255, 105, 97],
};

/**
 * 河流里一股心情的色调（Rei 2026-11-13「日记中的渐变颜色块的研发发黑，light theme要浅，dark theme深一点」）。
 * 心情令牌是给小脸、文字用的，浅色主题里本来就深（#b07f00、#2e7cf6），素净档更是近黑的灰；直接拿来画大块渐变就发黑。
 * 这里只留色相，亮度按令牌原来的深浅挪到固定一段（OKLab L）：浅色 0.80–0.90，像淡彩；深色 0.48–0.56，深但不黑。
 * 色度乘一下再封顶，免得浅色太艳出 sRGB 偏色。素净档的灰也走这条，深浅次序不变。
 */
export function riverTone(base: string, dark: boolean, focused = false): string {
  const Lb = oklabLightness(base) ?? 0.5;
  if (dark) return toneOklab(base, 0.36 + 0.2 * Lb + (focused ? 0.04 : 0), focused ? 1 : 0.8, focused ? 0.14 : 0.11);
  return toneOklab(base, 0.76 + 0.2 * Lb - (focused ? 0.05 : 0), focused ? 0.8 : 0.6, focused ? 0.12 : 0.085);
}

/**
 * 每股的颜色：riverTone 调成浅色淡彩 / 深色中深。点了胶囊时，别的颜色再往背景靠，那股更浓一点。
 * 空状态：五股很淡的中性灰（浅色接近背景，深色深灰），其中一股带一点紫。
 */
function laneColors(p: Palette, lanes: ReadonlyArray<MoodId | null>, focus: MoodId | null, empty: boolean): Rgb[] {
  if (empty) {
    const ts = p.dark ? [0.74, 0.8, 0.72, 0.78, 0.76] : [0.88, 0.92, 0.89, 0.9, 0.91];
    return ts.map((t, i) => fromHex(mixOklabTo(i === 2 && !p.plain ? mixOklabTo(p.text, '#8f7fe0', 0.5) : p.text, p.bg, t, i === 2 ? 0.5 : 1)));
  }
  return lanes.map((m) => {
    const base = m ? (p.moods[m] ?? p.text) : mixOklabTo(p.text, p.bg, 0.55);
    let c = riverTone(base, p.dark);
    if (focus) c = m === focus ? riverTone(base, p.dark, true) : mixOklabTo(c, p.bg, 0.5, 0.6);
    return fromHex(c);
  });
}

export function MoodRiver({ data, focus, range }: { data: RiverData; focus: string | null; range: RiverRange }) {
  const { layout } = useSettings();
  const mobile = layout === 'mobile';
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const palette = usePalette(host);
  const [size, setSize] = useState<{ W: number; H: number }>({ W: 0, H: 0 });
  const [tip, setTip] = useState<{ y: number; text: string } | null>(null);
  const tipTimer = useRef(0);
  const empty = data.total === 0;
  const scale = mobile ? 5 : 4;

  useLayoutEffect(() => {
    if (!host) return;
    const measure = () => setSize((s) => (s.W === host.clientWidth && s.H === host.clientHeight ? s : { W: host.clientWidth, H: host.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [host]);

  const { cw, ch } = canvasSize(size.W, size.H, scale);
  const focusMood = focus && data.lanes.includes(focus as MoodId) ? (focus as MoodId) : null;
  const filled = useMemo(() => (empty ? data.days.map(() => [1, 1, 1, 1, 1]) : fillRiverGaps(data.counts)), [data, empty]);
  const profile = useMemo(() => riverProfile(filled, ch, { focus: focusMood ? data.lanes.indexOf(focusMood) : null }), [filled, ch, focusMood, data.lanes]);
  const colors = useMemo(() => (palette ? laneColors(palette, data.lanes, focusMood, empty) : null), [palette, data.lanes, focusMood, empty]);
  const seed = useMemo(() => riverSeed(data), [data]);

  // 最新的画法参数放 ref，动画循环只起一次
  const params = useRef<{ draw: (t: number) => void } | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = canvas.current;
    if (!el || !colors || !size.W || !size.H) {
      params.current = null;
      return;
    }
    el.width = cw;
    el.height = ch;
    const g = el.getContext('2d');
    if (!g) return;
    const img = g.createImageData(cw, ch);
    const draw = (t: number) => {
      paintRiver(img.data, { cw, ch, scale, W: size.W, H: size.H, profile, colors, t, motion: !reduced, maxAlpha: palette?.dark ? 240 : 255, seed });
      g.putImageData(img, 0, 0);
    };
    params.current = { draw };
    draw(clock.now());
  }, [colors, profile, cw, ch, scale, size, reduced, palette?.dark, seed]);

  // 动画：约 15 帧；看不见（切走标签页、滚出视口）就停
  useEffect(() => {
    if (reduced || !host) return;
    let raf = 0;
    let last = 0;
    let onScreen = true;
    const tick = (now: number) => {
      raf = 0;
      if (document.hidden || !onScreen) return;
      if (now - last >= FRAME_MS) {
        last = now;
        params.current?.draw(clock.now());
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf && !document.hidden && onScreen) raf = requestAnimationFrame(tick);
    };
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => {
      onScreen = es.some((e) => e.isIntersecting);
      start();
    }) : null;
    io?.observe(host);
    document.addEventListener('visibilitychange', start);
    start();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener('visibilitychange', start);
    };
  }, [reduced, host]);

  useEffect(() => () => window.clearTimeout(tipTimer.current), []);
  const tipAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (empty || !host) return;
    const rect = host.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const i = riverDayAt(y, rect.height, data.days.length);
    if (i < 0) return;
    setTip({ y: Math.max(14, Math.min(rect.height - 14, y)), text: dayTip(data, i) });
    window.clearTimeout(tipTimer.current);
    if (e.pointerType !== 'mouse') tipTimer.current = window.setTimeout(() => setTip(null), 2500);
  };

  const label = empty
    ? tr('心情河流（{range}）：还没有日记', { range: riverRangeLabel(range) })
    : tr('心情河流（{range}）：{n} 条日记', { range: riverRangeLabel(range), n: data.total });

  return (
    <div
      ref={setHost}
      className={`jriver-canvas${empty ? ' is-empty' : ''}`}
      role="img"
      aria-label={label}
      onPointerMove={(e) => e.pointerType === 'mouse' && tipAt(e)}
      onPointerDown={tipAt}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setTip(null)}
    >
      <canvas ref={canvas} aria-hidden />
      {empty && <p className="jriver-empty">{tr('写下第一篇日记，这里就有颜色了')}</p>}
      {tip && (
        <span className="jriver-tip" style={{ '--ty': `${tip.y}px` } as CSSProperties} aria-hidden>
          {tip.text}
        </span>
      )}
    </div>
  );
}

/** 「10月12日 · 焦虑 2 条、开心 1 条」/「10月13日 · 没写」。 */
export function dayTip(data: RiverData, i: number): string {
  const day = data.days[i];
  if (!day) return '';
  const date = formatDate(day, { weekday: false });
  const row = data.counts[i] ?? [];
  const parts = data.lanes
    .map((m, k) => ({ m, n: row[k] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map(({ m, n }) => tr('{mood} {n} 条', { mood: m ? moodLabel(m) : tr('没选心情'), n }));
  if (!parts.length) return tr('{date} · 没写', { date });
  return tr('{date} · {moods}', { date, moods: parts.join(tr('、')) });
}

/** 动画用的时钟（秒），整页共用一个起点，换范围时不跳。 */
const clock = (() => {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  return { now: () => ((typeof performance !== 'undefined' ? performance.now() : 0) - t0) / 1000 };
})();

function useReducedMotion(): boolean {
  const q = '(prefers-reduced-motion: reduce)';
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(q);
    const f = () => setOn(mq.matches);
    mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  }, []);
  return on;
}

/** 右上角「最近 30 天 ⌄」：年份（左右翻）+ 12 个月，没日记的月份灰掉；底部「最近 30 天」。手机上从底部弹出。 */
export function RiverRangePicker({
  range,
  onChange,
  years,
  monthsOf,
  thisYear,
}: {
  range: RiverRange;
  onChange: (r: RiverRange) => void;
  years: { min: number; max: number };
  monthsOf: (year: number) => boolean[];
  thisYear: number;
}) {
  const [year, setYear] = useState(range.kind === 'month' ? range.year : thisYear);
  const months = monthsOf(year);
  return (
    <PopoverPanel
      label={tr('选月份')}
      placement="bottom end"
      className="is-sheet jriver-pop"
      trigger={
        <RacButton className="jriver-range" aria-label={tr('心情河流的范围：{range}', { range: riverRangeLabel(range) })} onPress={() => setYear(range.kind === 'month' ? range.year : thisYear)}>
          <span>{riverRangeLabel(range)}</span>
          <ChevronDown size={13} aria-hidden />
        </RacButton>
      }
    >
      {(close) => (
        <div className="jriver-picker">
          <div className="jriver-year">
            <RacButton className="icon-btn" aria-label={tr('上一年')} isDisabled={year <= years.min} onPress={() => setYear((y) => y - 1)}>
              <ChevronLeft size={16} />
            </RacButton>
            <span className="jriver-year-title" aria-live="polite">
              {yearTitle(year)}
            </span>
            <RacButton className="icon-btn" aria-label={tr('下一年')} isDisabled={year >= years.max} onPress={() => setYear((y) => y + 1)}>
              <ChevronRight size={16} />
            </RacButton>
          </div>
          <div className="jriver-months" role="group" aria-label={yearTitle(year)}>
            {months.map((has, i) => {
              const m = i + 1;
              const on = range.kind === 'month' && range.year === year && range.month === m;
              return (
                <RacButton
                  key={m}
                  className={`jriver-month${on ? ' is-selected' : ''}`}
                  isDisabled={!has}
                  aria-pressed={on}
                  aria-label={has ? riverMonthTitle(year, m) : tr('{month}：没有日记', { month: riverMonthTitle(year, m) })}
                  onPress={() => {
                    onChange({ kind: 'month', year, month: m });
                    close();
                  }}
                >
                  {monthShort(m)}
                </RacButton>
              );
            })}
          </div>
          <RacButton
            className={`jriver-recent${range.kind === 'recent' ? ' is-selected' : ''}`}
            aria-pressed={range.kind === 'recent'}
            onPress={() => {
              onChange({ kind: 'recent' });
              close();
            }}
          >
            {tr('最近 30 天')}
          </RacButton>
        </div>
      )}
    </PopoverPanel>
  );
}

/** 河流下面的心情胶囊：名字 + 这段时间的条数；点了按心情筛（再点取消）。悬停、点中时脸动一下。 */
export function MoodChips({ counts, selected, onSelect }: { counts: ReadonlyArray<{ id: MoodId; count: number }>; selected: string | null; onSelect: (mood: string | null) => void }) {
  const [played, setPlayed] = useState<{ id: string; n: number } | null>(null);
  const play = (id: string) => setPlayed((p) => ({ id, n: (p?.n ?? 0) + 1 }));
  if (!counts.length) return null;
  return (
    <ul className="jmoods-list" aria-label={tr('心情')}>
      {counts.map(({ id, count }) => {
        const on = selected === id;
        return (
          <li key={id}>
            <button
              type="button"
              className={`jmoods-row${on ? ' is-selected' : ''}`}
              aria-pressed={on}
              aria-label={tr('{mood}：{n} 条', { mood: moodLabel(id), n: count })}
              style={{ '--jm': `var(--mood-${id})` } as CSSProperties}
              onPointerEnter={() => play(id)}
              onClick={() => {
                if (!on) play(id);
                onSelect(on ? null : id);
              }}
            >
              <MoodIcon key={played?.id === id ? played.n : 0} mood={id} size={20} playing={played?.id === id} />
              <span className="jmoods-name">{moodLabel(id)}</span>
              <span className="jmoods-count">{count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
