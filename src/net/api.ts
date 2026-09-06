import type { Inventory } from "../game/state";
import type { Trade } from "../game/trade";

/** Where the trading post lives. Override at build time with VITE_API_URL. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "https://squishbox-api.fly.dev";

export interface Friend { id: string; name: string; code: string; lastSeen: number }
export interface Delivery { id: number; tradeId: string; partnerName: string; give: string[]; get: string[] }
export interface Me { playerId: string; code: string; name: string; serverNow: number; friends: Friend[]; trades: Trade[]; deliveries: Delivery[] }
export interface Credentials { playerId: string; token: string; code: string; name: string }

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

async function request<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(API_URL + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  register: (name?: string) => request<Credentials>("POST", "/v1/register", null, { name }),
  me: (token: string) => request<Me>("GET", "/v1/me", token),
  rename: (token: string, name: string) => request<{ name: string }>("PUT", "/v1/me", token, { name }),
  putInventory: (token: string, inventory: Inventory) => request<{ ok: true }>("PUT", "/v1/inventory", token, { inventory }),
  addFriend: (token: string, code: string) => request<Friend>("POST", "/v1/friends", token, { code }),
  createTrade: (token: string, friendId: string) => request<Trade>("POST", "/v1/trades", token, { friendId }),
  getTrade: (token: string, id: string) => request<Trade & { waitMs: number; serverNow: number }>("GET", `/v1/trades/${id}`, token),
  offer: (token: string, id: string, items: string[]) => request<Trade>("PUT", `/v1/trades/${id}/offer`, token, { items }),
  confirm: (token: string, id: string) => request<Trade & { completed: boolean }>("POST", `/v1/trades/${id}/confirm`, token),
  decline: (token: string, id: string) => request<Trade>("POST", `/v1/trades/${id}/decline`, token),
  ack: (token: string, id: number) => request<{ ok: true }>("POST", `/v1/deliveries/${id}/ack`, token),
};
