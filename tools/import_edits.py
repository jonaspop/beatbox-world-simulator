"""Merge hand edits from an edited beatboxers CSV into data/overrides.json and apply them.
Usage: python -I import_edits.py <project_dir> <edited_csv>
Only columns that differ from edit/beatboxers.csv (the export) are taken, and only these fields:
name, country, status, rating, potential, peak_rating, note.
retirement_risk / judge_chance are ignored (Sheets reformats decimals).
"""
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
import csv, json, os, sys

root, edited = sys.argv[1], sys.argv[2]
data = os.path.join(root, "data")
FIELDS = ["name", "country", "status", "rating", "potential", "peak_rating", "note"]
INTS = {"rating", "potential", "peak_rating"}


def read(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return {r["id"]: r for r in csv.DictReader(fh)}


orig = read(os.path.join(root, "edit", "beatboxers.csv"))
new = read(edited)
ov_path = os.path.join(data, "overrides.json")
overrides = json.load(open(ov_path, encoding="utf-8")) if os.path.exists(ov_path) else {}
def norm_status(s):
    s = s.strip().lower()
    if "removed" in s:
        return "removed"  # kept in the history, never used by the game
    return s


skipped, n, last_changed = [], 0, -1
rows = list(new.items())
for idx, (i, r) in enumerate(rows):
    o = orig.get(i)
    if not o:
        skipped.append(i)
        continue
    ch = {}
    for f in FIELDS:
        a, b = (o.get(f) or "").strip(), (r.get(f) or "").strip()
        if a != b and b != "":
            ch[f] = int(float(b)) if f in INTS else (norm_status(b) if f == "status" else b)
    if ch:
        overrides.setdefault(i, {}).update(ch)
        n += 1
        last_changed = idx
# every row down to the last edited one counts as reviewed: lock its rating/potential/status too
for i, r in rows[: last_changed + 1]:
    if i not in orig:
        continue
    ov = overrides.setdefault(i, {})
    for f in ("rating", "potential"):
        v = (r.get(f) or "").strip()
        if v and f not in ov:
            ov[f] = int(float(v))
    if r.get("status") and "status" not in ov:
        ov["status"] = norm_status(r["status"])
    ov["reviewed"] = True
with open(ov_path, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(overrides, fh, ensure_ascii=False, indent=2)
    fh.write("\n")

# apply to beatboxers.json now
bpath = os.path.join(data, "beatboxers.json")
people = json.load(open(bpath, encoding="utf-8"))
for p in people:
    ov = overrides.get(p["id"])
    if ov:
        p.update(ov)
        if "country" in ov and p.get("countries") and ov["country"] not in p["countries"][:1]:
            p["countries"] = [ov["country"]] + [c for c in p["countries"] if c != ov["country"]]
        p["hand_edited"] = sorted(ov)
with open(bpath, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(people, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
print("rows with edits this time:", n, "| reviewed through row", last_changed + 1,
      "| total locked people:", len(overrides), "| skipped unknown ids:", skipped)
