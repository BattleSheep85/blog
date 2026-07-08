<!-- Generated 2026-06-17 by a 5-area research workflow (hardware/models/distillation/cost/integration). Decision-grade roadmap; not yet executed. -->

> ⚠️ **STATUS: ROADMAP — NOT executed.** A proposal for a self-hosted/local
> synthesis path. Production synthesis runs via OpenRouter (see `CLAUDE.md`).
> Read this as intent, not as documentation of what runs today.

# Self-Hosting the TrueRank Synthesis Model on a 7900 XTX — Feasibility Roadmap

*Tech-lead synthesis. Date 2026-06-17. Status: FEASIBLE on hardware, GATED on honesty, WEAK on cost.*

---

## ⚠️ UPDATE 2026-06-17 — two user corrections (read first)

1. **Idle GPU power is a SUNK cost, not a marginal one.** The workstation already runs 24/7, so its idle draw is paid regardless. The only NEW cost of self-hosting inference there is the *extra watts during a run* (cents/run), NOT the ~$10/mo idle figure used in §1/§cost below. **That removes the main cost objection — the cost case is far less "red" than stated.**

2. **Direction change: NOT a self-hosted LLM — a purpose-built ML / extraction pipeline ("pure ML, for faster everything").** This is *more* mission-aligned than distilling an LLM: an **extraction-based engine cannot fabricate** — it only surfaces facts that exist in the sources (literal receipts), which structurally eliminates the no-lies problem this whole session fixed, and runs in ms on CPU. The hard part shifts from "honesty" to "fluent prose" (verdicts/buyersGuide). The LLM-distillation plan below is **superseded** by the extraction-pipeline direction — kept for reference + the still-valid acceptance-gate idea (the existing `glm52-synth-bench.mjs` groundedness gate scores an ML pipeline too, and it will hit 0 by construction). Architecture sketch + spike plan: see issues.md 2026-06-17 + the response that prompted this update.

---

## 1. Verdict — worth doing, but NOT for the money (yet)

**Lead honestly: the cost argument does not hold today.**

- Synth-only spend is **~$2.90–3.30/mo** (kimi-k2.6 at $0.0097/run × ~320 runs). The goal's "$10–16/mo" figure bundles classifier + planner + synth; a local model replaces **only the synth leg, the cheapest one**. The real prize is **~$3/mo (~$36/yr)**.
- Per-run electricity (~$0.0003) is ~30× cheaper than kimi, but that marginal win is **dwarfed by fixed costs**: ~$30–60 data-gen + 15–40h engineering. Counting any engineer time, **it never breaks even on cost at current volume** (~27 years by one honest estimate).
- **Worse**: keeping the GPU model-resident 24/7 for low latency burns ~$10/mo idle power — **more than the entire kimi bill it would replace.**

**So the cost case fails. The decision axis is the other two:**

| Reason | Verdict |
|---|---|
| Save money (today) | ❌ No. ~$3/mo, never pays back with engineer time counted. |
| **Data ownership / no-rug-pull / no API dependency** | ✅ **This is the real justification.** Owning the honesty-critical component and removing a vendor dependency on the one piece whose whole value is "tells no lies." |
| **Scale insurance** | ✅ Conditional. Only compelling if runs grow ~10× (>3,000/mo), which makes the ~$0.0096/run delta compound to >$25–30/mo. |

**Recommended timing:** Do **Phase 0 now** (it costs ~$0 and answers the make-or-break question). Do NOT commit to distillation/integration unless Phase 0 shows an off-the-shelf model is in striking distance of the honesty gate. Frame the whole effort to the user as **a control/ownership bet with a one-weekend + $30–60 budget**, not a cost optimization.

---

## 2. Recommended local model (screened on grounding/abstention/JSON, NOT size)

The project's own bench is the law here: **GLM-5.2 (AA-Intelligence 51, top open model) fabricated 53% of prices; opus-4.8 fabricated 0%.** Grounding ≠ intelligence ≠ size. Screen on **Vectara HHEM hallucination rate AT high answer rate** (FACTS-Grounding has no usable open-weights numbers; HHEM is the better proxy anyway — it measures document-grounded summarization, exactly the synth role). JSON is **not** a differentiator — grammar-constrained decoding (`guided_json`/GBNF) guarantees schema-valid output from any base.

