# Synthesis re-score, Opus 5 judge (2026-07)

Re-runs the judged half of `benchmarks/synth-rescore-2026-07.md` with the
judge model swapped from `anthropic/claude-fable-5` (over OpenRouter) to Opus
5 run through the Claude Code CLI, billed to the owner's Claude subscription
(the owner's rule, 2026-07-29). No production model was changed.
`worker/lib/engine-config.js` was not touched. No stored file was edited.

**Judge scores in this file are NOT comparable to the stored Fable scores.**
The judge changed, so a Fable number and an Opus 5 number for the same report
can differ for reasons that have nothing to do with the report. The
deterministic grounding numbers (`G_det`) ARE comparable across both files,
since no model is involved in producing them.

## 1. What changed, and what did not

- Prompts, blinding, the two judged axes (usefulness, evidence discipline),
  and the `composite_v2` formula are byte-identical to the Fable pass.
- The deterministic grounding half (`benchmarks/lib/grounding-check.mjs`,
  `benchmarks/ft-data/synth-gold-grounding-v2.json`) was not re-run. It has no
  judge model in it, so there was nothing to change.
- New judge outputs, one file per candidate set, none overwriting a stored
  file:
  - `benchmarks/ft-data/synth-gold-quality-v2-opus5-incumbents.json` (the 6
    incumbents, 48 calls)
  - `benchmarks/ft-data/synth-gold-quality-v2-opus5-muse-spark-1.1.json` (8 calls)
  - `benchmarks/ft-data/synth-gold-quality-v2-opus5-muse-spark-1.1-noreason.json` (8 calls)
  - `benchmarks/ft-data/extract-gold-fable-scores-v2-opus5-gpt-5.4-mini.json`,
    `-claude-haiku-4.5.json`, `-minimax-m3.json` (10 calls each, 30 total)
  - `benchmarks/ft-data/synth-gold-quality-v2-opus5-muse-spark-1.1-pilot.json`
    is the pilot run (8 calls on muse-spark-1.1 only), kept as a record of the
    projection step.

## 2. Pilot measurements

The pilot judged one model's 8 synthesis bundles (`meta/muse-spark-1.1`, 7
completed generations plus 1 recorded generation failure that costs nothing to
judge).

- Wall time: 53 seconds for 8 bundles (7 real CLI calls).
- Per-call time: 6.2 to 9.9 seconds, mean about 7.6 seconds.
- Per-call cost: $0.24 to $0.29, mean about $0.26.
- Cache behavior: the first call in the run created the CLI's 1-hour ephemeral
  system-prompt cache (cost $0.294, the highest of the 7). Later calls in the
  same run cost $0.24 to $0.27, a small but real reduction, consistent with
  reading the cache rather than recreating it. The saving was modest (roughly
  10 to 20 percent per call), not the large discount a full cache hit would
  give, likely because each judging prompt itself is multiple kilobytes of new
  content that still needs a fresh cache write on top of the reused system
  prompt.

**Projection for the full run:** 64 synthesis calls plus 30 extract calls is
94 calls. At about 7.6 seconds per call, that is about 12 minutes of wall
time, well under 5 percent of a 5-hour subscription window. This is sane to
run in full, so the full run proceeded.

## 3. Full run measurements

- Total wall time for all 94 calls (48 incumbent synthesis, 8 + 8 muse-spark
  synthesis, 30 extract): 610 seconds, about 10.2 minutes. That confirms the
  pilot's projection (about 12 minutes estimated, 10.2 actual).
- Synthesis judging spend: $9.97 (incumbents) + $1.84 (muse-spark-1.1) +
  $2.01 (muse-spark-1.1-noreason) = $13.83 across 62 real calls (2 of the 64
  bundle slots were recorded generation failures, judged at $0 cost). This
  spend is billed to the owner's subscription, not a metered dollar cost.
- Extract judging spend: $6.30 across 30 calls.
- Combined spend figure across all 94 calls: $20.13, subscription-billed.

## 4. Corrected leaderboard, Opus 5 judge, all 8 candidates

`composite_v2 = 0.45 * G_det + 0.30 * evidence_discipline + 0.25 * usefulness`,
the same formula as the Fable pass. `G_det` is the stored deterministic value
from `synth-gold-grounding-v2.json`, unchanged. Evidence discipline and
usefulness come from the new Opus 5 judge files.

| Model | Completions | G_det | Evid. discipline | Usefulness | **composite_v2 (Opus 5)** | ± SEM | composite_v2 (Fable, for reference only) |
|---|---|---:|---:|---:|---:|---:|---:|
| openai/gpt-5.4-mini | 8/8 | 10.00 | 7.50 | 6.38 | **8.34** | 0.16 | 8.19 |
| meta/muse-spark-1.1 | 7/8 | 9.98 | 6.29 | 7.43 | **8.23** | 0.29 | 8.38 |
| **minimax/minimax-m3 (seated)** | 8/8 | 9.98 | 5.50 | 7.63 | **8.05** | 0.10 | 8.06 |
| anthropic/claude-haiku-4.5 | 8/8 | 10.00 | 5.50 | 6.38 | **7.74** | 0.35 | 7.54 |
| meta/muse-spark-1.1-noreason | 8/8 | 9.87 | 5.38 | 6.69 | **7.73** | 0.26 | 7.72 |
| deepseek/deepseek-v4-flash | 8/8 | 9.59 | 5.50 | 6.94 | **7.70** | 0.28 | 7.77 |
| openai/gpt-5-nano | 6/8 | 10.00 | 4.17 | 5.00 | **7.00** | 0.20 | 7.13 |
| google/gemma-4-26b-a4b-it:free | 3/8 | 10.00 | 4.00 | 5.00 | **6.95** | 0.16 | 7.42 |

