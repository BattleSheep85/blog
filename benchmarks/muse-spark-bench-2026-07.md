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

## Rerun: reasoning_effort=minimal (2026-07-28, same day)

### Why this rerun happened

The xhigh run above concluded "do not adopt" for all three roles. The
extract failure had a clear mechanical cause: xhigh reasoning consumed the
fixed 2,000-token completion budget before the model could write an answer.
The question this rerun answers: with reasoning turned down as far as this
model allows, does the extract failure disappear, and does the synthesis
fabrication problem improve too? Same three benches, same fixtures, same
judge model, so the numbers line up against both the incumbents and the
xhigh row above. New rows use the label `muse-spark-1.1-noreason` and sit
alongside the `muse-spark-1.1` (xhigh) rows. No stored file lost a line.
See the verification note at the end of this section.

Same caveat as the xhigh run, restated here: the extract and synth judge
scripts (`extract-gold-candidate-judge.mjs`, `synth-gold-candidate-judge.mjs`)
are unmodified from the earlier run, so the scoring method is identical to
what produced the xhigh numbers. Their rubrics are RECONSTRUCTED from the
documented criteria in `ft-data/README.md`, not replayed from the original
judge prompt, which was never committed to this repo. Treat every judge
score below, for both xhigh and minimal, as directionally informative, not
strictly apples-to-apples with the stored incumbent numbers.

### Step 1: which setting actually turns reasoning off

The probe used the real production stance call (`classifyStance` in
`worker/engine/verify.js`, invoked through `callLLM` directly so the raw
`usage` object was visible), against one gold pair, at temperature 0. This
matches how the benchmarks below call the model. It is not a toy prompt.

| Setting | API result | finish_reason | Reasoning tokens | Completion tokens | Cost |
| --- | --- | --- | --- | --- | --- |
| No reasoning parameter (provider default) | Accepted | stop | 406 | 459 | $0.002466 |
| `reasoning_effort: "none"` | **Rejected, HTTP 400** | n/a | n/a | n/a | n/a |
| `reasoning_effort: "minimal"` | Accepted | stop | **186** | 266 | $0.001654 |
| `reasoning_effort: "low"` | Accepted | stop | 206 | 278 | $0.001705 |
| `reasoning: {enabled: false}` | **Rejected, HTTP 400** | n/a | n/a | n/a | n/a |
| `reasoning: {exclude: true}` | Accepted | stop | 384 | 437 | $0.002374 |

Both rejections returned the identical error text: `"Reasoning is mandatory
for this endpoint and cannot be disabled."` This model cannot turn
reasoning fully off. `reasoning: {exclude: true}` was accepted, but its
reasoning-token count (384) sat close to the no-parameter default (406).
This confirms the brief's suspicion exactly: `exclude` hides reasoning text
from the response (this model already returns no plaintext reasoning
either way). It does not stop the model from reasoning, and it does not
lower the token count or the bill.

`reasoning_effort: "minimal"` produced the lowest reasoning-token count of
every setting tested, at 186 tokens, less than half the no-parameter
default. `reasoning_effort: "low"` came close behind, at 206 tokens.
**No setting drives reasoning to zero for this model. The lowest working
setting is `reasoning_effort: "minimal"`.** All three benchmarks below use
this setting. Probe spend: $0.0082 for 6 calls (4 accepted, 2 rejected
before any tokens were spent).

### Result 1: Stance

| Model | Accuracy | Action-precision | Support-precision | Support-recall | Contradict-precision | Contradict-recall | Macro-F1 | Cost (112 calls) | Cost/call |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimax-m3 (production) | 87.5% | 71% | 92% | not reported | not reported | not reported | not reported | not re-measured here | not re-measured here |
| meta/muse-spark-1.1 (xhigh) | 83.0% | 75.0% (n=4) | 100.0% (n=3) | 15.8% (3/19) | 0.0% (n=1) | 0.0% (0/2) | 0.589 | $0.5322 | $0.00475 |
| meta/muse-spark-1.1 (minimal) | **88.4%** | 75.0% (n=16) | 90.9% (n=11) | **52.6%** (10/19) | 40.0% (n=5) | **100.0%** (2/2) | 0.723 | **$0.2433** | **$0.00217** |

