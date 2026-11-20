#!/usr/bin/env node
// Make a test build say what it sees, for the upgrade test only. Never used on a release.
//
// Puts a small script at the top of the page that reports, through the console, whether the
// page started, what local storage holds and how long it took to answer, any script error,
// and what is on screen a little later. With --seed <save.json> it also writes a known save
// the first time it runs, standing in for a collection somebody has played.
//
// With --blind the page is also made unable to read its save back: local storage answers
// "nothing here" for the save while the file on disk still holds it. That is the failure the
// fix exists for, reproduced on demand.
//
// Usage: node probe-build.mjs <dist/index.html> [--seed <save.json>] [--blind]
import { readFileSync, writeFileSync } from "node:fs";

const [html, ...rest] = process.argv.slice(2);
const seedFile = rest.includes("--seed") ? rest[rest.indexOf("--seed") + 1] : null;
const blind = rest.includes("--blind");

function probe(blind) {
  var t0 = Date.now();
  var reallyGet = Storage.prototype.getItem;
  if (blind) {
    Storage.prototype.getItem = function (k) { return k === "squishbox.save.v1" ? null : reallyGet.call(this, k); };
  }
  function log(m) { try { console.log("DIAG " + (Date.now() - t0) + "ms " + m); } catch (e) { /* nowhere to say it */ } }
  log("page start " + location.href);
  window.addEventListener("error", function (e) {
    var t = e.target || {};
    log("ERROR " + (e.message || "") + " @" + (e.filename || "") + ":" + (e.lineno || "") + " target=" + (t.src || t.href || ""));
  }, true);
  window.addEventListener("unhandledrejection", function (e) { log("REJECTION " + ((e.reason && e.reason.message) || e.reason)); });
  function sum(raw) {
    if (!raw) return "none";
    try {
      var s = JSON.parse(raw), n = 0;
      for (var k in s.inventory) n += s.inventory[k];
      return "coins=" + s.coins + " dumplings=" + n + " onboarded=" + s.onboarded + " rev=" + s.rev;
    } catch (e) { return "unparseable, " + raw.length + " characters"; }
  }
  // What the phone's own copy holds, asked the same way the app asks.
  function vault(tag) {
    var cap = window.Capacitor;
    if (!cap || !cap.nativePromise) { log(tag + " vault: no native bridge"); return; }
    ["save", "preflight", "snapshot"].forEach(function (name) {
      cap.nativePromise("Preferences", "get", { key: "squishbox." + name }).then(function (r) {
        var v = r && r.value, said = "none";
        if (v && name === "save") said = sum(v);
        if (v && name === "preflight") { try { said = JSON.parse(v).map(sum).join(" ; "); } catch (e) { said = "unparseable"; } }
        if (v && name === "snapshot") { try { var p = JSON.parse(v); said = "taken by " + p.build + ": " + sum(p.raw); } catch (e) { said = "unparseable"; } }
        log(tag + " vault " + name + ": " + said);
      }, function (e) { log(tag + " vault " + name + ": not available (" + ((e && e.message) || e) + ")"); });
    });
  }
  function ls(tag) {
    try {
      var a = Date.now();
      var raw = reallyGet.call(localStorage, "squishbox.save.v1");
      var took = Date.now() - a;
      log(tag + " localStorage (" + took + "ms, " + localStorage.length + " keys" + (blind ? ", hidden from the app" : "") + "): " + sum(raw));
    } catch (e) { log(tag + " localStorage THREW " + e); }
  }
  ls("at start");
  function dom(tag) {
    var app = document.getElementById("app");
    log(tag + " screen: " + (app ? app.childElementCount : "no #app") + " children, welcome=" + !!document.querySelector(".overlay") +
      ", text=" + (document.body ? document.body.innerText.replace(/\s+/g, " ").slice(0, 80) : ""));
  }
  [300, 2000, 6000, 15000].forEach(function (ms) { setTimeout(function () { ls("at " + ms + "ms"); dom("at " + ms + "ms"); }, ms); });
  setTimeout(function () { vault("at 4000ms"); }, 4000);
}

let script = "";
if (seedFile) {
  const save = JSON.stringify(JSON.parse(readFileSync(seedFile, "utf8")));
  script += `(function(){var K="squishbox.save.v1";if(!localStorage.getItem(K))localStorage.setItem(K,${JSON.stringify(save)});localStorage.setItem("squishbox.test.marker","written by the old build");})();`;
}
script += `(${probe.toString()})(${blind});`;
const page = readFileSync(html, "utf8");
if (!page.includes("<head>")) throw new Error("no <head> in " + html);
writeFileSync(html, page.replace("<head>", "<head><script>" + script + "</script>"));
console.log(["probed", seedFile && "seeded", blind && "blind"].filter(Boolean).join(", "), html);
