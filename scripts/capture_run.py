"""Record one society run into a Trace-view bundle JSON. Run once, with keys.

    python -m scripts.capture_run "What is the stablecoin landscape in 2026?" \
        frontend/src/trace/fixtures/sample.json

Heavy qwen8.* imports live INSIDE capture() so this module imports cleanly
(no keys/deps) for unit tests of the pure assembly helpers.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_provenance(raw: Any) -> list[dict]:
    out: list[dict] = []
    for p in raw or []:
        if isinstance(p, dict):
            out.append({
                "url": p.get("url", ""),
                "domain": p.get("domain", ""),
                "query": p.get("query", ""),
            })
    return out


def gap_to_dict(g: Any) -> dict:
    return {
        "gap_id": g.id,
        "question": g.question,
        "status": g.status,
        "owner": g.owner,
        "coverage": g.coverage,
        "attempts": g.attempts,
        "reason": g.reason,
        "parent_id": g.parent_id,
        "finding_ids": list(g.finding_ids or []),
        "created_at": g.created_at,
        "updated_at": g.updated_at,
    }


def assemble_bundle(meta: dict, frames: list[dict], gaps: list[dict],
                    findings: dict, report: dict) -> dict:
    return {
        "meta": meta,
        "frames": frames,
        "gaps": gaps,
        "findings": findings,
        "report": report,
    }


async def capture(
    topic: str,
    out_path: Path,
    *,
    project: str = "trace-demo",
    kb: str = "trace-demo",
    content_cap: int = 1500,
) -> dict:
    from qwen8.core.config import get_config
    from qwen8.society import run_society
    from qwen8.society.blackboard import list_gaps
    from qwen8.society.loop import bootstrap_society
    from qwen8.store import get_store

    cfg = get_config()
    store = get_store(db_path=None)
    org_id, project_id, kb_id = bootstrap_society(store, project_name=project, kb_name=kb)

    frames: list[dict] = []
    start = time.monotonic()

    async def record(name: str, data: dict) -> None:
        frames.append({"t": int((time.monotonic() - start) * 1000), "event": name, **data})

    result = await run_society(
        topic, org_id=org_id, project_id=project_id, kb_id=kb_id, cfg=cfg,
        on_event=record, store=store,
    )

    gaps = list_gaps(store, kb_id)
    fids = {fid for g in gaps for fid in (g.finding_ids or [])}
    findings: dict = {}
    for fid in fids:
        try:
            row = store.get_finding(kb_id, fid)
        except Exception:  # noqa: BLE001 — a pruned finding must not break capture
            continue
        findings[fid] = {
            "id": fid,
            "title": row.get("title", ""),
            "content": str(row.get("content", ""))[:content_cap],
            "category": row.get("category", ""),
            "confidence": row.get("confidence"),
            "provenance": normalize_provenance(row.get("provenance")),
        }

    report_frame = next((f for f in reversed(frames) if f["event"] == "report"), None)
    if report_frame is not None:
        report = {"markdown": report_frame.get("report", ""),
                  "unanswered": report_frame.get("unanswered", [])}
    else:
        report = {"markdown": result.report, "unanswered": result.unanswered}

    soc = cfg.society
    meta = {
        "topic": topic,
        "run_id": kb_id,
        "kb_id": kb_id,
        "captured_at": _now_iso(),
        "n_researchers": soc.n_researchers,
        "max_rounds": soc.max_rounds,
        "rounds": result.rounds,
        "finding_count": result.finding_count,
        "gaps_done": sum(1 for g in gaps if g.status == "done"),
        "gaps_dead": sum(1 for g in gaps if g.status == "dead"),
        "models": {
            "planner": getattr(soc, "planner_model", "qwen-max"),
            "researcher": getattr(soc, "researcher_model", "qwen-plus"),
            "critic": getattr(soc, "critic_model", "qwen-max"),
            "synthesizer": getattr(soc, "synthesizer_model", "qwen-max"),
        },
    }

    bundle = assemble_bundle(meta, frames, [gap_to_dict(g) for g in gaps], findings, report)
    out_path.write_text(json.dumps(bundle, indent=2))
    return bundle


def main() -> None:
    if len(sys.argv) < 3:
        print('usage: python -m scripts.capture_run "<topic>" <out.json>', file=sys.stderr)
        raise SystemExit(2)
    topic, out = sys.argv[1], Path(sys.argv[2])
    asyncio.run(capture(topic, out))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
