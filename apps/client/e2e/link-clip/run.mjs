// ⌘K 加链接读剪贴板的端到端测试（Rei 2026-11-04「选中文本后，cmd+k后自动添加剪贴板中的链接到链接input中」）。
// 用法（在 apps/client 下）：node e2e/link-clip/run.mjs     ENGINES=chromium,webkit（默认只跑 chromium）  CHROME=<chromium 路径>  NOBUILD=1 不重新打包
//
// chromium：给页面 clipboard-read / clipboard-write 权限，复制 https://example.com，双击选中「docs」按 ⌘K（Linux 上是 Ctrl+K），
//   「链接」一栏应是 https://example.com 且全选，回车后正文变成 [docs](https://example.com)；⌘K 不冒到 window（不开全局搜索）。
//   再测：剪贴板是一段话 → 留空；已有链接 → 保留原网址。
// webkit（有的话）：给不了 clipboard-read 权限，只看 ⌘K 照样开框、不卡住。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
if (!process.env.NOBUILD) {
  const { build } = await import('vite');
  await build({ configFile: path.join(here, 'vite.config.ts') });
}
const pw = await import(process.env.PW_MODULE || 'playwright-core');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`);
  if (!ok) fail++;
};

async function open(page, md) {
  await page.goto(`${base}?md=${encodeURIComponent(md)}`);
  await page.waitForSelector('.ProseMirror');
}
async function cmdK(page, word, clip) {
  if (clip !== undefined) await page.evaluate((t) => navigator.clipboard.writeText(t), clip);
  await page.locator('.ProseMirror').getByText(word, { exact: false }).first().dblclick();
  await page.keyboard.press('ControlOrMeta+k');
  await page.waitForSelector('.md-link-dialog');
  await page.waitForTimeout(400);
  return page.locator('.md-link-dialog input').nth(1);
}

const engines = (process.env.ENGINES || 'chromium').split(',');
for (const engine of engines) {
  const browser = await pw[engine].launch(engine === 'chromium' && process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  if (engine === 'chromium') {
    const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    await open(page, 'see docs here');
    const href = await cmdK(page, 'docs', 'https://example.com');
    const v = await href.inputValue();
    check('chromium：剪贴板链接填进「链接」', v === 'https://example.com', JSON.stringify(v));
    const sel = await href.evaluate((el) => [el.selectionStart, el.selectionEnd, document.activeElement === el]);
    check('chromium：焦点在「链接」且全选', sel[2] && sel[0] === 0 && sel[1] === v.length, JSON.stringify(sel));
    check('chromium：⌘K 没冒到 window（不开全局搜索）', (await page.evaluate(() => window.globalK)) === 0);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const md = await page.evaluate(() => window.md);
    check('chromium：回车生成链接', md.includes('[docs](https://example.com)'), JSON.stringify(md));
    check('chromium：正文里是 <a href>', (await page.locator('.ProseMirror a[href="https://example.com"]').count()) === 1);

    await open(page, 'see docs here');
    const h2 = await cmdK(page, 'docs', '看看 https://example.com 这个');
    check('chromium：剪贴板是一段话 → 留空', (await h2.inputValue()) === '');
    await page.keyboard.press('Escape');

    await open(page, 'see docs here');
    const h4 = await cmdK(page, 'docs', 'javascript:alert(1)');
    check('chromium：javascript: → 留空', (await h4.inputValue()) === '');

    await open(page, 'see [docs](https://a.com/x) here');
    const h3 = await cmdK(page, 'docs', 'https://other.com');
    check('chromium：已有链接 → 保留原网址', (await h3.inputValue()) === 'https://a.com/x', JSON.stringify(await h3.inputValue()));

    await open(page, 'see docs here');
    const h5 = await cmdK(page, 'docs', 'www.example.org/a');
    check('chromium：www. 补 https://', (await h5.inputValue()) === 'https://www.example.org/a');
    await page.screenshot({ path: process.env.SHOT || '/tmp/link-clip-chromium.png' });
    await ctx.close();
  } else {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await open(page, 'see docs here');
    const t0 = Date.now();
    const href = await cmdK(page, 'docs');
    check(`${engine}：没授权也照样开框、不卡`, (await page.locator('.md-link-dialog').count()) === 1 && Date.now() - t0 < 5000, JSON.stringify(await href.inputValue()));
    await ctx.close();
  }
  await browser.close();
}
server.close();
console.log(fail ? `${fail} 项失败` : '全部通过');
process.exit(fail ? 1 : 0);
