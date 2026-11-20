import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

// The release script is plain .mjs so CI can run it with nothing installed. Loaded through a
// variable so the type checker does not go looking for declarations it does not have.
interface SeasonalLine { series?: string; from: { month: number; day: number }; to: { month: number; day: number }; text: string }

const scriptPath = "../scripts/asc.mjs";
const asc = (await import(/* @vite-ignore */ scriptPath)) as {
  familyOf(displayType: string): { id: string } | null;
  orderFiles(names: string[], prefix: string): string[];
  setMatches(existing: { fileName: string; checksum: string }[], wanted: { fileName: string; checksum: string }[]): boolean;
  makeToken(c: { keyId: string; issuerId: string; privateKey: string }, now?: number): string;
  notesFor(text: string | null, version: string): string;
  newestFirst<T extends { attributes: { createdDate?: string } }>(list: T[]): T[];
  pickSet<S extends { displayType: string }>(sets: S[], family: { id: string; createAs: string }): { managed: S | null; others: S[] };
  FAMILIES: { id: string; createAs: string }[];
  SUBMITTABLE: string[];
  WITHDRAWABLE: string[];
  PROMO_MAX: number;
  promoFor(date: Date, evergreen: string | null, seasonal: SeasonalLine[] | null): string | null;
  currentVersions<V>(sorted: V[], stateFn: (v: V) => string): V[];
  parseArgs(argv: string[]): { command: string; dryRun: boolean; version?: string; build?: string };
};

describe("release script: which screenshots go where", () => {
  it("maps Apple's display types onto the two sets we generate", () => {
    expect(asc.familyOf("APP_IPHONE_67")?.id).toBe("iphone");
    expect(asc.familyOf("APP_IPHONE_65")?.id).toBe("iphone");
    expect(asc.familyOf("APP_IPAD_PRO_3GEN_129")?.id).toBe("ipad");
    expect(asc.familyOf("APP_WATCH_ULTRA")).toBeNull(); // never touch a set we do not make
  });

  it("orders by the number in the name, so a tenth frame does not land second", () => {
    const names = ["iphone69-10-z.png", "iphone69-2-noads.png", "iphone69-1-open.png", "ipad13-1-open.png", "notes.txt", "iphone69-x.png"];
    expect(asc.orderFiles(names, "iphone69-")).toEqual(["iphone69-1-open.png", "iphone69-2-noads.png", "iphone69-10-z.png"]);
    expect(asc.orderFiles(names, "ipad13-")).toEqual(["ipad13-1-open.png"]);
  });

  it("only calls a set up to date when names, contents and order all agree", () => {
    const a = { fileName: "iphone69-1-open.png", checksum: "aa" };
    const b = { fileName: "iphone69-2-noads.png", checksum: "bb" };
    expect(asc.setMatches([a, b], [a, b])).toBe(true);
    expect(asc.setMatches([b, a], [a, b])).toBe(false); // right files, wrong order
    expect(asc.setMatches([a], [a, b])).toBe(false); // the old six against the new seven
    // Regenerated under the same name: the listing would otherwise keep the stale picture.
    expect(asc.setMatches([a, { ...b, checksum: "old" }], [a, b])).toBe(false);
  });

  it("finds the committed screenshots in matching sets for both devices", async () => {
    const { readdir } = await import("node:fs/promises");
    const names = await readdir(new URL("../store/screenshots/", import.meta.url));
    const phone = asc.orderFiles(names, "iphone69-");
    const pad = asc.orderFiles(names, "ipad13-");
    expect(phone.length).toBeGreaterThan(0);
    expect(pad.map((n) => n.replace("ipad13-", ""))).toEqual(phone.map((n) => n.replace("iphone69-", "")));
  });
});

