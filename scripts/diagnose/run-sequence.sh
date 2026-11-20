#!/bin/bash
# Install a series of builds over one another on a fresh iPhone simulator and report, after
# each, what the player sees and what is on disk.
#
# Usage: run-sequence.sh <runtime: latest | 27.0 | ...> <step> [<step> ...]
#   A step is the name of a folder under apps/ holding App.app, or WIPE, which deletes the
#   web view's storage the way a lost save would look to the app.
set -euo pipefail

want="$1"; shift
bundle=com.kendallcoding202.squishbox
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
mkdir -p shots

swiftc -O "$here/ocr.swift" -o "$work/ocr" 2>/dev/null || echo "(no screen reader on this runner; screenshots are uploaded instead)"

runtime=$(xcrun simctl list runtimes -j | WANT="$want" python3 -c '
import json, os, sys
want = os.environ["WANT"]
r = [x for x in json.load(sys.stdin)["runtimes"] if x.get("isAvailable") and x.get("platform") == "iOS"]
# Plain runtimes only: "iOS-27-2", not the single-device ones like "iOS-27-2-iPhone19-4".
r = [x for x in r if x["identifier"].rsplit(".", 1)[-1].count("-") == 2]
r.sort(key=lambda x: [int(p) for p in x["version"].split(".")])
if want != "latest":
    r = [x for x in r if x["version"] == want or x["version"].startswith(want + ".")]
print(r[-1]["identifier"] + " " + r[-1]["version"] + " " + r[-1].get("buildversion", ""))
')
echo "Simulator runtime: $runtime"
udid=$(xcrun simctl create upgrade-test "iPhone 17" "${runtime%% *}")
trap 'xcrun simctl delete "$udid" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b >/dev/null

step=0
for item in "$@"; do
  step=$((step + 1))
  echo
  if [ "$item" = "WIPE" ]; then
    data=$(xcrun simctl get_app_container "$udid" "$bundle" data)
    rm -rf "$data/Library/WebKit"
    echo "=== step $step: WIPED the web view's storage (the app is not running)"
    continue
  fi
  app="apps/$item/App.app"
  plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$app/Info.plist" 2>/dev/null || echo "?"; }
  echo "=== step $step: install and run $item  [$(plist CFBundleShortVersionString) ($(plist CFBundleVersion)), built with Xcode $(plist DTXcode), SDK $(plist DTSDKName) $(plist DTSDKBuild)]"
  xcrun simctl install "$udid" "$app"
  for launch in first second; do
    : > "$work/console.txt"
    # A PTY, so the app's output arrives line by line instead of dying in a buffer.
    xcrun simctl launch --console-pty "$udid" "$bundle" > "$work/console.txt" 2>&1 &
    console=$!
    marks="6 25"; if [ "$launch" = "second" ]; then marks="12"; fi
    waited=0
    for at in $marks; do
      sleep $((at - waited)); waited=$at
      shot="shots/$step-$item-$launch-${at}s.png"
      xcrun simctl io "$udid" screenshot "$shot" >/dev/null 2>&1 || true
      size=$(stat -f %z "$shot" 2>/dev/null || echo 0)
      seen="something is drawn"; if [ "$size" -lt 250000 ]; then seen="BLANK"; fi
      text=""; if [ -x "$work/ocr" ] && [ -f "$shot" ]; then text=$("$work/ocr" "$shot" 2>/dev/null | cut -c1-150 || true); fi
      echo "  $launch launch, ${at}s in: $seen ($size bytes) $text"
    done
    if [ "$launch" = "first" ]; then
      xcrun simctl spawn "$udid" defaults export "$bundle" - > "$work/prefs.plist" 2>/dev/null || : > "$work/prefs.plist"
    fi
    xcrun simctl terminate "$udid" "$bundle" >/dev/null 2>&1 || true
    kill "$console" >/dev/null 2>&1 || true
    wait "$console" 2>/dev/null || true
    echo "  what the $launch launch said:"
    grep -a "DIAG\|⚡️  \(WebView\|Loading\|JS Eval\|ERROR\|To Native\)" "$work/console.txt" | grep -av "To Native ->  Console\|TO JS" | cut -c1-230 | sed 's/^/    /' | head -n 30 || true
    if ! grep -aq "DIAG" "$work/console.txt"; then echo "    (the page never spoke: $(wc -c < "$work/console.txt" | tr -d ' ') bytes of console in all)"; tail -n 5 "$work/console.txt" | cut -c1-200 | sed 's/^/    | /'; fi
    echo "  WebKit and the app in the system log:"
    xcrun simctl spawn "$udid" log show --last 40s --style compact \
      --predicate '(process == "App" OR process BEGINSWITH "com.apple.WebKit") AND (messageType == error OR messageType == fault OR eventMessage CONTAINS[c] "crash" OR eventMessage CONTAINS[c] "unresponsive" OR eventMessage CONTAINS[c] "terminat")' 2>/dev/null \
      | grep -v "^Timestamp\\|^Filtering" | cut -c1-240 | head -n 12 | sed 's/^/    /' || true
    sleep 3
  done
  python3 "$here/dump-webview-storage.py" "$(xcrun simctl get_app_container "$udid" "$bundle" data)" "after $item" "$work/prefs.plist"
done
