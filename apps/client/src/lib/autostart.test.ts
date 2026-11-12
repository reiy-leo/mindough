import { describe, expect, it } from 'vitest';
import { autostartSupported } from './autostart';

describe('开机时启动只在桌面 App 显示', () => {
  it('Tauri macOS / Windows 显示', () => {
    expect(autostartSupported('macos', true)).toBe(true);
    expect(autostartSupported('windows', true)).toBe(true);
  });
  it('网页、安卓、iOS、Linux 不显示', () => {
    expect(autostartSupported('macos', false)).toBe(false);
    expect(autostartSupported('windows', false)).toBe(false);
    expect(autostartSupported('android', true)).toBe(false);
    expect(autostartSupported('ios', true)).toBe(false);
    expect(autostartSupported('linux', true)).toBe(false);
  });
});
