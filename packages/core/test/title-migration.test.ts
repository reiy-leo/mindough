/**
 * 任务标题 = 正文第一行（Rei 2026-11-03「任何任务的第一行都是标题」）。
 * 挂了资料、标题原来是资料名的老任务：资料名补成正文第一行（Store.migrateTitleLines），幂等、能同步；
 * 新建 / 挂上资料时正文没写标题也补上。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { BUILTIN_TYPE_IDS as T } from '../src/seed/builtin-types';
import { taskTitle } from '../src/preview';
import { search } from '../src/search';
import type { Task } from '../src/types';
import { local, mkTask } from './helpers';

const now = local(2026, 11, 3, 21);
const TEMPLATE = '## 想看理由\n\n\n## 观后感\n';
const OLD = '1761000000000-0000-old';

/** 一个库里有「沙丘 2」的本机库，外加 extra 里旧客户端写的任务行（不走 Store，直接落盘）。 */
async function setup(rows: (itemId: string) => Task[], name = '沙丘 2') {
  const ad = new MemoryAdapter();
  const s0 = await Store.open(ad, { deviceId: 'd0', now: () => now });
  const item = s0.createLibraryItem(T.movie, { name });
  await s0.flush();
  await ad.applyRemoteChanges(rows(item.id).map((row) => ({ table: 'task' as const, row: { ...row, updated_at: OLD } })));
  await ad.ackOutbox(Number.MAX_SAFE_INTEGER);
  const s = await Store.open(ad, { deviceId: 'd1', now: () => now });
  await s.flush();
  return { ad, s, item };
}

const old = (id: string, itemId: string, body_md: string, extra: Partial<Task> = {}) => mkTask(id, { body_md, type_id: T.movie, library_item_id: itemId, ...extra });

describe('标题来源：正文第一行', () => {
  it('挂了资料、正文写了第一行：标题是第一行，不是资料名', async () => {
    const { s } = await setup((i) => [old('a', i, '周末和小王去看\n\n## 想看理由\nIMAX')]);
    const t = s.get('task', 'a')!;
    expect(taskTitle(t)).toBe('周末和小王去看');
    expect(t.body_md).toBe('周末和小王去看\n\n## 想看理由\nIMAX');
    // ⌘K 的标题也一样
    const hit = search({ tasks: s.list('task'), types: s.list('task_type'), people: [], groups: [], taskPeople: [], items: s.list('library_item') }, '周末');
    expect(hit.find((h) => h.kind === 'task')?.title).toBe('周末和小王去看');
  });
});

