import { describe, expect, it } from "vitest";
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
      // every frame in the frozen 8.2 schema must be exercised at least once
      for (const required of [
        "phase", "gap_opened", "gap_claimed", "node_added", "finding_merged",
        "edge_added", "coverage", "gap_filled", "report", "done",
      ]) {
        expect(names).toContain(required);
      }
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
