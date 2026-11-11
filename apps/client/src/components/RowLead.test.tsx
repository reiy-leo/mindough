// @vitest-environment happy-dom
/**
 * 拖动把手那格（Rei 2026-11-09 01:03「置顶的任务的pin放在circle前面，就是原本drag handle的地方，颜色用红色」）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LEAD_GRIP_SIZE, LEAD_PIN_SIZE, RowLead } from './TaskRow';

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
    expect(b.classList.contains('is-pin')).toBe(false);
    expect(b.getAttribute('aria-label')).toBe('拖动排序');
  });
  it('置顶、能拖（待安排、看板）：图钉就是拖动按钮', () => {
    render(<RowLead pinned dragLabel="拖到别的状态" />);
    const b = host.querySelector('button.drag-handle.is-pin')!;
    expect(b).toBeTruthy();
    expect(b.getAttribute('aria-label')).toContain('拖到别的状态');
    expect(b.getAttribute('aria-label')).toContain('已置顶');
    expect(b.querySelector('svg.lucide-pin')).toBeTruthy();
  });
  it('置顶、不能拖（我的一天）：只是图标，没有按钮', () => {
    render(<RowLead pinned />);
    expect(host.querySelector('button')).toBeNull();
    const s = host.querySelector('.drag-handle.is-pin')!;
    expect(s.getAttribute('aria-label')).toBe('已置顶');
    expect(s.querySelector('svg.lucide-pin')).toBeTruthy();
  });
  it('不能拖也没置顶：同宽占位', () => {
    render(<RowLead pinned={false} />);
    expect(host.querySelector('.drag-handle.is-placeholder')).toBeTruthy();
  });
  it('图钉和把手画出来一样高（Rei 2026-11-11「大小也要一致」）：图钉 12、把手 15，按各自图形的墨迹高度配平都是 10px', () => {
    // lucide Pin 墨迹高 20/24，GripVertical 16/24（含线宽）
    expect((LEAD_PIN_SIZE * 20) / 24).toBe((LEAD_GRIP_SIZE * 16) / 24);
    render(<RowLead pinned dragLabel="拖动排序" />);
    expect(host.querySelector('svg.lucide-pin')!.getAttribute('width')).toBe(String(LEAD_PIN_SIZE));
    render(<RowLead pinned={false} dragLabel="拖动排序" />);
    expect(host.querySelector('svg.lucide-grip-vertical')!.getAttribute('width')).toBe(String(LEAD_GRIP_SIZE));
  });
});
