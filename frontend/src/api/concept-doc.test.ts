import { describe, expect, it } from "vitest";
import { mockApi, resetMockDb } from "./mock";
import { groundedHash } from "../okf/conceptDoc";

describe("mockApi.synthesizeConceptDoc", () => {
  it("returns a canned doc with a matching grounded_hash", async () => {
    resetMockDb();
    const res = await mockApi.synthesizeConceptDoc("delapan", "rag-ecosystem", "c_finding");
    expect(res.body_markdown.length).toBeGreaterThan(0);
    expect(res.description.length).toBeGreaterThan(0);
    // c_finding is grounded in ["f01","f25"] in the mock dataset
    expect(res.grounded_hash).toBe(groundedHash(["f01", "f25"]));
  });
});
