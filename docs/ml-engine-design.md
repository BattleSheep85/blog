> ⚠️ **STATUS: DESIGN PROPOSAL — NOT the shipped system.** This describes a
> proposed ML extraction engine. The live honesty engine is `worker/engine/extract/`;
> the authoritative current architecture is in `CLAUDE.md`. Read this as history/intent,
> not as documentation of what runs in production.

<!-- Generated 2026-06-17 by a 6-area research workflow (entity/fact/ranking/prose/architecture/validation). Design proposal; not yet built. -->

# Pure-ML Extraction Synthesis Engine — Design Doc

**Status:** Architecture proposal · **Date:** 2026-06-17 · **Author:** architect
**Acceptance gate:** `benchmarks/glm52-synth-bench.mjs` (existing) + new attribution/recall harness

---

## 1. Verdict

**A pure-extraction engine is viable AND the correct call for TrueRank.** It is the only approach that makes the brand promise ("tell no lies") a *structural property* rather than a behavior we police. The prior session was spent stopping an LLM from fabricating; extraction makes fabrication impossible by construction — the engine can only emit spans that exist in sources.

**Pure or hybrid?** **Pure for v1, with hybrid as an opt-in quality booster, never a dependency.** Concretely:

- **The data layer (entities, price, specs, pros/cons, ranking) is 100% hand-rolled JS in the Worker.** This is the spine. It runs in <50ms vs multi-second Kimi synthesis — "faster everything" is real and measurable.
- **Prose (verdict/summary/buyersGuide) is templated from extracted aggregates + verbatim quotes — no generator.** This is where the honest gap lives.

**The prose-fluency gap is real and I will not hide it.** Templated connective tissue reads choppier than Kimi's flow. `arxiv 2209.03549 "Extractive is not Faithful"` also proves ~30% of *naive* extractive summaries still mislead via coreference/selection errors even though every word is a real quote — so "verbatim" is necessary but not sufficient; the selection logic must be defensive.

**The honest resolution:** for **pros/cons** (already bullet quotes) the gap is near-zero and arguably *better* than an LLM — real reviewer voice + a clickable receipt beats LLM paraphrase. For **verdict/summary prose** the gap is genuine; we lean *into* the choppiness with explicit framing ("Here's what real reviewers said:") so it reads as authenticity, not as a degraded LLM. **A thin generator is NOT unavoidable for v1.** If post-launch readability data demands smoothing, the only place a tiny CPU paraphraser is ever allowed is the *connective scaffolding* — never the factual quotes, never numbers.

---

## 2. Recommended Architecture

