"""Export beatboxers and countries to CSV for editing in Google Sheets / Excel.
Usage: python -I export_csv.py <project_dir>
Writes edit/beatboxers.csv and edit/countries.csv. Keep the id / code columns so edits can be merged back.
"""
import csv, json, os, sys

root = sys.argv[1]
data = os.path.join(root, "data")
out = os.path.join(root, "edit")
os.makedirs(out, exist_ok=True)

people = json.load(open(os.path.join(data, "beatboxers.json"), encoding="utf-8"))
countries = json.load(open(os.path.join(data, "countries.json"), encoding="utf-8"))
names = {p["id"]: p["name"] for p in people}
comps = {c["id"]: c for c in json.load(open(os.path.join(data, "competitions.json"), encoding="utf-8"))}


def comp_label(cid):
    c = comps.get(cid, {})
    if c.get("scope") == "national" and cid != "gbc":
        return f"{countries.get(c.get('country'), {}).get('name', c.get('country', '').upper())} national"
    return c.get("short_name") or c.get("name") or cid
STATUS_ORDER = {"active": 0, "judge": 1, "retired": 2, "unknown": 3}


def titles(p):
    t = p.get("titles") or {}
    parts = []
    for key in ("major", "national", "other"):
        for x in t.get(key, []):
            label = comp_label(x["competition"])
            if x["category"] != "solo":
                label += f" {x['category'].replace('_', ' ')}"
            parts.append(f"{label} {x['year']}")
    return "; ".join(parts)


people.sort(key=lambda p: (STATUS_ORDER.get(p.get("status"), 9), -(p.get("rating") or 0), p["name"].lower()))
cols = ["id", "name", "country", "other_countries", "status", "rating", "potential", "your_edit", "elo", "peak_rating",
        "retirement_risk", "judge_chance", "confidence", "battles", "record", "debut", "last_competed",
        "last_judged", "titles", "aliases", "note"]
with open(os.path.join(out, "beatboxers.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(cols)
    for p in people:
        w.writerow([p["id"], p["name"], p.get("country") or "", " ".join((p.get("countries") or [])[1:]),
                    p.get("status") or "", p.get("rating") if p.get("rating") is not None else "",
                    p.get("potential") if p.get("potential") is not None else "",
                    "yes" if p.get("hand_edited") else "", p.get("elo") or "",
                    p.get("peak_rating") if p.get("peak_rating") is not None else "",
                    p.get("retirement_risk") if p.get("retirement_risk") is not None else "",
                    p.get("judge_chance") if p.get("judge_chance") is not None else "",
                    p.get("confidence") or "", p.get("battles") or "", p.get("record") or "",
                    p.get("debut") or "", p.get("last_competed") or "", p.get("last_judged") or "",
                    titles(p), "; ".join(p.get("aliases") or []), p.get("note") or p.get("estimated") or ""])

ccols = ["code", "name", "level", "active_beatboxers", "top_beatboxers", "national_championship", "latest_national_champion"]
with open(os.path.join(out, "countries.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(ccols)
    for code, c in sorted(countries.items(), key=lambda kv: (-(kv[1].get("level") or 0), kv[1]["name"])):
        champs = c.get("national_champions") or []
        last = f"{names.get(champs[-1]['beatboxer'], champs[-1]['beatboxer'])} ({champs[-1]['year']})" if champs else ""
        w.writerow([code, c["name"], c.get("level") if c.get("level") is not None else "", c["active_beatboxers"],
                    ", ".join(names.get(x, x) for x in c["top_beatboxers"]), c.get("national_championship") or "", last])
print("beatboxers", len(people), "countries", len(countries))
