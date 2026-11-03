// @vitest-environment node
/**
 * 版本号规则（scripts/app-version.mjs，Rei 2026-11-03）：标签 → 各平台版本；非标签构建 → dev + 短哈希。
 */
import { describe, expect, it } from 'vitest';
import { androidVersionCode, mergePatch, nativeOverlay, parseTag, preNumber, resolveVersion, versionFromEnv } from '../../../../scripts/app-version.mjs';
import { versionLabel } from './version';

const alpha13 = resolveVersion({ tag: 'v0.1.0-alpha.13', sha: '739fb01abc', baseVersion: '0.1.0' });
const release = resolveVersion({ tag: 'v0.2.0', sha: '739fb01', baseVersion: '0.1.0' });
const dev = resolveVersion({ tag: null, sha: '739fb01abc', baseVersion: '0.1.0' });

describe('parseTag', () => {
  it('认 v 前缀、refs/tags/ 前缀和不带 v 的写法', () => {
    expect(parseTag('v0.1.0-alpha.13')).toEqual({ base: '0.1.0', major: 0, minor: 1, patch: 0, pre: 'alpha.13', build: 13 });
    expect(parseTag('refs/tags/v1.2.3')?.base).toBe('1.2.3');
    expect(parseTag('1.2.3-rc.2')?.pre).toBe('rc.2');
    expect(parseTag(' v0.1.0+meta ')?.pre).toBe('');
  });
  it('不是版本的标签返回 null', () => {
    for (const t of ['', null, undefined, 'main', 'v1.2', 'v1.2.3.4', 'release-1']) expect(parseTag(t)).toBeNull();
  });
});

describe('preNumber', () => {
  it('alpha 是序号本身，beta + 300，rc + 600，正式版 999', () => {
    expect(preNumber('alpha.13')).toBe(13);
    expect(preNumber('alpha13')).toBe(13);
    expect(preNumber('beta.2')).toBe(302);
    expect(preNumber('rc.1')).toBe(601);
    expect(preNumber('')).toBe(999);
  });
  it('认不出或越界的是 0', () => {
    expect(preNumber('nightly')).toBe(0);
    expect(preNumber('alpha')).toBe(0);
    expect(preNumber('alpha.0')).toBe(0);
    expect(preNumber('alpha.300')).toBe(0);
    expect(preNumber('rc.399')).toBe(0);
  });
});

describe('resolveVersion', () => {
  it('推标签构建显示标签本身', () => {
    expect(alpha13.display).toBe('v0.1.0-alpha.13');
    expect(alpha13.isTag).toBe(true);
    expect(alpha13.sha).toBe('739fb01');
    expect(release.display).toBe('v0.2.0');
    expect(release.base).toBe('0.2.0');
  });
  it('非标签构建：tauri.conf.json 的版本 + dev + 短哈希；没有哈希就不带', () => {
    expect(dev.display).toBe('v0.1.0-dev+739fb01');
    expect(dev.build).toBe(0);
    expect(resolveVersion({ baseVersion: '0.1.0' }).display).toBe('v0.1.0-dev');
  });
  it('标签认不出时当非标签构建', () => {
    expect(resolveVersion({ tag: 'nightly', sha: 'abc1234', baseVersion: '0.1.0' }).display).toBe('v0.1.0-dev+abc1234');
  });
  it('tauri.conf.json 的版本坏了就报错', () => {
    expect(() => resolveVersion({ baseVersion: 'x' })).toThrow();
  });
});