```
                          SOURCES (search → read_page → full text)
                                       │
                  each page already tagged by credibility.js → {tags[], score 0-100}
                                       │
   ╔═══════════════════════════════════▼══════════════════════════════════════╗
   ║  LAYER 1 — IN THE WORKER  (hand-rolled plain JS, ZERO deps)               ║
   ║  Runs identically in CF Worker and off-CF blackbox Node worker            ║
   ║                                                                            ║
   ║  A. CANDIDATE HARVEST                                                       ║
   ║     • Aho-Corasick brand gazetteer (vendored lexicon, self-bootstrapping)  ║
   ║     • model-code regex  • Title-Case n-grams  • extractAmazonProductUrls() ║
   ║                  │ cross-source frequency VOTE (≥2 independent domains)     ║
   ║                  ▼                                                          ║
   ║  B. ENTITY RESOLVE  (extend asin-resolver.js token matcher)                ║
   ║     block by brand/model-code → merge ONLY on code-containment / JW≥0.9    ║
   ║                  │                                                          ║
   ║  C. FACT EXTRACT (per resolved product, traced to char-span receipts)      ║
   ║     • price: schema.org Offer (raw-HTML pass via jina.fetchDirect) →       ║
   ║              prose regex → MEDIAN across sources, sanity band               ║
   ║     • specs: number+unit regex bank + schema.org additionalProperty        ║
   ║     • pros/cons: Intl.Segmenter sentences → VADER lexicon (vendored JSON)  ║
   ║                  + same-sentence product attachment → ABSA bucket           ║
   ║                  │                                                          ║
   ║  D. RANK  (deterministic, auditable)                                        ║
   ║     credibility-weighted polarity + Bayesian shrinkage (IMDb WR)           ║
   ║                  │                                                          ║
   ║  E. PROSE  TextRank pick most-central quote per aspect → TEMPLATE fill     ║
   ║                  │                                                          ║
   ║                  ▼   validate.js  (UNCHANGED output gate)                   ║
   ╚═══════════════════════════════════│══════════════════════════════════════╝
                                       │  JSON report (existing shape)
                                       ▼  research-page.js renders as-is (no FE change)

   ┌──────────────────────────────────────────────────────────────────────────┐
   │ LAYER 2 (OPTIONAL booster) — ONE ML service on blackbox CPU @192.168.5.10  │
   │   POST /extract → GLiNER (zero-shot aspect/entity) + DeBERTa-v3-small ABSA │
   │   Vendored ONNX model file + onnxruntime; bearer auth (METRICS_TOKEN style)│
   │   Worker calls it; on timeout/non-200 → SILENT degrade to Layer-1 lexicon  │
   │   Report is ALWAYS producible from Layer 1 alone.                          │
   │   7900 XTX is NOT in the path — CPU wins at this batch size (PCIe/ROCm ops)│
   └──────────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────┐
   │ LAYER 3 (separate track) — fastText .ftz classifier replacing gemini-lite │
   │   Vendored fasttext_wasm.wasm, runs INLINE in Worker, sub-ms, no hop       │
   │   Distilled from logged gemini classifications; confidence floor → fallback│
   └──────────────────────────────────────────────────────────────────────────┘
```

**No-package-manager story per piece:**
| Piece | How it satisfies the constraint |
|---|---|
| Aho-Corasick, regex banks, token resolver, TextRank, ranker, templates | Hand-written plain JS (~30–120 lines each), zero deps |
| Brand gazetteer, VADER valence lexicon | **Data, not a package** — vendored as single `.js`/`.json` files (~200KB) |
| `Intl.Segmenter` | Native to V8/Workers runtime |
| schema.org parse | Hand-rolled JSON-LD/microdata reader over raw HTML (`jina.fetchDirect` exists) |
| GLiNER + DeBERTa (Layer 2) | Single vendored ONNX file + ORT binary, fetched once — NOT a pip tree; lives on blackbox, off the bundle-limited Worker |
| fastText (Layer 3) | Single vendored `.wasm` + `.ftz` model, inline in Worker |

---

## 3. Per-Component Pick