| Pick | Model | HHEM hallu / answer | Fit on 24GB | Why |
|---|---|---|---|---|
| **Top** | **Qwen3-30B-A3B (MoE, Q4/Q5)** | ~Qwen3-class (≈5–6% / 99.9%) | ✅ Fits at Q4/Q5 | **3B active → fast decode**, protects the ~40–60s/run UX; Apache-2.0; native tool/JSON; run reasoning-OFF to mirror live kimi. Best latency/headroom trade for a context-heavy 46K-token synth call. |
| Alt 1 | **Qwen3-14B (bf16/fp8)** | 5.4% / 99.9% | ✅ Easy headroom | Near-identical grounding to 32B at far higher throughput; the pragmatic default if MoE quant quality disappoints; also the **best distill base** (bf16 LoRA, no fragile gfx1100 quant kernels). |
| Alt 2 | **Qwen3-32B (GPTQ-4bit / Q4_K_M)** | 5.9% / 99.9% | ⚠️ Fits (~19–20GB weights) **but tight** with 46K-token KV (no FP8 KV-cache on RDNA3) and slow (~20–35 tok/s dense → a 16K report can hit ~10 min cold). Only if MoE underperforms on grounding. |

**Explicitly avoid:**
- **Phi-4** — lowest hallucination (3.7%) but only because it **refuses ~19% of docs**. TrueRank must ALWAYS emit a report; silent refusal is a worse failure than a slightly higher hallucination rate.
- **Llama-3.3-70B** — best raw grounding (4.1%) but **won't fit 24GB** (~40–43GB at 4-bit). Aspirational only.
- **GLM-4.5-Air** — credible on trap-abstention (~2.1% in one test) but **needs ~60GB+**; out of scope for a single card.
- **AWQ quants on RDNA3** — broken (~5 tok/s). Use GPTQ (vLLM) or Q4_K_M GGUF (llama.cpp).
- **Ollama** — vendors a lagging llama.cpp (~56% slower) and hides the knobs.

**Sizing correction (important):** the brief's "32B" target is wrong for *this* workload. Counting `MAX_CONTEXT_CHARS=120K` (~30K in) + `synthMaxTokens=16000` (~16K out) ≈ **46K tokens**, KV cache adds ~3–6GB with **no FP8 KV-cache on gfx1100 to shrink it**. A 32B-Q4 (~22GB weights + ~5GB KV) **overflows 24GB**. The honest ceiling is **24–27B at Q4**; the MoE 30B-A3B and the 14B are the comfortable picks.

