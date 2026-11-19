// The season engine: calendar, entrant selection, battles, qualification, progression, retirements, prospects.
import { makeRng, inRegion, START_YEAR, SAVE_VERSION, MONTH_NAMES } from "./data.js";

let D = null;          // static data (loaded files)
let COMPS = {};        // competition id -> definition (incl. generated nationals)
const rngs = new WeakMap();
const rngOf = (state) => {
  let r = rngs.get(state);
  if (!r) { r = makeRng(state.seed); r.state = state.rngState; rngs.set(state, r); }
  return r;
};
const syncRng = (state) => { state.rngState = rngOf(state).state; };

export function setData(data) {
  D = data;
  COMPS = {};
  for (const c of data.competitions) COMPS[c.id] = { ...c, month: guessMonth(c.id, data.history[c.id]) };
}
export const comp = (id) => COMPS[id];
export const allComps = () => COMPS;

// ---------- calendar months from the real event dates ----------
const MONTH_RE = /(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{1,2})?/i;
const FALLBACK_MONTH = { gbb: [9, 11], bbwc: [8, 20], gbb_second_league: [8, 8], ebc: [5, 19], fbb: [4, 24],
  gnb: [5, 29], apac: [6, 20], amrq: [6, 27], bcj: [5, 6], mba: [7, 25], btw: [10, 24], lacup: [2, 26],
  vokal_total: [7, 15], bayreuth: [11, 8], nue: [6, 20], one_one: [3, 28], gbc_global: [3, 14] };
function guessMonth(id, editions = []) {
  if (FALLBACK_MONTH[id] && ["gbb", "bbwc", "gbb_second_league", "apac", "amrq"].includes(id)) return FALLBACK_MONTH[id];
  for (let i = editions.length - 1; i >= 0; i--) {
    const m = MONTH_RE.exec(editions[i].dates || "");
    if (m) return [MONTH_NAMES.findIndex((n) => n.toLowerCase() === m[1].toLowerCase()) + 1, +(m[2] || 15)];
  }
  if (FALLBACK_MONTH[id]) return FALLBACK_MONTH[id];
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return [1 + (h % 6), 1 + (h % 27)]; // nationals without dates: first half of the year
}

// ---------- event formats ----------
// field: how many enter, bracket: knockout size, pool: who can enter, bias: extra pull for some countries
const FORMATS = {
  gbb: { field: 20, bracket: 16, third: true, smoke: true },
  bbwc: { field: 48, bracket: 32, third: true },
  gbb_second_league: { field: 12, bracket: 8 },
  ebc: { field: 16, bracket: 8, pool: "europe" },
  fbb: { field: 8, bracket: 8, pool: "all", bias: { region: "europe", v: 2 } },
  gnb: { field: 16, bracket: 16, pool: "all", bias: { region: "north_america", v: 5 } },
  mba: { field: 12, bracket: 8, pool: "latin_america" },
  apac: { field: 8, bracket: 8, pool: ["asia", "oceania"] },
  amrq: { field: 12, bracket: 8, pool: "africa_mena" },
  bcj: { field: 16, bracket: 8, pool: "all", bias: { country: "jp", v: 9 } },
  btw: { field: 12, bracket: 8, pool: "all", bias: { region: "asia", v: 3 } },
  lacup: { field: 16, bracket: 16, invite: "mix" },
  vokal_total: { field: 8, bracket: 8, invite: "6+2" },
  bayreuth: { field: 8, bracket: 8, invite: "6+2", bias: { region: "europe", v: 4 } },
  one_one: { field: 8, bracket: 8, invite: "6+2", smoke: true },
  nue: { field: 20, bracket: 16, pool: "europe", bias: { country: "gb", v: 7 }, smoke: true },
  botm: { field: 24, bracket: 16, pool: "botm" },
  gbc_global: { field: 12, bracket: 8, pool: "europe", bias: { country: "de", v: 3 } },
};
const BOTM_COUNTRIES = new Set("de at ch nl be dk pl cz fr it lu".split(" "));
const QUALIFIER_COMPS = ["fbb", "gnb", "mba", "apac", "amrq", "bcj", "ebc", "gbc_global"];

