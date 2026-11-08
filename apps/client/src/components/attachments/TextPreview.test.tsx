// @vitest-environment happy-dom
/**
 * 纯文本预览浮层（Rei 2026-11-09）：和图片灯箱同一套深色浮层；txt 原文、md 排版可切原文、csv 表格；
 * 截断提示带下载；读不出来给下载；Esc / 点纸面外面 / × 关闭。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Attachment } from '@mindough/core';
import type { TextLoadResult } from '../../lib/text-preview';
import { TextPreview, looksGarbled } from './TextPreview';
import '../../lib/i18n';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const onClose = vi.fn();
const onDownload = vi.fn();
const att = (file_name: string, mime = '') => ({ id: file_name, file_name, mime, size: 2048, r2_key: 'k', thumb_key: null }) as Attachment;

async function show(a: Attachment, r: TextLoadResult) {
  await act(async () => root.render(<TextPreview attachment={a} onClose={onClose} onDownload={onDownload} load={async () => r} />));
  await act(async () => {});
}
const sheet = () => document.querySelector('.textpv-sheet') as HTMLElement;
const press = (el: Element) =>
  act(() => {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' } as PointerEventInit));
  });

beforeEach(() => {
  onClose.mockReset();
  onDownload.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('文本预览浮层', () => {
  it('txt：灯箱同款浮层，等宽原文，读屏名带文件名', async () => {
    await show(att('a.txt'), { ok: true, text: 'line1\nline2', truncated: false, size: 11 });
    expect(document.querySelector('.lightbox-overlay')).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('文本「a.txt」');
    expect(sheet().querySelector('pre.textpv-pre')!.textContent).toBe('line1\nline2');
    expect(document.querySelector('.textpv-toggle')).toBeNull();
  });

  it('md：排版显示，能切回原文', async () => {
    await show(att('a.md'), { ok: true, text: '# 标题\n\n**粗**', truncated: false, size: 10 });
    // happy-dom 里 DOMPurify 会把 h1 拆掉（真浏览器不会），这里只查粗体
    expect(sheet().querySelector('.textpv-md strong')!.textContent).toBe('粗');
    press(document.querySelector('.textpv-toggle')!);
    expect(sheet().querySelector('pre')!.textContent).toBe('# 标题\n\n**粗**');
  });

  it('csv：表格，第一行表头；坏的 csv 显示原文', async () => {
    await show(att('a.csv', 'text/csv'), { ok: true, text: 'a,b\n1,2\n3', truncated: false, size: 10 });
    expect([...sheet().querySelectorAll('th')].map((x) => x.textContent)).toEqual(['a', 'b']);
    expect(sheet().querySelectorAll('tbody tr').length).toBe(2);
    await show(att('b.csv'), { ok: true, text: '"a,b', truncated: false, size: 4 });
    expect(sheet().querySelector('table')).toBeNull();
    expect(sheet().querySelector('pre')!.textContent).toBe('"a,b');
  });

  it('截断：提示只显示了前 1 MB，带下载', async () => {
    const a = att('big.log');
    await show(a, { ok: true, text: 'x', truncated: true, size: 3 * 1024 * 1024 });
    expect(sheet().querySelector('.textpv-note')!.textContent).toContain('1 MB');
    expect(sheet().querySelector('.textpv-note')!.textContent).toContain('3 MB');
    press(sheet().querySelector('.textpv-dl')!);
    expect(onDownload).toHaveBeenCalledWith(a);
  });

  it('读不出来：说明原因并给下载', async () => {
    await show(att('a.txt'), { ok: false, reason: 'binary' });
    expect(sheet().textContent).toContain('不是纯文本');
    expect(sheet().querySelector('.textpv-dl')).not.toBeNull();
  });

  it('点纸面外面、× 都关；点纸面里面不关', async () => {
    await show(att('a.txt'), { ok: true, text: 'hi', truncated: false, size: 2 });
    act(() => sheet().click());
    expect(onClose).not.toHaveBeenCalled();
    act(() => (document.querySelector('.textpv-stage') as HTMLElement).click());
    expect(onClose).toHaveBeenCalledTimes(1);
    press(document.querySelector('.lightbox-btn[aria-label="关闭"]')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Esc 关', async () => {
    await show(att('a.txt'), { ok: true, text: 'hi', truncated: false, size: 2 });
    const d = document.querySelector('[role="dialog"]')!;
    act(() => {
      d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      d.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('像乱码（很多 U+FFFD）才提示编码', () => {
    expect(looksGarbled('正常的中文')).toBe(false);
    expect(looksGarbled('\ufffd\ufffd\ufffdabc')).toBe(true);
  });
});
