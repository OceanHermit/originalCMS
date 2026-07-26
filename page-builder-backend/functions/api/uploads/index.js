// Stores an uploaded image in R2 and returns the URL the editor should use.
// Keeping images out of the project JSON is what lets a project stay small:
// the JSON only carries the returned path.

const MAX_BYTES = 8 * 1024 * 1024;       // per image
const QUOTA_BYTES = 512 * 1024 * 1024;   // per user, guards against runaway storage

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { env, data, request } = context;
  const userId = data.user.userId;

  const contentType = (request.headers.get('content-type') || '').split(';')[0].trim();
  const ext = EXT_BY_MIME[contentType];
  if (!ext) {
    return json({ error: 'unsupported_type', message: '対応していない画像形式です。' }, 415);
  }

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) {
    return json({ error: 'too_large', message: '画像は8MBまでです。' }, 413);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return json({ error: 'empty' }, 400);
  if (bytes.length > MAX_BYTES) {
    return json({ error: 'too_large', message: '画像は8MBまでです。' }, 413);
  }

  // Cheap quota check: sum the sizes already stored under this user's prefix.
  let used = 0;
  let cursor;
  do {
    const listed = await env.PROJECTS_BUCKET.list({ prefix: `uploads/${userId}/`, cursor, limit: 1000 });
    listed.objects.forEach((o) => { used += o.size || 0; });
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  if (used + bytes.length > QUOTA_BYTES) {
    return json({ error: 'quota_exceeded', message: '画像の保存容量の上限に達しました。' }, 507);
  }

  const key = `uploads/${userId}/${crypto.randomUUID()}.${ext}`;
  await env.PROJECTS_BUCKET.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
  });

  // Served by /api/img/*, which is public so exported and published pages work.
  return json({ url: `/api/img/${key.slice('uploads/'.length)}`, size: bytes.length }, 201);
}
