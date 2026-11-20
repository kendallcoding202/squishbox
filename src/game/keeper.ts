import { parsePreflight, parseSnapshot, planStart, shouldSnapshot, type Source } from "./recover";
import { newState, readSave, saveState, SAVE_KEY, type SaveState } from "./state";

/**
 * Keeps the save, in two places.
 *
 * The web view's local storage is read first and written first, as it always was. Alongside
 * it the phone keeps its own copy (the "vault": native preferences on iOS), which the web
 * view cannot lose. recover.ts decides which copy to start from; this file does the reading,
 * the writing, and the waiting.
 *
 * Four promises it makes, each one a way the old single-copy save could lose a collection:
 *   - A start-up that finds no save asks the vault before it begins a new game. The vault
 *     also holds what the app read from the web view's own file as it launched (see
 *     SavePreflight in AppDelegate.swift), so this works on the very first launch too.
 *   - A new game is never saved over a collection: if the web view said "nothing here" and
 *     then, at the first save, there is something after all, that something is taken up.
 *   - Nothing is written to the vault until the vault has been read, so a game that could
 *     not see the backup can never save over it.
 *   - A copy that is there but unreadable is moved aside, not replaced.
 */

/** Local storage, or anything shaped like it. */
export interface LocalStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The phone's own key-value store. Every call may fail; none may be assumed to have worked. */
export interface VaultBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const VAULT_SAVE = "squishbox.save";
export const VAULT_SNAPSHOT = "squishbox.snapshot";
export const VAULT_UNREADABLE = "squishbox.unreadable";
/** Written by the app itself at launch, never by this file. */
export const VAULT_PREFLIGHT = "squishbox.preflight";
export const LOCAL_UNREADABLE = `${SAVE_KEY}.unreadable`;

/** How long a start-up with no local save waits for the vault before showing a new game. */
export const VAULT_WAIT_MS = 4000;
/** While the vault has not answered, ask again on a save, but not more often than this. */
const RETRY_GAP_MS = 5000;

interface VaultCopies { save: string | null; snapshot: string | null; unreadable: string | null; preflight: string | null }

export interface StartReport {
  /** Where the game being shown came from. */
  source: Source;
  /** True when the web view had no save to give and a backup filled in for it. */
  restored: boolean;
}

