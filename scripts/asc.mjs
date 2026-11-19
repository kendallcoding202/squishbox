#!/usr/bin/env node
/**
 * App Store Connect, from the command line and from CI.
 *
 *   node scripts/asc.mjs status
 *   node scripts/asc.mjs prepare --version 1.5 --build 13 [--dry-run]
 *   node scripts/asc.mjs submit  --version 1.5 [--dry-run]
 *   node scripts/asc.mjs withdraw --version 1.5 [--dry-run]
 *
 * `status` only reads. `prepare` makes a version ready to send: it creates the version
 * record if there is none, attaches the build, sets the release notes, and replaces the
 * screenshots with the set in store/screenshots/. `submit` sends it to review. They are
 * separate commands on purpose, so that everything can be looked at before the one step
 * that cannot be taken back.
 *
 * Why this exists: screenshots were skipped on two submissions in a row because uploading
 * them was a manual step somebody had to remember. The listing showed an app four releases
 * old for a month. Here they are part of `prepare`, not an extra.
 *
 * Credentials come from the environment and are never written anywhere:
 *   ASC_KEY_ID        the key's ID, e.g. BAZ8C58F2T
 *   ASC_ISSUER_ID     the issuer UUID from Users and Access > Integrations
 *   ASC_PRIVATE_KEY   the contents of the AuthKey_*.p8 file
 *   ASC_APP_ID        optional; defaults to Squishbox
 *
 * No dependencies: Node 22 has fetch and can sign ES256 itself.
 */
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.appstoreconnect.apple.com";
const DEFAULT_APP_ID = "6809239122";
const LOCALE = "en-US";

/** Which files in store/screenshots/ belong to which kind of screenshot set. */
export const FAMILIES = [
  { id: "iphone", prefix: "iphone69-", match: /IPHONE/, createAs: "APP_IPHONE_67" },
  { id: "ipad", prefix: "ipad13-", match: /IPAD/, createAs: "APP_IPAD_PRO_3GEN_129" },
];

/** The family a set belongs to, from Apple's display type name. Null for watch, TV and the rest. */
export function familyOf(displayType) {
  return FAMILIES.find((f) => f.match.test(displayType)) ?? null;
}

/**
 * The one set this script manages for a family, when a version holds several sizes of the
 * same device. It is the size we generate for; failing that, the first by name, so the
 * choice never depends on the order Apple happens to list them in. Any other size is left
 * alone — and reported, because an old set in a smaller size still shows on those devices.
 */
export function pickSet(sets, family) {
  const mine = sets.filter((s) => familyOf(s.displayType)?.id === family.id);
  const managed = mine.find((s) => s.displayType === family.createAs)
    ?? [...mine].sort((a, b) => a.displayType.localeCompare(b.displayType))[0]
    ?? null;
  return { managed, others: mine.filter((s) => s !== managed) };
}

/**
 * Order screenshot files the way they should appear in the store. The number in the name
 * is the position ("iphone69-10-x.png" comes after "iphone69-9-x.png"), which a plain
 * string sort gets wrong.
 */
export function orderFiles(names, prefix) {
  const position = (name) => Number.parseInt(name.slice(prefix.length), 10);
  return names
    .filter((n) => n.startsWith(prefix) && n.endsWith(".png") && Number.isFinite(position(n)))
    .sort((a, b) => position(a) - position(b) || a.localeCompare(b));
}

/**
 * Does a set in the store already hold exactly these files, in this order? Compared by
 * checksum as well as name, so regenerated screenshots under the same names still upload.
 */
export function setMatches(existing, wanted) {
  if (existing.length !== wanted.length) return false;
  return wanted.every((w, i) => existing[i].fileName === w.fileName && existing[i].checksum === w.checksum);
}

