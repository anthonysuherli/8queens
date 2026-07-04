import { describe, expect, it, vi, afterEach } from "vitest";
import { mockApi } from "./mock";
import type { SocietyEvent } from "./types";

describe("mockApi.streamSociety", () => {
  it(
    "replays the full named-frame sequence ending in done",
    async () => {
      const events: SocietyEvent[] = [];
      for await (const e of mockApi.streamSociety("delapan", "rag-ecosystem", "mock-run")) {
        events.push(e);
      }
      const names = events.map((e) => e.event);
      // every frame in the frozen 8.2 schema must be exercised at least once,
      // plus the additive budget frame (one per finished phase)
      for (const required of [
        "phase", "gap_opened", "gap_claimed", "node_added", "finding_merged",
        "edge_added", "coverage", "gap_filled", "report", "done", "budget",
      ]) {
        expect(names).toContain(required);
      }
      const budgets = events.filter((e) => e.event === "budget");
      for (const b of budgets) {
        if (b.event === "budget") {
          expect(b.max).not.toBeNull();
          expect(b.used).toBeLessThanOrEqual(b.max as number);
        }
      }
      const used = budgets.map((b) => (b.event === "budget" ? b.used : 0));
      expect([...used].sort((a, z) => a - z)).toEqual(used); // non-decreasing
      const last = events[events.length - 1];
      expect(last.event).toBe("done");
      if (last.event === "done") {
        expect(last.gaps_done).toBeGreaterThanOrEqual(1);
      }
    },
    20_000, // canned run: ~20 frames × 450ms ≈ 9s; allow 20s
  );

  it("startSociety returns a run_id", async () => {
    const res = await mockApi.startSociety("delapan", "rag-ecosystem", { topic: "x" });
    expect(res.run_id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Real byte-stream parser test — exercises the actual streamSociety SSE parser

/**
 * Build a ReadableStream from a sequence of byte chunks (strings encoded as
 * UTF-8). Chunks may split SSE frames across boundaries to prove the parser
 * handles partial frames correctly.
 */
function makeStream(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(enc.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("streamSociety — real byte-stream parser", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "parses named frames to correct ordered SocietyEvents, including a chunk-split frame",
    async () => {
      // Three SSE frames delivered in two raw chunks.
      // The second frame is deliberately split across the chunk boundary
      // to prove the buffer-accumulation logic handles it.
      //
      // Frame 1 (complete in chunk 1):
      //   event: phase
      //   data: {"phase":"seeding","round":0}
      //
      // Frame 2 (split: "event: gap_opened\n" in chunk 1, rest in chunk 2):
      //   event: gap_opened
      //   data: {"gap_id":"g1","question":"What is X?","parent_id":null}
      //
      // Frame 3 (complete in chunk 2):
      //   event: done
      //   data: {"run_id":"r1","rounds":1,"finding_count":0,"gaps_done":1,"gaps_dead":0}

      const chunk1 =
        "event: phase\ndata: {\"phase\":\"seeding\",\"round\":0}\n\n" +
        "event: gap_opened\n";
      const chunk2 =
        "data: {\"gap_id\":\"g1\",\"question\":\"What is X?\",\"parent_id\":null}\n\n" +
        "event: done\ndata: {\"run_id\":\"r1\",\"rounds\":1,\"finding_count\":0,\"gaps_done\":1,\"gaps_dead\":0}\n\n";

      // Mock fetch so streamSociety uses the live path (not mock mode).
      // We reset mode to "live" by resetting the module.
      const mockResponse: Response = {
        ok: true,
        status: 200,
        statusText: "OK",
        body: makeStream(chunk1, chunk2),
      } as unknown as Response;

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

      // Force live mode by importing and manipulating client mode.
      // Since the module is already loaded, we use the exported setMode to flip
      // back to live for this test, then restore.
      const clientModule = await import("./client");
      const originalMode = clientModule.getApiMode();
      clientModule.setMode("live");

      try {
        const { streamSociety } = await import("./society");
        const events: SocietyEvent[] = [];
        for await (const e of streamSociety("proj", "kb", "r1")) {
          events.push(e);
        }

        // Must produce exactly 3 events in order.
        expect(events).toHaveLength(3);

        // Frame 1 — phase
        expect(events[0].event).toBe("phase");
        if (events[0].event === "phase") {
          expect(events[0].phase).toBe("seeding");
          expect(events[0].round).toBe(0);
        }

        // Frame 2 — gap_opened (split across chunk boundary)
        expect(events[1].event).toBe("gap_opened");
        if (events[1].event === "gap_opened") {
          expect(events[1].gap_id).toBe("g1");
          expect(events[1].question).toBe("What is X?");
          expect(events[1].parent_id).toBeNull();
        }

        // Frame 3 — done
        expect(events[2].event).toBe("done");
        if (events[2].event === "done") {
          expect(events[2].run_id).toBe("r1");
          expect(events[2].gaps_done).toBe(1);
        }
      } finally {
        clientModule.setMode(originalMode);
      }
    },
  );
});
