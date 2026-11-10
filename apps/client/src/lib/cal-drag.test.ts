// @vitest-environment happy-dom
/**
 * 日历拖动改日期（Rei 2026-11-11 06:55）：⌥← / ⌥→、指针下找哪天、整段高亮哪几天。
 */
import { describe, expect, it } from 'vitest';
import { calDragKey, dropDateIn, dropSpan } from './cal-drag';

const k = (key: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

describe('cal-drag', () => {
  it('⌥← / ⌥→ 挪一天，别的组合不算', () => {
    expect(calDragKey(k('ArrowLeft', { altKey: true }))).toBe(-1);
    expect(calDragKey(k('ArrowRight', { altKey: true }))).toBe(1);
    expect(calDragKey(k('ArrowRight'))).toBe(0);
    expect(calDragKey(k('ArrowRight', { altKey: true, shiftKey: true }))).toBe(0);
    expect(calDragKey(k('ArrowUp', { altKey: true }))).toBe(0);
  });

  it('指针下面最上层带 data-drop-date 的那天；根外面的不算', () => {
    document.body.innerHTML = '<div id="root"><div class="bg" data-drop-date="2026-11-12"></div><section data-drop-date="2026-11-13"><button id="b">x</button></section></div><div id="out" data-drop-date="2026-11-20"></div>';
    const root = document.getElementById('root');
    const bg = document.querySelector('.bg')!;
    const b = document.getElementById('b')!;
    const out = document.getElementById('out')!;
    expect(dropDateIn([b, bg], root)).toBe('2026-11-13');
    expect(dropDateIn([bg], root)).toBe('2026-11-12');
    expect(dropDateIn([out], root)).toBeNull();
    expect(dropDateIn([out, bg], root)).toBe('2026-11-12');
  });

  it('整段平移后高亮的几天', () => {
    expect(dropSpan('2026-11-10', '2026-11-12', '2026-11-11', '2026-11-15')).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(dropSpan('2026-11-10', '2026-11-10', '2026-11-10', '2026-11-09')).toEqual(['2026-11-09']);
  });
});
