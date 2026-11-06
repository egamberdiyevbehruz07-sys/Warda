// Reads data from Billz for the Stock Book site. The Billz key stays here, on the server.
// Reads BILLZ_INT_KEY_2, BILLZ_INT_KEY, BILLZ_TME_KEY, or legacy BILLZ_SECRET from Netlify environment variables.
const API = 'https://api-admin.billz.ai';
const PLATFORM_ID = '7d4a4c38-dd84-4902-b744-0488b80a4c01';
const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAqFp2SG979LRDAFDCXfrhbam3eA8vtsbA';

// Only these read-only Billz endpoints can be called through this function.
const ALLOWED = [
  /^\/v1\/shop$/,
  /^\/v1\/import-report-table$/,
  /^\/v2\/transfer$/,
  /^\/v2\/transfer-items\/[A-Za-z0-9-]+$/,
  /^\/v1\/write-off-report-table$/,
  /^\/v1\/product-general-table$/,
  /^\/v1\/stock-report-table$/,
  /^\/v2\/products$/,
];

let cached = { token: null, until: 0 };

const reply = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

async function billzLogin() {
  const secret = process.env.BILLZ_INT_KEY_2 || process.env.BILLZ_INT_KEY || process.env.BILLZ_TME_KEY || process.env.BILLZ_SECRET;
  if (!secret) throw new Error('BILLZ_INT_KEY_2, BILLZ_INT_KEY, BILLZ_TME_KEY, or legacy BILLZ_SECRET is not set in Render environment variables.');
  const r = await fetch(API + '/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'platform-id': PLATFORM_ID },
    body: JSON.stringify({ secret_token: secret }),
  });
  const j = await r.json().catch(() => ({}));
  const token = j && j.data && j.data.access_token;
  if (!r.ok || !token) throw new Error('Billz login failed (' + r.status + '): ' + JSON.stringify(j).slice(0, 200));
  cached = { token, until: Date.now() + 10 * 60 * 1000 };
  return token;
}

async function getToken(force) {
  if (!force && cached.token && Date.now() < cached.until) return cached.token;
  return billzLogin();
}

// The caller must be logged in to the Stock Book site (Firebase).
async function isSignedIn(event) {
  const h = event.headers.authorization || event.headers.Authorization || '';
  const idToken = h.replace(/^Bearer\s+/i, '');
  if (!idToken) return false;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return false;
  const j = await r.json().catch(() => ({}));
  return !!(j.users && j.users.length);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return reply(405, { error: 'GET only' });
    if (!(await isSignedIn(event))) return reply(401, { error: 'Not signed in' });

    const params = event.queryStringParameters || {};
    const path = params.path || '';
    if (!ALLOWED.some((re) => re.test(path))) return reply(400, { error: 'Endpoint not allowed: ' + path });

    const q = new URLSearchParams();
    for (const k of Object.keys(params)) if (k !== 'path') q.set(k, params[k]);
    const url = API + path + (q.toString() ? '?' + q.toString() : '');

    const call = async (token) =>
      fetch(url, { headers: { Authorization: 'Bearer ' + token, 'platform-id': PLATFORM_ID } });

    let r = await call(await getToken(false));
    if (r.status === 401) r = await call(await getToken(true));
    const text = await r.text();
    return { statusCode: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: text };
  } catch (e) {
    return reply(500, { error: String((e && e.message) || e) });
  }
};
