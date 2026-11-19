import sys as _s; _s.stdout.reconfigure(encoding='utf-8')
import json, sys, os
d = sys.argv[1]
bb = {b["id"] for b in json.load(open(os.path.join(d, "beatboxers.json"), encoding="utf-8"))}
tm = set()
bad = 0
def chk(r, where):
    global bad
    if not r: return
    if "beatboxer" in r and r["beatboxer"] not in bb: bad += 1; print("missing bb", r, where)
    if "team" in r and r["team"] not in tm: bad += 1; print("missing team", r, where)
eds = []
for f in sorted(os.listdir(os.path.join(d, "history"))):
    h = json.load(open(os.path.join(d, "history", f), encoding="utf-8"))
    eds += [(h["competition"], e) for e in h["editions"]]
for comp, e in eds:
    for c, cd in e["categories"].items():
        w = f'{comp} {e["year"]} {c}'
        for p in cd.get("wildcard_runners_up", []): chk(p, w)
        for k in ("champion", "runner_up", "third"): chk(cd.get(k), w)
        for p in cd.get("participants", []): chk(p, w)
        for b in cd.get("battles", []):
            chk(b["a"], w); chk(b["b"], w); chk(b.get("winner"), w)
            if not b.get("winner"): print("no winner:", w, b["round"], b["a"], b["b"])
            elif b["winner"] not in (b["a"], b["b"]) and not any(b["winner"].get(k) == (x or {}).get(k) for x in (b["a"], b["b"]) for k in ("beatboxer", "team")):
                print("winner not in battle:", w, b)
        fins = [b for b in cd.get("battles", []) if b["round"] == "Final"]
        if len(fins) > 1: print("multiple finals:", w)
print("problems:", bad)
