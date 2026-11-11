// @vitest-environment happy-dom
/**
 * 拖动把手那格。2026-11-12 05:00 起置顶不放图钉（Rei「置顶的任务在任务列表中不显示前面的 pin icon，而是用粗体显示任务标题」），
 * 以前（2026-11-09 01:03）这格放红色图钉。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LEAD_GRIP_SIZE, RowLead } from './TaskRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const render = (el: React.ReactElement) => act(() => root.render(el));

describe('RowLead', () => {
  it('没置顶、能拖：把手按钮', () => {
    render(<RowLead pinned={false} dragLabel="拖动排序" />);
    const b = host.querySelector('button.drag-handle')!;
    expect(b).toBeTruthy();
    expect(b.getAttribute('aria-label')).toBe('拖动排序');
    expect(b.querySelector('svg.lucide-grip-vertical')!.getAttribute('width')).toBe(String(LEAD_GRIP_SIZE));
  });
  it('置顶、能拖（待安排、看板）：照样是把手，没有图钉，读屏多念「已置顶」', () => {
    render(<RowLead pinned dragLabel="拖到别的状态" />);
    const b = host.querySelector('button.drag-handle')!;
    expect(b).toBeTruthy();
    expect(b.querySelector('svg.lucide-pin')).toBeNull();
    expect(b.querySelector('svg.lucide-grip-vertical')).toBeTruthy();
    expect(b.getAttribute('aria-label')).toContain('拖到别的状态');
    expect(b.getAttribute('aria-label')).toContain('已置顶');
  });
  it('置顶、不能拖（我的一天）：同宽占位，没有图钉', () => {
    render(<RowLead pinned />);
    expect(host.querySelector('button')).toBeNull();
    expect(host.querySelector('svg.lucide-pin')).toBeNull();
    expect(host.querySelector('.drag-handle.is-placeholder')).toBeTruthy();
  });
  it('不能拖也没置顶：同宽占位', () => {
    render(<RowLead pinned={false} />);
    expect(host.querySelector('.drag-handle.is-placeholder')).toBeTruthy();
  });
});
