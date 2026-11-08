// @vitest-environment happy-dom
/**
 * 看板视图的任务详情浮层（Rei 2026-11-09「切换到看板视图后，不要显示侧边的详情column」）：
 * 选中任务就弹出；Esc、右上角关闭都取消选中；正文 / 输入框里按 Esc 只失焦，不关浮层。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Task } from '@mindough/core';

const ui = vi.hoisted(() => ({ editingId: null as string | null, openEditor: vi.fn() }));
const tasks = vi.hoisted(() => [{ id: 't1', body_md: '买菜' }] as unknown as Task[]);
vi.mock('../../lib/ui', () => ({ useUi: () => ui }));
vi.mock('../../store/StoreProvider', () => ({ useStore: () => ({}) }));
vi.mock('../../lib/view', () => ({ titleOf: (_s: unknown, t: Task) => t.body_md }));
// 详情本体换成最小的样子：一个输入框 + 关闭按钮（mode 写在上面好查）
vi.mock('./TaskDetail', () => ({
  useSelectedTask: () => tasks.find((t) => t.id === ui.editingId),
  TaskDetail: ({ mode }: { mode: string }) => (
    <section className="pane-detail" data-mode={mode}>
      <input className="field" aria-label="字段" />
      <button type="button" className="dialog-close" onClick={() => ui.openEditor(null)}>
        关闭
      </button>
    </section>
  ),
}));

import { DetailModal } from './DetailModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const render = () => act(() => root.render(<DetailModal />));
beforeEach(() => {
  ui.openEditor.mockReset();
  ui.editingId = null;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const dialog = () => document.querySelector('.modal-detail [role="dialog"]') as HTMLElement | null;
function key(el: Element, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true }));
  });
}

describe('看板详情浮层', () => {
  it('没选中：不弹', () => {
    render();
    expect(dialog()).toBeNull();
  });

  it('选中任务：弹出浮层，里面是 modal 模式的详情，读屏名是任务标题', () => {
    ui.editingId = 't1';
    render();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.getAttribute('aria-label')).toBe('买菜');
    expect(document.querySelector('.modal-detail .pane-detail')!.getAttribute('data-mode')).toBe('modal');
  });

  it('Esc：取消选中（关浮层）', () => {
    ui.editingId = 't1';
    render();
    key(dialog()!, 'Escape');
    expect(ui.openEditor).toHaveBeenCalledWith(null);
  });

  it('输入框里按 Esc：只失焦，不关', () => {
    ui.editingId = 't1';
    render();
    const input = document.querySelector('.modal-detail .field') as HTMLInputElement;
    act(() => input.focus());
    key(input, 'Escape');
    expect(ui.openEditor).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
    // 焦点在浮层上，再按一次 Esc 就关
    expect(document.activeElement).toBe(dialog());
    key(dialog()!, 'Escape');
    expect(ui.openEditor).toHaveBeenCalledWith(null);
  });

  it('关闭按钮：取消选中', () => {
    ui.editingId = 't1';
    render();
    act(() => (document.querySelector('.modal-detail .dialog-close') as HTMLButtonElement).click());
    expect(ui.openEditor).toHaveBeenCalledWith(null);
  });
});
