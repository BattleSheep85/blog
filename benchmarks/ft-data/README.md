# ft-data — distillation SFT dataset (foundation)

Supervised fine-tuning (SFT) JSONL for an in-house small model, distilled from
existing labeled artifacts. **No paid-API spend was used to build anything in this
directory** — every `*-seed`/`detector-*` file is a deterministic conversion of data
we already had. The teacher-harvest path (paid) is built but **not** run at scale.

## Record shape (all files)

One JSON object per line:

```json
{
  "task": "detector-classify | detector-integrity | stance | claim-extract",
  "source": "<provenance path or harvest:<product>>",
  "meta":  { ...task-specific... },
  "messages": [ {"role":"system","content":"..."}, {"role":"user","content":"..."} ],
  "completion": "<STRICT JSON string the model must learn to emit>"
}
```

`messages` + `completion` are the trainable pair. For the stance and claim-extract
tasks the `system` prompt and the `user` block are **byte-for-byte identical to
production** (`worker/engine/verify.js` `STANCE_SYSTEM` / `CLAIM_EXTRACTION_SYSTEM`
and the exact `classifyStance` / `extractClaims` user-message construction), so
training formatting matches inference formatting.

## Files produced (FREE, today)

| File | Task | Count | Source | Free vs generate |
|------|------|------:|--------|------------------|
| `detector-v2-pilot.jsonl`  | `detector-classify`  | **147** | `baitbench/corpus-v2/pilot/*.json` | FREE (ready-made labels) |
| `detector-v1-sample.jsonl` | `detector-integrity` | **122** | `baitbench/corpus/{5 scenarios}` (canary-labeled) | FREE (deterministic `canaryScan`) |
| `stance-seed.jsonl`        | `stance`             | **6**   | `benchmarks/results/verify-anker-soundcore-space-a40-replay.json` | FREE (teacher labels already paid for) |
| `extract-seed.jsonl`       | `claim-extract`      | **1**   | same replay | FREE (teacher labels already paid for) |
| **Total** | | **276** | | |

Build script: `node benchmarks/ft-data/build-ft-data.mjs` (idempotent, zero-dep Node,
imports the real `canaryScan`, `topEvidenceForClaim`, and prompt constants).

### `detector-v2-pilot.jsonl` (Part A.1)
BaitBench v2 pilot classification set. **Input fields found** (all 147 items share
exactly these keys): `id, content, source_url, date, label ("deceptive"|"honest"),
tier, candidate_claims[], correct_claim_id` (a **number** index into
`candidate_claims` for deceptive items — 86× `0`, 1× `1` — and **null** for honest).
Target completion: `{"verdict":"deceptive|honest","claim_id":<index|null>}`.
Label balance: 87 deceptive / 60 honest.

### `detector-v1-sample.jsonl` (Part A.2)
BaitBench v1 canary-labeled source-integrity detection, **5 of 30 scenarios** as a
template (`air-purifier-01, baby-monitor-09, dash-cam-06, espresso-machine-05,
robot-vacuum-04`). Labeling is **deterministic** — no LLM — via the binding
`canaryScan` logic in `baitbench/lib/grade/canary.mjs`:

- For each scenario we take every **honest baseline** source (`sources/*.md`) and
  every **poisoned variant** source text (`variants/*.json` → `replace[docId]`).
- We run `canaryScan(text, groundTruth.canaries)`. A normalized-substring
  fingerprint hit ⇒ `manipulated:true`; the matched canary's `category` (A/B/C/D)
  and `fingerprint`(s) fill `category` + `planted_span`. No hit ⇒
  `{manipulated:false, category:"none", planted_span:""}`.

Target completion: `{"manipulated":bool,"category":"A|B|C|D|none","planted_span":"<verbatim|empty>"}`.
`meta.matchedCanaryIds` records which canaries fired. Balance: 57 clean / 65 manipulated.

**To scale to all 30 scenarios:** add the other 25 scenario dirs to
`V1_SAMPLE_SCENARIOS` in `build-ft-data.mjs` (or replace the list with
`readdirSync(corpus)` filtering out the `-cc` control dirs). Projected total
≈ **732 records** (avg 24.4/scenario × 30) — still 100% FREE.

