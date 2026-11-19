"""Merge manual data + wiki drafts for all competitions, normalize names, write project data files.
Usage: python -I finalize.py <drafts_dir> <project_data_dir>
  (expects <comp>_draft.json in drafts_dir for every competition in COMPETITIONS)
"""
import sys as _s; _s.stdout.reconfigure(encoding='utf-8')
import json, os, re, sys, unicodedata
from collections import Counter, defaultdict

DRAFTS, out_dir = sys.argv[1], sys.argv[2]
SIM_START = 2027


def load_draft(comp):
    p = os.path.join(DRAFTS, f"{comp}_draft.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []


GBB_SAME_YEAR = lambda cat, place=1: {"category": cat, "place": place, "to": "gbb", "to_category": cat if cat != "solo_global" else "solo", "year_offset": 0}
COMPETITIONS = [
    {"id": "gbb", "name": "Grand Beatbox Battle", "short_name": "GBB", "organizer": "Swissbeatbox", "scope": "world",
     "first_year": 2009,
     "categories": ["solo", "tag_team", "loopstation", "tag_team_loopstation", "crew", "producer", "u18", "7_to_smoke"],
     "qualifies": [
         {"category": "solo", "place": [1, 2, 3], "to": "gbb", "to_category": "solo", "year_offset": 1},
         {"category": "7_to_smoke", "place": 1, "to": "gbb", "to_category": "solo", "year_offset": 1}],
     "notes": "Top 3 in Solo and the 7 to Smoke winner qualify for the next GBB; the rest come from wildcards and qualifier events."},
    {"id": "gbb_second_league", "name": "GBB Second League", "short_name": "GBB SL", "organizer": "Swissbeatbox",
     "scope": "world", "first_year": 2026, "categories": ["solo"],
     "qualifies": [{"category": "solo", "place": 1, "to": "gbb", "to_category": "solo", "year_offset": 1}],
     "notes": "Contested by GBB wildcard runners-up; the winner qualifies for the next GBB."},
    {"id": "bbwc", "name": "Beatbox Battle World Championship", "short_name": "BBWC", "organizer": "Beatbox Battle Network",
     "scope": "world", "first_year": 2005, "cycle_years": 4, "next_edition": 2027,
     "categories": ["solo", "female", "loopstation", "tag_team", "crew", "vocal_scratch", "sound_fx"],
     "entry_rules": [
         {"type": "national_champion", "window": "since_previous_edition",
          "description": "Won a national championship in the years since the previous BBWC."},
         {"type": "previous_edition_placement", "top": 16,
          "description": "Reached the top 16 at the previous BBWC."}],
     "notes": "Held about every four years; the 7th edition is in 2027."},
    {"id": "ebc", "name": "European Beatbox Championship", "short_name": "EBC", "organizer": "Beatbox Europe",
     "scope": "continental", "region": "europe", "next_edition": 2027, "categories": ["solo"],
     "qualifies": [GBB_SAME_YEAR("solo")], "notes": "Returns in 2027."},
    {"id": "fbb", "name": "Florida Beatbox Battle", "short_name": "FBB", "organizer": "Florida Beatbox Festival",
     "scope": "international", "host_city": "Agen", "country": "fr",
     "categories": ["solo", "loopstation", "vocobox_world_cup"], "qualifies": [GBB_SAME_YEAR("solo")]},
    {"id": "gnb", "name": "Great North Battle", "short_name": "GNB", "organizer": "Beatbox Canada",
     "scope": "international", "country": "ca", "categories": ["solo", "tag_team", "loopstation"],
     "qualifies": [GBB_SAME_YEAR("solo")]},
    {"id": "gbc", "name": "German Beatbox Championship", "short_name": "GBC", "organizer": "German Beatbox Championship",
     "scope": "national", "country": "de", "categories": ["solo", "solo_global", "loopstation", "7_to_smoke"],
     "national_title_category": "solo",
     "qualifies": [GBB_SAME_YEAR("solo_global")],
     "notes": "Solo is the German national title; Solo Global is open to everyone and its champion goes to GBB."},
    {"id": "apac", "name": "APAC Region Qualifier", "short_name": "APAC", "organizer": "Swissbeatbox",
     "scope": "regional", "region": "asia_pacific", "categories": ["solo"], "qualifies": [GBB_SAME_YEAR("solo")],
     "notes": "Earlier editions ran as Oceania Beatbox Championships (2023) and Oceania Beatbox Battle (2025)."},
    {"id": "amrq", "name": "Africa & MENA Region Qualifier", "short_name": "AMRQ", "organizer": "Swissbeatbox",
     "scope": "regional", "region": "africa_mena", "categories": ["solo"], "qualifies": [GBB_SAME_YEAR("solo")]},
    {"id": "bcj", "name": "BeatCity Japan", "short_name": "BCJ", "organizer": "BeatCity",
     "scope": "national_open", "country": "jp",
     "categories": ["solo", "tag_team", "loopstation", "crew", "female", "kids"],
     "qualifies": [GBB_SAME_YEAR("solo")]},
    {"id": "mba", "name": "Maestro Beatbox America", "short_name": "MBA", "scope": "continental",
     "region": "south_america", "categories": ["solo"], "qualifies": [GBB_SAME_YEAR("solo")],
     "notes": "South American championship; the winner goes to GBB."},
    {"id": "btw", "name": "Beatbox To World", "short_name": "BTW", "scope": "international", "frequency": "yearly",
     "categories": ["solo"], "notes": "Big yearly international battle, back in 2026 after a break."},
    {"id": "lacup", "name": "La Cup", "short_name": "La Cup", "scope": "invitational", "categories": ["solo"],
     "notes": "Field picked loosely: upcoming prospects, well-known title winners, new national champions and comebacks."},
    {"id": "botm", "name": "Beatbox of the Month", "short_name": "BOTM", "scope": "open", "country": "de",
     "frequency": "every_2_months", "categories": ["solo"],
     "notes": "Open event mostly attended by Europeans near Germany. Upcoming names use it to test new battle ideas; it gives a small level-up."},
    {"id": "vokal_total", "name": "Vokal Total", "short_name": "VT", "scope": "invitational", "categories": ["solo"],
     "entry": {"invited": 6, "wildcards": 2},
     "notes": "Six strong invited beatboxers plus two prospects through wildcards."},
    {"id": "bayreuth", "name": "Bayreuth Beatbox Battle", "short_name": "BBB", "scope": "invitational",
     "country": "de", "categories": ["solo"], "entry": {"invited": 6, "wildcards": 2},
     "notes": "Same idea as Vokal Total: invited names plus wildcard prospects."},
    {"id": "nue", "name": "NUE Beatbox Battles", "short_name": "NUE", "scope": "international", "country": "gb",
     "categories": ["solo", "7_to_smoke"], "notes": "A big event in the UK."},
    {"id": "one_one", "name": "One One Battle International", "short_name": "One One", "scope": "invitational",
     "categories": ["solo", "7_to_smoke"], "entry": {"invited": "prospects and proven beatboxers", "wildcards": 2},
     "notes": "Invite-only battle mixing prospects and proven beatboxers, plus two wildcard spots."},
]

COUNTRY_NAMES = {
    "ar": "Argentina", "au": "Australia", "at": "Austria", "be": "Belgium", "bo": "Bolivia", "br": "Brazil",
    "bg": "Bulgaria", "ca": "Canada", "cl": "Chile", "cn": "China", "co": "Colombia", "cz": "Czech Republic",
    "dk": "Denmark", "eg": "Egypt", "fi": "Finland", "fr": "France", "de": "Germany", "hk": "Hong Kong",
    "in": "India", "ir": "Iran", "il": "Israel", "it": "Italy", "jp": "Japan", "jo": "Jordan", "kz": "Kazakhstan",
    "lt": "Lithuania", "mx": "Mexico", "ma": "Morocco", "nl": "Netherlands", "ni": "Nicaragua", "pk": "Pakistan",
    "ph": "Philippines", "pl": "Poland", "pt": "Portugal", "ru": "Russia", "sa": "Saudi Arabia",
    "gb-sct": "Scotland", "sk": "Slovakia", "za": "South Africa", "kr": "South Korea", "es": "Spain",
    "se": "Sweden", "sy": "Syria", "tw": "Taiwan", "tn": "Tunisia", "tr": "Turkey", "ie": "Ireland",
    "gb": "United Kingdom", "us": "United States", "ve": "Venezuela", "ch": "Switzerland", "sg": "Singapore",
    "my": "Malaysia", "id": "Indonesia", "vn": "Vietnam", "th": "Thailand", "ua": "Ukraine", "by": "Belarus",
    "hu": "Hungary", "ro": "Romania", "rs": "Serbia", "si": "Slovenia", "hr": "Croatia", "gr": "Greece",
    "no": "Norway", "ee": "Estonia", "lv": "Latvia", "lu": "Luxembourg", "az": "Azerbaijan", "ge": "Georgia",
    "nz": "New Zealand", "pe": "Peru", "ec": "Ecuador", "uy": "Uruguay", "py": "Paraguay", "cr": "Costa Rica",
    "gb-wls": "Wales", "gb-eng": "England", "gb-nir": "Northern Ireland", "ci": "Ivory Coast", "dz": "Algeria",
    "ng": "Nigeria", "ke": "Kenya", "gh": "Ghana", "mg": "Madagascar", "ae": "United Arab Emirates",
    "lb": "Lebanon", "iq": "Iraq", "kw": "Kuwait", "qa": "Qatar", "bh": "Bahrain", "om": "Oman",
}

# national championships: one series per country, generated from the nat_<cc>_draft.json files
NAT_NAME = {"gb": "UK Beatbox Championships", "us": "USA Beatbox Championships", "gb-sct": "Scottish Beatbox Championships",
            "kr": "Korea Beatbox Championship", "cn": "China Beatbox Championship", "es": "Spanish Beatbox Battle",
            "nl": "Dutch Beatbox Battle", "pl": "Polish Beatbox Battle", "lt": "Lithuanian Beatbox Battle"}
NAT_EXTRA = {"il", "nl"}  # series that also get hand-entered editions
nat_codes = sorted({f[4:-11] for f in os.listdir(DRAFTS) if f.startswith("nat_") and f.endswith("_draft.json")} | NAT_EXTRA)
for cc in nat_codes:
    COMPETITIONS.append({
        "id": f"nat_{cc}", "name": NAT_NAME.get(cc, f"{COUNTRY_NAMES.get(cc, cc.upper())} Beatbox Championship"),
        "scope": "national", "country": cc, "categories": ["solo", "7_to_smoke"], "national_title_category": "solo"})
for comp in COMPETITIONS:
    if comp["id"] == "gbc":
        comp["scope"] = "national"
        comp["id_note"] = "German national championship"
KEEP_CATS = {"solo", "solo_global", "7_to_smoke"}
for comp in COMPETITIONS:
    comp["history_file"] = f"history/{comp['id']}.json"
    comp["categories"] = [c for c in comp.get("categories", []) if c in KEEP_CATS]
    if "qualifies" in comp:
        comp["qualifies"] = [q for q in comp["qualifies"] if q["category"] in KEEP_CATS]
DRAFT_NAME = {"gbb_second_league": "gbbsl"}

# people the user added by hand (no wiki results needed)
MANUAL_PEOPLE = [
    ("Z-Vol", "ar"), ("Jollux", "co"), ("Kodless", "co"), ("EXALLOS", "co"), ("Lean", "ni"),
    ("Jene", "jp"), ("Ray", "jp"), ("S1on", "jp"), ("Samer", "jo"),
    ("Dropical", "kz"), ("T3ranos", "kz"), ("Dvrksup", "kz"), ("Syak", "tn"),
]
MANUAL_NOTES = {"lean": "No national championship in Nicaragua, but clearly the best there."}
COUNTRY_OVERRIDE = {"osis": ["ie", "lv"],  # Osis represents Ireland now
                    "patbox": ["fr", "ci"], "river": ["fr", "co"], "colaps": ["fr", "co"]}

TEAM_CATS = {"tag_team", "crew", "tag_team_loopstation"}

# slug -> canonical slug (spelling variants / renamed artists)
ALIASES = {
    "gene": "geneshinozaki",
    "audicalvocodah": "vocodah", "audical": "vocodah",
    "arthurban": "bookieblanco",
    "petebox": "thepetebox",
    "jarnoibarra": "ibarra",
    "inertia": "kinginertia",
    "thisone": "dynamatt",
    "heiwatoasty": "boyette",
}
# preferred display names
DISPLAY = {"geneshinozaki": "Gene Shinozaki", "river": "River'", "skiller": "Skiller", "inkie": "Inkie",
           "wing": "WinG", "kim": "K.I.M.", "vocodah": "Vocodah", "bookieblanco": "Bookie Blanco",
           "thepetebox": "THePETEBOX", "hhas": "H-has", "heartgrey": "Heartgrey", "bataco": "BATACO",
           "gon": "Gon", "funkaztek": "FunkAzteK", "roe": "ROE", "sarukani": "SARUKANI", "dice": "DICE",
           "rusy": "RUSY", "sema": "SE-MA", "zvol": "Z-Vol", "exallos": "EXALLOS", "boyette": "BOYETTE"}


def clean_name(name):
    n = re.sub(r"<[^>]*>", "", name)
    n = re.sub(r"[|*]", " ", n)
    n = re.sub(r"^\s*\d+\s*[-.]\s*", "", n)
    n = re.sub(r"^\s*\d{1,2}\s+(?=[A-Za-z])", "", n)
    n = re.sub(r"\s*\([^)]*\)\s*$", "", n)
    n = re.sub(r"\s+\d/\d\s*$", "", n)
    n = re.sub(r"\s+\d{1,2}\s*$", "", n)
    n = re.sub(r"\s+", " ", n).strip().rstrip("'’").strip()
    return n or name.strip()


def slug(name):
    name = clean_name(name).translate(str.maketrans("аеорсхАЕОРСХ", "aeopcxAEOPCX"))  # Cyrillic look-alikes
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = re.sub(r"[^a-z0-9]", "", s)
    return ALIASES.get(s, s)


def P(name, *countries):
    return {"name": name, "countries": list(countries)}


def battle(rnd, w, l, score=None):
    b = {"round": rnd, "a": w, "b": l, "winner": w["name"]}
    if score:
        b["score"] = score
    return b


ch = "ch"
marzel, knack = P("Marzel", ch), P("Knackeboul", ch)
beatb, keum, steff = P("BeatBrenning", "de"), P("Keumart", ch), P("Steff la Cheffe", ch)
skiller, krnfx, babeli = P("Skiller", "bg"), P("KRNFX", "ca"), P("Babeli", "de")
ballzee, zani, scott = P("Ball-Zee", "gb"), P("MC Zani", "gb"), P("Scott Jackson", "ca")
denis = P("Denis the Menace", ch)
MANUAL = [
    {"year": 2009, "name": "Grand Beatbox Battle 2009", "edition": 1, "location": "Switzerland", "country": "ch",
     "source": "user", "categories": {"solo": {
         "judges": [P(n, ch) for n in ("Camero", "Hampi", "Stella", "ROE", "Ciaccolo", "ZeDe")],
         "battles": [battle("Final", marzel, knack)]}}},
    {"year": 2010, "name": "Grand Beatbox Battle 2010", "edition": 2, "location": "Switzerland", "country": "ch",
     "source": "user", "categories": {"solo": {
         "judges": [P("Bee Low", "de")] + [P(n, ch) for n in ("Camero", "Stella", "Hampi", "ROE", "Chocolocolo", "Knackeboul")],
         "battles": [
             battle("Top 8", marzel, P("Philos", "fr")), battle("Top 8", keum, denis),
             battle("Top 8", beatb, P("Duke", "gb")), battle("Top 8", steff, P("Bösi Beatbox", ch)),
             battle("Semifinal", marzel, keum), battle("Semifinal", beatb, steff),
             battle("Final", marzel, beatb)]}}},
    {"year": 2011, "name": "Grand Beatbox Battle 2011", "edition": 3, "location": "Switzerland", "country": "ch",
     "source": "user", "categories": {"solo": {
         "judges": [P(n, ch) for n in ("Camero", "ZeDe", "Stella", "Hampi")] + [P("Bee Low", "de"), P("NeXor", "at"), P("Lytos", "es")],
         "battles": [
             battle("Top 8", krnfx, P("Zeph", "fr")), battle("Top 8", beatb, denis),
             battle("Top 8", skiller, P("K.I.M.", "fr")), battle("Top 8", babeli, scott),
             battle("Semifinal", krnfx, beatb), battle("Semifinal", skiller, babeli),
             battle("Final", skiller, krnfx)]}}},
    {"year": 2012, "name": "Grand Beatbox Battle 2012", "edition": 4, "location": "Switzerland", "country": "ch",
     "source": "user", "categories": {"solo": {
         "judges": [P("ZeDe", ch), P("Bee Low", "de"), P("Steff la Cheffe", ch), P("K.I.M.", "fr")],
         "battles": [
             battle("Top 8", ballzee, P("Dharni", "sg")), battle("Top 8", krnfx, P("Ibarra", "nl")),
             battle("Top 8", skiller, scott), battle("Top 8", zani, babeli),
             battle("Semifinal", ballzee, krnfx), battle("Semifinal", skiller, zani),
             battle("Final", ballzee, skiller)]}}},
]

draft = load_draft("gbb")
fbb_draft = load_draft("fbb")
editions = MANUAL + draft
EDITION_NO = {2013: 5, 2014: 6, 2015: 7, 2016: 8, 2017: 9, 2018: 10, 2019: 11, 2021: 12,
              2023: 13, 2024: 14, 2025: 15, 2026: 16, 2027: 17}
for e in editions:
    e.setdefault("source", "beatbox.fandom.com")
    if "edition" not in e and e["year"] in EDITION_NO:
        e["edition"] = EDITION_NO[e["year"]]

# manual fixes the parser cannot read
by_year = {e["year"]: e for e in editions}
fix = by_year[2025]["categories"]
if not fix["producer"].get("champion"):
    fix["producer"]["battles"] = [battle("Final", P("Watt", "cz"), P("LFO", "cn"), "3 - 2")]
fix["crew"]["placements"] = [{"rank": "1", "name": "The Beatbox House"}, {"rank": "2", "name": "orbitt"}, {"rank": "3", "name": "Recoll"}]
by_year[2026]["categories"].pop("studio", None)
by_year[2027]["status"] = "upcoming"
for y, e in by_year.items():
    if y not in (2027,):
        e["status"] = "completed"
by_year[2020]["format_note"] = "Online edition"
for e in editions:
    e["_comp"] = "gbb"

# ---------- Florida Beatbox Battle ----------
FBB_EDITION_NO = {2020: 4, 2022: 5, 2023: 6, 2024: 7, 2025: 8, 2026: 9}
QF_NOTE = ("Quarterfinals were a round robin: each beatboxer battled two opponents, two wins advanced, "
           "two losses meant elimination, and 1-1 records went to a tiebreaker.")
for e in fbb_draft:
    e["_comp"] = "fbb"
    e["source"] = "beatbox.fandom.com"
    e["status"] = "completed"
    e["name"] = f"Florida Beatbox Battle {e['year']}"
    if e["year"] in FBB_EDITION_NO:
        e["edition"] = FBB_EDITION_NO[e["year"]]
    if "solo" in e["categories"]:
        e["categories"]["solo"]["format_note"] = QF_NOTE
    if e["year"] == 2020:
        e["format_note"] = "Pe4enkata could not attend, so the audience acted as the 5th judge."
    vwc = e["categories"].get("vocobox_world_cup")
    if vwc:
        vwc["notes"] = ["Exhibition category for the judges; the small final had no announced result."]
editions = editions + fbb_draft

# ---------- the other competitions ----------
ORDINAL = re.compile(r"^(\d+)(?:st|nd|rd|th)\b")
for comp in COMPETITIONS:
    cid = comp["id"]
    if cid in ("gbb", "fbb"):
        continue
    for e in load_draft(DRAFT_NAME.get(cid, cid)):
        e["_comp"] = cid
        e["source"] = "beatbox.fandom.com"
        m = ORDINAL.match(e["name"])
        if m:
            e["edition"] = int(m.group(1))
        cats = e["categories"]
        if cid == "bbwc" and e["year"] == 2005 and "crew" in cats:
            cats["crew"]["placements"] = [{"rank": "1", "name": "Attention Deficit Disaudio"}]
            cats["crew"]["notes"] = ["Three-crew final: Attention Deficit Disaudio beat 4xSample and Beatoxic."]
        if cid == "gbc" and e["year"] == 2024:
            cats.pop("u18", None)
            if "7_to_smoke" in cats:
                cats["7_to_smoke"]["champion_override"] = "Osis"
                cats["7_to_smoke"]["co_champion"] = "Adi Kerang"
                cats["7_to_smoke"]["notes"] = ["A scoring error in the final led the organizers to name Osis and Adi Kerang joint champions."]
        if cid == "ebc" and "solo" in cats:
            cats["solo"]["format_note"] = "Live group stage (four groups of four, top two advance) followed by an 8-person knockout bracket."
        if cid == "nat_ma" and e["year"] == 2022:
            cats["solo"] = {"battles": [battle("Final", P("Fabley", "ma"), P("G-Man", "ma")),
                                        battle("Third place", P("Mochy", "ma"), P("caliya", "ma"))]}
        mm = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)", e["name"])
        if cid == "botm" and mm:
            e["month"] = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                          "October", "November", "December"].index(mm.group(1)) + 1
        editions.append(e)