Turning reasoning down changed this model's stance behavior completely. At
xhigh it almost never committed to `support` or `contradict`: it acted on
only 4 of 112 pairs. At minimal, it acted on 16, about four times as
often, and held 75% precision on those calls. Its accuracy's 95%
confidence interval is [82.1%, 93.8%] (from the stored result file), which
comfortably contains production's 87.5%. The accuracy gain over
production is a favorable point estimate, not a statistically confident
win, on this sample size. What is not in doubt: the exact failure that
sank the xhigh row (near-total unwillingness to call support or
contradict) is gone. Support recall rose from 15.8% to 52.6%. Contradict
recall rose from 0% to 100% (n=2 gold cases, so read this as a direction,
not a precise rate). Cost per call fell 54%, from $0.00475 to $0.00217.

### Result 2: Claim extraction

| Model | Avg quality (non-FAIL) | Completions | Hard fails | Gen cost (10 calls) | Gen cost/call |
| --- | --- | --- | --- | --- | --- |
| anthropic/claude-haiku-4.5 (production) | 7.60 | 10/10 | 0 | $0.0438 (measured, stored run) | $0.00438 |
| openai/gpt-5.4-mini (prior incumbent) | 7.60 | 10/10 | 0 | $0.0265 (measured, stored run) | $0.00265 |
| meta/muse-spark-1.1 (xhigh) | 9.75 (n=2 only) | **1/10 usable** | 8 | $0.1115 | $0.01115 |
| meta/muse-spark-1.1 (minimal) | 7.25 (n=10) | **10/10** | **0** | $0.0577 | $0.00577 |

**Direct answer: yes, the extract truncation failure is gone.** At minimal
reasoning all 10 products completed and zero calls hard-failed.
`finish_reason` was `stop`, not `length`, on every one of the 10 calls
(confirmed in the run log). This matches the brief's hypothesis exactly:
the failure was reasoning eating the fixed 2,000-token budget, not a
quality problem, and cutting most of the reasoning removes the failure.

Quality is also comparable to production for the first time. xhigh's 9.75
score was not a real quality signal: it came from only 2 non-FAIL products
out of 10, one of them the deliberate zero-claim trap product, which
scores well on honesty grounds regardless of which model runs it. Minimal
reasoning's 7.25 comes from all 10 products, a real sample, and sits about
4.6% below production's 7.60. One product, Google Nest Hub Max, scored
only 2/10: the judge found it invented a 6.5 MP camera, a 127-degree field
of view, and "Ambient EQ," none of which appear anywhere in the
4,716-character source text the model read (confirmed directly against
`benchmarks/ft-data/extract-harvested.jsonl`). That is a genuine
hallucination, not a scoring artifact, and it pulled the average down.

Cost per call is about 32% higher than the current production model
($0.00577 vs $0.00438), and the whole 10-call run cost about $0.05 less
than xhigh, because minimal reasoning burns far fewer tokens per call even
though every call now actually finishes.

### Result 3: Synthesis