| Component | Chosen technique | Where it runs | Quality vs LLM | Effort |
|---|---|---|---|---|
| **Entity / candidate extraction** | Aho-Corasick gazetteer + model-code regex + Title-Case n-grams + `extractAmazonProductUrls`; **cross-source ≥2-domain vote** as the anti-noise lever; dedup via extended `asin-resolver.js` (block + Jaccard≥0.6 + Jaro-Winkler≥0.9, merge gated on model-code containment) | Hand-rolled JS, Worker | **Close** | **M** |
| **Price** | schema.org Offer (raw-HTML pass) → prose regex fallback → **MEDIAN across sources**, sanity band $1–50k, currency-normalized, MSRP/was/now capture | Hand-rolled JS, Worker | **Matches** (machine-emitted truth) | part of L |
| **Specs** | number+unit regex bank + nearest spec-noun (same-clause window) + schema.org `additionalProperty` | Hand-rolled JS, Worker | Worse-but-acceptable | part of L |
| **Pros/Cons (ABSA)** | Vendored **VADER** lexicon + 5 rules; sentence-segment → **same-sentence** product attachment → polarity bucket; pro/con string = the original sentence (the receipt) | Hand-rolled JS, Worker | **Worse-but-acceptable** | **L** |
| **Ranking / rating** | Credibility-weighted mean polarity `E(P)=Σ w(s)·pol / Σ w(s)`, `w = score/100 · hands_on_bonus · recency`; **Bayesian shrinkage** (IMDb WR, `n_eff=Σw`, tune C≈3 on bench); map to 0–5; tie-break by evidence weight + domain diversity | Hand-rolled JS, Worker | **Matches** (explainability IS the feature) | **M** |
| **Prose (verdict/summary/buyersGuide)** | `Intl.Segmenter` + TextRank centrality → most-central quote per aspect → **templated** scaffolding around verbatim quotes; buyersGuide mines cue-pattern sentences ("look for", "avoid", "ignore the marketing") | Hand-rolled JS, Worker | **Worse-but-acceptable** (real gap on flowing prose) | **M** |
| **Classifier (facets/category/reject)** | **fastText** quantized `.ftz` via `fasttext.wasm.js`, distilled from logged gemini labels; nearest-centroid for `topical_category`; confidence floor → LLM fallback | Vendored WASM, **inline in Worker** | Close (distilled) | L |
| **ML booster (optional)** | **GLiNER** zero-shot aspect/entity + **DeBERTa-v3-small** ABSA, vendored ONNX | Service, **blackbox CPU** | Lifts polarity/recall where lexicon is wrong | L |

**Decisive rulings:**
- **No trained ranker (LambdaMART/RankNet).** It needs labeled query→relevance judgments TrueRank doesn't have and can't fabricate without inventing ground truth — and it turns the auditable score into a black box, the exact opposite of the thesis. CHI 2026 explainable-ranking work *formalizes* honest ranking as "a transparent weighted combination of simpler criteria" — i.e. our deterministic formula is the academically-current method.
- **No GPU in the path.** For small encoder batches, PCIe transfer + kernel launch make CPU competitive; ROCm adds ops for zero latency win. Reserve the 7900 XTX only if per-run sentence volume hits tens of thousands.
- **ONNX NER ruled out for v1 entity step.** Generic `bert-base-NER` tags PERSON/ORG/LOC, not PRODUCT, has no idea `RK84` is a product, and INT8 export (~265MB) blows the Worker bundle limit. The regex+gazetteer beats it on this exact entity type.

---

## 4. Honesty Model

**Why it cannot fabricate:** every emitted value is a span that exists in a source. Counting (cross-source votes) replaces LLM discretion; templating replaces free-text generation. There is no step where the engine can invent a product, price, or claim absent from the corpus. Groundedness is **0-by-construction** — which means the existing `ungrounded_price_frac`/`ungrounded_spec_frac` gate passes trivially and **tells us nothing new**. That is the trap.

**The NEW residual risks (wrong, not fabricated) and their bounds:**

