/**
 * 提及胶囊（Rei 2026-11-10「任务编辑器、日记编辑器中可以用@选择任务，日记中可@任务和倒数日」）：显示什么、点了做什么。
 * 存法和候选范围在 core task-mention.ts。
 *
 * - 胶囊按任务 id 取这件任务现在的标题（改名跟着变）；倒数日带沙漏图标和「还有 N 天」；完成、关闭的带对勾、字变淡；
 *   找不到（删了、还没同步过来）显示存着的那段字，划掉、虚线框，点了提示「找不到这件任务」。
 * - 点一下打开这件任务的详情（ui.openEditor：桌面右列、手机整页），在哪一页点都一样。
 * - 编辑器（MdEditor 的节点视图）、只读的 Markdown（发出去的日记、编辑器加载前的预览）都用这里的 paintMention，长得一样。
 *
 * 数据从这里的「来源」取：App 挂上 Store 和打开详情的办法（useMentionSource）。编辑器不用一层层传 store。
 */
import { useEffect, useSyncExternalStore } from 'react';
import { countdownPhrase, isFinished, mentionCandidates, mentionKind, type MentionCandidate, type MentionKind, type MentionScope, type Store } from '@mindough/core';
import { titleOf } from './view';
import { tr } from './i18n';

interface Source {
  store: Store;
  open: (id: string) => void;
  notFound: () => void;
}

let source: Source | null = null;
let version = 0;
let unsubStore: (() => void) | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  version++;
  for (const fn of [...listeners]) fn();
};

/** App 挂上数据来源（换 store 时重挂）。 */
export function setMentionSource(next: Source | null) {
  unsubStore?.();
  unsubStore = null;
  source = next;
  if (next) unsubStore = next.store.subscribe(emit);
  emit();
}

/** 任务有变化（或来源换了）时通知。 */
export function subscribeMentions(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** 只读 Markdown 用：任务变了就重画胶囊。 */
export function useMentionVersion(): number {
  return useSyncExternalStore(subscribeMentions, () => version, () => version);
}

/** App 里调一次：把 store 和打开详情的办法交给胶囊。 */
export function useMentionSource(store: Store, open: (id: string) => void, notFound: () => void) {
  useEffect(() => {
    setMentionSource({ store, open: (id) => open(id), notFound });
    return () => setMentionSource(null);
  }, [store, open, notFound]);
}

export interface MentionInfo {
  /** 找不到：删了，或者这台设备上还没有。 */
  missing: boolean;
  title: string;
  kind: MentionKind;
  ended: boolean;
  /** 倒数日的「还有 N 天」；别的空。 */
  suffix: string;
}

/** 胶囊该显示什么。label 是 markdown 里存的那段字（找不到时显示它）。 */
export function mentionInfo(id: string, label: string): MentionInfo {
  const t = source?.store.get('task', id);
  if (!source || !t) return { missing: true, title: label, kind: 'task', ended: false, suffix: '' };
  const kind = mentionKind(t) === 'countdown' ? 'countdown' : 'task';
  const suffix = kind === 'countdown' && t.target_date ? countdownPhrase(t.target_date, source.store.today()) : '';
  return { missing: false, title: titleOf(source.store, t), kind, ended: isFinished(t.status), suffix };
}

/** 这件任务现在的标题（编辑器写回、复制用）；找不到返回 null。 */
export function mentionTitle(id: string): string | null {
  const t = source?.store.get('task', id);
  return source && t ? titleOf(source.store, t) : null;
}

/** @ 浮层的候选（core mentionCandidates；标题和列表行同一个取法）。没挂来源时是空的。 */
export function mentionChoices(scope: MentionScope, selfId: string | null | undefined, query: string): MentionCandidate[] {
  if (!source) return [];
  const store = source.store;
  return mentionCandidates(store.tasks(), { scope, selfId: selfId ?? null, query, titleOf: (t) => titleOf(store, t) });
}

/** 点了胶囊：打开详情；找不到就提示。 */
export function openMention(id: string) {
  if (!source) return;
  if (!source.store.get('task', id)) return source.notFound();
  source.open(id);
}

// ───────── 画胶囊 ─────────

const SVG_NS = 'http://www.w3.org/2000/svg';
/** lucide 的 hourglass、circle-check（和侧栏「倒数日」、已完成用的同一个图标）。 */
const ICONS: Record<'countdown' | 'ended', [string, Record<string, string>][]> = {
  countdown: [
    ['path', { d: 'M5 22h14' }],
    ['path', { d: 'M5 2h14' }],
    ['path', { d: 'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22' }],
    ['path', { d: 'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2' }],
  ],
  ended: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm16 9-5.5 5.5L8 12' }],
  ],
};

function icon(name: 'countdown' | 'ended'): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '13', height: '13', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'task-mention-icon' }))
    svg.setAttribute(k, v);
  for (const [tag, attrs] of ICONS[name]) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  }
  return svg;
}

/** 签名：内容没变就不重画（同步来的每次改动都会通知）。 */
const signature = (i: MentionInfo) => `${i.missing ? 1 : 0}|${i.kind}|${i.ended ? 1 : 0}|${i.title}|${i.suffix}`;

/** 把胶囊画进 el（编辑器节点视图、只读 Markdown 共用）。 */
export function paintMention(el: HTMLElement, id: string, label: string) {
  const info = mentionInfo(id, label);
  const sig = signature(info);
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.className = `task-mention${info.kind === 'countdown' ? ' is-countdown' : ''}${info.ended ? ' is-ended' : ''}${info.missing ? ' is-missing' : ''}`;
  el.replaceChildren();
  if (info.kind === 'countdown' && !info.missing) el.appendChild(icon('countdown'));
  else if (info.ended) el.appendChild(icon('ended'));
  const title = document.createElement('span');
  title.className = 'task-mention-title';
  title.textContent = info.title || tr('未提供描述');
  el.appendChild(title);
  if (info.suffix) {
    const s = document.createElement('span');
    s.className = 'task-mention-meta';
    s.textContent = info.suffix;
    el.appendChild(s);
  }
  const state = info.missing ? tr('找不到这件任务') : info.ended ? tr('已结束') : '';
  el.title = state ? `${info.title || label} · ${state}` : info.title;
  el.setAttribute('aria-label', [info.kind === 'countdown' ? tr('倒数日') : tr('任务'), info.title || label, info.suffix, state].filter(Boolean).join(' · '));
}
