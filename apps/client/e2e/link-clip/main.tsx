/** ⌘K 读剪贴板测试页（e2e/link-clip/run.mjs 打开）：只挂一个 MdEditor，最新的 markdown 放在 window.md 上；记下有没有 ⌘K 冒到 window（全局搜索就是在 window 上听的）。 */
import '../../src/skin/tokens.css';
import '../../src/styles/app.css';
import '../../src/styles/editor.css';
import { createRoot } from 'react-dom/client';
import { MdEditor } from '../../src/components/editor/MdEditor';

declare global {
  interface Window {
    md: string;
    globalK: number;
  }
}
window.md = '';
window.globalK = 0;
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') window.globalK++;
});
const value = new URLSearchParams(location.search).get('md') ?? 'see docs here';
createRoot(document.getElementById('root')!).render(<MdEditor value={value} onChange={(m) => (window.md = m)} label="内容" />);
