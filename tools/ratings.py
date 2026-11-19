"""Elo-based ratings built on the user's placement bonus table (data/elo_rules.json).
Usage: python -I ratings.py <project_data_dir>

1. Walk every completed edition in date order.
2. Each new season, everyone fades toward base_elo (season_fade).
3. Each battle exchanges Elo (K scaled by the competition's win bonus).
4. Each entrant gets the stacked placement bonuses for the stages they reached.
5. Elo is mapped to the 1-99 rating scale by fitting to the user's reviewed ratings (overrides.json),
   then the overrides are applied on top so hand edits always win.
"""
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
import json, os, re, sys
from collections import Counter, defaultdict

D = sys.argv[1]
NOW = 2026

comps = {c["id"]: c for c in json.load(open(os.path.join(D, "competitions.json"), encoding="utf-8"))}
people = json.load(open(os.path.join(D, "beatboxers.json"), encoding="utf-8"))
pid = {p["id"]: p for p in people}
country_names = json.load(open(os.path.join(D, "country_names.json"), encoding="utf-8"))
rules = json.load(open(os.path.join(D, "elo_rules.json"), encoding="utf-8"))
ov_path = os.path.join(D, "overrides.json")
overrides = json.load(open(ov_path, encoding="utf-8")) if os.path.exists(ov_path) else {}
BASE, FADE, BK = rules["base_elo"], rules["season_fade"], rules["battle_k"]
MONTHS = "january february march april may june july august september october november december".split()
MAJOR = {"gbb", "bbwc"}
LADDER = ["qualify", "top32", "top16", "top8", "top4", "final", "win"]


def rule_for(cid, cat):
    r = rules["competitions"].get(cid)
    if cat == "7_to_smoke":
        return rules["seven_to_smoke"]
    if r is None:
        r = rules["default_national"] if comps.get(cid, {}).get("scope") == "national" else {"final": 5, "win": 10}
    if cat in r and isinstance(r[cat], dict):
        return r[cat]
    if "solo" in r and isinstance(r["solo"], dict):
        return r["solo"] if cat == "solo" else None
    return r if cat in ("solo", "solo_global") else None


# ---- load editions in date order
editions = []
for cid, c in comps.items():
    path = os.path.join(D, c["history_file"])
    if not os.path.exists(path):
        continue
    for e in json.load(open(path, encoding="utf-8"))["editions"]:
        m = e.get("month")
        if not m and e.get("dates"):
            mm = re.search("|".join(MONTHS), e["dates"].lower())
            m = MONTHS.index(mm.group(0)) + 1 if mm else 6
        editions.append({**e, "_comp": cid, "_month": m or 6})
editions.sort(key=lambda e: (e["year"], e["_month"]))


def bid(r):
    return r.get("beatboxer") if r else None


ROUND_STAGE = {"Top 32": "top32", "Top 16": "top16", "Top 8": "top8", "Quarterfinal round": "top8",
               "Quarterfinal tiebreaker": "top8", "Semifinal round": "top4", "Semifinal tiebreaker": "top4",
               "Semifinal": "top4", "Third place": "top4", "Final": "final"}


def stages_for(d):
    """id -> set of stages reached in one category."""
    st = defaultdict(set)
    seeds = {}
    for key in ("participants", "seeding", "placements", "points"):
        for r in d.get(key, []) or []:
            if bid(r):
                st[bid(r)].add("qualify")
    for r in d.get("seeding", []) or []:
        if bid(r):
            seeds[bid(r)] = r["rank"]
    for b in d.get("battles", []):
        s = ROUND_STAGE.get(b["round"])
        for x in (b["a"], b["b"]):
            if bid(x):
                st[bid(x)].add("qualify")
                if s:
                    st[bid(x)].add(s)
        if b["round"] == "Final" and bid(b.get("winner")):
            st[bid(b["winner"])].add("win")
        if b["round"] == "Third place" and bid(b.get("winner")):
            st[bid(b["winner"])].add("third")
    for r in d.get("placements", []) or []:
        x, rk = bid(r), r["rank"]
        if not x:
            continue
        if rk == 1:
            st[x].add("win")
        if rk <= 2:
            st[x].add("final")
        if rk == 3:
            st[x].add("third")
        if rk <= 4:
            st[x].add("top4")
        if rk <= 8:
            st[x].add("top8")
        if rk <= 16:
            st[x].add("top16")
    for key, stage in (("champion", "win"), ("co_champion", "win"), ("runner_up", "final"), ("third", "third")):
        if bid(d.get(key)):
            st[bid(d[key])].update({stage, "qualify"})
    return st, seeds