The "for reference only" column is the stored Fable composite, printed side by
side to make the size of the judge effect visible. It is not a comparison to
trust axis-by-axis, since the two judges scored different report/data
bundles rendered from the same source material, not identical inputs. Do not
read it as a before/after.

The low-completion rows (gemma-4-26b at 3/8, gpt-5-nano at 6/8) are unchanged
disqualifications: the completion count comes from the run records, not from
either judge, and neither model is a candidate for the seat regardless of
composite score.

## 5. Which model should hold the synthesis seat, on Opus 5 judging

**The seat should stay with `minimax/minimax-m3`.** The paired,
per-query comparisons against the two nearest full-completion rivals:

| Pair | Mean paired difference in composite_v2 | ± SEM | t (df) | Query wins |
|---|---:|---:|---:|---|
| minimax-m3 minus claude-haiku-4.5 | +0.30 | 0.32 | 0.95 (df=7) | 5 win, 3 lose |
| minimax-m3 minus gpt-5.4-mini | -0.30 | 0.17 | -1.73 (df=7) | 2 win, 6 lose |
| muse-spark-1.1 minus minimax-m3 | +0.23 | 0.34 | 0.66 (df=6) | 4 win, 2 lose, 1 tie |
| gpt-5.4-mini minus claude-haiku-4.5 | +0.60 | 0.28 | 2.11 (df=7) | 7 win, 1 lose |

**By what margin?** minimax-m3 leads claude-haiku-4.5 by 0.30 composite
points, well under 1 standard error (t about 0.95, two-sided p roughly 0.37).
That is a small lean toward minimax-m3, not a decisive one, and it agrees in
direction with the Fable pass's +0.51 lean on the same pair. Neither judge
gives a reason to move the seat to haiku.

minimax-m3 trails muse-spark-1.1 by 0.23 points (t about 0.66, p roughly
0.53), a smaller gap than the Fable pass measured (+0.36 for muse-spark).
Both judges rank muse-spark-1.1 ahead of minimax-m3 on raw composite, and
both agree the gap sits inside noise at n=7-8. The disqualification of
muse-spark-1.1 is unchanged and rests on deterministic grounds stated in the
Fable-era report, not on either judge's score: it completed 7 of 8
generations, and its per-report generation cost (about $0.08, unchanged) is
roughly 8 times minimax-m3's (about $0.01).

`openai/gpt-5.4-mini` scores highest of the full-completion field under Opus
5 judging (8.34), a larger lead over minimax-m3 (+0.30, t about -1.73, p
roughly 0.13) than the Fable pass found (-0.14, a near-tie). It remains out of
production by owner directive (no OpenAI in production) regardless of this
score, and stays a stored baseline only.

**Recommendation: no change.** Both judges, with different failure modes and
no shared training lineage on this question, land on the same conclusion:
minimax-m3's composite is statistically indistinguishable from
claude-haiku-4.5's and from muse-spark-1.1's at this sample size, and there is
no evidence in either pass that moving the seat would help. This is a
builder's evidence package. A seat change is the owner's decision, and none
is being asked for.

## 6. Anything that argues against this approach

- **Sample size.** n=7 or 8 per model is the same limitation the Fable pass
  had. None of the margins in section 5 clear 2 standard errors. A model
  swap on this data alone would not be well supported regardless of which
  judge produced it.
- **Per-call overhead is real.** Each CLI call pays the CLI's own system
  prompt as fresh input even when a 1-hour cache is warm from an earlier call
  in the same run, only partly offset by cache reads (see section 2). At
  100+ calls this adds real dollars of subscription-billed usage per full
  benchmark pass, though the dollar figure does not come out of a metered
  key.
- **The Opus 5 judge disagrees with Fable most on evidence discipline, not
  usefulness.** gpt-5.4-mini's evidence-discipline score jumped from (not
  separately reported in the Fable file at the per-axis level available here,
  see `synth-gold-quality-v2-incumbents.json` for the stored Fable per-axis
  numbers) to 7.50 under Opus 5, the highest evidence-discipline score of any
  candidate in this pass. Whether that reflects Opus 5 being a more lenient
  or a more accurate reader of hedging language is a judgment call this
  report cannot settle from the data alone. Treat axis-level swings this size
  as a property of the judge change, not of a report getting better or worse.
- **One judge is not two judges.** Model-family similarity between a judge and
  a candidate (Fable and haiku were both Anthropic; there is no such overlap
  here, since minimax and muse-spark are not Anthropic models and Opus 5 is)
  is a smaller concern for this pass than it was for the Fable pass, which is
  a point in favor of trusting this run's haiku score more than the Fable
  run's.
