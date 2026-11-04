// ⌘K 读剪贴板：什么算一条链接、填进框里是什么样（Rei 2026-11-04）。
import { describe, expect, it } from 'vitest';
import { clipLink, clipTextEnv } from './clip-link';

describe('clipLink：剪贴板文字是不是一条链接', () => {
  it('http(s) 原样收，去掉首尾空白', () => {
    expect(clipLink('https://example.com')).toBe('https://example.com');
    expect(clipLink('  https://example.com/a?b=1#c \n')).toBe('https://example.com/a?b=1#c');
    expect(clipLink('http://localhost:3000/x')).toBe('http://localhost:3000/x');
    expect(clipLink('https://[::1]:8080/')).toBe('https://[::1]:8080/');
    expect(clipLink('HTTPS://Example.com')).toBe('HTTPS://Example.com');
  });
  it('www. 开头补 https://', () => {
    expect(clipLink('www.example.com/x')).toBe('https://www.example.com/x');
    expect(clipLink('WWW.a.cn')).toBe('https://WWW.a.cn');
  });
  it('mailto、tel、别的 App 的链接收', () => {
    expect(clipLink('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(clipLink('tel:+8613800000000')).toBe('tel:+8613800000000');
    expect(clipLink('codex://threads/abc-123')).toBe('codex://threads/abc-123');
    expect(clipLink('obsidian://open?vault=x&file=y')).toBe('obsidian://open?vault=x&file=y');
    expect(clipLink('things:///show?id=today')).toBe('things:///show?id=today');
    expect(clipLink('sms:10086')).toBe('sms:10086');
    expect(clipLink('tel:10086')).toBe('tel:10086');
    expect(clipLink('magnet:?xt=urn:btih:abc')).toBe('magnet:?xt=urn:btih:abc');
  });
  it('挡掉的协议不收', () => {
    for (const s of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'vbscript:x', 'blob:https://a.com/1', 'about:blank', 'chrome://settings', 'tauri://localhost', 'ipc://x']) {
      expect(clipLink(s), s).toBeNull();
    }
  });
  it('一段话、多条链接、带换行的不收', () => {
    expect(clipLink('看看 https://example.com')).toBeNull();
    expect(clipLink('https://a.com https://b.com')).toBeNull();
    expect(clipLink('https://a.com\nhttps://b.com')).toBeNull();
    expect(clipLink('https://a.com\u3000说明')).toBeNull();
    expect(clipLink('https://a.com\tx')).toBeNull();
  });
  it('不像链接的不收', () => {
    for (const s of ['', '   ', 'example.com', 'hello', '备注:内容', 'note:xx', 'localhost:3000', '#/task/1', '/path', 'https://', 'https://nodot', 'https://.a.com', 'https://a..com', 'http:example.com', 'codex://', 'mailto:', 'C:\\Users\\a', '12:30']) {
      expect(clipLink(s), JSON.stringify(s)).toBeNull();
    }
  });
  it('不是字符串、太长的不收', () => {
    expect(clipLink(null)).toBeNull();
    expect(clipLink(undefined)).toBeNull();
    expect(clipLink(`https://a.com/${'x'.repeat(3000)}`)).toBeNull();
  });
});

describe('clipTextEnv：这一端怎么读', () => {
  it('桌面 App 用插件，手机 App 不读，网页有 readText 才读', () => {
    expect(clipTextEnv({ tauri: true, mobileOs: false, readText: false })).toBe('desktop');
    expect(clipTextEnv({ tauri: true, mobileOs: true, readText: true })).toBe('none');
    expect(clipTextEnv({ tauri: false, mobileOs: false, readText: true })).toBe('web');
    expect(clipTextEnv({ tauri: false, mobileOs: true, readText: true })).toBe('web');
    expect(clipTextEnv({ tauri: false, mobileOs: false, readText: false })).toBe('none');
  });
});

describe('填进去的链接保存得了、点得开', () => {
  it('clipLink 收下的，normalizeHref 也收，externalHref 能打开', async () => {
    const { normalizeHref } = await import('../components/editor/editor');
    const { externalHref } = await import('./external');
    for (const s of ['https://example.com', 'www.a.cn/x', 'mailto:a@b.com', 'tel:10086', 'tel:+8613800000000', 'sms:10086', 'codex://threads/1', 'things:///show?id=today', 'magnet:?xt=urn:btih:abc', 'http://localhost:3000/x']) {
      const v = clipLink(s);
      expect(v, s).not.toBeNull();
      expect(normalizeHref(v!), s).toBe(v);
      expect(externalHref(v!, 'https://app.mindough.rei8t.dev'), s).not.toBeNull();
    }
  }, 60_000);
});