### `stance-seed.jsonl` (Part B.4)
Stance records from the one existing teacher-labeled run (gpt-5.4-mini, already
paid for). Production feeds `topEvidenceForClaim(scoredEvidence, 15)` — the **same
top-15** evidence for every claim — so each of the 6 claims becomes one record with
all 15 evidence sources. Per-source stance = `support`/`contradict` from the
replay's recorded `supporting`/`contradicting` arrays (with verbatim `span`), and
`neutral` for the rest (the final post-backstop label). 6 records, 3 non-neutral
source-verdicts total (the run was mostly "unsubstantiated").

### `extract-seed.jsonl` (Part B.4)
Claim-extraction record from the same run. Target = the 6 genuine teacher-extracted
claims `{text,type}`. **Caveat:** the original ≤20k product-page block that produced
those claims was **not persisted** in the replay (`productUrl` was null), so the
`user` block is **reconstructed** from the manufacturer/support-domain evidence
entries present in the replay (`meta.inputReconstructed:true`). The completion is
genuine; the input is approximate. The teacher-harvest script is the clean path to
faithful extract pairs (it captures the real input block).

## The teacher-harvest path (Part C — BUILT, not run at scale)

`benchmarks/harvest-teacher-labels.mjs` runs the **real** production teacher
(`extractClaims` + `classifyStance` via `openai/gpt-5.4-mini`, gathering real
evidence) over a list of product names and emits `stance` + `claim-extract` records
in the **exact schema above**. It reuses the production functions directly, so
harvested records are drop-in compatible with the seeds.

- **Default is `--dry-run`** (zero network, zero spend) using a mock teacher +
  mock gather — proves the record shape. `--live` is required to actually spend
  and aborts if `OPENROUTER_API_KEY` is missing.
- Supports `--limit N`, `--products "a, b, c"`, `--file <path>`.
- Prints an estimate before running.

**Dry-run confirmed** (`--dry-run --limit 1`): emits 1 valid `claim-extract` + 3
valid `stance` records, byte-for-byte matching the seed schema and the production
`STANCE_SYSTEM` prompt. No spend.

### Estimated spend

Anchored on the one real run we have
(`verify-anker-soundcore-space-a40.json` `totalCostUsd = $0.091`, all-in
gather + extract + stance; LLM-only extract+stance from the replay = `$0.038`):

- **~$0.09 / product** all-in (search + planner + teacher), or **~$0.038 / product**
  if evidence gather is cached/reused (LLM teacher calls only).
- Each product yields **1 claim-extract** record + **~6–12 stance** records
  (one per extracted claim, ~8 avg).

| Stance target | ~Products (@8 stance/product) | All-in (~$0.09/product) | LLM-only (~$0.038/product) | Free extract byproduct |
|--------------:|------------------------------:|------------------------:|---------------------------:|-----------------------:|
| 2,000 | ~250 | **~$22.50** | ~$9.50 | ~250 extract records |
| 5,000 | ~625 | **~$56** | ~$24 | ~625 extract records |

## FREE-today vs needs-generation — bottom line

- **276 SFT examples exist FREE right now** (269 detector + 6 stance + 1 extract),
  expandable to **~880 FREE** by labeling all 30 v1 scenarios (~732 detector-integrity).
- **Detector** is well-covered for free. **Stance** is the gap: only **6** free
  examples. Reaching a usable 2–5k stance set needs the teacher-harvest run —
  **~$22–$56** all-in for 250–625 products (which also throws off 250–625 free
  claim-extract examples). No large-scale generation was run in this task.

## Independent-gold stance benchmark (`stance-gold-*.jsonl`)

Every stance eval that existed before this set (`stance-local-bench.mjs`, the
`harvest-teacher-labels.mjs` pipeline) measures **agreement with the
production teacher** (`gpt-5.4-mini`) — i.e. "does candidate X match what
gpt-5.4-mini already said?". That's circular: it can score 100% and still be
100% wrong, because the reference itself is never checked against anything
independent. It can tell you a candidate model disagrees with the teacher; it
can never tell you the teacher is wrong.

To close that gap, 112 (claim, source) pairs already labeled by the
production teacher were re-labeled **blind** by an independent frontier judge
(Fable) — no teacher label visible, judging strictly against the same
echo-rejection rubric the production `STANCE_SYSTEM` prompt encodes (a source
only counts as `support` if it independently tests/measures the claim itself;
merely echoing manufacturer spec/marketing wording is `neutral`).

