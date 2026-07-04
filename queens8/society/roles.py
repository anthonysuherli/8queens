"""Society roles. Each role reads/writes the shared brain through the Store seam
and the blackboard; each runs at most one Qwen prompt of its own. Heavy lifting
(plan→search→crawl→extract→merge) is delegated to the vendored engine.

Roles use `structured_completion(use_json_schema=False)` — DashScope has no
`json_schema` mode. `cfg` is the full AppConfig (roles read cfg.search/cfg.tiers/
cfg.exploration and the new cfg.society.* knobs).

ASCII flow (Researcher.step):
  claim_gap → embed_text → match_findings → band_findings → assess_coverage
    → [rich-skip gate, skip if reason=='sharpen']
    → create_exploration → run_exploration
    → for each Finding: _render_content
    → embed_batch (ONE call) → build rows → insert_findings
    → update_exploration → recompute coverage → complete_gap
"""

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable

from pydantic import BaseModel

from queens8.core.agent.preamble import assess_coverage, band_findings
from queens8.core.clients.ai_gateway import structured_completion
from queens8.core.clients.embeddings import embed_batch, embed_text
from queens8.core.exploration.engine import run_exploration
from queens8.mcp.server import _normalize_provenance, _now_iso, _render_content
from queens8.society.blackboard import (
    Gap,
    claim_gap,
    complete_gap,
    create_gaps,
    list_gaps,
    reopen_gap,
)

_PLANNER_PROMPT = (
    "Decompose this research topic into 4-8 INDEPENDENT, atomic sub-questions, "
    "each answerable from a few web sources. Return a single JSON object "
    '{"questions":[{"question": ..., "rationale": ...}]}. '
    "No overlap, no compound questions."
)

_CRITIC_PROMPT = (
    "Given this sub-question and the titles+snippets of findings gathered, is it "
    "sufficiently answered? Return a single JSON object "
    '{"answered": bool, "reason": "sharpen"|"insufficient", '
    '"question": <sharper question or null>}. '
    "If sharpen, provide a narrower question."
)

_SYNTH_PROMPT = (
    "Write a cited synthesis answering the root topic. Use ONLY the provided "
    "findings; cite each claim with (finding_id: ...). List any sub-questions that "
    "remain dead/unanswered. Return a JSON object with report (markdown) and "
    "unanswered (list)."
)


# --- LLM response schemas ----------------------------------------------------


class _PlannerQuestion(BaseModel):
    question: str
    rationale: str = ""


class _PlannerOut(BaseModel):
    questions: list[_PlannerQuestion]


class _CriticOut(BaseModel):
    answered: bool
    reason: str = "insufficient"
    question: str | None = None


class _SynthOut(BaseModel):
    report: str
    unanswered: list[str] = []


def _normalize_q(q: str) -> str:
    return " ".join(q.lower().split())


# --- Planner -----------------------------------------------------------------


class Planner:
    """qwen-max — decomposes the topic into open gaps once."""

    def __init__(
        self,
        store,
        *,
        org_id: str,
        project_id: str,
        kb_id: str,
        cfg,
        on_event: Callable[[str, dict], Awaitable[None]] | None = None,
    ) -> None:
        self.store = store
        self.org_id = org_id
        self.project_id = project_id
        self.kb_id = kb_id
        self.cfg = cfg
        self.on_event = on_event

    async def _emit(self, name: str, data: dict) -> None:
        if self.on_event:
            await self.on_event(name, data)

    async def seed(self, topic: str) -> list[Gap]:
        out = await structured_completion(
            model=self.cfg.society.planner_model,
            response_format=_PlannerOut,
            system=_PLANNER_PROMPT,
            user=topic,
            temperature=self.cfg.society.temperature,
            use_json_schema=False,
        )
        seen: set[str] = set()
        questions: list[str] = []
        for q in out.questions:
            norm = _normalize_q(q.question)
            if norm and norm not in seen:
                seen.add(norm)
                questions.append(q.question)
        create_gaps(self.store, self.kb_id, self.project_id, questions)
        seeded = list_gaps(self.store, self.kb_id, status="open")
        # SSE: synthesize a gap_opened + question node per fresh gap (KG is OFF).
        for g in seeded:
            await self._emit("gap_opened", {
                "gap_id": g.id, "question": g.question, "parent_id": None,
            })
            await self._emit("node_added", {
                "id": g.id, "type": "question", "label": g.question,
                "properties": {"status": "open", "coverage": None},
                "grounded_in": [], "created_at": _now_iso(),
                "contributor": "planner", "role": "researcher",
            })
        return seeded


