// @vitest-environment happy-dom
/** 列表输入框草稿（Rei 2026-11-14 06:28，lib/list-draft）。 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, draftKey, readDraft, useListDraft, writeDraft, type ListDraft } from './list-draft';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => localStorage.clear());

describe('读写', () => {
  it('键按页面和项目 id 分开', () => {
    expect(draftKey('myday')).toBe('mindough:draft:myday');
    expect(draftKey('project', 'g1')).toBe('mindough:draft:project:g1');
    expect(draftKey('project', 'g1')).not.toBe(draftKey('project', 'g2'));
  });
  it('写了能读回，空白就删掉', () => {
    const k = draftKey('backlog');
    writeDraft(k, { text: '买牛奶' });
    expect(readDraft(k)).toEqual({ text: '买牛奶' });
    writeDraft(k, { text: '   ' });
    expect(localStorage.getItem(k)).toBeNull();
    expect(readDraft(k)).toBeNull();
  });
  it('日记带心情；只有心情没字也留着', () => {
    const k = draftKey('journal');
    writeDraft(k, { text: '', mood: 'happy' });
    expect(readDraft(k)).toEqual({ text: '', mood: 'happy' });
    clearDraft(k);
    expect(readDraft(k)).toBeNull();
  });
  it('坏数据当没有', () => {
    localStorage.setItem(draftKey('myday'), '{oops');
    expect(readDraft(draftKey('myday'))).toBeNull();
  });
});

describe('useListDraft', () => {
  let root: Root;
  let host: HTMLDivElement;
  let api: [ListDraft, (d: ListDraft) => void, () => void];
  function Probe({ k }: { k: string }) {
    api = useListDraft(k);
    return <span>{api[0].text}</span>;
  }
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('卸载再装回来（切页）内容还在，清掉后没了', () => {
    const k = draftKey('myday');
    act(() => root.render(<Probe k={k} />));
    act(() => api[1]({ text: '写周报' }));
    act(() => root.render(<div />));
    act(() => root.render(<Probe k={k} />));
    expect(api[0].text).toBe('写周报');
    act(() => api[2]());
    expect(api[0].text).toBe('');
    expect(localStorage.getItem(k)).toBeNull();
  });

  it('换项目：各存各的', () => {
    const a = draftKey('project', 'a');
    const b = draftKey('project', 'b');
    act(() => root.render(<Probe k={a} />));
    act(() => api[1]({ text: 'A 的事' }));
    act(() => root.render(<Probe k={b} />));
    expect(api[0].text).toBe('');
    act(() => api[1]({ text: 'B 的事' }));
    act(() => root.render(<Probe k={a} />));
    expect(api[0].text).toBe('A 的事');
    expect(readDraft(b)).toEqual({ text: 'B 的事' });
  });

  it('输入法选字中不存，选完字再存', () => {
    vi.useFakeTimers();
    try {
      const k = draftKey('backlog');
      act(() => root.render(<Probe k={k} />));
      document.dispatchEvent(new Event('compositionstart'));
      act(() => api[1]({ text: 'mai' }));
      expect(api[0].text).toBe('mai');
      expect(localStorage.getItem(k)).toBeNull();
      act(() => api[1]({ text: '买' }));
      document.dispatchEvent(new Event('compositionend'));
      act(() => vi.runAllTimers());
      expect(readDraft(k)).toEqual({ text: '买' });
    } finally {
      vi.useRealTimers();
    }
  });
});
