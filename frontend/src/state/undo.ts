/**
 * Inverse-command undo/redo stack — the control panel's safety net.
 *
 *   run(cmd) ──▶ cmd.execute() ──▶ undo stack (redo cleared)
 *   undo()   ──▶ cmd.invert()  ──▶ redo stack
 *   redo()   ──▶ cmd.execute() ──▶ undo stack
 *
 * Commands capture their own inverse data at execute() time (not build time)
 * so redo-after-undo recaptures fresh state. A failed execute() must roll
 * back its own optimistic local change and throw — it is then NOT pushed.
 */

export interface Command {
  label: string;
  execute(): Promise<void>;
  invert(): Promise<void>;
}

type Listener = () => void;

export class UndoManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<Listener>();
  private busy = false;

  get canUndo(): boolean {
    return this.undoStack.length > 0 && !this.busy;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0 && !this.busy;
  }

  get undoLabel(): string | null {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  async run(cmd: Command): Promise<void> {
    if (this.busy) throw new Error("another mutation is in flight");
    this.busy = true;
    this.emit();
    try {
      await cmd.execute();
      this.undoStack.push(cmd);
      this.redoStack = [];
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  /** @returns the undone command's label, or null if nothing to undo. */
  async undo(): Promise<string | null> {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    this.busy = true;
    this.emit();
    try {
      await cmd.invert();
      this.redoStack.push(cmd);
      return cmd.label;
    } catch (err) {
      this.undoStack.push(cmd); // restore — the state was rolled back by invert()
      throw err;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  /** @returns the redone command's label, or null if nothing to redo. */
  async redo(): Promise<string | null> {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    this.busy = true;
    this.emit();
    try {
      await cmd.execute();
      this.undoStack.push(cmd);
      return cmd.label;
    } catch (err) {
      this.redoStack.push(cmd);
      throw err;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }
}

/**
 * Compose several commands into one undo step. execute() runs in order and
 * unwinds already-executed members if one fails; invert() runs in reverse.
 */
export function composite(label: string, commands: Command[]): Command {
  return {
    label,
    async execute() {
      const done: Command[] = [];
      for (const cmd of commands) {
        try {
          await cmd.execute();
          done.push(cmd);
        } catch (err) {
          for (const prev of done.reverse()) {
            try {
              await prev.invert();
            } catch {
              // best effort unwind; the original error matters more
            }
          }
          throw err;
        }
      }
    },
    async invert() {
      for (const cmd of [...commands].reverse()) {
        await cmd.invert();
      }
    },
  };
}

export const undoManager = new UndoManager();