# --- Researcher --------------------------------------------------------------


class Researcher:
    """qwen-plus — claim worst-covered gap, run exploration, embed+persist, verify."""

    def __init__(
        self,
        store,
        *,
        org_id: str,
        project_id: str,
        kb_id: str,
        cfg,
        researcher_id: str,
        on_event: Callable[[str, dict], Awaitable[None]] | None = None,
    ) -> None:
        self.store = store
        self.org_id = org_id
        self.project_id = project_id
        self.kb_id = kb_id
        self.cfg = cfg
        self.researcher_id = researcher_id
        self.on_event = on_event

    async def _emit(self, name: str, data: dict) -> None:
        if self.on_event:
            await self.on_event(name, data)

    async def step(self) -> bool:
        gap = claim_gap(self.store, self.kb_id, owner=self.researcher_id)
        if gap is None:
            return False
        await self._emit("gap_claimed", {
            "gap_id": gap.id, "claimed_by": self.researcher_id, "role": "researcher",
        })

        # Coverage recompute (scheduling signal + the rich-skip gate).
        emb = await embed_text(gap.question)
        rows = await self.store.match_findings(
            self.kb_id, emb, self.cfg.search.default_limit, self.cfg.search.min_similarity,
        )
        bands = band_findings(rows, self.cfg.tiers)
        cov = assess_coverage(bands, self.cfg.tiers)

        # Rich-skip budget gate — DO NOT short-circuit a 'sharpen' reopen (the
        # question changed; old findings' band is stale).
        if cov == "rich" and gap.reason != "sharpen":
            complete_gap(self.store, gap.id, gap.finding_ids or [],
                         coverage=cov, band1_hits=len(bands[1]), status="verified")
            await self._emit("coverage", {
                "gap_id": gap.id, "coverage": cov, "band1_hits": len(bands[1]),
                "overall": cov,
            })
            await self._emit("gap_filled", {
                "gap_id": gap.id, "coverage": cov,
                "finding_ids": list(gap.finding_ids or []), "status": "verified",
            })
            return True

        # Research: create the exploration ROW first (run_exploration needs a real
        # id AND project_id, both required, no defaults).
        exp_id = self.store.create_exploration(self.org_id, self.kb_id, gap.question)
        findings = await run_exploration(
            gap.question,
            exploration_id=exp_id,
            project_id=self.project_id,
            kb_id=self.kb_id,
            cfg=self.cfg.exploration,
            lens="explore",
        )

        # Embed + insert — the engine returns UNEMBEDDED Findings whose content is
        # a dict. Render each to a markdown body, embed bodies in ONE batch, build
        # rows with the EXACT insert_findings key set.
        ids: list[str] = []
        metas: list[dict] = []  # parallel to ids: title/category/confidence for SSE
        if findings:
            rows_ins, bodies = [], []
            for f in findings:
                body = _render_content(f.content)
                rows_ins.append({
                    "org_id": self.org_id,
                    "kb_id": self.kb_id,
                    "title": f.title,
                    "content": body,
                    "category": f.category,
                    "confidence": float(f.confidence) if f.confidence is not None else None,
                    "tags": list(f.tags or []),
                    "provenance": _normalize_provenance(f.provenance),
                })
                bodies.append(body)
                metas.append({"title": f.title, "category": f.category,
                               "confidence": f.confidence})
            embeddings = await embed_batch(bodies)
            for row, e in zip(rows_ins, embeddings):
                row["embedding"] = e
            ids = await self.store.insert_findings(rows_ins)

        self.store.update_exploration(
            exp_id, status="completed", completed_at=_now_iso(), finding_ids=ids
        )

        # SSE: synthesize a finding node + answers-edge per persisted finding (KG OFF).
        for fid, meta in zip(ids, metas):
            await self._emit("finding_merged", {
                "finding_id": fid, "gap_id": gap.id, "title": meta["title"],
                "contributor": self.researcher_id,
            })
            await self._emit("node_added", {
                "id": fid, "type": "finding", "label": meta["title"],
                "properties": {"category": meta["category"], "confidence": meta["confidence"]},
                "grounded_in": [fid], "created_at": _now_iso(),
                "contributor": self.researcher_id, "role": "researcher",
            })
            await self._emit("edge_added", {
                "id": f"{fid}->{gap.id}", "source": fid, "target": gap.id,
                "relation": "answers", "properties": {}, "grounded_in": [fid],
                "created_at": _now_iso(),
            })

        # Recompute coverage AFTER the new findings land.
        emb2 = await embed_text(gap.question)
        rows2 = await self.store.match_findings(
            self.kb_id, emb2, self.cfg.search.default_limit, self.cfg.search.min_similarity)
        bands2 = band_findings(rows2, self.cfg.tiers)
        cov2 = assess_coverage(bands2, self.cfg.tiers)
        complete_gap(self.store, gap.id, ids, coverage=cov2,
                     band1_hits=len(bands2[1]), status="verified")
        await self._emit("coverage", {
            "gap_id": gap.id, "coverage": cov2, "band1_hits": len(bands2[1]),
            "overall": cov2,
        })
        await self._emit("gap_filled", {
            "gap_id": gap.id, "coverage": cov2, "finding_ids": list(ids),
            "status": "verified",
        })
        return True


