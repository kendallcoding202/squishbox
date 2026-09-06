import { applyDelivery } from "../game/state";
import type { Trade } from "../game/trade";
import { store } from "../ui/store";
import { api, ApiError, type Friend } from "./api";

/**
 * Keeps the device and the trading post in step. The device owns the game; the post only needs
 * the inventory snapshot (so it can enforce "spares only"), and it hands back completed trades as
 * deliveries that we apply here exactly once.
 */
export interface NetState {
  online: boolean;
  error: string | null;
  friends: Friend[];
  trades: Trade[];
  lastSync: number;
  skewMs: number;
}

export const net: NetState = { online: false, error: null, friends: [], trades: [], lastSync: 0, skewMs: 0 };

const listeners = new Set<(n: NetState) => void>();
export function onNetChange(fn: (n: NetState) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
function notify(): void { for (const l of listeners) l(net); }

let timer = 0;
let inFlight: Promise<void> | null = null;
let lastInventoryJson = "";

export function enabled(): boolean {
  return store.state.parent.onlineTrading && typeof navigator !== "undefined" && navigator.onLine !== false;
}

export function token(): string | null { return store.state.net?.token ?? null; }

/** Register once, silently. The kid picks a basket name later; until then the code is the name. */
export async function ensureRegistered(): Promise<string | null> {
  if (store.state.net) return store.state.net.token;
  try {
    const creds = await api.register();
    store.update((s) => { s.net = creds; });
    return creds.token;
  } catch (e) {
    net.online = false; net.error = describe(e); notify();
    return null;
  }
}

function describe(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.name === "AbortError") return "The trading post is taking too long";
  return "Can't reach the trading post";
}

/** One sync: push inventory if it changed, pull friends/trades/deliveries, apply deliveries. */
export async function syncNow(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!enabled()) { net.online = false; notify(); return; }
    const t = await ensureRegistered();
    if (!t) return;
    try {
      const invJson = JSON.stringify(store.state.inventory);
      if (invJson !== lastInventoryJson) { await api.putInventory(t, store.state.inventory); lastInventoryJson = invJson; }
      const me = await api.me(t);
      net.skewMs = me.serverNow - Date.now();
      if (me.deliveries.length) {
        for (const d of me.deliveries) {
          store.update((s) => { applyDelivery(s, d, Date.now()); });
          await api.ack(t, d.id);
          onDelivery?.(d.partnerName, d.give, d.get);
        }
        lastInventoryJson = ""; // force a push next time
      }
      if (me.name !== store.state.net?.name || me.code !== store.state.net?.code) store.update((s) => { if (s.net) { s.net.name = me.name; s.net.code = me.code; } });
      net.friends = me.friends; net.trades = me.trades; net.online = true; net.error = null; net.lastSync = Date.now();
    } catch (e) {
      net.online = false; net.error = describe(e);
    }
    notify();
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export let onDelivery: ((partner: string, give: string[], get: string[]) => void) | null = null;
export function setDeliveryHandler(fn: typeof onDelivery): void { onDelivery = fn; }

export function startSync(intervalMs = 20000): void {
  stopSync();
  void syncNow();
  timer = window.setInterval(() => { void syncNow(); }, intervalMs);
  window.addEventListener("online", () => { void syncNow(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void syncNow(); });
}

export function stopSync(): void { clearInterval(timer); timer = 0; }
