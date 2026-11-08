// F-Droid 源的上传口：Worker「mindough-fdroid-upload」，绑 R2 桶 mindough-fdroid（变量 BUCKET）。
// 公开读走 R2 自定义域 https://fdroid.rei8t.dev（只读）；写只走这里，要带 Authorization: Bearer <UPLOAD_TOKEN>。
// 为什么不用 R2 的 S3 密钥：现有 Cloudflare 令牌没有建令牌的权限，发不出只管这个桶的 S3 密钥，
// 而把账号级令牌放进 GitHub secrets 权限太大。上传令牌只能动这一个桶。
//   PUT    /<路径>   写一个文件（index、entry、diff 不缓存；APK 和图片缓存一天）
//   大文件（Worker 一次最多收 100MB）分片传：
//   POST   /<路径>?uploads                  开始，返回 {uploadId}
//   PUT    /<路径>?uploadId=…&part=N        传第 N 片（从 1 开始，除最后一片外每片一样大、至少 5MB）
//   POST   /<路径>?uploadId=…&complete      收尾，请求体是 [{partNumber, etag}, …]
//   DELETE /<路径>   删一个文件
//   GET    /         列出桶里所有文件（JSON，同样要令牌）
export default {
  async fetch(req, env) {
    const auth = req.headers.get('authorization') || '';
    if (!env.UPLOAD_TOKEN || auth !== `Bearer ${env.UPLOAD_TOKEN}`) {
      return new Response('401 未授权\n', { status: 401 });
    }
    const key = decodeURIComponent(new URL(req.url).pathname.slice(1));
    if (req.method === 'GET' && key === '') {
      const keys = [];
      let cursor;
      do {
        const page = await env.BUCKET.list({ cursor, limit: 1000 });
        for (const o of page.objects) keys.push({ key: o.key, size: o.size });
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return Response.json(keys);
    }
    if (!key || key.includes('..')) return new Response('400 路径不对\n', { status: 400 });
    const q = new URL(req.url).searchParams;
    if (req.method === 'POST' && q.has('uploads')) {
      const mp = await env.BUCKET.createMultipartUpload(key, { httpMetadata: meta(key, req) });
      return Response.json({ uploadId: mp.uploadId });
    }
    if (q.has('uploadId')) {
      const mp = env.BUCKET.resumeMultipartUpload(key, q.get('uploadId'));
      if (req.method === 'PUT') {
        const part = await mp.uploadPart(Number(q.get('part')), req.body);
        return Response.json(part);
      }
      if (req.method === 'POST' && q.has('complete')) {
        await mp.complete(await req.json());
        return new Response('ok\n');
      }
    }
    if (req.method === 'PUT') {
      await env.BUCKET.put(key, req.body, { httpMetadata: meta(key, req) });
      return new Response('ok\n');
    }
    if (req.method === 'DELETE') {
      await env.BUCKET.delete(key);
      return new Response('ok\n');
    }
    return new Response('405 不支持这个方法\n', { status: 405 });
  },
};

function meta(key, req) {
  const noCache = /(^|\/)(index[^/]*|entry\.[^/]*|diff\/[^/]*)$/.test(key) || key.endsWith('.html');
  return {
    contentType: req.headers.get('content-type') || 'application/octet-stream',
    cacheControl: noCache ? 'no-cache' : 'public, max-age=86400',
  };
}
