import { describe, expect, it } from 'vitest';
import { externalHref, openMode } from './external';

const ORIGIN = 'tauri://localhost';

describe('外链交给系统浏览器', () => {
  it('别的源的 http(s) 链接算外链', () => {
    expect(externalHref('https://www.imdb.com/title/tt0816692/', ORIGIN)).toBe('https://www.imdb.com/title/tt0816692/');
    expect(externalHref('http://example.com', 'http://tauri.localhost')).toBe('http://example.com/');
  });
  it('mailto / tel 也交给系统', () => {
    expect(externalHref('mailto:a@b.c', ORIGIN)).toBe('mailto:a@b.c');
    expect(externalHref('tel:+6512345678', ORIGIN)).toBe('tel:+6512345678');
  });
  it('站内路由、同源、javascript: 不拦', () => {
    expect(externalHref('#/library', ORIGIN)).toBeNull();
    expect(externalHref('/library', 'http://tauri.localhost')).toBeNull();
    expect(externalHref('http://tauri.localhost/x', 'http://tauri.localhost')).toBeNull();
    expect(externalHref('javascript:alert(1)', ORIGIN)).toBeNull();
    expect(externalHref('', ORIGIN)).toBeNull();
    expect(externalHref(null, ORIGIN)).toBeNull();
  });
});

describe('别的 App 的链接（Rei 2026-11-03「codex:// deeplink 点了没反应」）', () => {
  it('codex:// obsidian:// things:/// 也算外链，原样交出去', () => {
    const url = 'codex://threads/01a14ff8-3846-7242-9697-6c269dceacf2';
    expect(externalHref(url, ORIGIN)).toBe(url);
    expect(externalHref(url, 'https://app.mindough.rei8t.dev')).toBe(url);
    expect(externalHref('obsidian://open?vault=a&file=b', ORIGIN)).toBe('obsidian://open?vault=a&file=b');
    expect(externalHref('things:///add?title=x', ORIGIN)).toBe('things:///add?title=x');
  });
  it('危险的、光有协议的不交', () => {
    for (const u of ['JavaScript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', 'blob:https://a.com/1', 'about:blank', 'codex:'])
      expect(externalHref(u, ORIGIN), u).toBeNull();
  });
  it('打开方式：App 里都交给 opener；Web 端 http(s) 开新标签页，别的协议就地交给浏览器', () => {
    expect(openMode('codex://threads/1', true)).toBe('opener');
    expect(openMode('https://a.com', true)).toBe('opener');
    expect(openMode('https://a.com', false)).toBe('tab');
    expect(openMode('codex://threads/1', false)).toBe('handoff');
    expect(openMode('mailto:a@b.c', false)).toBe('handoff');
  });
});
