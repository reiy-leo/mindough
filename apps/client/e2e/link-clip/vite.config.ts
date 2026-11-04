import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ⌘K 读剪贴板测试页单独打包（不带整个 App）：node e2e/link-clip/run.mjs 会先跑这个
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: '"test"', __GIT_SHA__: '"test"' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  logLevel: 'warn',
});
