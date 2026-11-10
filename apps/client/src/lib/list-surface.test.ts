/**
 * Material 亮色任务列表的底（Rei 2026-11-10「安卓端亮色主题下，任务列表的背景灰蒙蒙的」）：
 * 原来列表用 --surface（#f7f2fa），比页面底 #fef7ff 还深一档，整片发灰。
 * 改成 --list-surface：亮色 #ffffff（M3 surface-container-lowest），暗色等于原来的 --surface（不变）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('../skin/tokens.css');
const skins = read('../skin/skins.css');

/** 选择器正好是 sel 的第一条规则的声明体 */
const ruleBody = (css: string, sel: string) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';
};
const prop = (body: string, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim();

describe('Material 列表底色', () => {
  const light = ruleBody(tokens, "[data-skin='material']");
  const dark = ruleBody(tokens, "[data-skin='material'][data-theme='dark']");

  it('亮色列表是白底，比页面底亮', () => {
    expect(prop(light, '--list-surface')).toBe('#ffffff');
    expect(prop(light, '--bg')).toBe('#fef7ff');
  });

  it('暗色列表底不变（等于暗色 --surface）', () => {
    expect(prop(dark, '--list-surface')).toBe(prop(dark, '--surface'));
  });

  it('任务列表、打卡列表都用 --list-surface', () => {
    const body = ruleBody(skins, "[data-skin='material'] .task-list,\n[data-skin='material'] .habit-list");
    expect(body).toMatch(/--surface:\s*var\(--list-surface\)/);
    expect(body).toMatch(/background:\s*var\(--surface\)/);
  });
});

describe('触屏不留悬停底色', () => {
  const app = read('../styles/app.css');
  it('(hover: none) 下行的 :hover 透明，选中行不受影响', () => {
    const m = /@media \(hover: none\) \{\s*\.task-row:hover:not\(\.is-selected\),\s*\.list-item:hover:not\(\.is-selected\):not\(\[data-drop-target\]\) \{\s*background: transparent;\s*\}\s*\}/.exec(app);
    expect(m).not.toBeNull();
  });
});
