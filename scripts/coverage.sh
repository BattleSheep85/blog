#!/usr/bin/env bash
# Coverage gate for the pure-logic layer — zero npm, uses Node's built-in V8
# coverage. Exits non-zero if any threshold is missed. Run: bash scripts/coverage.sh
#
# Scope = the deterministic, runtime-free modules (validation, scoring, faceting,
# URL/affiliate tagging, pure render helpers). I/O modules (db, classifier, search
# providers, handlers, engine LLM, full SSR pages) need the Cloudflare runtime and
# are integration code — out of this unit-coverage target by design.
#
# Current: 11/12 modules at 100% line; affiliate-links.js has ONE unreachable
# defensive catch (the URL is pre-validated by isValidHttpsUrl, so the inner
# new URL() cannot throw) → 99.85% line overall. Thresholds are set just under
# that so a real regression fails the gate while the dead catch doesn't.
set -euo pipefail
cd "$(dirname "$0")/.."

INCLUDES=(
  worker/lib/brand-quality.js
  worker/lib/foss-leaders.js
  worker/lib/product-search.js
  worker/lib/affiliate-links.js
  worker/lib/utils.js
  worker/lib/credibility.js
  worker/lib/status.js
  worker/lib/guides.js
  worker/lib/engine-config.js
  worker/lib/ads.js
  worker/lib/html.js
  worker/lib/search-bar.js
  worker/lib/burst-gate.js
  worker/lib/llm-json.js
  worker/lib/pool.js
  worker/engine/validate.js
  worker/engine/prompts.js
)
ARGS=()
for f in "${INCLUDES[@]}"; do ARGS+=("--test-coverage-include=$f"); done

exec node --test --experimental-test-coverage \
  --test-coverage-lines=99 \
  --test-coverage-functions=94 \
  --test-coverage-branches=85 \
  "${ARGS[@]}" \
  scripts/coverage.test.mjs
