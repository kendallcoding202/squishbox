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
  xcrun simctl launch "$udid" "$bundle" >/dev/null
  sleep 20
  shot="shots/$step-$item.png"
  xcrun simctl io "$udid" screenshot "$shot" >/dev/null 2>&1 || true
  if [ -x "$work/ocr" ] && [ -f "$shot" ]; then echo "  ON SCREEN: $("$work/ocr" "$shot" || true)"; fi
  xcrun simctl spawn "$udid" defaults export "$bundle" - > "$work/prefs.plist" 2>/dev/null || : > "$work/prefs.plist"
  xcrun simctl terminate "$udid" "$bundle" >/dev/null 2>&1 || true
  sleep 4
  python3 "$here/dump-webview-storage.py" "$(xcrun simctl get_app_container "$udid" "$bundle" data)" "after $item" "$work/prefs.plist"
done
