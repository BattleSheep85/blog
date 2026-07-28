// Full-coverage assertions for the shared bounded-concurrency pool.
import { runPool } from '../../worker/lib/pool.js';

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export async function runPoolTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // Order preservation: thunks resolve out of order (later ones finish
  // first), but the result array stays index-aligned with the input order.
  {
    const thunks = [
      () => delay(30, 'a'),
      () => delay(5, 'b'),
      () => delay(15, 'c'),
    ];
    const results = await runPool(thunks, 3);
    eq('order preserved despite uneven timing', results, ['a', 'b', 'c']);
  }

  // Concurrency actually bounded: track in-flight count across more thunks
  // than the limit, and assert the observed max equals (not just <=) the limit.
  {
    let inFlight = 0;
    let maxInFlight = 0;
    const makeThunk = () => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(10);
      inFlight--;
      return 'done';
    };
    const thunks = Array.from({ length: 10 }, makeThunk);
    const results = await runPool(thunks, 3);
    ok('concurrency never exceeds the limit', maxInFlight <= 3);
    ok('concurrency actually reaches the limit (not serialized)', maxInFlight === 3);
    eq('all thunks completed', results.length, 10);
    ok('every result completed', results.every((r) => r === 'done'));
  }

  // A throwing thunk mapped by a custom onError(err, index).
  {
    const thunks = [
      () => Promise.resolve('ok'),
      () => { throw new Error('boom'); },
      () => Promise.resolve('ok2'),
    ];
    const results = await runPool(thunks, 2, (err, index) => `mapped:${index}:${err.message}`);
    eq('onError maps the thrown thunk by index', results, ['ok', 'mapped:1:boom', 'ok2']);
  }

  // Default null mapper when onError is not supplied.
  {
    const thunks = [
      () => Promise.resolve(1),
      () => { throw new Error('nope'); },
    ];
    const results = await runPool(thunks, 2);
    eq('default onError maps a throw to null', results, [1, null]);
  }

  // Empty input array.
  {
    const results = await runPool([], 5);
    eq('empty input → empty output', results, []);
  }

  // Limit greater than the input length: still runs every thunk once.
  {
    const results = await runPool([() => Promise.resolve('x'), () => Promise.resolve('y')], 100);
    eq('limit greater than input length still works', results, ['x', 'y']);
  }

  // Limit 0 or negative must not throw — the safe clamp always runs at
  // least one worker instead of passing a non-positive length to Array.from.
  {
    let threwZero = false;
    let resultsZero;
    try {
      resultsZero = await runPool([() => Promise.resolve('z')], 0);
    } catch {
      threwZero = true;
    }
    ok('limit 0 does not throw', !threwZero);
    eq('limit 0 still processes the thunk', resultsZero, ['z']);

    let threwNeg = false;
    let resultsNeg;
    try {
      resultsNeg = await runPool([() => Promise.resolve('n1'), () => Promise.resolve('n2')], -5);
    } catch {
      threwNeg = true;
    }
    ok('negative limit does not throw', !threwNeg);
    eq('negative limit still processes all thunks', resultsNeg, ['n1', 'n2']);
  }

  return report;
}
