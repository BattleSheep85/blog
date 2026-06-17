# GLM-5.2 vs the synth incumbent — empirical follow-up (2026-06-17)

_Z.ai released **GLM-5.2** on 2026-06-16 (753B open-weights MIT, 1M context). It leads the Artificial Analysis Intelligence Index for open models (51 vs kimi-k2.6's 43) — but that index is **coding/agentic-weighted**, and the [main engine bench](./engine-llm-bench-2026-06.md) already proved leaderboard rank ≠ honesty here (qwen3.5, gemini-3.5 topped charts but failed the trap test). So we ran GLM-5.2 through the **real synthesis honesty harness**._

## TL;DR — **SWAP synthesis to `z-ai/glm-5.2` (reasoning OFF)**

GLM-5.2 (reasoning off) beats the incumbent kimi-k2.6 on **every axis that matters** and closes ~half the gap to the opus-4.8 honesty ceiling for essentially free. Keep **gemini-2.5-flash** for the planner. Reasoning must stay **OFF** (the kimi gotcha reproduces).

| Synth config | Overall honesty | **Faithfulness** | Trap handled | Conflict-flag | Schema | $/call | Latency |
|---|---|---|---|---|---|---|---|
| **`z-ai/glm-5.2` (reasoning OFF)** ✅ | **0.91** | **0.87** | 2/2 | 0.99 | **1.00** | $0.0126 | **32s** |
| `z-ai/glm-5.2` (reasoning ON) | 0.90 | 0.82 | 2/2 | 0.99 | 0.967 | $0.0194 | 63s |
| `moonshotai/kimi-k2.6` (incumbent, OFF) | 0.84 | **0.74** | 2/2 | 0.97 | 0.834 | $0.0117 | 41s |
| `anthropic/claude-opus-4.8` (anchor, OFF) | 0.94 | 0.91 | 2/2 | 1.00 | 1.00 | $0.105 | 40s |

## Why — faithfulness is the differentiator, and kimi is the weakest

Every config nailed the **trap** (omitted the affiliate/listicle-hyped no-name product 2/2) and flagged conflict sourcing (~0.97–1.0). The trap is no longer the discriminator — **faithfulness** (claims traceable to the supplied sources, no ungrounded spec injection) is, and the consensus order is opus 0.91 > **glm-OFF 0.87** > glm-ON 0.82 > **kimi 0.74**.

- **kimi-k2.6 (0.74)** systematically launders ungrounded specs as fact — fabricated "35-hour battery", "Bluetooth 5.0", "40-hour ANC", **synthetic per-product ratings** (4.4/4.2/4.0), invented freshness metadata ("2024 within 12-month window of 2026" — internally inconsistent), and in one run **dropped a legit product** (NuPhy Air75) that had hands-on + community backing. That is precisely the dishonesty TrueRank exists to avoid.
- **glm-5.2 OFF (0.87)** bugs are milder and don't distort ranking: one source mislabel (RTINGS vs Reddit), one unsourced "~$100" price, a loose source count. Plus **perfect schema (1.0 vs 0.834)** — retires the off-spec-JSON / empty-synthesis risk kimi carries.
- **glm-5.2 ON (0.90)** is *worse* than OFF: +54% cost, ~2× latency, more unsourced enrichment, and it emitted **Chinese-language fabricated specs** ("电池续航长达35小时"). Reasoning ON also starves short structured calls (see planner below). Keep `synthReasoning:{enabled:false}`.

## Planner — keep `gemini-2.5-flash`

10-item skepticism / BS-detection probe (`glm52-planner-skep.mjs`):

| Planner config | skep_acc | BS-detect | ctrl | json | $/10 | p50 |
|---|---|---|---|---|---|---|
| **gemini-2.5-flash (incumbent)** ✅ | 1.00 | 1.00 | 1.00 | 1.00 | $0.0019 | **0.98s** |
| glm-5.2 (reasoning OFF) | 1.00 | 1.00 | 1.00 | 1.00 | $0.0056 | 8.2s |
| glm-5.2 (reasoning ON) | 0.20 | 0.14 | — | 0.20 | — | 16s (2 err) |

GLM-5.2 OFF *matches* gemini's perfect skepticism but at **3× cost and 8× latency** for a role fired dozens of times/run → no swap. Reasoning ON face-plants (starved JSON on a 400-token budget) — the gotcha, confirmed.

## Methodology

- **Synth:** the engine's real `buildSynthesisPrompt` against the planted-trap fixtures (`synth-fixture.mjs`: 2 scenarios, credible [hands-on]/[expert-domain] sources beside an affiliate/listicle-hyped no-name `trap`). Script: `glm52-synth-bench.mjs`. Raw outputs: `results/glm52-synth-raw.json`.
- **Honesty scoring:** 4 sub-axes (trap-handling, faithfulness, conflict-flagging, marketing-filter) + overall, **3 independent adversarial Claude judges per output × 8 outputs = 24 judges**, consensus by mean (off the OpenRouter budget; judge spread ≤ 0.10). Matches the project's "judge panel" precedent.
- **Cost/latency:** OpenRouter `usage.cost` (authoritative) + wall-clock p50. Pricing: glm-5.2 $1.40/$4.40, kimi $0.95/$4.00, opus $5/$25 per M.

## Caveats (carry into the rollout)

1. **2-scenario sample** — directionally strong (per-query GLM-OFF 0.89/0.93) but small n. Confirm on the full set via `node scripts/run-eval.mjs` after the swap.
2. **Off-spec JSON reduced, not zero** — GLM scored schema 1.0 here, but it's a new model; keep `validate.js` strict and watch the first ~20 live runs.
3. **Reasoning-default gotcha applies to GLM** — its honesty/output materially differ ON vs OFF, so the explicit `synthReasoning:{enabled:false}` MUST be carried over (don't assume GLM defaults off).

## Exact change (gated)

```js
// worker/lib/tiers.js line 20
synthModel: 'z-ai/glm-5.2',   // was moonshotai/kimi-k2.6 — keep synthReasoning:{enabled:false}
```

Recommended rollout: env-overridable (`env.SYNTH_MODEL || 'z-ai/glm-5.2'`) so a bad live run reverts to kimi without a redeploy, then `run-eval.mjs` to confirm on the full golden set. The off-CF blackbox worker runs the same engine → it needs the rsync+restart deploy too.

## Spend ledger

| Phase | Spend |
|---|---|
| Synth bench (4 configs × 2 scenarios) | $0.297 |
| Planner skepticism (3 configs × 10) | $0.009 |
| 24 honesty judges + synthesis | $0 (off OpenRouter) |
| **Total** | **≈ $0.31 / $100 key cap** |