/** A signed token for the API. Apple refuses any that live longer than twenty minutes. */
export function makeToken({ keyId, issuerId, privateKey }, now = Date.now()) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const iat = Math.floor(now / 1000);
  const head = b64({ alg: "ES256", kid: keyId, typ: "JWT" });
  const body = b64({ iss: issuerId, iat, exp: iat + 15 * 60, aud: "appstoreconnect-v1" });
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), {
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363", // JWT wants the raw r||s pair, not the DER wrapper Node gives by default
  });
  return `${head}.${body}.${signature.toString("base64url")}`;
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command, dryRun: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--version") opts.version = rest[++i];
    else if (arg === "--build") opts.build = rest[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

// ---- talking to Apple ----

function credentials() {
  const keyId = process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;
  const privateKey = process.env.ASC_PRIVATE_KEY;
  const missing = Object.entries({ ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId, ASC_PRIVATE_KEY: privateKey })
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}. See docs/RELEASING.md.`);
  return { keyId, issuerId, privateKey };
}

let cachedToken = null;
function token() {
  // Mint a fresh one every ten minutes: a screenshot upload can outlast a single token.
  if (!cachedToken || Date.now() - cachedToken.at > 10 * 60 * 1000) {
    cachedToken = { value: makeToken(credentials()), at: Date.now() };
  }
  return cachedToken.value;
}

async function api(method, path, body) {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 600);
    try {
      detail = JSON.parse(text).errors.map((e) => `${e.status} ${e.code}: ${e.detail}`).join("; ");
    } catch { /* not JSON; show the raw text */ }
    throw new Error(`${method} ${path.split("?")[0]} failed: ${detail}`);
  }
  return text ? JSON.parse(text) : null;
}

const get = (path) => api("GET", path);

/** Every page of a list, because a version can hold more screenshots than one page returns. */
async function getAll(path) {
  const out = [];
  let next = path;
  while (next) {
    const page = await get(next);
    out.push(...page.data);
    next = page.links?.next ?? null;
  }
  return out;
}

/** States a version can be sent to review from: never sent, pulled back, or bounced. */
export const SUBMITTABLE = ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"];

/** States a version can be pulled back out of review from. */
export const WITHDRAWABLE = ["WAITING_FOR_REVIEW", "IN_REVIEW"];

/** How long to wait between looks while Apple finishes something. */
const POLL_MS = Number(process.env.ASC_POLL_MS ?? 5000);

const stateOf = (version) => version.attributes.appVersionState ?? version.attributes.appStoreState;

/** Newest first. Apple does not promise an order, so sort rather than trust the first item. */
export function newestFirst(list) {
  return [...list].sort((a, b) => String(b.attributes.createdDate ?? "").localeCompare(String(a.attributes.createdDate ?? "")));
}

async function versions(appId) {
  return newestFirst(await getAll(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`));
}

