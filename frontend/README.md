# delapan-fe

A knowledge-base control panel. `delapan-fe` renders a [delapan](https://github.com/anthonysuherli/delapan-be) knowledge base as an interactive force-directed graph — nodes are entities, edges are relations, and both are grounded in the findings the engine ingested from the web. You explore, edit, and audit the graph from a dark instrument-panel UI built on [sigma.js](https://www.sigmajs.org/).

> Frontend half of the delapan stack. The backend (graph store, RAG, web-explore pipeline, MCP server) lives in [delapan-be](https://github.com/anthonysuherli/delapan-be).

---

## What it does

- **Visualizes a KB as a graph** — entities and their relationships, force-laid-out with [ForceAtlas2](https://github.com/graphology/graphology-layout-forceatlas2), colored by type, sized by degree.
- **Edits the graph live** — create/rename/retype nodes, draw and relabel edges, bulk-set properties, delete with cascade — all with full undo/redo.
- **Grounds everything in evidence** — every node and edge carries `grounded_in` finding IDs; the inspector and finding drawer surface the source provenance (domain, query, content) behind each claim.
- **Travel mode** — a keyboard-driven exploration mode: stand on a node, see its neighbors numbered by screen position, hop with number keys, leave a breadcrumb trail.
- **Coverage probe** — ask a question and the engine returns a `rich` / `sparse` / `gap` verdict on how well the KB answers it, plus a synthesized preamble.
- **Web explore** — launch an SSE-streamed explore job (plan → search → crawl → extract → merge) and watch new findings land in the graph.
- **Works offline** — ships a built-in mock dataset; if the live backend is unreachable, the app auto-falls back to mock and flags it in the status bar.

---

## Quick start

```bash
# 1. install
npm install

# 2. configure (optional — defaults work against a local backend)
cp .env.example .env.local

# 3. run
npm run dev          # → http://localhost:5173
```

With no backend running, set `VITE_USE_MOCK=1` in `.env.local` (or just start the dev server — it auto-falls back to the mock dataset on the first failed request).

### Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server with HMR on port 5173 |
| `npm run build` | `tsc --noEmit` type-check, then production build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run test` | Run the [Vitest](https://vitest.dev/) suite (`src/**/*.test.ts`) |

---

## Configuration

Two environment variables, both read at build/dev time by Vite (`.env.example`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `VITE_API_BASE` | `http://127.0.0.1:8001` | Backend base URL. Set to `""` (empty) to go same-origin through the Vite dev proxy and avoid CORS entirely. |
| `VITE_USE_MOCK` | _(unset)_ | Set to `1` to force the built-in mock dataset. When unset, the app tries the live API and auto-falls back to mock if it's unreachable. |

**CORS vs. proxy.** By default the app talks straight to `VITE_API_BASE`, which requires the backend to allow CORS from the Vite origin. If you'd rather not deal with CORS, set `VITE_API_BASE=""` — requests then go to same-origin `/api/*` and the proxy in `vite.config.ts` forwards them to `http://127.0.0.1:8001`.

---

## How it connects to the backend

The app speaks a REST contract scoped by **project** and **KB** (`/api/projects/{project}/kbs/{kb}/…`):

| Endpoint | Purpose |
|----------|---------|
| `GET /projects` | list projects + their KBs |
| `GET …/graph` | nodes + edges for the KB |
| `GET …/graph/stats` | counts by type and relation |
| `GET …/graph/schema` | intent vs. emergent type schema |
| `POST/PATCH/DELETE …/graph/nodes` | node CRUD |
| `POST/DELETE …/graph/edges` | edge CRUD |
| `GET/DELETE …/findings/{id}` | finding detail / removal |
| `GET …/synopsis` | KB topics + gloss |
| `GET …/resume?query=…` | coverage probe (returns `rich`/`sparse`/`gap` + preamble) |
| `POST …/explore` | SSE stream of a web-explore job |

Every endpoint has a live implementation and a mock twin in `src/api/`, switched transparently by the client. See `src/api/client.ts` for the contract and `src/api/types.ts` for the wire types.

---

## Core concepts

- **Node** — an entity (`concept`, `technology`, `person`, `company`, `project`, or any emergent type). Carries a label, free-form `properties`, and `grounded_in` finding IDs.
- **Edge** — a directed, labeled relation between two nodes, also grounded in findings. The graph is `multi` + `directed`, so two nodes can have several distinct relations.
- **Finding** — an atomic piece of evidence (title, content, category, confidence, tags, provenance). Nodes and edges cite findings; deleting a finding leaves its citations dangling (shown as unavailable), it doesn't cascade.
- **Schema** — *intent* (user-declared types) vs. *emergent* (inferred from the data). Drives the type dropdowns.
- **Coverage** — a `rich`/`sparse`/`gap` verdict on whether the KB can answer a given query, surfaced by the coverage probe in the left rail.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `⌘Z` / `Ctrl+Z` | Undo |
| `⌘⇧Z` / `Ctrl+Y` | Redo |
| `T` | Toggle travel mode |
| `E` | Connect from the selected node |
| `Del` / `Backspace` | Delete selection |
| `/` | Focus graph search |
| **Travel mode** | |
| `1`–`9`, `0` | Hop to neighbor by number |
| `←` `↑` / `→` `↓` | Cycle the aimed neighbor |
| `Enter` | Hop to the aimed neighbor |
| `Esc` | Exit travel |

Hotkeys are suppressed while typing in an input, textarea, or select.

---

## Architecture

```
src/
├─ main.tsx            React root + global stylesheet imports
├─ App.tsx             Shell layout — boots the store, mounts every panel
├─ api/
│  ├─ client.ts        Typed HTTP client with transparent mock fallback
│  ├─ types.ts         Wire types (GraphNode, EdgeSpec, Finding, …)
│  └─ mock.ts          In-memory mock backend (the offline dataset)
├─ graph/
│  ├─ GraphCanvas.tsx  Sigma.js component — reducers, event routing, overlays
│  ├─ graphStore.ts    The graphology instance (multi, directed)
│  ├─ build.ts         GraphResponse → graphology (populate + lay out)
│  ├─ layout.ts        Deterministic seeding + ForceAtlas2
│  ├─ colors.ts        Type → color (5 base + stable fallback ring)
│  ├─ canvasDraw.ts    Custom node label / hover rendering
│  └─ sigmaRef.ts      Module-level handle to the live Sigma instance
├─ state/
│  ├─ store.ts         Zustand store — the single source of app state
│  ├─ mutations.ts     High-level actions (addNode, createEdge, …)
│  ├─ commands.ts      Invertible command builders + ID-alias map
│  ├─ undo.ts          UndoManager (undo/redo stacks)
│  ├─ derive.ts        Pure selectors over the graphology instance
│  ├─ useHotkeys.ts    Global keyboard handler
│  └─ undo.test.ts     Undo/redo unit tests
├─ travel/
│  ├─ neighbors.ts     Screen-angle neighbor ordering, hop-key labels
│  └─ TravelHud.tsx    Journey log (progress, breadcrumbs, hops)
├─ panels/
│  ├─ TopBar.tsx       Wordmark, graph search, action buttons
│  ├─ LeftRail.tsx     Scope, stats, schema, synopsis, coverage, explore
│  ├─ Inspector.tsx    Node/edge editor (single + bulk)
│  ├─ FindingDrawer.tsx  Finding detail + provenance
│  ├─ StatusBar.tsx    Connection state, last action, undo/redo
│  ├─ AddNodeModal.tsx Create-node form
│  └─ Toasts.tsx       Auto-dismissing notifications
└─ styles/             Design tokens + component CSS
```

**Data flow.** The Zustand store in `src/state/store.ts` is the single source of truth. Mutations apply optimistically to the graphology instance, call the API, and roll back on failure. Each mutation bumps a `graphVersion` counter that React panels subscribe to in order to re-derive. Sigma renders the graphology instance directly; its node/edge *reducers* read app state (selection, hover, travel) to style every frame. See [CLAUDE.md](CLAUDE.md) for the patterns in detail.

---

## Tech stack

- [React 18](https://react.dev/) + [TypeScript 5.7](https://www.typescriptlang.org/) (strict)
- [Vite 6](https://vitejs.dev/) — dev server, build, proxy
- [sigma.js 3](https://www.sigmajs.org/) + [graphology](https://graphology.github.io/) — WebGL graph rendering
- [graphology-layout-forceatlas2](https://github.com/graphology/graphology-layout-forceatlas2) — force-directed layout
- [Zustand 5](https://github.com/pmndrs/zustand) — state
- [Vitest 3](https://vitest.dev/) — tests

No CSS framework — the instrument-panel look is hand-rolled design tokens in `src/styles/tokens.css`.