| Model | Composite | Completions | Fabricated numbers (deterministic gate) | Gen cost (8 calls) | Gen cost/call |
| --- | --- | --- | --- | --- | --- |
| minimax/minimax-m3 | 7.69 | 8/8 | 1 (ungrounded) | not re-measured here | not re-measured here |
| openai/gpt-5.4-mini (prior incumbent) | 7.61 | 8/8 | 0 | not re-measured here | not re-measured here |
| anthropic/claude-haiku-4.5 | 6.88 | 8/8 | not reported | not re-measured here | not re-measured here |
| deepseek/deepseek-v4-flash | 6.64 | 8/8 | 22 (DQ'd) | not re-measured here | not re-measured here |
| meta/muse-spark-1.1 (xhigh) | 3.29 (all 8) / 3.76 (7 completed) | 7/8 | 0 | $0.5365 | $0.06706 |
| meta/muse-spark-1.1 (minimal) | 3.74 (all 8, all completed) | **8/8** | 0 | $0.2704 | $0.03380 |

The one query that failed generation outright at xhigh (`best hair dryer
2026`, `json-parse-fail`) completes at minimal reasoning. Completion rate
is 8/8, up from 7/8. Generation cost per call is roughly half of xhigh's.
The composite score barely moved: 3.74 against xhigh's 3.76 for the seven
reports that completed there. Both sit far below every incumbent's 6.6 to
7.7. Turning reasoning off fixed the generation failure. On the raw
composite number alone, it did not fix whatever the judge is penalizing.
The next section is about whether that raw number should be trusted at
face value.

### A finding about the judge itself: its corpus digest hides most of each corpus

Before answering whether the fabrication itself changed, a finding from
checking the judge's specific claims against the full corpus has to be
reported, because it changes how much weight the composite scores above
deserve.

The synthesis judge (`synth-gold-candidate-judge.mjs`) does not read the
full corpus a query was built from. It reads `corpus_digest`, a text block
capped at 6,000 characters (`CORPUS_DIGEST_CHAR_CAP` in
`synth-gold-blind.mjs`). The eight queries in this benchmark have 138 to
200 sources each. At roughly 280 characters per source snippet, a
6,000-character digest holds only the first 15 to 20 sources, in whatever
order they sit in the corpus file, nowhere close to the full list the
synthesis model itself reads (`buildSynthesisPrompt` passes it the
complete `corpus.sources`, all 138 to 200 of them). This limit is not new
to this rerun. The stored incumbent bundles
(`benchmarks/ft-data/synth-gold-blind/q00.json` through `q07.json`) carry
the same roughly 5,800 to 6,000 character cap against the same 138 to 200
source corpora, so it has applied to every model this benchmark has ever
judged, not only muse-spark.

The xhigh report named two specific "invented products" as its clearest
evidence of fabrication: a Dyson V15 Detect top pick for the vacuum query,
and an LG/Sharp pair for the microwave query, both said to "cite sources
that never mention them." Checking both against the FULL corpus, not the
judge's digest, shows the opposite:

- `google-top50-corpus.json`'s `best vacuum for pet hair` entry has 4
  sources naming the Dyson V15 Detect, including an RTINGS.com piece dated
  2026-05-14 that says, close to word for word, "The Dyson V15 Detect is
  the best vacuum cleaner for pet hair we've tested." The xhigh report's
  Dyson entry cites "RTINGS (May 14 2026, expert-domain)" for exactly this
  claim.
- Its `best microwave 2026` entry has an exact RTINGS.com source dated
  2026-04-29 naming the LG MVEM1825F as its top over-the-range pick, and a
  second RTINGS.com source dated 2026-05-29 naming the Sharp SMC2266KS as
  its top budget pick. Both dates and both product names match the
  report's citations exactly.

Neither product is invented. Both citations are real. The judge could not
see them, because they were not among the roughly 15 to 20 sources that
made it into its digest.

This was not a one-off pair of lucky checks. A scripted spot check (outlet
name plus a nearby date, matched against every source in the full corpus,
not the digest, across every product in both the xhigh and minimal
reports) found:

| Run | Outlet+date citations found in report text | Confirmed real in full corpus | Not confirmed |
| --- | --- | --- | --- |
| xhigh | 32 | 29 (90.6%) | 3 (9.4%) |
| minimal | 7 | 7 (100%) | 0 |

This check is a spot check, not a full audit: its outlet list and date
pattern are narrow, so it almost certainly misses citations phrased
differently, and it likely under-counts the true citation total (a full
manual read of the hair dryer report alone found more distinct citations
than this script caught for the entire 8-report minimal set). But every
citation it could check, in both runs, was overwhelmingly real. The three
unmatched xhigh citations (Sonos Beam / What HiFi Feb 26 2026, SEBO
Airbelt K3 / Reddit Nov 25 2025, Brother DCP-L2640DW / Consumer Reports
Feb 22 2026) were not confirmed by this method. Treat those specifically
as still open, not cleared.

Genuine fabrication does still happen. The `best printer for home` report
scores near the bottom in both runs (xhigh honesty 2/10, minimal honesty
2/10). It names an "Epson ET-3950" with zero mentions anywhere in the
181-source corpus, and an "80% cheaper ink" figure with zero matching text
anywhere in that corpus. Those two look like real fabrications, confirmed
against the full corpus, not digest artifacts.

Put together: the judge's raw honesty and grounding scores understate how
well-grounded these reports actually are, because the judge sees roughly
10% of each corpus. The deterministic gate, which does read the full
corpus, already showed this tension in the xhigh report: 0 fabricated
numbers, 0 ungrounded product names, against a judge calling entire
products "invented." The earlier report read that gap as the judge
catching a real failure mode the gate is blind to. Direct verification of
the judge's own two named examples shows the opposite: the gate was
right, and the judge's specific claim was wrong, in both checked cases.
This is a limit of the whole synth-gold judge harness, present since the
original incumbent benchmark, not something specific to muse-spark or to
this rerun. (Note: this digest cap does not affect the extract-gold
judge. `extract-gold-candidate-judge.mjs` reads the exact same source
text the extraction model was given, with no separate truncated digest,
so the Result 2 quality numbers above do not carry this caveat.)

**Direct answer: did the fabrication change?** The raw composite score did
not move (3.74 vs 3.76). But "fabrication," as the earlier report
described it, is a weaker finding than it looked. Most of the citations
checked against the full corpus, in both runs, turned out to be real. A
smaller number of genuine fabrications remain (confirmed: the Epson
ET-3950 and the "80% cheaper ink" figure). Turning reasoning off did not
change this picture either way: real fabrications and judge-invisible-but-
real citations both appear in the minimal run at roughly the rate they did
at xhigh.

### Verification: stored files gained lines, none removed

```
benchmarks/ft-data/extract-gold-deterministic.json | 150 +++++++++++++++++++++
benchmarks/ft-data/extract-gold-runs.jsonl         |  10 ++
benchmarks/ft-data/synth-gold-deterministic.json   | 170 +++++++++++++++++++++++
benchmarks/ft-data/synth-gold-runs.jsonl           |   8 ++
```

`git diff` on all four files shows insertions only, confirmed with a
`grep '^-[^-]'` pass that returned no removed lines. The xhigh rows
(label `muse-spark-1.1`) and the new minimal rows (label
`muse-spark-1.1-noreason`) both sit in these files under the same raw
OpenRouter model id, `meta/muse-spark-1.1`, distinguished by `label`. The
single-candidate blind-bundling script (`synth-gold-blind.mjs`) filtered
on that raw model id only, which would have silently merged the two runs'
reports into one bundle. It gained an optional `--label` filter for this
rerun (backward compatible: omitting it behaves exactly as before) so the
new bundle contains only the minimal run's 8 reports. See the file's
header comment for detail.

### Total spend

| Step | Spend |
| --- | --- |
| Step 1: reasoning-setting probe (6 calls) | $0.0082 |
| Stance (112 live calls) | $0.2433 |
| Extract generation (10 calls) | $0.0577 |
| Extract judge (10 calls) | $0.6942 |
| Synthesis generation (8 calls) | $0.2704 |
| Synthesis judge (8 calls) | $0.7590 |
| **Total, this rerun** | **$2.0328** |
| xhigh run (recorded above) | $3.3082 |
| **Combined total across both muse-spark runs** | **$5.3410** |

This rerun's cap was $12. It used $2.0328, about 17% of it. The combined
total across both muse-spark sessions is $5.3410.

### Revised verdict per role

**Stance: still not a clear adopt, but no longer a clear "do not adopt"
either.** Accuracy improved to 88.4%, edging past production's 87.5%, but
the confidence interval overlaps production's number, so this sample
cannot call a statistically confident winner. What is certain: the
specific failure that sank the xhigh row, near-total refusal to commit to
a stance, is gone. Cost per call ($0.00217) is real and, on list pricing,
still likely higher than production's own per-call cost (minimax-m3 lists
at roughly a quarter of muse-spark's per-token price, though production's
actual per-call cost was not re-measured here). Do not switch production
on this evidence alone. A larger, statistically powered rerun would be
needed before recommending a swap.

