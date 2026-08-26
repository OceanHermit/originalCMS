import { SITE_PREFIX, isValidSlug, ensureSitesTable } from '../../utils/sites.js';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Unpublish: removes the served files and the row. Only the owner may do this.
export async function onRequestDelete(context) {
  const { env, data, params } = context;
  const slug = params.slug;
  if (!isValidSlug(slug)) return json({ error: 'bad_slug' }, 400);

  await ensureSitesTable(env);
  const row = await env.DB.prepare('SELECT user_id FROM sites WHERE slug = ?').bind(slug).first();
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.user_id !== data.user.userId) return json({ error: 'forbidden' }, 403);

  const prefix = `${SITE_PREFIX}${slug}/`;
  let cursor;
  do {
    const listed = await env.PROJECTS_BUCKET.list({ prefix, cursor, limit: 1000 });
    if (listed.objects.length) {
      await env.PROJECTS_BUCKET.delete(listed.objects.map((o) => o.key));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await env.DB.prepare('DELETE FROM sites WHERE slug = ?').bind(slug).run();
  return json({ ok: true });
}
