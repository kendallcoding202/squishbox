/**
 * Squishbox trading post. A small HTTP + SQLite service that does only what needs two people:
 * friend codes, a friends list, and escrowed trades. The game itself stays on the device.
 *
 * Privacy: no accounts, no email, no real names. A player is a random id, a random bearer token,
 * a short friend code, a chosen basket name, and an inventory list. Nothing else is stored.
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { canConfirm, confirm, createTrade, execute, owns, setOffer, type SideKey, type Trade } from "../src/game/trade";
import type { Inventory } from "../src/game/state";

const NAME_MAX = 12;
const INVENTORY_MAX_ITEMS = 5000;
const OPEN_TRADES_PER_PLAYER = 5;
const TRADE_TTL_MS = 24 * 60 * 60 * 1000;

const WORDS = ["BAO", "TARO", "MOCHI", "PEAR", "PLUM", "MINT", "LIME", "KIWI", "YUZU", "FIG", "BEAN", "CORN", "RICE", "SOUP", "TOFU", "MISO", "UDON", "SOBA", "POKE", "BOBA", "CHAI", "LATTE", "COCOA", "HONEY", "MAPLE", "SUGAR", "CANDY", "JELLY", "TART", "CAKE", "PUFF", "BUN", "ROLL", "WRAP", "TACO", "PITA", "NAAN", "PIE", "CHIP", "CRISP", "SNAP", "POP", "FIZZ", "WHIZ", "ZOOM", "STAR", "MOON", "SUN", "CLOUD", "RAIN", "SNOW", "LEAF", "SEED", "TWIG", "ROOT", "PEBBLE", "SHELL", "WAVE", "REEF", "KELP"];

export interface PlayerRow { id: string; token: string; code: string; name: string; inventory: string; updated_at: number; last_seen: number }
interface TradeRow { id: string; a: string; b: string; a_items: string; b_items: string; a_confirmed: number; b_confirmed: number; status: string; version: number; updated_at: number; created_at: number }

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      inventory TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (a, b));
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, a_items TEXT NOT NULL, b_items TEXT NOT NULL,
      a_confirmed INTEGER NOT NULL DEFAULT 0, b_confirmed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS trades_a ON trades (a, status);
    CREATE INDEX IF NOT EXISTS trades_b ON trades (b, status);
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL, trade_id TEXT NOT NULL, partner TEXT NOT NULL,
      give TEXT NOT NULL, get TEXT NOT NULL, acked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS deliveries_player ON deliveries (player, acked);
  `);
  return db;
}

// ---- helpers ----

function cleanName(raw: unknown, fallback: string): string {
  const s = String(raw ?? "").replace(/[^\p{L}\p{N} '!?.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return s || fallback;
}

function cleanInventory(raw: unknown): Inventory {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "inventory must be an object");
  const out: Inventory = {};
  let total = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z0-9]{2,8}$/i.test(k)) continue;
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n <= 0) continue;
    out[k] = Math.min(n, 999);
    total += out[k];
    if (total > INVENTORY_MAX_ITEMS) throw new HttpError(400, "inventory too large");
  }
  return out;
}

function cleanItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "items must be an array");
  if (raw.length > 12) throw new HttpError(400, "too many items in one trade");
  return raw.map((x) => {
    if (typeof x !== "string" || !/^[a-z0-9]{2,8}$/i.test(x)) throw new HttpError(400, "bad item id");
    return x;
  });
}

function rowToTrade(r: TradeRow): Trade {
  return {
    id: r.id,
    a: { owner: r.a, items: JSON.parse(r.a_items) as string[], confirmed: !!r.a_confirmed },
    b: { owner: r.b, items: JSON.parse(r.b_items) as string[], confirmed: !!r.b_confirmed },
    status: r.status as Trade["status"],
    version: r.version,
    lastChangedAt: r.updated_at,
  };
}

// ---- service ----

export class TradingPost {
  constructor(private db: DatabaseSync, private now: () => number = () => Date.now()) {}

  private player(token: string | null): PlayerRow {
    if (!token) throw new HttpError(401, "missing token");
    const row = this.db.prepare("SELECT * FROM players WHERE token = ?").get(token) as PlayerRow | undefined;
    if (!row) throw new HttpError(401, "unknown token");
    this.db.prepare("UPDATE players SET last_seen = ? WHERE id = ?").run(this.now(), row.id);
    return row;
  }

  private playerById(id: string): PlayerRow | undefined {
    return this.db.prepare("SELECT * FROM players WHERE id = ?").get(id) as PlayerRow | undefined;
  }

  private newCode(): string {
    for (let i = 0; i < 50; i++) {
      const w = WORDS[Math.floor(Math.random() * WORDS.length)] as string;
      const code = `${w}-${String(10 + Math.floor(Math.random() * 90))}`;
      if (!this.db.prepare("SELECT 1 FROM players WHERE code = ?").get(code)) return code;
    }
    return `${WORDS[0]}-${randomBytes(2).toString("hex").toUpperCase()}`;
  }

  register(body: { name?: unknown }): { playerId: string; token: string; code: string; name: string } {
    const id = randomUUID();
    const token = randomBytes(24).toString("hex");
    const code = this.newCode();
    const name = cleanName(body.name, code);
    const t = this.now();
    this.db.prepare("INSERT INTO players (id, token, code, name, inventory, updated_at, last_seen) VALUES (?, ?, ?, ?, '{}', ?, ?)").run(id, token, code, name, t, t);
    return { playerId: id, token, code, name };
  }

  private friendsOf(id: string): { id: string; name: string; code: string; lastSeen: number }[] {
    const rows = this.db.prepare("SELECT p.id, p.name, p.code, p.last_seen FROM friends f JOIN players p ON p.id = f.b WHERE f.a = ? ORDER BY p.name").all(id) as { id: string; name: string; code: string; last_seen: number }[];
    return rows.map((r) => ({ id: r.id, name: r.name, code: r.code, lastSeen: r.last_seen }));
  }

  private isFriend(a: string, b: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM friends WHERE a = ? AND b = ?").get(a, b);
  }

  private openTradesFor(id: string): Trade[] {
    this.expireTrades();
    const rows = this.db.prepare("SELECT * FROM trades WHERE (a = ? OR b = ?) AND status IN ('open', 'locked') ORDER BY updated_at DESC").all(id, id) as unknown as TradeRow[];
    return rows.map(rowToTrade);
  }

  private expireTrades(): void {
    this.db.prepare("UPDATE trades SET status = 'declined' WHERE status = 'open' AND updated_at < ?").run(this.now() - TRADE_TTL_MS);
  }

  me(token: string | null) {
    const p = this.player(token);
    const deliveries = (this.db.prepare("SELECT id, trade_id, partner, give, get FROM deliveries WHERE player = ? AND acked = 0 ORDER BY id").all(p.id) as { id: number; trade_id: string; partner: string; give: string; get: string }[])
      .map((d) => ({ id: d.id, tradeId: d.trade_id, partnerName: this.playerById(d.partner)?.name ?? "a friend", give: JSON.parse(d.give) as string[], get: JSON.parse(d.get) as string[] }));
    return {
      playerId: p.id, code: p.code, name: p.name, serverNow: this.now(),
      friends: this.friendsOf(p.id),
      trades: this.openTradesFor(p.id),
      deliveries,
    };
  }

  rename(token: string | null, body: { name?: unknown }): { name: string } {
    const p = this.player(token);
    const name = cleanName(body.name, p.code);
    this.db.prepare("UPDATE players SET name = ? WHERE id = ?").run(name, p.id);
    return { name };
  }

  putInventory(token: string | null, body: { inventory?: unknown }): { ok: true } {
    const p = this.player(token);
    const inv = cleanInventory(body.inventory);
    this.db.prepare("UPDATE players SET inventory = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(inv), this.now(), p.id);
    return { ok: true };
  }

  addFriend(token: string | null, body: { code?: unknown }) {
    const p = this.player(token);
    const code = String(body.code ?? "").trim().toUpperCase().replace(/\s+/g, "-");
    const other = this.db.prepare("SELECT * FROM players WHERE code = ?").get(code) as PlayerRow | undefined;
    if (!other) throw new HttpError(404, "No basket with that code");
    if (other.id === p.id) throw new HttpError(400, "That's your own code");
    const t = this.now();
    this.db.prepare("INSERT OR IGNORE INTO friends (a, b, created_at) VALUES (?, ?, ?)").run(p.id, other.id, t);
    this.db.prepare("INSERT OR IGNORE INTO friends (a, b, created_at) VALUES (?, ?, ?)").run(other.id, p.id, t);
    return { id: other.id, name: other.name, code: other.code, lastSeen: other.last_seen };
  }

  createTrade(token: string | null, body: { friendId?: unknown }): Trade {
    const p = this.player(token);
    const friendId = String(body.friendId ?? "");
    if (!this.isFriend(p.id, friendId)) throw new HttpError(403, "Not friends");
    if (this.openTradesFor(p.id).length >= OPEN_TRADES_PER_PLAYER) throw new HttpError(429, "Too many open trades. Finish or decline one first.");
    const existing = this.db.prepare("SELECT * FROM trades WHERE status = 'open' AND ((a = ? AND b = ?) OR (a = ? AND b = ?))").get(p.id, friendId, friendId, p.id) as TradeRow | undefined;
    if (existing) return rowToTrade(existing);
    const t = createTrade(randomUUID(), p.id, friendId, this.now());
    this.db.prepare("INSERT INTO trades (id, a, b, a_items, b_items, a_confirmed, b_confirmed, status, version, updated_at, created_at) VALUES (?, ?, ?, '[]', '[]', 0, 0, 'open', 0, ?, ?)").run(t.id, t.a.owner, t.b.owner, t.lastChangedAt, t.lastChangedAt);
    return t;
  }

  private loadTrade(id: string, playerId: string): { trade: Trade; side: SideKey } {
    const row = this.db.prepare("SELECT * FROM trades WHERE id = ?").get(id) as TradeRow | undefined;
    if (!row) throw new HttpError(404, "No such trade");
    const side: SideKey | null = row.a === playerId ? "a" : row.b === playerId ? "b" : null;
    if (!side) throw new HttpError(403, "Not your trade");
    return { trade: rowToTrade(row), side };
  }

  private saveTrade(t: Trade): void {
    this.db.prepare("UPDATE trades SET a_items = ?, b_items = ?, a_confirmed = ?, b_confirmed = ?, status = ?, version = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(t.a.items), JSON.stringify(t.b.items), t.a.confirmed ? 1 : 0, t.b.confirmed ? 1 : 0, t.status, t.version, t.lastChangedAt, t.id);
  }

  getTrade(token: string | null, id: string): Trade & { waitMs: number; serverNow: number } {
    const p = this.player(token);
    const { trade } = this.loadTrade(id, p.id);
    return { ...trade, waitMs: canConfirm(trade, this.now()).waitMs, serverNow: this.now() };
  }

  /** A player can only offer spares they hold on the server snapshot. Keeps one of everything, same as the app. */
  offer(token: string | null, id: string, body: { items?: unknown }): Trade {
    const p = this.player(token);
    const { trade, side } = this.loadTrade(id, p.id);
    if (trade.status !== "open") throw new HttpError(409, `Trade is ${trade.status}`);
    const items = cleanItems(body.items);
    const inv = JSON.parse(p.inventory) as Inventory;
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
    for (const [it, n] of counts) if ((inv[it] ?? 0) - n < 1) throw new HttpError(400, "You can only trade spares");
    const next = setOffer(trade, side, items, this.now());
    this.saveTrade(next);
    return next;
  }

  confirm(token: string | null, id: string): Trade & { completed: boolean } {
    const p = this.player(token);
    const { trade, side } = this.loadTrade(id, p.id);
    if (trade.status !== "open") throw new HttpError(409, `Trade is ${trade.status}`);
    const check = canConfirm(trade, this.now());
    if (!check.ok) throw new HttpError(425, check.waitMs > 0 ? `Read it over: ${Math.ceil(check.waitMs / 1000)}s` : "Nothing to trade yet");
    let next = confirm(trade, side, this.now());
    if (next.status === "locked") {
      const pa = this.playerById(next.a.owner);
      const pb = this.playerById(next.b.owner);
      if (!pa || !pb) throw new HttpError(500, "player vanished");
      const invA = JSON.parse(pa.inventory) as Inventory;
      const invB = JSON.parse(pb.inventory) as Inventory;
      if (!owns(invA, next.a.items) || !owns(invB, next.b.items)) {
        // Someone no longer has the goods: reopen for editing rather than fail silently.
        next = setOffer({ ...next, status: "open" }, side, next[side].items, this.now());
        this.saveTrade(next);
        throw new HttpError(409, "Someone no longer has those dumplings. The trade was reopened.");
      }
      const r = execute(next, invA, invB);
      const t = this.now();
      this.db.exec("BEGIN");
      try {
        this.db.prepare("UPDATE players SET inventory = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(r.invA), t, pa.id);
        this.db.prepare("UPDATE players SET inventory = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(r.invB), t, pb.id);
        const ins = this.db.prepare("INSERT INTO deliveries (player, trade_id, partner, give, get, acked, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)");
        ins.run(pa.id, next.id, pb.id, JSON.stringify(next.a.items), JSON.stringify(next.b.items), t);
        ins.run(pb.id, next.id, pa.id, JSON.stringify(next.b.items), JSON.stringify(next.a.items), t);
        this.saveTrade(r.trade);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
      return { ...r.trade, completed: true };
    }
    this.saveTrade(next);
    return { ...next, completed: false };
  }

  decline(token: string | null, id: string): Trade {
    const p = this.player(token);
    const { trade } = this.loadTrade(id, p.id);
    if (trade.status === "completed") throw new HttpError(409, "Already completed");
    const next: Trade = { ...trade, status: "declined" };
    this.saveTrade(next);
    return next;
  }

  ackDelivery(token: string | null, id: number): { ok: true } {
    const p = this.player(token);
    this.db.prepare("UPDATE deliveries SET acked = 1 WHERE id = ? AND player = ?").run(id, p.id);
    return { ok: true };
  }
}

// ---- http ----

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw new HttpError(413, "body too large");
    chunks.push(c as Buffer);
  }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; }
  catch { throw new HttpError(400, "invalid JSON"); }
}

