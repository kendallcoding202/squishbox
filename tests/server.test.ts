import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer } from "../server/index";
import { COOLDOWN_MS } from "../src/game/trade";

let base = "";
let clock = 1_000_000_000_000;
const server = createServer(":memory:", () => clock);

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> & Record<string, any> };
}

describe("trading post", () => {
  it("runs a full friend trade end to end with the app's rules", async () => {
    expect((await call("GET", "/health")).json).toEqual({ ok: true });

    const ada = (await call("POST", "/v1/register", undefined, { name: "Ada's Basket" })).json;
    const ben = (await call("POST", "/v1/register", undefined, { name: "<b>Ben</b>" })).json;
    expect(ada.code).toMatch(/^[A-Z]+-\d{2}$/);
    expect(ben.name).toBe("bBenb");
    expect((await call("GET", "/v1/me")).status).toBe(401);

    // inventories: Ada has spare c01s, Ben has a spare r01
    expect((await call("PUT", "/v1/inventory", ada.token, { inventory: { c01: 3, u01: 1, "bad id!": 5, x: -2 } })).status).toBe(200);
    expect((await call("PUT", "/v1/inventory", ben.token, { inventory: { r01: 2 } })).status).toBe(200);

    // friends by code, both directions, no self-add
    expect((await call("POST", "/v1/friends", ada.token, { code: ada.code })).status).toBe(400);
    expect((await call("POST", "/v1/friends", ada.token, { code: "NOPE-00" })).status).toBe(404);
    const f = (await call("POST", "/v1/friends", ada.token, { code: ben.code.toLowerCase() })).json;
    expect(f.name).toBe("bBenb");
    const benMe = (await call("GET", "/v1/me", ben.token)).json;
    expect(benMe.friends.map((x: { name: string }) => x.name)).toEqual(["Ada's Basket"]);

    // trade must be between friends
    const stranger = (await call("POST", "/v1/register")).json;
    expect((await call("POST", "/v1/trades", stranger.token, { friendId: ada.playerId })).status).toBe(403);

    const t = (await call("POST", "/v1/trades", ada.token, { friendId: ben.playerId })).json;
    expect(t.status).toBe("open");
    // creating again returns the same open trade
    expect((await call("POST", "/v1/trades", ben.token, { friendId: ada.playerId })).json.id).toBe(t.id);

    // only spares can be offered
    expect((await call("PUT", `/v1/trades/${t.id}/offer`, ada.token, { items: ["u01"] })).status).toBe(400);
    expect((await call("PUT", `/v1/trades/${t.id}/offer`, ada.token, { items: ["c01", "c01"] })).status).toBe(200);
    expect((await call("PUT", `/v1/trades/${t.id}/offer`, ben.token, { items: ["r01"] })).status).toBe(200);

    // cooldown enforced server-side
    const early = await call("POST", `/v1/trades/${t.id}/confirm`, ada.token);
    expect(early.status).toBe(425);
    clock += COOLDOWN_MS;
    const c1 = (await call("POST", `/v1/trades/${t.id}/confirm`, ada.token)).json;
    expect(c1.completed).toBe(false);
    expect(c1.a.confirmed).toBe(true);

    // Ben changes his offer: Ada's confirmation resets
    expect((await call("PUT", `/v1/trades/${t.id}/offer`, ben.token, { items: ["r01"] })).json.a.confirmed).toBe(false);
    clock += COOLDOWN_MS;
    await call("POST", `/v1/trades/${t.id}/confirm`, ada.token);
    const done = (await call("POST", `/v1/trades/${t.id}/confirm`, ben.token)).json;
    expect(done.completed).toBe(true);
    expect(done.status).toBe("completed");

    // deliveries tell each device what to apply, then get acked
    const adaMe = (await call("GET", "/v1/me", ada.token)).json;
    expect(adaMe.deliveries).toHaveLength(1);
    expect(adaMe.deliveries[0].give).toEqual(["c01", "c01"]);
    expect(adaMe.deliveries[0].get).toEqual(["r01"]);
    expect(adaMe.deliveries[0].partnerName).toBe("bBenb");
    expect(adaMe.trades).toHaveLength(0);
    expect((await call("POST", `/v1/deliveries/${adaMe.deliveries[0].id}/ack`, ada.token)).status).toBe(200);
    expect((await call("GET", "/v1/me", ada.token)).json.deliveries).toHaveLength(0);
    // Ben cannot ack Ada's delivery
    const benMe2 = (await call("GET", "/v1/me", ben.token)).json;
    expect(benMe2.deliveries[0].get).toEqual(["c01", "c01"]);

    // server snapshots moved too, so Ada can no longer offer two c01 (she has 1 left)
    const t2 = (await call("POST", "/v1/trades", ada.token, { friendId: ben.playerId })).json;
    expect((await call("PUT", `/v1/trades/${t2.id}/offer`, ada.token, { items: ["c01"] })).status).toBe(400);
    expect((await call("POST", `/v1/trades/${t2.id}/decline`, ben.token)).json.status).toBe("declined");
    expect((await call("PUT", `/v1/trades/${t2.id}/offer`, ada.token, { items: [] })).status).toBe(409);
  });

  it("rejects garbage", async () => {
    const p = (await call("POST", "/v1/register")).json;
    expect((await call("PUT", "/v1/inventory", p.token, { inventory: "nope" })).status).toBe(400);
    expect((await call("GET", "/v1/trades/not-a-uuid", p.token)).status).toBe(404);
    expect((await call("GET", "/v1/trades/00000000-0000-0000-0000-000000000000", p.token)).status).toBe(404);
    const res = await fetch(base + "/v1/register", { method: "POST", body: "{bad" });
    expect(res.status).toBe(400);
  });
});
