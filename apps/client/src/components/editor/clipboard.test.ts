// @vitest-environment happy-dom
/**
 * 编辑器复制只给纯文字（Rei 2026-11-05「任务编辑器中的复制，不要带样式或者markdown标记」，
 * 同日改定「应用内复制粘贴也只要纯文本」）。走真的 copy / cut / paste 事件。
 * 折叠块（Rei 2026-11-05 早些时候）：复制出去不带 <details> / <summary>。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { createMdEditor } from './editor';
import { forgetCopied, isOwnCopy, plainTextOf, unwrapOpenDetails } from './clipboard';

const setup = (md: string, extra: Record<string, unknown> = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: () => {}, ...extra });
  const view = h.view();
  return { h, view, done: () => (h.destroy(), root.remove()) };
};

afterEach(() => forgetCopied());

/** 在文档里找某段文字的位置（文字开头）。 */
const posOf = (view: EditorView, text: string): number => {
  let at = -1;
  view.state.doc.descendants((n, pos) => {
    if (at >= 0) return false;
    if (n.isText && n.text!.includes(text)) at = pos + n.text!.indexOf(text);
    return true;
  });
  if (at < 0) throw new Error(`找不到「${text}」`);
  return at;
};

/** 发一个 copy / cut 事件，拿回剪贴板里写了什么。 */
const fire = (view: EditorView, type: 'copy' | 'cut' = 'copy') => {
  const data: Record<string, string> = {};
  const dt = {
    clearData: (t?: string) => {
      for (const k of Object.keys(data)) if (!t || k === t) delete data[k];
    },
    setData: (t: string, v: string) => {
      data[t] = v;
    },
    getData: (t: string) => data[t] ?? '',
  };
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: dt });
  view.dom.dispatchEvent(ev);
  return { text: data['text/plain'] ?? '', types: Object.keys(data), prevented: ev.defaultPrevented };
};
const copy = (view: EditorView) => fire(view).text;

/** 发 paste 事件。 */
const paste = (view: EditorView, data: Record<string, string>) => {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: { getData: (t: string) => data[t] ?? '', files: [], types: Object.keys(data), items: [] } });
  view.dom.dispatchEvent(ev);
};

const select = (view: EditorView, from: number, to: number) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
const selectAll = (view: EditorView) => view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
/** 全选复制。 */
const copyAll = (md: string) => {
  const { view, done } = setup(md);
  selectAll(view);
  const r = fire(view);
  done();
  return r;
};

const noTags = (s: string) => expect(s).not.toMatch(/<\/?(details|summary)\b/i);

