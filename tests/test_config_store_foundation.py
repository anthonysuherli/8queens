import os
import sqlite3
import tempfile

from qwen8.core.config import SocietyConfig, _ENV_PREFIX, assert_qwen8_runtime, get_config
from qwen8.store.sqlite import SQLiteStore


def test_env_prefix_renamed():
    assert _ENV_PREFIX == "QWEN8_"


def test_society_config_defaults():
    cfg = get_config().society
    assert isinstance(cfg, SocietyConfig)
    assert cfg.n_researchers == 2 and cfg.max_rounds == 3 and cfg.max_attempts == 1
    assert cfg.spawn_budget == 4 and cfg.max_llm_calls_per_run == 120


def test_qwen_model_defaults_have_no_slash():
    cfg = get_config()
    assert cfg.embedding.model == "text-embedding-v4"
    assert "/" not in cfg.exploration.planner_model


def test_gaps_table_in_schema():
    with tempfile.TemporaryDirectory() as d:
        store = SQLiteStore(os.path.join(d, "t.db"))
        cols = {r[1] for r in store._conn.execute("PRAGMA table_info(gaps)").fetchall()}
        assert {"id", "kb_id", "project_id", "question", "status", "coverage",
                "band1_hits", "attempts", "finding_ids"} <= cols
        store.close()


def test_startup_assertions_pass(monkeypatch, tmp_path):
    # db_path must contain ".qwen8" to satisfy assert_qwen8_runtime's scope check.
    qwen8_dir = tmp_path / ".qwen8"
    qwen8_dir.mkdir()
    monkeypatch.setenv("QWEN8_DB_PATH", str(qwen8_dir / "qwen8.db"))
    get_config.cache_clear()
    assert_qwen8_runtime()  # must not raise