describe('versionFromEnv', () => {
  it('只在 GITHUB_REF_TYPE=tag 时用标签名', () => {
    const git = () => 'local00';
    expect(versionFromEnv({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.0-alpha.13', GITHUB_SHA: 'aaaaaaabbbb' }, '0.1.0', git).display).toBe('v0.1.0-alpha.13');
    expect(versionFromEnv({ GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main', GITHUB_SHA: 'aaaaaaabbbb' }, '0.1.0', git).display).toBe('v0.1.0-dev+aaaaaaa');
    expect(versionFromEnv({}, '0.1.0', git).display).toBe('v0.1.0-dev+local00');
  });
});

describe('各平台的版本', () => {
  it('macOS：短版本只有数字，CFBundleVersion 填序号 → 「关于」显示 0.1.0 (13)', () => {
    expect(nativeOverlay('macos', alpha13)).toEqual({ version: '0.1.0', bundle: { macOS: { bundleVersion: '13' } } });
    expect(nativeOverlay('macos', dev)).toEqual({ version: '0.1.0', bundle: { macOS: { bundleVersion: '0' } } });
    // 正式版不填 CFBundleVersion（null 在 merge patch 里是删掉）
    expect(nativeOverlay('macos', release)).toEqual({ version: '0.2.0', bundle: { macOS: { bundleVersion: null } } });
  });
  it('iOS 和 macOS 一样', () => {
    expect(nativeOverlay('ios', alpha13)).toEqual({ version: '0.1.0', bundle: { iOS: { bundleVersion: '13' } } });
  });
  it('Windows：msi 只认数字，预发布放第四段', () => {
    expect(nativeOverlay('windows', alpha13)).toEqual({ version: '0.1.0', bundle: { windows: { wix: { version: '0.1.0.13' } } } });
    expect(nativeOverlay('windows', release)).toEqual({ version: '0.2.0', bundle: { windows: { wix: { version: '0.2.0' } } } });
    expect(nativeOverlay('windows', dev)).toEqual({ version: '0.1.0', bundle: { windows: { wix: { version: '0.1.0' } } } });
    const odd = resolveVersion({ tag: 'v0.1.0-nightly', baseVersion: '0.1.0' });
    expect(nativeOverlay('windows', odd)).toEqual({ version: '0.1.0', bundle: { windows: { wix: { version: '0.1.0' } } } });
  });
  it('Linux 只有数字版本', () => {
    expect(nativeOverlay('linux', alpha13)).toEqual({ version: '0.1.0' });
  });
  it('Android：versionName 带预发布标签，versionCode 随 alpha 递增', () => {
    expect(nativeOverlay('android', alpha13)).toEqual({ version: '0.1.0-alpha.13', bundle: { android: { versionCode: 100013 } } });
    expect(nativeOverlay('android', dev)).toEqual({ version: '0.1.0-dev+739fb01', bundle: { android: { versionCode: 100000 } } });
    expect(nativeOverlay('android', release)).toEqual({ version: '0.2.0', bundle: { android: { versionCode: 200999 } } });
  });
  it('versionCode 按 alpha < beta < rc < 正式版 < 下一个版本排', () => {
    const codes = ['v0.1.0-alpha.1', 'v0.1.0-alpha.13', 'v0.1.0-beta.1', 'v0.1.0-rc.1', 'v0.1.0', 'v0.1.1-alpha.1', 'v1.0.0'].map((tag) => androidVersionCode(resolveVersion({ tag, baseVersion: '0.1.0' })));
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
    expect(androidVersionCode(resolveVersion({ tag: 'v209.99.99', baseVersion: '0.1.0' }))).toBeLessThanOrEqual(2_100_000_000);
  });
  it('超出编码范围就报错，不悄悄撞号', () => {
    expect(() => androidVersionCode(resolveVersion({ tag: 'v0.100.0', baseVersion: '0.1.0' }))).toThrow();
    expect(() => androidVersionCode(resolveVersion({ tag: 'v210.0.0', baseVersion: '0.1.0' }))).toThrow();
  });
  it('不认识的平台报错', () => {
    expect(() => nativeOverlay('beos', alpha13)).toThrow();
  });
});

describe('mergePatch', () => {
  it('深合并对象、数组整个换、null 删键', () => {
    const cur = { $schema: 's', app: { windows: [{ a: 1 }] }, bundle: { macOS: { bundleVersion: '12', x: 1 } } };
    expect(mergePatch(cur, { version: '0.1.0', app: { windows: [{ b: 2 }] }, bundle: { macOS: { bundleVersion: null } } })).toEqual({
      $schema: 's',
      version: '0.1.0',
      app: { windows: [{ b: 2 }] },
      bundle: { macOS: { x: 1 } },
    });
    expect(cur.bundle.macOS.bundleVersion).toBe('12');
  });
});

describe('versionLabel', () => {
  it('有完整版本就用它，只有短哈希就显示短哈希', () => {
    expect(versionLabel('v0.1.0-alpha.13', '739fb01')).toBe('v0.1.0-alpha.13');
    expect(versionLabel('', '739fb01')).toBe('739fb01');
    expect(versionLabel('', '')).toBe('');
  });
});
