"""Map a real exploration run's output into an exploration-report manifest.

    8queens society  ─► society_to_manifest(summary.json, report.md) ─┐
    delapan_explore  ─► delapan_to_manifest(findings.json) ───────────┴─► report.json (+ report.md)

Both produce a report.json that render.py turns into the themed .docx. See from_run.py
for the CLI. The mappings are deterministic (no LLM): they shape the run's own findings
and synthesized text into a manifest with a methodology flow + a findings chart.
"""
from __future__ import annotations

import json
import os
import re
from collections import OrderedDict

COVERAGE = {"rich": "#16A951", "sparse": "#FFB61E", "gap": "#FF4C00", None: "#75878A"}


def _short(s, n=42):
    s = " ".join((s or "").split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _title_from_topic(topic):
    t = topic.split(":")[0].strip().rstrip("?.")
    return _short(t, 60) if t else "Exploration report"


def _fname(title):
    return re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-") or "report"


def society_to_manifest(summary_path, report_md_path, out_dir, *, title=None, date=None):
    """8queens society run (summary JSON + synthesized report markdown) → manifest."""
    s = json.load(open(summary_path, encoding="utf-8"))
    os.makedirs(out_dir, exist_ok=True)

    # cover carries the title → drop a single leading top-level title line from the body
    lines = open(report_md_path, encoding="utf-8").read().splitlines()
    body, dropped = [], False
    for ln in lines:
        if not dropped and re.match(r"^#{1,2}\s+\S", ln):
            dropped = True
            continue
        body.append(ln)
    open(os.path.join(out_dir, "report.md"), "w", encoding="utf-8").write("\n".join(body).strip() + "\n")

    topic = s.get("topic", "Exploration report")
    gaps = s.get("gaps", [])
    flow = {
        "id": "flow", "type": "flow", "after_heading": "TOP",
        "title": "How the 8queens society built this",
        "stages": [
            {"text": "Topic", "role": "accent"},
            {"text": "Planner\ndecompose", "role": "process"},
            {"text": "Researchers\nsearch + extract", "role": "process"},
            {"text": "Critic\nre-band", "role": "decision"},
            {"text": "Synthesizer\nreport", "role": "terminal"},
        ],
        "feedback": {"from": 3, "to": 2, "label": "reopen if sparse/gap"},
        "caption": ("Figure 1. A planner opens gaps on a shared blackboard, researchers fill them "
                    "from the web, a critic re-bands coverage and reopens weak gaps, and a synthesizer "
                    "writes the report once coverage is rich."),
    }
    per_gap = {
        "id": "per_gap", "type": "hbar", "after_heading": "TOP",
        "title": "Findings merged per research gap", "xlabel": "findings (coverage-banded)",
        "labels": [_short(g.get("q", "")) for g in gaps],
        "values": [g.get("n_findings", 0) for g in gaps],
        "colors": [COVERAGE.get(g.get("coverage")) for g in gaps],
        "caption": ("Figure 2. Findings the society merged per gap, colored by final coverage "
                    "(green rich · gold sparse · red gap)."),
    }
    manifest = {
        "title": title or _title_from_topic(topic),
        "subtitle": _short(topic, 90),
        "meta": ["8queens society run",
                 f"{s.get('finding_count', '?')} findings · {len(gaps)} gaps · {s.get('rounds', '?')} round(s)"],
        "seal": "议",
        "report_md": "report.md",
        "out": _fname(title or _title_from_topic(topic)) + "-society.docx",
        "figures": [flow, per_gap],
    }
    if date:
        manifest["date"] = date
    mpath = os.path.join(out_dir, "report.json")
    json.dump(manifest, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return mpath


def delapan_to_manifest(findings_path, out_dir, *, title="Knowledge Base Report", topic=None,
                        seal="识", date=None):
    """delapan findings (delapan_search/resume JSON, or a list of finding rows) → manifest.

    Findings are grouped by `category` into report sections (deterministic — no LLM)."""
    data = json.load(open(findings_path, encoding="utf-8"))
    findings = data.get("findings", data) if isinstance(data, dict) else data
    os.makedirs(out_dir, exist_ok=True)

    groups = OrderedDict()
    for f in findings:
        groups.setdefault(f.get("category") or "Findings", []).append(f)

    md = [f"_{topic}_\n"] if topic else []
    for cat, items in groups.items():
        md.append(f"## {cat}\n")
        for f in items:
            t = (f.get("title") or "").strip()
            c = " ".join((f.get("content") or "").split())
            c = c[:380] + ("…" if len(c) > 380 else "")
            md.append(f"- **{t}** — {c}" if t else f"- {c}")
        md.append("")
    open(os.path.join(out_dir, "report.md"), "w", encoding="utf-8").write("\n".join(md).strip() + "\n")

    cats = list(groups.keys())
    flow = {
        "id": "flow", "type": "flow", "after_heading": "TOP", "title": "How delapan built this KB",
        "stages": [
            {"text": "Prompt", "role": "accent"}, {"text": "Plan", "role": "process"},
            {"text": "Search", "role": "process"}, {"text": "Crawl", "role": "process"},
            {"text": "Extract", "role": "process"}, {"text": "Merge\ndedupe", "role": "terminal"},
        ],
        "caption": ("Figure 1. delapan's exploration pipeline: plan → search → crawl → extract → "
                    "merge into deduplicated, embedded findings."),
    }
    by_cat = {
        "id": "by_cat", "type": "hbar", "after_heading": "TOP", "title": "Findings by category",
        "xlabel": "findings", "labels": [_short(c, 30) for c in cats],
        "values": [len(groups[c]) for c in cats],
        "caption": "Figure 2. Distribution of merged findings across categories in the KB.",
    }
    manifest = {
        "title": title, "subtitle": topic or "Findings from a delapan exploration",
        "meta": [f"delapan KB · {len(findings)} findings", f"{len(cats)} categories"],
        "seal": seal, "report_md": "report.md", "out": _fname(title) + "-delapan.docx",
        "figures": [flow, by_cat],
    }
    if date:
        manifest["date"] = date
    mpath = os.path.join(out_dir, "report.json")
    json.dump(manifest, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return mpath
