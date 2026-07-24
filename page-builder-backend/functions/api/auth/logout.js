import { clearSessionCookie } from '../../utils/auth.js';

export async function onRequestPost() {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('Set-Cookie', clearSessionCookie());
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
