/**
 * 侧栏、任务列表不显示滚动条（Rei 2026-11-08）：两套写法都在，只给任务列表的页面。浏览器里量滚动条宽度在 LightVela 截图脚本里。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('滚动条不显示', () => {
  const css = read('../styles/app.css');
  it('侧栏、标了 data-hide-scrollbar 的 .main（含 macOS 的 .main-scroll）两种写法都有', () => {
    for (const sel of ['.sidebar', '.main[data-hide-scrollbar]', '.main[data-hide-scrollbar] .main-scroll']) {
      expect(css).toContain(`${sel},`);
      expect(css).toContain(`${sel}::-webkit-scrollbar`);
    }
    expect(css).toMatch(/\.main\[data-hide-scrollbar\] \.main-scroll \{\s*scrollbar-width: none;/);
    expect(css).toMatch(/::-webkit-scrollbar \{\s*display: none;/);
  });
  it('只给任务列表：我的一天、待安排、积压、时间轴、项目页；日记、设置不在里面', () => {
    const app = read('../App.tsx');
    const pages = /HIDE_SCROLLBAR_PAGES: Route\['page'\]\[\] = \[([^\]]+)\]/.exec(app)?.[1] ?? '';
    expect(pages.split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual(['myday', 'backlog', 'doable', 'agenda', 'group']);
    expect(app.match(/data-hide-scrollbar=/g)?.length).toBe(2);
  });
});