describe('剪贴板里只有纯文字', () => {
  it('只写 text/plain，不写 text/html、不写自定义类型', () => {
    const r = copyAll('# 标题\n\n**粗** 段落');
    expect(r.types).toEqual(['text/plain']);
    expect(r.prevented).toBe(true);
  });

  it.each([
    ['标题', '# 一级\n\n### 三级', '一级\n三级'],
    ['粗体 / 斜体 / 删除线 / 行内代码', '**粗** *斜* _也斜_ ~~删~~ `码`', '粗 斜 也斜 删 码'],
    ['下划线三种', '<u>下</u> <u class="wavy">波</u> <u class="double">双</u>', '下 波 双'],
    ['无序列表', '- 一\n- 二', '一\n二'],
    ['有序列表：编号也去掉', '1. 第一\n2. 第二\n3. 第三', '第一\n第二\n第三'],
    ['清单：不带勾选框', '- [ ] 没做\n- [x] 做完', '没做\n做完'],
    ['套着的列表', '- 外\n  - 内\n    1. 更里', '外\n内\n更里'],
    ['引用', '> 引用的话\n>\n> 第二段', '引用的话\n第二段'],
    ['提示块', '> [!NOTE]\n> 注意这个', '注意这个'],
    ['链接只留文字', '看 [文档](https://a.com) 吧', '看 文档 吧'],
    ['文字和网址一样就是网址', '<https://a.com/x>', 'https://a.com/x'],
    ['裸网址', '去 https://a.com 看', '去 https://a.com 看'],
    ['代码块留原文和换行', '```js\nconst a = 1;\nif (a) go();\n```', 'const a = 1;\nif (a) go();'],
    ['公式留源码，不带 $', '面积 $\\pi r^2$\n\n$$\nE=mc^2\n$$', '面积 \\pi r^2\nE=mc^2'],
    ['分隔线不留', '上\n\n---\n\n下', '上\n下'],
    ['表格：一行一行，格子用制表符', '| 名 | 数 |\n| --- | --- |\n| 甲 | 1 |\n| 乙 | 2 |', '名\t数\n甲\t1\n乙\t2'],
    ['段落里的 HTML 片段只留字', '按 <kbd>Ctrl</kbd> 键<!-- 注释 -->', '按 Ctrl 键'],
    ['网络图片：留它显示的那行字', '![封面](https://x.com/a.png)', '封面'],
    ['Shift+回车 换行照留', '第一行\\\n第二行', '第一行\n第二行'],
    ['空段落留一个空行', '上\n\n<br>\n\n下', '上\n\n下'],
    ['折叠块：标题一行、正文一行', '<details>\n<summary>标题</summary>\n\n正文 **粗**\n\n</details>', '标题\n正文 粗'],
    ['脚注', '正文[^1]\n\n[^1]: 出处', '正文[1]\n[1] 出处'],
  ])('%s', (_name, md, want) => {
    const { text } = copyAll(md);
    expect(text).toBe(want);
  });

  it('没有 markdown 记号', () => {
    const { text } = copyAll('# 标\n\n**粗** _斜_ ~~删~~ `码` [链](https://a.com)\n\n> 引\n\n- [ ] 勾\n1. 一\n\n<u>下</u>');
    expect(text).not.toMatch(/[#*_~`>[\]]|<\/?u>|^\s*[-+]\s|^\s*\d+\.\s/m);
    expect(text).toBe('标\n粗 斜 删 码 链\n引\n勾\n一\n下');
  });

  it('一段里选几个字：只有那几个字', () => {
    const { view, done } = setup('前面 **加粗的字** 后面');
    const p = posOf(view, '加粗');
    select(view, p, p + 2);
    expect(copy(view)).toBe('加粗');
    done();
  });

  it('选区没东西：不管，交给浏览器', () => {
    const { view, done } = setup('字');
    select(view, 1, 1);
    expect(fire(view).prevented).toBe(false);
    done();
  });

  it('剪切：剪贴板是纯文字，原文删掉', () => {
    const { view, h, done } = setup('留着\n\n**剪掉**');
    const p = posOf(view, '剪掉');
    select(view, p, p + 2);
    const r = fire(view, 'cut');
    expect(r.text).toBe('剪掉');
    expect(r.types).toEqual(['text/plain']);
    expect(h.getMarkdown()).toBe('留着\n');
    done();
  });

  it('只读的编辑器也能复制纯文字', () => {
    const { view, done } = setup('**粗**', { readOnly: true });
    selectAll(view);
    expect(copy(view)).toBe('粗');
    done();
  });

  it('拖动时 ProseMirror 写文字用的也是纯文字', () => {
    const { view, done } = setup('# 标\n\n- **项**');
    const text = view.someProp('clipboardTextSerializer', (f) => f(view.state.doc.slice(0, view.state.doc.content.size), view));
    expect(text).toBe('标\n项');
    done();
  });
});

describe('在念头团的编辑器之间复制粘贴：也是纯文字', () => {
  it('复制带格式的内容，粘到另一个编辑器：没有格式，一行一段', () => {
    const src = setup('# 标题\n\n**粗** 和 [链](https://a.com)\n\n- a\n- b');
    selectAll(src.view);
    const text = copy(src.view);
    expect(isOwnCopy(text)).toBe(true);
    const dst = setup('');
    paste(dst.view, { 'text/plain': text });
    expect(dst.h.getMarkdown()).toBe('标题\n\n粗 和 链\n\na\n\nb\n');
    let marks = 0;
    dst.view.state.doc.descendants((n) => void (marks += n.marks.length));
    expect(marks).toBe(0);
    src.done();
    dst.done();
  });

  it('自己复制的字里有 * _ #：照字面粘，不当 markdown', () => {
    const src = setup('a\\*b\\* c\\_d\\_ \\# 不是标题');
    selectAll(src.view);
    const text = copy(src.view);
    expect(text).toBe('a*b* c_d_ # 不是标题');
    const dst = setup('');
    paste(dst.view, { 'text/plain': text });
    expect(dst.view.state.doc.textContent).toBe('a*b* c_d_ # 不是标题');
    expect(dst.view.state.doc.firstChild!.type.name).toBe('paragraph');
    let marks = 0;
    dst.view.state.doc.descendants((n) => void (marks += n.marks.length));
    expect(marks).toBe(0);
    src.done();
    dst.done();
  });

  it('一行字粘进段落中间：接在原来那段里', () => {
    const src = setup('**中**');
    selectAll(src.view);
    const text = copy(src.view);
    const dst = setup('前后');
    dst.view.dispatch(dst.view.state.tr.setSelection(TextSelection.create(dst.view.state.doc, 2)));
    paste(dst.view, { 'text/plain': text });
    expect(dst.h.getMarkdown()).toBe('前中后\n');
    src.done();
    dst.done();
  });

  it('粘到任务第一行（纯文字标题）：第一行是标题，后面照字面一行一段', () => {
    const src = setup('**标** 题\n\n- 一\n- *二*');
    selectAll(src.view);
    const text = copy(src.view);
    const dst = setup('', { plainTitle: true });
    paste(dst.view, { 'text/plain': text });
    expect(dst.h.getMarkdown()).toBe('标 题\n\n一\n\n二\n');
    src.done();
    dst.done();
  });

  it('别处来的纯文字照旧当 markdown 读', () => {
    const dst = setup('');
    paste(dst.view, { 'text/plain': '**粗**' });
    expect(dst.h.getMarkdown()).toBe('**粗**\n');
    dst.done();
  });
});

const MD = '前面\n\n<details>\n<summary>标题</summary>\n\n第一段 **粗**\n\n- a\n- b\n\n</details>\n\n后面';

describe('折叠块里复制不带标签', () => {
  it('正文里一段中的几个字', () => {
    const { view, done } = setup(MD);
    const p = posOf(view, '第一段');
    select(view, p, p + 3);
    expect(copy(view)).toBe('第一段');
    done();
  });

  it('正文里跨好几块（段落 + 列表）', () => {
    const { view, done } = setup(MD);
    select(view, posOf(view, '第一段'), posOf(view, 'b') + 1);
    expect(copy(view)).toBe('第一段 粗\na\nb');
    done();
  });

  it('标题里的字', () => {
    const { view, done } = setup(MD);
    const p = posOf(view, '标题');
    select(view, p, p + 2);
    expect(copy(view)).toBe('标题');
    done();
  });

  it('从标题拖到正文', () => {
    const { view, done } = setup(MD);
    select(view, posOf(view, '标题'), posOf(view, '第一段') + 3);
    expect(copy(view)).toBe('标题\n第一段');
    done();
  });

  it('从折叠块里面拖到外面', () => {
    const { view, done } = setup(MD);
    select(view, posOf(view, 'b'), posOf(view, '后面') + 2);
    const text = copy(view);
    noTags(text);
    expect(text).toBe('b\n后面');
    done();
  });

  it('从外面拖进折叠块里面', () => {
    const { view, done } = setup(MD);
    select(view, posOf(view, '前面'), posOf(view, '第一段') + 3);
    expect(copy(view)).toBe('前面\n标题\n第一段');
    done();
  });

  it('整块选中（点选整个折叠块）', () => {
    const { view, done } = setup(MD);
    let at = -1;
    view.state.doc.forEach((n, off) => {
      if (n.type.name === 'details') at = off;
    });
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
    const r = fire(view);
    expect(r.types).toEqual(['text/plain']);
    expect(r.text).toBe('标题\n第一段 粗\na\nb');
    done();
  });

  it('全选', () => {
    expect(copyAll(MD).text).toBe('前面\n标题\n第一段 粗\na\nb\n后面');
  });

  it('套了两层的折叠块，里层正文里的字', () => {
    const { view, done } = setup('<details>\n<summary>外</summary>\n\n<details>\n<summary>内</summary>\n\n深处的字\n\n再一段\n\n</details>\n\n</details>');
    select(view, posOf(view, '深处'), posOf(view, '再一段') + 3);
    expect(copy(view)).toBe('深处的字\n再一段');
    done();
  });

  it('整块复制再粘回编辑器：纯文字，不再是折叠块', () => {
    const src = setup(MD);
    let at = -1;
    src.view.state.doc.forEach((n, off) => {
      if (n.type.name === 'details') at = off;
    });
    src.view.dispatch(src.view.state.tr.setSelection(NodeSelection.create(src.view.state.doc, at)));
    const text = copy(src.view);
    const dst = setup('');
    paste(dst.view, { 'text/plain': text });
    let n = 0;
    dst.view.state.doc.descendants((x) => void (x.type.name === 'details' && n++));
    expect(n).toBe(0);
    expect(dst.h.getMarkdown()).toBe('标题\n\n第一段 粗\n\na\n\nb\n');
    src.done();
    dst.done();
  });

  it('拖着挪的那份内容：开着的外层折叠块拆掉（unwrapOpenDetails）', () => {
    const { view, done } = setup(MD);
    select(view, posOf(view, '第一段'), posOf(view, 'b') + 1);
    const slice = unwrapOpenDetails(view.state.selection.content());
    let n = 0;
    slice.content.descendants((x) => void (x.type.name === 'details' && n++));
    expect(n).toBe(0);
    expect(plainTextOf(slice)).toBe('第一段 粗\na\nb');
    done();
  });
});
