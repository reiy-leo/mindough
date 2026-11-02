/** 中文输入法组字测试页（e2e/ime/run.mjs 打开）：只挂一个编辑器，把 handle 放在 window 上给测试用。 */
import '../../src/skin/tokens.css';
import '../../src/styles/app.css';
import '../../src/styles/editor.css';
import { createMdEditor, type MdEditorHandle } from '../../src/components/editor/editor';

declare global {
  interface Window {
    md: { h: MdEditorHandle | null; changes: string[]; mount(value: string): void };
  }
}

const root = document.getElementById('root')!;
window.md = {
  h: null,
  changes: [],
  mount(value: string) {
    window.md.h?.destroy();
    root.innerHTML = '';
    window.md.changes = [];
    window.md.h = createMdEditor({ root, value, placeholder: '写点什么…', label: '内容', onChange: (m) => window.md.changes.push(m) });
  },
};
