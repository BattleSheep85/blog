// Workers integration-test harness (Miniflare-backed, via vitest-pool-workers).
// Runs tests INSIDE workerd with real local D1 + KV bindings read from
// wrangler.toml, so handlers / db / KV-backed logic can be exercised the way the
// deployed worker runs them. DEV-ONLY — never ships to the worker.
//
// The fast pure-logic suites stay on `node scripts/run-tests.mjs` (zero-dep);
// these integration specs live under test/integration/ and run via `npx vitest`.
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['test/integration/**/*.spec.js'],
    coverage: {
      provider: 'istanbul', // v8 coverage doesn't work inside workerd; istanbul does
      reporter: ['text', 'text-summary'],
      include: [
        'worker/lib/db.js', 'worker/lib/rate-limit.js', 'worker/lib/sitemap.js',
        'worker/handlers/affiliate.js', 'worker/handlers/report.js', 'worker/handlers/internal.js',
        'worker/lib/classifier.js', 'worker/lib/indexnow.js',
        'worker/lib/asin-resolver.js', 'worker/lib/image-resolver.js',
        'worker/lib/youtube.js', 'worker/lib/jina.js', 'worker/lib/duckduckgo.js', 'worker/lib/rss.js',
        'worker/engine/parallel-engine.js',
        'worker/index.js',
      ],
    },
    poolOptions: {
      workers: {
        // Inherit bindings (DB, KV, vars, compatibility_date) from the real
        // wrangler config; Miniflare provides in-memory local D1/KV for tests
        // so nothing touches production.
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