export function createServer(dbPath: string, now?: () => number) {
  const post = new TradingPost(openDb(dbPath), now);
  return createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url ?? "/", "http://x");
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const send = (status: number, body: unknown) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    try {
      const m = req.method ?? "GET";
      const p = url.pathname;
      const tradeMatch = p.match(/^\/v1\/trades\/([0-9a-f-]{36})(?:\/(offer|confirm|decline))?$/);
      if (m === "GET" && p === "/health") return send(200, { ok: true });
      if (m === "POST" && p === "/v1/register") return send(200, post.register(await readJson(req)));
      if (m === "GET" && p === "/v1/me") return send(200, post.me(token));
      if (m === "PUT" && p === "/v1/me") return send(200, post.rename(token, await readJson(req)));
      if (m === "PUT" && p === "/v1/inventory") return send(200, post.putInventory(token, await readJson(req)));
      if (m === "POST" && p === "/v1/friends") return send(200, post.addFriend(token, await readJson(req)));
      if (m === "POST" && p === "/v1/trades") return send(200, post.createTrade(token, await readJson(req)));
      if (tradeMatch) {
        const id = tradeMatch[1] as string;
        const action = tradeMatch[2];
        if (m === "GET" && !action) return send(200, post.getTrade(token, id));
        if (m === "PUT" && action === "offer") return send(200, post.offer(token, id, await readJson(req)));
        if (m === "POST" && action === "confirm") return send(200, post.confirm(token, id));
        if (m === "POST" && action === "decline") return send(200, post.decline(token, id));
      }
      const ack = p.match(/^\/v1\/deliveries\/(\d+)\/ack$/);
      if (m === "POST" && ack) return send(200, post.ackDelivery(token, Number(ack[1])));
      send(404, { error: "not found" });
    } catch (e) {
      if (e instanceof HttpError) send(e.status, { error: e.message });
      else { console.error(e); send(500, { error: "server error" }); }
    }
  });
}

// Entry point when run directly (the Fly container).
const isMain = process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts");
if (isMain && process.env.VITEST === undefined) {
  const port = Number(process.env.PORT ?? 8080);
  const dbPath = process.env.DB_PATH ?? "/data/squishbox.db";
  createServer(dbPath).listen(port, "0.0.0.0", () => console.log(`Squishbox trading post on :${port} (db ${dbPath})`));
}
