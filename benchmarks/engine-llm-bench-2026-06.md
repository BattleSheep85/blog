# TrueRank Engine — LLM Stack Benchmark & Recommendation (June 2026)

_Empirical benchmark of candidate models for every role in the research engine, run via REAL OpenRouter calls on the `TrueRank-Prod` key using the engine's own prompts. Quality, cost-per-run, and latency measured directly; subjective quality scored by a Claude judge (off the OpenRouter budget). Companion file: [`landscape-2026-06.md`](./landscape-2026-06.md) (cited model-landscape review). Raw per-call data in [`results/`](./results/)._

**Status:** classifier ✅ · planner ✅ · instant-synth ✅ · full-synth ✅ · exhaustive-synth ✅ — **complete.**

---

## TL;DR — recommended stack

| Role | Incumbent | Recommendation | Change? |
|---|---|---|---|
| Classifier | `google/gemini-2.5-flash-lite` | **`google/gemini-2.5-flash-lite`** | **KEEP** |
| Planner / agent-loop | `google/gemini-2.5-flash` | **`google/gemini-2.5-flash`** | **KEEP** |
| Instant synth | `anthropic/claude-haiku-4.5` | **`anthropic/claude-haiku-4.5`** | **KEEP** |
| Full synth | `anthropic/claude-sonnet-4.6` | **`anthropic/claude-sonnet-4.6`** | **KEEP** (optional: `gpt-5.4` for speed/cost) |
| Exhaustive synth | `anthropic/claude-opus-4.8` | **`anthropic/claude-opus-4.8`** | **KEEP** (optional: `kimi-k2.6` — equal honesty, 9× cheaper) |

**The benchmark validates the current stack — every role keeps its incumbent.** This is a real result, not a punt: the two changes the *literature* would have pushed (swap the planner to `qwen3.5-397b`, chase Gemini 3.x everywhere) both **failed empirically**. Reading reviews would have replaced working components with broken ones.

