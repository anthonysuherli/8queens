"""Runtime configuration.

Two layers, kept deliberately separate:

* ``Settings`` — *secrets and environment-bound infra* (API keys, optional
  Supabase URLs/JWT secret, CORS). Read from the process environment / ``.env``
  via pydantic-settings. These never belong in a checked-in file. In the
  open-core build, all cloud (Supabase) and LLM-provider keys are *optional*: the
  engine boots fully local with none of them set.

* ``AppConfig`` — *tunable knobs* (model names, temperatures, search limits,
  similarity thresholds, prompts). Loaded from a human-editable YAML file so
  they can be changed without touching code or redeploying.

``AppConfig`` precedence, lowest to highest:

    built-in defaults  <  config.yaml  <  environment variables

Environment overrides use the ``QUEENS8_<SECTION>__<FIELD>`` form, e.g.
``QUEENS8_AGENT__TEMPERATURE=0.4`` or ``QUEENS8_SEARCH__MIN_SIMILARITY=0.2``.

The YAML file location defaults to the repo-root ``config.yaml`` and can be
pointed elsewhere with the ``QUEENS8_CONFIG_FILE`` environment variable.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


# =============================================================================
# Secrets / environment-bound settings
# =============================================================================


class Settings(BaseSettings):
    """Top-level secrets; values are read from process env or `.env`.

    Open-core build: every cloud and LLM-provider credential is optional so the
    engine boots local-first with nothing configured. The store seam selects the
    local SQLite tier when the Supabase creds are absent.
    """

    # Resolve `.env` module-relative (repo-root `.env`) so it loads regardless of
    # the launch CWD — the MCP server may be spawned from anywhere.
    # Mirrors `_config_path()`'s absolute resolution for config.yaml.
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore"
    )

    # Backend selection (the store seam). ``QUEENS8_BACKEND`` forces "local" or
    # "cloud"; ``QUEENS8_DB_PATH`` points the local SQLite store at a custom file.
    delapan_backend: str | None = Field(default=None, alias="QUEENS8_BACKEND")
    delapan_db_path: str | None = Field(default=None, alias="QUEENS8_DB_PATH")

    # Supabase (optional — the cloud tier; absent → local SQLite tier)
    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_anon_key: str | None = Field(default=None, alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = Field(default=None, alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwt_secret: str | None = Field(default=None, alias="SUPABASE_JWT_SECRET")
    database_url: str | None = Field(default=None, alias="DATABASE_URL")

    # LLM provider keys (optional)
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    dashscope_api_key: str | None = Field(default=None, alias="DASHSCOPE_API_KEY")

    # Vercel AI Gateway — routes the exploration pipeline's LLM calls (optional).
    ai_gateway_api_key: str | None = Field(default=None, alias="AI_GATEWAY_API_KEY")
    ai_gateway_base_url: str = Field(
        default="https://ai-gateway.vercel.sh/v1", alias="AI_GATEWAY_BASE_URL"
    )

    # Exploration tooling — web search/extract.
    tavily_api_key: str | None = Field(default=None, alias="TAVILY_API_KEY")

    # API key minting
    api_key_prefix_live: str = "dvg_live_"
    api_key_prefix_test: str = "dvg_test_"

    # MCP authoring. The in-process MCP logs this user into GoTrue to mint a real
    # JWT, so RLS stays authoritative.
    mcp_user_email: str = Field(default="dev@queens8.local", alias="QUEENS8_MCP_USER_EMAIL")
    mcp_user_password: str = Field(default="dev-password-123", alias="QUEENS8_MCP_USER_PASSWORD")

    # Society write-gate shared secret. When set, POST /society/start requires
    # the header X-Society-Secret == this value; absent → write routes disabled.
    society_secret: str | None = Field(default=None, alias="QUEENS8_SOCIETY_SECRET")

    # CORS / hosts. `NoDecode` + the validator below accept EITHER a JSON array
    # or a plain comma-separated string (the common convention for this env var),
    # rather than pydantic-settings' default JSON-only decode of list fields.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        alias="QUEENS8_CORS_ORIGINS",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> object:
        """Accept a JSON array string, a comma-separated string, or a list."""
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):
                import json

                return json.loads(s)
            return [o.strip() for o in s.split(",") if o.strip()]
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


# =============================================================================
# Tunable application config (YAML-backed)
# =============================================================================

DEFAULT_SYSTEM_PROMPT = """\
You are 8queens — an agent that helps the user grow a knowledge base.

You have a set of tools that operate against the user's active KB. When the
user expresses intent that maps to a tool, call it. Otherwise reply
conversationally.

When a tool runs, narrate briefly what happened (don't restate the full
result; the UI shows tool cards inline).

Your messages already include a <preamble> of current KB context (a synopsis
plus query-relevant findings) and a coverage verdict; consult it before calling
explore.