# hand-entered results from the user
editions.append({"_comp": "nat_il", "year": 2025, "name": "Israeli Beatbox Championship 2025", "country": "il",
                 "source": "user", "categories": {"solo": {"battles": [battle("Final", P("Max", "il"), P("Hippy", "il"))]}}})
editions.append({"_comp": "nat_nl", "year": 2026, "name": "Dutch Beatbox Battle 2026", "country": "nl", "source": "user",
                 "categories": {"solo": {"placements": [
                     {"rank": "1", "name": "Benja", "countries": ["nl"]}, {"rank": "2", "name": "Duzzy", "countries": ["nl"]},
                     {"rank": "3", "name": "Youri", "countries": ["nl"]}, {"rank": "4", "name": "Infernape", "countries": ["nl"]}]}}})
editions.append({"_comp": "nat_ie", "year": 2026, "name": "Irish Beatbox Championships 2026", "country": "ie", "source": "user",
                 "judges": [P("Osis", "ie"), P("Undefined", "ie"), P("Crythix", "dk")], "categories": {}})

# solo only from here on (plus 7 to Smoke)
for e in editions:
    e["categories"] = {c: d for c, d in e["categories"].items() if c in KEEP_CATS}
    has_result = any(d.get("battles") or d.get("placements") or d.get("scores") or d.get("champion_override")
                     for d in e["categories"].values())
    e["status"] = "upcoming" if e["year"] >= SIM_START else ("completed" if has_result else "results_missing")


