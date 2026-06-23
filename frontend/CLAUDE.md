# CLAUDE.md

Guidance for AI agents working in `delapan-fe`. Read this before editing.

## What this is

The frontend for [delapan](https://github.com/anthonysuherli/delapan-be), a knowledge-base engine. It renders a KB as an interactive sigma.js graph and lets the user edit it with full undo/redo. React 18 + TypeScript (strict) + Vite 6 + Zustand + sigma.js/graphology. No CSS framework. See [README.md](README.md) for the user-facing overview.

## Commands

```bash
npm run dev      # vite dev server, port 5173, HMR
npm run build    # tsc --noEmit  (type-check)  then  vite build → dist/
npm run test     # vitest run — src/**/*.test.ts
npm run preview  # serve the built dist/
```

There is no lint step and no formatter config — match the surrounding style. `npm run build` is the type-check gate; run it before claiming a change compiles. The build is strict (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`), so unused imports and bindings fail the build.

## Architecture in one paragraph

`src/state/store.ts` (Zustand) is the single source of truth. The graph itself lives in a module-level **graphology** instance (`src/graph/graphStore.ts`), not in React state. Mutations apply **optimistically** to graphology, call the API, and roll back on failure; each one bumps `graphVersion` in the store, which React panels subscribe to so they re-derive. **Sigma** renders the graphology instance directly — its node/edge *reducers* (`src/graph/GraphCanvas.tsx`) read app state every frame to style selection, hover, and travel. All mutations flow through an **invertible Command** + `UndoManager` so undo/redo is uniform.

## Where things live

| Need to change… | Go to |
|-----------------|-------|
| App state shape, boot flow, scope switching | `src/state/store.ts` |
| A user action (add node, create edge, delete) | `src/state/mutations.ts` |
| How an action undoes/redoes | `src/state/commands.ts` |
| The undo/redo engine | `src/state/undo.ts` |
| API contract / endpoints | `src/api/client.ts` |
| Wire types | `src/api/types.ts` |
| Offline dataset | `src/api/mock.ts` |
| Graph rendering, sigma config, reducers, events | `src/graph/GraphCanvas.tsx` |
| Node/edge attributes, the graphology instance | `src/graph/graphStore.ts` |
| Layout (ForceAtlas2, seeding) | `src/graph/layout.ts` |
| Type colors | `src/graph/colors.ts` |
| Keyboard shortcuts | `src/state/useHotkeys.ts` |
| Travel mode | `src/travel/` |
| A side panel | `src/panels/<Panel>.tsx` |
| Colors, fonts, layout dims | `src/styles/tokens.css` |

## Key patterns — follow these

- **Optimistic + rollback.** A mutation mutates graphology first, then awaits the API. On rejection it restores the captured prior state. Don't add a mutation that only calls the API and waits — mirror the existing command structure in `src/state/commands.ts`.
- **Everything mutating goes through a Command.** To add a new mutation: write a builder in `commands.ts` returning `{ label, execute, invert }`, expose a high-level wrapper in `mutations.ts`, and run it via `store.runCmd(cmd)`. Never mutate graphology directly from a panel.
- **Bump `graphVersion`.** Anything that changes the graphology instance must end by notifying subscribers (`graphTouched()` / the store's `onGraphTouched`). Panels won't re-render otherwise.
- **Style via reducers, not by mutating attributes.** Selection/hover/travel highlighting is computed in the `nodeReducer`/`edgeReducer` in `GraphCanvas.tsx` from app state. Don't write transient visual state into node attributes.
- **Mock parity.** Every endpoint in `client.ts` has a live and a mock implementation. If you add or change an endpoint, update **both** `src/api/client.ts` and `src/api/mock.ts`, or offline mode breaks.

## Gotchas — these will bite you

- **`type` is reserved.** Sigma uses the `type` node/edge attribute to pick its render program. The domain entity type is stored as **`nodeType`** on node attributes. Don't conflate them.
- **The graph is `multi` + `directed`.** Two nodes can have multiple distinct edges. Don't assume edge uniqueness by `(source, target)`.
- **Server mints IDs.** Create-edge doesn't return the new edge ID, so `createEdgeCommand` refetches the graph to recover it. Delete-then-undo re-creates a node with a *new* server ID — `commands.ts` keeps an **alias map** (`oldId → newId`) and resolves every ID through it. If you touch ID handling, preserve this.
- **Layout is deterministic.** `layout.ts` seeds positions with a hashed-ID PRNG (Mulberry32) so the same KB lands in the same shape each boot. Don't introduce `Math.random()` into positioning.
- **Undo manager has a `busy` lock.** It rejects concurrent mutations. Don't fire mutations in parallel; await.
- **Deleting a finding doesn't cascade.** Nodes/edges keep their `grounded_in` citation; the UI shows it as unavailable. This is intentional.
- **Scope is persisted.** The selected project/KB is saved to `localStorage` under `delapan.scope` and restored on boot.

## Conventions

- TypeScript strict throughout; prefer explicit wire types from `src/api/types.ts`.
- Pure derivations over the graphology instance go in `src/state/derive.ts` — keep them side-effect free.
- The visual language is a dark "instrument panel": amber annunciators, IBM Plex Mono/Sans, Big Shoulders Display wordmark. Use the CSS variables in `tokens.css`; don't hard-code colors.
- Tests live next to the code as `*.test.ts` and run under Vitest in a `node` environment (no DOM). The current suite covers undo/redo (`src/state/undo.test.ts`) — extend it when you change command/undo logic.

## Backend

Lives in [delapan-be](https://github.com/anthonysuherli/delapan-be). This repo only consumes its REST API (contract in `src/api/client.ts`). For local dev the backend runs on `http://127.0.0.1:8001`; the Vite proxy forwards `/api/*` to it when `VITE_API_BASE=""`.
