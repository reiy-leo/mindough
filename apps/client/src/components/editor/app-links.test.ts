// @vitest-environment happy-dom
/**
 * 编辑器里别的 App 的链接（Rei 2026-11-03「codex://threads/… 这种 deeplink 点了没反应」）：
 * 读入时裸的 scheme://… 变成链接；手打 <…>、裸写加空格变成链接；链接框收这些地址；危险协议不收。
 */
import { describe, expect, it } from 'vitest';
import type { EditorView } from '@tiptap/pm/view';
import { createMdEditor, normalizeHref, roundTrip } from './editor';

const URL1 = 'codex://threads/01a14ff8-3846-7242-9697-6c269dceacf2';

const setup = (md: string) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const opened: string[] = [];
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: () => {}, onLinkOpen: (u) => void opened.push(u) });
  return {
    h,
    view: h.view(),
    root,
    opened,
    done: () => {
      h.destroy();
      root.remove();
    },
  };
};
const type = (view: EditorView, text: string) => {
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
};
const hrefs = (view: EditorView) => {
  const out: string[] = [];
  view.state.doc.descendants((n) => {
    for (const m of n.marks) if (m.type.name === 'link') out.push(String(m.attrs.href));
  });
  return out;
};

describe('读入 / 写出', () => {
  it('裸的 codex:// 读成链接，写回 <codex://…>；链接、尖括号写法不变', () => {
    expect(roundTrip(`看 ${URL1} 吧`)).toBe(`看 <${URL1}> 吧\n`);
    expect(roundTrip(`<${URL1}>`)).toBe(`<${URL1}>\n`);
    expect(roundTrip(`[线程](${URL1})`)).toBe(`[线程](${URL1})\n`);
    expect(roundTrip('打开 obsidian://open?vault=a。')).toBe('打开 <obsidian://open?vault=a>。\n');
  });
  it('代码里、危险协议、普通冒号不变链接', () => {
    expect(roundTrip('`codex://a/b`')).toBe('`codex://a/b`\n');
    expect(roundTrip('javascript://x')).toBe('javascript://x\n');
    expect(roundTrip('file:///etc/passwd')).toBe('file:///etc/passwd\n');
    expect(roundTrip('备注:内容')).toBe('备注:内容\n');
  });
  it('点一下链接交给 onLinkOpen，地址原样', () => {
    const { root, opened, done } = setup(`看 ${URL1} 吧`);
    const a = root.querySelector('a')!;
    expect(a.getAttribute('href')).toBe(URL1);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(opened).toEqual([URL1]);
    done();
  });
  it('危险协议的链接画出来没有 href', () => {
    const { root, done } = setup('[a](javascript:alert(1)) [b](file:///etc/passwd)');
    for (const a of root.querySelectorAll('a')) expect(a.getAttribute('href') ?? '').toBe('');
    done();
  });
});

describe('手打', () => {
  it('<codex://…> 打完 > 变成链接', () => {
    const { view, done } = setup('');
    type(view, `<${URL1}>`);
    expect(hrefs(view)).toContain(URL1);
    expect(view.state.doc.textContent).toBe(URL1);
    done();
  });
  it('裸写 codex://… 加空格变成链接；javascript:// 不变', () => {
    const { view, done } = setup('');
    type(view, `看 ${URL1} `);
    expect(hrefs(view)).toContain(URL1);
    done();
    const b = setup('');
    type(b.view, 'javascript://x ');
    type(b.view, '<file:///etc/passwd>');
    expect(hrefs(b.view)).toEqual([]);
    b.done();
  });
});

describe('链接框里的地址', () => {
  it('别的 App 的链接照原样收', () => {
    expect(normalizeHref(URL1)).toBe(URL1);
    expect(normalizeHref('things:///add?title=x')).toBe('things:///add?title=x');
    expect(normalizeHref('vscode://file/a b')).toBe('vscode://file/a%20b');
    expect(normalizeHref('a.com:8080')).toBe('https://a.com:8080');
    expect(normalizeHref('localhost:3000/x')).toBe('https://localhost:3000/x');
  });
  it('危险协议、光有协议的不收', () => {
    for (const bad of ['codex:', 'codex://', 'file:///etc/passwd', 'blob:x', ' JavaScript:alert(1)', 'about:blank']) expect(normalizeHref(bad), bad).toBeNull();
  });
});
