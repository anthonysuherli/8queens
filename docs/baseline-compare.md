# Single-agent vs society — "The state of open-weight LLMs in 2026: who leads on benchmarks, licensing, and adoption?"

Both KBs probed with the same 7 evaluation question(s).

| Metric | Single agent | Society |
|---|---|---|
| Findings persisted | 133 | 336 |
| Distinct finding titles | 133 | 336 |
| Unique source domains | 12 | 5 |
| Probe coverage | 6 rich / 1 sparse / 0 gap | 7 rich / 0 sparse / 0 gap |
| Mean band-1 hits per probe | 7.7 | 9.0 |
| LLM calls | 15 | 51 |
| Wall time (s) | 287 | 570 |
| Findings per LLM call | 8.87 | 6.59 |

Society: 1 round(s), 4 gap(s) done, 0 dead.

Method notes: Probe 0 is the raw topic; remaining probes are generated once by
the chat-agent model (not the society's planner) and applied identically to both
KBs. Finding counts are raw persisted rows (no cross-exploration dedup) — the
distinct-titles row is the dedup-adjusted view. Society LLM calls include
planner/critic/synthesizer overhead; the single agent has no synthesis stage.