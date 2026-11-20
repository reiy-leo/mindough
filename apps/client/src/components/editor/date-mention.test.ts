// @vitest-environment happy-dom
/** @ 插进正文的日期（Rei 2026-11-20 12:08）：存成 [字](__datetime:毫秒)、读写往返、插入、第一行标题、复制、绝对 / 相对显示、只读 Markdown。 */
import { afterEach, describe, expect, it } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { dateMentionFor } from '@mindough/core';
import { createMdEditor, roundTrip, type MdEditorOptions } from './editor';
import { dateMentionView, setDateMentionDisplay } from '../../lib/date-mention';
import { renderMarkdown } from '../../lib/markdown';

const NOW = new Date(2026, 10, 20, 12, 3);
const DT = dateMentionFor('datetime', NOW);
const DAY = dateMentionFor('date', NOW);
const dtMd = `[${DT.label}](__datetime:${DT.ms})`;
const dayMd = `[${DAY.label}](__datetime:${DAY.ms})`;

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const changes: string[] = [];
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: (m) => changes.push(m), ...extra });
  return { h, view: h.view(), root, changes, md: () => h.getMarkdown().trim(), done: () => (h.destroy(), root.remove()) };
};
const nodes = (view: EditorView) => {
  const out: { ms: number; label: string }[] = [];
  view.state.doc.descendants((n) => void (n.type.name === 'dateMention' && out.push({ ms: n.attrs.ms, label: n.attrs.label })));
  return out;
};
const caretEnd = (view: EditorView) => view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));

afterEach(() => setDateMentionDisplay('absolute'));

describe('读写', () => {
  it('[字](__datetime:毫秒) 读成节点，写回一字不差；打开不写回', () => {
    const a = setup(`开会 ${dtMd} 和 ${dayMd}`);
    expect(nodes(a.view)).toEqual([
      { ms: DT.ms, label: '2026-11-20 12:03' },
      { ms: DAY.ms, label: '2026-11-20' },
    ]);
    expect(a.md()).toBe(`开会 ${dtMd} 和 ${dayMd}`);
    expect(a.changes).toEqual([]);
    a.done();
    expect(roundTrip(`**${dtMd}**`).trim()).toBe(`**${dtMd}**`);
  });

  it('不是 __datetime: 整数的链接照旧是链接；不会补 https://', () => {
    const a = setup('[x](__datetime:abc) [y](https://a.com)');
    expect(nodes(a.view)).toEqual([]);
    expect(a.md()).toBe('[x](__datetime:abc) [y](https://a.com)');
    a.done();
  });

  it('粘贴 markdown 里的日期也是节点', () => {
    expect(roundTrip(`- ${dayMd}\n`).trim()).toBe(`- ${dayMd}`);
  });
});

describe('插入', () => {
  it('@ 选中后换成日期胶囊，后面补空格，存成链接', () => {
    const a = setup('交 @tom');
    caretEnd(a.view);
    const to = a.view.state.selection.from;
    const d = dateMentionFor('tomorrow', NOW);
    a.h.insertDate({ from: to - 4, to }, d);
    expect(nodes(a.view)).toEqual([{ ms: d.ms, label: '2026-11-21' }]);
    expect(a.md()).toBe(`交 [2026-11-21](__datetime:${d.ms})`);
    a.done();
  });

  it('任务第一行纯文字标题里插的是文字，不出胶囊；挪到第一行的胶囊变成文字', () => {
    const a = setup('@now', { plainTitle: true });
    caretEnd(a.view);
    a.h.insertDate({ from: 1, to: 5 }, DT);
    expect(nodes(a.view)).toEqual([]);
    expect(a.md()).toBe('2026-11-20 12:03');
    a.done();
    const b = setup(`标题\n\n${dtMd}`, { plainTitle: true });
    b.view.dispatch(b.view.state.tr.delete(0, b.view.state.doc.firstChild!.nodeSize));
    expect(nodes(b.view)).toEqual([]);
    expect(b.view.state.doc.firstChild!.textContent).toBe('2026-11-20 12:03');
    b.done();
  });

  it('复制出去是存着的绝对写法', () => {
    const a = setup(dtMd);
    expect(a.view.state.doc.textBetween(0, a.view.state.doc.content.size, '\n', (n) => n.type.spec.leafText?.(n) ?? '')).toBe('2026-11-20 12:03');
    a.done();
  });
});

describe('显示', () => {
  it('绝对：显示存着的字；悬停是完整时间 + 时区', () => {
    const v = dateMentionView(DT.ms, DT.label, NOW, 'absolute');
    expect(v.text).toBe('2026-11-20 12:03');
    expect(v.title).toMatch(/^2026-11-20 12:03 · UTC/);
  });

  it('相对：今天 / 明天 / 昨天 / N 天前 / N 天后，日期时间带时刻，后面是时区', () => {
    const zone = dateMentionView(DT.ms, DT.label, NOW, 'relative').text.split(' · ')[1]!;
    expect(zone).toMatch(/^UTC/);
    expect(dateMentionView(DT.ms, DT.label, NOW, 'relative').text).toBe(`今天 12:03 · ${zone}`);
    const t = dateMentionFor('tomorrow', NOW);
    expect(dateMentionView(t.ms, t.label, NOW, 'relative').text).toBe(`明天 · ${zone}`);
    const y = dateMentionFor('yesterday', NOW);
    expect(dateMentionView(y.ms, y.label, NOW, 'relative').text).toBe(`昨天 · ${zone}`);
    const ago = new Date(2026, 10, 17).getTime();
    expect(dateMentionView(ago, '2026-11-17', NOW, 'relative').text).toMatch(/^3 天前 · UTC/);
    const later = new Date(2026, 10, 25, 9, 30).getTime();
    expect(dateMentionView(later, '2026-11-25 09:30', NOW, 'relative').text).toMatch(/^5 天后 09:30 · UTC/);
  });

  it('编辑器里的胶囊跟着设置变', () => {
    const a = setup(dayMd);
    const pill = () => a.root.querySelector('.date-mention') as HTMLElement;
    expect(pill().textContent).toBe('2026-11-20');
    setDateMentionDisplay('relative');
    expect(pill().textContent).toMatch(/ · UTC/);
    expect(pill().title).toMatch(/^2026-11-20 · UTC/);
    setDateMentionDisplay('absolute');
    expect(pill().textContent).toBe('2026-11-20');
    a.done();
  });

  it('只读 Markdown：画成日期胶囊的占位，不是链接', () => {
    const html = renderMarkdown(`见 ${dtMd}`);
    expect(html).toContain(`<span class="date-mention" data-date-mention="${DT.ms}" data-label="2026-11-20 12:03">2026-11-20 12:03</span>`);
    expect(html).not.toContain('__datetime');
  });
});
