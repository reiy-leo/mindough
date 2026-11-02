// 中文输入法组字的端到端测试（Rei 2026-11-02「选择任何一个，就立马新建一行新的todo」）。
// 用法（在 apps/client 下）：node e2e/ime/run.mjs        ENGINES=webkit,chromium（默认两个都跑）  CHROME=<chromium 路径>  NOBUILD=1 不重新打包
//
// Playwright 驱动不了真的输入法，所以这里在页面里按 WebKit（Safari / Mac 客户端的 WKWebView）的顺序手动派发事件、改 DOM：
//   组字：keydown(229) → compositionstart → beforeinput(insertCompositionText) → 改字 → compositionupdate → input
//   选词：beforeinput(deleteCompositionText) → 删掉组字的字 → input → beforeinput(insertFromComposition) → 插入选中的词 → input → compositionend
// 删组字的字时照 WebKit 的毛病来（ProseMirror #934）：删完变空、又带 position: relative 的祖先节点（清单项 li、表格格子）一起删掉，
// 选中的词插到删剩下的位置。回车选词再按 WebKit 的顺序补一个 compositionend 之后的 keydown(13, isComposing=false)。
// 检查：选词以后还是原来那一行、只多了选中的词；隔一会儿真按回车才新建下一行。
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
const url = `http://localhost:${server.address().port}/`;

