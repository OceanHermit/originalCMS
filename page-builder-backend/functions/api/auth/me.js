import { getCookie, verifySession } from '../../utils/auth.js';

export async function onRequestGet({ request, env }) {
  const cookie = getCookie(request, 'session');
  const session = cookie ? await verifySession(cookie, env.SESSION_SECRET) : null;
  const headers = { 'content-type': 'application/json' };
  if (!session) return new Response(JSON.stringify({ user: null }), { status: 200, headers });
  return new Response(JSON.stringify({ user: { email: session.email } }), { status: 200, headers });
}
