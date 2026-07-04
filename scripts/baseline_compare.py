"""Single-agent vs society comparison — the track's "measurable efficiency gain".

    topic ──► generate_probes (1 LLM call, neutral eval questions)
      ├─► single-agent KB: run_exploration once ─► persist (mirrors Researcher)
      ├─► society KB:      run_society (its own reset + kill-switch)
      └─► probe BOTH KBs with the SAME questions ─► band/assess per probe
    ──► out.json + out.md (findings, domains, coverage, LLM calls, wall time)

The baseline is the repo's own single-agent pipeline (`run_exploration` — the
same engine a society Researcher runs per gap), applied once to the raw topic.
Local tier only (reads finding ids via the SQLite connection).

CLI: python -m scripts.baseline_compare "<topic>" <out.json> [--project ...]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

from pydantic import BaseModel

from queens8.core.agent.preamble import assess_coverage, band_findings
from queens8.core.clients.ai_gateway import llm_calls, reset_llm_calls, structured_completion
from queens8.core.clients.embeddings import embed_batch, embed_text
from queens8.core.config import get_config
from queens8.core.exploration import run_exploration
from queens8.mcp.server import _normalize_provenance, _now_iso, _render_content
from queens8.society import run_society
from queens8.society.blackboard import list_gaps
from queens8.society.loop import bootstrap_society
from queens8.store import get_store

# ---------------------------------------------------------------------------
# pure helpers
# ---------------------------------------------------------------------------


def slugify(topic: str) -> str:
    """kb-name-safe slug: lowercase alnum runs joined by '-', capped at 40."""
    slug = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")
    return slug[:40].rstrip("-")


def domains_from_findings(rows: list[dict]) -> list[str]:
    """Sorted unique source hosts (lowercased, www-stripped) from provenance."""
    domains: set[str] = set()
    for row in rows:
        for entry in row.get("provenance") or []:
            if not isinstance(entry, dict):
                continue
            host = urlparse(entry.get("url") or "").netloc.lower().removeprefix("www.")
            if host:
                domains.add(host)
    return sorted(domains)


def distinct_title_count(rows: list[dict]) -> int:
    """Findings with distinct normalized titles — a cheap dedup-adjusted count
    (cross-exploration duplicates inflate raw rows on the society side only)."""
    return len({
        " ".join(str(row.get("title") or "").lower().split())
        for row in rows if str(row.get("title") or "").strip()
    })


def coverage_summary(covs: list[dict]) -> dict:
    """Aggregate per-probe verdicts into {rich, sparse, gap, mean_band1_hits}."""
    counts = {"rich": 0, "sparse": 0, "gap": 0}
    for c in covs:
        if c["coverage"] in counts:
            counts[c["coverage"]] += 1
    mean = sum(c["band1_hits"] for c in covs) / len(covs) if covs else 0.0
    return {**counts, "mean_band1_hits": mean}


def _ratio(findings: int, calls: int) -> str:
    return f"{findings / calls:.2f}" if calls else "n/a"


def render_comparison_md(result: dict) -> str:
    """README-ready markdown table for one comparison run."""
    s, m = result["single"], result["society"]

    def cov(side: dict) -> str:
        c = side["coverage"]
        return f"{c['rich']} rich / {c['sparse']} sparse / {c['gap']} gap"

    lines = [
        f"# Single-agent vs society — \"{result['topic']}\"",
        "",
        f"Both KBs probed with the same {len(result['probes'])} evaluation question(s).",
        "",
        "| Metric | Single agent | Society |",
        "|---|---|---|",
        f"| Findings persisted | {s['findings']} | {m['findings']} |",
        f"| Distinct finding titles | {s['distinct_titles']} | {m['distinct_titles']} |",
        f"| Unique source domains | {s['unique_domains']} | {m['unique_domains']} |",
        f"| Probe coverage | {cov(s)} | {cov(m)} |",
        f"| Mean band-1 hits per probe | {s['coverage']['mean_band1_hits']:.1f} "
        f"| {m['coverage']['mean_band1_hits']:.1f} |",
        f"| LLM calls | {s['llm_calls']} | {m['llm_calls']} |",
        f"| Wall time (s) | {s['wall_seconds']:.0f} | {m['wall_seconds']:.0f} |",
        f"| Findings per LLM call | {_ratio(s['findings'], s['llm_calls'])} "
        f"| {_ratio(m['findings'], m['llm_calls'])} |",
        "",
        f"Society: {m.get('rounds', 0)} round(s), {m.get('gaps_done', 0)} gap(s) done, "
        f"{m.get('gaps_dead', 0)} dead.",
        "",
        "Method notes: Probe 0 is the raw topic; remaining probes are generated once by",
        "the chat-agent model (not the society's planner) and applied identically to both",
        "KBs. Finding counts are raw persisted rows (no cross-exploration dedup) — the",
        "distinct-titles row is the dedup-adjusted view. Society LLM calls include",
        "planner/critic/synthesizer overhead; the single agent has no synthesis stage.",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# single-agent runner (persistence mirrors Researcher.step / routes_explore)
# ---------------------------------------------------------------------------


async def persist_findings(store, *, org_id: str, kb_id: str, findings) -> list[str]:
    """Render → batch-embed → insert, with the EXACT insert_findings key set."""
    if not findings:
        return []
    rows, bodies = [], []
    for f in findings:
        body = _render_content(f.content)
        rows.append({
            "org_id": org_id,
            "kb_id": kb_id,
            "title": f.title,
            "content": body,
            "category": f.category,
            "confidence": float(f.confidence) if f.confidence is not None else None,
            "tags": list(f.tags or []),
            "provenance": _normalize_provenance(f.provenance),
        })
        bodies.append(body)
    embeddings = await embed_batch(bodies)
    for row, e in zip(rows, embeddings):
        row["embedding"] = e
    return await store.insert_findings(rows)


async def run_single_agent(store, *, org_id: str, project_id: str, kb_id: str,
                           topic: str, cfg) -> dict:
    """One plan→search→crawl→extract→merge pass on the raw topic, persisted."""
    reset_llm_calls()
    start = time.monotonic()
    exp_id = store.create_exploration(org_id, kb_id, topic)
    try:
        findings = await run_exploration(
            topic, exploration_id=exp_id, project_id=project_id,
            kb_id=kb_id, cfg=cfg.exploration, lens="explore",
        )
        ids = await persist_findings(store, org_id=org_id, kb_id=kb_id, findings=findings)
    except Exception as exc:  # noqa: BLE001 — stamp the row, then surface
        store.update_exploration(exp_id, status="failed", completed_at=_now_iso(),
                                 error=str(exc))
        raise
    store.update_exploration(exp_id, status="completed", completed_at=_now_iso(),
                             finding_ids=ids)
    return {"finding_ids": ids, "llm_calls": llm_calls(),
            "wall_seconds": time.monotonic() - start}


# ---------------------------------------------------------------------------
# shared evaluation
# ---------------------------------------------------------------------------


class _Probe(BaseModel):
    question: str


class _ProbeSet(BaseModel):
    questions: list[_Probe]


async def generate_probes(topic: str, *, cfg, k: int = 6) -> list[str]:
    """K neutral evaluation questions, generated once and used on both KBs."""
    # Deliberately NOT the society's planner model: probes drawn from the same
    # model+prompt distribution the Planner optimizes against would bias the eval.
    resp = await structured_completion(
        model=cfg.agent.model,
        response_format=_ProbeSet,
        system=(
            "You write evaluation rubrics for research coverage. Given a topic, "
            "produce the distinct factual sub-questions a complete research report "
            "on it must answer. Questions must be specific and independently checkable."
        ),
        user=f"Topic: {topic}\n\nWrite {k} evaluation questions.",
        temperature=cfg.society.temperature,
        use_json_schema=False,
    )
    seen: set[str] = set()
    out: list[str] = []
    for q in resp.questions:
        text = q.question.strip()
        key = " ".join(text.lower().split())
        if not text or key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= k:
            break
    return out


async def probe_coverage(store, *, kb_id: str, probes: list[str], cfg) -> list[dict]:
    """Per-probe {question, coverage, band1_hits} — same banding the roles use."""
    out: list[dict] = []
    for q in probes:
        emb = await embed_text(q)
        rows = await store.match_findings(
            kb_id, emb, cfg.search.default_limit, cfg.search.min_similarity)
        bands = band_findings(rows, cfg.tiers)
        out.append({"question": q, "coverage": assess_coverage(bands, cfg.tiers),
                    "band1_hits": len(bands[1])})
    return out


def _finding_rows(store, kb_id: str) -> list[dict]:
    """All finding rows (with provenance) in a KB — local tier only."""
    ids = [r[0] for r in store._conn.execute(
        "SELECT id FROM findings WHERE kb_id = ?", (kb_id,)).fetchall()]
    return [store.get_finding(kb_id, fid) for fid in ids]


# ---------------------------------------------------------------------------
# orchestration
# ---------------------------------------------------------------------------


async def compare(topic: str, *, project: str = "baseline-compare",
                  kb_single: str | None = None, kb_society: str | None = None,
                  out_path: Path, probe_count: int = 6) -> dict:
    """Run both sides on isolated KBs, probe them identically, write artifacts."""
    cfg = get_config()
    store = get_store(db_path=None)
    if not hasattr(store, "_conn"):
        raise RuntimeError(
            "baseline_compare needs the local SQLite tier — set QUEENS8_BACKEND=local")
    slug = slugify(topic)
    kb_single = kb_single or f"single-{slug}"
    kb_society = kb_society or f"society-{slug}"

    org_id, project_id, kb_single_id = bootstrap_society(
        store, project_name=project, kb_name=kb_single)
    _, _, kb_society_id = bootstrap_society(
        store, project_name=project, kb_name=kb_society)

    # Deterministic names + find-or-create bootstrap: a rerun would mix stale
    # rows into the metrics (and the society's rich-skip gate would fire on
    # leftovers, faking a near-zero-call "win"). Refuse instead.
    for kb_id, name in ((kb_single_id, kb_single), (kb_society_id, kb_society)):
        if store.count_findings(kb_id) or list_gaps(store, kb_id):
            raise RuntimeError(
                f"KB '{name}' is pre-populated — rerun with a fresh --project")

    probes = [topic, *await generate_probes(topic, cfg=cfg, k=probe_count)]

    single = await run_single_agent(store, org_id=org_id, project_id=project_id,
                                    kb_id=kb_single_id, topic=topic, cfg=cfg)

    start = time.monotonic()
    society = await run_society(topic, org_id=org_id, project_id=project_id,
                                kb_id=kb_society_id, cfg=cfg,
                                n_researchers=cfg.society.n_researchers,
                                max_rounds=cfg.society.max_rounds,
                                max_attempts=cfg.society.max_attempts,
                                spawn_budget=cfg.society.spawn_budget,
                                store=store)
    society_wall = time.monotonic() - start
    society_calls = llm_calls()  # run_society resets the counter at its own start

    single_cov = await probe_coverage(store, kb_id=kb_single_id, probes=probes, cfg=cfg)
    society_cov = await probe_coverage(store, kb_id=kb_society_id, probes=probes, cfg=cfg)
    single_rows = _finding_rows(store, kb_single_id)
    society_rows = _finding_rows(store, kb_society_id)
    gaps = list_gaps(store, kb_society_id)

    result = {
        "topic": topic,
        "probes": probes,
        "config": {
            "n_researchers": cfg.society.n_researchers,
            "max_rounds": cfg.society.max_rounds,
            "max_llm_calls_per_run": cfg.society.max_llm_calls_per_run,
        },
        "single": {
            "kb": kb_single,
            "findings": len(single_rows),
            "distinct_titles": distinct_title_count(single_rows),
            "unique_domains": len(domains_from_findings(single_rows)),
            "llm_calls": single["llm_calls"],
            "wall_seconds": single["wall_seconds"],
            "coverage": coverage_summary(single_cov),
            "coverage_per_probe": single_cov,
        },
        "society": {
            "kb": kb_society,
            "findings": len(society_rows),
            "distinct_titles": distinct_title_count(society_rows),
            "unique_domains": len(domains_from_findings(society_rows)),
            "llm_calls": society_calls,
            "wall_seconds": society_wall,
            "coverage": coverage_summary(society_cov),
            "coverage_per_probe": society_cov,
            "rounds": society.rounds,
            "gaps_done": sum(1 for g in gaps if g.status == "done"),
            "gaps_dead": sum(1 for g in gaps if g.status == "dead"),
            "report": society.report,
        },
    }

    out_path = Path(out_path)
    out_path.write_text(json.dumps(result, indent=2))
    out_path.with_suffix(".md").write_text(render_comparison_md(result))
    return result


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(
        description="Run the single-agent-vs-society comparison on one topic.")
    ap.add_argument("topic")
    ap.add_argument("out", type=Path, help="output json path (md written alongside)")
    ap.add_argument("--project", default="baseline-compare")
    ap.add_argument("--probes", type=int, default=6)
    args = ap.parse_args(argv)
    result = asyncio.run(compare(args.topic, project=args.project,
                                 out_path=args.out, probe_count=args.probes))
    print(render_comparison_md(result))


if __name__ == "__main__":
    main()
