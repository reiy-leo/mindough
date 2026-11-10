/**
 * 侧栏、任务列表不显示滚动条（Rei 2026-11-08）：两套写法都在，只给任务列表的页面。浏览器里量滚动条宽度在 LightVela 截图脚本里。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('滚动条不显示', () => {
  const css = read('../styles/app.css');
  // 按规则拆：选择器列表 → 规则体。只查「某条规则的选择器列表里有它、规则体里有那句」，不管它排在列表第几个。
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sels: (m[1] ?? '').split(',').map((s) => s.trim()),
    body: m[2] ?? '',
  }));
  const ruleHas = (sel: string, decl: RegExp) => rules.some((r) => r.sels.includes(sel) && decl.test(r.body));
  it('侧栏、标了 data-hide-scrollbar 的 .main（含 macOS 的 .main-scroll）两种写法都有', () => {
    for (const sel of ['.sidebar', '.sidebar .nav', '.main[data-hide-scrollbar]', '.main[data-hide-scrollbar] .main-scroll']) {
      expect(ruleHas(sel, /scrollbar-width:\s*none/), `${sel} 缺 scrollbar-width: none`).toBe(true);
      expect(ruleHas(`${sel}::-webkit-scrollbar`, /display:\s*none/), `${sel}::-webkit-scrollbar 缺 display: none`).toBe(true);
    }
  });
  it('只给任务列表和打卡页：我的一天、待安排、积压、日历、项目页、已完成、打卡（Rei 2026-11-11）；日记、设置不在里面', () => {
    const app = read('../App.tsx');
    const pages = /HIDE_SCROLLBAR_PAGES: Route\['page'\]\[\] = \[([^\]]+)\]/.exec(app)?.[1] ?? '';
    expect(pages.split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual(['myday', 'backlog', 'doable', 'agenda', 'group', 'done', 'checkin']);
    expect(app.match(/data-hide-scrollbar=/g)?.length).toBe(2);
  });
  it('打卡页：工具栏和顶部活动图一起 sticky、不透明底，页面上边距挪进固定块', () => {
    expect(ruleHas('.checkin-head-sticky', /position:\s*sticky/)).toBe(true);
    expect(ruleHas('.checkin-head-sticky', /top:\s*0/)).toBe(true);
    expect(ruleHas('.checkin-head-sticky', /background:\s*var\(--bg\)/)).toBe(true);
    expect(ruleHas('.app-mobile .page.checkin-page', /padding-top:\s*0/)).toBe(true);
    const page = read('../pages/CheckIns.tsx');
    const sticky = page.indexOf('checkin-head-sticky');
    expect(sticky).toBeGreaterThan(-1);
    // 工具栏、活动图在固定块里，分区在它后面
    expect(page.indexOf('checkin-toolbar')).toBeGreaterThan(sticky);
    expect(page.indexOf('heatmap-card')).toBeGreaterThan(sticky);
    expect(page.indexOf("tr('今天要打卡')")).toBeGreaterThan(page.indexOf('heatmap-card'));
  });
});
