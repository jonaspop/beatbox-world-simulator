"""Write edit/competitions_to_rate.csv and edit/countries_to_rate.csv for the user to fill in levels.
Usage: python -I export_levels_to_rate.py <project_dir>
"""
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
import csv, json, os, sys
from collections import defaultdict

root = sys.argv[1]
data = os.path.join(root, "data")
comps = json.load(open(os.path.join(data, "competitions.json"), encoding="utf-8"))
people = {p["id"]: p for p in json.load(open(os.path.join(data, "beatboxers.json"), encoding="utf-8"))}
countries = json.load(open(os.path.join(data, "countries.json"), encoding="utf-8"))
overrides = json.load(open(os.path.join(data, "overrides.json"), encoding="utf-8"))
TIER = {"gbb": 1.0, "bbwc": 1.0, "ebc": 0.7, "vokal_total": 0.65, "fbb": 0.65, "gnb": 0.6, "mba": 0.6,
        "bcj": 0.6, "btw": 0.6, "lacup": 0.6, "bayreuth": 0.6, "one_one": 0.6, "gbb_second_league": 0.6,
        "apac": 0.5, "nue": 0.5, "amrq": 0.45, "gbc": 0.45, "botm": 0.35}
SCOPE_ORDER = {"world": 0, "continental": 1, "regional": 2, "international": 3, "invitational": 4, "open": 5,
               "national_open": 6, "national": 7}


def entrants(cat):
    ids = set()
    for key in ("participants", "seeding", "placements", "points"):
        for r in cat.get(key, []) or []:
            if r.get("beatboxer"):
                ids.add(r["beatboxer"])
    for b in cat.get("battles", []):
        for x in (b.get("a"), b.get("b")):
            if x and x.get("beatboxer"):
                ids.add(x["beatboxer"])
    return ids


rows = []
for c in comps:
    path = os.path.join(data, c["history_file"])
    if not os.path.exists(path):
        continue
    eds = [e for e in json.load(open(path, encoding="utf-8"))["editions"] if e.get("status") == "completed"]
    years = sorted({e["year"] for e in eds})
    sizes, anchor = [], []
    for e in eds:
        ids = entrants(e["categories"].get("solo", {}))
        if ids:
            sizes.append(len(ids))
        anchor += [overrides[i]["rating"] for i in ids if i in overrides and "rating" in overrides[i]]
    tier = TIER.get(c["id"])
    if tier is None and c.get("scope") == "national":
        tier = countries.get(c.get("country"), {}).get("event_weight")
    rows.append({
        "id": c["id"], "name": c["name"], "type": c.get("scope", ""),
        "country": countries.get(c.get("country"), {}).get("name", "") if c.get("country") else "",
        "years_in_data": f"{years[0]}-{years[-1]}" if len(years) > 1 else (str(years[0]) if years else ""),
        "editions": len(eds), "typical_field": round(sum(sizes) / len(sizes)) if sizes else "",
        "my_current_weight": tier if tier is not None else "",
        "avg_of_your_ratings_who_entered": round(sum(anchor) / len(anchor), 1) if anchor else "",
        "your_level": "", "your_notes": "",
    })
rows.sort(key=lambda r: (SCOPE_ORDER.get(r["type"], 9), -(r["my_current_weight"] or 0), r["name"]))
os.makedirs(os.path.join(root, "edit"), exist_ok=True)
with open(os.path.join(root, "edit", "competitions_to_rate.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

crow = []
for code, c in countries.items():
    act = [p for p in people.values() if p.get("country") == code and p.get("status") == "active" and p.get("rating")]
    act.sort(key=lambda p: -p["rating"])
    if not act and not c.get("national_championship"):
        continue
    crow.append({
        "code": code, "name": c["name"], "active_beatboxers": len(act),
        "top_3_active": ", ".join(f"{p['name']} {p['rating']}" for p in act[:3]),
        "has_national_championship_in_data": "yes" if c.get("national_championship") else "",
        "my_current_level": c.get("level") if c.get("level") is not None else "",
        "your_level": "", "your_notes": "",
    })
crow.sort(key=lambda r: (-(r["my_current_level"] or 0), r["name"]))
with open(os.path.join(root, "edit", "countries_to_rate.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(crow[0]))
    w.writeheader()
    w.writerows(crow)
print("competitions", len(rows), "countries", len(crow))