def bonus(rule, stages, seed):
    if not rule:
        return 0
    top = max((LADDER.index(s) for s in stages if s in LADDER), default=-1)
    total = sum(rule.get(s, 0) for s in LADDER[: top + 1])
    if "third" in stages:
        total += rule.get("third", 0)
    if seed is not None:
        if seed <= 15:
            total += rule.get("seed_top15", 0)
        if seed <= 10:
            total += rule.get("seed_top10", 0)
    return total


def run(FADE, BK):
    elo = {}
    peak = defaultdict(lambda: BASE)
    games, wins = defaultdict(int), defaultdict(int)
    comp_years, judge_years = defaultdict(set), defaultdict(set)
    titles = defaultdict(lambda: defaultdict(list))
    snap24 = None
    season = None
    for e in editions:
        if season is not None and e["year"] != season:
            for x in elo:
                elo[x] = BASE + (elo[x] - BASE) * FADE ** (e["year"] - season)
            if season <= 2024 < e["year"]:
                snap24 = dict(elo)
        season = e["year"]
        for j in (e.get("judges") or []) + (e.get("wildcard_judges") or []):
            if bid(j):
                judge_years[bid(j)].add(e["year"])
        if e.get("status") != "completed":
            continue
        cid = e["_comp"]
        for cat, d in e.get("categories", {}).items():
            for j in (d.get("judges") or []) + (d.get("wildcard_judges") or []):
                if bid(j):
                    judge_years[bid(j)].add(e["year"])
            rule = rule_for(cid, cat)
            if rule is None:
                continue
            st, seeds = stages_for(d)
            for x in st:
                elo.setdefault(x, BASE)
                comp_years[x].add(e["year"])
            k = BK * min(1.0, rule.get("win", 10) / 75)
            for b in d.get("battles", []):
                a, c, w = bid(b["a"]), bid(b["b"]), bid(b.get("winner"))
                if not (a and c and w) or a == c:
                    continue
                ea = 1 / (1 + 10 ** ((elo[c] - elo[a]) / 400))
                sa = 1.0 if w == a else 0.0
                elo[a] += k * (sa - ea)
                elo[c] -= k * (sa - ea)
                games[a] += 1; games[c] += 1; wins[w] += 1
            for x, s in st.items():
                elo[x] += bonus(rule, s, seeds.get(x))
                peak[x] = max(peak[x], elo[x])
                if "win" in s:
                    kind = "major" if cid in MAJOR and cat == "solo" else (
                        "national" if comps[cid].get("scope") == "national" and cat == comps[cid].get("national_title_category", "solo") else "other")
                    titles[x][kind].append({"competition": cid, "year": e["year"], "category": cat})
    if season is not None and season < NOW:
        for x in elo:
            elo[x] = BASE + (elo[x] - BASE) * FADE ** (NOW - season)
    if snap24 is None:
        snap24 = dict(elo)
    return elo, peak, games, wins, comp_years, judge_years, titles, snap24


