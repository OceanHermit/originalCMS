import {
  SITE_PREFIX,
  contentTypeFor,
  isValidSlug,
  isValidFileName,
  ensureSitesTable,
} from '../../utils/sites.js';

const MAX_SITES_PER_USER = 20;
const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json' },
  });
}

function randomSuffix() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 6);
}

function baseSlug(title) {
  const s = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return s || 'site';
}

export async function onRequestGet(context) {
  const { env, data } = context;
  await ensureSitesTable(env);
  const { results } = await env.DB.prepare(
    'SELECT slug, title, project_id, bytes, published_at FROM sites WHERE user_id = ? ORDER BY published_at DESC'
  )
    .bind(data.user.userId)
    .all();
  return json({ sites: results });
}

export async function onRequestPost(context) {
  const { env, data, request } = context;
  const userId = data.user.userId;
  await ensureSitesTable(env);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.files !== 'object' || !body.files) {
    return json({ error: 'bad_request', message: '公開データが不正です。' }, 400);
  }

  const names = Object.keys(body.files);
  if (!names.length) return json({ error: 'empty', message: '公開するページがありません。' }, 400);
  if (names.length > MAX_FILES) return json({ error: 'too_many_files' }, 400);
  if (!names.includes('index.html')) {
    return json({ error: 'no_index', message: 'トップページが見つかりません。' }, 400);
  }

  let total = 0;
  for (const name of names) {
    if (!isValidFileName(name)) {
      return json({ error: 'bad_file', message: `不正なファイル名です: ${name}` }, 400);
    }
    const content = body.files[name];
    if (typeof content !== 'string') return json({ error: 'bad_file' }, 400);
    total += new TextEncoder().encode(content).length;
  }
  if (total > MAX_TOTAL_BYTES) {
    return json({ error: 'too_large', message: '公開データが大きすぎます(20MBまで)。' }, 413);
  }

  // Reuse the caller's slug when they own it, otherwise mint a fresh one.
  let slug = body.slug;
  if (slug) {
    if (!isValidSlug(slug)) return json({ error: 'bad_slug', message: 'URLの形式が不正です。' }, 400);
    const owner = await env.DB.prepare('SELECT user_id FROM sites WHERE slug = ?').bind(slug).first();
    if (owner && owner.user_id !== userId) {
      return json({ error: 'slug_taken', message: 'このURLは既に使われています。' }, 409);
    }
    if (!owner) {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM sites WHERE user_id = ?').bind(userId).first();
      if (count && count.n >= MAX_SITES_PER_USER) {
        return json({ error: 'site_limit', message: `公開できるサイトは${MAX_SITES_PER_USER}件までです。` }, 409);
      }
    }
  } else {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM sites WHERE user_id = ?').bind(userId).first();
    if (count && count.n >= MAX_SITES_PER_USER) {
      return json({ error: 'site_limit', message: `公開できるサイトは${MAX_SITES_PER_USER}件までです。` }, 409);
    }
    for (let i = 0; i < 5; i++) {
      const candidate = `${baseSlug(body.title)}-${randomSuffix()}`;
      const clash = await env.DB.prepare('SELECT slug FROM sites WHERE slug = ?').bind(candidate).first();
      if (!clash) {
        slug = candidate;
        break;
      }
    }
    if (!slug) return json({ error: 'slug_failed' }, 500);
  }

  // Replace the previous contents so removed pages stop being served.
  const prefix = `${SITE_PREFIX}${slug}/`;
  let cursor;
  do {
    const listed = await env.PROJECTS_BUCKET.list({ prefix, cursor, limit: 1000 });
    if (listed.objects.length) {
      await env.PROJECTS_BUCKET.delete(listed.objects.map((o) => o.key));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await Promise.all(
    names.map((name) =>
      env.PROJECTS_BUCKET.put(prefix + name, body.files[name], {
        httpMetadata: {
          contentType: contentTypeFor(name),
          cacheControl: 'public, max-age=60',
        },
      })
    )
  );

  const now = Date.now();
  const title = String(body.title || 'マイサイト').slice(0, 100);
  await env.DB.prepare(
    `INSERT INTO sites (slug, user_id, project_id, title, bytes, published_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, bytes = excluded.bytes,
       project_id = excluded.project_id, published_at = excluded.published_at`
  )
    .bind(slug, userId, body.projectId || null, title, total, now)
    .run();

  const origin = new URL(request.url).origin;
  return json({ slug, url: `${origin}/s/${slug}/`, bytes: total, published_at: now }, 201);
}
