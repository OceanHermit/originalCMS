async function findOwnedProject(env, id, userId) {
  return env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(id, userId).first();
}

export async function onRequestGet(context) {
  const { env, data, params } = context;
  const headers = { 'content-type': 'application/json' };
  const project = await findOwnedProject(env, params.id, data.user.userId);
  if (!project) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });

  const obj = await env.PROJECTS_BUCKET.get(project.r2_key);
  if (!obj) return new Response(JSON.stringify({ error: 'data_missing' }), { status: 404, headers });

  const json = await obj.text();
  return new Response(
    JSON.stringify({ id: project.id, name: project.name, updated_at: project.updated_at, data: JSON.parse(json) }),
    { status: 200, headers }
  );
}

export async function onRequestPut(context) {
  const { env, data, params, request } = context;
  const headers = { 'content-type': 'application/json' };
  const project = await findOwnedProject(env, params.id, data.user.userId);
  if (!project) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });

  const body = await request.json().catch(() => ({}));
  const payload = JSON.stringify(body.data || {});
  await env.PROJECTS_BUCKET.put(project.r2_key, payload, { httpMetadata: { contentType: 'application/json' } });

  const now = Date.now();
  const name = body.name ? String(body.name).slice(0, 100) : project.name;
  await env.DB.prepare('UPDATE projects SET updated_at = ?, name = ? WHERE id = ?').bind(now, name, project.id).run();

  return new Response(JSON.stringify({ ok: true, updated_at: now }), { status: 200, headers });
}

export async function onRequestDelete(context) {
  const { env, data, params } = context;
  const headers = { 'content-type': 'application/json' };
  const project = await findOwnedProject(env, params.id, data.user.userId);
  if (!project) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });

  await env.PROJECTS_BUCKET.delete(project.r2_key);
  await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(project.id).run();

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
