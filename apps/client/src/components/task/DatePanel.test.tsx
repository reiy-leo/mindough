// @vitest-environment happy-dom
/**
 * 日期面板方案 A（Rei 2026-11-01）：点一天就生效；「+ 结束日」再点一天成段；× 去掉结束日；Shift 点；键盘换天、翻页；「农历」开关换成农历月历。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { lunarCellLabel } from '@mindough/core';

const lunarShow = vi.hoisted(() => ({ on: true }));
vi.mock('../../store/StoreProvider', () => ({ useStore: () => ({ now: () => new Date('2026-10-29T04:00:00Z') }) }));
vi.mock('../../lib/settings', () => ({ useSettings: () => ({ layout: 'desktop', settings: {} }) }));
vi.mock('../../lib/lunar', () => ({
  LUNAR_PICK_KEY: 'mindough:lunar-pick',
  useLunar: () => ({ show: lunarShow.on, holidays: false, any: lunarShow.on, day: (d: string) => ({ label: lunarCellLabel(d), sub: null }) }),
}));
vi.mock('./TimeZonePicker', () => ({ TimeZoneRow: () => null }));

import { DatePanel } from './DatePanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const onRange = vi.fn();
const onChange = vi.fn();
const TODAY = '2026-10-29';

function render(value: string | null, end: string | null = null, range = true) {
  act(() => root.render(<DatePanel value={value} end={end} today={TODAY} onChange={onChange} {...(range ? { onRangeChange: onRange } : {})} />));
}
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T & HTMLElement>(sel);
const cell = (d: string) => $(`[data-date="${d}"]`)!;
const click = (el: Element, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })));
const key = (k: string, init: KeyboardEventInit = {}) => act(() => void $('.calendar-grid')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })));

beforeEach(() => {
  localStorage.clear();
  lunarShow.on = true;
  onRange.mockReset();
  onChange.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('日期面板：一张月历，点一下就生效', () => {
  it('单日：胶囊写日期和农历；点另一天就存、选完', () => {
    render('2026-10-29');
    expect($('.date-chip.is-start')!.textContent).toBe('10月29日 周四九月二十');
    expect($('.date-chip.is-add')).not.toBeNull();
    expect($('.segmented')).toBeNull();
    click(cell('2026-11-02'));
    expect(onRange).toHaveBeenLastCalledWith('2026-11-02', null, true);
  });

  it('「+ 结束日」：胶囊变「选结束日」、出提示；再点一天成段', () => {
    render('2026-10-29');
    click($('.date-chip.is-add')!);
    expect($('.date-chip.is-waiting')!.textContent).toBe('选结束日');
    expect($('.date-hint')!.textContent).toContain('Shift');
    click(cell('2026-11-08'));
    expect(onRange).toHaveBeenLastCalledWith('2026-10-29', '2026-11-08', true);
  });

  it('日期段：两个胶囊 + 天数；× 去掉结束日（面板留着）；点段里一天改结束', () => {
    render('2026-10-29', '2026-11-08');
    expect($('.date-chip.is-end')!.textContent).toContain('11月8日 周日');
    expect($('.date-chip-days')!.textContent).toBe('11 天');
    expect(cell('2026-11-02').classList.contains('is-range-middle')).toBe(true);
    expect(cell('2026-11-08').getAttribute('aria-label')).toContain('已选');
    click($('.date-chip-x')!);
    expect(onRange).toHaveBeenLastCalledWith('2026-10-29', null, false);
    click(cell('2026-11-02'));
    expect(onRange).toHaveBeenLastCalledWith('2026-10-29', '2026-11-02', true);
  });

  it('Shift 点：从单日直接变成段', () => {
    render('2026-10-29');
    click(cell('2026-10-20'), { shiftKey: true });
    expect(onRange).toHaveBeenLastCalledWith('2026-10-20', '2026-10-29', true);
  });

  it('键盘：方向键换天、Enter 选；PageDown 翻到下个月同一天', () => {
    render('2026-10-29');
    expect(cell('2026-10-29').tabIndex).toBe(0);
    key('ArrowRight');
    expect(cell('2026-10-30').tabIndex).toBe(0);
    expect(document.activeElement).toBe(cell('2026-10-30'));
    key('Enter');
    expect(onRange).toHaveBeenLastCalledWith('2026-10-30', null, true);
    key('PageDown');
    expect($('.calendar-title')!.textContent).toBe('2026年11月');
    expect(document.activeElement).toBe(cell('2026-11-30'));
  });

  it('「回到今天」（2026-11-13 收紧时加的 ○）：翻走了点它回到今天那个月、焦点落在今天，不改已选的日子', () => {
    render('2026-11-20');
    key('PageDown');
    key('PageDown');
    expect($('.calendar-title')!.textContent).toBe('2027年1月');
    const back = $('[aria-label="回到今天"]')!;
    expect(back.closest('.calendar-head')).not.toBeNull();
    click(back);
    expect($('.calendar-title')!.textContent).toBe('2026年10月');
    expect(document.activeElement).toBe(cell(TODAY));
    expect(onRange).not.toHaveBeenCalled();
    // 农历页也一样：回到今天所在的农历月
    click($('.lunar-toggle')!);
    key('PageDown');
    click($('[aria-label="回到今天"]')!);
    expect($('.calendar-title')!.textContent).toBe('九月丙午年（2026）');
    expect(document.activeElement).toBe(cell(TODAY));
  });

  it('「农历」开关：按农历月翻页，大字农历、小字公历，记在本机', () => {
    render('2026-10-29');
    const toggle = $('.lunar-toggle')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    click(toggle);
    expect(localStorage.getItem('mindough:lunar-pick')).toBe('lunar');
    expect($('.calendar-title')!.textContent).toBe('九月丙午年（2026）');
    expect(cell('2026-10-10').textContent).toBe('初一10');
    expect(cell('2026-11-01').textContent).toBe('廿三11月');
    expect(cell('2026-10-18').textContent).toBe('初九重阳节');
    expect($('.date-hint')!.textContent).toContain('每年农历');
    click(cell('2026-11-08'));
    expect(onRange).toHaveBeenLastCalledWith('2026-11-08', null, true);
  });

  it('农历界面不显示时：没有「农历」开关，胶囊不写农历；没给 onRangeChange 时没有「+ 结束日」', () => {
    lunarShow.on = false;
    render('2026-10-29', null, false);
    expect($('.lunar-toggle')).toBeNull();
    expect($('.date-chip.is-start')!.textContent).toBe('10月29日 周四');
    expect($('.date-chip.is-add')).toBeNull();
    click(cell('2026-10-30'));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-30');
  });
});