describe('老数据迁移：资料名补成第一行', () => {
  it('正文以 `## 想看理由` 开头：资料名插到最前面，标题不变成「想看理由」', async () => {
    const { s } = await setup((i) => [old('a', i, TEMPLATE)]);
    const t = s.get('task', 'a')!;
    expect(t.body_md).toBe('沙丘 2\n\n## 想看理由\n\n\n## 观后感');
    expect(taskTitle(t)).toBe('沙丘 2');
  });

  it('正文空着、列表开头、带格式开头：都补', async () => {
    const { s } = await setup((i) => [old('e', i, ''), old('l', i, '- [ ] 买票'), old('b', i, '**一定要看**')]);
    expect(s.get('task', 'e')!.body_md).toBe('沙丘 2');
    expect(s.get('task', 'l')!.body_md).toBe('沙丘 2\n\n- [ ] 买票');
    expect(s.get('task', 'b')!.body_md).toBe('沙丘 2\n\n**一定要看**');
  });

  it('资料名里有 markdown 记号：按纯文字转义，显示原样', async () => {
    const { s } = await setup((i) => [old('a', i, TEMPLATE)], '#1 *星际* [导演剪辑]');
    const t = s.get('task', 'a')!;
    expect(t.body_md.split('\n')[0]).toBe('\\#1 \\*星际\\* \\[导演剪辑]');
    expect(taskTitle(t)).toBe('#1 *星际* [导演剪辑]');
  });

  it('不动的：没挂资料的、第一行已是纯文字的、删掉的', async () => {
    const { s, ad } = await setup((i) => [
      mkTask('p', { body_md: '## 普通任务的标题' }),
      old('x', i, '好看\n\n## 想看理由'),
      old('d', i, TEMPLATE, { deleted: true }),
    ]);
    expect(s.get('task', 'p')!.body_md).toBe('## 普通任务的标题');
    expect(s.get('task', 'x')!.body_md).toBe('好看\n\n## 想看理由');
    expect((await ad.loadAll()).task.find((t) => t.id === 'd')!.body_md).toBe(TEMPLATE);
  });

  it('改的正文进 outbox（同步给别的设备）；没改的不进', async () => {
    const { ad } = await setup((i) => [old('a', i, TEMPLATE), old('x', i, '好看')]);
    const ids = (await ad.pendingOutbox()).filter((e) => e.table === 'task').map((e) => e.id);
    expect(ids).toContain('a');
    expect(ids).not.toContain('x');
  });

  it('幂等：再打开一次不再改；迁移后改了第一行也不会再插', async () => {
    const { ad, s } = await setup((i) => [old('a', i, TEMPLATE)]);
    expect(s.migrateTitleLines()).toBe(0);
    s.updateTask('a', { body_md: '改个标题\n\n## 想看理由' });
    await s.flush();
    const s2 = await Store.open(ad, { deviceId: 'd1', now: () => now });
    expect(s2.get('task', 'a')!.body_md).toBe('改个标题\n\n## 想看理由');
    expect(s2.migrateTitleLines()).toBe(0);
  });

  it('两台设备各迁一遍：结果一字不差（LWW 谁赢都一样）', async () => {
    const a = await setup((i) => [old('a', i, TEMPLATE)]);
    const b = await setup((i) => [old('a', i, TEMPLATE)]);
    expect(a.s.get('task', 'a')!.body_md).toBe(b.s.get('task', 'a')!.body_md);
  });

  it('同步拉到旧客户端写的任务：拉下来就补上', async () => {
    const { s, item } = await setup(() => []);
    s.applyRemote([{ table: 'task', row: { ...old('r', item.id, TEMPLATE), updated_at: '1762000000000-0000-old' } }]);
    expect(s.get('task', 'r')!.body_md).toBe('沙丘 2\n\n## 想看理由\n\n\n## 观后感');
  });
});

describe('新建 / 挂上资料：第一行预填资料名', () => {
  it('createTask 挂资料、没给正文：资料名 + 库的正文模板', async () => {
    const { s, item } = await setup(() => []);
    const t = s.createTask({ type_id: T.movie, library_item_id: item.id });
    expect(t.body_md).toBe('沙丘 2\n\n## 想看理由\n\n\n## 观后感');
    expect(taskTitle(t)).toBe('沙丘 2');
  });

  it('createTask 给了正文（新建面板里改过第一行）：照用户写的', async () => {
    const { s, item } = await setup(() => []);
    const t = s.createTask({ type_id: T.movie, library_item_id: item.id, body_md: '二刷\n\n## 想看理由' });
    expect(t.body_md).toBe('二刷\n\n## 想看理由');
  });

  it('createTask 旧调用方式（type_data 里写片名）：挂上资料，第一行也是片名', async () => {
    const { s } = await setup(() => []);
    const t = s.createTask({ type_id: T.movie, type_data: { title: '奥本海默' } });
    expect(taskTitle(t)).toBe('奥本海默');
  });

  it('详情里给空正文的任务挂上资料：补第一行；已经写了字的不动', async () => {
    const { s, item } = await setup(() => []);
    const e = s.createTask({ body_md: '' });
    const w = s.createTask({ body_md: '记得买票' });
    s.addTaskItem(e.id, item.id);
    s.addTaskItem(w.id, item.id);
    expect(s.get('task', e.id)!.body_md).toBe('沙丘 2');
    expect(s.get('task', w.id)!.body_md).toBe('记得买票');
  });
});
