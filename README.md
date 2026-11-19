# Beatbox World Simulator

A career and competition simulator for the beatbox scene, played in the browser.

## Planned features

- Real beatboxers with ratings and a potential rating
- Careers that rise, peak, decline, and end in retirement, including stepping away after winning too much
- Every national championship simulated each season, with all national champions listed
- Wildcard rounds with cutscenes for wildcard winners and champions
- Custom tournaments

## Project layout

```
index.html               game entry point (GitHub Pages serves this)
data/beatboxers.json     every beatboxer/judge with country, estimated rating, potential, status
data/countries.json      country level, top active beatboxers, national champions by year
data/competitions.json   competition definitions, GBB qualification routes, BBWC entry rules
data/country_names.json  country code -> name
data/history/<id>.json   solo results per competition (see below)
tools/                   scripts that rebuild the data from wiki source and re-run the estimates
```

Only Solo is tracked (plus 7 to Smoke and the German Solo Global). Tag team, loopstation,
crew and youth categories are left out on purpose.

| id | Competition | Years |
|---|---|---|
| gbb | Grand Beatbox Battle | 2009-2026, 2027 qualified list |
| gbb_second_league | GBB Second League | 2026 |
| bbwc | Beatbox Battle World Championship (every ~4 years) | 2005-2023, 2027 qualified list |
| ebc | European Beatbox Championship | 2023 (returns 2027) |
| fbb, gnb, mba, apac, amrq, bcj | GBB qualifiers: Florida, Great North, Maestro Beatbox America, APAC, Africa & MENA, BeatCity Japan | various |
| btw, lacup, vokal_total, bayreuth, one_one, nue, botm | International and invitational events | various |
| nat_<country> | National championships (50+ countries, e.g. nat_fr, nat_kr, nat_gb-sct) | various |

The simulation starts in 2027; everything before that is real history.

## Ratings (first estimates, meant to be corrected by hand)

`tools/ratings.py` walks every solo result in date order and keeps an Elo per beatboxer:

- **Placement bonuses** from `data/elo_rules.json` (the user's table). Bonuses stack by stage:
  a GBB winner gets qualify + seed bonuses + top 8 + top 4 + final + win (+230); a French national
  winner gets +32; a small national winner +7. The sim should use the same table for future seasons.
- **Battles** also exchange a little Elo (K = battle_k x win bonus / 75).
- **Season fade**: each new season everyone keeps `season_fade` (80%) of their Elo above the base,
  so recent seasons count most and inactive people slide.
- `season_fade` and `battle_k` were tuned to agree best with the hand-reviewed ratings.
- **rating** (25-97): Elo mapped to the 1-99 scale by a curve fitted to the hand-reviewed ratings
  in `data/overrides.json`. No results maps to 40.
- **Hand edits** in `data/overrides.json` always win; `tools/import_edits.py` adds new ones from an edited CSV.
- **potential**: rating plus headroom for short careers and rising Elo. Less headroom near the top.
- **status**: `active` (competed 2024 or later), `judge` (stopped competing but judged recently),
  `retired`, or `removed` (set by hand: stays in the history and record books, but the game never
  uses them as a competitor, judge or comeback). People added by hand stay active.
- **retirement_risk**: chance per season the sim should retire them. Rises with career length,
  and a lot with multiple GBB/BBWC solo titles. **judge_chance**: chance they become a judge when they retire.
- **confidence**: how much battle data backs the rating (`none` means a placeholder).
- **countries.json level**: from each country's best active beatboxers; it also sets how much that
  national championship counts.

## Data sources

GBB 2009-2012 were entered by hand. Everything else comes from the Beatbox Wiki
(beatbox.fandom.com), whose text is licensed CC BY-SA.

To rebuild: `download.py` fetches page wikitext into a folder per competition (page lists in
`tools/pages_*.txt`), then run `clean_wiki.py`, `build_from_wiki.py`, `finalize.py`, `ratings.py`
and `validate.py`. Hand-entered results and people live in `finalize.py`.

## Playing

Every season from 2027 runs on a calendar built from the real event months:
national championships for every country with at least 4 active beatboxers, GBB qualifiers
(Florida, Great North, Maestro, APAC, Africa & MENA, BeatCity Japan, EBC, GBC Global Solo),
invitationals (La Cup, One One, Vokal Total, Bayreuth, NUE, Beatbox To World), Beatbox of the
Month every two months, the GBB wildcard results in May, the Second League in August, BBWC every
four years, GBB and its 7 to Smoke in September, and a season review on December 31.

- **Battles**: elimination ranking, then a seeded bracket. Five judges vote; each judge favours the
  stronger beatboxer, so upsets happen. The world ranking uses the Elo table in `data/elo_rules.json`.
- **Progression**: beating expectations raises a rating (more when there is room below potential),
  under-performing lowers it, and ups are bigger than downs. Young careers grow toward potential at
  the season review; long careers slowly decline.
- **Retirement**: each season uses the beatboxer's retirement chance. Multiple GBB/BBWC champions
  often step away after winning again. Many retirees become judges. Recent retirees can come back.
- **New names**: every country gets new prospects each season, with the odd wonderkid.
- **Qualification**: GBB top 3, the 7 to Smoke winner and the Second League winner go to the next
  GBB; qualifier champions go to the same year's GBB; wildcards fill the rest. BBWC takes national
  champions since the last edition plus the previous top 16.
- **Cutscenes** for GBB and BBWC champions, wildcard winners, legends retiring and comebacks.
  Follow a beatboxer on their profile to get a cutscene whenever they win.
- **Editing**: open any profile to change name, country, status, rating, potential, retirement and
  judge chance, or upload a picture. Edits and pictures stay in your browser.
- **Saves**: the game saves itself in the browser after every step; Settings can export and import a save file.

## Running locally

Open `index.html` through a local web server (browsers block loading the JSON data files straight from disk):

```
python -m http.server 8137
```

then go to http://localhost:8137.

## Hosting

The site is static, so GitHub Pages can host it from the `main` branch once the repo is public.
