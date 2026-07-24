import { exchangeGoogleCode, verifyGoogleIdToken, signSession, makeSessionCookie, getCookie, newId } from '../../utils/auth.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = getCookie(request, 'oauth_state');

  if (!code || !state || state !== savedState) {
    return new Response('Invalid OAuth state. Please try signing in again.', { status: 400 });
  }

  const redirectUri = `${url.origin}/api/auth/callback`;

  let claims;
  try {
    const tokenResp = await exchangeGoogleCode(code, env, redirectUri);
    claims = await verifyGoogleIdToken(tokenResp.id_token, env.GOOGLE_CLIENT_ID);
  } catch (err) {
    return new Response('Google sign-in failed: ' + err.message, { status: 400 });
  }

  let user = await env.DB.prepare('SELECT * FROM users WHERE google_sub = ?').bind(claims.sub).first();
  if (!user) {
    const id = newId();
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, claims.sub, claims.email || '', claims.name || '', claims.picture || '', Date.now()).run();
    user = { id, email: claims.email };
  }

  const session = await signSession(
    { userId: user.id, email: user.email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 },
    env.SESSION_SECRET
  );

  const headers = new Headers();
  headers.set('Location', '/');
  headers.append('Set-Cookie', makeSessionCookie(session, 60 * 60 * 24 * 30));
  headers.append('Set-Cookie', 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  return new Response(null, { status: 302, headers });
}
