# Synthesis re-score on corrected measurement (2026-07-28)

Implements `docs/benchmark-validity-audit.md`. Re-scores all 64 stored
synthesis reports and re-judges the extract gold bench on full text.
No production model was changed. `worker/lib/engine-config.js` was not touched.

Total spend for this work: **$9.2339** against a $14 cap.

---

## 1. What was wrong

The synthesis gold benchmark judged grounding and honesty with an LLM that was
shown a 6,000 character corpus digest built in raw list order, while the corpora
hold 138 to 200 sources. Measured coverage was 0 to 13 percent of sources per
query, and two of the eight queries gave the judge zero sources, only notes. The
judge was then asked whether products and citations were invented, and it
answered. Three separate checking layers, including the audit's own manual
rerun, each called a REAL thing a fabrication: the Seasonic PRIME TX-850, the
12-year warranty figure, and the Epson EcoTank ET-3950 are all in the corpus.

## 2. The new scoring method

Every EXISTENCE question is now answered by tested code against the full corpus.
The LLM is asked only what needs an opinion.

**Deterministic, exact, no LLM** (`benchmarks/lib/grounding-check.mjs`):

- Product names. Tokenised, brand annotated. Every digit-bearing token (the
  model number) must be present, and at least 50 percent of significant tokens
  must be present. A token counts as significant at length 3 or more, or at
  length 2 with a digit, which closes the recorded short-SKU gap ("V3").
- Numbers. The price and spec loops from `benchmarks/lib/synth-score.mjs`, with
  a test that pins the total against `score().num_ung` so the semantics cannot
  fork.
- Citations. Outlet names are matched against a lexicon built from the corpus
  hostnames and title tails, plus a static alias map. A cited date must fall
  within 3 days of a real source date from that outlet.

`G_det = 10 * (grounded weight) / (total weight)`, with product weight 3,
citation weight 2 (a date mismatch counts half), number weight 1. Ratio form,
so a model that writes more products is not punished for writing more.

**LLM judge** (`benchmarks/synth-gold-quality-judge.mjs`, `anthropic/claude-fable-5`):
told that existence is already settled and handed the result as data, then asked
for two scores only: usefulness and evidence discipline. Its input is a
relevance-selected per-product evidence table (top 3 corpus snippets per product
the report names, 300 character windows), plus every note, plus the grounding
result. Average judge input was about 14,000 characters, every piece of it
relevant to the report under judgment.

```
composite_v2 = 0.45 * G_det + 0.30 * evidence_discipline + 0.25 * usefulness
```

> **composite_v2 is NOT comparable to the stored composite.** The grounding axis
> changed source (exact code over the full corpus, instead of an LLM reading a
> digest that covered 0 to 13 percent of it) and the judge axes changed meaning
> (evidence discipline is not the old honesty axis). Do not read the two columns
> as a before and after. No stored score was edited or deleted.

### The checker was wrong twice before it was right

Both defects were found by running the checker, not by reading it. Both are now
pinned by named assertions.

1. The space-stripped haystack glued two unrelated numbers into a third. "ET-3950
   $399.99" collapses to `et395039999`, which contains `9999`, so a fabricated
   "ET-9999" was silently marked grounded. A digit-bearing token must now land on
   a non-digit boundary in the joined text.
2. The first full re-score produced 59 citation flags. Hand-auditing every one
   found that most were false: a bare year "2026" was treated as an outlet (33
   flags), "Bon Appétit" was captured as "Bon App", technology names after weak
   cues ("via MagSafe", "by Dolby Atmos") were read as publications, and one date
   was handed to every outlet in its window. After the fixes, 64 reports produce
   **2 flags in total**, and both were verified by hand as real.

## 3. Corrected leaderboard, all 8 candidates

Deterministic half is exact. Judged half is n=8 queries per model (n=7 for
muse-spark-1.1, which failed one generation).

| Model | Completions | G_det | Evid. discipline | Usefulness | **composite_v2** | ± SEM | Old composite (invalid) | Gen cost per report |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| meta/muse-spark-1.1 | 7/8 | 9.98 | 6.43 | 7.86 | **8.38** | 0.15 | n/a | $0.08 |
| openai/gpt-5.4-mini | 8/8 | 10.00 | 6.38 | 7.13 | **8.19** | 0.33 | 7.61 | $0.02 |
| **minimax/minimax-m3 (seated)** | 8/8 | 9.98 | 5.38 | 7.81 | **8.06** | 0.22 | 7.69 | $0.01 |
| deepseek/deepseek-v4-flash | 8/8 | 9.59 | 5.38 | 7.38 | **7.77** | 0.36 | 6.64 | $0.00 |
| meta/muse-spark-1.1-noreason | 8/8 | 9.87 | 4.88 | 7.25 | **7.72** | 0.29 | n/a | $0.03 |
| anthropic/claude-haiku-4.5 | 8/8 | 10.00 | 4.63 | 6.63 | **7.54** | 0.27 | 6.88 | $0.05 |
| google/gemma-4-26b-a4b-it:free | 3/8 | 10.00 | 5.00 | 5.67 | **7.42** | 0.11 | 6.22 | $0.00 |
| openai/gpt-5-nano | 6/8 | 10.00 | 4.17 | 5.50 | **7.13** | 0.15 | 5.91 | $0.01 |

