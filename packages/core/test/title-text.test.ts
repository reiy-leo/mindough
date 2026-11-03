import { describe, expect, it } from 'vitest';
import { escapeTitleLine, plainTitleMarkdown } from '../src/md-text';
import { firstLine, taskTitle } from '../src/preview';
import { plainMarkdown } from '../src/task-match';

// Rei 2026-11-03「任务的标题不渲染任何样式，或者列表，以及其他，任务标题是纯文本不渲染md」
const LITERALS = [
  '**不是粗体** # 1. x',
  '# 不是标题',
  '## 也不是',
  '- 不是列表',
  '+ 不是列表',
  '* 不是列表',
  '1. 不是编号',
  '2) 也不是',
  '> 不是引用',
  '[] 不是清单',
  '[ ] 不是清单',
  '[x] 不是清单',
  '```',
  '~~~',
  '---',
  '***',
  '___',
  '`code` 不是代码',
  '~~不是删除线~~',
  '_不是斜体_ a_b_c',
  '[不是链接](https://x.com)',
  '![不是图](a.png)',
  '<u>不是下划线</u>',
  '<https://x.com>',
  '$x^2$ 不是公式',
  '&amp; 不是实体 &#42;',
  'C:\\Users\\rei',
  'a\\*b',
  '[^1] 不是脚注',
  '|a|b|',
  '>> 不是折叠块',
  'draw.io for ChatGPT',
  '100% 好 #标签 a-b',
];

describe('escapeTitleLine：存成字面文字，显示回原样', () => {
  it.each(LITERALS)('%s', (s) => {
    const md = escapeTitleLine(s);
    expect(firstLine(md)).toBe(s);
    expect(taskTitle({ body_md: `${md}\n\n正文 **粗**` })).toBe(s);
  });

  it('普通文字不加反斜杠', () => {
    expect(escapeTitleLine('买牛奶 draw.io 100% a-b #标签')).toBe('买牛奶 draw.io 100% a-b #标签');
  });

  it('只转该转的', () => {
    expect(escapeTitleLine('# x')).toBe('\\# x');
    expect(escapeTitleLine('1. x')).toBe('1\\. x');
    expect(escapeTitleLine('**x**')).toBe('\\*\\*x\\*\\*');
    expect(escapeTitleLine('a < b')).toBe('a < b');
    expect(escapeTitleLine('<u>x</u>')).toBe('\\<u>x\\</u>');
  });

  it('前后空白去掉，中间换行当空格', () => {
    expect(escapeTitleLine('    缩进')).toBe('缩进');
    expect(escapeTitleLine('a\nb')).toBe('a b');
    expect(escapeTitleLine('   ')).toBe('');
  });

  it('搜索文字也是原样', () => {
    expect(plainMarkdown(escapeTitleLine('**不是粗体** # 1. x'))).toContain('**不是粗体** # 1. x');
  });
});

describe('plainTitleMarkdown：添加框打的字', () => {
  it('一行：整行当标题', () => {
    expect(plainTitleMarkdown('# 买菜')).toBe('\\# 买菜');
    expect(taskTitle({ body_md: plainTitleMarkdown('# 买菜') })).toBe('# 买菜');
  });
  it('多行：第一行当标题，后面照原样', () => {
    expect(plainTitleMarkdown('- 标题\n- 列表')).toBe('\\- 标题\n\n- 列表');
  });
});

describe('老数据：第一行是标题、列表、粗体时照旧去掉记号', () => {
  it.each([
    ['# 标题', '标题'],
    ['- 列表项', '列表项'],
    ['1. 编号', '编号'],
    ['> 引用', '引用'],
    ['- [ ] 清单', '清单'],
    ['**粗体** 标题', '粗体 标题'],
    ['[链接](https://x.com) 后面', '链接 后面'],
  ])('%s → %s', (md, title) => {
    expect(firstLine(md)).toBe(title);
  });
});
