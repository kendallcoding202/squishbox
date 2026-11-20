#!/usr/bin/env node
// Make a test build say what it sees, for the upgrade test only. Never used on a release.
//
// Puts a small script at the top of the page that reports, through the console, whether the
// page started, what local storage holds and how long it took to answer, any script error,
// and what is on screen a little later. With --seed <save.json> it also writes a known save
// the first time it runs, standing in for a collection somebody has played.
//
// Usage: node probe-build.mjs <dist/index.html> [--seed <save.json>]
import { readFileSync, writeFileSync } from "node:fs";

const [html, ...rest] = process.argv.slice(2);
const seedFile = rest[0] === "--seed" ? rest[1] : null;

function probe() {
  var t0 = Date.now();
  function log(m) { try { console.log("DIAG " + (Date.now() - t0) + "ms " + m); } catch (e) { /* nowhere to say it */ } }
  log("page start " + location.href);
  window.addEventListener("error", function (e) {
    var t = e.target || {};
    log("ERROR " + (e.message || "") + " @" + (e.filename || "") + ":" + (e.lineno || "") + " target=" + (t.src || t.href || ""));
  }, true);
  window.addEventListener("unhandledrejection", function (e) { log("REJECTION " + ((e.reason && e.reason.message) || e.reason)); });
  function ls(tag) {
    try {
      var a = Date.now();
      var raw = localStorage.getItem("squishbox.save.v1");
      var took = Date.now() - a;
      var info = "none";
      if (raw) {
        try {
          var s = JSON.parse(raw), n = 0;
          for (var k in s.inventory) n += s.inventory[k];
          info = "coins=" + s.coins + " dumplings=" + n + " onboarded=" + s.onboarded + " rev=" + s.rev;
        } catch (e) { info = "unparseable, " + raw.length + " characters"; }
      }
      log(tag + " localStorage (" + took + "ms, " + localStorage.length + " keys): " + info);
    } catch (e) { log(tag + " localStorage THREW " + e); }
  }
  ls("at start");
  function dom(tag) {
    var app = document.getElementById("app");
    log(tag + " screen: " + (app ? app.childElementCount : "no #app") + " children, welcome=" + !!document.querySelector(".overlay") +
      ", text=" + (document.body ? document.body.innerText.replace(/\s+/g, " ").slice(0, 80) : ""));
  }
  [300, 2000, 6000, 15000].forEach(function (ms) { setTimeout(function () { ls("at " + ms + "ms"); dom("at " + ms + "ms"); }, ms); });
}

let script = "";
if (seedFile) {
  const save = JSON.stringify(JSON.parse(readFileSync(seedFile, "utf8")));
  script += `(function(){var K="squishbox.save.v1";if(!localStorage.getItem(K))localStorage.setItem(K,${JSON.stringify(save)});localStorage.setItem("squishbox.test.marker","written by the old build");})();`;
}
script += `(${probe.toString()})();`;
const page = readFileSync(html, "utf8");
if (!page.includes("<head>")) throw new Error("no <head> in " + html);
writeFileSync(html, page.replace("<head>", "<head><script>" + script + "</script>"));
console.log(seedFile ? "probed and seeded" : "probed", html);
