export async function onRequestGet(context) {
  const { env, data } = context;
  const { results } = await env.DB.prepare(
    'SELECT id, name, updated_at, created_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(data.user.userId).all();
  return new Response(JSON.stringify({ projects: results }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { env, data, request } = context;
  const body = await request.json().catch(() => ({}));
  const id = crypto.randomUUID();
  const name = (body.name || '無題のプロジェクト').slice(0, 100);
  const r2Key = `projects/${data.user.userId}/${id}.json`;
  const payload = JSON.stringify(body.data || {});

  await env.PROJECTS_BUCKET.put(r2Key, payload, { httpMetadata: { contentType: 'application/json' } });

  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO projects (id, user_id, name, r2_key, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, data.user.userId, name, r2Key, now, now).run();

  return new Response(JSON.stringify({ id, name, updated_at: now }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}
