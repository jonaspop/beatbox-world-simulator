"""Turn cleaned wiki text + bracket json into structured GBB edition drafts.
Usage: python -I build_gbb.py <clean_dir> <out_json>
"""
import sys as _s; _s.stdout.reconfigure(encoding='utf-8')
import json, os, re, sys

FLAG = re.compile(r"\[([a-z]{2}(?:-[a-z]{2,3})?)\]")
CAT_ALIASES = {
    "solo": "solo", "tag team": "tag_team", "tagteam": "tag_team", "loopstation": "loopstation",
    "loop station": "loopstation", "loop": "loopstation", "crew": "crew", "producer": "producer",
    "7 to smoke": "7_to_smoke", "7ts": "7_to_smoke", "7 to smoke ": "7_to_smoke", "showcase": "solo",
    "u18": "u18", "female": "female", "solo u18": "u18", "u18 solo": "u18",
    "tag team loopstation": "tag_team_loopstation", "tag team loop": "tag_team_loopstation",
    "solo loopstation": "loopstation", "solo loop": "loopstation", "studio": "studio", "under 18": "u18",
    "vocobox world cup": "vocobox_world_cup", "solo global": "solo_global", "women": "female", "womens": "female",
    "women s": "female", "kids": "kids", "vocal scratch": "vocal_scratch", "sound fx": "sound_fx",
    "global": "solo_global", "u12": "kids_u12", "elementary": "kids_u12", "u15": "kids_u15", "junior high": "kids_u15",
}
CAT_PRIORITY = ["u12", "elementary", "u15", "junior high","vocal scratch", "sound fx", "vocobox world cup", "solo global", "global", "women s", "womens", "women", "kids", "tag team loopstation", "tag team loop", "solo loopstation", "solo loop", "7 to smoke", "7ts",
                "u18", "under 18", "female", "producer", "studio", "crew", "loopstation", "loop station", "tag team", "tagteam",
                "loop", "solo", "showcase"]


def cat_of(h):
    h = re.sub(r"[*()#]", " ", h).strip().lower()
    h = re.sub(r"\s+", " ", h)
    h = h.replace("name ", "").strip()
    h = re.sub(r"[´'’]", " ", h)
    if "wildcard competition" in h or "legacy" in h or "draft" in h:
        return None
    if re.search(r"\bu-? ?\d{1,2}\b|under \d|junior|elementary|kids", h):
        return "youth"
    if re.search(r"2v2|breakdance|dance|founders|honor|fantasy|urban open", h):
        return "other"
    for k in CAT_PRIORITY:
        if re.search(rf"(^|\W){re.escape(k)}($|\W)", h):
            return CAT_ALIASES[k]
    return None


def entity(cell):
    """'[fr] [co] **River**' -> {name, countries, members?} or None."""
    c = re.sub(r"\{\{.*?\}\}", "", cell.replace("**", "")).strip()
    flags = FLAG.findall(c.split("(")[0]) if "(" in c else FLAG.findall(c)
    if not FLAG.search(c):
        return None
    name = FLAG.sub("", c)
    members = None
    m = re.match(r"^(.*?)\((.*)\)\s*$", name.strip())
    if m and ("&" in m.group(2) or "," in m.group(2)):
        name = m.group(1)
        members = []
        for part in re.split(r"[&,]", m.group(2)):
            pf = FLAG.findall(part)
            members.append({"name": FLAG.sub("", part).strip(" *"), **({"countries": pf} if pf else {})})
    name = re.sub(r"\s+", " ", name).strip(" *:")
    if not name:
        return None
    e = {"name": name, "countries": flags}
    if members:
        e["members"] = members
    return e


def parse_tables(lines):
    """Yield tables as lists of rows (list of cells) with caption."""
    tables, cur, cap = [], None, None
    for ln in lines:
        if ln.strip() == "<table>":
            cur, cap = [], None
            continue
        if ln.strip() == "</table>":
            tables.append((cap, cur or []))
            cur = None
            continue
        if cur is not None:
            t = ln.strip()
            if t.startswith("caption:"):
                cap = t[8:].strip()
            elif t and cap == "" and not cur and " | " not in t and not FLAG.search(t):
                cap = t
            elif t:
                cur.append([c.strip() for c in t.split(" | ")])
    return tables


def sections(text):
    """Split into list of (path tuple, lines)."""
    out, path, buf = [], [], []
    for ln in text.split("\n"):
        h = re.match(r"^(=+)\s*(.*?)\s*=+\s*$", ln)
        if h:
            out.append((tuple(path), buf))
            lvl = len(h.group(1))
            path = [p for p in path if p[0] < lvl] + [(lvl, h.group(2))]
            buf = []
        else:
            buf.append(ln)
    out.append((tuple(path), buf))
    return [(tuple(n for _, n in p), b) for p, b in out]


