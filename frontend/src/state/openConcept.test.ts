import { beforeEach, describe, expect, it } from "vitest";
import { graph } from "../graph/graphStore";
import { useStore } from "./store";

function addNode(id: string) {
  graph.addNode(id, { label: id, nodeType: "concept", properties: {}, grounded_in: [], created_at: "", x: 0, y: 0, size: 4, color: "#fff" });
}

beforeEach(() => {
  graph.clear();
  useStore.setState({ openConceptNodeId: null, conceptBackStack: [] });
});

describe("concept reader navigation", () => {
  it("opens, navigates with a back-stack, and pops back", () => {
    addNode("a");
    addNode("b");
    const s = useStore.getState();

    s.openConcept("a");
    expect(useStore.getState().openConceptNodeId).toBe("a");
    expect(useStore.getState().conceptBackStack).toEqual([]);

    s.navigateConcept("b");
    expect(useStore.getState().openConceptNodeId).toBe("b");
    expect(useStore.getState().conceptBackStack).toEqual(["a"]);

    s.conceptBack();
    expect(useStore.getState().openConceptNodeId).toBe("a");
    expect(useStore.getState().conceptBackStack).toEqual([]);

    s.openConcept(null);
    expect(useStore.getState().openConceptNodeId).toBeNull();
  });
});