describe("release script: not trusting the order Apple lists things in", () => {
  it("puts the newest version first whatever order it arrives in", () => {
    const v = (versionString: string, createdDate: string) => ({ attributes: { versionString, createdDate } });
    const shuffled = [v("1.2", "2026-10-09T17:00:00Z"), v("1.4", "2026-11-19T17:00:00Z"), v("1.3", "2026-10-23T02:00:00Z")];
    expect(asc.newestFirst(shuffled).map((x) => x.attributes.versionString)).toEqual(["1.4", "1.3", "1.2"]);
  });

  it("manages the size we generate for, and leaves other sizes of the same device alone", () => {
    const iphone = asc.FAMILIES.find((f) => f.id === "iphone")!;
    const sets = [{ displayType: "APP_IPHONE_65" }, { displayType: "APP_IPAD_PRO_3GEN_129" }, { displayType: "APP_IPHONE_67" }];
    const forward = asc.pickSet(sets, iphone);
    const backward = asc.pickSet([...sets].reverse(), iphone);
    expect(forward.managed?.displayType).toBe("APP_IPHONE_67");
    expect(backward.managed?.displayType).toBe("APP_IPHONE_67"); // same answer either way round
    expect(forward.others.map((s) => s.displayType)).toEqual(["APP_IPHONE_65"]);
  });

  it("still picks one predictably when the size we generate for is not there", () => {
    const iphone = asc.FAMILIES.find((f) => f.id === "iphone")!;
    const sets = [{ displayType: "APP_IPHONE_65" }, { displayType: "APP_IPHONE_61" }];
    expect(asc.pickSet(sets, iphone).managed?.displayType).toBe("APP_IPHONE_61");
    expect(asc.pickSet([...sets].reverse(), iphone).managed?.displayType).toBe("APP_IPHONE_61");
    expect(asc.pickSet([{ displayType: "APP_IPAD_PRO_3GEN_129" }], iphone).managed).toBeNull();
  });

  it("lets a version bounced for its metadata be sent again", () => {
    expect(asc.SUBMITTABLE).toContain("METADATA_REJECTED");
    expect(asc.SUBMITTABLE).not.toContain("WAITING_FOR_REVIEW");
    // Withdrawing and submitting must never both apply to one state, or withdraw could not
    // tell "already out of review" from "still in it".
    for (const state of asc.WITHDRAWABLE) expect(asc.SUBMITTABLE).not.toContain(state);
  });
});

describe("release script: release notes", () => {
  it("hands back the notes for the version they were written for", () => {
    expect(asc.notesFor("# 1.5\nA new icon.\n\nAnd a fix.", "1.5")).toBe("A new icon.\n\nAnd a fix.");
  });

  it("refuses notes written for another version instead of shipping them again", () => {
    expect(() => asc.notesFor("# 1.4\nThe Snowy Steamer opens on December 1st.", "1.5")).toThrow(/written for 1.4, not 1.5/);
  });

  it("refuses a file with no version line, an empty body, or no file at all", () => {
    expect(() => asc.notesFor("A new icon.", "1.5")).toThrow(/must start with a line naming its version/);
    expect(() => asc.notesFor("# 1.5\n\n", "1.5")).toThrow(/nothing under it/);
    expect(() => asc.notesFor(null, "1.5")).toThrow(/must start with/);
  });

  it("has notes committed that name a version", async () => {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(new URL("../store/metadata/whats-new.txt", import.meta.url), "utf8");
    expect(text.split("\n")[0]).toMatch(/^# \d+\.\d+/);
  });
});

describe("release script: signing in and arguments", () => {
  it("signs a token Apple's side can verify, good for under twenty minutes", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const now = Date.UTC(2026, 10, 19);
    const jwt = asc.makeToken({ keyId: "KEY123", issuerId: "issuer-uuid", privateKey: pem }, now);
    const [head, body, signature] = jwt.split(".") as [string, string, string];
    const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());
    expect(decode(head)).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    const claims = decode(body);
    expect(claims.iss).toBe("issuer-uuid");
    expect(claims.aud).toBe("appstoreconnect-v1");
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(20 * 60);
    expect(claims.iat).toBe(now / 1000);
    const ok = verify("sha256", Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
    expect(ok).toBe(true);
    expect(Buffer.from(signature, "base64url").length).toBe(64); // raw r||s, which is what JWT wants
  });

  it("reads the command line, and stops on anything it does not know", () => {
    expect(asc.parseArgs(["prepare", "--version", "1.5", "--build", "13", "--dry-run"])).toEqual({ command: "prepare", dryRun: true, version: "1.5", build: "13" });
    expect(asc.parseArgs(["status"])).toEqual({ command: "status", dryRun: false });
    expect(() => asc.parseArgs(["submit", "--force"])).toThrow(/Unknown argument/);
  });
});

