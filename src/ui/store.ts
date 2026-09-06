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

  update(fn: (s: SaveState) => void): void {
    fn(this.state);
    saveState(storage(), this.state);
    for (const l of this.listeners) l(this.state);
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
      saveState(storage(), this.state);
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
