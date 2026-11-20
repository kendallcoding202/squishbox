import { BOTS, seedBotInventory } from "../game/bots";
import { Preferences } from "@capacitor/preferences";
import { Keeper, type StartReport, type VaultBackend } from "../game/keeper";
import type { Source } from "../game/recover";
import type { Inventory, SaveState } from "../game/state";

type Listener = (s: SaveState) => void;

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/**
 * The phone's own copy of the save. On iOS this is the app's preferences, which live outside
 * the web view and so outlast anything that happens to its storage. In a browser the same
 * calls land in local storage under another name: no safer, but the same code runs.
 */
const vault: VaultBackend = {
  get: async (key) => (await Preferences.get({ key })).value,
  set: (key, value) => Preferences.set({ key, value }),
  remove: (key) => Preferences.remove({ key }),
};

/** Single source of truth for the UI. Mutate through `update` so every change is saved and rendered. */
class Store {
  private keeper = new Keeper({ local: storage(), vault, build: __APP_BUILD__ });
  private listeners = new Set<Listener>();
  private notifying = false;

  get state(): SaveState {
    return this.keeper.state;
  }

  /** Settles when the save has been found, or found missing. Nothing should render before it. */
  get ready(): Promise<StartReport> {
    return this.keeper.ready;
  }

  /** Told once, the first time the collection fails to reach disk. */
  onSaveError(fn: () => void): void {
    this.keeper.onSaveError = fn;
  }

  /** Told if a backup takes the place of the game after it has started showing. */
  onRestore(fn: (source: Source) => void): void {
    this.keeper.onRestore = (source) => {
      fn(source);
      for (const l of this.listeners) l(this.state);
    };
  }

  private write(): void {
    this.keeper.write();
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
    this.keeper.reset();
    for (const l of this.listeners) l(this.state);
  }
}

export const store = new Store();
