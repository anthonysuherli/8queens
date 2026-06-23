"""External-service clients for the engine.

Open-core build: only the non-cloud clients live here.

  * ``ai_gateway`` — Vercel AI Gateway (OpenAI-compatible) structured/text
    completions for the exploration + KG pipeline.
  * ``embeddings`` — OpenAI embedding client.
  * ``tavily`` — web search + page extraction.

The Supabase and PostHog clients are intentionally absent — persistence goes
through the ``qwen8.store`` seam (local SQLite by default), and analytics are
not part of the open-core surface.
"""

from __future__ import annotations