async function localization(versionId) {
  const all = await getAll(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`);
  return all.find((l) => l.attributes.locale === LOCALE) ?? all[0] ?? null;
}

async function screenshotSets(localizationId) {
  const sets = await getAll(`/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=50`);
  const out = [];
  for (const set of sets) {
    const shots = await getAll(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
    out.push({
      id: set.id,
      displayType: set.attributes.screenshotDisplayType,
      shots: shots.map((s) => ({
        id: s.id,
        fileName: s.attributes.fileName,
        checksum: s.attributes.sourceFileChecksum,
        state: s.attributes.assetDeliveryState?.state,
      })),
    });
  }
  return out;
}

async function localScreenshots() {
  const dir = join(ROOT, "store", "screenshots");
  const names = await readdir(dir);
  const out = {};
  for (const family of FAMILIES) {
    out[family.id] = [];
    for (const fileName of orderFiles(names, family.prefix)) {
      const path = join(dir, fileName);
      const bytes = await readFile(path);
      out[family.id].push({ fileName, path, size: (await stat(path)).size, checksum: createHash("md5").update(bytes).digest("hex") });
    }
  }
  return out;
}

async function readText(name) {
  try {
    return (await readFile(join(ROOT, "store", "metadata", name), "utf8")).trim();
  } catch {
    return null;
  }
}

/**
 * The release notes for one version, out of a file whose first line says which version it
 * was written for ("# 1.5"). Stale metadata is the mistake this project keeps making — the
 * listing said "open until November 1st" for eighteen days into November — so notes written
 * for another version are refused rather than quietly reused.
 */
export function notesFor(text, version) {
  const [first, ...rest] = (text ?? "").split("\n");
  const marked = /^#\s*(\S+)\s*$/.exec(first ?? "");
  if (!marked) throw new Error('store/metadata/whats-new.txt must start with a line naming its version, like "# 1.5"');
  if (marked[1] !== version) throw new Error(`store/metadata/whats-new.txt was written for ${marked[1]}, not ${version}. Write this version's notes first.`);
  const notes = rest.join("\n").trim();
  if (!notes) throw new Error("store/metadata/whats-new.txt has a version line and nothing under it");
  return notes;
}

// ---- commands ----

async function status(appId) {
  const app = await get(`/v1/apps/${appId}`);
  console.log(`${app.data.attributes.name} (${app.data.attributes.bundleId})\n`);

  const all = await versions(appId);
  console.log("Versions");
  for (const v of all.slice(0, 6)) console.log(`  ${v.attributes.versionString.padEnd(8)} ${stateOf(v)}`);

  const builds = await get(`/v1/builds?filter[app]=${appId}&sort=-uploadedDate&limit=6&include=preReleaseVersion`);
  const pre = new Map((builds.included ?? []).map((p) => [p.id, p.attributes.version]));
  console.log("\nBuilds, newest first");
  for (const b of builds.data) {
    const marketing = pre.get(b.relationships?.preReleaseVersion?.data?.id) ?? "?";
    console.log(`  ${marketing} (${b.attributes.version})  ${b.attributes.processingState}  uploaded ${b.attributes.uploadedDate}`);
  }

  const newest = all[0];
  if (!newest) return;
  const loc = await localization(newest.id);
  console.log(`\nNewest version ${newest.attributes.versionString}, ${loc?.attributes.locale ?? "no localization"}`);
  if (!loc) return;
  console.log(`  What's New: ${loc.attributes.whatsNew ? `${loc.attributes.whatsNew.length} characters` : "empty"}`);
  console.log(`  Promotional text: ${loc.attributes.promotionalText ?? "empty"}`);
  const local = await localScreenshots();
  const sets = await screenshotSets(loc.id);
  const managedIds = new Set(FAMILIES.map((f) => pickSet(sets, f).managed?.id));
  for (const set of sets) {
    const family = familyOf(set.displayType);
    let note = "";
    if (family && managedIds.has(set.id)) note = setMatches(set.shots, local[family.id]) ? ", same as store/screenshots/" : ", DIFFERENT from store/screenshots/";
    else if (family) note = ", another size of the same device: NOT managed by this script, check it is not showing old screenshots";
    console.log(`  ${set.displayType}: ${set.shots.length} screenshots${note}`);
    for (const s of set.shots) console.log(`    ${s.fileName}  ${s.state}`);
  }
}

async function uploadScreenshot(setId, file) {
  const reserved = await api("POST", "/v1/appScreenshots", {
    data: {
      type: "appScreenshots",
      attributes: { fileName: file.fileName, fileSize: file.size },
      relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } } },
    },
  });
  const bytes = await readFile(file.path);
  for (const op of reserved.data.attributes.uploadOperations) {
    const res = await fetch(op.url, {
      method: op.method,
      headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])),
      body: bytes.subarray(op.offset, op.offset + op.length),
    });
    if (!res.ok) throw new Error(`Uploading ${file.fileName} failed with ${res.status}`);
  }
  await api("PATCH", `/v1/appScreenshots/${reserved.data.id}`, {
    data: { type: "appScreenshots", id: reserved.data.id, attributes: { uploaded: true, sourceFileChecksum: file.checksum } },
  });
  return reserved.data.id;
}

