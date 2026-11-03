import { describe, expect, it } from 'vitest';
import { BLOCKED_SCHEMES, findBareAppLinks, hasSchemeBody, isAppSchemeHref, isBlockedHref, SANITIZE_URI_RE, schemeOf } from './link-scheme';

describe('链接协议', () => {
  it('认出协议；主机加端口、盘符、相对地址不算', () => {
    expect(schemeOf('codex://threads/1')).toBe('codex');
    expect(schemeOf('Obsidian://open?vault=a')).toBe('obsidian');
    expect(schemeOf('x-callback-url://a')).toBe('x-callback-url');
    expect(schemeOf('mailto:a@b.c')).toBe('mailto');
    expect(schemeOf('a.com:8080/x')).toBeNull();
    expect(schemeOf('localhost:3000')).toBeNull();
    expect(schemeOf('C:\\Users')).toBeNull();
    expect(schemeOf('#/task/1')).toBeNull();
    expect(schemeOf('/a/b')).toBeNull();
    expect(schemeOf('')).toBeNull();
  });
  it('别的 App 的链接放行：codex obsidian vscode things zotero mailto tel', () => {
    for (const u of ['codex://threads/01a14ff8-3846-7242-9697-6c269dceacf2', 'obsidian://open?vault=a', 'vscode://file/a', 'things:///add?title=x', 'zotero://select/items/1', 'mailto:a@b.c', 'tel:+861234', 'mindough://task/1'])
      expect(isAppSchemeHref(u), u).toBe(true);
    for (const u of ['https://a.com', 'http://a.com', 'example.com', '#/x']) expect(isAppSchemeHref(u), u).toBe(false);
  });
  it('危险的协议挡掉：大小写、空白、夹的控制字符都不行', () => {
    for (const u of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\nscript:alert(1)', 'java\tscript:x', 'vbscript:x', 'data:text/html,x', 'file:///etc/passwd', 'blob:https://a.com/1', 'about:blank', 'view-source:https://a.com', 'chrome-extension://x', 'tauri://localhost', 'asset://x', 'ipc://x'])
      expect(isBlockedHref(u), JSON.stringify(u)).toBe(true);
    for (const u of ['javascript:x', 'data:x', 'file:///a']) expect(isAppSchemeHref(u)).toBe(false);
    expect(isBlockedHref('codex://a')).toBe(false);
    expect(isBlockedHref('https://a.com/javascript:x')).toBe(false);
    expect(BLOCKED_SCHEMES.has('javascript')).toBe(true);
  });
  it('协议后面得有东西', () => {
    expect(hasSchemeBody('codex:')).toBe(false);
    expect(hasSchemeBody('codex://a')).toBe(true);
  });
  it('正文里找裸的 App 链接：去掉末尾标点；http(s)、挡掉的、粘在字后面的不算', () => {
    const url = 'codex://threads/01a14ff8-3846-7242-9697-6c269dceacf2';
    expect(findBareAppLinks(`看 ${url}，然后`)).toEqual([{ start: 2, end: 2 + url.length, url }]);
    expect(findBareAppLinks('(obsidian://open?vault=a)').map((h) => h.url)).toEqual(['obsidian://open?vault=a']);
    expect(findBareAppLinks('a https://a.com b')).toEqual([]);
    expect(findBareAppLinks('javascript://x file:///etc/passwd')).toEqual([]);
    expect(findBareAppLinks('a_codex://a')).toEqual([]);
    expect(findBareAppLinks('看codex://a').map((h) => h.url)).toEqual(['codex://a']);
    expect(findBareAppLinks('codex://')).toEqual([]);
    expect(findBareAppLinks('备注:内容 note:x')).toEqual([]);
  });
  it('DOMPurify 的地址规则：放行 App 链接和老的几种，挡危险的', () => {
    for (const u of ['https://a.com', 'mailto:a@b.c', 'tel:1', 'codex://threads/1', 'things:///add', '#/x', '/a', 'a.png']) expect(SANITIZE_URI_RE.test(u), u).toBe(true);
    for (const u of ['javascript:alert(1)', 'vbscript:x', 'data:text/html,x', 'file:///etc/passwd', 'blob:x', 'tauri://localhost']) expect(SANITIZE_URI_RE.test(u), u).toBe(false);
  });
});
