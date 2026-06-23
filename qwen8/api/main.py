"""FastAPI app for the open-core engine — the loopback HTTP surface.

    uvicorn qwen8.api.main:app ──► GET  /health
                                    GET  /api/projects
                                    ...  /api/projects/{p}/kbs/{k}/graph[/...]   (KG read/write)
                                    ...  /api/projects/{p}/kbs/{k}/findings[...] (list/get/delete)
                                    GET  /api/projects/{p}/kbs/{k}/synopsis|resume
                                    POST /api/projects/{p}/kbs/{k}/explore       (SSE)

The local mirror of the MCP surface plus KG read/write routes for the
knowledge-graph control panel (a browser frontend on :5173 — hence the CORS
allowance). Binds loopback only; the cloud tier's full HTTP surface (/agent,
/v1/*, /internal/*) stays behind the ``[cloud]`` extra.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from qwen8.api.health import router as health_router
from qwen8.api.routes_explore import router as explore_router
from qwen8.api.routes_society import router as society_router
from qwen8.api.routes_findings import router as findings_router
from qwen8.api.routes_kg import router as kg_router
from qwen8.api.routes_projects import router as projects_router
from qwen8.core.config import _ENV_PREFIX, get_settings
from qwen8.store import get_store


def _assert_startup_invariants() -> None:
    """Fail fast + loud on a mis-wired process (Section 5.3 / 7.3 / criterion 10)."""
    assert _ENV_PREFIX == "QWEN8_", f"env prefix not renamed: {_ENV_PREFIX!r}"
    s = get_settings()
    assert s.tavily_api_key, "TAVILY_API_KEY is required (search_mode=tavily)"
    # Resolve the running store and prove it is the qwen8 brain, not delapan's.
    store = get_store(None, org_id="local")
    db_path = str(getattr(store, "db_path", ""))
    assert ".qwen8" in db_path, f"store db_path not the qwen8 brain: {db_path!r}"


_assert_startup_invariants()

# The KG control panel's dev origins, always allowed alongside CORS_ORIGINS.
_FRONTEND_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")

app = FastAPI(title="qwen8")
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted({*get_settings().cors_origins, *_FRONTEND_ORIGINS}),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(projects_router)
app.include_router(kg_router)
app.include_router(findings_router)
app.include_router(explore_router)
app.include_router(society_router)


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)


if __name__ == "__main__":
    main()
