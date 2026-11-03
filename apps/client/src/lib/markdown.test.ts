// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { markdownHtml, renderMarkdown } from './markdown';

describe('备注 / 内容的 Markdown', () => {
  it('老的纯文字备注照原样分行', () => {
    expect(markdownHtml('第一行\n第二行')).toBe('<p>第一行<br>第二行</p>\n');
  });

  it('清单、列表、引用、代码、表格都能排版', () => {
    const html = markdownHtml('- [ ] 买票\n- [x] 订座\n\n> 好看\n\n`code`\n\n```\nblock\n```\n\n| 平台 | 价格 |\n| --- | --- |\n| Steam | 58 |\n');
    expect(html).toContain('<input disabled="" type="checkbox">');
    expect(html).toContain('<input checked="" disabled="" type="checkbox">');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<pre><code>block');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>Steam</td>');
  });

  it('链接（含自动识别的网址）在新标签页打开', () => {
    expect(markdownHtml('[豆瓣](https://movie.douban.com/subject/1889243/)')).toContain('<a href="https://movie.douban.com/subject/1889243/" target="_blank" rel="noopener noreferrer">豆瓣</a>');
    expect(markdownHtml('看这里 https://ext.to/x')).toContain('target="_blank"');
  });

  it('下划线三种（<u>、class="wavy"、class="double"）在只读显示里照样是下划线', () => {
    const html = renderMarkdown('一<u>直</u>二<u class="wavy">波</u>三<u class="double">双</u>和<u>**粗**</u>');
    expect(html).toContain('<u>直</u>');
    expect(html).toContain('<u class="wavy">波</u>');
    expect(html).toContain('<u class="double">双</u>');
    expect(html).toContain('<u><strong>粗</strong></u>');
  });
});
