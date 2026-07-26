// Public read endpoint for uploaded images. Intentionally unauthenticated so
// exported and published pages can display them; keys are unguessable UUIDs.

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const parts = Array.isArray(params.path) ? params.path : [params.path];

  // Only ever resolve inside uploads/, and never allow traversal segments.
  if (!parts.length || parts.some((p) => !p || p === '.' || p === '..' || p.includes('/'))) {
    return new Response('Not found', { status: 404 });
  }

  const key = 'uploads/' + parts.join('/');
  const object = await env.PROJECTS_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const etag = object.httpEtag;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      etag,
    },
  });
}
