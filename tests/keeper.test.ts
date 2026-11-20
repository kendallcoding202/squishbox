import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Keeper, LOCAL_UNREADABLE, VAULT_SAVE, VAULT_SNAPSHOT, VAULT_UNREADABLE, type LocalStore, type VaultBackend } from "../src/game/keeper";
import { parseSnapshot, planStart, shouldSnapshot } from "../src/game/recover";
import { newState, readSave, SAVE_KEY, type SaveState } from "../src/game/state";

// The save a real 1.3 build wrote after being played: 44 dumplings, a buddy, 8840 coins.
const RICH = readFileSync(new URL("./fixtures/save-1.3-rich.json", import.meta.url), "utf8");
const total = (s: SaveState): number => Object.values(s.inventory).reduce((a, b) => a + b, 0);

class FakeLocal implements LocalStore {
  data = new Map<string, string>();
  refuse = false;
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { if (this.refuse) throw new Error("QuotaExceededError"); this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
}

/** A vault whose answers can be held back, or made to fail, the way a real bridge can. */
class FakeVault implements VaultBackend {
  data = new Map<string, string>();
  failReads = false;
  failWrites = false;
  sets: string[] = [];
  private gate: Promise<void> = Promise.resolve();
  private open: (() => void) | null = null;
  hold(): void { this.gate = new Promise((r) => { this.open = r; }); }
  release(): void { this.open?.(); }
  async get(k: string): Promise<string | null> {
    await this.gate;
    if (this.failReads) throw new Error("bridge down");
    return this.data.get(k) ?? null;
  }
  async set(k: string, v: string): Promise<void> {
    if (this.failWrites) throw new Error("bridge down");
    this.sets.push(k);
    this.data.set(k, v);
  }
  async remove(k: string): Promise<void> {
    if (this.failWrites) throw new Error("bridge down");
    this.data.delete(k);
  }
}

const tick = async (n = 6): Promise<void> => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const make = (local: LocalStore | null, vault: VaultBackend | null, extra: Partial<ConstructorParameters<typeof Keeper>[0]> = {}): Keeper =>
  new Keeper({ local, vault, build: "1.4.1 (14)", ...extra });
const vaultSave = (v: FakeVault): SaveState => {
  const r = readSave(v.data.get(VAULT_SAVE));
  if (r.kind !== "ok") throw new Error(`vault save is ${r.kind}`);
  return r.state;
};

describe("reading a stored save", () => {
  it("tells nothing-there apart from there-but-unreadable", () => {
    expect(readSave(null).kind).toBe("none");
    expect(readSave("").kind).toBe("none");
    expect(readSave("{not json").kind).toBe("unreadable");
    expect(readSave("null").kind).toBe("unreadable");
    expect(readSave("[]").kind).toBe("unreadable");
    expect(readSave(JSON.stringify({ version: 2, coins: 5 })).kind).toBe("unreadable");
    expect(readSave(RICH).kind).toBe("ok");
  });

  it("hands back the exact text it could not read, so it can be kept", () => {
    const r = readSave("{half a save");
    expect(r).toEqual({ kind: "unreadable", raw: "{half a save" });
  });

  it("ranks a save from before the counter above a game nobody has played", () => {
    const r = readSave(RICH);
    expect(r.kind === "ok" && r.state.rev).toBe(1);
    expect(newState().rev).toBe(0);
  });
});

describe("choosing which copy to start from", () => {
  const at = (rev: number, coins: number): string => JSON.stringify({ ...newState(), rev, coins, onboarded: true });

  it("starts a new game only when no copy can be read", () => {
    expect(planStart({ local: null, vault: null, snapshot: null }).source).toBe("fresh");
    expect(planStart({ local: "{bad", vault: "{worse", snapshot: null }).source).toBe("fresh");
  });

  it("takes the copy written most recently, wherever it is", () => {
    expect(planStart({ local: at(5, 1), vault: at(9, 2), snapshot: at(3, 3) }).state.coins).toBe(2);
    expect(planStart({ local: at(9, 1), vault: at(5, 2), snapshot: at(3, 3) }).state.coins).toBe(1);
    expect(planStart({ local: null, vault: null, snapshot: at(3, 3) }).source).toBe("snapshot");
  });

  it("prefers the web view's own copy on a tie", () => {
    expect(planStart({ local: at(5, 1), vault: at(5, 2), snapshot: null }).source).toBe("local");
  });

  it("reports every copy it could not read", () => {
    const plan = planStart({ local: "{bad", vault: at(4, 2), snapshot: "{also bad" });
    expect(plan.source).toBe("vault");
    expect(plan.unreadable).toEqual(["{bad", "{also bad"]);
  });

  it("snapshots a started game once per build, and never an empty basket", () => {
    expect(shouldSnapshot(null, "1.4.1 (14)", true)).toBe(true);
    expect(shouldSnapshot({ build: "1.4.1 (14)", raw: "x" }, "1.4.1 (14)", true)).toBe(false);
    expect(shouldSnapshot({ build: "1.4.1 (14)", raw: "x" }, "1.5 (15)", true)).toBe(true);
    expect(shouldSnapshot(null, "1.5 (15)", false)).toBe(false);
    expect(parseSnapshot("{bad")).toBeNull();
    expect(parseSnapshot(JSON.stringify({ build: "b", raw: "" }))).toBeNull();
  });
});

describe("the first launch of this build over an existing save", () => {
  it("shows the collection at once and copies it to the phone", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault();
    const k = make(local, vault);
    const report = await k.ready;
    expect(report).toEqual({ source: "local", restored: false });
    expect(total(k.state)).toBe(44);
    await tick();
    expect(total(vaultSave(vault))).toBe(44);
    const snap = parseSnapshot(vault.data.get(VAULT_SNAPSHOT));
    expect(snap).toEqual({ build: "1.4.1 (14)", raw: RICH }); // the save exactly as the old build left it
  });

  it("does not wait for the phone when the local save is good", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault(); vault.hold();
    const k = make(local, vault);
    await expect(Promise.race([k.ready, tick().then(() => "still waiting")])).resolves.toMatchObject({ source: "local" });
    vault.release();
  });
});