def ranks(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    r = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(xs, ys):
    rx, ry = ranks(xs), ranks(ys)
    n = len(xs)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = sum((a - mx) ** 2 for a in rx) ** 0.5
    vy = sum((b - my) ** 2 for b in ry) ** 0.5
    return cov / (vx * vy) if vx and vy else 0


ACTIVE_ANCHORS = {i: o["rating"] for i, o in overrides.items()
                  if isinstance(o.get("rating"), (int, float)) and o.get("status", "active") == "active"}
tuning = []
for fade in (0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0):
    for bk in (0, 12, 24, 48, 96, 160, 240):
        e_ = run(fade, bk)[0]
        ids = [i for i in ACTIVE_ANCHORS if i in e_]
        tuning.append((spearman([e_[i] for i in ids], [ACTIVE_ANCHORS[i] for i in ids]), fade, bk))
tuning.sort(reverse=True)
print("tuning (rank agreement with your ratings, fade, battle_k):", [(round(a, 3), f, k) for a, f, k in tuning[:6]])
print("your table's default (0.8, 24):", [round(a, 3) for a, f, k in tuning if f == 0.8 and k == 24])
_, FADE, BK = tuning[0]
rules["season_fade"], rules["battle_k"] = FADE, BK
with open(os.path.join(D, "elo_rules.json"), "w", encoding="utf-8", newline="\n") as fh:
    json.dump(rules, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
elo, peak, games, wins, comp_years, judge_years, titles, snap24 = run(FADE, BK)



# ---- map Elo -> rating using the user's reviewed ratings (active ones) as anchors
anchors = sorted((elo[i], o["rating"]) for i, o in overrides.items()
                 if i in elo and isinstance(o.get("rating"), (int, float)) and o.get("status", pid.get(i, {}).get("status")) == "active")
# smooth curve: rating = FLOOR + A * (1 - exp(-(elo - BASE) / S)), fitted to the anchors.
# FLOOR is what a beatboxer with no meaningful results gets; it keeps a big gap to the elite.
FLOOR = 40.0
import math


def curve(v, A, S, C):
    x = max(0.0, v - BASE)
    # fast rise for the first results, then slow steady growth toward the elite
    return FLOOR + A * (1 - math.exp(-x / S)) + C * math.log1p(x / 100)


best = None
for A in range(15, 41):
    for S in range(3, 61, 3):
        for C in [c * 0.5 for c in range(0, 31)]:
            err = sum((curve(x, A, S, C) - y) ** 2 for x, y in anchors)
            if best is None or err < best[0]:
                best = (err, A, S, C)
_, FIT_A, FIT_S, FIT_C = best
pts = [(BASE + d, curve(BASE + d, FIT_A, FIT_S, FIT_C)) for d in (0, 2, 5, 10, 25, 50, 100, 200, 400, 800)]


def to_rating(v):
    return max(25.0, min(97.0, curve(v, FIT_A, FIT_S, FIT_C)))


def country_of(p):
    return p.get("country")


for p in people:
    x = p["id"]
    for k in ("rating", "potential", "peak_rating", "status", "retirement_risk", "judge_chance", "titles", "debut",
              "last_competed", "last_judged", "battles", "record", "elo", "confidence", "estimated", "hand_edited"):
        p.pop(k, None)
    cy, jy = sorted(comp_years.get(x, [])), sorted(judge_years.get(x, []))
    if jy:
        p["last_judged"] = jy[-1]
    if x not in elo:
        if p.get("added_by_user"):
            p.update({"rating": 60, "potential": 68, "status": "active", "confidence": "none",
                      "estimated": "no results in the data yet; placeholder"})
        else:
            p.update({"rating": None, "potential": None, "status": "judge" if jy else "unknown"})
    else:
        e_now = elo[x]
        rating = int(round(to_rating(e_now)))
        last, debut = cy[-1], cy[0]
        if last >= NOW - 2:
            status = "active"
        elif jy and jy[-1] >= NOW - 3:
            status = "judge"
        else:
            status = "retired"
        if p.get("added_by_user"):
            status = "active"
        peak_r = max(rating, int(round(to_rating(peak[x] * 0.85 + BASE * 0.15))))
        if status != "active":
            rating = max(rating, peak_r - 4)  # what they would bring back
        years_in = NOW - debut + 1
        trend = to_rating(e_now) - to_rating(snap24.get(x, e_now))
        room = max(0.15, min(1.0, (100 - rating) / 30))
        head = max(0.0, 14 - 2.3 * (years_in - 1)) * (1 - rating / 115) + max(-2, min(6, trend * 0.6)) * room
        potential = rating if status != "active" else int(round(min(99, max(rating, rating + head))))
        majors = len(titles[x].get("major", []))
        risk = 0.04 + 0.015 * max(0, years_in - 6) + (0.35 if majors >= 2 else 0.12 if majors == 1 else 0)
        if jy and jy[-1] >= NOW - 2:
            risk += 0.08
        if last == NOW - 2:
            risk += 0.15
        g = games[x]
        p.update({"rating": rating, "potential": potential, "peak_rating": peak_r, "status": status,
                  "retirement_risk": round(min(0.85, risk), 2) if status == "active" else None,
                  "judge_chance": round(min(0.9, 0.15 + 0.2 * majors + max(0, rating - 70) / 60), 2),
                  "debut": debut, "last_competed": last, "battles": g, "record": f"{wins[x]}-{g - wins[x]}",
                  "elo": int(round(e_now)), "confidence": "high" if g >= 10 else "medium" if g >= 4 else "low"})
        if titles[x]:
            p["titles"] = {k: v for k, v in titles[x].items()}
    ov = overrides.get(x)
    if ov:
        p.update({k: v for k, v in ov.items() if k != "reviewed"})
        if p.get("status") != "active":
            p["retirement_risk"] = None
        if p.get("potential") is not None and p.get("rating") is not None and p["potential"] < p["rating"]:
            p["potential"] = p["rating"]
        p["hand_edited"] = True

with open(os.path.join(D, "beatboxers.json"), "w", encoding="utf-8", newline="\n") as fh:
    json.dump(people, fh, ensure_ascii=False, indent=2)
    fh.write("\n")

# ---- countries
nat_comp = {c["country"]: c["id"] for c in comps.values() if c.get("scope") == "national" and c.get("country")}
champs = defaultdict(list)
for e in editions:
    c = comps[e["_comp"]]
    if c.get("scope") == "national" and e.get("status") == "completed":
        d = e["categories"].get(c.get("national_title_category", "solo"), {})
        if bid(d.get("champion")):
            champs[c["country"]].append({"year": e["year"], "beatboxer": bid(d["champion"])})
countries = {}
codes = set(nat_comp) | {p.get("country") for p in people if p.get("country")}
for cc in sorted(c for c in codes if c):
    act = sorted((p for p in people if p.get("country") == cc and p.get("status") == "active" and p.get("rating")),
                 key=lambda p: -p["rating"])
    if act:
        v = [p["rating"] for p in act] + [40] * 10
        level = int(round(0.5 * v[0] + 0.3 * sum(v[1:4]) / 3 + 0.2 * sum(v[4:10]) / 6))
    else:
        level = None
    countries[cc] = {"name": country_names.get(cc, {}).get("name", cc.upper()), "level": level,
                     "active_beatboxers": len(act), "top_beatboxers": [p["id"] for p in act[:5]],
                     "national_championship": nat_comp.get(cc),
                     "national_champions": sorted(champs.get(cc, []), key=lambda r: r["year"])}
with open(os.path.join(D, "countries.json"), "w", encoding="utf-8", newline="\n") as fh:
    json.dump(countries, fh, ensure_ascii=False, indent=2)
    fh.write("\n")

# ---- report
print("anchors used for the mapping:", len(anchors), "-> curve points", len(pts))
print("curve:", [(int(a), round(b, 1)) for a, b in pts[:: max(1, len(pts) // 8)]] + [(int(pts[-1][0]), round(pts[-1][1], 1))])
ranked = sorted((p for p in people if p.get("status") == "active" and p.get("rating")), key=lambda p: -p["rating"])
print("TOP 45 ACTIVE  (* = your rating)")
for p in ranked[:45]:
    print(f"  {p['rating']:>2}{'*' if p.get('hand_edited') else ' '} pot {p['potential']:>2}  elo {p.get('elo', '-'):>5}  {p['name']:<16} {p['country']}")
print("BEST NOT-REVIEWED ACTIVE (new estimates)")
for p in [q for q in ranked if not q.get("hand_edited")][:30]:
    print(f"  {p['rating']:>2} pot {p['potential']:>2}  elo {p.get('elo', '-'):>5}  {p['name']:<16} {p.get('country') or '-':<6} {p.get('record')}  debut {p.get('debut')}")
fit_err = sum((to_rating(x) - y) ** 2 for x, y in anchors) / max(1, len(anchors))
print(f"fit: A={FIT_A} S={FIT_S} C={FIT_C} avg error {fit_err ** 0.5:.1f} rating points")
dist = Counter((p["rating"] // 10) * 10 for p in ranked)
print("RATING SPREAD (active):", dict(sorted(dist.items())))
print("COUNTRIES:", ", ".join(f"{c['name']} {c['level']}" for _, c in sorted(countries.items(), key=lambda kv: -(kv[1]['level'] or 0))[:20]))