// ---------- new game ----------
export function newGame(seed = (Date.now() % 2147483647)) {
  const people = {};
  for (const b of D.beatboxers) {
    const rating = b.rating ?? (b.status === "judge" ? 60 : null);
    people[b.id] = {
      id: b.id, name: b.name, country: b.country || null, countries: b.countries || [],
      status: b.status || "unknown", rating, potential: b.potential ?? rating, peak: b.peak_rating ?? rating,
      elo: b.elo ?? 1000, debut: b.debut ?? null, lastCompeted: b.last_competed ?? null,
      retirementRisk: b.retirement_risk ?? 0.08, judgeChance: b.judge_chance ?? 0.3,
      titles: (Object.values(b.titles || {}).flat()).map((t) => ({ comp: t.competition, year: t.year, cat: t.category, real: true })),
      form: 0, hist: rating != null ? [{ y: 2026, r: rating, e: b.elo ?? 1000 }] : [], aliases: b.aliases || [],
      note: b.note || "", handEdited: !!b.hand_edited,
    };
  }
  const state = {
    version: SAVE_VERSION, seed, rngState: seed, year: START_YEAR, cursor: 0,
    people, season: null, archive: {}, news: [], customs: [], pending: [],
    qualified: {}, wildcardRunnersUp: {}, nationalChamps: {}, generated: 0,
    settings: { cutscenes: true, sound: true, nationalCutscenes: false, favorites: [] },
  };
  rngOf(state);
  // GBB 2027 places already decided in real life
  const gbb27 = (D.history.gbb || []).find((e) => e.year === START_YEAR);
  for (const p of gbb27?.categories?.solo?.participants || []) {
    if (p.beatboxer && people[p.beatboxer]?.status === "active") addQualified(state, START_YEAR, p.beatboxer, p.qualification || "Qualified");
  }
  // national champions since the last BBWC (2023) count for BBWC 2027
  for (const [cid, eds] of Object.entries(D.history)) {
    const c = COMPS[cid];
    if (c?.scope !== "national") continue;
    for (const e of eds) {
      const ch = e.categories?.[c.national_title_category || "solo"]?.champion?.beatboxer;
      if (ch && e.year > 2023) (state.nationalChamps[e.year] ||= []).push({ id: ch, country: c.country, comp: cid });
    }
  }
  state.season = buildSeason(state, START_YEAR);
  syncRng(state);
  return state;
}

function addQualified(state, year, id, reason) {
  const list = (state.qualified[year] ||= []);
  if (!list.some((q) => q.id === id)) list.push({ id, reason });
}

// ---------- helpers ----------
export const activePeople = (state) => Object.values(state.people).filter((p) => p.status === "active" && p.rating != null);
const eff = (p) => p.rating + (p.form || 0);
const countryName = (cc) => D.countryNames[cc]?.name || D.countries[cc]?.name || (cc || "").toUpperCase();

function nationalCompId(cc) {
  const found = Object.values(COMPS).find((c) => c.scope === "national" && c.country === cc && c.id !== "gbc");
  return found ? found.id : `nat_${cc}`;
}

// ---------- season calendar ----------
export function buildSeason(state, year) {
  const events = [];
  const act = activePeople(state);
  const byCountry = {};
  for (const p of act) if (p.country) (byCountry[p.country] ||= []).push(p);
  const add = (compId, name, month, day, extra = {}) =>
    events.push({ key: `${compId}-${year}-${month}-${day}`, comp: compId, name, year, month, day, status: "upcoming", ...extra });

  // national championships: every country with at least 4 active beatboxers
  for (const [cc, list] of Object.entries(byCountry)) {
    if (list.length < 4) continue;
    if (cc === "de") {
      const [m, d] = COMPS.gbc.month;
      add("gbc", `German Beatbox Championship ${year}`, m, d, { national: "de" });
      add("gbc_global", `GBC Global Solo ${year}`, m, Math.min(28, d + 1), { qualifier: true });
      continue;
    }
    const id = nationalCompId(cc);
    if (!COMPS[id]) COMPS[id] = { id, name: `${countryName(cc)} Beatbox Championship`, scope: "national", country: cc,
      generated: true, month: guessMonth(id, []), national_title_category: "solo" };
    const [m, d] = COMPS[id].month;
    add(id, `${COMPS[id].name} ${year}`, m, d, { national: cc });
  }
  const yearly = ["lacup", "one_one", "fbb", "bcj", "ebc", "gnb", "nue", "apac", "amrq", "vokal_total", "mba", "btw", "bayreuth"];
  for (const id of yearly) {
    if (!COMPS[id]) continue;
    const [m, d] = COMPS[id].month;
    add(id, `${COMPS[id].name} ${year}`, m, d, { qualifier: QUALIFIER_COMPS.includes(id) });
  }
  for (const m of [2, 4, 6, 8, 10, 12]) add("botm", `Beatbox of the Month – ${MONTH_NAMES[m - 1]} ${year}`, m, 20);
  add("gbb_wildcards", `GBB ${year} Wildcard Results`, 5, 15, { kind: "wildcards" });
  add("gbb_second_league", `GBB ${year}: Second League`, 8, 8);
  if ((year - 2023) % 4 === 0) add("bbwc", `Beatbox Battle World Championship ${year}`, 8, 20);
  add("gbb", `Grand Beatbox Battle ${year}`, 9, 11);
  add("gbb_7ts", `GBB ${year} 7 to Smoke`, 9, 12, { kind: "smoke", parent: "gbb" });
  add("season_review", `Season ${year} Review`, 12, 31, { kind: "review" });
  events.sort((a, b) => a.month - b.month || a.day - b.day || a.key.localeCompare(b.key));
  return { year, events };
}

export const nextEvent = (state) => state.season.events.find((e) => e.status === "upcoming");

