// @vitest-environment node
/** 双击「我的一天」同步（lib/tab-sync）：双击判定、能不能发起、结果文案。 */
import { describe, expect, it } from 'vitest';
import { setLocale } from '@mindough/core';
import './i18n';
import { createDoubleTap, DOUBLE_TAP_MS, tapSyncGate, tapSyncResult } from './tab-sync';
import type { AccountState } from './account';
import type { SyncView } from './sync';

setLocale('zh');
const IN: AccountState = { status: 'in', user: { email: 'a@b.c' } as never };
const idle: SyncView = { enabled: true, phase: 'idle', lastSyncedAt: null, error: null, needsLogin: false };

describe('createDoubleTap', () => {
  it('第一下不算，300ms 内第二下算', () => {
    const tap = createDoubleTap();
    expect(tap(1000)).toBe(false);
    expect(tap(1000 + DOUBLE_TAP_MS)).toBe(true);
  });
  it('隔太久不算，从这一下重新计时', () => {
    const tap = createDoubleTap();
    expect(tap(0)).toBe(false);
    expect(tap(301)).toBe(false);
    expect(tap(500)).toBe(true);
  });
  it('连点三下只算一次', () => {
    const tap = createDoubleTap();
    expect([tap(0), tap(100), tap(200)]).toEqual([false, true, false]);
    expect(tap(300)).toBe(true);
  });
  it('时间倒退不算', () => {
    const tap = createDoubleTap();
    tap(1000);
    expect(tap(900)).toBe(false);
  });
});

describe('tapSyncGate', () => {
  it('登录、在线、没在同步 → 可以发起', () => {
    expect(tapSyncGate(IN, idle, true, false)).toBeNull();
  });
  it('正在同步不重复发起', () => {
    expect(tapSyncGate(IN, idle, true, true)?.message).toBe('正在同步…');
    expect(tapSyncGate(IN, { ...idle, phase: 'syncing' }, true, false)?.message).toBe('正在同步…');
  });
  it('离线', () => {
    expect(tapSyncGate(IN, idle, false, false)?.message).toBe('离线，联网后自动同步');
    expect(tapSyncGate({ status: 'offline' }, { enabled: false }, true, false)?.message).toBe('离线，联网后自动同步');
  });
  it('没登录：提示去设置', () => {
    const t = tapSyncGate({ status: 'out' }, { enabled: false }, true, false);
    expect(t).toMatchObject({ message: '还没登录，登录后才能同步', toSettings: true });
  });
  it('服务端不可用：带原因、去设置', () => {
    const t = tapSyncGate({ status: 'unavailable', reason: '服务端返回 503 服务不可用' }, { enabled: false }, true, false);
    expect(t).toMatchObject({ tone: 'error', message: '同步暂不可用：服务端返回 503 服务不可用', toSettings: true });
  });
  it('账户还在连接 / 同步还没起来', () => {
    expect(tapSyncGate({ status: 'loading' }, { enabled: false }, true, false)?.message).toBe('账户还在连接，稍后再试');
    expect(tapSyncGate(IN, { enabled: false }, true, false)?.message).toBe('账户还在连接，稍后再试');
  });
});

describe('tapSyncResult', () => {
  it('成功', () => expect(tapSyncResult(idle)).toEqual({ tone: 'success', message: '已同步' }));
  it('离线', () => expect(tapSyncResult({ ...idle, phase: 'offline' }).message).toBe('离线，联网后自动同步'));
  it('失败带原因，401 去设置', () => {
    const t = tapSyncResult({ ...idle, phase: 'error', error: '登录已过期（401 未登录），重新登录后继续同步', needsLogin: true });
    expect(t).toMatchObject({ tone: 'error', message: '同步失败：登录已过期（401 未登录），重新登录后继续同步', toSettings: true });
    const t2 = tapSyncResult({ ...idle, phase: 'error', error: '502 网关错误：连不上同步数据库。', needsLogin: false });
    expect(t2).toEqual({ tone: 'error', message: '同步失败：502 网关错误：连不上同步数据库', toSettings: undefined });
  });
  it('同步停了（退出登录）', () => expect(tapSyncResult({ enabled: false }).toSettings).toBe(true));
});