def drop_placeholders(o):
    if isinstance(o, list):
        return [drop_placeholders(x) for x in o
                if not (isinstance(x, dict) and re.sub(r"\W", "", str(x.get("name", ""))).lower() in ("tba", "tbd", "na"))]
    if isinstance(o, dict):
        return {k: drop_placeholders(v) for k, v in o.items()}
    return o


editions = [drop_placeholders(e) for e in editions]

# ---------- registry ----------
people = defaultdict(lambda: {"names": Counter(), "countries": Counter(), "roles": set()})
teams = defaultdict(lambda: {"names": Counter(), "countries": Counter(), "members": [], "kind": set()})


def reg_person(ent, role):
    sid = slug(ent["name"])
    if not sid:
        return None
    p = people[sid]
    p["names"][clean_name(ent["name"]).translate(str.maketrans("аеорсхАЕОРСХ", "aeopcxAEOPCX"))] += 1
    for c in ent.get("countries", []):
        p["countries"][c] += 1
    p["roles"].add(role)
    return sid


def reg_team(ent, kind):
    tid = slug(ent["name"])
    t = teams[tid]
    t["names"][clean_name(ent["name"])] += 1
    for c in ent.get("countries", []):
        t["countries"][c] += 1
    t["kind"].add(kind)
    mids = []
    team_cc = ent.get("countries", [])
    for m in ent.get("members", []) or []:
        inherit = team_cc if len(team_cc) == 1 else []
        mid = reg_person(m if m.get("countries") else {**m, "countries": inherit}, "competitor")
        if mid:
            mids.append(mid)
    if mids and not t["members"]:
        t["members"] = mids
    return tid