// ---------- picking entrants ----------
function pool(state, f, ev) {
  let list = activePeople(state);
  if (ev.national) list = list.filter((p) => p.country === ev.national);
  else if (f.pool === "botm") list = list.filter((p) => BOTM_COUNTRIES.has(p.country));
  else if (f.pool && f.pool !== "all") {
    const regions = [].concat(f.pool);
    list = list.filter((p) => regions.some((r) => inRegion(p.country, r)));
  }
  return list;
}

function pickEntrants(state, ev) {
  const r = rngOf(state);
  const f = FORMATS[ev.comp] || { field: 16, bracket: 16 };
  if (ev.national) {
    const list = pool(state, f, ev);
    const size = list.length >= 24 ? 24 : list.length >= 16 ? 16 : list.length >= 8 ? Math.min(12, list.length) : list.length;
    // most national names show up; sometimes a top name skips
    return list.map((p) => ({ p, s: eff(p) + r.normal(0, 6) - (r.chance(0.12) ? 30 : 0) }))
      .sort((a, b) => b.s - a.s).slice(0, size).map((x) => x.p.id);
  }
  const qualifiedNow = new Set((state.qualified[ev.year] || []).map((q) => q.id));
  if (f.invite) {
    const list = activePeople(state).filter((p) => !f.bias || !f.bias.region || inRegion(p.country, f.bias.region) || r.chance(0.35));
    const stars = list.map((p) => ({ p, s: eff(p) + r.normal(0, 4) })).sort((a, b) => b.s - a.s);
    const prospects = list.filter((p) => p.rating >= 60).map((p) => ({ p, s: (p.potential - p.rating) * 1.4 + p.rating * 0.4 + r.normal(0, 4) }))
      .sort((a, b) => b.s - a.s);
    const out = [];
    const take = (arr, n) => { for (const x of arr) { if (out.length >= n) break; if (!out.includes(x.p.id)) out.push(x.p.id); } };
    if (f.invite === "mix") { take(stars, 6); take(prospects, 12); take(r.shuffle(stars.slice(10, 80)), f.field); }
    else { take(stars.slice(0, 18).filter(() => r.chance(0.6)), 6); take(stars, 6); take(prospects, 8); }
    return out.slice(0, f.field);
  }
  const list = pool(state, f, ev);
  const scored = list.map((p) => {
    let s = eff(p) + r.normal(0, ev.comp === "botm" ? 9 : 6);
    if (f.bias?.region && inRegion(p.country, f.bias.region)) s += f.bias.v;
    if (f.bias?.country && p.country === f.bias.country) s += f.bias.v;
    if (ev.qualifier && qualifiedNow.has(p.id)) s -= 25; // already in GBB: usually skip qualifiers
    if (ev.comp === "botm") { const attend = p.rating > 82 ? 0.08 : p.rating > 74 ? 0.3 : 0.75; if (!r.chance(attend)) s -= 100; }
    return { p, s };
  }).filter((x) => x.s > -50).sort((a, b) => b.s - a.s);
  return scored.slice(0, f.field).map((x) => x.p.id);
}

// ---------- one battle, five judges ----------
export function battle(state, aId, bId, round) {
  const r = rngOf(state);
  const a = state.people[aId], b = state.people[bId];
  const ea = eff(a) + r.normal(0, 2.4), eb = eff(b) + r.normal(0, 2.4);
  const p = Math.min(0.97, Math.max(0.03, 1 / (1 + Math.pow(10, (eb - ea) / 14))));
  let va = 0;
  for (let j = 0; j < 5; j++) if (r.next() < p) va++;
  return { round, a: aId, b: bId, w: va >= 3 ? aId : bId, votes: [va, 5 - va] };
}

const ROUND_NAME = { 64: "Top 64", 32: "Top 32", 16: "Top 16", 8: "Top 8", 4: "Semifinal", 2: "Final" };
function seedOrder(n) {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2 + 1;
    order = order.flatMap((s) => [s, m - s]);
  }
  return order;
}

// elimination round + knockout bracket
export function runBracket(state, entrants, { bracket = 16, third = false, elimination = true } = {}) {
  const r = rngOf(state);
  let size = 2;
  while (size * 2 <= Math.min(bracket, entrants.length)) size *= 2;
  const elim = entrants.map((id) => ({ id, s: eff(state.people[id]) + (elimination ? r.normal(0, 3.2) : 0) }))
    .sort((a, b) => b.s - a.s).map((x) => x.id);
  const seeds = elim.slice(0, size);
  let current = seedOrder(size).map((s) => seeds[s - 1]);
  const battles = [];
  const reached = {}; // id -> best round size reached
  for (const id of seeds) reached[id] = size;
  let semiLosers = [];
  while (current.length > 1) {
    const rs = current.length;
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const bt = battle(state, current[i], current[i + 1], ROUND_NAME[rs] || `Top ${rs}`);
      battles.push(bt);
      next.push(bt.w);
      reached[bt.w] = rs / 2;
      if (rs === 4) semiLosers.push(bt.w === bt.a ? bt.b : bt.a);
    }
    current = next;
  }
  const champion = current[0];
  const finalB = battles[battles.length - 1];
  const runnerUp = finalB.w === finalB.a ? finalB.b : finalB.a;
  let thirdId = null;
  if (third && semiLosers.length === 2) {
    const bt = battle(state, semiLosers[0], semiLosers[1], "Third place");
    battles.splice(battles.length - 1, 0, bt);
    thirdId = bt.w;
  }
  // full standings: champion, runner-up, third, then by round reached, then elimination order
  const order = [champion, runnerUp];
  if (thirdId) order.push(thirdId, semiLosers.find((x) => x !== thirdId));
  const rest = elim.filter((id) => !order.includes(id))
    .sort((a, b) => (reached[a] || 999) - (reached[b] || 999) || elim.indexOf(a) - elim.indexOf(b));
  return { elimination: elim, bracketSize: size, battles, champion, runnerUp, third: thirdId, standings: order.concat(rest), reached };
}

