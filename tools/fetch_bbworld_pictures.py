"""Import beatboxer photos from beatbox.world (used with the site creators' OK).
Usage: python fetch_bbworld_pictures.py <project_dir>

Gentle by design (their server is small):
- reads only the 27 A-Z listing pages, which already carry every beatboxer's photo URL, one request at a time
  with a pause between them; profile pages and /og/ images are never requested
- photos come from their image CDN, again one at a time with a short pause
- photos already saved are skipped, so re-running only fetches what's new
Matches by name/alias and checks the country when both sides have one.
Saves pictures/<id>.jpg (max 640 px) and data/pictures.json (with the profile it came from).
"""
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
import html, io, json, os, re, sys, time, unicodedata, urllib.request
from PIL import Image

root = sys.argv[1]
data = os.path.join(root, "data")
pic_dir = os.path.join(root, "pictures")
os.makedirs(pic_dir, exist_ok=True)
UA = {"User-Agent": "BeatboxWorldSim/1.0 (personal game; low-rate picture import)"}
SITE = "https://beatbox.world"
LETTERS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + ["%23"]

people = json.load(open(os.path.join(data, "beatboxers.json"), encoding="utf-8"))
man_path = os.path.join(data, "pictures.json")
manifest = json.load(open(man_path, encoding="utf-8")) if os.path.exists(man_path) else {}


def slug(s):
    s = unicodedata.normalize("NFKD", html.unescape(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]", "", s)


import subprocess


def get(url, binary=False):
    # curl uses the operating system's certificate store (Python's bundled one rejects some hosts here)
    out = subprocess.run(["curl", "-sL", "--fail", "--max-time", "60", "-A", UA["User-Agent"], url], capture_output=True)
    if out.returncode != 0:
        raise RuntimeError(f"curl exit {out.returncode}")
    return out.stdout if binary else out.stdout.decode("utf-8", "replace")


# 1. read the listing pages
cache_dir = os.path.join(root, "edit", "_bbworld_cache")
os.makedirs(cache_dir, exist_ok=True)
entries = []  # {slug_url, name, country, img}
for L in LETTERS:
    cpath = os.path.join(cache_dir, f"letter_{L.replace('%23', 'hash')}.html")
    if os.path.exists(cpath):
        page = open(cpath, encoding="utf-8").read()
    else:
        try:
            page = get(f"{SITE}/beatboxers?letter={L}")
        except Exception as ex:
            print("listing failed:", L, ex)
            continue
        open(cpath, "w", encoding="utf-8").write(page)
        time.sleep(2.0)
    for m in re.finditer(r'<a href="/beatboxers/([^"?#/]+)"[^>]*>(.*?)</a>', page, re.S):
        block = m.group(2)
        img = re.search(r'src="(https://world-beatbox-cdn\.pivotass\.com/beatboxers/[^"]+)"', block)
        label = re.search(r'data-wb-label="([^"]*)"', block)
        country = re.search(r'data-wb-country="([^"]*)"', block)
        if img and label:
            entries.append({"url": f"{SITE}/beatboxers/{m.group(1)}", "name": html.unescape(label.group(1)),
                            "country": (country.group(1) if country else "").lower(), "img": img.group(1)})
print(f"{len(entries)} beatboxers with a photo on beatbox.world")

# 2. match to our database
by_slug = {}
for e in entries:
    by_slug.setdefault(slug(e["name"]), []).append(e)


def cc_match(ours, theirs):
    if not theirs or not ours:
        return True
    ours = {c.lower() for c in ours}
    theirs = theirs.lower()
    return theirs in ours or (theirs == "gb" and any(c.startswith("gb") for c in ours)) or (theirs.startswith("gb") and "gb" in ours)


plan, ambiguous = [], []
for p in people:
    if p["id"] in manifest or p.get("rating") is None:
        continue
    cands = []
    for n in [p["name"]] + list(p.get("aliases") or []):
        cands += by_slug.get(slug(n), [])
    cands = list({c["url"]: c for c in cands}.values())
    ok = [c for c in cands if cc_match(p.get("countries") or [p.get("country")], c["country"])]
    if len(ok) == 1:
        plan.append((p, ok[0]))
    elif len(ok) > 1:
        same = [c for c in ok if c["country"] == (p.get("country") or "")]
        if len(same) == 1:
            plan.append((p, same[0]))
        else:
            ambiguous.append(f"{p['name']} ({p.get('country')}): {', '.join(c['url'] for c in ok[:3])}")
print(f"matched {len(plan)} of our beatboxers; {len(ambiguous)} ambiguous names skipped")

# 3. download photos from their CDN, slowly
got = 0
for i, (p, e) in enumerate(plan):
    out = os.path.join(pic_dir, f"{p['id']}.jpg")
    if not os.path.exists(out):
        try:
            im = Image.open(io.BytesIO(get(e["img"], binary=True))).convert("RGB")
            im.thumbnail((640, 640))
            im.save(out, "JPEG", quality=86, optimize=True)
            got += 1
            time.sleep(0.4)
        except Exception as ex:
            print("photo failed:", p["name"], ex)
            continue
    manifest[p["id"]] = {"src": f"pictures/{p['id']}.jpg", "source": e["url"]}
    if (i + 1) % 100 == 0:
        json.dump(dict(sorted(manifest.items())), open(man_path, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
        print(f"  {i + 1}/{len(plan)}")

json.dump(dict(sorted(manifest.items())), open(man_path, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
print(f"downloaded {got} new photos; {len(manifest)} beatboxers have a picture now")
for a in ambiguous[:15]:
    print("  ambiguous:", a)
