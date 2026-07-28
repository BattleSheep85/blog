# Muse Spark 1.1 candidate bench (2026-07-28)

## What was tested

Candidate model: `meta/muse-spark-1.1` ("Meta: Muse Spark 1.1"), OpenRouter id
confirmed against the live model API (context 1,048,576 tokens, pricing
$1.25/M input, $4.25/M output).

Reasoning effort tested: **`xhigh`**. OpenRouter accepted this value on the
first call, with no retry to `high`. A probe call confirmed the setting took
effect: `usage.completion_tokens_details.reasoning_tokens = 118` out of 129
completion tokens. The response also carried an encrypted `reasoning_details`
block (this model does not expose plaintext reasoning text, only the token
count and an opaque encrypted blob). Cost of the probe: $0.0006.

Every later step in this bench used `reasoning_effort: xhigh` for consistency.

Benchmarked against the three existing gold benches: stance
(`benchmarks/stance-gold-bench.mjs`), claim extraction
(`benchmarks/extract-gold-gen.mjs`), and synthesis
(`benchmarks/synth-gold-gen.mjs`). All three reuse cached corpora, so the
only spend was the LLM calls themselves.

Date: 2026-07-28.

## Result 1: Stance (verify judge)

This reused the same 112 independently Fable-labeled (claim, source) pairs
that scored the production stance model. It needs no re-judging, because
gold labels already exist.

| Model | Accuracy | Action-precision | Support-precision | Contradict-precision | Cost |
| --- | --- | --- | --- | --- | --- |
| **minimax/minimax-m3 (production)** | 87.5% | 71% | 92% | not separately reported | not re-measured here |
| meta/muse-spark-1.1 (xhigh) | 83.0% | 75.0% (n=4) | 100.0% (n=3 of 19 gold) | 0.0% (n=1 of 2 gold) | $0.5322 (112 calls) |

The candidate's accuracy is 4.5 points below the production stance model.
Its headline "support-precision 100%" and "action-precision 75%" look good
in isolation, but the sample sizes behind them are tiny: it only committed
to `support` or `contradict` on 4 of 112 pairs. Gold has 19 true `support`
and 2 true `contradict` cases in the set, so the candidate's recall on the
classes that matter most (does independent evidence actually back this
claim) is very low: 15.8% support recall, 0% contradict recall. It is
extremely conservative and defaults to `neutral` almost every time. A
diagnostic replay of one wrong call (`Bissell Little Green` claim, gold =
support) confirmed this is a genuine model judgment, not a truncated call:
`finish_reason: "stop"` at both the production 1500-token budget and a
6000-token budget, with room to spare either time.

## Result 2: Claim extraction (extractClaims)

Ran the candidate over the same 10 products the 5 incumbents were tested
on, through the real production `extractClaims` function, same system
prompt, same 2000-token completion budget.

| Model | Avg quality (non-fail) | Completions | Hard fails | Cost (10 calls) |
| --- | --- | --- | --- | --- |
| **anthropic/claude-haiku-4.5 (production)** | 7.60 | 10/10 | 0 | not re-measured here |
| openai/gpt-5.4-mini (prior incumbent) | 7.60 | 10/10 | 0 | not re-measured here |
| meta/muse-spark-1.1 (xhigh) | 9.75 (reconstructed judge, n=2) | **1/10 usable** | 8 | $0.1115 (gen) + $0.5885 (judge) |

The candidate returned **zero claims on 9 of the 10 products**. This is not
a quality problem with the model's extraction ability. It is a hard
architecture collision: `extractClaims` uses a fixed 2000-token completion
budget in production, and at `xhigh` this model spends nearly all of it on
hidden reasoning before it can write an answer.

A diagnostic call confirms the mechanism directly, replaying the same input
that produced an empty result:

| maxTokens | finish_reason | reasoning_tokens used | content |
| --- | --- | --- | --- |
| 2000 (production budget) | `length` (truncated) | 1997 of 2000 | empty |
| 8000 | `stop` (completed normally) | 4744 of 5053 | valid claims JSON |