def bold(v):
    return "**" in (v or "")


def score_num(v):
    m = re.search(r"(\d+)", (v or "").replace("**", ""))
    return int(m.group(1)) if m else None


ROUND_NAMES = {"32": "Top 32", "16": "Top 16", "8": "Top 8", "4": "Semifinal", "2": "Final", "3rd": "Third place"}


def bracket_battles(params):
    battles = []
    rounds = sorted({k.split("_")[0] for k in params if re.match(r"^(\d+|3rd)_p\d+$", k)},
                    key=lambda r: (-int(r) if r.isdigit() else 0.5) if r != "3rd" else 1.5)
    order = ["32", "16", "8", "4", "3rd", "2"]
    for r in order:
        if r not in rounds:
            continue
        n = max(int(k.split("_p")[1]) for k in params if re.match(rf"^{r}_p\d+$", k))
        for i in range(1, n + 1, 2):
            a, b = params.get(f"{r}_p{i}"), params.get(f"{r}_p{i+1}")
            sa, sb = params.get(f"{r}_p{i}_score"), params.get(f"{r}_p{i+1}_score")
            ea, eb = entity(a or ""), entity(b or "")
            if not ea and not eb:
                continue
            win = None
            if bold(a) or bold(sa) or "win" in (sa or "").lower() and "lose" not in (sa or "").lower():
                win = "a"
            elif bold(b) or bold(sb) or "win" in (sb or "").lower():
                win = "b"
            elif score_num(sa) is not None and score_num(sb) is not None and score_num(sa) != score_num(sb):
                win = "a" if score_num(sa) > score_num(sb) else "b"
            bt = {"round": ROUND_NAMES[r], "a": ea, "b": eb}
            if win:
                bt["winner"] = (ea if win == "a" else eb)["name"] if (ea if win == "a" else eb) else None
            sc = [s.replace("**", "").strip() for s in (sa, sb) if s]
            if sc and not all(x.lower() in ("win", "lose") for x in sc):
                bt["score"] = " - ".join(sc)
            battles.append(bt)
    return battles


