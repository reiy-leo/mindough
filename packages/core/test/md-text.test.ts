import { describe, expect, it } from 'vitest';
import { stripWithLiterals, unescapeMarkdown } from '../src/md-text';
import { firstLine } from '../src/preview';
import { plainMarkdown } from '../src/task-match';
import { journalPlainText, journalPreview } from '../src/journal';

// Rei 2026-11-03「任务列表中，.会显示成\.」：老数据里存着 draw\.io
describe('反斜杠转义', () => {
  it('首行：\\ 后跟 ASCII 标点去掉反斜杠，\\\\ 变 \\', () => {
    expect(firstLine('draw\\.io for ChatGPT and Codex')).toBe('draw.io for ChatGPT and Codex');
    expect(firstLine('a\\\\b')).toBe('a\\b');
    expect(firstLine('x\\*y\\_z\\~')).toBe('x*y_z~');
    expect(firstLine('https\\://x a\\@b')).toBe('https://x a@b');
    // 反斜杠后面不是 ASCII 标点：保留
    expect(firstLine('a\\b 中\\文')).toBe('a\\b 中\\文');
  });
  it('首行：转义过的行首记号是字面量，不去掉', () => {
    expect(firstLine('1\\. 不是列表')).toBe('1. 不是列表');
    expect(firstLine('\\# 不是标题')).toBe('# 不是标题');
    expect(firstLine('\\- 不是清单')).toBe('- 不是清单');
    expect(firstLine('\\[x] y')).toBe('[x] y');
  });
  it('首行：转义的 <u> 是字面量，真的下划线标签照样去掉', () => {
    expect(firstLine('\\<u>字\\</u> <u>重点</u>')).toBe('<u>字</u> 重点');
  });
  it('行内代码里原样保留，反引号去掉', () => {
    expect(firstLine('`a\\.b` 和 c\\.d')).toBe('a\\.b 和 c.d');
    expect(firstLine('`a_b*c`')).toBe('a_b*c');
    expect(firstLine('``x`y\\.``')).toBe('x`y\\.');
    expect(firstLine('\\`不是代码\\`')).toBe('`不是代码`');
    expect(firstLine('\\\\`code\\.`')).toBe('\\code\\.');
  });
  it('搜索、日记预览也去掉', () => {
    expect(plainMarkdown('- [ ] 画 draw\\.io\n\n`x\\.y`')).toBe('画 draw.io x\\.y');
    expect(journalPlainText('今天用 draw\\.io')).toBe('今天用 draw.io');
    expect(journalPreview('## 1\\. 早上')).toBe('1. 早上');
  });
  it('正文里本来有私用区字符时也不出错', () => {
    expect(firstLine('\ue001 draw\\.io')).toBe('\ue001 draw.io');
    expect(stripWithLiterals('\ue000`a\\.b`', (s) => s)).toBe('\ue000`a\\.b`');
  });
  it('unescapeMarkdown：只去转义，行内代码不动', () => {
    expect(unescapeMarkdown('draw\\.io `a\\.b` \\\\')).toBe('draw.io `a\\.b` \\');
  });
});
