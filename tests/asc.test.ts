import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

// The release script is plain .mjs so CI can run it with nothing installed. Loaded through a
// variable so the type checker does not go looking for declarations it does not have.
const scriptPath = "../scripts/asc.mjs";
const asc = (await import(/* @vite-ignore */ scriptPath)) as {
  familyOf(displayType: string): { id: string } | null;
  orderFiles(names: string[], prefix: string): string[];
  setMatches(existing: { fileName: string; checksum: string }[], wanted: { fileName: string; checksum: string }[]): boolean;
  makeToken(c: { keyId: string; issuerId: string; privateKey: string }, now?: number): string;
  notesFor(text: string | null, version: string): string;
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