Deterministic detail behind the G_det column:

| Model | Products | Not grounded | Citations checked | Not verified | Numbers checked | Not grounded |
|---|---:|---:|---:|---:|---:|---:|
| muse-spark-1.1 | 41 | 0 | 112 | 1 | 89 | 0 |
| gpt-5.4-mini | 30 | 0 | 11 | 0 | 56 | 0 |
| minimax-m3 | 49 | 0 | 41 | 0 | 92 | 1 |
| deepseek-v4-flash | 37 | 0 | 38 | 0 | 175 | **22** |
| muse-spark-1.1-noreason | 41 | 1 | 56 | 0 | 79 | 0 |
| claude-haiku-4.5 | 50 | 0 | 24 | 0 | 106 | 0 |
| gemma-4-26b | 9 | 0 | 1 | 0 | 10 | 0 |
| gpt-5-nano | 19 | 0 | 12 | 0 | 31 | 0 |

The only two flags across all 64 reports, both hand-verified against the full
corpus:

- **muse-spark-1.1-noreason, "Breville Combi Wave 3-in-1 BMO870".** The product
  is real and appears 9 times in the microwave corpus. The model number BMO870
  appears nowhere. The only Breville model number in that corpus is BMO850BSS, a
  different unit. Correct catch: a real product with an attached model number
  that no source supports.
- **muse-spark-1.1, "per Reddit favorites guide Jun 14 2026".** Reddit is a real
  outlet in that corpus, with sources dated 2025-07-24, 2025-08-01, 2025-10-09,
  2026-01-02 and 2026-05-23. None is near Jun 14 2026. Soft date mismatch, half
  credit, not a fabricated outlet.

## 4. Which model should hold the synthesis seat

**The seat should stay with `minimax/minimax-m3`. The audit's tentative lean
toward `anthropic/claude-haiku-4.5` is overturned.**

The audit reasoned from the deterministic gate alone, where haiku looked at least
equal (0 versus 1 ungrounded numbers, 50 versus 49 grounded products, both 8/8).
That reading holds, and it is also almost meaningless at that size: one
ungrounded number out of 92 checked, against zero out of 106. In ratio form the
two are 9.98 and 10.00 on G_det, a gap of 0.02 on a 10 point scale.

The judged axes, now measured on relevant evidence instead of a digest, break the
tie the other way and by a much larger amount:

| Pair | Mean paired difference in composite_v2 | ± SEM | t (df=7) | Query wins |
|---|---:|---:|---:|---|
| minimax-m3 minus claude-haiku-4.5 | **+0.51** | 0.31 | 1.63 | 5 win, 3 lose |
| minimax-m3 minus gpt-5.4-mini | -0.14 | 0.36 | -0.39 | 2 win, 6 lose |
| muse-spark-1.1 minus minimax-m3 | +0.36 | 0.22 | 1.69 | 5 win, 1 lose, 1 tie |
| gpt-5.4-mini minus claude-haiku-4.5 | +0.65 | 0.27 | 2.38 | 5 win, 1 lose, 2 tie |

**How large is the margin, and is it inside noise?** minimax-m3 leads
claude-haiku-4.5 by 0.51 composite points, about 1.6 standard errors on a paired
per-query comparison at n=8 (two-sided p about 0.15). That is directional, not
decisive. It sits inside noise at this sample size. The honest statement is:
there is no evidence for moving the seat to haiku, and weak evidence that doing
so would make things worse. haiku is last of the six models that completed 8 of 8
on both judged axes (evidence discipline 4.63, usefulness 6.63, both the lowest
in that group).

`openai/gpt-5.4-mini` scores 8.19, a statistical tie with minimax-m3 (t = -0.39,
p about 0.7). It is out of production by owner directive, so it stays a stored
baseline only.

`meta/muse-spark-1.1` tops the corrected board at 8.38. That is a real result and
it deserves stating plainly: on corrected measurement muse-spark-1.1's reports
are not less grounded than the incumbents, and its 112 checkable citations verify
at 99.1 percent. The "do not adopt" verdict still stands, but only on the grounds
that were always deterministic: it failed 1 of 8 generations, and its generation
cost is $0.08 per report against minimax-m3's $0.01, about 8 times more.

