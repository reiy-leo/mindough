/**
 * 设置窗口只有右边内容区滚（Rei 2026-11-01「设置中打开农历时，侧边栏shift up了」）。
 * 开关、单选的原生 input 是 VisuallyHidden（position: absolute）；祖先没定位时它跑到整页上，
 * 撑高 html，聚焦时把整个窗口滚上去，侧栏顶到红绿灯下面。真排版的检查在 work/shots-tool/settings-shift.mjs。
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const file = existsSync('src/styles/settings.css') ? 'src/styles/settings.css' : 'apps/client/src/styles/settings.css';
const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** 取某个选择器（整条选择器列表要完全一致）的声明块。 */
function rule(selectors: string): string {
  const want = selectors.split(',').map((s) => s.trim()).join(',');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const sel = (m[1] ?? '').split(',').map((s) => s.trim()).join(',');
    if (sel === want) return m[2] ?? '';
  }
  return '';
}

describe('设置窗口：整窗不滚', () => {
  it('html、body、#root 不滚', () => {
    expect(rule('html:has(.settings-window), html:has(.settings-window) body, html:has(.settings-window) #root')).toMatch(/overflow:\s*hidden/);
  });
  it('窗口钉满视口，用 clip 裁（clip 不是滚动容器，聚焦也滚不动它）', () => {
    const r = rule('.settings-window');
    expect(r).toMatch(/position:\s*fixed/);
    expect(r).toMatch(/inset:\s*0/);
    expect(r).toMatch(/overflow:\s*clip/);
    expect(r).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  });
  it('内容区和侧栏都是绝对定位的参照，隐藏的 input 跑不出去', () => {
    expect(rule('.settings-main-scroll')).toMatch(/position:\s*relative/);
    expect(rule('.settings-side')).toMatch(/position:\s*relative/);
  });
});
