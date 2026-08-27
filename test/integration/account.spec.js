// Integration coverage for /api/account/delete and /api/account/export
// routed through the real worker entry point via SELF.fetch.
import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { createUser, createSession, recordUserSearch } from '../../worker/lib/auth.js';

const BASE = 'https://chrisputer.tech';

beforeAll(async () => {
  await applySchema(env.DB);
});

describe('POST /api/account/delete', () => {
  it('an unauthenticated POST /api/account/delete is refused', async () => {
    const res = await SELF.fetch(`${BASE}/api/account/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Authentication required.');
  });

  it('a delete without the confirm field is refused', async () => {
    const userId = await createUser(env.DB, 'test-noconfirm@example.com', 'password123');
    const session = await createSession(env.DB, userId);

    // Missing confirm field
    const res1 = await SELF.fetch(`${BASE}/api/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `tr_sess=${session.token}`,
      },
      body: JSON.stringify({}),
    });
    expect(res1.status).toBe(400);
    const json1 = await res1.json();
    expect(json1.error).toContain('Confirmation required');

    // Incorrect confirm value
    const res2 = await SELF.fetch(`${BASE}/api/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `tr_sess=${session.token}`,
      },
      body: JSON.stringify({ confirm: 'yes' }),
    });
    expect(res2.status).toBe(400);
    const json2 = await res2.json();
    expect(json2.error).toContain('Confirmation required');
  });

  it('a signed-in delete removes that user\'s rows only and clears the session cookie', async () => {
    const userA = await createUser(env.DB, 'usera@example.com', 'passwordA123');
    const sessionA = await createSession(env.DB, userA);
    await recordUserSearch(env.DB, userA, 'resA1', 'query A 1');
    await recordUserSearch(env.DB, userA, 'resA2', 'query A 2');

    const userB = await createUser(env.DB, 'userb@example.com', 'passwordB123');
    const sessionB = await createSession(env.DB, userB);
    await recordUserSearch(env.DB, userB, 'resB1', 'query B 1');

    const res = await SELF.fetch(`${BASE}/api/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `tr_sess=${sessionA.token}`,
      },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('tr_sess=');
    expect(setCookie).toContain('Max-Age=0');

    // User A's rows are completely removed
    const userARow = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(userA).first();
    expect(userARow).toBeNull();

    const sessionACount = await env.DB.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ?1').bind(userA).first();
    expect(sessionACount.n).toBe(0);

    const searchesACount = await env.DB.prepare('SELECT COUNT(*) n FROM user_searches WHERE user_id = ?1').bind(userA).first();
    expect(searchesACount.n).toBe(0);

    // User B's rows remain untouched
    const userBRow = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(userB).first();
    expect(userBRow).not.toBeNull();
    expect(userBRow.email).toBe('userb@example.com');

    const sessionBCount = await env.DB.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ?1').bind(userB).first();
    expect(sessionBCount.n).toBe(1);

    const searchesBCount = await env.DB.prepare('SELECT COUNT(*) n FROM user_searches WHERE user_id = ?1').bind(userB).first();
    expect(searchesBCount.n).toBe(1);
  });
});

describe('GET /api/account/export', () => {
  it('an unauthenticated GET /api/account/export is refused', async () => {
    const res = await SELF.fetch(`${BASE}/api/account/export`, { method: 'GET' });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Authentication required.');
  });

  it('returns that user\'s data without any password or token hash fields', async () => {
    const userId = await createUser(env.DB, 'exportuser@example.com', 'exportSecretPass123');
    const session = await createSession(env.DB, userId);
    await recordUserSearch(env.DB, userId, 'resExp1', 'best mechanical keyboard');

    const res = await SELF.fetch(`${BASE}/api/account/export`, {
      method: 'GET',
      headers: {
        'Cookie': `tr_sess=${session.token}`,
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.user).toBeDefined();
    expect(data.user.id).toBe(userId);
    expect(data.user.email).toBe('exportuser@example.com');
    expect(data.user.created_at).toBeGreaterThan(0);

    expect(Array.isArray(data.searches)).toBe(true);
    expect(data.searches).toHaveLength(1);
    expect(data.searches[0].query).toBe('best mechanical keyboard');
    expect(data.exported_at).toBeGreaterThan(0);

    // Verify explicit absence of sensitive fields
    expect(data.user.password).toBeUndefined();
    expect(data.user.password_hash).toBeUndefined();
    expect(data.user.token).toBeUndefined();
    expect(data.user.token_hash).toBeUndefined();
    expect(data.user.tokenHash).toBeUndefined();

    // Verify the serialized JSON contains no password or token hash fields
    const rawJson = JSON.stringify(data);
    expect(rawJson).not.toContain('password');
    expect(rawJson).not.toContain('pbkdf2');
    expect(rawJson).not.toContain('token');
    expect(rawJson).not.toContain('hash');
  });
});