Given more budget, the model can do the task. Under the production budget,
it cannot. A reconstructed blind judge (`anthropic/claude-fable-5`, see
caveats) independently confirms the same picture: 8 of 10 products scored
`FAIL` ("empty claim list on a source that clearly has real claims"), 1
product was the deliberate garbage-source trap (correctly returned zero
claims, scored 10/10 for honesty), and 1 product where the call did fit in
budget produced a genuinely good extraction (11 claims, scored 9.5/10).

## Result 3: Synthesis (report writer)

Ran the candidate over the same 8 queries the 6 incumbents were tested on,
through the real production `buildSynthesisPrompt`, same 16000-token
completion budget. The first call cost $0.0715, well under the $0.50
per-call sanity threshold, so the full 8-query run proceeded.

| Model | Composite | Completions | Fabricated numbers (deterministic gate) | Cost |
| --- | --- | --- | --- | --- |
| minimax/minimax-m3 | 7.69 | 8/8 | 1 (ungrounded) | not re-measured here |
| **openai/gpt-5.4-mini (prior incumbent)** | 7.61 | 8/8 | 0 | not re-measured here |
| anthropic/claude-haiku-4.5 | 6.88 | 8/8 | not reported | not re-measured here |
| deepseek/deepseek-v4-flash | 6.64 | 8/8 | 22 (DQ'd) | not re-measured here |
| meta/muse-spark-1.1 (xhigh) | 3.29 (reconstructed judge, all 8) / 3.76 (7 completed only) | 7/8 | 0 | $0.5365 (gen) + $0.6990 (judge) |

The deterministic grounding gate alone (fabricated-number check, name
grounding) makes the candidate look clean: 0 fabricated numbers, 0
ungrounded names, across all 7 completed reports. The reconstructed blind
judge tells a very different story. This story is consistent across all 7
reports, not a one-off. The candidate invents **citations that do not exist
in the source material**: fake publication names and fake review dates. In
at least two reports, it also invents an **entire top-pick product** that
never appears in the source corpus: a Dyson V15 Detect "top pick" for the
vacuum query, and an LG/Sharp microwave pair for the microwave query. Both
cite sources that never mention them.

This is why the deterministic gate and the judge disagree: the gate checks
whether a product NAME shares a token with the source text, and whether a
NUMBER is close to a source number. It has no way to check whether a cited
publication or date is real, or whether a whole invented product happens to
share a brand token with something genuine in the corpus. The judge catches
exactly the failure mode this deterministic gate cannot see.

One of the 8 queries (`best hair dryer 2026`) failed generation outright
(`json-parse-fail`). The harness did not persist the raw truncated content,
so this specific failure's root cause remains unconfirmed. It is consistent
with the same reasoning-budget pressure seen in the extract role, but that
is not independent proof.

## Total spend

| Step | Spend |
| --- | --- |
| Step 1: xhigh probe | $0.0006 |
| Step 2a: stance (2 diagnostic calls + 112-call live run) | $0.5420 |
| Step 2b: extract (2 diagnostic calls + 10-call gen + 10-call judge) | $0.7336 |
| Step 2c: synth (8-call gen + a flawed first judge attempt + 2 diagnostic calls + the corrected judge re-run) | $2.0319 |
| **Total** | **$3.3082** |

Well under the $25 cap. The synth step cost more than it needed to, because
the first judge script attempt used too small a completion budget
(`maxTokens: 600`) for a model that reasons by default even without an
explicit `reasoning` parameter (`anthropic/claude-fable-5`, the same "Fable"
judge used throughout this repo's gold benches). More than half that run's
calls truncated mid-JSON, so its numbers do not appear anywhere in this
report. A one-call diagnostic confirmed the cause. The fix
(`maxTokens: 2000`) let the run repeat cleanly. The total above includes
this cost, for full transparency.

## Verdict per role

**Stance: do not adopt.** Lower accuracy than the production model (83.0%
vs 87.5%), and a failure pattern (extreme conservatism, very low recall on
support/contradict) that is worse for this product's purpose than the
production model's own known bias. Also more expensive per call.

**Claim extraction: do not adopt.** The candidate fails on 8-9 of 10
products under the production token budget. That is a functional failure
rate, not a quality gap. Even setting that aside, adopting this model would
need a several-fold increase to `extractClaims`'s completion budget. That
change would affect the cost profile well beyond the model's own per-token
pricing. This evaluation did not make that change. It falls outside this
evaluation's scope.

**Synthesis: do not adopt.** Composite quality (3.3-3.8) is dramatically
below every viable incumbent (6.6-7.7), driven by a specific, well-evidenced,
repeated honesty failure: fabricated citations and invented products across
every one of the 7 successfully generated reports. This is the exact failure
mode this product exists to prevent.

**Cost, for context.** Muse Spark 1.1 is priced at $1.25/M input and $4.25/M
output. Against the current production models:

| Model | Input $/M | Output $/M | Muse Spark input multiple | Muse Spark output multiple |
| --- | --- | --- | --- | --- |
| minimax/minimax-m3 | $0.30 | $1.20 | 4.2x | 3.5x |
| anthropic/claude-haiku-4.5 | $1.00 | $5.00 | 1.25x | 0.85x |
| google/gemini-2.5-flash | $0.30 | $2.50 | 4.2x | 1.7x |
| google/gemini-2.5-flash-lite | $0.10 | $0.40 | 12.5x | 10.6x |

Nominal per-token pricing understates the real gap, though. `xhigh`
reasoning burns extra completion tokens on every call: this bench observed
100 to 2000+ tokens of hidden reasoning, depending on the task. The realized
cost per call was consistently higher than the nominal output price alone
would suggest. In the extract role, that reasoning overhead is what caused
the call to fail outright.

## Caveats that limit this comparison

1. **The extract and synth judge rubrics are reconstructed, not replayed.**
   Neither `benchmarks/extract-gold-blind.mjs` (referenced in the original
   task brief) nor any committed "synth judge" script exists in this repo.
   This repo only ever committed the blinded bundle inputs and the
   incumbents' score outputs. This report uses the same judge model
   (`anthropic/claude-fable-5`, the same "Fable" identity documented
   throughout `ft-data/README.md`) and the same documented scoring
   axes/scale as the original runs. It does not use the exact original
   prompt wording, because that wording no longer exists anywhere in this
   repo. Synth's reconstruction stands on firmer ground than extract's: the
   composite formula (`0.4*grounding + 0.35*honesty + 0.25*usefulness`) is
   documented exactly in `ft-data/README.md`, while extract's rubric is a
   documented list of criteria with no documented weighting. Treat both
   candidate judge scores as directionally informative, not strictly
   apples-to-apples with the stored incumbent numbers.
2. **Stance's per-class precision rests on very small samples for this
   candidate** (3 acted-support calls, 1 acted-contradict call, out of
   112). This is a direct consequence of how conservative the candidate is,
   not a flaw in the bench, but it means those specific percentages are
   noisy.
3. **The extract failure was diagnosed with 1 call at a non-production
   token budget** (8000, vs the production 2000) purely to confirm the root
   cause. This was not run as a full 10-product benchmark, since doing so
   would mean testing a configuration TrueRank does not run in production.
4. **The one synth generation failure has no confirmed root cause.** The
   harness did not persist the raw truncated model output for the failed
   `best hair dryer 2026` call. This report treats that failure as
   consistent with the same reasoning-budget issue seen elsewhere, but
   nothing confirms the exact cause independently.
5. **This evaluation caught and fixed a bug in its own tooling
   mid-benchmark.** Both new judge scripts initially set the judge call's
   completion budget too low for `claude-fable-5`'s default reasoning
   behavior. The synth judge's first attempt scored an average composite of
   0.58, mostly from truncated or unparseable calls. That attempt does not
   appear in any reported number here: this report discarded it entirely
   and used only the corrected re-run.