Available tools and when to use them:
  - explore(query, mode): research/recall the KB. mode=auto (KB first, web if
    thin), recall (KB-only), research (force web). Findings persist to the KB.
  - ingest_file(upload_id): process an uploaded file (PDF / MD / TXT)
  - kg_view(focus?): open the knowledge graph viewer
  - deploy_kb(): publish the KB as a context API, mint an API key

Be concise. Use markdown sparingly.
"""

DEFAULT_TOOL_DESCRIPTIONS: dict[str, str] = {
    "explore": (
        "Unified knowledge tool. mode=auto: search the KB first and only research "
        "the web if coverage is thin; recall: KB-only semantic search (no web); "
        "research: force the full web research pipeline. depth controls breadth. "
        "New findings persist to the active KB. Use whenever the user wants to look "
        "something up, learn, or research a topic."
    ),
    "ingest_file": (
        "Process an uploaded file (PDF / MD / TXT) — extract text, chunk into "
        "findings, embed, and persist to the knowledge base."
    ),
    "kg_view": "Open the knowledge graph viewer. Optionally focus on a concept.",
    "deploy_kb": (
        "Publish the active KB as a context API. Flips published=true, mints a new "
        "API key, and returns the key (shown to the user once)."
    ),
}


class AgentConfig(BaseModel):
    """Chat agent + ReAct loop knobs."""

    model: str = "qwen-plus"
    fast_model: str = "qwen-flash"
    temperature: float = 0.2
    max_tokens: int = 4096
    # Extended-thinking budget (tokens). 0 disables. When > 0, temperature is
    # forced to 1.0 at client build time, and the value MUST be < max_tokens.
    thinking_budget: int = 0
    max_tool_iterations: int = 4  # ReAct loop cap
    max_messages_per_turn: int = 40


class SearchConfig(BaseModel):
    """`explore` recall + shared retrieval knobs."""

    default_limit: int = 10
    max_limit: int = 50
    min_similarity: float = 0.0
    max_finding_chunks: int = 25  # shared hard cap on findings injected into a preamble


class TiersConfig(BaseModel):
    """Similarity-band thresholds + always-on preamble budget."""

    band1_min: float = 0.55  # strong-match floor (always injected)
    band2_min: float = 0.40  # moderate
    band3_min: float = 0.25  # weak / peripheral floor
    rich_hit_count: int = 3  # band-1 hits => coverage="rich"
    preamble_char_budget: int = 7000  # max chars of the assembled preamble


class SynopsisConfig(BaseModel):
    """Per-KB synopsis spine: build model + incremental regen triggers."""

    model: str = "qwen-flash"  # fast model (fills the unused fast_model slot)
    rebuild_delta: int = 15  # findings added since build => regen
    rebuild_max_age_hours: int = 168
    max_entries: int = 6


class UserProfileConfig(BaseModel):
    """Cross-KB user-profile super-entity: the always-on 'who is this user' layer.

    Off by default (opt-in / dark-launch). When enabled, a stable profile preamble
    (synopsis of the reserved __user__/profile KB + the user's most-relevant KBs)
    is injected into every chat message; relevance is the user_kb_relevance table.
    """

    enabled: bool = False  # master switch — no behavior change until turned on
    inject_in_chat: bool = True  # inject into the /agent ReAct system prompt
    inject_in_mcp: bool = True  # inject via the Claude Code UserPromptSubmit hook
    preamble_char_budget: int = 2000  # cap on the assembled <user-profile> block
    relevance_top_n: int = 5  # how many relevant KBs to name in the preamble
    relevance_sim_weight: float = 0.6  # weight of profile↔KB topic similarity
    relevance_activity_weight: float = 0.4  # weight of recent KB access activity
    activity_window_days: int = 30  # access_events lookback for the activity signal


class ExplorationConfig(BaseModel):
    """`explore` tool + research pipeline knobs.

    Models are bare Qwen model names (no provider/ prefix) routed through
    DashScope/Qwen API.
    """

    # Models — bare Qwen names (no provider/ prefix)
    planner_model: str = "qwen-flash"
    extraction_model: str = "qwen-plus"
    extraction_fallback_model: str = "qwen-flash"
    temperature: float = 0.0
    # Reasoning level for planning + extraction; None = provider default.
    reasoning_effort: str | None = None  # null — thinking mode breaks json_object

    # Web-search backend selection:
    #   auto   — Tavily if TAVILY_API_KEY is set, else hand the search to the
    #            calling agent (only when the host can fulfill it)
    #   agent  — always hand off to the calling agent (ignore Tavily)
    #   tavily — always Tavily; error if the key is missing
    search_mode: str = "tavily"

    @field_validator("search_mode")
    @classmethod
    def _check_search_mode(cls, v: str) -> str:
        if v not in {"auto", "agent", "tavily"}:
            raise ValueError(f"search_mode must be auto|agent|tavily, got {v!r}")
        return v

    # Search (Tavily)
    search_depth: str = "advanced"  # "basic" | "advanced"
    max_results_per_query: int = 20
    fallback_result_threshold: int = 5  # skip priority-2 queries once P1 yields >= this
    expansion_result_threshold: int = 3  # skip priority-3 queries once results >= this

    # Search fan-out: queries within one priority tier run concurrently.
    max_concurrent_searches: int = 6

    # Crawl / extract (Tavily extract)
    max_pages: int = 15  # cap on URLs we fetch content for
    max_concurrent_extractions: int = 10
    max_content_per_page: int = 100_000  # char cap fed to the extractor LLM

    # Evaluation (reflection / evaluator-optimizer pass over extracted findings):
    enable_evaluation: bool = True
    evaluation_model: str = "qwen-plus"

    # Merge
    fuzzy_match_threshold: float = 0.80
    min_confidence_threshold: float = 0.2

    # Persistence cap
    default_max_findings: int = 12
    max_findings: int = 40


class NarrationConfig(BaseModel):
    """Per-phase narration: a cheap gateway line per pipeline phase (best-effort)."""

    enabled: bool = True
    model: str = "qwen-flash"  # cheap, fast
    temperature: float = 0.3
    max_tokens: int = 60


class OKFConfig(BaseModel):
    """OKF concept-doc synthesis: one pass that rewrites an entity's grounded
    findings into a readable prose document."""

    model: str = "qwen-plus"
    temperature: float = 0.3
    max_tokens: int = 900


class DeepenConfig(BaseModel):
    """Autonomous gap-following deep-research (`deepen`) knobs.

    Hybrid loop oracle: an LLM critic steers next facets; depth_cap + a
    coverage floor terminate.
    """

    # Loop control
    depth_cap: int = 3  # hard max rounds — the runaway backstop
    min_rounds: int = 1  # never stop before this many rounds
    coverage_target: float = 0.8  # critic coverage at/above which we may stop
    facets_per_round: int = 4  # cap on next-round facets the critic proposes
    max_concurrent_facets: int = 4  # outer fan-out semaphore (× per-explore cap)

    # Models — bare Qwen names
    decompose_model: str = "qwen-plus"
    critic_model: str = "qwen-plus"
    temperature: float = 0.0
    reasoning_effort: str | None = None  # null — thinking mode breaks json_object

    @model_validator(mode="after")
    def _clamp_min_rounds(self) -> DeepenConfig:
        # A min_rounds above the hard cap could never be honored — clamp so the
        # floor is always reachable (depth_cap is the unconditional bound).
        if self.min_rounds > self.depth_cap:
            self.min_rounds = self.depth_cap
        return self


class EmbeddingConfig(BaseModel):
    """Embedding client + chunking knobs."""

    model: str = "text-embedding-v4"
    dim: int = 1536
    input_char_cap: int = 8192  # per-string safety cap before embedding
    chunk_max_chars: int = 1800  # file-ingest chunker target size


class KnowledgeGraphConfig(BaseModel):
    """KG build (extract entities/relations from findings → kg_nodes/kg_edges).

    Models are bare Qwen names.
    """

    extraction_model: str = "qwen-max"
    extraction_fallback_model: str = "qwen-plus"
    temperature: float = 0.0
    reasoning_effort: str | None = None  # null — thinking mode breaks json_object

    max_findings: int = 120  # cap on findings fed to one extraction pass
    max_finding_chars: int = 1200  # per-finding content truncation in the prompt
    node_match_threshold: float = 0.86  # cosine sim above which an entity dedupes
    max_nodes: int = 400  # safety cap on nodes upserted per build
    max_edges: int = 1200  # safety cap on edges upserted per build


class ConceptsConfig(BaseModel):
    """Domain-concept (glossary) extraction knobs."""

    extract_model: str = "qwen-plus"
    max_findings_context: int = 60  # findings fed to the extraction pass
    max_finding_chars: int = 1200  # per-finding content truncation in the prompt
    max_terms: int = 40  # cap on concepts persisted per extract run


class PromptsConfig(BaseModel):
    """Agent system prompt + per-tool descriptions surfaced to the LLM."""

    system_prompt: str = DEFAULT_SYSTEM_PROMPT
    tool_descriptions: dict[str, str] = Field(
        default_factory=lambda: dict(DEFAULT_TOOL_DESCRIPTIONS)
    )


class SocietyConfig(BaseModel):
    """Multi-agent society (parallel researcher ensemble) knobs."""

    planner_model: str = "qwen-max"
    critic_model: str = "qwen-max"
    synthesizer_model: str = "qwen-max"     # qwen-long is opt-in for huge contexts only
    temperature: float = 0.2
    reasoning_effort: str | None = None      # null — thinking mode breaks json_object
    n_researchers: int = 2                   # DEMO default
    max_rounds: int = 3                      # DEMO default
    max_attempts: int = 1                    # DEMO default
    spawn_budget: int = 4                    # global child-gap spawn cap
    synthesis_top_k_per_gap: int = 8         # cap findings fed to the Synthesizer
    kg_extraction_enabled: bool = False      # OFF for demo (most qwen-max-hungry)
    max_llm_calls_per_run: int = 120         # per-run kill-switch (graceful stop)


class AppConfig(BaseModel):
    """Aggregate of all tunable sections."""

    agent: AgentConfig = Field(default_factory=AgentConfig)
    search: SearchConfig = Field(default_factory=SearchConfig)
    tiers: TiersConfig = Field(default_factory=TiersConfig)
    synopsis: SynopsisConfig = Field(default_factory=SynopsisConfig)
    user_profile: UserProfileConfig = Field(default_factory=UserProfileConfig)
    exploration: ExplorationConfig = Field(default_factory=ExplorationConfig)
    narration: NarrationConfig = Field(default_factory=NarrationConfig)
    okf: OKFConfig = Field(default_factory=OKFConfig)
    deepen: DeepenConfig = Field(default_factory=DeepenConfig)
    embedding: EmbeddingConfig = Field(default_factory=EmbeddingConfig)
    knowledge_graph: KnowledgeGraphConfig = Field(default_factory=KnowledgeGraphConfig)
    concepts: ConceptsConfig = Field(default_factory=ConceptsConfig)
    prompts: PromptsConfig = Field(default_factory=PromptsConfig)
    society: SocietyConfig = Field(default_factory=SocietyConfig)


# -----------------------------------------------------------------------------
# Loader
# -----------------------------------------------------------------------------

_ENV_PREFIX = "QUEENS8_"
_NESTED_DELIM = "__"


def _config_path() -> Path:
    override = os.getenv("QUEENS8_CONFIG_FILE")
    if override:
        return Path(override)
    # config.py lives at <root>/queens8/core/config.py → <root>/config.yaml
    return Path(__file__).resolve().parents[2] / "config.yaml"


def _load_file(path: Path) -> dict:
    if not path.is_file():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    if not isinstance(data, dict):
        raise ValueError(f"config file {path} must contain a YAML mapping at the top level")
    return data


def _env_overrides() -> dict:
    """Collect `QUEENS8_<SECTION>__<FIELD>` env vars into a nested dict.

    Values stay as strings; Pydantic coerces them when validating AppConfig.
    """
    out: dict[str, dict] = {}
    for key, value in os.environ.items():
        if not key.startswith(_ENV_PREFIX) or _NESTED_DELIM not in key:
            continue
        section, _, field = key[len(_ENV_PREFIX):].partition(_NESTED_DELIM)
        if not section or not field:
            continue
        out.setdefault(section.lower(), {})[field.lower()] = value
    return out


def _deep_merge(base: dict, override: dict) -> dict:
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v
    return base


@lru_cache(maxsize=1)
def get_config() -> AppConfig:
    """Load the layered app config: defaults < config.yaml < env vars.

    Cached. Call ``get_config.cache_clear()`` after mutating the file or env
    (tests do this).
    """
    data: dict = {}
    _deep_merge(data, _load_file(_config_path()))
    _deep_merge(data, _env_overrides())
    return AppConfig.model_validate(data)


# -----------------------------------------------------------------------------
# Startup assertions
# -----------------------------------------------------------------------------


def assert_queens8_runtime() -> None:
    """Fail fast if the running process would read delapan's config/db or a non-Qwen model."""
    from queens8.store import _default_db_path as _ddp  # local import avoids cycle
    assert _ENV_PREFIX == "QUEENS8_", f"env prefix not renamed: {_ENV_PREFIX}"
    db_path = _ddp()
    assert ".queens8" in db_path, f"db_path not queens8-scoped: {db_path}"
    cfg = get_config()
    model_fields = [
        cfg.exploration.planner_model, cfg.exploration.extraction_model,
        cfg.exploration.extraction_fallback_model, cfg.exploration.evaluation_model,
        cfg.deepen.decompose_model, cfg.deepen.critic_model,
        cfg.narration.model, cfg.knowledge_graph.extraction_model,
        cfg.knowledge_graph.extraction_fallback_model, cfg.concepts.extract_model,
        cfg.synopsis.model, cfg.okf.model, cfg.embedding.model,
        cfg.agent.model, cfg.agent.fast_model,
        cfg.society.planner_model, cfg.society.critic_model, cfg.society.synthesizer_model,
    ]
    for name in model_fields:
        assert "/" not in name, f"non-Qwen gateway slug leaked: {name!r}"