**Serving stack:** start with **llama.cpp server, Vulkan backend** (on gfx1100 in 2026 Vulkan *beats* its own ROCm/HIP for token-gen — llama.cpp issue #20934 — and is lowest-ops). Escalate to **vLLM-ROCm 7.2.x** only if you need higher throughput or strict `guided_json`. Both expose OpenAI-compatible `/v1/chat/completions`, so the engine's `fetch()` body ports as-is.

---

## 3. Phased plan (staged, gated hard, cheap-first)

### Phase 0 — Off-the-shelf proof (do this FIRST; ~$0, ~1 day)
**Does a stock local model even pass the honesty gate before any training?** This is the single most important, cheapest step and it can kill or green-light the whole project for ~$0.

- Install ROCm/Vulkan on the workstation (currently **no `rocminfo`** — this is step 0). Stand up llama.cpp-Vulkan (or vLLM-ROCm) serving **Qwen3-30B-A3B Q4** (and 14B) reasoning-OFF, OpenAI-compatible on `0.0.0.0:8000`.
- Parameterize the **one hardcoded URL** in `benchmarks/glm52-synth-bench.mjs` (~line 70) to env `SYNTH_BASE_URL`/`SYNTH_MODEL`, point it at the local box, run `EXPANDED=1` (6 scenarios) against `synth-fixture.mjs` + `synth-fixture-glm-extra.mjs`.
- **Go/No-Go:** if a stock model hits `ungrounded_price_frac ≈ 0`, `ungrounded_spec_frac ≈ 0`, `json_rate = 1.0`, all traps last/absent, all legit-on-top → **you may SKIP Phase 1 entirely and go straight to integration.** If the best open model fabricates badly (likely, given GLM-5.2 failed) → that's your signal distillation-to-honesty on 24GB is a **research bet, not a cost optimization**; reconsider whether to proceed at all.
- Also measure **real decode tok/s + TTFT at the full ~46K-token context** (not the 8B/30B microbenchmarks) and confirm **peak VRAM < 24GB** under BUILD_FA=0 / `--enforce-eager`. Latency is the biggest practical risk.

### Phase 1 — Distillation (ONLY if Phase 0 falls short; ~$120–700 one-time, ~1–2 weeks of friction)
Skip if Phase 0 passes. If you proceed:
- **Base:** the Phase-0 candidate with the lowest zero-shot ungrounded-fraction. You're *amplifying an existing abstention prior*, not creating one (Mistral-Small and Phi-4 have strong priors; Qwen3 is cheapest to train).
- **Data:** harvest **~1,500–3,000 REAL synth prompts** from persisted D1 runs (diverse queries/categories — diversity matters more than count). **Never train on the 2–6 planted-trap fixtures** (= guaranteed overfit). Generate teacher outputs (opus-4.8 for the honesty ceiling, kimi where it already passes), and **FILTER every example through the existing groundedness gate** — only no-lie outputs become training targets. This mechanically guarantees a no-lies training set; it is the single most important design decision.
- **Train:** **bf16 LoRA (rank 8–16, 1–3 epochs, LR 1e-4–2e-4)** on a 7–14B base via **Unsloth-AMD/ROCm 7.1**. **AVOID the bitsandbytes-gfx1100 fork** — bf16 LoRA on a 7–8B model fits 24GB and sidesteps the fragile quant kernels (aligns with the no-package-manager / supply-chain ethos in CLAUDE.md). Mix in ~5–10% generic instruction data to prevent catastrophic forgetting.
- **DPO (second stage, high-leverage):** the groundedness metric **auto-labels preference pairs for free** — chosen = gate-passing report; rejected = synthesized by injecting an ungrounded price/spec or promoting the listicle trap to #1. ~500–1,500 contrastive pairs; on-policy rejects (sampled from the SFT model, then gate-labeled) are the key ingredient.
- **Go/No-Go:** gate the **checkpoint** (not training loss) against the bench. Verify abstention didn't regress (null prices/empty specs still emitted) and trap reasoning survived (`trap_last_or_absent`).
- **License check before generating:** OpenRouter flags "distillable" endpoints; **Anthropic/opus-4.8 terms may restrict using outputs to train a competing model — verify before generating the opus dataset.** Kimi-teacher is the safer default.

### Phase 2 — Integration with paid fallback (~few hours, do once a model passes)
The wiring is genuinely cheap and **the safe fallback is already 90% built** — do NOT refactor the engine.
- Add optional `synthBaseUrl`/`synthApiKey`/local-`synthModel` to `ENGINE_CONFIG` (`worker/lib/tiers.js`), default unset = today's OpenRouter behavior.
- Thread base-URL + key through `callLLM`/`callLLMStreaming` in `worker/engine/llm.js` — replace the **two hardcoded `https://openrouter.ai/...` URLs (lines ~58, ~153)** with `config.synthBaseUrl ?? default` and matching `Authorization`. **Default a missing `usage.cost` to 0** for local responses (local servers send no `cost` field; 0 is correct — electricity, not API $). ~15 lines, no orchestrator/handler/DB change.
- **Fallback (reuse what exists):** the streaming synth attempt targets local with a **short watchdog** (`chunkMs ~20s` via the existing `llmBudgetMs`); the **already-existing catch in `engine.js:255–273` / `parallel-engine.js`** retries non-streaming against OpenRouter kimi. "Local on the hot path, paid kimi as the catch" = zero new machinery. Site never breaks on a local OOM/timeout/cold-start.
- **Networking (corrected):** workstation `192.168.10.53` and blackbox `192.168.5.10` are on **different subnets but cross-subnet routing is verified working** (`ping` succeeds, no VPN needed for the home topology). Bind local server to `0.0.0.0:8000`; set `SYNTH_BASE_URL=http://192.168.10.53:8000/v1` + `SYNTH_MODEL` in the blackbox Portainer stack (`deploy/truerank-research-worker.yml`, which today injects only WORKER_SECRET/OPENROUTER/SERPER). Tailscale only if the worker later moves off-prem.
- **CF-side path:** keep `EXTERNAL_WORKER_ENABLED=true` (already in `wrangler.toml`). The CF in-worker synth **cannot reach a 192.168.x box** (CF egress is public-only), so it stays the rare >5-min cron fallback on paid kimi. **Zero CF-side code change.**

---

## 4. The acceptance bar (non-negotiable, reuses the existing gate)

**A local model ships ONLY if it matches the live `kimi-OFF` row in `benchmarks/glm52-synth-bench.mjs` on the groundedness columns.** No new harness — parameterize the one URL/key, add the local endpoint as a third config, run `EXPANDED=1`.

| Metric | Pass bar | Source |
|---|---|---|
| `ungrounded_price_frac` | **≈ 0** | opus/kimi ≈ 0; GLM-5.2 = 53% → FAIL |
| `ungrounded_spec_frac` | **≈ 0** (low) | same |
| `json_rate` | **= 1.0** | enforce via grammar if needed |
| `trap_last_or_absent` | **all** (every scenario) | the marketing-trap test |
| `legit_on_top` | **all** | real product ranks #1 |
| `schema` | within a few points of kimi | structural |
| latency | acceptable on 7900 XTX for full 16K-token report | measure, don't assume |

**Watch the constraint-induced fabrication trap:** grammar-forced JSON must allow `null`/empty *everywhere the honesty design requires abstention* (e.g. `rating` should stay null when no rating is grounded). Forcing a non-null field = **fabrication-by-constraint**. Re-score grounding with the grammar **ON**.

You can prove pass/fail **for ~$0 before changing any production code.** That de-risks the entire project.

---

## 5. Risks & open questions

**Top risk (the one the hardware cannot answer):** a small distilled local model is **more likely to fail the honesty bar than the 1T-class teacher**. The bench already proved grounding doesn't track size/intelligence. **Passing `glm52-synth-bench.mjs` at zero-fabrication is an open empirical question** — possibly no 24GB-fittable model passes, in which case the whole build is sunk cost. This is why Phase 0 exists.

**Open questions to resolve (most before spending):**
1. **Does any 24GB-fittable model pass the gate zero-shot?** — Phase 0, make-or-break, ~$0. Run before any training spend.
2. **Real decode tok/s + peak VRAM at the full ~46K-token context** on *this* box (Qwen3-30B-A3B vs 32B, llama.cpp Vulkan). The ~20–35 tok/s estimate decides whether a 16K report fits the ~40–60s/run UX or needs a lower `synthMaxTokens`. ROCm isn't installed yet (no `rocminfo`) — that's step 0.
3. **Confirm actual run volume** from D1 (`SELECT COUNT(*) FROM research WHERE completed_at >= start-of-month`) — the entire break-even pivots on it; goal says ~300–340/mo.
4. **Is the workstation on 24/7?** If it sleeps, every job during downtime falls back to paid kimi (functionally fine, erodes the saving). Idle-power (~$10/mo) vs cold-load latency is a real trade.
5. **Does the off-CF blackbox worker truly handle ~99% of runs?** Quantify how often the CF >5-min cron fallback fires (those still pay kimi).
6. **License:** does the teacher's terms permit training a distilled model? Verify **before** generating the opus dataset (kimi-teacher is the safe default).
7. **Distillation pitfalls to actively guard:** catastrophic forgetting of valid JSON (low rank, 1–3 epochs, grammar-decode), overfit to fixtures (train on real runs only, query-disjoint eval), distilling the teacher's *mistakes* (mandatory groundedness filter on training data), abstention regression (include gate-passing examples where the honest answer IS null/empty).

---

### Bottom line
Hardware: **green.** Wiring: **green, ~15 lines, fallback already built.** Cost: **red — don't sell this on $36/yr.** Honesty: **unproven — the only thing that matters.** **Run Phase 0 now for ~$0; let the existing groundedness gate make the decision. Justify any further work on ownership/control, not savings.**

(Note per your instructions: I did not write this to a file. Relevant paths referenced: `/home/chris/projects/truerank/benchmarks/glm52-synth-bench.mjs`, `/home/chris/projects/truerank/worker/engine/llm.js`, `/home/chris/projects/truerank/worker/lib/tiers.js`, `/home/chris/projects/truerank/worker/engine/engine.js`, `/home/chris/projects/truerank/deploy/truerank-research-worker.yml`.)