// 7 to Smoke: king of the hill, first to 7 points
export function runSmoke(state, entrants) {
  const queue = entrants.slice();
  const points = Object.fromEntries(entrants.map((id) => [id, 0]));
  const battles = [];
  let king = queue.shift();
  for (let n = 0; n < 60; n++) {
    const ch = queue.shift();
    const bt = battle(state, king, ch, "7 to Smoke");
    battles.push(bt);
    points[bt.w]++;
    const loser = bt.w === king ? ch : king;
    king = bt.w;
    queue.push(loser);
    if (points[king] >= 7) break;
  }
  const standings = entrants.slice().sort((a, b) => points[b] - points[a]);
  return { battles, points, champion: standings[0], runnerUp: standings[1], standings };
}

// ---------- Elo bonuses from the user's table ----------
const LADDER = ["qualify", "top32", "top16", "top8", "top4", "final", "win"];
function ruleFor(compId) {
  const R = D.eloRules;
  if (compId === "gbb_7ts" || compId.endsWith("_7ts")) return R.seven_to_smoke;
  if (compId === "gbc") return R.competitions.gbc.solo;
  if (compId === "gbc_global") return R.competitions.gbc.solo_global;
  return R.competitions[compId] || (COMPS[compId]?.scope === "national" ? R.default_national : { final: 5, win: 10 });
}
function stagesOf(res, id) {
  const s = new Set(["qualify"]);
  const rc = res.reached?.[id];
  if (rc) {
    if (rc <= 32) s.add("top32");
    if (rc <= 16) s.add("top16");
    if (rc <= 8) s.add("top8");
    if (rc <= 4) s.add("top4");
    if (rc <= 2) s.add("final");
  }
  if (res.runnerUp === id) s.add("final");
  if (res.champion === id) { s.add("final"); s.add("win"); }
  if (res.third === id) s.add("third");
  return s;
}
function eloBonus(rule, stages, seed) {
  let top = -1;
  for (const st of stages) top = Math.max(top, LADDER.indexOf(st));
  let t = 0;
  for (let i = 0; i <= top; i++) t += rule[LADDER[i]] || 0;
  if (stages.has("third")) t += rule.third || 0;
  if (seed != null && seed <= 15) t += rule.seed_top15 || 0;
  if (seed != null && seed <= 10) t += rule.seed_top10 || 0;
  return t;
}

// ---------- performance-based improvement (more up than down) ----------
function applyPerformance(state, res, compId, { progression = true } = {}) {
  const rule = ruleFor(compId);
  const weight = Math.min(1, Math.max(0.15, (rule.win || 10) / 75));
  const ids = res.standings;
  const n = ids.length;
  const byRating = ids.slice().sort((a, b) => eff(state.people[b]) - eff(state.people[a]));
  const K = D.eloRules.battle_k * Math.min(1, (rule.win || 10) / 75);
  for (const b of res.battles || []) {
    const A = state.people[b.a], B = state.people[b.b];
    const ea = 1 / (1 + Math.pow(10, (B.elo - A.elo) / 400));
    const sa = b.w === b.a ? 1 : 0;
    A.elo += K * (sa - ea); B.elo -= K * (sa - ea);
  }
  ids.forEach((id, place) => {
    const p = state.people[id];
    p.elo += eloBonus(rule, stagesOf(res, id), res.elimination ? res.elimination.indexOf(id) + 1 : null);
    p.lastCompeted = state.year;
    if (p.debut == null) p.debut = state.year;
    if (!progression || n < 2) return;
    const expected = byRating.indexOf(id) / (n - 1);
    const actual = place / (n - 1);
    const perf = expected - actual; // > 0 means better than expected
    const room = Math.min(1.4, Math.max(0.15, (p.potential - p.rating) / 8));
    let delta = perf > 0 ? perf * 3.2 * weight * room : perf * 1.25 * weight;
    if (id === res.champion) delta += 0.5 * weight;
    p.rating = Math.min(99, Math.max(25, p.rating + delta));
    if (p.rating > p.potential - 0.5 && perf > 0.3) p.potential = Math.min(99, p.potential + weight); // breakout
    p.peak = Math.max(p.peak ?? p.rating, p.rating);
  });
}

