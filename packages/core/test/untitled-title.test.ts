/** 没标题的占位编号（Rei 2026-11-12 09:33「未提供描述」「未提供描述2」…、09:34 倒数日「未命名倒数日」「未命名倒数日2」…）：只显示，不入库。 */
import { describe, expect, it } from 'vitest';
import { MemoryAdapter, Store, blankTitleLabel, hasBlankTitleLine, localStamp, setLocale, taskTitle, untitledLabel } from '../src';

let ms = 0;
async function open() {
  ms = 0;
  // 每次建任务时间往后挪一秒，创建时间有先后
  return Store.open(new MemoryAdapter(), { now: () => new Date(Date.UTC(2026, 10, 12, 1, 0, ms++)) });
}

describe('没标题的任务显示占位', () => {
  it('倒数日：未命名倒数日、未命名倒数日2、3；别的任务：未提供描述、未提供描述2；两类各自编号', async () => {
    const s = await open();
    const c1 = s.createTask({ body_md: '', completion_mode: 'countdown' });
    const t1 = s.createTask({ body_md: '' });
    const named = s.createTask({ body_md: '生日', completion_mode: 'countdown' });
    const c2 = s.createTask({ body_md: '  \n', completion_mode: 'countdown' });
    const t2 = s.createTask({ body_md: '' });
    const c3 = s.createTask({ body_md: '', completion_mode: 'countdown' });
    expect([c1, c2, c3].map((t) => s.titleOfTask(s.get('task', t.id)!))).toEqual(['未命名倒数日', '未命名倒数日2', '未命名倒数日3']);
    expect([t1, t2].map((t) => s.titleOfTask(s.get('task', t.id)!))).toEqual(['未提供描述', '未提供描述2']);
    expect(s.titleOfTask(s.get('task', named.id)!)).toBe('生日');
    expect(s.untitledOrdinal(named.id)).toBe(0);
  });
  it('只显示不入库：正文还是空的；写了标题、删掉一条，编号跟着变', async () => {
    const s = await open();
    const a = s.createTask({ body_md: '', completion_mode: 'countdown' });
    const b = s.createTask({ body_md: '', completion_mode: 'countdown' });
    const c = s.createTask({ body_md: '', completion_mode: 'countdown' });
    expect(s.get('task', b.id)!.body_md).toBe('');
    s.updateTask(a.id, { body_md: '考试' });
    expect(s.titleOfTask(s.get('task', b.id)!)).toBe('未命名倒数日');
    expect(s.titleOfTask(s.get('task', c.id)!)).toBe('未命名倒数日2');
    s.deleteTask(b.id);
    expect(s.titleOfTask(s.get('task', c.id)!)).toBe('未命名倒数日');
  });
  it('改成倒数日：换到倒数日那一组编号', async () => {
    const s = await open();
    const a = s.createTask({ body_md: '' });
    const b = s.createTask({ body_md: '' });
    expect(s.titleOfTask(s.get('task', b.id)!)).toBe('未提供描述2');
    s.updateTask(b.id, { completion_mode: 'countdown' });
    expect(s.titleOfTask(s.get('task', b.id)!)).toBe('未命名倒数日');
    expect(s.titleOfTask(s.get('task', a.id)!)).toBe('未提供描述');
  });
  it('untitledLabel：1 不带数字', () => {
    expect(untitledLabel(true)).toBe('未命名倒数日');
    expect(untitledLabel(true, 1)).toBe('未命名倒数日');
    expect(untitledLabel(false, 4)).toBe('未提供描述4');
  });
});

