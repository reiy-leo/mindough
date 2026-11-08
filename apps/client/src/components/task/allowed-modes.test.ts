// @vitest-environment happy-dom
/** 完成方式锁定（Rei 2026-11-04）+ 打卡能选勾选完成（2026-11-09 01:30）。 */
import { describe, expect, it } from 'vitest';
import { allowedModes, modeDefaults } from './pickers';

describe('allowedModes', () => {
  it('打卡（有重复）：勾选完成、计时、计数互换，倒数日不行', () => {
    expect(allowedModes('count', true)).toEqual(['once', 'timer', 'count']);
    expect(allowedModes('once', true)).toEqual(['once', 'timer', 'count']);
    expect(allowedModes('timer', true)).toEqual(['once', 'timer', 'count']);
  });
  it('没重复的照旧；倒数日只能是倒数日', () => {
    expect(allowedModes('count')).toEqual(['timer', 'count']);
    expect(allowedModes('countdown', true)).toEqual(['countdown']);
  });
  it('换成计数默认目标 2', () => {
    expect(modeDefaults('count', { completion_mode: 'once', target_value: null, unit: null, target_date: null, count_config: null } as never).target_value).toBe(2);
  });
});
