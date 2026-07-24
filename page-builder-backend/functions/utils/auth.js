// Shared helpers for cookies, signed sessions (WebCrypto HMAC, no external deps),
// and Google OAuth. Imported by the route files under functions/api/.

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function makeSessionCookie(value, maxAgeSeconds) {
  return `session=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
  return `session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

async function hmacKey(secret) {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

// Signed session token: base64(json) + "." + base64(hmac signature).
// Not a full JWT, but the same idea, with no library dependency.
export async function signSession(payload, secret) {
  const key = await hmacKey(secret);
  const data = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  const dataB64 = btoa(unescape(encodeURIComponent(data)));
  return `${dataB64}.${sigB64}`;
}

export async function verifySession(token, secret) {
  try {
    const [dataB64, sigB64] = token.split('.');
    if (!dataB64 || !sigB64) return null;
    const key = await hmacKey(secret);
    const data = decodeURIComponent(escape(atob(dataB64)));
    const encoder = new TextEncoder();
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(data));
    if (!valid) return null;
    const payload = JSON.parse(data);
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

export async function exchangeGoogleCode(code, env, redirectUri) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Google token exchange failed: ' + (await res.text()));
  return res.json(); // { access_token, id_token, ... }
}

// Uses Google's tokeninfo endpoint to verify signature/expiry server-side,
// avoiding a hand-rolled JWKS/RS256 implementation. Fine at small-to-medium scale;
// swap for local JWKS verification later if request volume gets heavy.
export async function verifyGoogleIdToken(idToken, expectedAud) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new Error('Invalid Google ID token');
  const payload = await res.json();
  if (payload.aud !== expectedAud) throw new Error('Token audience mismatch');
  return payload; // { sub, email, name, picture, ... }
}

export function newId() {
  return crypto.randomUUID();
}
