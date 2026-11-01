/**
 * 我的一天的「建议」开关（Rei 2026-11-01「我的一天中的建议，可以toggle on/off」）。
 * 开关存在本机设置 myDaySuggestions（默认开，不同步）。关掉时建议那段不显示，也不去算建议：
 * 算建议（含「刚解锁」）都包在 daySuggestions 里，开关关着就直接给空列表，不调 compute。
 */
import type { Settings } from './settings';

/** 开关开着吗？没存过（老设置）算开。 */
export function suggestionsOn(settings: Pick<Settings, 'myDaySuggestions'>): boolean {
  return settings.myDaySuggestions !== false;
}

/** 开着才算建议；关着返回空列表，compute 一次都不调。 */
export function daySuggestions<T>(on: boolean, compute: () => T[]): T[] {
  return on ? compute() : [];
}
