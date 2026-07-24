export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/callback`;
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  const headers = new Headers();
  headers.set('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  headers.append('Set-Cookie', `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  return new Response(null, { status: 302, headers });
}