/** 第一行空着、下面有内容（Rei 2026-11-22 18:26「这种情况的话，标题显示"未命名标题" 然后加上时间戳」）：只显示，不入库。 */
describe('第一行空着的任务显示「未命名标题 + 创建时间」', () => {
  // 创建时间按本机时区写：用本地时间造一个时刻，测试在哪个时区跑都对
  const local = new Date(2026, 10, 22, 18, 26, 5);
  const openAt = () => Store.open(new MemoryAdapter(), { now: () => local });

  it('localStamp：本机时区 YYYY-MM-DD HH:mm；解析不了是空', () => {
    expect(localStamp(local)).toBe('2026-11-22 18:26');
    expect(localStamp(local.toISOString())).toBe('2026-11-22 18:26');
    expect(localStamp(new Date(2026, 0, 3, 7, 5))).toBe('2026-01-03 07:05');
    expect(localStamp('不是时间')).toBe('');
    expect(localStamp(null)).toBe('');
  });

  it('hasBlankTitleLine：首行空行 / <br /> / &nbsp; / 反斜杠，后面有内容才算', () => {
    expect(hasBlankTitleLine('\n正文')).toBe(true);
    expect(hasBlankTitleLine('<br />\n\n正文')).toBe(true);
    expect(hasBlankTitleLine('<br/>\n正文')).toBe(true);
    expect(hasBlankTitleLine('&nbsp;\n正文')).toBe(true);
    expect(hasBlankTitleLine('\\\n正文')).toBe(true);
    expect(hasBlankTitleLine('<br />\n\n![](https://x/y.png)')).toBe(true);
    expect(hasBlankTitleLine('')).toBe(false);
    expect(hasBlankTitleLine('<br />')).toBe(false);
    expect(hasBlankTitleLine('<br />\n\n<br />\n&nbsp;')).toBe(false);
    expect(hasBlankTitleLine('标题\n\n正文')).toBe(false);
  });

  it('首行空行 + 有内容：未命名标题 2026-11-22 18:26，正文不动', async () => {
    const s = await openAt();
    const t = s.createTask({ body_md: '\n第二行有字' });
    expect(s.titleOfTask(s.get('task', t.id)!)).toBe('未命名标题 2026-11-22 18:26');
    expect(taskTitle(s.get('task', t.id)!)).toBe('未命名标题 2026-11-22 18:26');
    expect(s.get('task', t.id)!.body_md).toBe('\n第二行有字');
  });

  it('首行 <br />（编辑器写出的空段落）：不再显示「<br />」', async () => {
    const s = await openAt();
    const t = s.createTask({ body_md: '<br />\n\n正文内容' });
    const c = s.createTask({ body_md: '<br />\n\n考试', completion_mode: 'countdown' });
    expect(s.titleOfTask(s.get('task', t.id)!)).toBe('未命名标题 2026-11-22 18:26');
    expect(s.titleOfTask(s.get('task', c.id)!)).toBe('未命名标题 2026-11-22 18:26');
    // 不占「未提供描述」那组的编号
    expect(s.untitledOrdinal(t.id)).toBe(0);
    const blank = s.createTask({ body_md: '' });
    expect(s.titleOfTask(s.get('task', blank.id)!)).toBe('未提供描述');
  });

  it('正文全空 / 只有空段落：照旧「未提供描述」「未命名倒数日」和编号', async () => {
    const s = await open();
    const a = s.createTask({ body_md: '' });
    const b = s.createTask({ body_md: '<br />' });
    const c = s.createTask({ body_md: '<br />\n\n&nbsp;', completion_mode: 'countdown' });
    expect([a, b].map((t) => s.titleOfTask(s.get('task', t.id)!))).toEqual(['未提供描述', '未提供描述2']);
    expect(s.titleOfTask(s.get('task', c.id)!)).toBe('未命名倒数日');
  });

  it('首行有字：就是那行字', async () => {
    const s = await openAt();
    const t = s.createTask({ body_md: '买菜\n\n<br />\n鸡蛋' });
    expect(s.titleOfTask(s.get('task', t.id)!)).toBe('买菜');
  });

  it('改了第一行：标题跟着变；外语按语言翻前面的字', async () => {
    const s = await openAt();
    const t = s.createTask({ body_md: '<br />\n\n内容' });
    s.updateTask(t.id, { body_md: '有标题了\n\n内容' });
    expect(s.titleOfTask(s.get('task', t.id)!)).toBe('有标题了');
    expect(blankTitleLabel(null)).toBe('未命名标题');
    setLocale('en');
    try {
      expect(blankTitleLabel(local.toISOString())).toBe('Untitled 2026-11-22 18:26');
    } finally {
      setLocale('zh');
    }
  });
});
