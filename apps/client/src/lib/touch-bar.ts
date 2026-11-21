/**
 * macOS Touch Bar（Rei 2026-11-21「touchbar显示我的一天、日历、侧边栏的项目、打卡、倒数日、日记的图标」；Rust 侧 src-tauri/src/touchbar.rs）。
 * 6 个按钮：我的一天、日历、项目、打卡、倒数日、日记。按钮名和深链 view/{页面} 的名字一样。
 * 每次换页（换语言时整棵界面重新挂载，也会再跑）都把文字和当前页告诉 Rust；点了按钮，Rust 发 `mindough:touchbar`，这里跳页。
 * 只在 macOS 桌面 app 的主窗口做；Web、手机、Windows、Linux、设置窗口什么都不做。
 */
import { useEffect } from 'react';
import { isTauri } from '../store/sqlite-tauri';
import { isAuxWindow } from './windows';
import { navigate, type Route } from './router';
import { tr, trc } from './i18n';

export const TOUCH_BAR_EVENT = 'mindough:touchbar';

export type TouchBarKey = 'myday' | 'calendar' | 'projects' | 'checkin' | 'countdown' | 'journal';

/** 按钮 → 跳去的页面。 */
export const TOUCH_BAR_ROUTES: Record<TouchBarKey, Route> = {
  myday: { page: 'myday' },
  calendar: { page: 'agenda' },
  projects: { page: 'groups' },
  checkin: { page: 'checkin' },
  countdown: { page: 'countdown' },
  journal: { page: 'journal' },
};

/** 当前页对应哪个按钮（高亮它）；项目详情也算「项目」。别的页面不高亮。 */
export function touchBarActive(route: Route): TouchBarKey | null {
  switch (route.page) {
    case 'myday':
      return 'myday';
    case 'agenda':
      return 'calendar';
    case 'groups':
    case 'group':
      return 'projects';
    case 'checkin':
      return 'checkin';
    case 'countdown':
      return 'countdown';
    case 'journal':
      return 'journal';
    default:
      return null;
  }
}

/** 按钮的提示和无障碍文字（和 touchbar.rs 的 TouchBarLabels 一一对应），用侧栏同样的词条。 */
export function touchBarLabels() {
  return {
    myDay: tr('我的一天'),
    calendar: trc('导航', '日历'),
    projects: trc('导航', '项目'),
    checkin: trc('导航', '打卡'),
    countdown: tr('倒数日'),
    journal: tr('日记'),
  };
}

export function isTouchBarKey(v: unknown): v is TouchBarKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TOUCH_BAR_ROUTES, v);
}

export function useTouchBar(route: Route, enabled: boolean) {
  const active = touchBarActive(route);
  // 文字和高亮：进来时和每次换到另一个按钮时告诉 Rust
  useEffect(() => {
    if (!enabled || !isTauri() || isAuxWindow()) return;
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_touch_bar', { labels: touchBarLabels(), active }))
      .catch(() => {});
  }, [enabled, active]);
  // 点了按钮：跳页
  useEffect(() => {
    if (!enabled || !isTauri() || isAuxWindow()) return;
    let dead = false;
    let off: (() => void) | null = null;
    void import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const un = await listen<string>(TOUCH_BAR_EVENT, (e) => {
          if (isTouchBarKey(e.payload)) navigate(TOUCH_BAR_ROUTES[e.payload]);
        });
        if (dead) un();
        else off = un;
      })
      .catch(() => {});
    return () => {
      dead = true;
      off?.();
    };
  }, [enabled]);
}