def ref(ent, cat, role="competitor"):
    if not ent:
        return None
    if cat in TEAM_CATS and role == "competitor":
        return {"team": reg_team(ent, cat)}
    return {"beatboxer": reg_person(ent, role)}


def conv_name(name, cat):
    return {"team": slug(name)} if cat in TEAM_CATS else {"beatboxer": slug(name)}


ROUND_ORDER = ["7 to Smoke", "Round of 64", "Top 32", "Top 16", "Quarterfinal round", "Quarterfinal tiebreaker", "Top 8",
               "Semifinal round", "Semifinal tiebreaker", "Semifinal", "Third place", "Final"]
out_editions = []
for e in sorted(editions, key=lambda x: (x["_comp"], x["year"], x.get("month", 0))):
    oe = {k: e[k] for k in ("year", "month", "name", "edition", "status", "dates", "location", "country", "venue", "format_note", "source") if e.get(k) is not None}
    oe["_comp"] = e["_comp"]
    if e.get("judges"):
        oe["judges"] = [ref(j, None, "judge") for j in e["judges"]]
    if e.get("wildcard_judges"):
        oe["wildcard_judges"] = [ref(j, None, "judge") for j in e["wildcard_judges"]]
    oe["categories"] = {}
    for c, d in e["categories"].items():
        od = {}
        battles = sorted([b for b in d.get("battles", []) if b.get("winner")], key=lambda b: ROUND_ORDER.index(b["round"]))
        fin = [b for b in battles if b["round"] == "Final" and b.get("winner")]
        champ = runner = None
        if d.get("champion_override"):
            champ = d["champion_override"]
        elif fin:
            champ = fin[0]["winner"]
            runner = fin[0]["b"]["name"] if fin[0]["a"]["name"] == champ else fin[0]["a"]["name"]
        elif d.get("scores"):
            champ = max(d["scores"], key=lambda s: s["points"] or 0)["name"]
        elif d.get("placements"):
            r1 = [p["name"] for p in d["placements"] if p["rank"] == "1"]
            r2 = [p["name"] for p in d["placements"] if p["rank"] == "2"]
            champ, runner = (r1[0] if r1 else None), (r2[0] if r2 else None)
        third = [b for b in battles if b["round"] == "Third place" and b.get("winner")]
        if champ:
            od["champion"] = conv_name(champ, c)
        if d.get("co_champion"):
            od["co_champion"] = conv_name(d["co_champion"], c)
        if runner:
            od["runner_up"] = conv_name(runner, c)
        if third:
            od["third"] = conv_name(third[0]["winner"], c)
        if d.get("participants"):
            od["participants"] = []
            for p in d["participants"]:
                r = ref(p, c)
                if not r or not (r.get("beatboxer") or r.get("team")):
                    continue
                if p.get("qualification"):
                    r["qualification"] = p["qualification"]
                od["participants"].append(r)
        for key in ("judges", "wildcard_judges"):
            if d.get(key):
                od[key] = [ref(j, None, "judge") for j in d[key]]
        if battles:
            od["battles"] = []
            for b in battles:
                ob = {"round": b["round"], "a": ref(b["a"], c), "b": ref(b["b"], c) if b["b"] else None}
                if b.get("winner"):
                    ob["winner"] = conv_name(b["winner"], c)
                if b.get("score"):
                    ob["score"] = b["score"]
                ids = [x.get("beatboxer") or x.get("team") for x in (ob["a"], ob["b"], ob.get("winner")) if x is not None]
                if len(ids) < 3 or not all(ids):
                    continue
                od["battles"].append(ob)
        for key in ("placements", "seeding"):
            for p in d.get(key, []):
                if p.get("countries"):
                    reg_person(p, "competitor")
            if d.get(key):
                od[key] = [{"rank": int(p["rank"]), **conv_name(p["name"], c)} for p in d[key]]
        if d.get("scores"):
            od["points"] = [{**conv_name(s["name"], c), "points": s["points"]} for s in d["scores"]]
        if d.get("wildcard_runners_up"):
            od["wildcard_runners_up"] = [{**ref(p, None), "place": p["place"]} for p in d["wildcard_runners_up"]]
        if d.get("format_note"):
            od["format_note"] = d["format_note"]
        if d.get("notes"):
            od["notes"] = d["notes"]
        if od:
            oe["categories"][c] = od
    out_editions.append(oe)

