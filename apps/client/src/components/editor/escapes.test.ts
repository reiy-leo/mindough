// @vitest-environment happy-dom
/**
 * 写出时少转义（Rei 2026-11-03「任务列表中，.会显示成\.」）：draw.io 不再存成 draw\.io。
 * 只在读回来真会变成自动链接时才转义（www. 网址、http(s): 后面跟 /、像邮箱的 @），往返必须不变。
 */
import { describe, expect, it } from 'vitest';
import type { Node as PMNode } from '@tiptap/pm/model';
import { baseSchema, markdownIO, roundTrip } from './editor';

/** 一段纯文字（不带链接）写出去，再读回来。 */
function plain(text: string): { md: string; back: PMNode } {
  const schema = baseSchema();
  const io = markdownIO(schema);
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
  const md = io.serialize(doc);
  return { md, back: io.parse(md) };
}
const hasLink = (doc: PMNode) => {
  let found = false;
  doc.descendants((n) => {
    if (n.marks.some((m) => m.type.name === 'link')) found = true;
  });
  return found;
};

describe('普通的点、冒号、@ 不转义', () => {
  it.each([
    ['draw.io for ChatGPT and Codex', 'draw.io for ChatGPT and Codex\n'],
    ['ww.io gw.x aw.io W.I.P', 'ww.io gw.x aw.io W.I.P\n'],
    ['wwwx.io', 'wwwx.io\n'],
    ['cp:/x ups:/x', 'cp:/x ups:/x\n'],
    ['a@b me@x x@y.', 'a@b me@x x@y.\n'],
  ])('%s', (text, md) => {
    const r = plain(text);
    expect(r.md).toBe(md);
    expect(r.back.textContent).toBe(text);
    expect(hasLink(r.back)).toBe(false);
  });
});

// 注：remark 的 GFM 自动链接是读完后在文字上找网址（转义已经去掉了），所以这几种纯文字读回来本来就会变成链接，
// 改之前也一样；这里只保证还是转义（别的 markdown 阅读器里不变成链接）、文字不变、往返稳定。
describe('读回来会变成自动链接的还是转义', () => {
  it.each(['www.x.com', 'WWW.x', 'see www.a.b', 'https://x.com', 'HTTP://x', 'a@b.com', 'x mail me@a.b.c'])('%s', (text) => {
    const r = plain(text);
    expect(r.md).toContain('\\');
    expect(r.back.textContent).toBe(text);
    // 读回来成了链接后，再往返就不变了
    const once = roundTrip(r.md);
    expect(roundTrip(once)).toBe(once);
  });
});

describe('别的转义照旧', () => {
  it('行首 1. 、* [ < 、反斜杠', () => {
    for (const [text, md] of [
      ['1. 不是列表', '1\\. 不是列表\n'],
      ['x*y', 'x\\*y\n'],
      ['[x] y', '\\[x] y\n'],
      ['foo<bar', 'foo\\<bar\n'],
      ['a\\.b', 'a\\\\.b\n'],
      ['<u>字</u>', '\\<u>字\\</u>\n'],
    ] as const) {
      const r = plain(text);
      expect(r.md).toBe(md);
      expect(r.back.textContent).toBe(text);
    }
  });
});

describe('老数据', () => {
  it('存着的 draw\\.io 读进来是 draw.io，写回去不再带反斜杠', () => {
    expect(roundTrip('draw\\.io for ChatGPT')).toBe('draw.io for ChatGPT\n');
    expect(roundTrip('`a\\.b` c')).toBe('`a\\.b` c\n');
    expect(roundTrip('a\\\\b')).toBe('a\\b\n');
  });
});