**Claim extraction: do not adopt, for a completely different reason than
xhigh.** The fatal integration failure is gone. Quality (7.25 vs
production's 7.60) is close but still behind, on a real 10-product sample
for the first time. Cost per call is about 32% above the current
production model. One confirmed hallucination (Google Nest Hub Max)
happened even at minimal reasoning. This is no longer disqualified by a
broken budget collision. It is a legitimate, close, but not favorable
quality-and-cost trade-off against the current production model.

**Synthesis: still do not adopt, on the composite score, but the size of
the gap is now in question.** The generation failure is gone (8/8 vs 7/8)
and generation cost roughly halved. The judge's composite score did not
move (3.74 vs 3.76) and stays far below every incumbent (6.6 to 7.7).
Checking the judge's own specific claims against the full corpus found a
real, evidenced problem in the judge harness itself: its corpus digest
covers roughly 10% of each corpus, so it misjudges a meaningful share of
real citations as fake. A smaller number of the flagged problems are
confirmed genuine fabrications. The 3.3 to 3.8 versus 6.6 to 7.7 gap, as
measured by this specific judge, should not be read as a precise measure
of how much less honest muse-spark's reports are. Whatever the true gap
is, this judge cannot currently measure it cleanly, for any model it
scores, not only muse-spark. Fixing the judge's digest cap (a larger
budget, or a relevance-selected digest instead of an order-truncated one)
would need to happen before this composite score can be trusted at face
value again.