# --- Critic ------------------------------------------------------------------


class Critic:
    """qwen-max — re-band each verified gap; close, reopen (sharpen/insufficient),
    or mark dead at the attempts cap. Child-gap spawns share a global budget."""

    def __init__(
        self,
        store,
        *,
        kb_id: str,
        cfg,
        max_attempts: int = 2,
        spawn_budget: int,
        on_event: Callable[[str, dict], Awaitable[None]] | None = None,
    ) -> None:
        self.store = store
        self.kb_id = kb_id
        self.cfg = cfg
        self.max_attempts = max_attempts
        self.spawn_budget = spawn_budget
        self.on_event = on_event

    async def _emit(self, name: str, data: dict) -> None:
        if self.on_event:
            await self.on_event(name, data)

    async def review(self) -> int:
        gaps = list_gaps(self.store, self.kb_id, status="verified")
        for gap in gaps:
            emb = await embed_text(gap.question)
            rows = await self.store.match_findings(
                self.kb_id, emb, self.cfg.search.default_limit, self.cfg.search.min_similarity)
            bands = band_findings(rows, self.cfg.tiers)
            cov = assess_coverage(bands, self.cfg.tiers)

            if cov == "rich":
                complete_gap(self.store, gap.id, gap.finding_ids, coverage=cov,
                             band1_hits=len(bands[1]), status="done")
                await self._emit("gap_filled", {
                    "gap_id": gap.id, "coverage": cov,
                    "finding_ids": list(gap.finding_ids or []), "status": "done",
                })
                continue
            if gap.attempts >= self.max_attempts:
                complete_gap(self.store, gap.id, gap.finding_ids, coverage=cov,
                             band1_hits=len(bands[1]), status="dead")
                continue

            # One Qwen call to pick the reopen reason + optional sharper question.
            verdict = await structured_completion(
                model=self.cfg.society.critic_model,
                response_format=_CriticOut,
                system=_CRITIC_PROMPT,
                user=_critic_user(gap, rows),
                temperature=self.cfg.society.temperature,
                use_json_schema=False,
            )
            reason = "sharpen" if verdict.reason == "sharpen" else "insufficient"
            new_q = verdict.question if reason == "sharpen" else None
            reopen_gap(self.store, gap.id, coverage=cov, reason=reason, question=new_q)
            # On reopen the gap returns to 'open' with its (possibly sharpened) question.
            await self._emit("gap_opened", {
                "gap_id": gap.id, "question": new_q or gap.question,
                "parent_id": gap.parent_id,
            })
            # Optional child gap on sharpen, bounded by the global spawn budget.
            if reason == "sharpen" and new_q and self.spawn_budget > 0:
                child_ids = create_gaps(self.store, self.kb_id, gap.project_id, [new_q])
                self.spawn_budget -= 1
                for cid in child_ids:
                    await self._emit("gap_opened", {
                        "gap_id": cid, "question": new_q, "parent_id": gap.id,
                    })
        return len(gaps)