**Recommendation: no change. The production choice of minimax-m3 was made on bad
data and is now supported by good data.** This is a builder's evidence package.
A seat change is the owner's decision, and none is being asked for.

## 5. Do the previous disqualifications still stand? Yes, all three.

The audit said their DQs rested on deterministic grounds. Verified:

| Model | DQ ground | Still true on corrected measurement |
|---|---|---|
| google/gemma-4-26b-a4b-it:free | 3 of 8 completions | Yes. Completion counts come from the run records, not from any judge. |
| openai/gpt-5-nano | 6 of 8 completions | Yes. Same. |
| deepseek/deepseek-v4-flash | 22 fabricated spec numbers | Yes. Re-checked against the full corpus with the corrected checker: 22 of 175 numbers ungrounded, unchanged. Every other model in the field has 0 or 1. |

Note on the two low completers: both score G_det 10.00, but on 9 and 19 products
respectively. A model that finishes 3 of 8 reports cannot be compared on quality
to one that finishes 8. The completion column is the disqualifier, not the score.

## 6. Both muse-spark runs on the corrected leaderboard

Both are placed in the table in section 3. Summary of what changed for them:

| Run | Old composite (invalid method) | composite_v2 | Rank of 8 |
|---|---:|---:|---:|
| muse-spark-1.1 (xhigh) | 3.76 | **8.38** | 1 |
| muse-spark-1.1-noreason (minimal) | 3.74 | **7.72** | 5 |