// ---------- judges for flavour ----------
function pickJudges(state, ev, entrants) {
  const r = rngOf(state);
  const big = ["gbb", "bbwc", "gbb_7ts", "ebc"].includes(ev.comp);
  let cands = Object.values(state.people).filter((p) => (p.status === "judge" || (p.status === "retired" && (p.peak || 0) >= 75)) && p.rating != null);
  if (ev.national) {
    const local = cands.filter((p) => p.country === ev.national);
    cands = local.length >= 3 ? local : local.concat(activePeople(state).filter((p) => p.country === ev.national && !entrants.includes(p.id)));
  }
  return cands.map((p) => ({ id: p.id, s: (p.peak || p.rating) + r.normal(0, big ? 4 : 10) })).sort((a, b) => b.s - a.s)
    .slice(0, ev.national ? 3 : 5).map((x) => x.id);
}

// ---------- running an event ----------
export function runNext(state) {
  const ev = nextEvent(state);
  if (!ev) return null;
  const out = runEvent(state, ev);
  syncRng(state);
  return out;
}

function news(state, text, kind = "info", extra = {}) {
  state.news.unshift({ year: state.year, month: state.cursorMonth || 1, text, kind, ...extra });
  if (state.news.length > 400) state.news.length = 400;
}

function title(state, id, compId, cat = "solo") {
  state.people[id].titles.push({ comp: compId, year: state.year, cat });
}

export function runEvent(state, ev) {
  state.cursorMonth = ev.month;
  const cut = [];
  let res = null;
  if (ev.kind === "wildcards") res = runWildcards(state, ev, cut);
  else if (ev.kind === "review") res = seasonReview(state, ev, cut);
  else if (ev.kind === "smoke") res = runGbbSmoke(state, ev, cut);
  else res = runTournament(state, ev, cut);
  ev.status = res && !res.skipped ? "done" : "skipped";
  if (res) state.archive[ev.key] = { ...res, key: ev.key, comp: ev.comp, name: ev.name, year: ev.year, month: ev.month, day: ev.day, kind: ev.kind || "tournament" };
  return { event: ev, result: res, cutscenes: cut };
}

function runTournament(state, ev, cut) {
  const f = FORMATS[ev.comp] || { field: 16, bracket: 16 };
  let entrants;
  if (ev.comp === "gbb") entrants = (state.qualified[ev.year] || []).map((q) => q.id).filter((id) => state.people[id]?.status === "active");
  else if (ev.comp === "gbb_second_league") entrants = (state.wildcardRunnersUp[ev.year] || []).filter((id) => state.people[id]?.status === "active").slice(0, f.field);
  else if (ev.comp === "bbwc") entrants = bbwcEntrants(state, ev.year);
  else entrants = pickEntrants(state, ev);
  if (entrants.length < 4) return { skipped: true, reason: "Not enough entrants" };
  const res = runBracket(state, entrants, { bracket: f.bracket, third: !!f.third || entrants.length >= 12 });
  res.entrants = entrants;
  res.judges = pickJudges(state, ev, entrants);
  applyPerformance(state, res, ev.comp);
  const champ = state.people[res.champion];
  title(state, res.champion, ev.comp);
  // consequences
  if (ev.national) {
    (state.nationalChamps[ev.year] ||= []).push({ id: res.champion, country: ev.national, comp: ev.comp });
    news(state, `${champ.name} wins the ${ev.name}`, "national", { id: res.champion, event: ev.key });
    if (state.settings.nationalCutscenes || state.settings.favorites.includes(res.champion)) cut.push({ type: "champion", id: res.champion, event: ev.name, tier: "national" });
  } else {
    news(state, `${champ.name} wins ${ev.name}`, ev.comp === "gbb" || ev.comp === "bbwc" ? "major" : "event", { id: res.champion, event: ev.key });
  }
  if (ev.qualifier) {
    const nextGbbDone = state.season.events.find((e) => e.comp === "gbb")?.status === "done";
    const y = nextGbbDone ? ev.year + 1 : ev.year;
    const qualifiedIds = new Set((state.qualified[y] || []).map((q) => q.id));
    const ticket = [res.champion, res.runnerUp, res.third].find((id) => id && !qualifiedIds.has(id));
    if (ticket) {
      addQualified(state, y, ticket, `${ev.name} ${ticket === res.champion ? "Champion" : "top finisher"}`);
      news(state, `${state.people[ticket].name} qualifies for GBB ${y} through ${ev.name}`, "qualify", { id: ticket });
    }
  }
  if (ev.comp === "gbb") {
    [res.champion, res.runnerUp, res.third].filter(Boolean).forEach((id, i) =>
      addQualified(state, ev.year + 1, id, `GBB ${ev.year} Solo ${["Champion", "Vice-Champion", "3rd Place"][i]}`));
    state.gbbSmokePool = res.standings.slice(3);
    cut.push({ type: "champion", id: res.champion, event: ev.name, tier: "gbb", runnerUp: res.runnerUp });
  }
  if (ev.comp === "bbwc") cut.push({ type: "champion", id: res.champion, event: ev.name, tier: "bbwc", runnerUp: res.runnerUp });
  if (ev.comp === "gbb_second_league") {
    addQualified(state, ev.year + 1, res.champion, `GBB ${ev.year}: Second League Champion`);
    news(state, `${champ.name} wins the Second League and qualifies for GBB ${ev.year + 1}`, "qualify", { id: res.champion });
  }
  if (!ev.national && !["gbb", "bbwc"].includes(ev.comp) && state.settings.favorites.includes(res.champion))
    cut.push({ type: "champion", id: res.champion, event: ev.name, tier: "event" });
  if (f.smoke && ev.comp !== "gbb") {
    const pool7 = res.standings.slice(2, 12);
    if (pool7.length >= 6) {
      const sm = runSmoke(state, rngOf(state).shuffle(pool7).slice(0, 8));
      applyPerformance(state, { ...sm, reached: {} }, `${ev.comp}_7ts`, { progression: true });
      res.smoke = sm;
    }
  }
  return res;
}