describe("release script: the promotional line", () => {
  const evergreen = "Evergreen line.";
  const seasonal: SeasonalLine[] = [
    { from: { month: 10, day: 18 }, to: { month: 11, day: 1 }, text: "Spooky line." },
    { from: { month: 12, day: 1 }, to: { month: 1, day: 5 }, text: "Frosty line." },
  ];
  const on = (iso: string) => new Date(`${iso}T12:00:00Z`);

  it("is the seasonal line inside a window and the evergreen one outside", () => {
    expect(asc.promoFor(on("2026-11-20"), evergreen, seasonal)).toBe("Evergreen line.");
    expect(asc.promoFor(on("2026-11-30"), evergreen, seasonal)).toBe("Evergreen line.");
    expect(asc.promoFor(on("2026-12-01"), evergreen, seasonal)).toBe("Frosty line.");
    expect(asc.promoFor(on("2027-01-05"), evergreen, seasonal)).toBe("Frosty line."); // the far side of the new year
    expect(asc.promoFor(on("2027-01-06"), evergreen, seasonal)).toBe("Evergreen line.");
    expect(asc.promoFor(on("2027-10-18"), evergreen, seasonal)).toBe("Spooky line.");
  });

  it("goes back to evergreen by itself the day after a run ends", () => {
    // The Halloween line stayed up until 19 November because taking it down was a thing to
    // remember. Any run after the window now puts the evergreen line back.
    expect(asc.promoFor(on("2026-11-01"), evergreen, seasonal)).toBe("Spooky line.");
    expect(asc.promoFor(on("2026-11-02"), evergreen, seasonal)).toBe("Evergreen line.");
  });

  it("refuses a line the store would reject, and copes with nothing to say", () => {
    expect(() => asc.promoFor(on("2026-06-01"), "x".repeat(asc.PROMO_MAX + 1), [])).toThrow(/allows 170/);
    expect(asc.promoFor(on("2026-06-01"), null, null)).toBeNull();
    expect(asc.promoFor(on("2026-06-01"), evergreen, null)).toBe("Evergreen line.");
  });

  it("has committed lines that fit, and windows that match the game's own seasons", async () => {
    const { readFile } = await import("node:fs/promises");
    const { SERIES } = await import("../src/data/characters");
    const lines = JSON.parse(await readFile(new URL("../store/metadata/promotional-seasonal.json", import.meta.url), "utf8")) as SeasonalLine[];
    const evergreenText = (await readFile(new URL("../store/metadata/promotional-text.txt", import.meta.url), "utf8")).trim();
    expect(evergreenText.length).toBeGreaterThan(0);
    expect(evergreenText.length).toBeLessThanOrEqual(asc.PROMO_MAX);
    const seasons = SERIES.filter((s) => s.season);
    expect(lines.length).toBe(seasons.length); // a seasonal set with no line would open unannounced
    for (const s of seasons) {
      const line = lines.find((l) => l.series === s.id);
      expect(line, s.id).toBeDefined();
      expect(line!.from).toEqual(s.season!.from);
      expect(line!.to).toEqual(s.season!.to);
      expect(line!.text.length, s.id).toBeLessThanOrEqual(asc.PROMO_MAX);
    }
  });

  it("changes the live version and anything newer, never the ones it replaced", () => {
    const v = (name: string, state: string) => ({ name, state });
    const stateFn = (x: { state: string }) => x.state;
    const names = (list: { name: string }[]) => list.map((x) => x.name);
    // Old versions report the same state as the live one, so "live" is the newest of them.
    expect(names(asc.currentVersions([v("1.4", "READY_FOR_DISTRIBUTION"), v("1.3", "READY_FOR_DISTRIBUTION"), v("1.2", "READY_FOR_DISTRIBUTION")], stateFn))).toEqual(["1.4"]);
    expect(names(asc.currentVersions([v("1.5", "WAITING_FOR_REVIEW"), v("1.4", "READY_FOR_DISTRIBUTION"), v("1.3", "READY_FOR_DISTRIBUTION")], stateFn))).toEqual(["1.5", "1.4"]);
    expect(names(asc.currentVersions([v("1.0", "PREPARE_FOR_SUBMISSION")], stateFn))).toEqual(["1.0"]);
  });
});
