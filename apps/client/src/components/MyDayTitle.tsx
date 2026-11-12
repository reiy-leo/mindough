import { formatDateZh, type DateKey } from '@mindough/core';
import { LunarLine } from './LunarLine';
import { tr } from '../lib/i18n';

/**
 * 我的一天的页头文字：今天的日期（formatDateZh，跟界面语言）+ 农历一行（LunarLine，跟农历 / 节假日设置）。
 * 宽屏放在添加框上面（.myday-head），手机放在顶栏左边（lib/topbar-slot TopbarLead，Rei 2026-11-12 09:39
 * 「顶部"我的一天"换成今天的日期（和PC端保持一致）」），两边同一个组件，内容和格式一样，字号各跟各的位置。
 */
export function MyDayTitle({ today }: { today: DateKey }) {
  return (
    <div className="myday-head-text">
      <h1 className="page-title myday-date">
        <span className="sr-only">{tr('我的一天')} · </span>
        {formatDateZh(today)}
      </h1>
      <LunarLine date={today} className="myday-lunar" />
    </div>
  );
}