function runGbbSmoke(state, ev, cut) {
  const r = rngOf(state);
  const fromGbb = (state.gbbSmokePool || []).filter((id) => state.people[id]?.status === "active");
  const qualifiedNext = new Set((state.qualified[ev.year + 1] || []).map((q) => q.id));
  const others = activePeople(state).filter((p) => !fromGbb.includes(p.id) && !qualifiedNext.has(p.id))
    .map((p) => ({ id: p.id, s: eff(p) + r.normal(0, 4) })).sort((a, b) => b.s - a.s).map((x) => x.id);
  const field = r.shuffle(fromGbb.slice(0, 5).concat(others.slice(0, 8 - Math.min(5, fromGbb.length)))).slice(0, 8);
  if (field.length < 6) return { skipped: true };
  const sm = runSmoke(state, field);
  applyPerformance(state, { ...sm, reached: {} }, "gbb_7ts");
  title(state, sm.champion, "gbb", "7_to_smoke");
  addQualified(state, ev.year + 1, sm.champion, `GBB ${ev.year} 7 to Smoke Champion`);
  news(state, `${state.people[sm.champion].name} wins the GBB ${ev.year} 7 to Smoke`, "event", { id: sm.champion });
  return { ...sm, entrants: field, format: "7ts" };
}

function bbwcEntrants(state, year) {
  const ids = new Set();
  for (let y = year - 3; y <= year; y++) for (const c of state.nationalChamps[y] || []) ids.add(c.id);
  // previous edition top 16 (real 2023 or simulated)
  const prev = Object.values(state.archive).filter((a) => a.comp === "bbwc" && a.year < year).sort((a, b) => b.year - a.year)[0];
  if (prev) prev.standings.slice(0, 16).forEach((id) => ids.add(id));
  else {
    const real = (D.history.bbwc || []).filter((e) => e.status === "completed").pop();
    for (const b of real?.categories?.solo?.battles || []) {
      if (["Top 16", "Top 8", "Semifinal", "Final", "Third place"].includes(b.round)) { ids.add(b.a?.beatboxer); ids.add(b.b?.beatboxer); }
    }
  }
  const real27 = (D.history.bbwc || []).find((e) => e.year === year);
  for (const p of real27?.categories?.solo?.participants || []) ids.add(p.beatboxer);
  return [...ids].filter((id) => state.people[id]?.status === "active")
    .sort((a, b) => eff(state.people[b]) - eff(state.people[a])).slice(0, FORMATS.bbwc.field);
}

function runWildcards(state, ev, cut) {
  const r = rngOf(state);
  const y = ev.year;
  const qualifiedIds = new Set((state.qualified[y] || []).map((q) => q.id));
  // keep spots open for qualifier events that come after the wildcard results
  const later = state.season.events.filter((e) => e.qualifier && e.status === "upcoming" && (e.month > ev.month || (e.month === ev.month && e.day > ev.day))).length;
  const spots = Math.max(6, FORMATS.gbb.field - qualifiedIds.size - later);
  const ranked = activePeople(state).filter((p) => !qualifiedIds.has(p.id))
    .map((p) => ({ id: p.id, s: eff(p) + r.normal(0, 3.5) })).sort((a, b) => b.s - a.s).map((x) => x.id);
  const winners = ranked.slice(0, spots);
  const runnersUp = ranked.slice(spots, spots + 12);
  winners.forEach((id, i) => addQualified(state, y, id, `${ordinal(i + 1)} Wildcard Winner`));
  state.wildcardRunnersUp[y] = runnersUp;
  for (const id of winners) state.people[id].elo += D.eloRules.competitions.gbb.qualify || 0;
  news(state, `GBB ${y} wildcard results: ${winners.map((id) => state.people[id].name).join(", ")}`, "wildcards");
  cut.push({ type: "wildcards", ids: winners, event: `GBB ${y}` });
  return { winners, runnersUp, standings: winners.concat(runnersUp) };
}

export const ordinal = (n) => {
  const t = n % 100, u = n % 10;
  return `${n}${t >= 11 && t <= 13 ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th"}`;
};