| # | Failure mode | Why it happens | Bound / monitor |
|---|---|---|---|
| 1 | **Aspect→product MIS-ATTRIBUTION** (dominant) | No dependency parser; proximity glues a con about A onto B in comparison paragraphs | Require product name/alias in the **same sentence**; drop low-confidence rather than guess; quarantine 1-source claims; abstain on comparative constructions. **NEW metric:** triple-level (product,slot,value) Precision/Recall/F1 with labeled spans — the AVE eval. This is the #1 invisible failure today. |
| 2 | **WRONG MERGE** (RK84 vs RK87, XM4 vs XM5) — hides a real product = a lie | Token overlap on near-identical SKUs | **NEVER merge on fuzzy brand alone**; differing trailing digits/suffix = HARD no-merge; favor under-merging (ugly dup) over over-merging (lie). |
| 3 | **Polarity flip** ("not bad", sarcasm, "fan is LOUD" = bad for headphones) | Lexicon blind spots | Negation/intensifier rules; conservative thresholds → ambiguous clauses go to a neutral "what reviewers said" bucket, not pro/con; domain-tunable lexicon overlay; show the verbatim sentence so a wrong label is *visible*. |
| 4 | **Price/spec mis-parse** ("$50 off" → price $50) | Regex grabs adjacent number | schema.org-over-prose; median + sanity band; same-clause spec window; **every number traces to a char-span or is null** (empty field beats wrong field — enforce mechanically via the existing groundedness gate). |
| 5 | **MIS-RANK** (popular-but-bad out-votes hands-on; C mis-tuned) | Formula bias | Weight votes by credibility (listicle −30, hands-on +25), not raw count; tune C against planted-trap fixtures (the affiliate-rave trap must NOT rank #1); report `n_eff` so thin evidence is labeled "limited data". |
| 6 | **Cherry-pick / lying-by-omission** (one glowing quote while 9 pan it) | Selection bias — every word true, report misleads | TextRank centrality biases toward consensus; report per-aspect agreement ("4 of 5 hands-on sources agree"); never let one low-cred source be the sole receipt. |

**The net honesty win:** every residual error is **inspectable** — traceable to a source quote + a visible weight — whereas an LLM error is an untraceable invention. *Wrong-but-auditable beats confidently-fabricated.* The eval must therefore weight **attribution-precision highest**.

**Gate wiring (alongside the existing groundedness gate, not replacing it):**
- **Tier 1 — slot P/R/F1:** triple-level (entity-slot-value) against labeled spans. Per-slot macro-F1 gives component error attribution. Threshold: price-attachment precision ≥0.95.
- **Tier 2 — ranking quality:** nDCG + recall@K (not Kendall-tau alone — it over-penalizes defensible orderings). Thresholds: legit recall@5 ≥0.9, trap-suppression =1.0 (reuse existing `trap_last_or_absent`).
- **Tier 3 — A/B vs Kimi:** feed extractor JSON where `callModel()` output goes (bench is already model-agnostic — confirmed in code). For subjective prose delta, pairwise LLM-judge with dual-order consistency + Krippendorff's alpha (~0.8 target), treated as a noisy instrument, anchored by a ~30-page human spot-check via `run-eval.mjs`. RAND 2026: frontier judges have 10–15pt position bias — never use as ground truth.
- **Two-population labeled set:** keep synthetic planted-trap fixtures as the trap unit-gate, **add ~30–50 hand-labeled REAL pages** (price ranges, refurb, "4.6 from 12k ratings" mis-read as spec) — synthetic on-the-nose fixtures overstate real precision.

---

## 5. Phased Build Plan

**Phase 0 — Cheapest proof (no service, no model, no spend). GO/NO-GO.**
- Hand-roll Layer-1 end-to-end in plain JS: candidate harvest + ≥2-domain vote + dedup + price/spec regex + VADER pros/cons + deterministic ranker + templated prose.
- Run it on **real saved research data** (existing `read_page` output already carries credibility tags).
- Score against Kimi on the **existing** `glm52-synth-bench.mjs` (groundedness, schema, trap, latency, cost) — extractor feeds where `callModel` goes.
- **Go criteria:** schema ≥ Kimi baseline, trap-suppression =1.0, latency <100ms, groundedness=0, **and** a human read of 5 real reports says "this is usefully honest, not broken." 
- **No-go signal:** merge errors >0 on the golden set, or prose so choppy it's unreadable even with framing.

**Phase 1 — Build the NEW eval harness (parallel-safe with Phase 0 tuning).** GO/NO-GO.
- Triple-level AVE P/R/F1 with labeled spans + nDCG/recall@K, wired as CI thresholds beside groundedness.
- Hand-label ~30–50 real messy pages.
- **Go:** thresholds met (price-attachment ≥0.95, legit recall@5 ≥0.9, trap =1.0). This is the real acceptance gate; Phase 0's groundedness pass was necessary but not sufficient.

**Phase 2 — Ship Layer 1 as the production synthesizer.** GO/NO-GO.
- Wire into `orchestrator.js` behind a flag; `validate.js` unchanged; frontend unchanged.
- A/B on live golden queries vs Kimi (Tier 3). Methodology string discloses "ranked by weight of credible evidence found."
- **Go:** Tier-1/2 gates green on real pages, human spot-check ≥ Kimi on honesty, prose acceptable. Cut Kimi from the hot path; keep as fallback flag.

**Phase 3 (conditional) — fastText classifier.** Only if classifier cost/latency matters; distill from logged gemini labels, hold-out test, confidence floor → LLM fallback.

**Phase 4 (conditional, gated by Phase 1 metrics) — Layer 2 ML booster on blackbox.** Only if lexicon ABSA gap is *measured* unacceptable. GLiNER + DeBERTa-v3-small ONNX, silent degrade to Layer 1. Never a hard dependency.

---

## 6. What We Lose (honest)

| Loss | Severity for TrueRank | Verdict |
|---|---|---|
| **Prose fluency** — verdict/summary read choppier than Kimi | Medium, but **mitigatable by framing** | Acceptable. Lean into "actual quotes, not marketing." Pros/cons gap is near-zero or better. |
| **Novel synthesis** — LLM can connect dots across sources ("good for X *because* of Y+Z") | Low–Medium | We trade this for non-fabrication. Templated aggregates + agreement counts cover the honest 80%; the "insight" 20% was also the fabrication surface. Net positive for an honesty brand. |
| **Messy surface-form normalization** — LLM smooths "Sony WH1000XM5" / "the XM5" / "Sony's flagship" | Low | Recoverable via canonical-form selection (longest brand+model) + alias windowing. |
| **Edge-case handling** — bizarre page layouts, paywalled stubs, comparison tables | Medium | Bounded: degrade to fewer products, never wrong ones. Add a garbage/empty/paywalled stress fixture; `validate.js` floors (≥3 products, ≥1 pro/con, ≥10-char verdict) already partially gate this. |
| **Recall on thinly-covered products** | Low | *Honest* loss — a product ranks low for lack of credible evidence, not lack of merit. Must be disclosed in methodology + `n_eff` labeling. |

**Does it matter for this brand?** No — the losses are precisely the LLM's *value-add that was also its fabrication surface*. For a tool whose entire positioning is "tell no lies / show the receipts," a structurally-honest, auditable, 50ms engine that occasionally reads choppy is strictly better than a fluent one that can invent. The one loss to actively manage is prose readability, and the mitigation (verbatim-quote framing) turns it into a brand asset.

---

**Relevant files (all absolute):**
- `/home/chris/projects/truerank/worker/lib/credibility.js` — `scoreSource`, `extractAmazonProductUrls`, tag/score substrate the ranker + voting consume
- `/home/chris/projects/truerank/worker/lib/asin-resolver.js` — stopword-aware token matcher to EXTEND for entity dedup
- `/home/chris/projects/truerank/worker/lib/jina.js` — `fetchDirect` for the raw-HTML schema.org pass
- `/home/chris/projects/truerank/worker/engine/validate.js` — UNCHANGED output gate (shape-only, confirmed no LLM coupling)
- `/home/chris/projects/truerank/worker/pipeline/orchestrator.js` — where Layer 1 wires in behind a flag
- `/home/chris/projects/truerank/benchmarks/glm52-synth-bench.mjs` — model-agnostic acceptance gate (feed extractor JSON where `callModel` output goes); EXTEND with triple-level AVE + nDCG/recall@K
- `/home/chris/projects/truerank/benchmarks/synth-fixture.mjs` — planted-trap fixtures; add per-product gold spans + ~30–50 real labeled pages
- `/home/chris/projects/truerank/worker/pages/research-page.js` — renders existing shape as-is (no frontend change)
- New (to create): `worker/engine/extract/` (candidates, resolve, facts, absa, rank, prose), vendored `worker/engine/extract/vader-lexicon.js` + `brand-gazetteer.js`