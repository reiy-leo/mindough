import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsProvider } from './lib/settings';
import { StoreProvider } from './store/StoreProvider';
import { UiProvider } from './lib/ui';
import { App, Toasts } from './App';
import { isAuxWindow, isSettingsWindow } from './lib/windows';
import { installCrossWindow } from './lib/cross-window';
import { SettingsWindow } from './pages/Settings';
import { initLoginError, startAccountWatch } from './lib/account';
import { registerServiceWorker } from './lib/reminders';
import { initNativeLogin } from './lib/native-login';
import { installExternalLinks } from './lib/external';
import { installContextMenuBlock } from './lib/contextmenu';
import { installLongPressGuard } from './lib/long-press';
import { installSelectAllGuard } from './lib/no-select';
import { installNoLinkDrag } from './lib/no-link-drag';
import { installRootScrollGuard } from './lib/root-scroll';
import { installBackspaceGuard } from './lib/backspace-guard';
import { installBackLayers } from './lib/back-layers';
import { installAndroidBackground } from './lib/android-bg';
import { applyLocalePref, initialLocalePref, loadLocale, resolveLocale } from './lib/i18n';
import { LocaleRoot } from './lib/locale';
import { preloadMdEditor } from './components/editor/LazyMdEditor';
import './skin/tokens.css';
import './styles/app.css';
import './styles/task.css';
import './styles/library.css';
import './styles/types.css';
import './styles/lookup.css';
import './styles/editor.css';
import './styles/journal.css';
import './styles/attachments.css';
import './styles/lunar.css';
import './styles/prop-chips.css';
import './styles/settings.css';
import './styles/project.css';
import './styles/multi-type.css';
import './skin/skins.css';
import './styles/vibrancy.css';
import './styles/color-level.css';

// 登录失败回跳带的 ?login_error：先取出并从地址栏去掉，再渲染
initLoginError();
// 账户状态（同步跟着它开 / 停）；原生端监听登录回调的 deep link
// 设置窗口不跑同步、不接登录回调（都交给主窗口）
const settingsWin = isSettingsWindow();
if (!isAuxWindow()) {
  registerServiceWorker();
  void initNativeLogin();
}
// 窗口之间：账户、同步状态、提醒开关（Tauri 桌面，见 lib/cross-window.ts）
installCrossWindow();
// App 里的外链交给系统浏览器
installExternalLinks();
// 浏览器 / WebView 自带的右键菜单不出（能打字的地方除外）
installContextMenuBlock();
// 手指长按出菜单：记下滚动和手指，滑列表时不误开（Rei 2026-11-05）
installLongPressGuard();
// 界面文字不能选：⌘A 不在输入框里时不选整页（样式在 app.css 开头）
installSelectAllGuard();
installNoLinkDrag();
// 整页不滚：外层万一被滚动了就复位（桌面布局才管，手机软键盘要滚整页）
installRootScrollGuard();
// 退格不返回上一页：WebKit 默认在不能打字的地方按退格就 history.back()（Rei 2026-11-08，lib/backspace-guard.ts）
installBackspaceGuard();
// 系统返回 / 返回手势先关弹窗、菜单，没有弹层时才照原来退页面（Rei 2026-11-10，lib/back-layers.ts）
installBackLayers();
// 安卓 App：界面底色告诉原生，WebView 和窗口后面那几层跟着换（选字变黑的兜底，lib/android-bg.ts、scripts/android-webview.sh）
installAndroidBackground();

// 编辑器在空闲时先加载好：新建面板一打开就能写
const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500));
idle(preloadMdEditor);

// 界面语言：先按本机记的（或 ?lang=）加载好词典、切好，演示数据、第一屏都用这个语言；登录同步后以同步的设置为准
const pref = initialLocalePref();
void loadLocale(resolveLocale(pref))
  .catch(() => {})
  .then(() => {
    applyLocalePref(pref);
    // 账户状态里有给人看的说明（「同步服务尚未上线」），要等词典好了再查，不然德语界面里冒出中文
    startAccountWatch();
    render();
  });

function render() {
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <StoreProvider>
        <LocaleRoot>
          <UiProvider>
            {settingsWin ? (
              <>
                <SettingsWindow />
                <Toasts />
              </>
            ) : (
              <App />
            )}
          </UiProvider>
        </LocaleRoot>
      </StoreProvider>
    </SettingsProvider>
  </StrictMode>,
);
}
