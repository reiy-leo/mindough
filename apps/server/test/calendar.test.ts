import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle, type Env } from '../src/index';
import { handleIcsProxy, icsTarget, rateLimited, resetRateLimit } from '../src/calendar';

const ORIGIN = 'https://app.mindough.rei8t.dev';
const env = (): Env => ({ SESSION_SECRET: 'test-secret-0123456789', ALLOWED_EMAILS: 'reiy.leoz@gmail.com' });
const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261023\r\nSUMMARY:霜降\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const proxy = (target: string, f: typeof fetch, fresh = false) => handleIcsProxy(new URL(`${ORIGIN}/api/calendar/ics?url=${encodeURIComponent(target)}${fresh ? '&fresh=1' : ''}`), f);

afterEach(() => vi.restoreAllMocks());

describe('/api/calendar/ics 代拉农历订阅', () => {
  it('只收公网 http(s) 地址', () => {
    expect(icsTarget('https://calendars.icloud.com/holidays/cn_zh.ics')?.hostname).toBe('calendars.icloud.com');
    expect(icsTarget('webcal://example.com/a.ics')?.protocol).toBe('https:');
    for (const bad of [null, '', 'ftp://x.com/a', 'http://localhost/a', 'http://10.0.0.1/a', 'https://a.internal/x', 'https://u:p@x.com/a', 'nope']) expect(icsTarget(bad)).toBeNull();
  });

  it('不用登录、原样返回日历文本', async () => {
    const f = vi.fn(async () => new Response(ICS, { status: 200 })) as unknown as typeof fetch;
    const res = await proxy('https://example.com/cal.ics', f);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    expect(await res.text()).toBe(ICS);
  });

  it('路由：GET 才行，地址不对 400 请求有误', async () => {
    const r1 = await handle(new Request(`${ORIGIN}/api/calendar/ics`), env());
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as { error: string }).error).toContain('400 请求有误');
    const r2 = await handle(new Request(`${ORIGIN}/api/calendar/ics?url=x`, { method: 'POST' }), env());
    expect(r2.status).toBe(405);
  });

  it('源出错：502 + upstream_status（如 404）', async () => {
    const res = await proxy('https://example.com/gone.ics', (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ upstream_status: 404 });
  });

  it('不是日历：415 不支持的格式', async () => {
    const res = await proxy('https://example.com/page', (async () => new Response('<html></html>')) as unknown as typeof fetch);
    expect(res.status).toBe(415);
  });

  it('太大：413', async () => {
    const res = await proxy('https://example.com/big.ics', (async () => new Response('BEGIN:VCALENDAR' + 'x'.repeat(5 * 1024 * 1024 + 10))) as unknown as typeof fetch);
    expect(res.status).toBe(413);
  });

  it('连不上 502、超时 504', async () => {
    const down = await proxy('https://example.com/a.ics', (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
    expect(down.status).toBe(502);
    const slow = await proxy('https://example.com/a.ics', (async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }) as unknown as typeof fetch);
    expect(slow.status).toBe(504);
  });

  it('缓存：第二次命中；fresh=1 跳过读缓存', async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal('caches', { default: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => void store.set(r.url, res) } });
    const f = vi.fn(async () => new Response(ICS)) as unknown as typeof fetch;
    expect((await proxy('https://example.com/c.ics', f)).headers.get('x-mindough-cache')).toBe('miss');
    expect((await proxy('https://example.com/c.ics', f)).headers.get('x-mindough-cache')).toBe('hit');
    expect((await proxy('https://example.com/c.ics', f, true)).headers.get('x-mindough-cache')).toBe('miss');
    expect(f).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('重定向自己跟：每跳重查，跳到内网就拒，最多 3 跳', async () => {
    const seen: string[] = [];
    const f = (async (u: string) => {
      seen.push(u);
      if (u.endsWith('/a')) return new Response(null, { status: 302, headers: { location: '/b' } });
      if (u.endsWith('/b')) return new Response(null, { status: 301, headers: { location: 'https://cdn.example.org/c.ics' } });
      return new Response(ICS);
    }) as unknown as typeof fetch;
    const ok = await proxy('https://example.com/a', f);
    expect(ok.status).toBe(200);
    expect(seen).toEqual(['https://example.com/a', 'https://example.com/b', 'https://cdn.example.org/c.ics']);
    const bad = await proxy('https://example.com/x', (async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })) as unknown as typeof fetch);
    expect(bad.status).toBe(400);
    const loop = await proxy('https://example.com/loop', (async () => new Response(null, { status: 302, headers: { location: 'https://example.com/loop' } })) as unknown as typeof fetch);
    expect(loop.status).toBe(502);
  });

  it('频率：每分钟 30 次、fresh 6 次，超了 429', async () => {
    resetRateLimit();
    const now = 1_000_000;
    for (let i = 0; i < 6; i++) expect(rateLimited('1.2.3.4', true, now)).toBe(false);
    expect(rateLimited('1.2.3.4', true, now)).toBe(true);
    for (let i = 0; i < 23; i++) expect(rateLimited('1.2.3.4', false, now)).toBe(false);
    expect(rateLimited('1.2.3.4', false, now)).toBe(true);
    expect(rateLimited('5.6.7.8', false, now)).toBe(false);
    expect(rateLimited('1.2.3.4', false, now + 60_000)).toBe(false);
    resetRateLimit();
    const f = (async () => new Response(ICS)) as unknown as typeof fetch;
    for (let i = 0; i < 6; i++) await handleIcsProxy(new URL(`${ORIGIN}/api/calendar/ics?fresh=1&url=${encodeURIComponent('https://example.com/r.ics')}`), f, '9.9.9.9');
    expect((await handleIcsProxy(new URL(`${ORIGIN}/api/calendar/ics?fresh=1&url=${encodeURIComponent('https://example.com/r.ics')}`), f, '9.9.9.9')).status).toBe(429);
    resetRateLimit();
  });

  it('更多内网写法', () => {
    for (const bad of ['http://foo.localhost/a', 'http://nas.lan/a', 'http://router.home.arpa/a', 'http://2130706433/a', 'http://0x7f000001/a', 'http://[::1]/a']) expect(icsTarget(bad)).toBeNull();
  });
});
