/** 没标题的占位编号（Rei 2026-11-12 09:33「未提供描述」「未提供描述2」…、09:34 倒数日「未命名倒数日」「未命名倒数日2」…）：只显示，不入库。 */
import { describe, expect, it } from 'vitest';
import { MemoryAdapter, Store, untitledLabel } from '../src';

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