export interface KeeperOptions {
  local: LocalStore | null;
  vault: VaultBackend | null;
  /** Identifies this build, e.g. "1.4.1 (14)". A new build takes a new snapshot. */
  build: string;
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class Keeper {
  state: SaveState;
  /** Settles when it is safe to show the game: at once if the local save was readable. */
  readonly ready: Promise<StartReport>;
  /** Called if a backup replaces the game after `ready` has settled. Rare; re-render. */
  onRestore: ((source: Source) => void) | null = null;
  /** Called once, the first time a save reaches neither copy. */
  onSaveError: (() => void) | null = null;

  private readonly local: LocalStore | null;
  private readonly vault: VaultBackend | null;
  private readonly build: string;
  private readonly now: () => number;
  /** True once the vault has been read. Until then nothing is written to it. */
  private mirroring = false;
  private reading = false;
  private lastReadAt = 0;
  private source: Source;
  /** The text of the copy this session started from, before anything wrote over it. */
  private launchRaw: string | null;
  private launchOnboarded: boolean;
  private settled = false;
  /**
   * True while a new game is being shown without the vault having been heard from. Such a
   * game is a stand-in: whatever readable save the vault turns out to hold replaces it.
   */
  private provisional: boolean;
  /** True until this session's first save. */
  private unsaved = true;
  private saveBroken = false;
  /** Latest value wanted for each vault key; null means remove. One writer drains it. */
  private readonly wanted = new Map<string, string | null>();
  private draining: Promise<boolean> | null = null;
  private localUnreadable: string[] = [];

  constructor(opts: KeeperOptions) {
    this.local = opts.local;
    this.vault = opts.vault;
    this.build = opts.build;
    this.now = opts.now ?? (() => Date.now());
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

    const localRaw = this.localGet(SAVE_KEY);
    const first = planStart({ local: localRaw, vault: null, snapshot: null });
    this.state = first.state;
    this.source = first.source;
    this.launchRaw = first.source === "local" ? localRaw : null;
    this.launchOnboarded = first.state.onboarded;
    this.provisional = first.source === "fresh" && !!opts.vault;
    this.localUnreadable = first.unreadable;
    for (const raw of first.unreadable) this.keepUnreadableLocally(raw);

    const report = (): StartReport => ({ source: this.source, restored: this.source !== "local" && this.source !== "fresh" });
    if (!this.vault) {
      this.ready = Promise.resolve(report());
      return;
    }
    if (first.source === "local") {
      // A readable local save is shown at once. The vault is still read, in the background,
      // so mirroring can begin; it only takes over if it holds something newer.
      this.settled = true;
      this.ready = Promise.resolve(report());
      void this.askVault();
    } else {
      const asked = this.askVault();
      // No local save. Whether this is a new player or a lost collection is the vault's to
      // say, so wait for it, but not forever: a phone that will not answer still gets a game.
      this.ready = Promise.race([asked, sleep(opts.waitMs ?? VAULT_WAIT_MS)]).then(() => {
        this.settled = true;
        return report();
      });
    }
  }

  /** Save now. Counts the write, so this copy is known to be newer than the last. */
  write(): void {
    if (this.unsaved && this.source === "fresh" && this.takeUpWhatAppeared()) return;
    this.unsaved = false;
    this.state.rev += 1;
    const localOk = !!this.local && saveState(this.local, this.state);
    let vaultOk: Promise<boolean>;
    if (this.mirroring) {
      vaultOk = this.put(VAULT_SAVE, JSON.stringify(this.state));
    } else {
      vaultOk = Promise.resolve(false);
      if (this.vault && !this.reading && this.now() - this.lastReadAt >= RETRY_GAP_MS) void this.askVault();
    }
    if (localOk) return;
    // The web view would not take it. If the phone did, the collection is safe and the next
    // start will bring it back from there; only when both refuse is there something to say.
    void vaultOk.then((ok) => {
      if (ok || this.saveBroken) return;
      this.saveBroken = true;
      this.onSaveError?.();
    });
  }

  /**
   * Start again on purpose (the Parent corner). The new game carries the old count forward
   * and is written straight away, so it is the newest copy everywhere and no backup can
   * outrank it; the snapshot and anything set aside go too.
   */
  reset(): void {
    const fresh = newState();
    fresh.rev = this.state.rev;
    this.state = fresh;
    this.source = "fresh";
    this.provisional = false; // this empty basket was asked for
    this.unsaved = false;
    try { this.local?.removeItem(LOCAL_UNREADABLE); } catch { /* ignore */ }
    this.write();
    if (this.vault) {
      void this.put(VAULT_SNAPSHOT, null);
      void this.put(VAULT_UNREADABLE, null);
    }
  }

  /** Resolves when every pending vault write has been tried. For tests and for going to the background. */
  flushed(): Promise<boolean> {
    return this.draining ?? Promise.resolve(true);
  }

  // ---- the vault ----

  private async askVault(): Promise<void> {
    const vault = this.vault;
    if (!vault || this.reading || this.mirroring) return;
    this.reading = true;
    this.lastReadAt = this.now();
    let copies: VaultCopies;
    try {
      const [save, snapshot, unreadable, preflight] = await Promise.all([vault.get(VAULT_SAVE), vault.get(VAULT_SNAPSHOT), vault.get(VAULT_UNREADABLE), vault.get(VAULT_PREFLIGHT)]);
      copies = { save, snapshot, unreadable, preflight };
    } catch {
      this.reading = false; // unknown, not empty: stay out of it and ask again later
      return;
    }
    this.reading = false;
    this.reconcile(copies);
  }

  private reconcile(copies: VaultCopies): void {
    const snapshot = parseSnapshot(copies.snapshot);
    const theirs = planStart({ local: null, vault: copies.save, preflight: parsePreflight(copies.preflight), snapshot: snapshot?.raw ?? null });

    // Anything unreadable is about to be at risk: the vault's own save key will be written
    // over by mirroring, and local storage's already has been stepped around. One slot,
    // first come first kept, so a later failure cannot push out an earlier one.
    const aside = [...this.localUnreadable, ...theirs.unreadable][0];
    if (aside && !copies.unreadable) void this.put(VAULT_UNREADABLE, aside);

    let adopted = false;
    if (theirs.source !== "fresh" && (this.provisional || theirs.state.rev > this.state.rev)) {
      this.state = theirs.state;
      this.source = theirs.source;
      this.launchRaw = theirs.raw;
      this.launchOnboarded = theirs.state.onboarded;
      if (this.local) saveState(this.local, this.state);
      adopted = true;
    }

    if (this.launchRaw && shouldSnapshot(snapshot, this.build, this.launchOnboarded)) {
      void this.put(VAULT_SNAPSHOT, JSON.stringify({ build: this.build, raw: this.launchRaw }));
    }

    this.provisional = false;
    this.mirroring = true;
    // Bring the vault up to date with whatever is being played, unless that is a new game
    // nobody has saved yet: an empty basket is not worth a write, and must not be the thing
    // that replaces a save the vault could not make sense of.
    if (this.source !== "fresh" || this.state.rev > 0) {
      const current = JSON.stringify(this.state);
      if (current !== copies.save) void this.put(VAULT_SAVE, current);
    }
    if (adopted && this.settled) this.onRestore?.(this.source);
  }

  /**
   * The web view said there was no save, a new game was shown, and now that game is about
   * to be saved for the first time. Look once more. If a save is there after all, the
   * earlier answer was wrong, and writing now is exactly how a collection gets lost: take
   * the save up instead and write nothing.
   */
  private takeUpWhatAppeared(): boolean {
    const read = readSave(this.localGet(SAVE_KEY));
    if (read.kind !== "ok") return false;
    this.state = read.state;
    this.source = "local";
    this.provisional = false;
    this.unsaved = false;
    if (this.mirroring) void this.put(VAULT_SAVE, JSON.stringify(this.state));
    this.onRestore?.("local");
    return true;
  }

  /** Queue a vault write. Later values for the same key replace earlier ones still waiting. */
  private put(key: string, value: string | null): Promise<boolean> {
    if (!this.vault) return Promise.resolve(false);
    this.wanted.set(key, value);
    if (!this.draining) this.draining = this.drain();
    return this.draining;
  }

  private async drain(): Promise<boolean> {
    const vault = this.vault as VaultBackend;
    let ok = true;
    await Promise.resolve(); // let a burst of writes in one tick collapse into the last
    while (this.wanted.size) {
      const [key, value] = this.wanted.entries().next().value as [string, string | null];
      this.wanted.delete(key);
      try {
        if (value === null) await vault.remove(key);
        else await vault.set(key, value);
      } catch {
        ok = false;
      }
    }
    this.draining = null; // before returning, so a write queued next starts a new drain
    return ok;
  }

  // ---- local storage ----

  private localGet(key: string): string | null {
    try { return this.local?.getItem(key) ?? null; } catch { return null; }
  }

  private keepUnreadableLocally(raw: string): void {
    try {
      if (this.local && !this.local.getItem(LOCAL_UNREADABLE)) this.local.setItem(LOCAL_UNREADABLE, raw);
    } catch {
      /* no room, or no storage: the vault gets a copy too */
    }
  }
}
