// Unit tests for the worker-auth module.
import { timingSafeEqual, isWorkerAuthed } from '../../worker/lib/worker-auth.js';

export async function runWorkerAuthTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // ── timingSafeEqual ──────────────────────────────────────────────────────────
  {
    ok('timingSafeEqual: identical strings return true', await timingSafeEqual('test-secret-123', 'test-secret-123'));
    ok('timingSafeEqual: different strings same length return false', !(await timingSafeEqual('secret-1', 'secret-2')));
    ok('timingSafeEqual: different strings different length return false', !(await timingSafeEqual('secret', 'secret-long')));
    ok('timingSafeEqual: both empty strings return true', await timingSafeEqual('', ''));
    ok('timingSafeEqual: first empty second non-empty returns false', !(await timingSafeEqual('', 'secret')));
    ok('timingSafeEqual: first non-empty second empty returns false', !(await timingSafeEqual('secret', '')));
  }

  // ── isWorkerAuthed ───────────────────────────────────────────────────────────
  {
    const SECRET = 'test-worker-secret-456';

    // no WORKER_SECRET in env -> false even with a matching header
    {
      const req = new Request('https://x/api/internal/test', {
        headers: { 'X-Worker-Secret': SECRET },
      });
      eq('no WORKER_SECRET in env (empty object)', await isWorkerAuthed(req, {}), false);
      eq('no WORKER_SECRET in env (empty string)', await isWorkerAuthed(req, { WORKER_SECRET: '' }), false);
      eq('no WORKER_SECRET in env (null)', await isWorkerAuthed(req, { WORKER_SECRET: null }), false);
      eq('no WORKER_SECRET in env (undefined)', await isWorkerAuthed(req, { WORKER_SECRET: undefined }), false);
    }

    // missing header -> false
    {
      const req = new Request('https://x/api/internal/test');
      eq('missing X-Worker-Secret header', await isWorkerAuthed(req, { WORKER_SECRET: SECRET }), false);
    }

    // wrong secret -> false
    {
      const req = new Request('https://x/api/internal/test', {
        headers: { 'X-Worker-Secret': 'wrong-secret' },
      });
      eq('wrong secret header', await isWorkerAuthed(req, { WORKER_SECRET: SECRET }), false);
    }

    // exact match -> true
    {
      const req = new Request('https://x/api/internal/test', {
        headers: { 'X-Worker-Secret': SECRET },
      });
      eq('exact match returns true', await isWorkerAuthed(req, { WORKER_SECRET: SECRET }), true);
    }
  }

  return report;
}
