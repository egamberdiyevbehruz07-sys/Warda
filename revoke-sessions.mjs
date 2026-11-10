import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const response = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function adminApp() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw Object.assign(new Error('All-device logout is not configured. Add a newly rotated FIREBASE_SERVICE_ACCOUNT_JSON to Render.'), { status: 503 });
  let service;
  try { service = JSON.parse(raw); } catch { throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'), { status: 503 }); }
  if (service.private_key) service.private_key = String(service.private_key).replace(/\\n/g, '\n');
  if (service.project_id !== 'system-proof' || !service.client_email || !service.private_key) {
    throw Object.assign(new Error('The Firebase Admin service account must belong to the Stock Book Firebase project.'), { status: 503 });
  }
  const existing = getApps().find(app => app.name === 'stockbook-admin');
  return existing || initializeApp({ credential: cert(service), projectId: service.project_id }, 'stockbook-admin');
}

export default async function revokeSessions(request) {
  if (request.method !== 'POST') return response(405, { error: 'POST only.' });
  const authHeader = request.headers.get('authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!idToken) return response(401, { error: 'Sign in again before logging out other devices.' });
  try {
    const app = adminApp();
    const auth = getAuth(app);
    const decoded = await auth.verifyIdToken(idToken, true);
    await auth.revokeRefreshTokens(decoded.uid);
    const user = await auth.getUser(decoded.uid);
    const revokedAt = Date.parse(user.tokensValidAfterTime || '') || Date.now();
    await getFirestore(app).collection('moves').doc('auth_revoke_' + decoded.uid).set({
      type: 'meta', ns: true, authSessionRevokedUid: decoded.uid,
      authSessionRevokedAtMs: revokedAt, authSessionRevokedAt: new Date(revokedAt).toISOString(),
    }, { merge: true });
    return response(200, { ok: true, revokedAt });
  } catch (error) {
    const status = error && error.status || (error && error.code === 'auth/id-token-revoked' ? 401 : 500);
    return response(status, { error: status === 500 ? 'Firebase could not revoke sessions. Check the Render Admin SDK setup and logs.' : String(error.message || error) });
  }
}