### Files

| File | Rows | Shape | Purpose |
|------|-----:|-------|---------|
| `stance-gold-blind.jsonl`   | 112 | `{id, claim, source_url, source_snippet}` | Input given to the independent (Fable) labeler — **no teacher label included**, to avoid anchoring. |
| `stance-gold-fable.jsonl`   | 112 | `{id, fable_stance}` | The independent ground truth — Fable's blind label per (claim, source) pair. **This is gold.** |
| `stance-gold-tolabel.jsonl` | 112 | `{id, claim, source_url, source_snippet, teacher_stance}` | Same 112 items with the production teacher's (`gpt-5.4-mini`) already-recorded label, for scoring the teacher (and reusable as the live-mode input for any other candidate model). |

Gold label distribution: **19 support / 2 contradict / 91 neutral** — i.e. the
overwhelming majority of independently-reviewed (claim, source) pairs in
production evidence pools do NOT actually corroborate the claim; most
"supporting" evidence is an echo of the manufacturer's own words, not
independent testing.

### The finding

Scoring the stored `teacher_stance` (gpt-5.4-mini, the production stance
classifier) against the Fable gold:

- **Overall accuracy: 58.0%** (95% CI ~[49%, 67%], N=112).
- **Support precision: 42.2%** — when the teacher says "support", an
  independent judge agrees less than half the time. Recall is 100% (it never
  misses a true support), but it's trigger-happy: it calls `support` on
  marketing echoes that the echo-rejection rubric is specifically designed to
  reject.
- **Contradict precision: ~4.5%** — the teacher's `contradict` calls are
  overwhelmingly wrong (1 correct out of 22 calls; gold only has 2 true
  contradicts in the set at all).
- **Neutral precision: 100%** — every time the teacher says `neutral`, gold
  agrees. The teacher never falsely calls something neutral; it over-fires in
  the other direction, converting true neutrals into false support/contradict.

**Net effect: the production stance classifier systematically over-fires
`support`/`contradict` on sources that are actually just echoing the
manufacturer's claim, not independently corroborating it** — the exact
failure mode `STANCE_SYSTEM`'s echo-rejection rule exists to prevent, and the
deterministic `applyStanceBackstops()` in `worker/engine/verify.js` only
partially catches (it strips manufacturer/sponsored-tag and verbatim-span
echoes, but not paraphrased echoes an LLM judge would still flag).

### Running the benchmark

```
# Baseline — $0, scores the stored gpt-5.4-mini teacher_stance labels
node benchmarks/stance-gold-bench.mjs

# Live — re-runs stance classification with a candidate OpenRouter model at
# temperature 0 over the SAME 112 (claim, source) inputs using the production
# STANCE_SYSTEM prompt (worker/engine/verify.js classifyStance + callLLM).
# Opt-in, paid, hard-capped at $1 (112 cheap calls should cost well under that).
node benchmarks/stance-gold-bench.mjs --model <openrouter-model-id>
```

Both modes print overall accuracy, per-class precision/recall/F1, macro-F1,
action precision (of the support/contradict calls, how often gold agrees), a
confusion matrix (gold rows × predicted cols), and 95% bootstrap confidence
intervals (10,000 resamples, BaitBench methodology) — then save the full
result to `benchmarks/results/stance-gold-bench-<model>.json`.

### Caveats

- **N=112** — CIs are wide (e.g. accuracy 95% CI spans roughly 49–67%).
  Directionally solid, not a tight point estimate; expand the gold set for
  tighter intervals.
- **Single independent labeler** (Fable, one pass, no inter-rater reliability
  check). It removes the circularity of teacher-self-agreement but is still
  one judge's calls, not a multi-rater consensus.
- **800-char snippets** — the gold set was labeled against the same truncated
  `source_snippet` the production pipeline uses, not full page text; a longer
  snippet could occasionally flip a borderline neutral/support call either
  way.
- Class imbalance is severe (91 neutral / 19 support / 2 contradict) — the
  `contradict` precision/recall numbers in particular rest on only 2 gold
  positives and should be read as "extremely noisy," not "false at 4.5%
  forever."
