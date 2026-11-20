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
  probed=yes; grep -q "DIAG" "$app/public/index.html" || probed=no
  for launch in first second; do
    # Hosted simulators are slow and sometimes never start the page at all. Wait for the page
    # to report rather than for a number of seconds, and launch again if it never does, so
    # that a stalled simulator is reported as a stall and not mistaken for a result.
    spoke=no
    for attempt in 1 2 3; do
      : > "$work/console.txt"
      # A PTY, so the app's output arrives line by line instead of dying in a buffer.
      xcrun simctl launch --console-pty "$udid" "$bundle" > "$work/console.txt" 2>&1 &
      console=$!
      waited=0
      while [ "$waited" -lt 75 ]; do
        if grep -aq "DIAG.*at 2000ms screen\|Welcome\|WebView loaded" "$work/console.txt" && { grep -aq "DIAG.*at 2000ms screen" "$work/console.txt" || [ "$probed" = "no" ]; }; then spoke=yes; break; fi
        sleep 3; waited=$((waited + 3))
      done
      if [ "$spoke" = "yes" ]; then break; fi
      echo "  $launch launch, attempt $attempt: the page had not started after ${waited}s ($(grep -ac 'process terminated' "$work/console.txt") web view process terminations); launching again"
      xcrun simctl terminate "$udid" "$bundle" >/dev/null 2>&1 || true
      kill "$console" >/dev/null 2>&1 || true
      wait "$console" 2>/dev/null || true
      sleep 5
    done
    sleep 6 # long enough for the phone's copy to be read and reported
    shot="shots/$step-$item-$launch.png"
    xcrun simctl io "$udid" screenshot "$shot" >/dev/null 2>&1 || true
    text=""; if [ -x "$work/ocr" ] && [ -f "$shot" ]; then text=$("$work/ocr" "$shot" 2>/dev/null | cut -c1-110 || true); fi
    echo "  $launch launch (page started: $spoke, after ${waited}s): on screen: $text"
    xcrun simctl terminate "$udid" "$bundle" >/dev/null 2>&1 || true
    kill "$console" >/dev/null 2>&1 || true
    wait "$console" 2>/dev/null || true
    grep -a "DIAG" "$work/console.txt" | grep -a "at start\|at 2000ms screen\|vault\|ERROR\|REJECTION\|THREW" | sed 's/.*DIAG /    /' | cut -c1-200 | head -n 12 || true
    sleep 6
  done
  data=$(xcrun simctl get_app_container "$udid" "$bundle" data)
  sleep 4 # preferences reach the disk a moment after the app has gone
  python3 "$here/dump-webview-storage.py" "$data" "after $item" "$data/Library/Preferences/$bundle.plist"
done