describe("the thing that went wrong: the web view comes up empty", () => {
  const playedThenLost = async (): Promise<{ local: FakeLocal; vault: FakeVault }> => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault();
    const k = make(local, vault);
    await k.ready; await tick();
    k.state.coins += 10; k.write();
    await k.flushed();
    local.data.clear(); // whatever it was that emptied the web view's storage
    return { local, vault };
  };

  it("brings the collection back from the phone's copy instead of starting again", async () => {
    const { local, vault } = await playedThenLost();
    const k = make(local, vault);
    const report = await k.ready;
    expect(report).toEqual({ source: "vault", restored: true });
    expect(total(k.state)).toBe(44);
    expect(k.state.coins).toBe(8850);
    expect(readSave(local.getItem(SAVE_KEY)).kind).toBe("ok"); // and puts it back where it belongs
  });

  it("waits for the phone before showing anything", async () => {
    const { local, vault } = await playedThenLost();
    vault.hold();
    const k = make(local, vault);
    await expect(Promise.race([k.ready, tick().then(() => "still waiting")])).resolves.toBe("still waiting");
    vault.release();
    expect((await k.ready).restored).toBe(true);
  });

  it("never saves a new game over a backup it has not been able to read", async () => {
    const { local, vault } = await playedThenLost();
    vault.hold(); // the phone is slow to answer
    let wake = (): void => {};
    const k = make(local, vault, { sleep: () => new Promise<void>((r) => { wake = r; }) });
    let restoredLate = false;
    k.onRestore = () => { restoredLate = true; };
    wake(); // out of patience: a new game is shown
    expect(await k.ready).toEqual({ source: "fresh", restored: false });
    k.state.onboarded = true; k.state.coins = 3; k.write(); k.write(); k.write(); // the kid taps through the welcome
    await tick();
    expect(total(vaultSave(vault))).toBe(44); // untouched
    vault.release(); // the phone answers after all
    await tick();
    expect(restoredLate).toBe(true);
    expect(total(k.state)).toBe(44);
    expect(total(vaultSave(vault))).toBe(44);
  });

  it("stays out of the vault while it cannot be read, then picks up when it can", async () => {
    const { local, vault } = await playedThenLost();
    vault.failReads = true;
    let clock = 0;
    const k = make(local, vault, { now: () => clock });
    expect((await k.ready).source).toBe("fresh");
    k.write();
    await tick();
    expect(total(vaultSave(vault))).toBe(44);
    vault.failReads = false;
    clock += 60_000;
    k.write(); // a later save asks again
    await tick();
    expect(total(k.state)).toBe(44);
  });

  it("falls back to the snapshot when the phone's main copy is gone too", async () => {
    const { local, vault } = await playedThenLost();
    vault.data.delete(VAULT_SAVE);
    const k = make(local, vault);
    expect(await k.ready).toEqual({ source: "snapshot", restored: true });
    expect(total(k.state)).toBe(44);
    expect(k.state.coins).toBe(8840); // as it stood when this build first ran
  });

  it("is a new game when there really is nothing anywhere", async () => {
    const vault = new FakeVault();
    const k = make(new FakeLocal(), vault);
    expect(await k.ready).toEqual({ source: "fresh", restored: false });
    await tick();
    expect(vault.data.size).toBe(0); // an unplayed game is not worth a backup
    k.state.onboarded = true; k.write();
    await k.flushed();
    expect(vaultSave(vault).onboarded).toBe(true);
  });
});

