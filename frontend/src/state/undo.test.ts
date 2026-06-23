import { beforeEach, describe, expect, it } from "vitest";
import { composite, UndoManager, type Command } from "./undo";

function counterCmd(state: { value: number }, delta: number, failOnExecute = false): Command {
  return {
    label: `add ${delta}`,
    async execute() {
      if (failOnExecute) throw new Error("boom");
      state.value += delta;
    },
    async invert() {
      state.value -= delta;
    },
  };
}

describe("UndoManager", () => {
  let manager: UndoManager;
  let state: { value: number };

  beforeEach(() => {
    manager = new UndoManager();
    state = { value: 0 };
  });

  it("runs, undoes, and redoes commands in order", async () => {
    await manager.run(counterCmd(state, 1));
    await manager.run(counterCmd(state, 10));
    expect(state.value).toBe(11);
    expect(manager.canUndo).toBe(true);

    expect(await manager.undo()).toBe("add 10");
    expect(state.value).toBe(1);
    expect(manager.canRedo).toBe(true);

    expect(await manager.undo()).toBe("add 1");
    expect(state.value).toBe(0);
    expect(manager.canUndo).toBe(false);

    expect(await manager.redo()).toBe("add 1");
    expect(await manager.redo()).toBe("add 10");
    expect(state.value).toBe(11);
    expect(manager.canRedo).toBe(false);
  });

  it("clears the redo stack on a new command", async () => {
    await manager.run(counterCmd(state, 1));
    await manager.undo();
    await manager.run(counterCmd(state, 5));
    expect(manager.canRedo).toBe(false);
    expect(state.value).toBe(5);
  });

  it("does not push a command whose execute() throws", async () => {
    await expect(manager.run(counterCmd(state, 1, true))).rejects.toThrow("boom");
    expect(manager.canUndo).toBe(false);
    expect(state.value).toBe(0);
  });

  it("returns null when there is nothing to undo/redo", async () => {
    expect(await manager.undo()).toBeNull();
    expect(await manager.redo()).toBeNull();
  });

  it("composite executes in order and inverts in reverse", async () => {
    const log: string[] = [];
    const make = (name: string): Command => ({
      label: name,
      async execute() {
        log.push(`+${name}`);
      },
      async invert() {
        log.push(`-${name}`);
      },
    });
    const cmd = composite("both", [make("a"), make("b")]);
    await manager.run(cmd);
    await manager.undo();
    expect(log).toEqual(["+a", "+b", "-b", "-a"]);
  });

  it("composite unwinds executed members when a later one fails", async () => {
    const log: string[] = [];
    const good: Command = {
      label: "good",
      async execute() {
        log.push("+good");
      },
      async invert() {
        log.push("-good");
      },
    };
    const bad: Command = {
      label: "bad",
      async execute() {
        throw new Error("nope");
      },
      async invert() {
        log.push("-bad");
      },
    };
    await expect(manager.run(composite("mixed", [good, bad]))).rejects.toThrow("nope");
    expect(log).toEqual(["+good", "-good"]);
    expect(manager.canUndo).toBe(false);
  });
});