/** Wait until Apple has finished processing every screenshot in a set, or say which one failed. */
async function waitForProcessing(setId, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const shots = await getAll(`/v1/appScreenshotSets/${setId}/appScreenshots?limit=50`);
    const states = shots.map((s) => s.attributes.assetDeliveryState?.state);
    const failed = shots.find((s) => s.attributes.assetDeliveryState?.state === "FAILED");
    if (failed) throw new Error(`${label}: Apple rejected ${failed.attributes.fileName}: ${JSON.stringify(failed.attributes.assetDeliveryState.errors)}`);
    if (states.every((s) => s === "COMPLETE")) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`${label}: screenshots were still processing after five minutes`);
}

async function replaceScreenshots(loc, dryRun) {
  const local = await localScreenshots();
  const sets = await screenshotSets(loc.id);
  for (const family of FAMILIES) {
    const wanted = local[family.id];
    if (wanted.length === 0) {
      console.log(`  ${family.id}: no files in store/screenshots/, left alone`);
      continue;
    }
    const picked = pickSet(sets, family);
    let set = picked.managed;
    for (const other of picked.others) console.log(`  ${family.id}: ${other.displayType} also exists with ${other.shots.length} screenshots and is left alone`);
    if (set && setMatches(set.shots, wanted)) {
      console.log(`  ${family.id}: already the ${wanted.length} in store/screenshots/, nothing to do`);
      continue;
    }
    console.log(`  ${family.id}: replacing ${set ? set.shots.length : 0} with ${wanted.length} (${wanted.map((w) => w.fileName).join(", ")})`);
    if (dryRun) continue;
    if (!set) {
      const created = await api("POST", "/v1/appScreenshotSets", {
        data: {
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: family.createAs },
          relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: loc.id } } },
        },
      });
      set = { id: created.data.id, displayType: family.createAs, shots: [] };
    }
    // Delete everything first. Uploading over the old set by position is how a stale frame
    // ends up sitting under the wrong caption.
    for (const shot of set.shots) await api("DELETE", `/v1/appScreenshots/${shot.id}`);
    const ids = [];
    for (const file of wanted) ids.push(await uploadScreenshot(set.id, file));
    await waitForProcessing(set.id, family.id);
    await api("PATCH", `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, {
      data: ids.map((id) => ({ type: "appScreenshots", id })),
    });
    // Read it back. Writes to this app have reported success and then not been there.
    const after = (await screenshotSets(loc.id)).find((s) => s.id === set.id);
    if (!after || !setMatches(after.shots, wanted)) throw new Error(`${family.id}: the store does not show the uploaded set after writing it`);
    console.log(`  ${family.id}: ${wanted.length} uploaded, in order, confirmed on a re-read`);
  }
}

async function prepare(appId, { version, build, dryRun }) {
  if (!version || !build) throw new Error("prepare needs --version and --build");
  const say = dryRun ? "would" : "did";
  notesFor(await readText("whats-new.txt"), version); // fail on stale notes before the first write

  const all = await versions(appId);
  let record = all.find((v) => v.attributes.versionString === version);
  if (record) {
    console.log(`Version ${version} exists: ${stateOf(record)}`);
    // Apple locks a version while it is in review. Say so here rather than fail on the first write.
    if (!dryRun && WITHDRAWABLE.includes(stateOf(record))) throw new Error(`Version ${version} is in review and cannot be changed. Run withdraw first if you mean to swap its build.`);
  } else {
    const inFlight = all.find((v) => ["WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE"].includes(stateOf(v)));
    if (inFlight) throw new Error(`Version ${inFlight.attributes.versionString} is ${stateOf(inFlight)}. Apple allows one version in flight at a time; wait for it or deal with it first.`);
    console.log(`Version ${version}: ${say} create it, releasing automatically on approval`);
    if (!dryRun) {
      const created = await api("POST", "/v1/appStoreVersions", {
        data: {
          type: "appStoreVersions",
          attributes: { platform: "IOS", versionString: version, releaseType: "AFTER_APPROVAL" },
          relationships: { app: { data: { type: "apps", id: appId } } },
        },
      });
      record = created.data;
    }
  }

  const found = await get(`/v1/builds?filter[app]=${appId}&filter[version]=${encodeURIComponent(build)}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}&limit=5`);
  const candidate = found.data[0];
  if (!candidate) throw new Error(`No build ${version} (${build}) has been uploaded. Run the "iOS release" workflow first.`);
  if (candidate.attributes.processingState !== "VALID") throw new Error(`Build ${version} (${build}) is ${candidate.attributes.processingState}; it can be attached once Apple has finished processing it.`);
  console.log(`Build ${version} (${build}): found, processed`);

  if (!record) {
    console.log("Dry run stops here: the release notes and screenshots hang off a version record that does not exist yet.");
    return;
  }
  const current = await get(`/v1/appStoreVersions/${record.id}/build`).catch(() => null);
  if (!dryRun && current?.data?.id !== candidate.id) {
    await api("PATCH", `/v1/appStoreVersions/${record.id}/relationships/build`, { data: { type: "builds", id: candidate.id } });
  }

  const loc = await localization(record.id);
  if (!loc) throw new Error(`Version ${version} has no localization to put release notes on`);
  const attributes = {};
  const whatsNew = notesFor(await readText("whats-new.txt"), version);
  const promo = await readText("promotional-text.txt");
  if (whatsNew !== loc.attributes.whatsNew) attributes.whatsNew = whatsNew;
  if (promo && promo !== loc.attributes.promotionalText) attributes.promotionalText = promo;
  for (const [key, value] of Object.entries(attributes)) console.log(`${key}: ${say} set (${value.length} characters)`);
  if (!dryRun && Object.keys(attributes).length) {
    await api("PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: "appStoreVersionLocalizations", id: loc.id, attributes } });
  }

  const notes = await readText("review-notes.txt");
  if (notes) {
    const detail = await get(`/v1/appStoreVersions/${record.id}/appStoreReviewDetail`).catch(() => null);
    if (!detail?.data) console.log("Review notes: this version has no review detail yet; set the contact in App Store Connect once, then run again");
    else if (detail.data.attributes.notes !== notes) {
      console.log(`Review notes: ${say} set (${notes.length} characters)`);
      if (!dryRun) await api("PATCH", `/v1/appStoreReviewDetails/${detail.data.id}`, { data: { type: "appStoreReviewDetails", id: detail.data.id, attributes: { notes } } });
    }
  }

  console.log("Screenshots");
  await replaceScreenshots(loc, dryRun);
  console.log(dryRun ? "\nDry run: nothing was changed." : `\nVersion ${version} is ready. Check it, then run submit.`);
}

async function submit(appId, { version, dryRun }) {
  if (!version) throw new Error("submit needs --version");
  const record = (await versions(appId)).find((v) => v.attributes.versionString === version);
  if (!record) throw new Error(`There is no version ${version}. Run prepare first.`);
  if (!SUBMITTABLE.includes(stateOf(record))) {
    throw new Error(`Version ${version} is ${stateOf(record)}, which is not a state it can be submitted from.`);
  }
  const attached = await get(`/v1/appStoreVersions/${record.id}/build`).catch(() => null);
  if (!attached?.data) throw new Error(`Version ${version} has no build attached. Run prepare first.`);

  // The last gate before review. A prepare that died half way through its uploads leaves a
  // set with holes in it, and the old screenshots have gone out on two submissions already.
  const loc = await localization(record.id);
  const local = await localScreenshots();
  const sets = loc ? await screenshotSets(loc.id) : [];
  for (const family of FAMILIES) {
    if (local[family.id].length === 0) continue;
    const set = pickSet(sets, family).managed;
    if (!set || !setMatches(set.shots, local[family.id]) || set.shots.some((shot) => shot.state !== "COMPLETE")) {
      throw new Error(`The ${family.id} screenshots on version ${version} are not the set in store/screenshots/. Run prepare again before submitting.`);
    }
  }
  if (!loc?.attributes.whatsNew) throw new Error(`Version ${version} has no release notes. Run prepare first.`);
  console.log(`Version ${version} with build ${attached.data.attributes.version}: ${dryRun ? "would submit" : "submitting"} for review`);
  if (dryRun) return;

  // Reuse a submission that was started and never sent, rather than piling up a second one.
  const open = await get(`/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=5`);
  let submission = open.data[0];
  if (!submission) {
    submission = (await api("POST", "/v1/reviewSubmissions", {
      data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: { data: { type: "apps", id: appId } } } },
    })).data;
  }
  const items = await getAll(`/v1/reviewSubmissions/${submission.id}/items?limit=50`);
  if (items.length === 0) {
    await api("POST", "/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
          appStoreVersion: { data: { type: "appStoreVersions", id: record.id } },
        },
      },
    });
  }
  await api("PATCH", `/v1/reviewSubmissions/${submission.id}`, { data: { type: "reviewSubmissions", id: submission.id, attributes: { submitted: true } } });
  const after = (await versions(appId)).find((v) => v.id === record.id);
  console.log(`Submitted. Version ${version} is now ${stateOf(after)}. Review submission ${submission.id}.`);
}

/**
 * Take a version back out of the review queue, so its build can be swapped. It loses its
 * place: review starts again from the next submit. Waits until Apple has finished letting
 * go, because a new submission is refused while the old one is still being cancelled.
 */
async function withdraw(appId, { version, dryRun }) {
  if (!version) throw new Error("withdraw needs --version");
  const record = (await versions(appId)).find((v) => v.attributes.versionString === version);
  if (!record) throw new Error(`There is no version ${version}.`);
  if (SUBMITTABLE.includes(stateOf(record))) {
    console.log(`Version ${version} is ${stateOf(record)}: not in review, nothing to withdraw.`);
    return;
  }
  if (!WITHDRAWABLE.includes(stateOf(record))) throw new Error(`Version ${version} is ${stateOf(record)}, which cannot be withdrawn.`);
  const open = await get(`/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=IOS&filter[state]=WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES&limit=5`);
  const submission = open.data[0];
  if (!submission) throw new Error(`Version ${version} is ${stateOf(record)} but no open review submission was found for it.`);
  console.log(`Version ${version} is ${stateOf(record)}: ${dryRun ? "would withdraw" : "withdrawing"} review submission ${submission.id}`);
  if (dryRun) return;
  await api("PATCH", `/v1/reviewSubmissions/${submission.id}`, { data: { type: "reviewSubmissions", id: submission.id, attributes: { canceled: true } } });
  for (let attempt = 0; attempt < 36; attempt++) {
    const now = (await versions(appId)).find((v) => v.id === record.id);
    if (SUBMITTABLE.includes(stateOf(now))) {
      console.log(`Withdrawn. Version ${version} is now ${stateOf(now)}.`);
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Asked Apple to withdraw version ${version}, but three minutes later it had still not left review. Check App Store Connect before doing anything else.`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const appId = process.env.ASC_APP_ID || DEFAULT_APP_ID;
  if (opts.command === "status") return status(appId);
  if (opts.command === "prepare") return prepare(appId, opts);
  if (opts.command === "submit") return submit(appId, opts);
  if (opts.command === "withdraw") return withdraw(appId, opts);
  throw new Error("Usage: node scripts/asc.mjs status | prepare --version V --build N [--dry-run] | submit --version V [--dry-run] | withdraw --version V [--dry-run]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
  });
}