// after loading a save: recreate generated national championships and the random generator
export function attachState(state) {
  rngs.delete(state);
  const seen = [...(state.season?.events || []), ...Object.values(state.archive || {})];
  for (const e of seen) {
    if (e.comp && e.comp.startsWith("nat_") && !COMPS[e.comp]) {
      const cc = e.comp.slice(4);
      COMPS[e.comp] = { id: e.comp, name: `${countryName(cc)} Beatbox Championship`, scope: "national", country: cc,
        generated: true, month: guessMonth(e.comp, []), national_title_category: "solo" };
    }
  }
  rngOf(state);
  return state;
}

const EXTRA_NAMES = { gbb_wildcards: "GBB Wildcards", gbb_7ts: "GBB 7 to Smoke", season_review: "Season Review", gbc_global: "GBC Global Solo", custom: "Custom tournament" };
export const compName = (id) => COMPS[id]?.name || EXTRA_NAMES[id] || id;

// ---------- end of season ----------
function seasonReview(state, ev, cut) {
  const r = rngOf(state);
  const y = state.year;
  const retired = [], comebacks = [], rookies = [];
  const majorsOf = (p) => p.titles.filter((t) => (t.comp === "gbb" || t.comp === "bbwc") && t.cat === "solo").length;
  for (const p of Object.values(state.people)) {
    if (p.rating == null || p.status === "removed") continue;
    if (p.status === "active") {
      const yearsIn = y - (p.debut ?? y) + 1;
      const gap = p.potential - p.rating;
      const g = yearsIn <= 3 ? 0.22 : yearsIn <= 6 ? 0.14 : yearsIn <= 10 ? 0.06 : 0;
      if (gap > 0) p.rating += gap * g * r.range(0.5, 1.3);
      if (yearsIn >= 11) p.rating -= r.range(0.2, 1.2) * (yearsIn - 10) * 0.3;
      if ((p.lastCompeted ?? 0) < y) p.rating -= 1.5;
      p.rating = Math.max(25, Math.min(99, p.rating));
      p.peak = Math.max(p.peak ?? p.rating, p.rating);
      // retirement
      const startOfYear = p.hist.length ? p.hist[p.hist.length - 1].r : p.rating;
      const wonMajorNow = p.titles.some((t) => t.year === y && (t.comp === "gbb" || t.comp === "bbwc") && t.cat === "solo");
      const idle = (p.lastCompeted ?? 0) < y;
      let chance = p.retirementRisk * 0.4
        + (idle ? (p.rating < 55 ? 0.09 : 0.03) : 0)          // hobby-level names who stop entering drift away
        + (wonMajorNow && majorsOf(p) >= 2 ? 0.25 : 0)          // multiple GBB/BBWC champions often step away on top
        + (startOfYear - p.rating > 4 ? 0.05 : 0);
      if (yearsIn <= 4 && p.potential - p.rating >= 6) chance *= 0.4; // rising talents rarely quit
      if (r.chance(Math.min(0.9, chance))) {
        p.status = r.chance(p.judgeChance) ? "judge" : "retired";
        p.retiredYear = y;
        retired.push(p.id);
        if (majorsOf(p) >= 1 || (p.peak || 0) >= 85) cut.push({ type: "retirement", id: p.id });
        if (p.rating >= 68 || p.titles.length || (p.peak || 0) >= 75)
          news(state, `${p.name} retires from competing${p.status === "judge" ? " and moves to the judging table" : ""}`, "retire", { id: p.id });
      } else {
        const years = y - (p.debut ?? y) + 1;
        p.retirementRisk = Math.min(0.85, 0.04 + 0.015 * Math.max(0, years - 6) + (majorsOf(p) >= 2 ? 0.35 : majorsOf(p) === 1 ? 0.12 : 0));
        p.judgeChance = Math.min(0.9, 0.15 + 0.2 * majorsOf(p) + Math.max(0, p.rating - 70) / 60);
      }
    } else if ((p.status === "retired" || p.status === "judge") && (p.retiredYear ?? 0) < y) {
      const strong = p.potential - p.rating >= 8 || p.rating >= 80;
      const stoppedAt = p.retiredYear ?? p.lastCompeted ?? 0;
      if (strong && y - stoppedAt <= 6 && r.chance(0.01)) {
        p.status = "active";
        p.form = 1.5;
        comebacks.push(p.id);
        news(state, `${p.name} announces a comeback!`, "comeback", { id: p.id });
        cut.push({ type: "comeback", id: p.id });
      }
    }
    p.form = r.normal(0, 2.2);
    p.elo = 1000 + (p.elo - 1000) * D.eloRules.season_fade;
    if (p.status === "active" || retired.includes(p.id)) p.hist.push({ y, r: Math.round(p.rating * 10) / 10, e: Math.round(p.elo) });
  }
  // new prospects
  const byCountry = {};
  for (const p of activePeople(state)) if (p.country) (byCountry[p.country] ||= []).push(p);
  for (const [cc, list] of Object.entries(byCountry)) {
    const level = D.countries[cc]?.level ?? 60;
    const n = Math.floor(list.length * 0.06 + r.next() * 1.3);
    for (let i = 0; i < n; i++) rookies.push(makeProspect(state, cc, level, y + 1));
  }
  if (rookies.length) news(state, `${rookies.length} new names enter the scene for ${y + 1}`, "rookies");
  // next season
  state.year = y + 1;
  state.season = buildSeason(state, y + 1);
  return { retired, comebacks, rookies, standings: [] };
}

