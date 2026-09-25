import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'tirol_neustart_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function isAuthConfigured() {
  return Boolean(process.env.APP_ACCESS_PASSWORD?.trim() && process.env.AUTH_SECRET?.trim());
}

function sign(payload) {
  return createHmac('sha256', process.env.AUTH_SECRET.trim()).update(payload).digest('base64url');
}

function getCookie(request, name) {
  const cookieHeader = request.headers.cookie || '';
  const entry = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : '';
}

export function hasValidSession(request) {
  const token = getCookie(request, COOKIE_NAME);
  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length > 0) return false;

  const expectedSignature = sign(payload);
  const expectedHash = createHash('sha256').update(expectedSignature).digest();
  const suppliedHash = createHash('sha256').update(suppliedSignature).digest();
  if (!timingSafeEqual(expectedHash, suppliedHash)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function requireAuth(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!isAuthConfigured()) {
    response.status(503).json({ error: 'Zugriffsschutz ist nicht eingerichtet. APP_ACCESS_PASSWORD und AUTH_SECRET fehlen in Vercel.' });
    return false;
  }
  if (!hasValidSession(request)) {
    response.status(401).json({ error: 'Bitte zuerst anmelden.' });
    return false;
  }
  return true;
}

export function verifyCredentials(username, password) {
  const expectedUsername = process.env.APP_ACCESS_USER?.trim() || 'admin';
  const suppliedUsername = String(username || '').trim();
  const userMatches = timingSafeEqual(
    createHash('sha256').update(expectedUsername).digest(),
    createHash('sha256').update(suppliedUsername).digest(),
  );
  const expected = createHash('sha256').update(process.env.APP_ACCESS_PASSWORD || '').digest();
  const supplied = createHash('sha256').update(String(password || '')).digest();
  const passwordMatches = timingSafeEqual(expected, supplied);
  return userMatches && passwordMatches && isAuthConfigured();
}

export function createSessionCookie(request) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.VERCEL === '1' || request.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE_NAME}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(request) {
  const secure = process.env.VERCEL === '1' || request.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE_NAME}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}
