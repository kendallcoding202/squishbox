#!/usr/bin/env python3
"""Generate the game's pictures with the OpenAI image API.

Reads art-work/jobs.json (written by build-jobs.mjs) and writes one PNG per job to
art-work/raw/<group>/<id>.png. Skips pictures that already exist, so a run that stops half way
is finished by running it again. --only redoes the named ones.

Every request sends a reference image from scripts/art/reference/ alongside the prompt, which
is what keeps 66 dumplings looking like one family.

The key comes from OPENAI_API_KEY. In a Claude cloud session it is added by the network proxy
instead, and the variable can be left unset.

Usage: python3 scripts/art/generate.py [--only dumplings/c01 boxes/sleigh ...] [--group dumplings]
                                       [--workers 5] [--quality high] [--model gpt-image-2.6-sunburst]
"""
import argparse, base64, json, os, sys, time, uuid, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
REF = os.path.join(ROOT, "scripts", "art", "reference")
WORK = os.path.join(ROOT, "art-work")


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    out = []
    for k, v in fields.items():
        out += [f"--{boundary}\r\n".encode(), f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode(), str(v).encode(), b"\r\n"]
    for k, path in files:
        out += [f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{k}"; filename="{os.path.basename(path)}"\r\nContent-Type: image/png\r\n\r\n'.encode(),
                open(path, "rb").read(), b"\r\n"]
    out.append(f"--{boundary}--\r\n".encode())
    return b"".join(out), f"multipart/form-data; boundary={boundary}"


def generate(job, model, quality):
    dest = os.path.join(WORK, "raw", job["group"], job["id"] + ".png")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    body, ctype = multipart(
        {"model": model, "prompt": job["prompt"], "size": job["size"], "quality": quality,
         "background": job["background"], "output_format": "png", "n": 1},
        [("image[]", os.path.join(REF, job["ref"]))])
    key = os.environ.get("OPENAI_API_KEY", "added-by-proxy")
    for attempt in range(4):
        req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=body,
                                     headers={"Content-Type": ctype, "Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(req, timeout=400) as r:
                d = json.load(r)
            open(dest, "wb").write(base64.b64decode(d["data"][0]["b64_json"]))
            with open(os.path.join(WORK, "log.jsonl"), "a") as log:
                log.write(json.dumps({"key": job["key"], "model": model, "quality": quality, "at": time.time(), "usage": d.get("usage")}) + "\n")
            return f"{job['key']}: ok"
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")[:300]
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(20 * (attempt + 1))
                continue
            return f"{job['key']}: FAILED HTTP {e.code} {text}"
        except Exception as e:  # network hiccup
            if attempt < 3:
                time.sleep(15 * (attempt + 1))
                continue
            return f"{job['key']}: FAILED {e}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--group", default=None)
    ap.add_argument("--workers", type=int, default=5)
    ap.add_argument("--quality", default="high")
    ap.add_argument("--model", default="gpt-image-2.6-sunburst")
    a = ap.parse_args()
    jobs = json.load(open(os.path.join(WORK, "jobs.json")))
    if a.only:
        jobs = [j for j in jobs if j["key"] in a.only]
    else:
        if a.group:
            jobs = [j for j in jobs if j["group"] == a.group]
        jobs = [j for j in jobs if not os.path.exists(os.path.join(WORK, "raw", j["group"], j["id"] + ".png"))]
    print(f"{len(jobs)} to make", flush=True)
    with ThreadPoolExecutor(a.workers) as pool:
        for line in pool.map(lambda j: generate(j, a.model, a.quality), jobs):
            print(line, flush=True)


if __name__ == "__main__":
    sys.exit(main())
