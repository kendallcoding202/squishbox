import { BOTS, seedBotInventory } from "../game/bots";
import { loadState, resetState, saveState, type Inventory, type SaveState } from "../game/state";

type Listener = (s: SaveState) => void;

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** Single source of truth for the UI. Mutate through `update` so every change is saved and rendered. */
class Store {
  state: SaveState = loadState(storage());
  private listeners = new Set<Listener>();
  private saveBroken = false;
  private notifying = false;
  private onSaveFail: (() => void) | null = null;

  /** Told once, the first time the collection fails to reach disk. */
  onSaveError(fn: () => void): void {
    this.onSaveFail = fn;
  }

  private write(): void {
    if (saveState(storage(), this.state)) return;
    if (this.saveBroken) return; // say it once, not on every tap
    this.saveBroken = true;
    this.onSaveFail?.();
  }

  update(fn: (s: SaveState) => void): void {
    fn(this.state);
    this.write();
    // A listener that calls update() again recurses forever, and the only symptom a child sees
    // is a blank screen. Drop the re-entrant notify instead: the state and the save are already
    // correct, and the render in progress will show them. Use persist() to avoid this entirely.
    if (this.notifying) {
      if (import.meta.env.DEV) console.warn("store.update() called during a render; use persist() instead");
      return;
    }
    this.notifying = true;
    try {
      for (const l of this.listeners) l(this.state);
    } finally {
      this.notifying = false;
    }
  }

  /** Save without notifying listeners. For bookkeeping done during a render. */
  persist(): void {
    this.write();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  botInventory(botId: string): Inventory {
    if (!this.state.bots[botId]) {
      const bot = BOTS.find((b) => b.id === botId);
      if (!bot) throw new Error(`Unknown bot ${botId}`);
      this.state.bots[botId] = seedBotInventory(bot);
      this.write();
    }
    return this.state.bots[botId] as Inventory;
  }

  reset(): void {
    resetState(storage());
    this.state = loadState(storage());
    for (const l of this.listeners) l(this.state);
  }
}

export const store = new Store();
