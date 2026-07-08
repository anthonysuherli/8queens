"""The container DB path must satisfy the api.main `.queens8` startup assertion.

Regression guard: `/data/queens8.db` (no leading dot) crash-loops the container
because `_assert_startup_invariants` requires ``".queens8" in db_path``. Both the
Dockerfile default and deploy/run.sh must ship a path that passes.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _db_path_from(text: str) -> str:
    m = re.search(r"QUEENS8_DB_PATH=(\S+)", text)
    assert m, "QUEENS8_DB_PATH not found"
    return m.group(1)


def test_dockerfile_db_path_passes_startup_assertion():
    db_path = _db_path_from((ROOT / "Dockerfile").read_text())
    assert ".queens8" in db_path, f"Dockerfile QUEENS8_DB_PATH would crash boot: {db_path!r}"
    # Parent must be an existing container dir (VOLUME /data) — no dir is created.
    assert Path(db_path).parent.name == "data", f"parent not the /data volume: {db_path!r}"


def test_run_sh_db_path_passes_startup_assertion():
    db_path = _db_path_from((ROOT / "deploy" / "run.sh").read_text())
    assert ".queens8" in db_path, f"run.sh QUEENS8_DB_PATH would crash boot: {db_path!r}"
