import { useEffect } from 'react';
import { logicalToday, type Store } from '@mindough/core';
import { useNow } from '../store/StoreProvider';

/**
 * 重复的倒数日过了目标日就滚到下一次、给过去那次留记录（Rei 2026-11-12 03:21，core countdown-repeat.ts / Store.rollRecurringCountdowns）。
 * 打开时、换天时、数据变了（本机改了规则或日期、同步拉下来别的设备的改动）以后各看一遍；没有要滚的什么都不写。
 * 严格模式的开关要先告诉 Store（useStrictSync 在前面），严格模式下只滚目标日、不生成记录。
 */
export function useCountdownRoll(store: Store): void {
  const today = logicalToday(useNow(60_000));
  const version = store.version;
  useEffect(() => {
    try {
      store.rollRecurringCountdowns();
    } catch (err) {
      console.warn('[countdown-roll]', err);
    }
  }, [store, today, version]);
}
