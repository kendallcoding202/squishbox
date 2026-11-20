#!/usr/bin/env python3
"""Print what a simulator app has saved: the web view's local storage and the phone's own copy.

Used by the "iOS upgrade test" workflow to answer one question: after installing a new build
over an old one, is the save still where the app can read it? Decodes the game's save out of
every local-storage database under the app's WebKit folder, so that two copies in two places
(which is what a change of storage location looks like) both show up, and reads the backup
the app keeps in its preferences.

Usage: dump-webview-storage.py <app data container> [label] [exported preferences plist]
"""
import json, os, plistlib, sqlite3, sys

root = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else ""
prefs = sys.argv[3] if len(sys.argv) > 3 else ""
KEY = "squishbox.save.v1"


def describe(text):
    save = json.loads(text)
    buddy = save.get("buddy") or {}
    return (f"coins={save.get('coins')} dumplings={sum(save.get('inventory', {}).values())} kinds={len(save.get('inventory', {}))} "
            f"onboarded={save.get('onboarded')} buddy={buddy.get('characterId')} rev={save.get('rev')} "
            f"boxesOpened={save.get('stats', {}).get('boxesOpened')}")


print(f"  --- {label}")
found = 0
for base, _dirs, files in os.walk(os.path.join(root, "Library")):
    for name in files:
        path = os.path.join(base, name)
        rel = os.path.relpath(path, root)
        if "WebKit" not in rel:
            continue
        if not (name.endswith(".sqlite3") or name.endswith(".localstorage") or name.endswith(".sqlite")):
            continue
        try:
            db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
            rows = db.execute("SELECT key, value FROM ItemTable").fetchall()
        except Exception:  # not a local-storage database
            continue
        print(f"  {os.path.getsize(path):>8}  {rel}")
        for key, value in rows:
            text = value.decode("utf-16-le", "replace") if isinstance(value, (bytes, bytearray)) else str(value)
            if key == KEY:
                found += 1
                try:
                    print(f"    WEB VIEW SAVE: {describe(text)}")
                except Exception:
                    print(f"    WEB VIEW SAVE: unreadable, {len(text)} characters")
            else:
                print(f"    other key: {key} = {text[:60]}")
print(f"  => {found} copy/copies of the save in web view storage")

if prefs and os.path.exists(prefs) and os.path.getsize(prefs):
    try:
        with open(prefs, "rb") as fh:
            values = plistlib.load(fh)
    except Exception as exc:
        values = {}
        print(f"  (preferences could not be read: {exc})")
    save = values.get("CapacitorStorage.squishbox.save")
    snap = values.get("CapacitorStorage.squishbox.snapshot")
    aside = values.get("CapacitorStorage.squishbox.unreadable")
    print(f"  PHONE'S COPY: {describe(save) if save else 'none'}")
    if snap:
        try:
            s = json.loads(snap)
            print(f"  SNAPSHOT: taken by {s.get('build')}: {describe(s.get('raw'))}")
        except Exception:
            print("  SNAPSHOT: unreadable")
    if aside:
        print(f"  SET ASIDE: {len(aside)} characters the app could not read")
else:
    print("  PHONE'S COPY: none (no preferences written)")
