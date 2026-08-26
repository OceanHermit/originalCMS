// Shared helpers for published sites.

export const SITE_PREFIX = 'sites/';

// Only these file types are ever written or served for a published site.
export const ALLOWED_FILES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

export function contentTypeFor(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? null : ALLOWED_FILES[name.slice(dot).toLowerCase()] || null;
}

// A published page is attacker-controlled HTML served from our own origin, so
// it must not be able to call our API with the visitor's cookies. connect-src
// 'none' blocks fetch/XHR, script-src 'self' blocks inline and third-party
// script, and form-action 'none' blocks credential-phishing forms. Embedded
// iframes (YouTube, Maps) still work through frame-src.
export const SITE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "frame-src https:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

export function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug);
}

// A published file path may only be a bare file name from ALLOWED_FILES.
export function isValidFileName(name) {
  return (
    typeof name === 'string' &&
    name.length <= 128 &&
    /^[A-Za-z0-9._-]+$/.test(name) &&
    !name.startsWith('.') &&
    name.indexOf('..') === -1 &&
    contentTypeFor(name) !== null
  );
}

let ensured = false;
export async function ensureSitesTable(env) {
  if (ensured) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sites (
       slug TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       project_id TEXT,
       title TEXT,
       bytes INTEGER NOT NULL DEFAULT 0,
       published_at INTEGER NOT NULL
     )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id)').run();
  ensured = true;
}
