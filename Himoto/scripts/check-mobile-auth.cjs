const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { NextRequest } = require('next/server');
const { load } = require('./lib/load-typescript.cjs');

const root = path.resolve(__dirname, '../src');
const sessions = load(path.join(root, 'lib/server/mobile/mobile-sessions'));
const management = load(path.join(root, 'lib/server/management-session'));
const databaseModule = load(path.join(root, 'lib/server/himoto-database'));

async function run() {
  const password = 'mobile-auth-test-password';
  let account = {
    id: '7', name: 'Mobile QA', email: 'mobile@example.invalid', password: await bcrypt.hash(password, 10),
    status: 'active', role: 'admin', role_id: '1', role_slug: 'quan-tri-vien',
  };
  let record = null;
  const loginAttempts = new Map();
  const db = { query: async (sql, values = []) => {
    if (sql.includes('INSERT INTO himoto.management_mobile_login_attempts')) {
      const next = Math.min((loginAttempts.get(values[0]) || 0) + 1, 11);
      loginAttempts.set(values[0], next);
      return { rows: [{ attempts: next }], rowCount: 1 };
    }
    if (sql.includes('DELETE FROM himoto.management_mobile_login_attempts')) {
      loginAttempts.delete(values[0]);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO himoto.management_mobile_sessions')) {
      assert.equal(values.length, 6);
      record = { id: values[0], user_id: values[1], access_hash: values[2], refresh_hash: values[3], access_expiry: values[4], refresh_expiry: values[5], revoked: false };
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT user_id FROM himoto.management_mobile_sessions')) {
      const active = record && !record.revoked && values[0] === record.id && values[1] === record.access_hash
        && Date.parse(record.access_expiry) > Date.now() && Date.parse(record.refresh_expiry) > Date.now();
      return { rows: active ? [{ user_id: record.user_id }] : [], rowCount: active ? 1 : 0 };
    }
    if (sql.includes('SET access_token_hash=$1,refresh_token_hash=$2')) {
      const active = record && !record.revoked && values[3] === record.id && values[4] === record.refresh_hash && Date.parse(record.refresh_expiry) > Date.now();
      if (!active) return { rows: [], rowCount: 0 };
      record.access_hash = values[0]; record.refresh_hash = values[1];
      record.access_expiry = new Date(Math.min(Date.parse(values[2]), Date.parse(record.refresh_expiry))).toISOString();
      return { rows: [{ user_id: record.user_id, access_expires_at: record.access_expiry, refresh_expires_at: record.refresh_expiry }], rowCount: 1 };
    }
    if (sql.includes('UPDATE himoto.management_mobile_sessions SET revoked_at=now()')) {
      if (record && record.id === values[0] && (values.length === 1 || record.refresh_hash === values[1])) record.revoked = true;
      return { rows: [], rowCount: record?.revoked ? 1 : 0 };
    }
    if (sql.includes('FROM himoto.users u') && sql.includes('lower(u.email)')) {
      return { rows: account && values[0] === account.email ? [account] : [], rowCount: account && values[0] === account.email ? 1 : 0 };
    }
    if (sql.includes('FROM himoto.users u') && sql.includes('WHERE u.id=$1')) {
      return { rows: account && Number(values[0]) === Number(account.id) ? [account] : [], rowCount: account && Number(values[0]) === Number(account.id) ? 1 : 0 };
    }
    throw new Error(`Unexpected mobile auth query: ${sql.slice(0, 80)}`);
  } };

  const issued = await sessions.issueMobileSession(7, db);
  assert.equal(issued.accessToken.split('.')[0], record.id);
  assert.notEqual(issued.accessToken, issued.refreshToken);
  assert(!JSON.stringify(record).includes(issued.accessToken));
  assert.equal((await sessions.resolveMobileSession(issued.accessToken, db)).id, 7);
  assert.equal(await sessions.resolveMobileSession(issued.refreshToken, db), null);
  assert.equal(await sessions.resolveMobileSession('bad-token', db), null);

  const rotated = await sessions.rotateMobileSession(issued.refreshToken, db);
  assert.equal(rotated.user.id, 7);
  assert.equal(await sessions.resolveMobileSession(issued.accessToken, db), null);
  await assert.rejects(sessions.rotateMobileSession(issued.refreshToken, db), error => error.status === 401);
  assert.equal((await sessions.resolveMobileSession(rotated.accessToken, db)).id, 7);
  await sessions.revokeMobileSession(rotated.refreshToken, db);
  assert.equal(await sessions.resolveMobileSession(rotated.accessToken, db), null);

  const previousEnv = { DATABASE_URL: process.env.DATABASE_URL, MANAGEMENT_SESSION_SECRET: process.env.MANAGEMENT_SESSION_SECRET, NODE_ENV: process.env.NODE_ENV };
  const descriptor = Object.getOwnPropertyDescriptor(databaseModule.ownerDatabase, 'query');
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.MANAGEMENT_SESSION_SECRET = 'mobile-unit-session-secret-at-least-32-characters';
  process.env.NODE_ENV = 'development';
  Object.defineProperty(databaseModule.ownerDatabase, 'query', { configurable: true, value: db.query });
  const request = (url, init = {}) => new NextRequest(`http://localhost${url}`, init);
  const jsonPost = (url, body) => request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const login = load(path.join(root, 'app/api/mobile/v1/auth/login/route'));
    const refresh = load(path.join(root, 'app/api/mobile/v1/auth/refresh/route'));
    const logout = load(path.join(root, 'app/api/mobile/v1/auth/logout/route'));
    const me = load(path.join(root, 'app/api/mobile/v1/me/route'));
    const webCookie = `${management.SESSION_COOKIE}=${management.signSession(7)}`;
    assert.equal((await me.GET(request('/api/mobile/v1/me', { headers: { cookie: webCookie } }))).status, 401);
    assert.equal((await login.POST(jsonPost('/api/mobile/v1/auth/login', { email: account.email, password: 'wrong' }))).status, 401);
    for (let attempt = 0; attempt < 9; attempt++) {
      assert.equal((await login.POST(jsonPost('/api/mobile/v1/auth/login', { email: account.email, password: 'wrong' }))).status, 401);
    }
    assert.equal((await login.POST(jsonPost('/api/mobile/v1/auth/login', { email: account.email, password: 'wrong' }))).status, 429);
    loginAttempts.clear();
    const loggedIn = await login.POST(jsonPost('/api/mobile/v1/auth/login', { email: account.email, password }));
    assert.equal(loggedIn.status, 201);
    assert.equal(loggedIn.headers.get('cache-control'), 'no-store');
    assert.equal(loggedIn.headers.get('set-cookie'), null);
    const first = (await loggedIn.json()).data;
    assert.equal(first.user.id, 7);
    const auth = token => ({ authorization: `Bearer ${token}` });
    assert.equal((await me.GET(request('/api/mobile/v1/me', { headers: auth(first.accessToken) }))).status, 200);
    const next = await refresh.POST(jsonPost('/api/mobile/v1/auth/refresh', { refreshToken: first.refreshToken }));
    assert.equal(next.status, 200);
    const fresh = (await next.json()).data;
    assert.equal((await me.GET(request('/api/mobile/v1/me', { headers: auth(first.accessToken) }))).status, 401);
    assert.equal((await me.GET(request('/api/mobile/v1/me', { headers: auth(fresh.accessToken) }))).status, 200);
    assert.equal((await logout.POST(jsonPost('/api/mobile/v1/auth/logout', { refreshToken: fresh.refreshToken }))).status, 200);
    assert.equal((await me.GET(request('/api/mobile/v1/me', { headers: auth(fresh.accessToken) }))).status, 401);

    const branch = { ...account, access_role: 'branch_staff', access_store_id: '23', scope_all: false, access_enabled: true, permissions: ['contracts.read'] };
    account = branch;
    const branchSession = await sessions.issueMobileSession(7, db);
    const { withMobileRequest } = load(path.join(root, 'lib/server/mobile/mobile-request'));
    const { dataAccess } = load(path.join(root, 'lib/server/access-context'));
    const customer = withMobileRequest('customers.read', () => new Response(null, { status: 204 }));
    const fleet = withMobileRequest('vehicles.read', () => {
      assert.equal(dataAccess.getStore().store_id, 23);
      assert.equal(dataAccess.getStore().scope_all, false);
      return new Response(null, { status: 204 });
    }, 'fleet_read');
    assert.equal((await customer(request('/api/mobile/v1/customers', { headers: auth(branchSession.accessToken) }))).status, 403);
    assert.equal((await fleet(request('/api/mobile/v1/vehicles', { headers: auth(branchSession.accessToken) }))).status, 204);
    account = { ...branch, access_enabled: false };
    assert.equal((await me.GET(request('/api/mobile/v1/me', { headers: auth(branchSession.accessToken) }))).status, 401);
    assert.equal(record.revoked, true);
  } finally {
    Object.defineProperty(databaseModule.ownerDatabase, 'query', descriptor);
    for (const [key, value] of Object.entries(previousEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    management.clearLoginLimit('mobile@example.invalid');
  }
  console.log('Mobile auth: issue, rotate, revoke, bearer-only routes, permission and branch scope passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