def _critic_user(gap: Gap, rows: list[dict]) -> str:
    snippets = "\n".join(
        f"- {r.get('title', '')}: {str(r.get('content', ''))[:200]}" for r in rows[:8]
    )
    return f"Sub-question: {gap.question}\n\nFindings:\n{snippets or '(none)'}"


# --- Synthesizer -------------------------------------------------------------


class Synthesizer:
    """qwen-max — once no open/claimed/verified gaps remain, write a cited report.
    Caps input to top-K findings per done gap; 429 backoff + partial fallback."""

    def __init__(
        self,
        store,
        *,
        kb_id: str,
        cfg,
        on_event: Callable[[str, dict], Awaitable[None]] | None = None,
    ) -> None:
        self.store = store
        self.kb_id = kb_id
        self.cfg = cfg
        self.on_event = on_event

    async def _emit(self, name: str, data: dict) -> None:
        if self.on_event:
            await self.on_event(name, data)

    async def run(self, topic: str) -> tuple[str, list[str]]:
        done = list_gaps(self.store, self.kb_id, status="done")
        top_k = self.cfg.society.synthesis_top_k_per_gap
        blocks: list[str] = []
        for gap in done:
            picked = (gap.finding_ids or [])[:top_k]
            for fid in picked:
                try:
                    f = self.store.get_finding(self.kb_id, fid)
                except Exception:  # noqa: BLE001 — skip a missing finding, never fail synthesis
                    continue
                blocks.append(
                    f"(finding_id: {fid}) {f.get('title', '')}: "
                    f"{str(f.get('content', ''))[:600]}"
                )
        dead = [g.question for g in list_gaps(self.store, self.kb_id, status="dead")]
        user = f"Root topic: {topic}\n\nFindings:\n" + ("\n\n".join(blocks) or "(none)")

        for attempt in range(3):
            try:
                out = await structured_completion(
                    model=self.cfg.society.synthesizer_model,
                    response_format=_SynthOut,
                    system=_SYNTH_PROMPT,
                    user=user,
                    temperature=self.cfg.society.temperature,
                    use_json_schema=False,
                    max_tokens=4096,
                )
                unanswered = list(out.unanswered) + dead
                await self._emit("report", {"report": out.report, "unanswered": unanswered})
                return out.report, unanswered
            except Exception as exc:  # noqa: BLE001 — 429/backoff; partial fallback on last try
                if "429" in str(exc) and attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                if attempt < 2:
                    await asyncio.sleep(1)
                    continue
                partial = "## Partial report (synthesis unavailable)\n\n" + (
                    "\n".join(f"- {b}" for b in blocks[:20]) or "(no findings)"
                )
                await self._emit("report", {"report": partial, "unanswered": dead})
                return partial, dead
        partial = "## Partial report\n\n" + ("\n".join(f"- {b}" for b in blocks[:20]) or "(none)")
        await self._emit("report", {"report": partial, "unanswered": dead})
        return partial, dead
