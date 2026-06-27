import { describe, expect, it } from "vitest";
import { useStore } from "./store";

describe("view toggle", () => {
  it("defaults to graph and setView switches it", () => {
    expect(useStore.getState().view).toBe("graph");
    useStore.getState().setView("trace");
    expect(useStore.getState().view).toBe("trace");
    useStore.getState().setView("graph");
    expect(useStore.getState().view).toBe("graph");
    useStore.getState().setView("timeline");
    expect(useStore.getState().view).toBe("timeline");
    useStore.getState().setView("graph");
    expect(useStore.getState().view).toBe("graph");
  });
});