**Single-model verdict: NO** — one model cannot serve all five roles well (see [§ Single-model](#single-model-verdict)). The roles have opposing requirements; a combo is correct.

**Cost:** the recommended stack runs an estimated **~$36/mo** against the `$60` `MONTHLY_BUDGET_USD` cap (~40% headroom); optional optimizations bring it to ~$30/mo.

---

## Methodology

**Fidelity.** The harness ([`harness.mjs`](./harness.mjs)) imports the engine's *actual* prompts — `CLASSIFIER_SYSTEM_PROMPT` (`worker/lib/classifier.js`), `buildSynthesisPrompt` + `AGENT_TOOLS` (`worker/engine/`) — so models are tested under production conditions, not paraphrases.

**Cost.** Computed per call as `prompt_tokens × price_in + completion_tokens × price_out`, using exact per-token pricing from the live OpenRouter catalog ([`openrouter-models.json`](./openrouter-models.json), 337 models), preferring OpenRouter's reported `usage.cost` when present.

**Latency.** Wall-clock per call, p50 reported.

**Quality** is role-specific:
- **Classifier** — accuracy vs a 12-query labeled set (accept/reject, reject-reason, key-facet correctness) + JSON validity.
- **Planner** — a 10-item direct skepticism probe + a 6-item *note-laundering* test (does it repeat marketing hype as fact?) graded by a Claude judge + tool-call validity vs the real schema + JSON-output reliability.
- **Synthesis** — the real synthesis prompt run against a **planted-trap fixture** ([`synth-fixture.mjs`](./synth-fixture.mjs)): credible `[hands-on]`/`[expert-domain]` sources beside a marketing/affiliate-hyped no-name product. JSON-schema completeness + trap-ranking (auto) + honesty/source-faithfulness across four sub-axes (Claude judge: trap-handling, faithfulness, conflict-flagging, marketing-filter).

**Candidates** (≥3 per role) were chosen from the cited landscape review across the price/quality frontier and validated against the live catalog before any spend.

---

## June-2026 model landscape (cited)

Full review in [`landscape-2026-06.md`](./landscape-2026-06.md). Key shifts since the engine's models were chosen:

- **Anthropic** — `opus-4.8` leads the Artificial Analysis Intelligence Index (61.4) with the **lowest frontier hallucination rate** (abstains rather than fabricates); now $5/$25. `claude-fable-5` (Mythos-class, $10/$50) tops agentic benchmarks but is overkill for a budget tool. `sonnet-4.6` is the value honesty tier ($3/$15); `haiku-4.5` gained a large JSON-reliability win over 3.5-haiku.
- **Google** — Gemini **3.x** shipped, but `gemini-2.5-flash-lite` still leads class faithfulness (FACTS Grounding) and `gemini-2.5-pro` holds the **highest grounded-faithfulness of any model (0.878)**.
- **OpenAI** — `gpt-5.5` (lowest OpenAI sycophancy, 3.5%), the `gpt-5.4`/`5.4-mini`/`5.4-nano` tier, and `gpt-5` (the **source-faithfulness champion**, cheaper than 5.5).
- **Open / cost-leaders** — **DeepSeek V4** (`v4-pro` $0.435/$0.87, `v4-flash` $0.098/$0.196), `deepseek-v3.2` (93.7% RAG faithfulness), `qwen3.5-397b-a17b` (high BullshitBench on paper), `kimi-k2.6` (highest-intelligence open model).

Primary sources: Artificial Analysis (Intelligence Index, AA-Omniscience), FACTS Grounding leaderboard, lechmazur sycophancy/confabulations, Vectara HHEM, petergpt BullshitBench, vendor model cards (full URLs in the landscape file).

---

## Role 1 — Classifier ✅

`gemini-2.5-flash-lite` (incumbent) vs 4 challengers, 12 labeled queries each. Raw: [`results/raw-classifier.json`](./results/raw-classifier.json).

| model | quality | accept | reason | facet | json | $/call | p50 ms |
|---|---|---|---|---|---|---|---|
| **google/gemini-2.5-flash-lite** ◄ | **1.00** | 1.00 | 1.00 | 1.00 | 1.00 | **$0.00022** | **836** |
| openai/gpt-5.4-nano | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | $0.00053 | 1532 |
| mistralai/mistral-large-2512 | 0.99 | 1.00 | 1.00 | 0.95 | 1.00 | $0.00055 | 3410 |
| qwen/qwen3.6-flash | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | $0.00183 | 9803 |
| deepseek/deepseek-v4-flash | 0.91 | 0.92 | 0.80 | 1.00 | 0.92 | $0.00029 | 5331 |

**KEEP `google/gemini-2.5-flash-lite`** — the only candidate that is simultaneously perfect-quality, cheapest, and fastest. `qwen3.6-flash` matched quality but ran 12× slower at 8× the price; `deepseek-v4-flash` dropped a reject and a JSON parse.

---

## Role 2 — Planner / agent-loop ✅

The engine's reputed weak spot. `gemini-2.5-flash` (incumbent) vs 5 challengers. Quality = 0.4·note-laundering (Claude-judged) + 0.3·skepticism + 0.15·tool-call validity + 0.15·JSON reliability. Raw: [`results/planner-final.json`](./results/planner-final.json).

| model | quality | note | skep | tool | json | $/call | p50 ms |
|---|---|---|---|---|---|---|---|
| openai/gpt-5.1-codex | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | $0.00089 | 1283 |
| anthropic/claude-opus-4.8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | $0.0058 | 2710 |
| deepseek/deepseek-v4-pro | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | $0.0011 | 7305 |
| **google/gemini-2.5-flash** ◄ | **0.967** | 0.92 | 1.00 | 1.00 | 1.00 | **$0.00019** | **929** |
| google/gemini-3.5-flash | 0.51 | 0.00 | 0.80 | 1.00 | 0.80 | $0.0026 | 2153 |
| qwen/qwen3.5-397b-a17b | 0.51 | 0.33 | 0.50 | 1.00 | 0.50 | $0.00083 | 3187 |

**KEEP `google/gemini-2.5-flash`.** Two findings drive it:

1. **The "~15% BS-detection" reputation did not reproduce.** On the note-laundering test the incumbent correctly flagged affiliate/listicle/manufacturer conflicts in 5.5/6 cases — because the production engine feeds the planner deterministic credibility tags the original in-a-vacuum number never had.
2. **The literature's top pick failed.** `qwen3.5-397b-a17b` (78% BullshitBench on paper) returned **empty/unparseable notes on 4 of 6 items** (0.51); `gemini-3.5-flash` returned prompt-echo garbage on all six.

The three perfect models cost 4.5–30× more and run 1.4–8× slower for +0.033. **If maximum planner honesty is ever required regardless of cost, `gpt-5.1-codex` is the upgrade** (perfect, $0.00089/call) — but it isn't justified today.

---

## Role 3 — Instant synth ✅

Fast/cheap report synthesis. `haiku-4.5` (incumbent) vs 3 challengers. Quality = 0.6·honesty (judge) + 0.4·schema. Raw: [`results/raw-instant-synth.json`](./results/raw-instant-synth.json).

| model | quality | honesty | schema | trap | $/call | p50 ms |
|---|---|---|---|---|---|---|
| **anthropic/claude-haiku-4.5** ◄ | **0.993** | 0.99 | 1.00 | omitted | $0.016 | 25684 |
| openai/gpt-5.4-mini | 0.926 | 0.99 | 0.83 | flagged & ranked last | $0.0094 | 13540 |
| deepseek/deepseek-v3.2 | 0.926 | 0.99 | 0.83 | omitted | $0.0029 | 23678 |
| google/gemini-2.5-flash | 0.871 | 0.92 | 0.80 | omitted | $0.0047 | 11606 |

**KEEP `anthropic/claude-haiku-4.5`** — best quality, perfect schema, cleanly omits both traps with explicit methodology notes, and no data-integrity bugs. The cheaper alternatives each have a flaw: `deepseek-v3.2` emitted a malformed price and a `rank=-1`; `gemini-2.5-flash` **leaked the planted fake affiliate URL onto a legitimate product** (a real honesty bug). `gpt-5.4-mini` is the honest, ~2× faster, cheaper alternative if instant-tier latency becomes a problem — but its schema is less complete.

---

## Role 4 — Full synth ✅ (public default tier)

`sonnet-4.6` (incumbent) vs 3 challengers. Raw: [`results/raw-full-synth.json`](./results/raw-full-synth.json).

| model | quality | honesty | schema | $/call | p50 ms |
|---|---|---|---|---|---|
| openai/gpt-5 | 0.964 | 0.94 | 1.00 | $0.069 | **127723** ⚠ |
| **anthropic/claude-sonnet-4.6** ◄ | 0.928 | **0.99** | 0.83 | $0.058 | 66250 |
| openai/gpt-5.4 | 0.904 | 0.95 | 0.83 | **$0.038** | **22746** |
| google/gemini-2.5-pro | 0.898 | 0.83 | 1.00 | $0.053 | 50410 |

**KEEP `anthropic/claude-sonnet-4.6`** for the public default — it posts the **highest honesty (0.99)** of any full-tier candidate, naming and discounting both traps with per-source credibility scores. `gpt-5` edges it on the composite only via schema, but its **~128s latency is disqualifying** for a user-facing tier. `gemini-2.5-pro` reaches the right answer but *silently* (honesty 0.83 — never names the trap or flags the specific affiliate sourcing).

**Optional optimization:** `gpt-5.4` is a genuinely strong value swap — honesty 0.95 (excellent), **3× faster (22.7s vs 66s) and 35% cheaper** than sonnet. For the public default tier where page speed drives conversion and volume drives cost, the −0.04 honesty may be worth it. Recommended as a deliberate, monitored A/B, not a blind switch.

---

## Role 5 — Exhaustive synth ✅ (gated premium tier)

`opus-4.8` (incumbent) vs 4 challengers. Raw: [`results/raw-exhaustive-synth.json`](./results/raw-exhaustive-synth.json).

| model | quality | honesty | schema | $/call | p50 ms |
|---|---|---|---|---|---|
| **anthropic/claude-opus-4.8** ◄ | **1.00** | 1.00 | 1.00 | $0.107 | 41788 |
| **moonshotai/kimi-k2.6** | **1.00** | 1.00 | 1.00 | **$0.012** | **15701** |
| openai/gpt-5.5 | 1.00 | 1.00 | 1.00 | $0.118 | 73786 |
| openai/gpt-5 | 1.00 | 1.00 | 1.00 | $0.064 | 109788 ⚠ |
| google/gemini-2.5-pro | 0.976 | 0.96 | 1.00 | $0.050 | 47078 |

**KEEP `anthropic/claude-opus-4.8`** as the flagship — perfect on every honesty axis with the most rigorous source-grounding (cites RTINGS score=92 vs listicle score=7, refuses to fabricate URLs), and it carries the established 94%-BS-detection pedigree the tier was built on.

**The standout finding:** `moonshotai/kimi-k2.6` **matched opus's perfect 1.00 honesty at 1/9th the cost ($0.012 vs $0.107) and 2.7× the speed** — the judge called it "cheapest and fastest yet fully honest." Because the exhaustive tier is gated and low-volume, the dollar savings barely move the budget, so this isn't urgent — but it's a validated swap worth a larger trial (more scenarios) before promoting it. (Caveat: the landscape review flags kimi for occasional off-spec JSON needing a cleanup shim; it parsed cleanly here, but watch it at scale.)

---

## Single-model verdict

**Can one model serve all five roles? No — and the data is unambiguous.** The roles pull in opposite directions:

- **Classifier + planner** reward a *cheap, fast, tool-reliable* model. `gemini-2.5-flash`/`-lite` cost ~$0.0002/call and the planner loop fires ~12–50 times per run.
- **Synthesis** rewards an *honesty-maximizing* model, and the best are 25–500× pricier per call.

Run the math on the two "one model for everything" candidates:
- **`opus-4.8` for all five** — honest everywhere (aced planner and exhaustive), but using it for the classifier is **30× the cost** ($0.006 vs $0.0002) and the planner loop alone would cost ~$0.10/run (vs ~$0.004). At flywheel volume that blows the `$60` budget on plumbing the cheap models already do perfectly.
- **One cheap model (`gemini-2.5-flash`) for everything** — fine for classify/plan, but its synthesis honesty (0.83–0.92, including a leaked affiliate URL) sacrifices the exact thing the product sells.

**The optimal stack is a combo** — cheap+reliable for classify/plan, honesty-maximizing for synthesize — which is precisely the engine's existing architecture. The benchmark validates the design, not just the individual picks.

---

## Recommended config & `worker/lib/tiers.js` diff

**Primary recommendation: no code change.** The current `TIER_CONFIGS` already implements the optimal stack. (Classifier lives in `worker/lib/classifier.js` as `CLASSIFIER_MODEL = 'google/gemini-2.5-flash-lite'` — also keep.)

Two **optional, data-supported** optimizations, if you prioritize cost/latency over the last few points of honesty:

```diff
  full: {
-   synthModel: 'anthropic/claude-sonnet-4.6',
+   synthModel: 'openai/gpt-5.4',          // optional: ~3x faster (23s vs 66s), ~35% cheaper, honesty 0.95 vs 0.99
    plannerModel: 'google/gemini-2.5-flash',
  },
  exhaustive: {
-   synthModel: 'anthropic/claude-opus-4.8',
+   synthModel: 'moonshotai/kimi-k2.6',    // optional: equal honesty (1.0), ~9x cheaper, 2.7x faster — trial on more scenarios first
    plannerModel: 'google/gemini-2.5-flash',
  },
```

Recommendation: ship neither blindly. The `full`→`gpt-5.4` swap is the higher-value one (public tier, high volume) and worth a monitored A/B; the `exhaustive`→`kimi-k2.6` swap saves little in absolute dollars (low volume) but is a free latency win if it holds up on a larger trial.

---

## Monthly cost projection (recommended stack)

Per-run cost (measured: real full-tier runs log `~$0.08–0.11`; synthesis dominates):

| Tier | ≈ $/run | Driver |
|---|---|---|
| instant | ~$0.03 | haiku synth $0.016 + cheap planner loop + classifier |
| full | ~$0.09 | sonnet synth $0.058 + planner loop ~$0.02 + classifier |
| exhaustive | ~$0.18 | opus synth $0.107 + 50-call planner loop + classifier |

Monthly volume × cost:

| Source | Runs/mo | Tier | $/mo |
|---|---|---|---|
| Flywheel (`FLYWHEEL_DAILY_MAX=6`) | ~180 | full | ~$16 |
| Re-research sweep (`RERESEARCH_DAILY_MAX=2`) | ~60 | full/exhaustive | ~$7 |
| Organic (projected as GSC indexing ramps) | ~100 | full | ~$9 |
| Classifier cache misses + chat | — | — | ~$2 |
| **Total** | | | **≈ $34–37/mo** |

**Comfortably within the `$60` `MONTHLY_BUDGET_USD` cap (~40% headroom).** Applying the optional `full`→`gpt-5.4` swap trims ~$5–6/mo (→ ~$30/mo). The governor (`cost:YYYY-MM` KV counter) remains the hard backstop regardless.

---

## Spend ledger (OpenRouter, TrueRank-Prod key)

| Phase | Spend |
|---|---|
| Classifier (5 models × 12 queries) | $0.041 |
| Planner (6 models × skepticism + tool-call + notes) | $0.36 |
| Instant-synth (4 × 2 scenarios) | $0.066 |
| Full-synth (4 × 2) | $0.437 |
| Exhaustive-synth (5 × 2) | $0.703 |
| **Total** | **≈ $1.61 / $10** |

_Landscape research and all Claude judging ran off the OpenRouter budget. The TrueRank-Prod key is capped at $100; this benchmark used ~1.6% of it._