The old numbers put both runs 3 to 4 points below every incumbent. The corrected
numbers put the xhigh run at the top of the field. The gap was almost entirely an
artefact of a judge that could not see the corpus and therefore scored real
citations as invented. muse-spark writes far more citations than any other
candidate (112 checkable citations against minimax-m3's 41), so a judge that
marks unseen citations as fake penalised it hardest.

## 7. Verdicts this re-score overturns

Listed explicitly. The entries stay in `issues.md` as history and are annotated
there, not deleted.

1. **OVERTURNED. `issues.md` 2026-07-28, muse-spark synthesis:** "a blind judge
   pass found fabricated citations (fake publication names and dates) and, in two
   of eight reports, an entire invented top-pick product not present in the source
   corpus." Deterministic re-check against the full corpus: zero invented products
   in the xhigh run, and 1 of 112 checkable citations unverified, that one being a
   date mismatch on the real outlet Reddit. The minimal run has one flagged item,
   an unsupported model number on a real product. There is no invented top pick in
   either run.
2. **OVERTURNED. `benchmarks/muse-spark-bench-2026-07.md`:** the "Epson ET-3950"
   named as a confirmed genuine fabrication with "zero mentions anywhere in the
   181-source corpus". It appears in at least 6 places in that corpus, including
   PCMag's "Best All-in-One Printer for Home Offices: Epson EcoTank ET-3950".
3. **OVERTURNED as a measurement. `benchmarks/ft-data/README.md` synthesis-gold
   results table and `issues.md` 2026-07-24:** "gpt-5.4-mini DEFENDS the synth
   seat (most honest 8.6/10)". The 8.6 honesty figure came from the invalid axis.
   The same file's deterministic claims (0 fabricated numbers, completion counts,
   deepseek's 22) stand unchanged.
4. **NO LONGER CITABLE. `issues.md` 2026-06-29:** the 50-query, 150-juror panel's
   fabrication numbers, including "grok-4.20 DQ'd on honesty (3.15 fabs/report)".
   Jurors saw 1,268 of 6,768 sources (18.7 percent), and the first juror record
   contains a confirmed false fabrication verdict. Both affected models are out of
   production, so no re-run is needed, but no future decision may cite those
   numbers. The panel's usefulness axis is not affected the same way.
5. **CLOSED. `issues.md` 2026-07-24 open item:** the short-SKU grader
   false-negative ("V3" skipping the name check). Closed in the v2 checker, with
   a regression assertion. `benchmarks/lib/synth-score.mjs` keeps its old
   behaviour on purpose, because changing it would silently alter the stored
   deterministic numbers it produced.

Not overturned: the stance gold bench, the ad-resistance canary evals, BaitBench,
the provider bench, the engine shootout, the local gate suite, and the real-world
benchmark. All are deterministic or self-contained. The audit checked each.

## 8. Extract gold, re-judged on full text

The stored extract scores were judged from bundles that clipped `source_excerpt`
at 5,000 characters, hiding up to 75 percent of the source on 5 of 10 products.
`benchmarks/extract-gold-rejudge.mjs` re-judged three labels against the full
production input. 30 calls, $2.0736.

| Model | Stored (clipped) quality | Full-text quality | Completions | Hard fails |
|---|---:|---:|---:|---:|
| **anthropic/claude-haiku-4.5 (seated)** | 7.60 | **8.00** | 10/10 | 0 |
| openai/gpt-5.4-mini | 7.60 | 7.30 | 10/10 | 0 |
| minimax/minimax-m3 | 7.69 | 8.19 | 8/10 | 2 |

**The extract seat is confirmed, and the case for it is stronger than before.**
Under the clip, haiku and gpt-5.4-mini were tied at 7.60 and haiku was adopted
only because the no-OpenAI directive removed the alternative. On full text haiku
beats gpt-5.4-mini outright, 8.00 against 7.30. minimax-m3 still scores highest
when it works and still returns empty output on the same 2 of 10 rich sources,
which is deterministic, unchanged, and still disqualifying for a pipeline-gating
step. The audit predicted low flip risk. Confirmed, with a margin that moved in
the seated model's favour.

## 9. Files

New, all additive. No stored result was edited or deleted, verified by diff.

| File | Purpose |
|---|---|
| `benchmarks/lib/grounding-check.mjs` | exact deterministic grounding, the spec API |
| `benchmarks/lib/citation-scan.mjs` | outlet and date scanning inside report prose |
| `benchmarks/lib/outlet-lexicon.mjs` | corpus outlet lexicon, date parsing |
| `benchmarks/lib/rescore-io.mjs` | read-only helpers shared by the re-score scripts |
| `benchmarks/tests/grounding-check.test.mjs` | 53 assertions, gated in `scripts/run-tests.mjs` |
| `benchmarks/tests/fixtures/audit-regression-corpus.json` | verbatim real corpus records for the three regression cases |
| `benchmarks/synth-gold-rescore.mjs` | free deterministic re-score of all 64 reports |
| `benchmarks/synth-gold-blind-v2.mjs` | v2 blinding, evidence table instead of digest |
| `benchmarks/synth-gold-quality-judge.mjs` | corrected judge, 2 axes |
| `benchmarks/synth-gold-leaderboard-v2.mjs` | joins both halves, prints the board |
| `benchmarks/extract-gold-rejudge.mjs` | full-text extract re-judge |

Outputs: `synth-gold-grounding-v2.json`, `synth-gold-blind-v2*/`,
`synth-gold-blinding-v2*.json`, `synth-gold-quality-v2-*.json`,
`synth-gold-leaderboard-v2.json`, `extract-gold-fable-scores-v2-*.json`.

## 10. Spend

| Step | Calls | Spend |
|---|---:|---:|
| Deterministic re-score, all 64 reports | 0 | $0.0000 |
| Judge prompt smoke probe | 1 | $0.1544 |
| Corrected judge, 6 incumbents x 8 queries | 48 | $4.9502 |
| Corrected judge, muse-spark-1.1 | 8 | $1.0238 |
| Corrected judge, muse-spark-1.1-noreason | 8 | $1.0319 |
| Extract full-text re-judge, 3 labels | 30 | $2.0736 |
| **Total** | **95** | **$9.2339** |

Cap was $14. Used 66 percent of it.

## 11. Known limits of the new checker

Stated so the next person does not have to rediscover them.

- The checker proves that each TOKEN of a product name exists. It cannot prove
  the COMBINATION exists. An invented name built only from real words with no new
  digits ("Samsung Bespoke UltraJet") passes. An invented model number does not.
  Pinned by an assertion so the limit stays visible.
- Number grounding is lenient by design. A bare "80" exists somewhere in every
  large corpus, so "80 percent cheaper ink" passes existence. Whether the evidence
  supports the figure is a contextual question and is routed to the judge, which
  receives that product's matched evidence. Pinned by an assertion, with a comment
  telling a future maintainer not to "fix" it into a false-positive generator.
- The open outlet scan only flags a name the corpus never mentions anywhere. An
  invented outlet whose first word is a real corpus word ("Audio Weekly") clears.
  This module chooses missed fabrications over invented ones, because the reverse
  choice was made three times and was wrong three times.
- The judge is `anthropic/claude-fable-5`, the same vendor as candidate
  `anthropic/claude-haiku-4.5`. Kept for continuity with every earlier gold bench.
  It authored none of the 64 reports. It happens to rank haiku last, which is the
  opposite of the direction the risk would predict, but the risk is real and is
  recorded.
- n=8 queries per model. Every margin in section 4 except gpt-5.4-mini against
  claude-haiku-4.5 is inside noise. This bench sizes decisions, it does not settle
  them at 2 decimal places.
