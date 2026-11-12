/**
 * 项目里的任务自动进我的一天（Rei 2026-11-02「直接出现在我的一天，而不是出现在的建议里」）。
 * 挂在 App 上：数据一变、换了一天，就让 core 的 store.syncAutoMyDay 补一遍；没东西要加时它什么都不写，所以不会来回触发。
 * 不看「显示建议」开关（这不是建议）。项目关了「出现在我的一天」的不加，见 group.my_day_auto。
 */
import { useEffect } from 'react';
import { logicalToday, type Store } from '@mindough/core';
import { useNow } from '../store/StoreProvider';

export function useAutoMyDay(store: Store): void {
  const today = logicalToday(useNow(60_000));
  const version = store.version;
  useEffect(() => {
    store.syncAutoMyDay(today);
  }, [store, today, version]);
}
