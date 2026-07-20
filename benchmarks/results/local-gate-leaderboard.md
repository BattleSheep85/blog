# Local Ollama Gate Leaderboard

Generated: 2026-07-14T00:05:49.154Z

Groundedness gate: fraction of emitted prices/spec-numbers NOT traceable to the sources the synth was given for that scenario. Lower ungrounded = more honest. nums_emitted = count of prices+spec-numbers the model actually emitted; a high grounding_score with nums_emitted=0 means the model ABSTAINED (emitted nothing gradeable), which is flagged as ABSTAIN, not PASS. Cloud anchors kimi-k2.6 and opus-4.8 are the ≈0-ungrounded PASS reference; the GLM-5.2 figure varies by prompt revision in-repo, so treat kimi/opus as the honesty anchor.

| model | tier | grounding_score | nums_emitted | ungrounded_price_frac | ungrounded_spec_frac | json_rate | trap_last_or_absent | legit_on_top | schema | p50_latency_ms | verdict | fail_reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| z-ai/glm-5.2 | cloud-anchor | 1 | 7 | 0 | 0 | 1 | 6 | 6 | 0.94 | 32982 | PASS |  |
| moonshotai/kimi-k2.6 | cloud-anchor | 1 | 9 | 0 | 0 | 1 | 6 | 6 | 0.833 | 33375 | PASS |  |
| anthropic/claude-opus-4.8 | cloud-anchor | 1 | 6 | 0 | 0 | 1 | 6 | 5 | 1 | 37594 | FAIL | legit_on_top=5 (want 6) |
| gemma4:12b | local-7900xtx | 1 | 4 | 0 | 0 | 0.833 | 6 | 5 | 0.667 | 41384 | FAIL | legit_on_top=5 (want 6) |
| gemma4:26b | local-7900xtx | 1 | 9 | 0 | 0 | 1 | 6 | 4 | 0.889 | 38863 | FAIL | legit_on_top=4 (want 6) |
| qwen3.6:27b | local-7900xtx | 0.929 | 10 | 0 | 0.143 | 1 | 6 | 5 | 0.834 | 72640 | FAIL | legit_on_top=5 (want 6) |
| phi4:14b | local-7900xtx | 0.917 | 7 | 0 | 0.167 | 1 | 6 | 5 | 0.723 | 73932 | FAIL | legit_on_top=5 (want 6) |
| qwen2.5:14b | local-7900xtx | 0.7 | 6 | 0 | 0.6 | 1 | 6 | 6 | 0.634 | 51588 | FAIL | ungrounded_spec_frac=0.6 |
| glm-4.7-flash:latest | local-7900xtx | 0.619 | 23 | 0.333 | 0.429 | 1 | 6 | 6 | 0.926 | 24739 | FAIL | ungrounded_spec_frac=0.429 |
| exaone3.5:32b | local-7900xtx | 0.55 | 26 | 0.4 | 0.5 | 1 | 6 | 6 | 0.704 | 147497 | FAIL | ungrounded_spec_frac=0.5 |
| cogito:32b | local-7900xtx | 0.519 | 36 | 0.333 | 0.63 | 1 | 6 | 5 | 0.778 | 124454 | FAIL | legit_on_top=5 (want 6) |
| falcon3:10b | local-7900xtx | 0.384 | 11 | 0.4 | 0.833 | 0.667 | 6 | 4 | 0.5 | 19497 | FAIL | legit_on_top=4 (want 6) |
| mistral-small3.2:24b | local-7900xtx | 0.367 | 29 | 0.545 | 0.722 | 1 | 6 | 6 | 0.935 | 44002 | FAIL | ungrounded_spec_frac=0.722 |
| aya-expanse:32b | local-7900xtx | 0.357 | 40 | 0.5 | 0.786 | 1 | 6 | 6 | 0.704 | 41998 | FAIL | ungrounded_spec_frac=0.786 |
| qwen3.5:9b | local-7900xtx | 0.336 | 33 | 0.5 | 0.828 | 1 | 6 | 6 | 0.911 | 44937 | FAIL | ungrounded_spec_frac=0.828 |
| gemma2:9b | local-7900xtx | 0.312 | 41 | 0.583 | 0.793 | 1 | 6 | 6 | 0.834 | 33220 | FAIL | ungrounded_spec_frac=0.793 |
| gemma3n:e4b | local-7900xtx | 0.303 | 28 | 0.667 | 0.727 | 0.5 | 6 | 3 | 0.315 | 36386 | FAIL | legit_on_top=3 (want 6) |
| qwen2.5:7b | local-7900xtx | 0.299 | 26 | 0.625 | 0.778 | 1 | 6 | 6 | 0.66 | 29611 | FAIL | ungrounded_spec_frac=0.778 |
| mistral-nemo:12b | local-7900xtx | 0.284 | 35 | 0.6 | 0.833 | 1 | 6 | 6 | 0.593 | 117799 | FAIL | ungrounded_spec_frac=0.833 |
| granite3.3:8b | local-7900xtx | 0.235 | 58 | 0.636 | 0.894 | 1 | 6 | 6 | 0.723 | 19935 | FAIL | ungrounded_spec_frac=0.894 |
| lfm2:24b | local-7900xtx | 0.183 | 60 | 0.786 | 0.848 | 1 | 6 | 6 | 0.815 | 9506 | FAIL | ungrounded_spec_frac=0.848 |
| nemotron-3-nano:4b | local-7900xtx | 0.173 | 52 | 0.727 | 0.927 | 1 | 6 | 6 | 0.667 | 11617 | FAIL | ungrounded_spec_frac=0.927 |
| phi4-mini:3.8b | local-7900xtx | 1 | 0 |  |  | 1 | 6 | 5 | 0.378 | 5786 | ABSTAIN | emitted 0 grade-able numbers (abstention, not grounding) |
