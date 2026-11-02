import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// 组字测试页单独打包（不带整个 App）：node e2e/ime/run.mjs 会先跑这个
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  define: { __APP_VERSION__: '"test"', __GIT_SHA__: '"test"' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  logLevel: 'warn',
});