describe("a copy that cannot be read", () => {
  it("is set aside in both places, and the first one set aside is the one kept", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, "{half a save");
    const vault = new FakeVault();
    const k = make(local, vault);
    expect((await k.ready).source).toBe("fresh");
    await tick();
    expect(local.getItem(LOCAL_UNREADABLE)).toBe("{half a save");
    expect(vault.data.get(VAULT_UNREADABLE)).toBe("{half a save");
    k.write(); await k.flushed();

    local.data.set(SAVE_KEY, "{a second, later mess");
    const again = make(local, vault);
    await again.ready; await tick();
    expect(local.getItem(LOCAL_UNREADABLE)).toBe("{half a save");
    expect(vault.data.get(VAULT_UNREADABLE)).toBe("{half a save");
  });

  it("in the vault is moved aside before mirroring writes over it", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault(); vault.data.set(VAULT_SAVE, "{scrambled");
    const k = make(local, vault);
    await k.ready; await tick();
    expect(vault.data.get(VAULT_UNREADABLE)).toBe("{scrambled");
    expect(total(vaultSave(vault))).toBe(44);
  });
});

describe("saving", () => {
  it("counts every write and mirrors the last of a burst", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault();
    const k = make(local, vault);
    await k.ready; await tick();
    const before = vault.sets.length;
    for (let i = 0; i < 20; i++) { k.state.coins += 1; k.write(); }
    await k.flushed();
    expect(k.state.rev).toBe(21);
    expect(vaultSave(vault).coins).toBe(8860);
    expect(vault.sets.length - before).toBeLessThan(5);
    const stored = readSave(local.getItem(SAVE_KEY));
    expect(stored.kind === "ok" && stored.state.rev).toBe(21);
  });

  it("survives the web view refusing to store it, as long as the phone will", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault();
    const k = make(local, vault);
    let complained = 0;
    k.onSaveError = () => { complained += 1; };
    await k.ready; await tick();
    local.refuse = true;
    k.state.coins = 9999; k.write();
    await k.flushed(); await tick();
    expect(complained).toBe(0);
    local.refuse = false;
    const next = make(local, vault); // local still holds the older save
    await next.ready; await tick();
    expect(next.state.coins).toBe(9999); // the newer copy wins
  });

  it("says so, once, when neither place will take it", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault();
    const k = make(local, vault);
    let complained = 0;
    k.onSaveError = () => { complained += 1; };
    await k.ready; await tick();
    local.refuse = true; vault.failWrites = true;
    k.write(); k.write();
    await tick(); k.write(); await tick();
    expect(complained).toBe(1);
  });

  it("works with no vault at all", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const k = make(local, null);
    expect(await k.ready).toEqual({ source: "local", restored: false });
    k.write();
    expect(readSave(local.getItem(SAVE_KEY)).kind).toBe("ok");
  });
});

describe("snapshots", () => {
  it("are taken once per build, of the save as that build found it", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault();
    const a = make(local, vault);
    await a.ready; await tick();
    a.state.coins = 1; a.write(); await a.flushed();

    const b = make(local, vault); // same build, next day
    await b.ready; await tick();
    expect(parseSnapshot(vault.data.get(VAULT_SNAPSHOT))?.raw).toBe(RICH);

    const before = local.getItem(SAVE_KEY);
    const c = make(local, vault, { build: "1.5 (15)" }); // the next update
    await c.ready; await tick();
    expect(parseSnapshot(vault.data.get(VAULT_SNAPSHOT))).toEqual({ build: "1.5 (15)", raw: before });
  });
});

describe("starting again on purpose", () => {
  it("clears every copy, and no backup brings the old game back", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault();
    const k = make(local, vault);
    await k.ready; await tick();
    k.reset();
    await k.flushed();
    expect(total(k.state)).toBe(0);
    expect(total(vaultSave(vault))).toBe(0);
    expect(vault.data.has(VAULT_SNAPSHOT)).toBe(false);

    const next = make(local, vault);
    expect(await next.ready).toEqual({ source: "local", restored: false });
    await tick();
    expect(total(next.state)).toBe(0);
  });

  it("holds even if the phone's copy could not be cleared", async () => {
    const local = new FakeLocal(); local.data.set(SAVE_KEY, RICH);
    const vault = new FakeVault();
    const k = make(local, vault);
    await k.ready; await tick();
    vault.failWrites = true; // the old collection stays in the vault
    k.reset();
    await k.flushed();
    vault.failWrites = false;
    expect(total(vaultSave(vault))).toBe(44);

    const next = make(local, vault);
    await next.ready; await tick();
    expect(total(next.state)).toBe(0); // the reset is newer, so it wins
    expect(total(vaultSave(vault))).toBe(0); // and the vault catches up
  });
});