/** 页面里的「假输入法」：按 WebKit 的事件顺序组字、选词。 */
function installIme() {
  const root = () => document.querySelector('.ProseMirror');
  const fire = (type, init) => {
    const t = document.activeElement?.closest?.('.ProseMirror') ?? root();
    let ev;
    if (type.startsWith('composition')) ev = new CompositionEvent(type, { bubbles: true, cancelable: type !== 'compositionend', data: init.data ?? '' });
    else if (type === 'beforeinput' || type === 'input') ev = new InputEvent(type, { bubbles: true, cancelable: type === 'beforeinput', inputType: init.inputType, data: init.data ?? null, isComposing: init.isComposing ?? true });
    else {
      ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: init.key, code: init.code ?? '', isComposing: !!init.isComposing });
      Object.defineProperty(ev, 'keyCode', { get: () => init.keyCode });
      Object.defineProperty(ev, 'which', { get: () => init.keyCode });
    }
    t.dispatchEvent(ev);
    return ev;
  };
  let node = null; // 组字的那个文字节点
  let start = 0; // 组字从 node 的第几个字开始
  let marked = '';
  const caret = (n, off) => {
    const s = getSelection();
    s.removeAllRanges();
    const r = document.createRange();
    r.setStart(n, off);
    r.collapse(true);
    s.addRange(r);
  };
  /** 在光标处放字（WebKit 会顺手去掉占位的 <br>）。 */
  const insertAtCaret = (text) => {
    const s = getSelection();
    const r = s.getRangeAt(0);
    let c = r.startContainer;
    let off = r.startOffset;
    if (c.nodeType === Node.TEXT_NODE) {
      c.insertData(off, text);
      return { node: c, start: off };
    }
    const t = document.createTextNode(text);
    const ref = c.childNodes[off] ?? null;
    c.insertBefore(t, ref);
    // 占位的 <br>（ProseMirror-trailingBreak）：有字了就去掉
    for (const b of [...c.childNodes]) if (b.nodeName === 'BR' && b.classList?.contains('ProseMirror-trailingBreak')) b.remove();
    return { node: t, start: 0 };
  };
  const relative = (el) => el && el.nodeType === 1 && getComputedStyle(el).position === 'relative';
  /** 删空了没有：opts.ignoreSpan 时组字用的空 span 也当没有（测兜底那一层）。 */
  const empty = (el) => [...el.childNodes].every((c) => window.ime.opts.ignoreSpan && c.nodeType === 1 && c.classList.contains('ProseMirror-ime-span'));
  window.ime = {
    /** webkitBug：照 WebKit 的毛病删空了的 relative 祖先；ignoreSpan：连 span 一起当空的。 */
    opts: { webkitBug: true, ignoreSpan: false },
    /** 打一个拼音字母（组字中）。 */
    type(ch) {
      const first = !node;
      fire('keydown', { key: ch, keyCode: 229, isComposing: !first });
      if (first) fire('compositionstart', { data: '' });
      const next = marked + ch;
      fire('beforeinput', { inputType: 'insertCompositionText', data: next });
      if (first) {
        const at = insertAtCaret(next);
        node = at.node;
        start = at.start;
      } else node.replaceData(start, marked.length, next);
      marked = next;
      caret(node, start + marked.length);
      fire('compositionupdate', { data: marked });
      fire('input', { inputType: 'insertCompositionText', data: marked });
      fire('keyup', { key: ch, keyCode: 229, isComposing: true });
    },
    /** 选词：how = digit | space | click | enter。 */
    commit(text, how) {
      if (how === 'digit') fire('keydown', { key: '1', code: 'Digit1', keyCode: 229, isComposing: true });
      if (how === 'space') fire('keydown', { key: ' ', code: 'Space', keyCode: 229, isComposing: true });
      if (how === 'enter') fire('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true });
      // 删组字的字
      fire('beforeinput', { inputType: 'deleteCompositionText', data: null });
      let parent = node.parentNode;
      let index = [...parent.childNodes].indexOf(node);
      node.replaceData(start, marked.length, '');
      if (!node.data.length && window.ime.opts.webkitBug) {
        node.remove();
        // WebKit 的毛病：删空了的、带 position: relative（或在 relative 的父节点里）的祖先一起删
        let el = parent;
        while (el && el !== root() && empty(el) && (relative(el) || relative(el.parentElement))) {
          const up = el.parentNode;
          index = [...up.childNodes].indexOf(el);
          el.remove();
          el = up;
        }
        parent = el;
        const s = getSelection();
        s.removeAllRanges();
        const r = document.createRange();
        r.setStart(parent, Math.max(0, index));
        r.collapse(true);
        s.addRange(r);
      } else caret(node, start);
      fire('input', { inputType: 'deleteCompositionText', data: null });
      fire('beforeinput', { inputType: 'insertFromComposition', data: text });
      const at = insertAtCaret(text);
      caret(at.node, at.start + text.length);
      fire('input', { inputType: 'insertFromComposition', data: text });
      fire('compositionend', { data: text });
      // WebKit：回车选词先 compositionend，再来一个不算组字的回车
      if (how === 'enter') fire('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, isComposing: false });
      fire('keyup', { key: how === 'enter' ? 'Enter' : how === 'space' ? ' ' : '1', keyCode: 229, isComposing: false });
      node = null;
      marked = '';
    },
  };
}

// 应得的结果：在同一个位置直接插入「如何」（不经过输入法）
const cases = [
  // name、原文、先按一次回车建一行空的、opts：force = 给清单项强加 position: relative（看 span 那层）、ignoreSpan（看兜底那层）
  { name: '空清单项', md: '- [ ] 第一条', newLine: true },
  { name: '空清单项（强加 relative，靠 span）', md: '- [ ] 第一条', newLine: true, force: true },
  { name: '空清单项（强加 relative、span 也被删，靠兜底）', md: '- [ ] 第一条', newLine: true, force: true, ignoreSpan: true },
  { name: '有字的清单项末尾', md: '- [ ] 第一条', newLine: false },
  { name: '空的普通列表项', md: '- 第一条', newLine: true },
  { name: '空表格格子', md: '| 甲 | 乙 |\n| --- | --- |\n| 丙 |  |', newLine: false },
  { name: '空表格格子（span 也被删，靠兜底）', md: '| 甲 | 乙 |\n| --- | --- |\n| 丙 |  |', newLine: false, ignoreSpan: true },
  { name: '普通段落', md: '第一段', newLine: false },
  { name: '空文档', md: '', newLine: false },
];
const hows = ['digit', 'space', 'click', 'enter'];
const engines = (process.env.ENGINES || 'webkit,chromium').split(',');

let fails = 0;
const norm = (s) => s.replace(/\s+$/g, '').replace(/\n\n/g, '\n');
for (const engine of engines) {
  const browser = await pw[engine].launch(engine === 'chromium' && process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const page = await browser.newPage({ locale: 'zh-CN' });
  page.on('pageerror', (e) => console.log('ERR', engine, e.message));
  await page.goto(url);
  await page.waitForFunction(() => !!window.md);
  await page.evaluate(installIme);
  const prepare = async (c) => {
    await page.evaluate((md) => window.md.mount(md), c.md);
    await page.evaluate((force) => {
      document.getElementById('force-rel')?.remove();
      if (!force) return;
      const st = document.createElement('style');
      st.id = 'force-rel';
      st.textContent = ".md-editor-content li[data-item-type='task'] { position: relative !important; }";
      document.head.appendChild(st);
    }, !!c.force);
    await page.click('.ProseMirror');
    await page.evaluate(() => window.md.h.editor.commands.focus('end'));
    if (c.newLine) await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
  };
  for (const c of cases)
    for (const how of hows) {
      const tag = `${engine} ${c.name} ${how}`;
      // 应得的结果
      await prepare(c);
      await page.evaluate(() => window.md.h.editor.commands.insertContent('如何'));
      c.want = norm(await page.evaluate(() => window.md.h.getMarkdown()));
      await prepare(c);
      // Chromium 没有 WebKit 那个删节点的毛病：只按普通的组字走（看有没有改坏 Chrome）
      await page.evaluate((o) => Object.assign(window.ime.opts, o), { webkitBug: engine === 'webkit', ignoreSpan: !!c.ignoreSpan });
      for (const ch of "ru'he") {
        await page.evaluate((ch) => window.ime.type(ch), ch);
        await page.waitForTimeout(15);
      }
      if (engine === 'webkit' && c.name === '空清单项' && how === 'digit') {
        const spans = await page.evaluate(() => document.querySelectorAll('.ProseMirror .ProseMirror-ime-span').length);
        if (spans !== 1) fails++;
        console.log(spans === 1 ? 'ok  ' : 'FAIL', `${engine} 组字中光标处有 span`, spans === 1 ? '' : `→ ${spans} 个`);
      }
      await page.evaluate((how) => window.ime.commit('如何', how), how);
      await page.waitForTimeout(250);
      const got = norm(await page.evaluate(() => window.md.h.getMarkdown()));
      const ok = got === c.want;
      if (!ok) fails++;
      console.log(ok ? 'ok  ' : 'FAIL', tag, ok ? '' : `→ ${JSON.stringify(got)}（应为 ${JSON.stringify(c.want)}）`);
      // 隔一会儿真按回车：照常新建下一行（只查清单那条）
      if ((c.name === '有字的清单项末尾' || c.name === '空清单项') && how === 'digit') {
        await page.waitForTimeout(600);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
        const n = await page.evaluate(() => window.md.h.view().dom.querySelectorAll('li[data-item-type="task"]').length);
        const ok2 = n === (c.newLine ? 3 : 2);
        if (!ok2) fails++;
        console.log(ok2 ? 'ok  ' : 'FAIL', `${engine} 选词以后真按回车新建一行`, ok2 ? '' : `→ ${n} 项`);
      }
    }
  await browser.close();
}
server.close();
console.log(fails ? `${fails} 项没过` : '全部通过');
process.exit(fails ? 1 : 0);
