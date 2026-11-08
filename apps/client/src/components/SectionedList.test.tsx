// @vitest-environment happy-dom
/** 按心情分区时段标题前的心情色小圆点（Rei 2026-11-08 23:49「心情颜色应用到任务」）。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Task } from '@mindough/core';
import type { ListSection } from '../lib/sections';

vi.mock('./project/GroupIcon', () => ({ GroupIcon: () => null }));
import { SectionedList } from './SectionedList';
import { SettingsProvider } from '../lib/settings';

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

const t = { id: 'a' } as Task;
const render = (sections: ListSection<Task>[]) =>
  act(() => root.render(<SectionedList sections={sections} collapsed={[]} onCollapsedChange={() => {}} idPrefix="x" renderList={() => null} />));

describe('分区标题的心情色圆点', () => {
  it('按心情：每段一个心情色圆点，「没有心情」是中性灰', () => {
    render([
      { kind: 'mood', key: 'happy', label: '开心', tasks: [t] },
      { kind: 'mood', key: 'none', label: '没有心情', tasks: [t] },
    ]);
    const dots = host.querySelectorAll('.section-dot');
    expect(dots).toHaveLength(2);
    expect(dots[0]!.classList.contains('mood-happy')).toBe(true);
    expect(dots[1]!.classList.contains('is-none')).toBe(true);
    expect(dots[0]!.getAttribute('aria-hidden')).toBe('true');
  });
  it('按项目、按日期没有圆点', () => {
    render([{ kind: 'due', key: 'today', label: '今天', tasks: [t] }]);
    expect(host.querySelector('.section-dot')).toBeNull();
  });
});

describe('多彩档（色彩设置，Rei 2026-11-09）', () => {
  it('心情、项目分区标题换成彩色文字，不画色点；「没有心情」照旧灰点', () => {
    localStorage.setItem('mindough:settings', JSON.stringify({ colorLevel: 'vivid' }));
    act(() =>
      root.render(
        <SettingsProvider>
          <SectionedList
            sections={[
              { kind: 'mood', key: 'happy', label: '开心', tasks: [t] },
              { kind: 'mood', key: 'none', label: '没有心情', tasks: [t] },
              { kind: 'project', key: 'g1', label: '搬家', tasks: [t], group: { id: 'g1', color: '#af52de' } as never },
            ]}
            collapsed={[]}
            onCollapsedChange={() => {}}
            idPrefix="v"
            renderList={() => null}
          />
        </SettingsProvider>,
      ),
    );
    localStorage.removeItem('mindough:settings');
    const titles = [...host.querySelectorAll<HTMLElement>('.section-title')];
    expect(titles[0]!.classList.contains('is-tinted')).toBe(true);
    expect(titles[0]!.style.getPropertyValue('--section-tint')).toBe('var(--mood-happy)');
    expect(titles[0]!.querySelector('.section-dot')).toBeNull();
    expect(titles[1]!.classList.contains('is-tinted')).toBe(false);
    expect(titles[1]!.querySelector('.section-dot.is-none')).not.toBeNull();
    expect(titles[2]!.style.getPropertyValue('--section-tint')).toBe('#af52de');
    expect(document.documentElement.dataset.colorLevel).toBe('vivid');
  });
});