def build(clean_dir):
    editions = []
    for f in sorted(os.listdir(clean_dir)):
        if not f.endswith(".clean.txt"):
            continue
        base = f[: -len(".clean.txt")]
        text = open(os.path.join(clean_dir, f), encoding="utf-8").read()
        ym = re.search(r"((?:19|20)\d{2})", base) or re.search(r"\|dates=[^|]*?((?:19|20)\d{2})", text) or re.search(r"((?:19|20)\d{2})", text)
        year = int(ym.group(1))
        brackets = json.load(open(os.path.join(clean_dir, base + ".brackets.json"), encoding="utf-8"))
        info = {}
        m = re.search(r"\{\{Event(.*?)\}\}", text, re.S)
        if m:
            for key in ("dates", "location", "country", "venue"):
                mm = re.search(rf"\|{key}=([^|]*)", m.group(1))
                if mm and mm.group(1).strip():
                    info[key] = re.sub(r"\s+", " ", mm.group(1)).strip()
        ed = {"year": year, "name": base.replace("_", " "), **info, "categories": {}}

        def cat(c):
            return ed["categories"].setdefault(c, {})

        for path, lines in sections(text):
            joined = "\n".join(lines)
            top = path[0].lower() if path else ""
            if top in ("grand finals", "grand final", "finals", "resultados", "main event results"):
                top = "results"
            sub = path[-1] if len(path) > 1 else ""
            c = None
            for p in reversed(path[1:]):
                c = cat_of(p)
                if c:
                    break
            tables = parse_tables(lines)
            is_ru = bool(re.search(r"runner", sub, re.I))
            # exhibition sections (draft tag team, fantasy / legacy / exhibition battles) are not competition results
            draft_sec = any(re.search(r"draft|fantasy|legacy|exhibition|showcase battle|circle jam", p, re.I) for p in path)
            if draft_sec or ("participant" in top and "ranking" in sub.lower()):
                continue
            if c is None and (("participant" in top and (len(path) == 1 or is_ru)) or (top == "results" and len(path) == 1)):
                c = "solo"
            if c is None and top == "results" and "BRACKET #" in joined and not ed["categories"].get("solo", {}).get("battles"):
                c = "solo"
            if "participant" in top and is_ru:
                ru = cat(c).setdefault("wildcard_runners_up", [])
                for cap, rows in tables:
                    for row in rows:
                        e = entity(row[0]) if row else None
                        if not e:
                            continue
                        q = row[1] if len(row) > 1 else ""
                        m = re.search(r"(\d+)(?:st|nd|rd|th) Place", q)
                        place = int(m.group(1)) if m else (ru[-1]["place"] if ru else None)
                        ru.append({**e, "place": place})
                continue
            if "participant" in top and c:
                lst = cat(c).setdefault("participants", [])
                for cap, rows in tables:
                    for row in rows:
                        if all(x.startswith("#") for x in row):
                            continue
                        # pair entity + qualification cells, or entity-only rows
                        i = 0
                        while i < len(row):
                            e = entity(row[i])
                            if e:
                                q = row[i + 1] if i + 1 < len(row) and not entity(row[i + 1]) else None
                                if q and q.strip():
                                    e["qualification"] = q.replace("**", "").strip()
                                    i += 1
                                lst.append(e)
                            i += 1
                notes = [ln.strip("* ").strip() for ln in lines if ln.strip().startswith("*")]
                if notes:
                    cat(c).setdefault("notes", []).extend(notes)
            if top == "judges" or top.startswith("judge"):
                kind = "wildcard_judges" if "wildcard" in sub.lower() else "judges"
                for cap, rows in tables:
                    if cap and "wildcard" in cap.lower():
                        k2 = "wildcard_judges"
                    else:
                        k2 = kind
                    if not rows:
                        continue
                    header = rows[0] if all(x.startswith("#") for x in rows[0]) else None
                    body = rows[1:] if header else rows
                    if header and len(header) == 1 and "wildcard" in header[0].lower():
                        k2 = "wildcard_judges"
                    cols = [cat_of(h.strip("#")) for h in header] if header else []
                    for row in body:
                        for j, cell in enumerate(row):
                            e = entity(cell)
                            if not e:
                                continue
                            cc = cols[j] if j < len(cols) and cols[j] else None
                            if cc:
                                cat(cc).setdefault(k2, []).append(e)
                            else:
                                ed.setdefault(k2, []).append(e)
            if top == "results" and c:
                for cap, rows in tables:
                    if cap and "judge" in cap.lower():
                        continue
                    if rows and rows[0] and rows[0][0].strip("#*").lower() == "rank":
                        pl = []
                        for row in rows[1:]:
                            r0 = row[0].replace("*", "").strip() if row else ""
                            if len(row) >= 2 and re.match(r"^\d+", r0):
                                e = entity(row[1])
                                if e:
                                    pl.append({"rank": re.match(r"^\d+", r0).group(0), "name": e["name"]})
                        if pl and (not cap or "day" not in cap.lower()):
                            kind = "seeding" if cap and re.search(r"elimination|seeding", cap, re.I) else "placements"
                            cat(c)[kind] = pl
                    hdr = " ".join(rows[0]).lower() if rows and rows[0] else ""
                    if c == "7_to_smoke" and ("#score" in hdr or "#points" in hdr):
                        sc = []
                        for row in rows[1:]:
                            e = entity(row[0])
                            if e and len(row) > 1:
                                sc.append({"name": e["name"], "points": score_num(row[1])})
                        if sc:
                            cat(c)["scores"] = sc
                # plain "#Final" / "#Small Final" tables and 2-row "Name | Result" finals
                for cap, rows in tables:
                    cur_round, buf = None, []
                    rows2 = list(rows)
                    hdr0 = " | ".join(rows2[0]).lower() if rows2 else ""
                    alltxt = " ".join(" ".join(r) for r in rows2).lower()
                    if cap and re.match(r"(grand )?final$", cap.strip(), re.I):
                        rows2 = [["#Final"]] + rows2
                    # "Name | 1st Place" style final standings
                    pr = []
                    for r in rows2:
                        e = entity(r[0]) if r else None
                        m = re.search(r"(\d+)(?:st|nd|rd|th) place", " ".join(r[1:]).lower()) if e else None
                        if e and m and "elimination" not in " ".join(r).lower() and "wildcard" not in " ".join(r).lower():
                            pr.append({"rank": m.group(1), "name": e["name"]})
                    if pr and not cat(c).get("placements"):
                        cat(c)["placements"] = pr
                    if hdr0.startswith("#name | #result") and sum(1 for r in rows2[1:] if entity(r[0])) == 2 and ("votes" in alltxt or "win" in alltxt):
                        rows2 = [["#Final"]] + rows2[1:]
                    for row in rows2 + [["#end"]]:
                        h = row[0].lower()
                        if row[0].startswith("#"):
                            if cur_round and len(buf) == 2:
                                (ea, sa, ra), (eb, sb, rb) = buf
                                win = "a" if (bold(ra) and not bold(rb)) else "b" if bold(rb) else None
                                if not win and score_num(sa) is not None and score_num(sb) is not None:
                                    win = "a" if score_num(sa) > score_num(sb) else "b"
                                bt = {"round": cur_round, "a": ea, "b": eb}
                                if win:
                                    bt["winner"] = (ea if win == "a" else eb)["name"]
                                if score_num(sa) is not None and score_num(sb) is not None:
                                    bt["score"] = f"{score_num(sa)} - {score_num(sb)}"
                                if win:
                                    cat(c).setdefault("battles", []).append(bt)
                            cur_round, buf = None, []
                            if re.match(r"#(grand )?final", h):
                                cur_round = "Final"
                            elif re.match(r"#small final|#3rd|#third", h):
                                cur_round = "Third place"
                            continue
                        if cur_round:
                            e = entity(re.sub(r"\s+\d\s*(\*\*)?$", "", row[0].replace("**", "").strip()) if row else "")
                            if e:
                                buf.append((e, row[1] if len(row) > 1 else "", " | ".join(row)))
                # round-robin tables: "N | [cc] Name (3 Votes) | vs | [cc] Name (2 Votes)"
                stage = "Quarterfinal"
                ti = 0
                for ln in lines:
                    u = re.search(r"<u>(.*?)</u>", ln)
                    if u:
                        lab = u.group(1).lower()
                        stage = "Semifinal" if "semi" in lab else "Quarterfinal extra" if "extra" in lab else "Quarterfinal"
                    if ln.strip() == "<table>":
                        cap, rows = tables[ti] if ti < len(tables) else (None, [])
                        ti += 1
                        for row in rows:
                            cells = [x for x in row if re.search(r"\(\s*\d+\s*votes?\*?\s*\)", x, re.I)]
                            if len(cells) != 2 or not row:
                                continue
                            def side(x):
                                v = int(re.search(r"\((\s*\d+)", x).group(1))
                                nm = re.sub(r"\(\s*\d+\s*votes?\*?\s*\)", "", x, flags=re.I)
                                return entity(nm), v
                            (ea, va), (eb, vb) = side(cells[0]), side(cells[1])
                            if not ea or not eb or va == vb:
                                continue
                            label = row[0].lower()
                            extra = "tiebreaker" in label or "extra" in label or stage == "Quarterfinal extra"
                            base = "Semifinal" if stage == "Semifinal" else "Quarterfinal"
                            rnd = "7 to Smoke" if c == "7_to_smoke" else f"{base} {'tiebreaker' if extra else 'round'}"
                            cat(c).setdefault("battles", []).append({
                                "round": rnd, "a": ea, "b": eb, "winner": (ea if va > vb else eb)["name"],
                                "score": f"{va} - {vb}"})
                for bm in re.finditer(r"BRACKET #(\d+) (\S+)", joined):
                    b = brackets[int(bm.group(1))]
                    cat(c).setdefault("battles", []).extend(bracket_battles(b["params"]))
        # winner / runner-up from battles
        for c, d in ed["categories"].items():
            fin = [b for b in d.get("battles", []) if b["round"] == "Final"]
            if fin and fin[0].get("winner"):
                d["champion"] = fin[0]["winner"]
                other = fin[0]["b"] if fin[0]["a"] and fin[0]["a"]["name"] == fin[0]["winner"] else fin[0]["a"]
                d["runner_up"] = other["name"] if other else None
            elif d.get("scores"):
                best = max(d["scores"], key=lambda s: s["points"] or 0)
                d["champion"] = best["name"]
            elif d.get("placements"):
                firsts = [p for p in d["placements"] if p["rank"].strip(". ") == "1"]
                seconds = [p for p in d["placements"] if p["rank"].strip(". ") == "2"]
                if firsts:
                    d["champion"] = firsts[0]["name"]
                if seconds:
                    d["runner_up"] = seconds[0]["name"]
        ed["categories"] = {k: v for k, v in ed["categories"].items() if v}
        editions.append(ed)
    editions.sort(key=lambda e: e["year"])
    return editions


eds = build(sys.argv[1])
json.dump(eds, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for e in eds:
    print(e["year"], {k: (v.get("champion"), len(v.get("participants", [])), len(v.get("battles", [])), len(v.get("judges", []))) for k, v in e["categories"].items()})