# make sure every referenced id exists in the registry
def walk(o, cat=None):
    if isinstance(o, dict):
        if "beatboxer" in o and o["beatboxer"] and o["beatboxer"] not in people:
            people[o["beatboxer"]]["names"][o["beatboxer"]] += 1
        if "team" in o and o["team"] not in teams:
            teams[o["team"]]["names"][o["team"]] += 1
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)
walk(out_editions)
manual_ids = set()
for nm, cc in MANUAL_PEOPLE:
    sid = reg_person(P(nm, cc), "competitor")
    manual_ids.add(sid)

people.pop(None, None)
people.pop("", None)
beatboxers = []
for sid, p in sorted(people.items()):
    name = DISPLAY.get(sid) or p["names"].most_common(1)[0][0]
    aliases = sorted({n for n in p["names"] if n != name})
    countries = COUNTRY_OVERRIDE.get(sid) or [c for c, _ in p["countries"].most_common()]
    entry = {"id": sid, "name": name, "country": countries[0] if countries else None, "countries": countries}
    if aliases:
        entry["aliases"] = aliases
    if sid in manual_ids:
        entry["added_by_user"] = True
    if sid in MANUAL_NOTES:
        entry["note"] = MANUAL_NOTES[sid]
    beatboxers.append(entry)

competitions = COMPETITIONS

os.makedirs(os.path.join(out_dir, "history"), exist_ok=True)


def dump(obj, path):
    with open(os.path.join(out_dir, path), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

for comp in [c["id"] for c in COMPETITIONS]:
    eds = [{k: v for k, v in oe.items() if k != "_comp"} for oe in out_editions if oe["_comp"] == comp]
    dump({"competition": comp, "editions": eds}, f"history/{comp}.json")
dump(beatboxers, "beatboxers.json")
dump(competitions, "competitions.json")
dump({code: {"name": n} for code, n in sorted(COUNTRY_NAMES.items())}, "country_names.json")
if os.path.exists(os.path.join(out_dir, "teams.json")):
    os.remove(os.path.join(out_dir, "teams.json"))

print("competitions", len(COMPETITIONS), "editions", len(out_editions), "beatboxers", len(beatboxers))
for oe in out_editions:
    if oe["status"] != "completed" or "solo" not in oe["categories"] or "champion" not in oe["categories"].get("solo", {}):
        print("CHECK", oe["_comp"], oe["year"], oe.get("month", ""), oe["status"], list(oe["categories"]))
