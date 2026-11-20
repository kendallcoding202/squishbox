#!/usr/bin/env python3
"""Print what a simulator app's web view has saved to disk.

Used by the "iOS upgrade test" workflow to answer one question: after installing a new build
over an old one, is the save still where the app can read it? Lists every file under the
app's WebKit folder and decodes the game's save out of whichever one holds it.
"""
import json, os, sqlite3, sys

root = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else ""
KEY = "squishbox.save.v1"
print(f"--- {label}: {root}")
found = 0
for base, _dirs, files in os.walk(os.path.join(root, "Library")):
    for name in files:
        path = os.path.join(base, name)
        rel = os.path.relpath(path, root)
        if "WebKit" not in rel and "Preferences" not in rel:
            continue
        print(f"  {os.path.getsize(path):>9}  {rel}")
        if not (name.endswith(".sqlite3") or name.endswith(".localstorage") or name.endswith(".sqlite")):
            continue
        try:
            db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
            rows = db.execute("SELECT key, value FROM ItemTable").fetchall()
        except Exception as exc:  # not a local-storage database
            continue
        for key, value in rows:
            text = value.decode("utf-16-le", "replace") if isinstance(value, (bytes, bytearray)) else str(value)
            if key == KEY:
                found += 1
                save = json.loads(text)
                buddy = save.get("buddy") or {}
                print(f"    SAVE: coins={save.get('coins')} dumplings={sum(save.get('inventory', {}).values())} kinds={len(save.get('inventory', {}))} "
                      f"onboarded={save.get('onboarded')} buddy={buddy.get('characterId')} visits={buddy.get('visits')} "
                      f"has_1_4_fields={'wanders' in buddy} boxesOpened={save.get('stats', {}).get('boxesOpened')}")
            else:
                print(f"    other key: {key} = {text[:60]}")
print(f"  => {found} copy/copies of the save on disk")
