// In-game social media: posts from beatboxers, event pages and fans, written from what happens in the sim.
// Everything here is flavour. It uses Math.random (not the seeded generator) so it never changes results.

const MAX_POSTS = 500;
const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

// event accounts (in-game pages, verified)
const ACCOUNTS = {
  gbb: { name: "Grand Beatbox Battle", handle: "@grandbeatboxbattle", color: "#ff5b1f", short: "GBB" },
  bbwc: { name: "Beatbox World Championship", handle: "@bbworldchamps", color: "#2f7bff", short: "BBWC" },
  ebc: { name: "European Beatbox Championship", handle: "@europeanbeatbox", color: "#1fbf6a", short: "EBC" },
  gbc_global: { name: "German Beatbox Championship", handle: "@gbc.beatbox", color: "#ff3d9a", short: "GBC" },
  gbc: { name: "German Beatbox Championship", handle: "@gbc.beatbox", color: "#ff3d9a", short: "GBC" },
  fbb: { name: "Florida Beatbox Battle", handle: "@floridabeatbox", color: "#ff6fae", short: "FBB" },
  bcj: { name: "BeatCity Japan", handle: "@beatcityjapan", color: "#2a62e0", short: "BCJ" },
  news: { name: "Beatbox Daily", handle: "@beatboxdaily", color: "#ffc23d", short: "BD" },
};
export const accountOf = (key) => ACCOUNTS[key] || ACCOUNTS.news;
function eventAccount(ev) {
  if (ACCOUNTS[ev.comp]) return ev.comp;
  return null; // other events post through Beatbox Daily
}

export const handleOf = (name) => "@" + ((name || "").normalize("NFD").replace(/[^A-Za-z0-9_.]/g, "").toLowerCase() || "beatboxer");
const FAN_A = ["bbx", "beatbox", "boots", "pfft", "liproll", "inward", "throatbass", "kickdrum", "snare", "subbass", "battlewatch", "judgesbench", "mic", "loop", "clickroll", "vocal", "crowdnoise", "frontrow"];
const FAN_B = ["_fan", "lover", "head", "daily", "42", "_xd", "2k", "nerd", "enjoyer", "_takes", "goblin", "99", "_hq", "andchill", "addict", "_tv"];
const fan = () => ({ fan: `${pick(FAN_A)}${pick(FAN_B)}${chance(0.35) ? Math.floor(rnd() * 99) : ""}` });

