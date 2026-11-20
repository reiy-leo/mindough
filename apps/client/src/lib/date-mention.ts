/**
 * @ 插进正文的日期胶囊（Rei 2026-11-20 12:08）：显示什么。存法和纯函数在 core date-mention.ts。
 *
 * - 绝对日期（默认）：显示 markdown 方括号里存着的字（「2026-11-20」「2026-11-20 12:03」）。
 * - 相对日期（设置 → 时间「编辑器里的日期」，同步的偏好）：「今天 12:03 · UTC+8」「明天 · UTC+8」「3 天前 · UTC+8」「5 天后 09:30 · UTC+8」，
 *   按本机时区、自然日算。悬停都显示完整的绝对时间。
 * - 编辑器的节点视图、只读 Markdown 都用这里的 paintDateMention，长得一样；点它不做事。
 * - 设置改了、跨了一天（相对显示时每分钟看一眼）就通知重画。App 用 useDateMentionSource 挂上 store。
 */
import { useEffect, useSyncExternalStore } from 'react';
import { DATE_MENTION_DISPLAY_PREF, dateMentionPrecision, formatDateMention, normalizeDateMentionDisplay, relativeDateParts, type DateMentionDisplay, type Store } from '@mindough/core';
import { tr, trc } from './i18n';

let mode: DateMentionDisplay = 'absolute';
let version = 0;
let unsub: (() => void) | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let lastDay = '';
const listeners = new Set<() => void>();

const emit = () => {
  version++;
  for (const fn of [...listeners]) fn();
};

const dayKey = () => new Date().toDateString();

/** 相对显示时每分钟看一眼：跨了自然日就重画（「明天」变「今天」）。 */
function syncTicker() {
  const want = mode === 'relative' && listeners.size > 0;
  if (want && !ticker && typeof setInterval !== 'undefined') {
    lastDay = dayKey();
    ticker = setInterval(() => {
      const d = dayKey();
      if (d !== lastDay) {
        lastDay = d;
        emit();
      }
    }, 60_000);
  } else if (!want && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

/** 现在怎么显示。 */
export const dateMentionDisplay = () => mode;

/** 改显示方式（测试、没挂 store 时用；平时跟着 store 的偏好走）。 */
export function setDateMentionDisplay(next: DateMentionDisplay) {
  if (next === mode) return;
  mode = next;
  syncTicker();
  emit();
}

/** 挂上 store：读偏好，偏好变了跟着变。 */
export function setDateMentionStore(store: Pick<Store, 'pref' | 'subscribe'> | null) {
  unsub?.();
  unsub = null;
  const read = () => setDateMentionDisplay(store ? normalizeDateMentionDisplay(store.pref(DATE_MENTION_DISPLAY_PREF)) : 'absolute');
  read();
  if (store) unsub = store.subscribe(read);
}

export function subscribeDateMentions(fn: () => void): () => void {
  listeners.add(fn);
  syncTicker();
  return () => {
    listeners.delete(fn);
    syncTicker();
  };
}

/** 只读 Markdown 用：设置变了、跨天了就重画。 */
export const useDateMentionVersion = () => useSyncExternalStore(subscribeDateMentions, () => version, () => version);

/** App 里调一次。 */
export function useDateMentionSource(store: Store) {
  useEffect(() => {
    setDateMentionStore(store);
    return () => setDateMentionStore(null);
  }, [store]);
}

/** 「今天」「明天」「昨天」「3 天前」「5 天后」。 */
function dayWord(days: number): string {
  if (days === 0) return trc('日期胶囊', '今天');
  if (days === 1) return trc('日期胶囊', '明天');
  if (days === -1) return trc('日期胶囊', '昨天');
  return days > 0 ? tr('{n} 天后', { n: days }) : tr('{n} 天前', { n: -days });
}

export interface DateMentionView {
  /** 胶囊上的字。 */
  text: string;
  /** 悬停：完整的绝对时间（本机时区 + UTC 偏移）。 */
  title: string;
}

/** 胶囊该显示什么。label 是方括号里存着的字（决定精度，绝对显示时就显示它）。 */
export function dateMentionView(ms: number, label: string, now: Date = new Date(), display: DateMentionDisplay = mode): DateMentionView {
  const precision = dateMentionPrecision(label);
  const p = relativeDateParts(ms, precision, now);
  const absolute = label.trim() || formatDateMention(ms, precision);
  const title = `${formatDateMention(ms, precision)} · ${p.zone}`;
  if (display !== 'relative') return { text: absolute, title };
  const text = `${dayWord(p.days)}${p.time ? ` ${p.time}` : ''} · ${p.zone}`;
  return { text, title };
}

/** 把胶囊画进 el（编辑器节点视图、只读 Markdown 共用）。 */
export function paintDateMention(el: HTMLElement, ms: number, label: string) {
  const v = dateMentionView(ms, label);
  el.classList.add('date-mention');
  if (el.textContent !== v.text) el.textContent = v.text;
  el.title = v.title;
  el.setAttribute('aria-label', v.text === v.title ? v.text : `${v.text} · ${v.title}`);
}
