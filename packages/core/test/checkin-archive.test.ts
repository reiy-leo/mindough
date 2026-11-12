/**
 * 打卡正文存档（Rei 2026-11-13 05:01）：节点达标时，正文标题下面的内容存成一条已完成的前置任务，打卡正文只留标题。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { archiveBody, archiveTitle, checkInArchiveDepId, checkInArchiveId, hasBodyBelowTitle, isBlankBodyLine, restoreCheckInBody, splitCheckInBody } from '../src/checkin-archive';
import { PIN_CATEGORY_ID, STAR_CATEGORY_ID } from '../src/seed/builtin-checkin-categories';
import { StrictModeError } from '../src/strict';
import { exportArchive, fromUtf8, planImport, applyImport } from '../src/archive';
import { local } from './helpers';

const DAY = 24 * 3600_000;
// 2026-11-02 是周一
async function open(t0 = local(2026, 11, 2, 9).getTime(), adapter = new MemoryAdapter(), deviceId = 'dev1') {
  let t = t0;
  const store = await Store.open(adapter, { deviceId, now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms) };
}
const archivesOf = (store: Store, taskId: string) =>
  store
    .edges()
    .filter((e) => e.succ_id === taskId)
    .map((e) => store.get('task', e.pred_id)!)
    .filter(Boolean);

describe('拆正文', () => {
  it('第一条不空的行是标题，下面去掉首尾空行；空段落 <br /> 不算内容', () => {
    expect(splitCheckInBody('读书\n\n今天读了第三章\n- 笔记\n\n')).toEqual({ title: '读书', rest: '今天读了第三章\n- 笔记' });
    expect(splitCheckInBody('读书\n\n<br />\n  \n&nbsp;\n')).toEqual({ title: '读书', rest: '' });
    expect(splitCheckInBody('\n\n读书')).toEqual({ title: '读书', rest: '' });
    expect(splitCheckInBody('')).toEqual({ title: '', rest: '' });
    expect(hasBodyBelowTitle('读书\n<br />\n<br />')).toBe(false);
    expect(hasBodyBelowTitle('读书\n<br />\n第一段')).toBe(true);
    expect(isBlankBodyLine('<br/>')).toBe(true);
    expect(isBlankBodyLine('\\')).toBe(true);
    expect(isBlankBodyLine('x')).toBe(false);
  });

  it('存档正文：标题 · 节点日期，空一行接内容；打卡没标题只写日期', () => {
    expect(archiveTitle('读书', '2026-11-13')).toBe('读书 · 2026-11-13');
    expect(archiveTitle('', '2026-11-13')).toBe('2026-11-13');
    expect(archiveBody('读书', '2026-11-13', '第三章')).toBe('读书 · 2026-11-13\n\n第三章');
    expect(restoreCheckInBody('读书', '第三章')).toBe('读书\n\n第三章');
    expect(restoreCheckInBody('读书\n\n新写的\n', '第三章')).toBe('读书\n\n新写的\n\n第三章');
    expect(restoreCheckInBody('', '第三章')).toBe('第三章');
  });

  it('id 由打卡 + 节点 + 序号算出来，稳定、互不相同', () => {
    expect(checkInArchiveId('t', '2026-11-02')).toBe(checkInArchiveId('t', '2026-11-02', 1));
    expect(checkInArchiveId('t', '2026-11-02')).not.toBe(checkInArchiveId('t', '2026-11-03'));
    expect(checkInArchiveId('t', '2026-11-02', 2)).not.toBe(checkInArchiveId('t', '2026-11-02', 1));
    expect(checkInArchiveDepId('a')).not.toBe(checkInArchiveId('a', ''));
  });
});

describe('达标时存档', () => {
  it('计数打卡达标：新建已完成的前置任务，正文挪过去，打卡只留标题；项目、类型、心情照抄，内置类型不抄', async () => {
    const { store } = await open();
    const g = store.insert('group', { name: '学习', icon: '📚', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: false } as never);
    const cat = store.createCategory('读书');
    const h = store.createTask({ body_md: '读书\n\n第三章：**很好看**\n- 摘抄一句', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=DAILY', group_id: g.id, mood: 'happy' });
    store.setTaskCategories(h.id, [cat.id, PIN_CATEGORY_ID, STAR_CATEGORY_ID]);
    const r1 = store.checkIn(h.id, 'add', 1);
    expect(r1.archived).toBeNull();
    expect(store.get('task', h.id)!.body_md).toContain('第三章');
    const r2 = store.checkIn(h.id, 'add', 1);
    const a = r2.archived!;
    expect(a).toBeTruthy();
    expect(a.id).toBe(checkInArchiveId(h.id, '2026-11-02'));
    expect(a.body_md).toBe('读书 · 2026-11-02\n\n第三章：**很好看**\n- 摘抄一句');
    expect(a.status).toBe('完成');
    expect(a.done_at).toBe(store.now().toISOString());
    expect(a.recurrence).toBeNull();
    expect(a.completion_mode).toBe('once');
    expect(a.group_id).toBe(g.id);
    expect(a.mood).toBe('happy');
    expect(store.categoryIdsOfTask(a.id)).toEqual([cat.id]);
    expect(store.isPinned(a)).toBe(false);
    expect(store.get('task', h.id)!.body_md).toBe('读书');
    // FS：存档是打卡的前置，已完成，打卡照常可开始
    expect(store.edges().some((e) => e.pred_id === a.id && e.succ_id === h.id)).toBe(true);
    expect(store.derived().get(h.id)?.state).toBe('可开始');
    // 不进我的一天
    expect(store.isInMyDay(a.id)).toBe(false);
  });

  it('正文只有标题、或下面只有空行 / 空段落：不生成', async () => {
    const { store } = await open();
    const a = store.createTask({ body_md: '喝水', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=DAILY' });
    const b = store.createTask({ body_md: '冥想\n\n<br />\n\n', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    expect(store.checkIn(a.id, 'add', 2).archived).toBeNull();
    expect(store.checkIn(b.id, 'add', 1).archived).toBeNull();
    expect(store.get('task', b.id)!.body_md).toBe('冥想\n\n<br />\n\n');
    expect(archivesOf(store, a.id)).toEqual([]);
  });

  it('附件也算内容，跟着挪过去', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '拍照', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    const att = store.addAttachment({ owner_type: 'task', owner_id: h.id, file_name: 'a.jpg', mime: 'image/jpeg', size: 10 });
    const a = store.checkIn(h.id, 'add', 1).archived!;
    expect(a.body_md).toBe('拍照 · 2026-11-02');
    expect(store.attachmentsOf('task', a.id).map((x) => x.id)).toEqual([att.id]);
    expect(store.attachmentsOf('task', h.id)).toEqual([]);
  });

  it('计时达标（停下时够了目标）才存档', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '练琴\n\n音阶', completion_mode: 'timer', target_value: 60_000, recurrence: 'FREQ=DAILY' });
    expect(store.checkIn(h.id, 'start').archived).toBeNull();
    advance(61_000);
    const a = store.checkIn(h.id, 'stop').archived!;
    expect(a.body_md).toBe('练琴 · 2026-11-02\n\n音阶');
  });

  it('不是打卡的不管：只做一次的计数任务、重复的倒数日', async () => {
    const { store } = await open();
    const once = store.createTask({ body_md: '看完\n\n笔记', completion_mode: 'count', target_value: 2 });
    const r = store.checkIn(once.id, 'add', 2);
    expect(r.completed).toBeTruthy();
    expect(r.archived).toBeNull();
    expect(store.get('task', once.id)!.body_md).toBe('看完\n\n笔记');
  });

  it('补打卡补完：节点日期是被补的那天，完成时间是现在', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '跑步\n\n5 公里', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TH' });
    advance(DAY); // 周二，补周一
    expect(store.startMakeup(h.id)).toBe('2026-11-02');
    store.checkIn(h.id, 'add', 1);
    const a = store.checkIn(h.id, 'add', 1).archived!;
    expect(a.body_md).toBe('跑步 · 2026-11-02\n\n5 公里');
    expect(a.done_at).toBe(store.now().toISOString());
  });

  it('每个节点一条；第二天写了新内容再达标，又是一条', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '日记\n\n周一', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    store.checkIn(h.id, 'add', 1);
    advance(DAY);
    store.updateTask(h.id, { body_md: '日记\n\n周二' });
    store.checkIn(h.id, 'add', 1);
    const bodies = archivesOf(store, h.id).map((t) => t.body_md).sort();
    expect(bodies).toEqual(['日记 · 2026-11-02\n\n周一', '日记 · 2026-11-03\n\n周二']);
  });

  it('客户端的 beforeCheckIn 先调（存下详情里没存的正文），存档拿的是新正文', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '读书', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    store.beforeCheckIn = (id) => store.updateTask(id, { body_md: '读书\n\n刚写的' });
    const a = store.checkIn(h.id, 'add', 1).archived!;
    expect(a.body_md).toBe('读书 · 2026-11-02\n\n刚写的');
  });
});

describe('撤销', () => {
  it('刚生成、没动过：撤销打卡就撤回——内容和附件回到打卡，存档和前后关系删掉', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '读书\n\n第三章', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    const att = store.addAttachment({ owner_type: 'task', owner_id: h.id, file_name: 'a.pdf', mime: 'application/pdf', size: 10 });
    const r = store.checkIn(h.id, 'add', 1);
    const id = r.archived!.id;
    store.undoCheckIn(r.event.id);
    expect(store.get('task', id)).toBeUndefined();
    expect(store.get('task', h.id)!.body_md).toBe('读书\n\n第三章');
    expect(store.attachmentsOf('task', h.id).map((x) => x.id)).toEqual([att.id]);
    expect(store.edges().filter((e) => e.succ_id === h.id)).toEqual([]);
    // 再打：同一个 id 翻回来
    const again = store.checkIn(h.id, 'add', 1).archived!;
    expect(again.id).toBe(id);
    expect(again.body_md).toBe('读书 · 2026-11-02\n\n第三章');
  });

  it('改小数值退回没达标也撤回；撤回前打卡里又写了字，两段都留', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '喝水\n\n记录', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=DAILY' });
    const a = store.checkIn(h.id, 'add', 2).archived!;
    store.updateTask(h.id, { body_md: '喝水\n\n新写的' });
    store.checkIn(h.id, 'add', -1);
    expect(store.get('task', a.id)).toBeUndefined();
    expect(store.get('task', h.id)!.body_md).toBe('喝水\n\n新写的\n\n记录');
  });

  it('存档被改过就不撤回；之后同一节点再达标用下一个序号', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '读书\n\n第三章', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    const r = store.checkIn(h.id, 'add', 1);
    store.updateTask(r.archived!.id, { body_md: '读书 · 2026-11-02\n\n第三章，改过' });
    store.undoCheckIn(r.event.id);
    expect(store.get('task', r.archived!.id)!.body_md).toContain('改过');
    expect(store.get('task', h.id)!.body_md).toBe('读书');
    store.updateTask(h.id, { body_md: '读书\n\n第四章' });
    const b = store.checkIn(h.id, 'add', 1).archived!;
    expect(b.id).toBe(checkInArchiveId(h.id, '2026-11-02', 2));
    expect(archivesOf(store, h.id)).toHaveLength(2);
  });

  it('别的设备生成的（本机没生成过）撤销时不撤回', async () => {
    const remote = await open();
    const h = remote.store.createTask({ body_md: '读书\n\n第三章', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    const r = remote.store.checkIn(h.id, 'add', 1);
    await remote.store.flush();
    const local2 = await open(local(2026, 11, 2, 9).getTime(), new MemoryAdapter(), 'dev2');
    const rows = (['task', 'check_in', 'dependency', 'task_category'] as const).flatMap((table) => remote.store.listAll(table).map((row) => ({ table, row })));
    local2.store.applyRemote(rows as never);
    expect(local2.store.get('task', r.archived!.id)).toBeTruthy();
    local2.store.undoCheckIn(r.event.id);
    expect(local2.store.get('task', r.archived!.id)).toBeTruthy();
  });
});

describe('同步、严格模式', () => {
  it('两台设备离线各自在同一节点达标：生成同一行，不会出两条', async () => {
    const a = await open(local(2026, 11, 2, 9).getTime(), new MemoryAdapter(), 'devA');
    const h = a.store.createTask({ body_md: '读书\n\n第三章', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    await a.store.flush();
    const b = await open(local(2026, 11, 2, 9).getTime(), new MemoryAdapter(), 'devB');
    b.store.applyRemote(a.store.listAll('task').map((row) => ({ table: 'task' as const, row })) as never);
    const ra = a.store.checkIn(h.id, 'add', 1).archived!;
    const rb = b.store.checkIn(h.id, 'add', 1).archived!;
    expect(ra.id).toBe(rb.id);
    // b 收到 a 的全部行
    const rows = (['task', 'check_in', 'dependency', 'task_category'] as const).flatMap((table) => a.store.listAll(table).map((row) => ({ table, row })));
    b.store.applyRemote(rows as never);
    expect(archivesOf(b.store, h.id)).toHaveLength(1);
    // 拉下来的行不再生成
    expect(b.store.list('task').filter((t) => t.body_md.startsWith('读书 · '))).toHaveLength(1);
  });

  it('严格模式开着：照常生成（先建待办再标完成）；撤销也能撤回', async () => {
    const { store } = await open();
    store.strictDone = true;
    const cat = store.createCategory('读书');
    const h = store.createTask({ body_md: '读书\n\n第三章', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    store.setTaskCategories(h.id, [cat.id]);
    const r = store.checkIn(h.id, 'add', 1);
    expect(r.archived!.status).toBe('完成');
    expect(store.categoryIdsOfTask(r.archived!.id)).toEqual([cat.id]);
    expect(() => store.updateTask(r.archived!.id, { body_md: 'x' })).toThrow(StrictModeError);
    store.undoCheckIn(r.event.id);
    expect(store.get('task', r.archived!.id)).toBeUndefined();
    expect(store.get('task', h.id)!.body_md).toBe('读书\n\n第三章');
  });
});

describe('打卡描述（Rei 2026-11-13 05:09）', () => {
  it('只给打卡：普通任务、倒数日、重复的倒数日不写；去掉首尾空白，空 = null', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '读书', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    const t = store.createTask({ body_md: '普通' });
    const cd = store.createTask({ body_md: '生日', completion_mode: 'countdown', target_date: '2026-12-01', recurrence: 'FREQ=YEARLY' });
    expect(store.get('task', h.id)!.checkin_note).toBeNull();
    store.setCheckInNote(h.id, '  每天 30 页\n睡前读  ');
    expect(store.get('task', h.id)!.checkin_note).toBe('每天 30 页\n睡前读');
    store.setCheckInNote(t.id, 'x');
    store.setCheckInNote(cd.id, 'x');
    expect(store.get('task', t.id)!.checkin_note ?? null).toBeNull();
    expect(store.get('task', cd.id)!.checkin_note ?? null).toBeNull();
    store.setCheckInNote(h.id, '   ');
    expect(store.get('task', h.id)!.checkin_note).toBeNull();
  });

  it('达标存档时打卡描述不动、不进存档任务', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '读书\n\n第三章', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    store.setCheckInNote(h.id, '每天 30 页');
    const a = store.checkIn(h.id, 'add', 1).archived!;
    expect(store.get('task', h.id)!.checkin_note).toBe('每天 30 页');
    expect(store.get('task', h.id)!.body_md).toBe('读书');
    expect(a.checkin_note ?? null).toBeNull();
    expect(a.body_md).not.toContain('30 页');
  });

  it('老客户端推上来的行没有这一列：沿用本机的值', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '读书', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    store.setCheckInNote(h.id, '每天 30 页');
    const old = { ...store.get('task', h.id)!, body_md: '读书（老客户端改的）', updated_at: '9999999999999-0000-old' } as Record<string, unknown>;
    delete old.checkin_note;
    store.applyRemote([{ table: 'task', row: old }] as never);
    expect(store.get('task', h.id)!.body_md).toBe('读书（老客户端改的）');
    expect(store.get('task', h.id)!.checkin_note).toBe('每天 30 页');
  });

  it('导出导入带上', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '读书', completion_mode: 'once', recurrence: 'FREQ=DAILY' });
    store.setCheckInNote(h.id, '每天 30 页\n睡前读');
    const { files } = exportArchive(store);
    const md = files.find((f) => f.path.endsWith('.md') && fromUtf8(f.data).includes('checkin_note'));
    expect(md).toBeTruthy();
    const dst = await open(local(2026, 11, 2, 9).getTime(), new MemoryAdapter(), 'dev2');
    applyImport(dst.store, planImport(dst.store, files));
    expect(dst.store.get('task', h.id)!.checkin_note).toBe('每天 30 页\n睡前读');
  });
});
