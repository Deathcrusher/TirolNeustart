import {
  clearSessionCookie,
  createSessionCookie,
  hasValidSession,
  isAuthConfigured,
  verifyCredentials,
} from '../lib/auth.js';

export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST, DELETE');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isAuthConfigured()) {
    response.status(503).json({ error: 'Zugriffsschutz ist nicht eingerichtet. APP_ACCESS_PASSWORD und AUTH_SECRET fehlen in Vercel.' });
    return;
  }

  if (request.method === 'GET') {
    response.status(200).json({ authenticated: hasValidSession(request) });
    return;
  }

  if (request.method === 'DELETE') {
    response.setHeader('Set-Cookie', clearSessionCookie(request));
    response.status(200).json({ authenticated: false });
    return;
  }

  const username = typeof request.body?.username === 'string' ? request.body.username.slice(0, 128) : '';
  const password = typeof request.body?.password === 'string' ? request.body.password.slice(0, 512) : '';
  if (!verifyCredentials(username, password)) {
    response.status(401).json({ error: 'Benutzername oder Passwort ist nicht korrekt.' });
    return;
  }

  response.setHeader('Set-Cookie', createSessionCookie(request));
  response.status(200).json({ authenticated: true });
}
