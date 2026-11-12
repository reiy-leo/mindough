/**
 * 设置 → 关于里的「开源组件」（Rei 2026-11-09 04:02「关于中写上tauri，以及其他的三方库」）。
 * 只列 app 直接带上的运行时依赖：apps/client 和 packages/core 的 package.json dependencies、src-tauri/Cargo.toml 的各个 [dependencies]。
 * 不列开发工具（vite、vitest、typescript…）。同一家的几个包合成一条，packages 写全包名；
 * lib/third-party.test.ts 会核对这里和依赖文件一一对上，加减依赖时要改这里。
 * 许可证照各包 package.json 的 license 字段 / crates.io 上写的；名字是专有名词，不翻译。
 */
export interface ThirdParty {
  name: string;
  license: string;
  url: string;
  /** npm 包名或 Rust crate 名。 */
  packages: string[];
}

export const THIRD_PARTY: ThirdParty[] = [
  { name: 'Tauri', license: 'MIT OR Apache-2.0', url: 'https://tauri.app', packages: ['tauri', '@tauri-apps/api'] },
  {
    name: 'Tauri plugins (os, opener, deep-link, notification, dialog, clipboard-manager, single-instance)',
    license: 'MIT OR Apache-2.0',
    url: 'https://github.com/tauri-apps/plugins-workspace',
    packages: [
      '@tauri-apps/plugin-os',
      '@tauri-apps/plugin-opener',
      '@tauri-apps/plugin-deep-link',
      '@tauri-apps/plugin-notification',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-clipboard-manager',
      'tauri-plugin-os',
      'tauri-plugin-opener',
      'tauri-plugin-deep-link',
      'tauri-plugin-notification',
      'tauri-plugin-dialog',
      'tauri-plugin-clipboard-manager',
      'tauri-plugin-single-instance',
      'tauri-plugin-autostart',
    ],
  },
  { name: 'React', license: 'MIT', url: 'https://react.dev', packages: ['react', 'react-dom'] },
  { name: 'React Aria Components', license: 'Apache-2.0', url: 'https://react-spectrum.adobe.com/react-aria/', packages: ['react-aria-components', '@internationalized/date'] },
  {
    name: 'Tiptap',
    license: 'MIT',
    url: 'https://tiptap.dev',
    packages: [
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/pm',
      '@tiptap/extensions',
      '@tiptap/extension-blockquote',
      '@tiptap/extension-bold',
      '@tiptap/extension-code',
      '@tiptap/extension-code-block',
      '@tiptap/extension-document',
      '@tiptap/extension-hard-break',
      '@tiptap/extension-heading',
      '@tiptap/extension-horizontal-rule',
      '@tiptap/extension-image',
      '@tiptap/extension-italic',
      '@tiptap/extension-list',
      '@tiptap/extension-paragraph',
      '@tiptap/extension-strike',
      '@tiptap/extension-table',
      '@tiptap/extension-text',
    ],
  },
  { name: 'Lucide', license: 'ISC', url: 'https://lucide.dev', packages: ['lucide-react'] },
  { name: 'SQLite Wasm', license: 'Apache-2.0', url: 'https://sqlite.org/wasm', packages: ['@sqlite.org/sqlite-wasm'] },
  { name: 'Turso Database', license: 'MIT', url: 'https://github.com/tursodatabase/turso', packages: ['@tursodatabase/database-wasm'] },
  { name: 'rusqlite', license: 'MIT', url: 'https://github.com/rusqlite/rusqlite', packages: ['rusqlite'] },
  {
    name: 'unified / remark',
    license: 'MIT',
    url: 'https://unifiedjs.com',
    packages: ['unified', 'remark-parse', 'remark-stringify', 'remark-gfm', 'remark-inline-links', 'mdast-util-math', 'micromark-extension-math'],
  },
  { name: 'Marked', license: 'MIT', url: 'https://marked.js.org', packages: ['marked', 'marked-footnote'] },
  { name: 'KaTeX', license: 'MIT', url: 'https://katex.org', packages: ['katex'] },
  { name: 'DOMPurify', license: 'MPL-2.0 OR Apache-2.0', url: 'https://github.com/cure53/DOMPurify', packages: ['dompurify'] },
  { name: 'fflate', license: 'MIT', url: 'https://github.com/101arrowz/fflate', packages: ['fflate'] },
  { name: 'tiny-pinyin', license: 'MIT', url: 'https://github.com/creeperyang/pinyin', packages: ['tiny-pinyin'] },
  { name: 'yaml', license: 'ISC', url: 'https://eemeli.org/yaml/', packages: ['yaml'] },
  { name: 'Serde', license: 'MIT OR Apache-2.0', url: 'https://serde.rs', packages: ['serde', 'serde_json'] },
  { name: 'arboard', license: 'MIT OR Apache-2.0', url: 'https://github.com/1Password/arboard', packages: ['arboard'] },
  { name: 'os_info', license: 'MIT', url: 'https://github.com/stanislav-tkach/os_info', packages: ['os_info'] },
];
