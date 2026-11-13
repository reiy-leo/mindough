// @vitest-environment happy-dom
/**
 * 打卡描述做成属性（Rei 2026-11-13 07:25「打卡描述做成属性，在属性dropdown中放在心情、附件一组」）：
 * 从「+」打开时光标进去；删空后离开（失焦 / Esc）就收起；框内右上角 × 清掉、收起、能撤销；打开着打字删空不收。
 * 09:31「打卡描述的label不要，换成用placeholder」：没有框头，只有输入区和占位，读屏名在框上。
 * 边打边存的时机在 TaskBody.test。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryAdapter, Store, type Task } from '@mindough/core';

const toast = vi.fn();
vi.mock('../../lib/ui', () => ({ useUi: () => ({ toast }) }));

import { CheckInNote } from './CheckInNote';
import { checkInNoteShown } from '../../lib/prop-chips';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let store: Store;
beforeEach(async () => {
  store = await Store.open(new MemoryAdapter(), { deviceId: 'd' });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  toast.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** 同 TaskDetail：写了就显示，没写时看「打开着」；从「+」打开就带 autoFocus。 */
function Harness({ id, startOpen = false }: { id: string; startOpen?: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick((n) => n + 1)), []);
  const [st, setSt] = useState({ open: startOpen, focus: startOpen });
  const task = store.get('task', id) as Task;
  if (!checkInNoteShown(task.checkin_note, st.open)) return <span className="collapsed" />;
  return <CheckInNote store={store} task={task} autoFocus={st.focus} onOpenChange={(open) => setSt({ open, focus: false })} />;
}
const render = (id: string, startOpen = false) => act(() => root.render(<Harness key={`${id}-${startOpen}`} id={id} startOpen={startOpen} />));
const box = () => host.querySelector('textarea') as HTMLTextAreaElement | null;
function type(text: string) {
  act(() => {
    const el = box()!;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    set.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const habit = (note: string | null = null) => {
  const t = store.createTask({ body_md: '跑步', completion_mode: 'count', recurrence: { freq: 'daily', interval: 1 } } as never);
  if (note) store.setCheckInNote(t.id, note);
  return t;
};

describe('打卡描述框的增删', () => {
  it('没写时不显示；从「+」打开就出来、光标进去', () => {
    const t = habit();
    render(t.id);
    expect(box()).toBeNull();
    render(t.id, true);
    expect(box()).not.toBeNull();
    expect(document.activeElement).toBe(box());
  });

  it('打开了什么都没写就离开：收起，库里还是空', () => {
    const t = habit();
    render(t.id, true);
    act(() => box()!.blur());
    expect(box()).toBeNull();
    expect(store.get('task', t.id)!.checkin_note ?? null).toBeNull();
  });

  it('写了就一直显示；删空（打开着）不收，离开才收', () => {
    const t = habit('慢跑');
    render(t.id);
    act(() => box()!.focus());
    type('');
    expect(box()).not.toBeNull();
    act(() => box()!.blur());
    expect(box()).toBeNull();
    expect(store.get('task', t.id)!.checkin_note ?? null).toBeNull();
  });

  it('只写空白离开也算没写：收起', () => {
    const t = habit();
    render(t.id, true);
    type('   ');
    act(() => box()!.blur());
    expect(box()).toBeNull();
    expect(store.get('task', t.id)!.checkin_note ?? null).toBeNull();
  });

  it('Esc：存下，没删空不收', () => {
    const t = habit('a');
    render(t.id);
    act(() => box()!.focus());
    type('ab');
    act(() => void box()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(store.get('task', t.id)!.checkin_note).toBe('ab');
    expect(box()).not.toBeNull();
  });

  it('没有框头标签：只有输入区、占位说用途，读屏名「打卡描述」；× 在框里', () => {
    const t = habit();
    render(t.id, true);
    const sec = host.querySelector('section.checkin-note') as HTMLElement;
    expect(sec.getAttribute('aria-label')).toBe('打卡描述');
    expect(sec.hasAttribute('aria-labelledby')).toBe(false);
    expect(sec.querySelector('.checkin-note-head')).toBeNull();
    expect(sec.textContent).toBe('');
    expect(box()!.placeholder).toBe('添加打卡描述…');
    expect(box()!.getAttribute('aria-label')).toBe('打卡描述');
    expect(sec.querySelector('.checkin-note-x')?.parentElement).toBe(sec);
  });

  it('框内 ×：清掉、收起，提示里撤销能回来', () => {
    const t = habit('每天 5 公里');
    render(t.id);
    const x = host.querySelector('.checkin-note-x') as HTMLButtonElement;
    expect(x.getAttribute('aria-label')).toBe('清除打卡描述');
    act(() => {
      x.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      x.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
      x.click();
    });
    expect(store.get('task', t.id)!.checkin_note ?? null).toBeNull();
    expect(box()).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
    const [arg] = toast.mock.calls[0]!;
    act(() => arg.actions[0].onPress());
    expect(store.get('task', t.id)!.checkin_note).toBe('每天 5 公里');
    expect(box()!.value).toBe('每天 5 公里');
  });
});
