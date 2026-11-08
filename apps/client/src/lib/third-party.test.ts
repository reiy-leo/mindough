/**
 * 「开源组件」列表（lib/third-party.ts，Rei 2026-11-09）和真实依赖一一对上：
 * apps/client、packages/core 的 package.json dependencies（去掉工作区包）+ src-tauri/Cargo.toml 各个 dependencies 段。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THIRD_PARTY } from './third-party';

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const npmDeps = (p: string) => Object.keys((JSON.parse(readFileSync(root(p), 'utf8')) as { dependencies?: Record<string, string> }).dependencies ?? {}).filter((k) => !k.startsWith('@mindough/'));
function cargoDeps(p: string): string[] {
  const out: string[] = [];
  let inDeps = false;
  for (const line of readFileSync(root(p), 'utf8').split('\n')) {
    const head = line.match(/^\s*\[(.+)\]\s*$/);
    if (head) {
      inDeps = /(^|\.)dependencies$/.test(head[1]!.trim());
      continue;
    }
    const m = inDeps && line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
    if (m) out.push(m[1]!);
  }
  return out;
}

describe('THIRD_PARTY', () => {
  it('和依赖文件一一对上', () => {
    const real = new Set([...npmDeps('apps/client/package.json'), ...npmDeps('packages/core/package.json'), ...cargoDeps('apps/client/src-tauri/Cargo.toml')]);
    const listed = THIRD_PARTY.flatMap((e) => e.packages);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...real].filter((d) => !listed.includes(d))).toEqual([]);
    expect(listed.filter((d) => !real.has(d))).toEqual([]);
  });

  it('Tauri 排第一；每条都有许可证和 https 链接', () => {
    expect(THIRD_PARTY[0]!.name).toBe('Tauri');
    for (const e of THIRD_PARTY) {
      expect(e.license).toMatch(/\S/);
      expect(e.url).toMatch(/^https:\/\//);
    }
  });
});