// ---------- prospect names ----------
const SYL_A = ["Ka", "Ze", "Ri", "Vo", "Lo", "Mi", "Ny", "Ta", "Ko", "Bru", "Fe", "Ox", "Ry", "Sa", "Ve", "Qu", "Ji", "Dro", "Ul", "Pa",
  "Neo", "Xa", "Bo", "Ki", "Zu", "Ha", "Lu", "Mo", "Re", "Sy", "Ty", "Wa", "Yo", "Ga", "De", "Ca", "Fi", "No", "Pe", "Ro"];
const SYL_B = ["x", "zz", "k", "ro", "no", "ty", "lix", "ven", "dex", "mo", "ka", "rin", "zo", "bo", "ra", "ki", "on", "us", "el", "ax", "ix", "um", "ay", "o", "i"];
const STYLES = [(s) => s, (s) => s.toUpperCase(), (s) => s.toLowerCase(), (s) => `${s}'`, (s) => `${s}${Math.floor(Math.random() * 9) + 1}`,
  (s) => `${s} Beats`, (s) => `MC ${s}`, (s) => `${s}box`];
function makeProspect(state, cc, level, debutYear) {
  const r = rngOf(state);
  let name, id;
  for (let tries = 0; tries < 20; tries++) {
    const base = r.pick(SYL_A) + r.pick(SYL_B) + (r.chance(0.3) ? r.pick(SYL_B) : "");
    name = STYLES[Math.floor(r.next() * (r.chance(0.6) ? 1 : STYLES.length))](base);
    id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (id && !state.people[id]) break;
    id = `${id}${++state.generated}`;
    if (!state.people[id]) break;
  }
  const wonder = r.chance(0.025);
  const lvl = (level - 70) / 5;
  const rating = wonder ? r.range(58, 66) : Math.min(64, Math.max(36, r.normal(47, 5) + lvl));
  const potential = wonder ? r.range(88, 95) : Math.min(95, Math.max(rating + 3, 55 + 33 * Math.pow(r.next(), 1.6) + lvl));
  state.people[id] = {
    id, name, country: cc, countries: [cc], status: "active", rating, potential, peak: rating, elo: 1000,
    debut: debutYear, lastCompeted: null, retirementRisk: 0.05, judgeChance: 0.15, titles: [], form: r.normal(0, 2),
    hist: [], aliases: [], note: "", generated: true,
  };
  return id;
}

// ---------- custom tournaments ----------
export function runCustom(state, { name, ids, bracket, third, progression }) {
  const res = runBracket(state, ids, { bracket, third, elimination: ids.length > bracket });
  res.entrants = ids;
  if (progression) applyPerformance(state, res, "lacup");
  const rec = { ...res, key: `custom-${Date.now()}`, comp: "custom", name, year: state.year, month: state.cursorMonth || 1, kind: "custom" };
  state.customs.unshift(rec);
  state.archive[rec.key] = rec;
  syncRng(state);
  return rec;
}

// ---------- world ranking (Elo points) ----------
export function ranking(state, { by = "elo", country = null, status = "active" } = {}) {
  return Object.values(state.people)
    .filter((p) => p.rating != null && (status === "all" || p.status === status) && (!country || p.country === country))
    .sort((a, b) => (by === "rating" ? b.rating - a.rating : b.elo - a.elo));
}

// ---------- national champions across real history + simulation ----------
export function nationalChampionGrid(state) {
  const grid = {}; // cc -> year -> id
  for (const [cid, eds] of Object.entries(D.history)) {
    const c = COMPS[cid];
    if (c?.scope !== "national") continue;
    for (const e of eds) {
      const ch = e.categories?.[c.national_title_category || "solo"]?.champion?.beatboxer;
      if (ch) (grid[c.country] ||= {})[e.year] = ch;
    }
  }
  for (const a of Object.values(state.archive)) {
    const c = COMPS[a.comp];
    if (c?.scope === "national" && a.champion) (grid[c.country] ||= {})[a.year] = a.champion;
  }
  return grid;
}

// real + simulated champions for one competition
export function championsOf(state, compId) {
  const out = [];
  for (const e of D.history[compId] || []) {
    const ch = e.categories?.solo?.champion?.beatboxer;
    if (ch) out.push({ year: e.year, id: ch, real: true });
  }
  for (const a of Object.values(state.archive)) if (a.comp === compId && a.champion) out.push({ year: a.year, id: a.champion, key: a.key });
  return out.sort((a, b) => a.year - b.year);
}

export function seasonLabel(state) {
  const ev = nextEvent(state);
  return ev ? `${MONTH_NAMES[ev.month - 1]} ${state.year}` : `${state.year}`;
}
