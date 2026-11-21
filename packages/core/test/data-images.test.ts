/** 旧 data: 图片搬到 R2（Rei 2026-11-21「现在迁移」）：找图、换地址（data-images.ts + Store.replaceDataImage）。 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { BUILTIN_TYPE_IDS } from '../src/seed/builtin-types';
import { collectDataImages, dataImagesInRow, decodeDataImage, isDataImageValue, replaceDataUrl, replaceInValue, sniffImageMime } from '../src/data-images';
import { StrictModeError } from '../src/strict';
import { local } from './helpers';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG = `data:image/png;base64,${PNG_B64}`;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const R2 = { url: 'https://app.mindough.rei8t.dev/api/assets/u/abc', r2_key: 'u/abc', sha256: 'abc', mime: 'image/png' };

async function open() {
  const adapter = new MemoryAdapter();
  const store = await Store.open(adapter, { deviceId: 'dev1', now: () => local(2026, 11, 21, 16) });
  return { store, adapter };
}

describe('找 data: 图片', () => {
  it('整个值是图、正文里夹着的都找到；网址、普通字不算', () => {
    expect(isDataImageValue(PNG)).toBe(true);
    expect(isDataImageValue('https://x.com/a.png')).toBe(false);
    const row = {
      id: 't1',
      updated_at: '',
      deleted: false,
      body_md: `前面\n\n![图](${PNG})\n\n中间 <img src="${GIF}"> 后面 data:text/plain,hi`,
      type_data: { poster: PNG, links: [{ url: 'https://a.b' }] },
    };
    expect(dataImagesInRow('task', row as never)).toEqual([PNG, GIF, PNG]);
  });

  it('asset.url 整个是 data: 就算（导入时不认识后缀的也算），别的表只认 data:image/', () => {
    const odd = 'data:application/octet-stream;base64,' + PNG_B64;
    expect(dataImagesInRow('asset', { id: 'a', updated_at: '', deleted: false, url: odd } as never)).toEqual([odd]);
    expect(dataImagesInRow('library_item', { id: 'l', updated_at: '', deleted: false, image: odd } as never)).toEqual([]);
  });

  it('同一张图在几处只算一次；墓碑和 skip 的行不看；asset 排前面', () => {
    const rows: Record<string, unknown[]> = {
      task: [
        { id: 't1', updated_at: '', deleted: false, body_md: `![](${PNG})` },
        { id: 't2', updated_at: '', deleted: true, body_md: `![](${GIF})` },
        { id: 't3', updated_at: '', deleted: false, body_md: `![](${GIF})` },
      ],
      asset: [{ id: 'a1', updated_at: '', deleted: false, url: PNG }],
    };
    const refs = collectDataImages((t) => (rows[t] ?? []) as never, (_t, id) => id === 't3');
    expect(refs).toEqual([{ url: PNG, rows: [{ table: 'asset', id: 'a1' }, { table: 'task', id: 't1' }] }]);
  });

  it('解码：按地址写的格式，写的不是图片就看文件头', () => {
    expect(decodeDataImage(PNG)?.mime).toBe('image/png');
    expect(decodeDataImage('data:application/octet-stream;base64,' + PNG_B64)?.mime).toBe('image/png');
    expect(decodeDataImage('data:application/octet-stream;base64,AAAA', 'image/webp')?.mime).toBe('image/webp');
    expect(decodeDataImage('data:application/octet-stream;base64,AAAA')).toBeNull();
    expect(decodeDataImage('data:image/jpg;base64,/9j/4AAQ')?.mime).toBe('image/jpeg');
    expect(sniffImageMime(decodeDataImage(GIF)!.bytes)).toBe('image/gif');
    // 线上库里现有的那几张就是这种：URL 编码的 SVG，不是 base64
    const svg = decodeDataImage('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E');
    expect(svg?.mime).toBe('image/svg+xml');
    expect(new TextDecoder().decode(svg!.bytes)).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });

  it('一张图的 base64 正好是另一张的开头：只换完整的那张，长的不动', () => {
    const short = 'data:image/png;base64,AAAABBBB';
    const long = 'data:image/png;base64,AAAABBBBCCCC';
    const md = `![](${short}) ![](${long}) <img src="${short}">`;
    expect(replaceDataUrl(md, short, 'R')).toBe(`![](R) ![](${long}) <img src="R">`);
    expect(replaceDataUrl(long, short, 'R')).toBe(long);
    expect(replaceDataUrl(short, short, 'R')).toBe('R');
  });

  it('replaceInValue：没变就是同一个引用', () => {
    const v = { a: [PNG, 'x'], b: 'y' };
    expect(replaceInValue(v, GIF, 'z')).toBe(v);
    expect(replaceInValue(v, PNG, 'z')).toEqual({ a: ['z', 'x'], b: 'y' });
  });
});

describe('Store.replaceDataImage', () => {
  it('正文只换那一段地址，别的字一个不动；asset 行填上 r2_key / sha256 / mime，进 outbox', async () => {
    const { store, adapter } = await open();
    const body = `# 标题\n\n- [ ] 清单\n\n![猫](${PNG} "标题")\n\n**粗** 再来一张 ![](${PNG})\n`;
    const t = store.createTask({ body_md: body }, { joinMyDay: false });
    const a = store.insert('asset', { sha256: '', mime: 'image/png', width: 1, height: 1, r2_key: null, url: PNG });
    const item = store.createLibraryItem(BUILTIN_TYPE_IDS.movie, { name: '片', image: PNG, note_md: `备注 ![](${PNG})` });
    const p = store.insert('person', { name: '人', avatar_asset_id: PNG, relation: null, birthday: null, note_md: '' });
    await store.flush();
    const before = (await adapter.pendingOutbox(10_000)).length;
    const n = store.replaceDataImage(PNG, R2);
    expect(n).toBe(4);
    expect(store.get('task', t.id)!.body_md).toBe(body.split(PNG).join(R2.url));
    expect(store.get('asset', a.id)).toMatchObject({ url: R2.url, r2_key: 'u/abc', sha256: 'abc', mime: 'image/png', width: 1, height: 1 });
    expect(store.get('library_item', item.id)).toMatchObject({ image: R2.url, note_md: `备注 ![](${R2.url})`, name: '片' });
    expect(store.get('person', p.id)!.avatar_asset_id).toBe(R2.url);
    expect(store.dataImages()).toEqual([]);
    await store.flush();
    expect((await adapter.pendingOutbox(10_000)).length).toBeGreaterThan(before);
  });

  it('幂等：再换一次什么都不改', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: `![](${PNG})` }, { joinMyDay: false });
    expect(store.replaceDataImage(PNG, R2)).toBe(1);
    const stamp = store.get('task', t.id)!.updated_at;
    expect(store.replaceDataImage(PNG, R2)).toBe(0);
    expect(store.get('task', t.id)!.updated_at).toBe(stamp);
  });

  it('按最新内容换：上传期间用户改了正文，改的字留着', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: `旧的 ![](${PNG})` }, { joinMyDay: false });
    store.updateTask(t.id, { body_md: `新写的一段\n\n![](${PNG})\n\n又加一行` });
    store.replaceDataImage(PNG, R2);
    expect(store.get('task', t.id)!.body_md).toBe(`新写的一段\n\n![](${R2.url})\n\n又加一行`);
  });

  it('用户已经把图删了：不改那一行', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: `![](${PNG})` }, { joinMyDay: false });
    store.updateTask(t.id, { body_md: '没图了' });
    const stamp = store.get('task', t.id)!.updated_at;
    expect(store.replaceDataImage(PNG, R2)).toBe(0);
    expect(store.get('task', t.id)!.updated_at).toBe(stamp);
  });

  it('类型字段（type_data）、资料字段里的 data: 图也换', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: '片', type_id: BUILTIN_TYPE_IDS.movie, type_data: { poster: PNG, note: 'x' } }, { joinMyDay: false });
    store.replaceDataImage(PNG, R2);
    expect(JSON.stringify(store.get('task', t.id))).not.toContain('data:image');
    expect(JSON.stringify(store.get('task', t.id))).toContain(R2.url);
  });

  it('发出去不能改的日记条目、严格模式锁住的任务也照换（只换地址）；别的改动照样拦', async () => {
    const { store } = await open();
    const post = store.addJournalPost({ body_md: `今天 ![](${PNG})` })!;
    const done = store.createTask({ body_md: `做完的 ![](${PNG})` }, { joinMyDay: false });
    store.completeTask(done.id);
    store.strictDone = true;
    expect(store.replaceDataImage(PNG, R2)).toBe(2);
    expect(store.get('journal_post', post.id)!.body_md).toBe(`今天 ![](${R2.url})`);
    expect(store.get('task', done.id)!.body_md).toBe(`做完的 ![](${R2.url})`);
    expect(store.strictDone).toBe(true);
    expect(() => store.updateTask(done.id, { body_md: '改了' })).toThrow(StrictModeError);
    expect(() => store.update('journal_post', post.id, { body_md: '改了' })).toThrow();
  });

  it('墓碑不碰', async () => {
    const { store } = await open();
    const gone = store.createTask({ body_md: `![](${PNG})` }, { joinMyDay: false });
    store.remove('task', gone.id);
    expect(store.dataImages()).toEqual([]);
    expect(store.replaceDataImage(PNG, R2)).toBe(0);
    expect(store.raw('task', gone.id)!.body_md).toBe(`![](${PNG})`);
  });
});
