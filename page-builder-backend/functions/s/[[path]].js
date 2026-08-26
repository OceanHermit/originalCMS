import { SITE_PREFIX, SITE_CSP, contentTypeFor, isValidSlug } from '../utils/sites.js';

// Serves published sites at /s/<slug>/... . Public by design; the response
// headers sandbox the page so author-supplied HTML cannot act against our API
// with a visitor's session.
export async function onRequestGet(context) {
  const { env, params, request } = context;
  const parts = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean);

  if (!parts.length) return new Response('Not found', { status: 404 });

  const slug = parts[0];
  if (!isValidSlug(slug)) return new Response('Not found', { status: 404 });

  const rest = parts.slice(1);
  if (rest.some((p) => !p || p === '.' || p === '..' || p.includes('/'))) {
    return new Response('Not found', { status: 404 });
  }

  // /s/<slug> and /s/<slug>/ both resolve to the site's index.
  let name = rest.length ? rest[rest.length - 1] : 'index.html';
  if (rest.length > 1) return new Response('Not found', { status: 404 });
  if (!name.includes('.')) name = name + '.html';

  const type = contentTypeFor(name);
  if (!type) return new Response('Not found', { status: 404 });

  const object = await env.PROJECTS_BUCKET.get(`${SITE_PREFIX}${slug}/${name}`);
  if (!object) return new Response('Not found', { status: 404 });

  const etag = object.httpEtag;
  const headers = {
    'content-type': type,
    'cache-control': 'public, max-age=60',
    'content-security-policy': SITE_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    etag,
  };

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
}
