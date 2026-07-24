import { getCookie, verifySession } from '../../utils/auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const cookie = getCookie(request, 'session');
  const session = cookie ? await verifySession(cookie, env.SESSION_SECRET) : null;

  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  context.data.user = session; // { userId, email }
  return context.next();
}