export const flagEmoji = (cc) => (cc && /^[a-z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
const majorsOf = (p) => p.titles.filter((t) => (t.comp === "gbb" || t.comp === "bbwc") && t.cat === "solo").length;
export const isVerified = (p) => !!p && ((p.peak ?? p.rating ?? 0) >= 78 || majorsOf(p) > 0 || p.titles.length >= 3);
const fame = (p) => Math.max(0, (p?.rating ?? 50) - 45) ** 2 * 9 + (p?.titles.length || 0) * 60 + majorsOf(p || { titles: [] }) * 2500;
const likesFor = (base) => Math.round(base * (0.6 + rnd() * 0.9) + rnd() * 40);

function post(state, by, text, extra = {}) {
  const list = (state.social ||= []);
  const p = by.p ? state.people[by.p] : null;
  const base = by.acct ? 9000 * (extra.big ? 3 : 1) : by.p ? fame(p) + 30 : 25 + rnd() * 400;
  const item = {
    id: `${state.year}-${(state.socialSeq = (state.socialSeq || 0) + 1)}`, y: state.year, m: state.cursorMonth || 1,
    by, text, likes: likesFor(base * (extra.big ? 2.2 : 1)), reposts: 0, replies: [], ...extra,
  };
  item.reposts = Math.round(item.likes * (0.04 + rnd() * 0.1));
  delete item.big;
  list.unshift(item);
  if (list.length > MAX_POSTS) list.length = MAX_POSTS;
  return item;
}
function reply(state, item, by, text) {
  if (!item) return;
  const p = by.p ? state.people[by.p] : null;
  item.replies.push({ by, text, likes: likesFor((by.p ? fame(p) * 0.3 : 30) + item.likes * 0.04) });
}

// well-known names who might comment: compatriots first, then the top of the scene
function peers(state, id, n = 2) {
  const me = state.people[id];
  // active names, judges, and retired legends
  const pool = Object.values(state.people).filter((p) => p.id !== id && p.rating != null
    && (((p.status === "active" || p.status === "judge") && p.rating >= 66) || (p.status === "retired" && ((p.peak || 0) >= 85 || majorsOf(p) > 0))));
  const local = pool.filter((p) => p.country === me?.country).sort((a, b) => b.rating - a.rating).slice(0, 6);
  const stars = pool.sort((a, b) => b.rating - a.rating).slice(0, 25);
  const out = [];
  for (const p of [...local.sort(() => rnd() - 0.5), ...stars.sort(() => rnd() - 0.5)]) {
    if (out.length >= n) break;
    if (!out.includes(p.id)) out.push(p.id);
  }
  return out;
}

const T = {
  majorWin: ["{event} CHAMPION 🏆\nI don't even have words. Thank you to everyone who believed in me.", "WE DID IT. {event} champion 🏆 {flag}\nThis one is for everybody back home.",
    "Dreams do come true. {event} 🏆\nRespect to {ru} for that final.", "Still shaking. {event} champion. Thank you judges, thank you crowd, thank you {country} {flag}"],
  qualWin: ["SEE YOU AT GBB {ty} 🎟️🔥\nThank you {event}!", "{event} champion and GBB {ty} bound ✈️ Let's goooo", "Ticket secured 🎟️ GBB {ty}, I'm coming."],
  natWin: ["{country} champion {flag}🏆 Thank you to everyone who came out!", "National title {flag} Next stop: the world stage.", "Champion of {country} {flag} Hard work pays off."],
  natRepeat: ["Defended it {flag} {country} champion again 🏆", "Back to back {flag}🏆 Thank you {country}!"],
  intlWin: ["Took the title at {event} 🏆 Thank you for having me!", "{event} champion 🏆 What a weekend.", "Won {event} 🏆 That final against {ru} was crazy."],
  ruReply: ["GG {w}, you deserved it 🤝", "Proud of my run. Congrats {w}, see you next time 🔥", "Respect {w}. That final was fun.", "Couldn't take it this time. Congrats {w} 🙏"],
  peer: ["Congrats!! 🔥", "Well deserved 🙌", "Told everyone this would happen", "So proud of you {flag}", "LEGEND", "This one was coming 👏", "Big respect 🫡"],
  praise: ["{w} deserved every vote 🔥", "That final was insane, {w} and {ru} both cooked", "{w} is on another level right now", "Called it. {w} all the way 🏆",
    "The {country} scene keeps delivering {flag}", "{w}'s last round gave me chills", "Rewatched the final 5 times already"],
  hate: ["{w} winning this? Judges had their headphones off 💀", "Unpopular opinion: {ru} took that final", "Robbed. {ru} was ROBBED.", "Same routine as last year from {w} tbh",
    "Not the final I wanted ngl", "{w} is good but this was not a 5-0 😭"],
  upset: ["UPSET ALERT 🚨 {w} just knocked {l} out of {event}", "Nobody had {w} beating {l} on their bingo card 😳", "{l} out?? To {w}?? {event} is wild"],
  lineup: ["LINE-UP ANNOUNCED ⚡\n{n} beatboxers battle for the {event} title. Who are you backing?", "Here is your {event} line-up 🔥 Who takes it?", "The field is set for {event} 🎤"],
  lineupFan: ["{a} vs {b} final, calling it now", "This line-up is stacked 😳", "{a} is taking this, no debate", "Dark horse pick: {c}"],
  qualified: ["GBB {ty} 🎟️ Let's go!", "Qualified for GBB {ty}. Time to work 🔥", "See you at GBB {ty} 🎤"],
  wildcards: ["Your GBB {y} wildcard winners 🎉 Congratulations to everyone who sent a video!", "GBB {y} WILDCARD RESULTS ⚡ Here are the names joining the solo battle."],
  wildWin: ["WILDCARD WINNER 😭🔥 See you at GBB {y}!", "I made it!! GBB {y} wildcard ✅", "Thank you for watching my wildcard 🙏 GBB {y}, here I come"],
  wildFan: ["{ru} not getting a wildcard is criminal", "{w} deserved that spot 100%", "Some of these picks… interesting 👀", "Happy for {w}! Waited for this one"],
  retire: ["After {years} years on stage, it's time for me to step away from competing.\nThank you to everyone who watched, battled, judged and believed. {extra}",
    "This is my last chapter as a competitor. {years} years, so many battles, so many friends. Thank you {flag}❤️ {extra}",
    "I'm retiring from competition. I gave this everything I had. {extra}"],
  retireJudge: ["You'll still see me at the judging table 👀", "Next stop: the judging table.", ""],
  tribute: ["Thank you for everything, legend 🙏", "The scene won't be the same without you on stage", "One of the best to ever do it", "Your battles made me start beatboxing", "Enjoy the next chapter ❤️"],
  tributeLocal: ["{country} will never forget what you did for our scene {flag}❤️", "Proud to have shared so many stages with you {flag}", "You opened the door for all of us here {flag}. Thank you.",
    "Every beatboxer in {country} grew up on your battles {flag}"],
  tributeLegend: ["Welcome to the other side 😄 Enjoy it, you earned it", "From one old-timer to another: what a career 🫡", "Legends never really retire. Proud of you."],
  tributeFan: ["End of an era 😭", "Noooo not {name}", "Grew up watching {name}'s battles 😭", "Thank you {name} 🫡"],
  comeback: ["Did you miss me? 👀", "Unfinished business.", "I'm back. See you on stage 🎤"],
  comebackFan: ["NO WAY", "{name} IS BACK 🔥🔥", "Everyone else is in trouble now", "Wasn't ready for this today"],
  spot: ["{name} won't be at GBB {y}. One more wildcard spot is now open 👀", "Update: a GBB {y} solo spot has opened. Another wildcard will be announced."],
  smoke: ["7 TO SMOKE CHAMPION 💨 {pts} points straight to the GBB {ty} ticket!", "Survived the 7 to Smoke 💨 GBB {ty}, see you there"],
};

const vars = (state, id) => { const p = state.people[id] || {}; return { name: p.name, country: countryNameOf(state, p.country), flag: flagEmoji(p.country) }; };
let countryNameOf = (state, cc) => (cc || "").toUpperCase();
export const setCountryNamer = (fn) => { countryNameOf = (_, cc) => fn(cc); };

// ---------- hooks called by the engine ----------
export function lineup(state, ev, entrants) {
  const big = ["gbb", "bbwc"].includes(ev.comp);
  if (ev.national && !chance(0.15)) return;
  if (!ev.national && !big && !ev.qualifier && !chance(0.6)) return;
  const acct = eventAccount(ev) || "news";
  const sorted = entrants.slice().sort((a, b) => state.people[b].rating - state.people[a].rating);
  const it = post(state, { acct }, fill(pick(T.lineup), { n: entrants.length, event: ev.name }),
    { kind: "lineup", ev: ev.key, people: entrants.slice(0, 20), art: { comp: ev.comp, national: ev.national || null, qualifier: !!ev.qualifier, name: ev.name, year: ev.year }, big });
  for (let i = 0; i < (big ? 3 : 1); i++) {
    reply(state, it, fan(), fill(pick(T.lineupFan), { a: state.people[sorted[0]].name, b: state.people[sorted[1] || sorted[0]].name, c: state.people[pick(sorted.slice(3, 10).concat(sorted[0]))].name }));
  }
}

export function result(state, ev, res, before = {}, ticketY = null) {
  const w = res.champion, ru = res.runnerUp;
  const W = state.people[w], RU = state.people[ru];
  const big = ["gbb", "bbwc"].includes(ev.comp);
  const v = { ...vars(state, w), w: W.name, ru: RU?.name || "", event: ev.name, ty: ev.year };
  if (ticketY) v.ty = ticketY;
  // upsets in the battles (the people involved, before this event moved any rating)
  if (!ev.national || chance(0.3)) {
    const up = (res.battles || []).find((b) => { const l = b.w === b.a ? b.b : b.a; return (before[l] ?? 0) - (before[b.w] ?? 0) >= 7; });
    if (up) {
      const l = up.w === up.a ? up.b : up.a;
      post(state, fan(), fill(pick(T.upset), { w: state.people[up.w].name, l: state.people[l].name, event: ev.name }), { kind: "upset", ev: ev.key });
    }
  }
  if (ev.national && !chance(0.45)) return;
  if (!ev.national && !big && !ev.qualifier && !chance(0.75)) return;
  const repeat = ev.national && W.titles.some((t) => t.comp === ev.comp);
  const tpl = big ? T.majorWin : ev.qualifier ? T.qualWin : ev.national ? (repeat ? T.natRepeat : T.natWin) : T.intlWin;
  // the event page posts the result for majors and qualifiers
  const acct = eventAccount(ev);
  if (acct && !ev.national) {
    const off = post(state, { acct }, `${big ? "YOUR" : ""} ${ev.name.toUpperCase()} SOLO CHAMPION: ${W.name.toUpperCase()} ${flagEmoji(W.country)}🏆`.trim(),
      { kind: "result", ev: ev.key, people: [w], photo: w, big });
    reply(state, off, fan(), fill(pick(T.praise), v));
    if (big || chance(0.5)) reply(state, off, fan(), fill(pick(T.hate), v));
  }
  const mine = post(state, { p: w }, fill(pick(tpl), v), { kind: "win", ev: ev.key, photo: big || chance(0.5) ? w : null, big });
  if (ru) reply(state, mine, { p: ru }, fill(pick(T.ruReply), v));
  for (const id of peers(state, w, big ? 3 : 1)) if (id !== ru) reply(state, mine, { p: id }, fill(pick(T.peer), v));
  reply(state, mine, fan(), fill(pick(T.praise), v));
  if (big && chance(0.7)) reply(state, mine, fan(), fill(pick(T.hate), v));
}

export function qualified(state, id, y, evName) {
  if (!chance(0.7)) return;
  const it = post(state, { p: id }, fill(pick(T.qualified), { ty: y, event: evName }), { kind: "qualify" });
  for (const pid of peers(state, id, 1)) reply(state, it, { p: pid }, fill(pick(T.peer), vars(state, id)));
}

export function wildcards(state, y, winners, runnersUp) {
  if (!winners.length) return;
  const it = post(state, { acct: "gbb" }, fill(pick(T.wildcards), { y }), { kind: "wildcards", people: winners, big: true });
  reply(state, it, fan(), fill(pick(T.wildFan), { w: state.people[pick(winners)].name, ru: state.people[runnersUp[0] || winners[0]].name }));
  reply(state, it, fan(), fill(pick(T.wildFan), { w: state.people[pick(winners)].name, ru: state.people[pick(runnersUp.slice(0, 4)) || winners[0]].name }));
  for (const id of winners.filter(() => chance(0.35)).slice(0, 4)) {
    const mine = post(state, { p: id }, fill(pick(T.wildWin), { y }), { kind: "qualify", photo: chance(0.5) ? id : null });
    reply(state, mine, fan(), "LET'S GOOO 🔥");
  }
}

// the retirement post without adding it to the feed (for previews)
export function previewRetire(state, id) {
  const keep = state.social;
  state.social = [];
  retire(state, id, true);
  const out = state.social.find((x) => x.by.p === id && x.kind === "retire");
  state.social = keep;
  return out;
}

export function retire(state, id, force = false) {
  const p = state.people[id];
  if (!p || (!force && p.rating < 66 && !p.titles.length && (p.peak || 0) < 74)) return;
  const v = { ...vars(state, id), years: Math.max(2, state.year - (p.debut ?? state.year) + 1),
    extra: p.status === "judge" ? pick(T.retireJudge) : "" };
  const big = majorsOf(p) > 0 || (p.peak || 0) >= 85;
  const it = post(state, { p: id }, fill(pick(T.retire), v).trim(), { kind: "retire", photo: id, big });
  const used = new Set();
  const fresh = (list) => { const left = list.filter((x) => !used.has(x)); const x = pick(left.length ? left : list); used.add(x); return x; };
  for (const pid of peers(state, id, big ? 5 : 3)) {
    const q = state.people[pid];
    const tpl = q.country === p.country ? T.tributeLocal : q.status === "retired" ? T.tributeLegend : T.tribute;
    reply(state, it, { p: pid }, fill(fresh(tpl), v));
  }
  reply(state, it, fan(), fill(pick(T.tributeFan), v));
  if (big) reply(state, it, fan(), fill(pick(T.tributeFan), v));
  if (big) post(state, { acct: "news" }, `${p.name.toUpperCase()} RETIRES ${flagEmoji(p.country)}\n${majorsOf(p) ? `${majorsOf(p)}× major champion` : `${p.titles.length} career titles`}, ${v.years} years on the scene. Thank you for everything.`, { kind: "retire", photo: id });
}

export function comeback(state, id) {
  const v = vars(state, id);
  const it = post(state, { p: id }, pick(T.comeback), { kind: "comeback", photo: id, big: true });
  reply(state, it, fan(), fill(pick(T.comebackFan), v));
  reply(state, it, fan(), fill(pick(T.comebackFan), v));
  for (const pid of peers(state, id, 2)) reply(state, it, { p: pid }, "👀🔥");
}

export function spotOpened(state, id, y) {
  post(state, { acct: "gbb" }, fill(pick(T.spot), { name: state.people[id].name, y }), { kind: "news" });
}

export function smoke(state, ev, sm) {
  const it = post(state, { p: sm.champion }, fill(pick(T.smoke), { pts: sm.points[sm.champion], ty: ev.year + 1 }), { kind: "win", photo: chance(0.5) ? sm.champion : null });
  reply(state, it, fan(), "Cardio of a marathon runner 😮‍💨");
}
