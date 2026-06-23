# qwen8 — Agent Society with a Shared Brain

Open-domain deep-research **agent society**: role-specialized Qwen agents
(Planner / Researcher×N / Critic / Synthesizer) collaborate not by passing
messages but by reading and writing a single **shared brain** — a deduplicated,
embedded findings store plus an incremental knowledge graph. The brain's own
coverage signal (`rich` / `sparse` / `gap`) is the coordination medium: a
blackboard. Researchers atomically claim the worst-covered open gap, run a
`plan→search→crawl→extract→merge` pipeline over Tavily, and write findings back;
a Critic re-bands each gap; a Synthesizer writes a cited report when coverage is
`rich`. Runs as a containerized FastAPI service on Alibaba Cloud ECS (Singapore),
consuming Qwen exclusively through DashScope's OpenAI-compatible endpoint.

**Track:** Agent Society. **License:** AGPL-3.0.

## Architecture

![qwen8 architecture](docs/architecture.png)

## Proof of Alibaba Cloud

Qwen is consumed via DashScope (Model Studio), Alibaba's managed model service:

- [`qwen8/core/clients/ai_gateway.py`](qwen8/core/clients/ai_gateway.py) — the single
  LLM seam (`structured_completion` / `text_completion`) over DashScope's
  OpenAI-compatible endpoint.
- [`qwen8/core/config.py`](qwen8/core/config.py) — DashScope base URL + Qwen
  model defaults (`qwen-max`/`qwen-plus`/`qwen-flash`/`qwen-long`,
  `text-embedding-v4@1536`).
- [`Dockerfile`](Dockerfile) + [`deploy/run.sh`](deploy/run.sh) — build for
  `linux/amd64`, push to ACR, run on ECS (Singapore, ap-southeast-1).

## Run locally

```bash
pip install -e .[local]
cp .env.example .env   # fill AI_GATEWAY_API_KEY (DashScope key), AI_GATEWAY_BASE_URL,
                       # TAVILY_API_KEY, QWEN8_DB_PATH, QWEN8_SOCIETY_SECRET
uvicorn qwen8.api.main:app --host 0.0.0.0 --port 8001
```

Then start a run (the write route is gated by `X-Society-Secret`):

```bash
curl -H 'X-Society-Secret: <secret>' \
  http://127.0.0.1:8001/api/projects/demo/kbs/demo/society/start \
  -d '{"topic":"What is the stablecoin regulatory landscape in 2026?"}'
```

Stream the society live (named SSE frames): open
`GET /api/projects/demo/kbs/demo/society/stream?run_id=<run_id>` or point the
sigma.js dashboard at this host.

## Frontend (sigma.js dashboard)

```bash
cd frontend && npm install && npm run dev
```

Point the dashboard at `http://localhost:8001` (or the ECS public IP) to visualise
the knowledge graph and findings as the society runs.

## Deploy to Alibaba Cloud ECS

```bash
ACR=<registry>/qwen8 TAG=demo ECS_IP=<ip> ECS_USER=root \
ACR_USER=... ACR_PASSWORD=... \
DASHSCOPE_API_KEY=... TAVILY_API_KEY=... QWEN8_SOCIETY_SECRET=... \
bash deploy/run.sh all
curl http://<ECS_PUBLIC_IP>/health   # {"status":"ok","backend":"sqlite"}
```

## Tests

```bash
pytest   # 59 tests passing
```

## License

AGPL-3.0 — see [`LICENSE`](LICENSE).
