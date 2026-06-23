"""Gap state-machine on the shared SQLite brain — the blackboard.

The `gaps` table is created by `_SCHEMA` in qwen8/store/sqlite.py; this module
only reads/writes it via `store._conn`. The atomic claim is a single
`UPDATE … WHERE id=(SELECT … LIMIT 1)` on the one long-lived connection,
arbitrated by `cursor.rowcount` — no WAL, no `await` between read-modify and
commit. Status lifecycle:
    open → claimed → verified → [Critic] done | open (reopen) | dead
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Literal

GapStatus = Literal["open", "claimed", "verified", "done", "dead"]

# Coverage scheduling rank: NULL and 'gap' tie at 0 so unexplored questions are
# picked up first; an unhandled NULL would sort last and starve new work.
_CLAIM_SQL = """
UPDATE gaps SET status='claimed', owner=?, updated_at=?
WHERE id = (
  SELECT id FROM gaps
  WHERE kb_id=? AND status='open'
  ORDER BY
    CASE coverage WHEN 'gap' THEN 0 WHEN 'sparse' THEN 1 WHEN 'rich' THEN 2 ELSE 0 END,
    attempts ASC, created_at ASC
  LIMIT 1
);
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Gap:
    """One blackboard gap row."""

    __slots__ = (
        "id",
        "kb_id",
        "project_id",
        "parent_id",
        "question",
        "reason",
        "status",
        "owner",
        "coverage",
        "band1_hits",
        "attempts",
        "finding_ids",
        "created_at",
        "updated_at",
    )

    def __init__(
        self,
        *,
        id: str,
        kb_id: str,
        project_id: str,
        parent_id: str | None,
        question: str,
        reason: str | None,
        status: GapStatus,
        owner: str | None,
        coverage: str | None,
        band1_hits: int,
        attempts: int,
        finding_ids: list[str],
        created_at: str,
        updated_at: str,
    ) -> None:
        self.id = id
        self.kb_id = kb_id
        self.project_id = project_id
        self.parent_id = parent_id
        self.question = question
        self.reason = reason
        self.status = status
        self.owner = owner
        self.coverage = coverage
        self.band1_hits = band1_hits
        self.attempts = attempts
        self.finding_ids = finding_ids
        self.created_at = created_at
        self.updated_at = updated_at


def _row_to_gap(r) -> Gap:
    fids = r["finding_ids"]
    return Gap(
        id=r["id"],
        kb_id=r["kb_id"],
        project_id=r["project_id"],
        parent_id=r["parent_id"],
        question=r["question"],
        reason=r["reason"],
        status=r["status"],
        owner=r["owner"],
        coverage=r["coverage"],
        band1_hits=int(r["band1_hits"]),
        attempts=int(r["attempts"]),
        finding_ids=json.loads(fids) if fids else [],
        created_at=r["created_at"],
        updated_at=r["updated_at"],
    )


def create_gaps(store, kb_id: str, project_id: str, gaps: list[str]) -> list[str]:
    """Insert `open`, coverage=NULL gaps; return their ids. Each carries project_id."""
    now = _now_iso()
    ids: list[str] = []
    for question in gaps:
        gid = uuid.uuid4().hex
        ids.append(gid)
        store._conn.execute(
            """
            INSERT INTO gaps
              (id, kb_id, project_id, parent_id, question, reason, status, owner,
               coverage, band1_hits, attempts, finding_ids, created_at, updated_at)
            VALUES (?, ?, ?, NULL, ?, NULL, 'open', NULL, NULL, 0, 0, NULL, ?, ?);
            """,
            (gid, kb_id, project_id, question, now, now),
        )
    store._conn.commit()
    return ids


def claim_gap(store, kb_id: str, owner: str) -> Gap | None:
    """Atomically claim the worst-covered open gap. Returns the claimed Gap or None.

    Single `UPDATE … WHERE id=(SELECT … LIMIT 1)` + commit on the one connection;
    `cursor.rowcount` arbitrates the winner. NO `await` inside — sync throughout."""
    cur = store._conn.execute(_CLAIM_SQL, (owner, _now_iso(), kb_id))
    if cur.rowcount != 1:
        store._conn.commit()
        return None
    store._conn.commit()
    r = store._conn.execute(
        "SELECT * FROM gaps WHERE kb_id=? AND owner=? AND status='claimed' "
        "ORDER BY updated_at DESC LIMIT 1;",
        (kb_id, owner),
    ).fetchone()
    return _row_to_gap(r) if r is not None else None


def complete_gap(
    store,
    gap_id: str,
    finding_ids: list[str],
    *,
    coverage: str | None,
    band1_hits: int,
    status: GapStatus,
) -> None:
    """Record a researcher's result: stamp findings + coverage band + status."""
    store._conn.execute(
        "UPDATE gaps SET status=?, coverage=?, band1_hits=?, finding_ids=?, updated_at=? "
        "WHERE id=?;",
        (status, coverage, band1_hits, json.dumps(finding_ids), _now_iso(), gap_id),
    )
    store._conn.commit()


def reopen_gap(
    store,
    gap_id: str,
    *,
    coverage: str | None,
    reason: str,
    question: str | None = None,
    parent_id: str | None = None,
) -> None:
    """Critic reopen: back to `open`, attempts++, set reason; optionally a new question."""
    if question is not None:
        store._conn.execute(
            "UPDATE gaps SET status='open', coverage=?, reason=?, question=?, "
            "parent_id=COALESCE(?, parent_id), attempts=attempts+1, updated_at=? WHERE id=?;",
            (coverage, reason, question, parent_id, _now_iso(), gap_id),
        )
    else:
        store._conn.execute(
            "UPDATE gaps SET status='open', coverage=?, reason=?, "
            "parent_id=COALESCE(?, parent_id), attempts=attempts+1, updated_at=? WHERE id=?;",
            (coverage, reason, parent_id, _now_iso(), gap_id),
        )
    store._conn.commit()


def list_gaps(store, kb_id: str, status: str | None = None) -> list[Gap]:
    """All gaps for `kb_id`, optionally filtered to one status."""
    if status is None:
        rows = store._conn.execute(
            "SELECT * FROM gaps WHERE kb_id=? ORDER BY created_at;", (kb_id,)
        ).fetchall()
    else:
        rows = store._conn.execute(
            "SELECT * FROM gaps WHERE kb_id=? AND status=? ORDER BY created_at;",
            (kb_id, status),
        ).fetchall()
    return [_row_to_gap(r) for r in rows]
