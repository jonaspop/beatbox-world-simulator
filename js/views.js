// HTML for each screen. Views read from the app context and return markup; main.js wires the actions.
import { esc, round, avatarColors, imageCache, localPictures, defaultPictures, MONTH_NAMES } from "./data.js";
import { compName, nextEvent, nationalChampionGrid, championsOf, ordinal } from "./sim.js";

let A; // app context: { state, data }
export const bindViews = (ctx) => { A = ctx; };

const P = (id) => A.state.people[id];
export const countryName = (cc) => A.data.countryNames[cc]?.name || A.data.countries[cc]?.name || (cc || "?").toUpperCase();

// ---------- small building blocks ----------
export function flag(cc, title = true) {
  if (!cc) return "";
  return `<span class="fi fi-${esc(cc)}"${title ? ` title="${esc(countryName(cc))}"` : ""}></span>`;
}
const initials = (name) => (name || "?").replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
export function avatar(id, size = "sm") {
  const p = P(id);
  const img = imageCache.get(id);
  if (img) return `<span class="av av-${size}"><img src="${img}" alt="" loading="lazy" decoding="async"></span>`;
  const [a, c] = avatarColors(p?.country);
  return `<span class="av av-${size} gen" style="--fa:${a};--fc:${c}"><span>${esc(initials(p?.name))}</span></span>`;
}
export const nameLink = (id, withFlag = true) => {
  const p = P(id);
  if (!p) return `<span class="muted">${esc(id)}</span>`;
  return `<a class="who" href="#bb/${encodeURIComponent(id)}">${withFlag ? flag(p.country) : ""}<span>${esc(p.name)}</span></a>`;
};
const statusChip = (s) => `<span class="chip st-${esc(s)}">${esc(s)}</span>`;
export const kindOf = (ev) => ev.kind === "review" ? "review" : ev.kind === "wildcards" ? "wild" : ev.national ? "nat"
  : ["gbb", "bbwc", "gbb_7ts"].includes(ev.comp) ? "major" : ev.qualifier ? "qual" : ev.comp === "botm" ? "open" : ev.comp === "custom" ? "custom" : "intl";
export const KIND_LABEL = { major: "Major", qual: "GBB qualifier", wild: "Wildcards", intl: "International", open: "Open", nat: "National", review: "Season", custom: "Custom" };
export const liveable = (ev) => ["major", "qual", "intl", "open", "nat", "custom"].includes(kindOf(ev)) && ev.kind !== "smoke";

const ICON = {
  major: '<path d="M6 4h12v3a6 6 0 0 1-12 0V4Zm-3 1h3v2a3 3 0 0 1-3-2Zm15 0h3a3 3 0 0 1-3 2V5ZM10 14h4v3h3v3H7v-3h3v-3Z"/>',
  qual: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Zm6 2v6h2V9H9Z"/>',
  wild: '<path d="m12 2 2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9 5.9 20.4l1.5-6.8L2.2 9l6.9-.7L12 2Z"/>',
  intl: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-3a15 15 0 0 0-1.3-3.9A8 8 0 0 1 18.9 8ZM12 4c.8 1.1 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.9 1.9-4ZM4.3 14a8 8 0 0 1 0-4h3.4a16 16 0 0 0 0 4H4.3Zm.8 2h3a15 15 0 0 0 1.3 3.9A8 8 0 0 1 5.1 16Zm3-8h-3a8 8 0 0 1 4.3-3.9C8.9 5.3 8.4 6.6 8.1 8ZM12 20c-.8-1.1-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.9-1.9 4Zm2.3-6H9.7a14 14 0 0 1 0-4h4.6a14 14 0 0 1 0 4Zm.3 5.9c.6-1.2 1-2.5 1.3-3.9h3a8 8 0 0 1-4.3 3.9ZM16.3 14a16 16 0 0 0 0-4h3.4a8 8 0 0 1 0 4h-3.4Z"/>',
  open: '<path d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3Zm1 0v8h8a8 8 0 0 0-8-8Z"/>',
  nat: '<path d="M5 3h2v18H5V3Zm3 1h11l-2.5 4L19 12H8V4Z"/>',
  review: '<path d="M7 2h2v2h6V2h2v2h3v17H4V4h3V2Zm11 7H6v10h12V9Z"/>',
  custom: '<path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 3h3v-3h2v3h3v2h-3v3h-2v-3h-3v-2Z"/>',
};
export const kindIcon = (k) => `<svg class="ico k-${k}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ICON.intl}</svg>`;

// custom poster art: spotlights, a microphone on a stand, sound rings and halftone dots
function heroArt() {
  return `<svg class="hero-art" viewBox="0 0 420 300" role="img" aria-label="Microphone on a lit battle stage">
    <defs>
      <pattern id="ht" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.6" class="ht-dot"/></pattern>
      <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="beam-a"/><stop offset="1" class="beam-b"/></linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.9" r="0.6"><stop offset="0" class="glow-a"/><stop offset="1" class="glow-b"/></radialGradient>
    </defs>
    <rect width="420" height="300" fill="url(#ht)"/>
    <path d="M90 0h40L240 300H150Z" fill="url(#beam)"/>
    <path d="M300 0h34L270 300h-90Z" fill="url(#beam)"/>
    <ellipse cx="210" cy="285" rx="200" ry="40" fill="url(#glow)"/>
    <g class="rings" fill="none"><circle cx="210" cy="92" r="58"/><circle cx="210" cy="92" r="86"/><circle cx="210" cy="92" r="116"/></g>
    <g class="mic">
      <rect x="186" y="44" width="48" height="84" rx="24"/>
      <path d="M172 112a38 38 0 0 0 76 0" fill="none" stroke-width="7"/>
      <rect x="206" y="150" width="8" height="104"/>
      <path d="M166 268l44-16 44 16" fill="none" stroke-width="8"/>
    </g>
    <g class="grille"><path d="M192 66h36M190 80h40M190 94h40M192 108h36"/></g>
    <text x="16" y="286" class="art-tag">BATTLE · SEASON</text>
  </svg>`;
}

const ratingBar = (v, pot) => `<span class="rbar" title="Rating ${round(v)}, potential ${round(pot)}"><span class="rbar-pot" style="width:${Math.min(100, pot ?? v)}%"></span><span class="rbar-now" style="width:${Math.min(100, v)}%"></span></span>`;
const when = (ev) => `${MONTH_NAMES[(ev.month || 1) - 1]} ${ev.day || ""}`.trim();

// ---------------- home ----------------
export function viewHome() {
  const st = A.state;
  const ev = nextEvent(st);
  const upcoming = st.season.events.filter((e) => e.status === "upcoming").slice(0, 7);
  const q = st.qualified[st.year] || [];
  const done = st.season.events.filter((e) => e.status === "done" && st.archive[e.key]?.champion).slice(-8).reverse();
  const progress = st.season.events.filter((e) => e.status !== "upcoming").length;
  return `
  <section class="poster">
    <div class="poster-txt">
      <p class="eyebrow">Season ${st.year}${ev ? ` · ${when(ev)}` : ""}</p>
      <h1>${ev ? esc(ev.name.replace(` ${st.year}`, "")) : "Season complete"}</h1>
      ${ev ? `<p class="poster-meta">${kindIcon(kindOf(ev))}<span>${KIND_LABEL[kindOf(ev)]}</span></p>` : ""}
      <div class="row gap">
        ${ev && liveable(ev) ? `<button class="btn primary" data-act="live" data-key="${esc(ev.key)}">Watch it live</button>` : ""}
        <button class="btn ${ev && liveable(ev) ? "" : "primary"}" data-act="next">Sim next event</button>
        <button class="btn" data-act="month">Sim the month</button>
        <button class="btn" data-act="tognext" data-target="gbb">Sim to GBB</button>
        <button class="btn" data-act="season">Sim the season</button>
      </div>
      <div class="meter" aria-label="Season progress"><span style="width:${Math.round(100 * progress / st.season.events.length)}%"></span></div>
      <p class="small muted">${progress} of ${st.season.events.length} events played</p>
    </div>
    ${heroArt()}
  </section>
  <div class="grid3">
    <section class="card">
      <header class="card-h"><h2>Coming up</h2><a href="#calendar">Calendar</a></header>
      <ul class="up-list">${upcoming.map((e) => `<li><a href="#event/${encodeURIComponent(e.key)}">${kindIcon(kindOf(e))}<span class="t">${esc(e.name.replace(` ${st.year}`, ""))}</span><span class="d">${when(e)}</span></a></li>`).join("") || "<li class='muted'>Nothing left this season</li>"}</ul>
    </section>
    <section class="card">
      <header class="card-h"><h2>GBB ${st.year} field</h2><span class="count">${q.length}<small>/20</small></span></header>
      <ul class="q-list">${q.map((x) => `<li>${nameLink(x.id)}<span class="muted small">${esc(x.reason)}</span></li>`).join("") || `<li class="muted">Nobody yet. Qualifiers and wildcards fill the field.</li>`}</ul>
    </section>
    <section class="card">
      <header class="card-h"><h2>Headlines</h2></header>
      <ul class="news">${st.news.slice(0, 12).map((n) => `<li class="n-${n.kind}"><span class="when">${MONTH_NAMES[(n.month || 1) - 1].slice(0, 3)} ${n.year}</span>${esc(n.text)}</li>`).join("") || `<li class="muted">The ${st.year} season hasn't started. Run the first event.</li>`}</ul>
    </section>
  </div>
  <section>
    <header class="sec-h"><h2>Latest champions</h2></header>
    <div class="champ-strip">${done.map((e) => { const r = st.archive[e.key]; const p = P(r.champion); return `<a class="champ-card" href="#event/${encodeURIComponent(e.key)}">${avatar(r.champion, "md")}<span class="cc-name">${flag(p.country)}${esc(p.name)}</span><span class="cc-ev">${esc(e.name.replace(` ${e.year}`, ""))}</span></a>`; }).join("") || `<p class="muted">Results appear here as the season runs.</p>`}</div>
  </section>`;
}

// ---------------- calendar ----------------
export function viewCalendar() {
  const st = A.state;
  const byMonth = Array.from({ length: 12 }, () => []);
  for (const e of st.season.events) byMonth[e.month - 1].push(e);
  return `
  <header class="page-h"><div><p class="eyebrow">Season</p><h1>${st.year} calendar</h1></div>
    <div class="legend">${["major", "qual", "wild", "intl", "open", "nat"].map((k) => `<span class="lg">${kindIcon(k)}${KIND_LABEL[k]}</span>`).join("")}</div></header>
  <div class="cal">${byMonth.map((list, m) => `
    <section class="cal-m"><h3><span>${String(m + 1).padStart(2, "0")}</span>${MONTH_NAMES[m]}</h3>
      ${list.map((e) => { const r = st.archive[e.key]; return `<a class="cal-e k-${kindOf(e)} ${e.status}" href="#event/${encodeURIComponent(e.key)}">
        ${kindIcon(kindOf(e))}<span class="t">${esc(e.name.replace(` ${st.year}`, ""))}</span><span class="d">${e.day}</span>
        ${r?.champion ? `<span class="w">${flag(P(r.champion).country)}${esc(P(r.champion).name)}</span>` : e.status === "skipped" ? `<span class="w muted">Not held</span>` : ""}</a>`; }).join("") || `<p class="muted small">No events</p>`}
    </section>`).join("")}</div>`;
}

// ---------------- event ----------------
export function viewEvent(key) {
  const st = A.state;
  const ev = st.season.events.find((e) => e.key === key) || st.archive[key];
  if (!ev) return `<p class="muted">Event not found.</p>`;
  const r = st.archive[key];
  const k = kindOf(ev);
  const actions = !r && ev.status === "upcoming"
    ? `${liveable(ev) ? `<button class="btn primary" data-act="live" data-key="${esc(key)}">Watch it live</button>` : ""}<button class="btn" data-act="runto" data-key="${esc(key)}">Sim up to this event</button>`
    : r && r.battles?.length && r.format !== "7ts" ? `<button class="btn" data-act="replay" data-key="${esc(key)}">Replay the battles</button>` : "";
  const head = `<header class="ev-head k-${k}"><div><p class="eyebrow">${kindIcon(k)} ${KIND_LABEL[k] || "Event"} · ${when(ev)}, ${ev.year}</p><h1>${esc(ev.name)}</h1></div><div class="row gap">${actions}</div></header>`;
  if (!r) return head + `<section class="card"><p class="muted">This event hasn't happened yet. Watch it live to see every battle and every judge's vote, or sim up to it.</p></section>`;
  if (r.skipped) return head + `<section class="card"><p class="muted">Not held: ${esc(r.reason || "not enough entrants")}.</p></section>`;
  if (r.kind === "wildcards") {
    return head + `<div class="grid2"><section class="card"><h2>Wildcard winners</h2><ol class="plain">${r.winners.map((id, i) => `<li><span class="rk">${ordinal(i + 1)}</span>${avatar(id)}${nameLink(id)}</li>`).join("")}</ol></section>
      <section class="card"><h2>Runners-up</h2><p class="muted small">They battle in the Second League in August.</p><ol class="plain">${r.runnersUp.map((id) => `<li>${nameLink(id)}</li>`).join("")}</ol></section></div>`;
  }
  if (r.kind === "review") {
    return head + `<div class="grid2"><section class="card"><h2>Retired</h2><ul class="plain">${r.retired.map((id) => `<li>${avatar(id)}${nameLink(id)} ${statusChip(P(id).status)}</li>`).join("") || "<li class='muted'>Nobody retired this season</li>"}</ul></section>
      <section class="card"><h2>Comebacks</h2><ul class="plain">${r.comebacks.map((id) => `<li>${avatar(id)}${nameLink(id)}</li>`).join("") || "<li class='muted'>None</li>"}</ul></section></div>`;
  }
  const podium = [r.champion, r.runnerUp, r.third].filter(Boolean);
  return head + `
  <section class="podium">${podium.map((id, i) => `<a class="pod p${i + 1}" href="#bb/${encodeURIComponent(id)}">${avatar(id, "lg")}<span class="pl">${["Champion", "Runner-up", "Third"][i]}</span><b>${esc(P(id).name)}</b><span class="muted">${flag(P(id).country)} ${esc(countryName(P(id).country))}</span></a>`).join("")}</section>
  ${r.format === "7ts" ? smokeTable(r) : bracketView(r)}
  <div class="grid2">
    ${r.elimination ? `<section class="card"><h2>Elimination ranking</h2><p class="muted small">Top ${r.bracketSize} went to the battles</p><ol class="plain two">${r.elimination.map((id, i) => `<li class="${i < r.bracketSize ? "" : "out"}"><span class="rk">${i + 1}</span>${nameLink(id)}</li>`).join("")}</ol></section>` : ""}
    <section class="card"><h2>Judges</h2><ul class="plain">${(r.judges || []).map((id) => `<li>${avatar(id)}${nameLink(id)}</li>`).join("") || "<li class='muted'>Not recorded</li>"}</ul>
    ${r.smoke ? `<h2 class="mt">7 to Smoke</h2>${smokeTable(r.smoke, true)}` : ""}</section>
  </div>`;
}

function bracketView(r) {
  const rounds = [];
  for (const b of r.battles) {
    let col = rounds.find((c) => c.name === b.round);
    if (!col) rounds.push((col = { name: b.round, list: [] }));
    col.list.push(b);
  }
  return `<section class="card"><h2>Battles</h2><div class="bracket">${rounds.map((c) => `
    <div class="br-col"><h4>${esc(c.name)}</h4><div class="br-list">${c.list.map((b) => `
      <div class="br-b">
        <div class="${b.w === b.a ? "win" : ""}">${nameLink(b.a)}<span class="v">${b.votes[0]}</span></div>
        <div class="${b.w === b.b ? "win" : ""}">${nameLink(b.b)}<span class="v">${b.votes[1]}</span></div>
      </div>`).join("")}</div></div>`).join("")}</div></section>`;
}
function smokeTable(r, inner = false) {
  const rows = r.standings.map((id) => `<tr><td>${nameLink(id)}</td><td class="num">${r.points[id]}</td></tr>`).join("");
  const t = `<table class="tbl"><thead><tr><th>Beatboxer</th><th class="num">Points</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">${r.battles.length} battles. King of the hill, first to 7 points.</p>`;
  return inner ? t : `<section class="card"><h2>7 to Smoke</h2>${t}</section>`;
}

// ---------------- beatboxers (browse, filter, create) ----------------
export function viewPeople(params) {
  const q = (params.get("q") || "").toLowerCase();
  const cc = params.get("c") || "";
  const status = params.get("s") || "active";
  const sort = params.get("o") || "rating";
  const limit = +(params.get("n") || 120);
  let list = Object.values(A.state.people).filter((p) => p.rating != null
    && (status === "all" || p.status === status) && (!cc || p.country === cc)
    && (!q || p.name.toLowerCase().includes(q) || p.id.includes(q) || (p.aliases || []).some((a) => a.toLowerCase().includes(q))));
  const sorters = { rating: (a, b) => b.rating - a.rating, potential: (a, b) => b.potential - a.potential || b.rating - a.rating,
    rising: (a, b) => (b.potential - b.rating) - (a.potential - a.rating), name: (a, b) => a.name.localeCompare(b.name), titles: (a, b) => b.titles.length - a.titles.length };
  list.sort(sorters[sort] || sorters.rating);
  const total = list.length;
  list = list.slice(0, limit);
  const countries = [...new Set(Object.values(A.state.people).map((p) => p.country).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const opt = (v, cur, label) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  return `<header class="page-h"><div><p class="eyebrow">The scene</p><h1>Beatboxers</h1></div><button class="btn" data-act="create">Add a beatboxer</button></header>
    <form class="filters" data-form="people">
      <label>Search<input name="q" id="people-q" value="${esc(params.get("q") || "")}" placeholder="Name or alias" autocomplete="off"></label>
      <label>Country<select name="c">${opt("", cc, "Everywhere")}${countries.map((c) => opt(c, cc, esc(countryName(c)))).join("")}</select></label>
      <label>Status<select name="s">${["active", "judge", "retired", "removed", "all"].map((s) => opt(s, status, s[0].toUpperCase() + s.slice(1))).join("")}</select></label>
      <label>Sort by<select name="o">${opt("rating", sort, "Rating")}${opt("potential", sort, "Potential")}${opt("rising", sort, "Room to grow")}${opt("titles", sort, "Titles")}${opt("name", sort, "Name")}</select></label>
    </form>
    <p class="muted small">${total} beatboxers. Open anyone to edit their stats or add a picture.</p>
    <div class="people-grid">${list.map((p) => `<a class="person" href="#bb/${encodeURIComponent(p.id)}">${avatar(p.id, "md")}
      <span class="pp-txt"><b>${esc(p.name)}</b><span class="muted small">${flag(p.country)} ${esc(countryName(p.country))}${p.status !== "active" ? ` · ${esc(p.status)}` : ""}</span>${ratingBar(p.rating, p.potential)}</span>
      <span class="pp-num"><span class="big">${round(p.rating)}</span><span class="muted small">pot ${round(p.potential)}</span></span></a>`).join("")}</div>
    ${total > limit ? `<div class="row"><a class="btn" href="#people?${new URLSearchParams({ q: params.get("q") || "", c: cc, s: status, o: sort, n: limit + 120 })}">Show more</a></div>` : ""}`;
}

// ---------------- profile + editor ----------------
export function viewProfile(id) {
  const p = P(id);
  if (!p) return `<p class="muted">Not found.</p>`;
  const fav = A.state.settings.favorites.includes(id);
  const results = Object.values(A.state.archive).filter((r) => r.standings?.includes(id) || r.entrants?.includes(id))
    .sort((a, b) => b.year - a.year || b.month - a.month || (b.day || 0) - (a.day || 0)).slice(0, 40);
  const titles = p.titles.slice().sort((a, b) => b.year - a.year);
  const countries = Object.keys(A.data.countryNames).sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const wins = results.reduce((n, r) => n + (r.battles || []).filter((b) => b.w === id).length, 0);
  const played = results.reduce((n, r) => n + (r.battles || []).filter((b) => b.a === id || b.b === id).length, 0);
  return `
  <section class="profile">
    <div class="pf-pic">${avatar(id, "xl")}
      <label class="btn small">Upload picture<input type="file" accept="image/*" data-upload="${esc(id)}" hidden></label>
      <span class="muted small pf-tip">Or copy a picture anywhere and press Ctrl+V here.</span>
      ${localPictures.has(id) ? `<button class="btn small ghost" data-act="rmpic" data-id="${esc(id)}">Remove my picture</button>` : ""}
      ${!localPictures.has(id) && defaultPictures.has(id) ? `<a class="muted small" href="${esc(defaultPictures.get(id).source)}" target="_blank" rel="noopener">Photo: Beatbox Wiki</a>` : ""}
    </div>
    <div class="pf-main">
      <p class="eyebrow">${flag(p.country)} ${esc(countryName(p.country))}${p.countries?.length > 1 ? ` · also ${p.countries.slice(1).map((c) => esc(countryName(c))).join(", ")}` : ""}</p>
      <h1>${esc(p.name)}</h1>
      <p>${statusChip(p.status)}${p.aliases?.length ? ` <span class="muted small">also known as ${p.aliases.map(esc).join(", ")}</span>` : ""}</p>
      <div class="stats">
        <div><span class="lbl">Rating</span><span class="big">${round(p.rating)}</span></div>
        <div><span class="lbl">Potential</span><span class="big">${round(p.potential)}</span></div>
        <div><span class="lbl">Peak</span><span class="big">${round(p.peak)}</span></div>
        <div><span class="lbl">On the scene</span><span class="big">${p.debut ?? "–"}</span></div>
        <div><span class="lbl">Titles</span><span class="big">${p.titles.length}</span></div>
        <div><span class="lbl">Sim battles</span><span class="big">${wins}–${played - wins}</span></div>
      </div>
      ${sparkline(p.hist)}
      <div class="row gap"><button class="btn ${fav ? "primary" : ""}" data-act="fav" data-id="${esc(id)}">${fav ? "Following" : "Follow"}</button><span class="muted small">Followed beatboxers get a cutscene every time they win.</span></div>
    </div>
  </section>
  <div class="grid2">
    <section class="card"><h2>Edit</h2>
      <form class="edit" data-form="edit" data-id="${esc(id)}">
        <label>Name<input name="name" value="${esc(p.name)}" required></label>
        <label>Country<select name="country">${countries.map((c) => `<option value="${c}"${c === p.country ? " selected" : ""}>${esc(countryName(c))}</option>`).join("")}</select></label>
        <label>Status<select name="status">${["active", "retired", "judge", "removed"].map((s) => `<option${s === p.status ? " selected" : ""}>${s}</option>`).join("")}</select></label>
        <label>Rating<input name="rating" type="number" min="1" max="99" step="1" value="${round(p.rating)}"></label>
        <label>Potential<input name="potential" type="number" min="1" max="99" step="1" value="${round(p.potential)}"></label>
        <label>Retirement chance per season<input name="retirementRisk" type="number" min="0" max="1" step="0.01" value="${(p.retirementRisk ?? 0).toFixed(2)}"></label>
        <label>Becomes a judge on retiring<input name="judgeChance" type="number" min="0" max="1" step="0.01" value="${(p.judgeChance ?? 0).toFixed(2)}"></label>
        <label class="check"><input type="checkbox" name="noSolo"${p.noSolo ? " checked" : ""}> Doesn't enter solo events</label>
        <label class="wide">Note<input name="note" value="${esc(p.note || "")}"></label>
        <div class="wide row gap"><button class="btn primary" type="submit">Save changes</button><span class="muted small" data-saved></span></div>
      </form>
    </section>
    <section class="card"><h2>Titles</h2>
      <ul class="plain links">${titles.map((t) => `<li><span class="yr">${t.year}</span><a href="${titleHref(id, t)}">${esc(compName(t.comp))}${t.cat && t.cat !== "solo" ? ` <span class="muted">(${esc(t.cat.replace(/_/g, " "))})</span>` : ""}</a>${t.real ? "" : ' <span class="chip sim">sim</span>'}</li>`).join("") || "<li class='muted'>No titles yet</li>"}</ul>
      <h2 class="mt">Simulated results</h2>
      <ul class="plain links">${results.map((r) => { const pl = r.standings.indexOf(id); return `<li><span class="yr">${r.year}</span><a href="#event/${encodeURIComponent(r.key)}">${esc(r.name.replace(` ${r.year}`, ""))}</a> <span class="muted">${pl === 0 ? "Champion" : pl >= 0 ? ordinal(pl + 1) : "entered"}</span></li>`; }).join("") || "<li class='muted'>Nothing simulated yet</li>"}</ul>
    </section>
  </div>
  <section class="card"><h2>Career history</h2><p class="muted small">Every real event in the records. Click one to see its battles.</p>
    <div class="tbl-wrap"><table class="tbl career"><thead><tr><th>Year</th><th>Event</th><th>Category</th><th>Result</th></tr></thead><tbody>
    ${realAppearances(id).map((a) => `<tr><td class="yr">${a.year}</td><td><a href="${a.href}">${esc(a.name)}</a></td><td class="muted">${esc(a.cat)}</td><td class="${a.rank === 1 ? "gold" : ""}">${esc(a.result)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No real events on record.</td></tr>`}
    </tbody></table></div>
  </section>
  <div class="grid2" hidden>
  </div>`;
}

// ---------- real history: every event a beatboxer entered, and a page per real event ----------
const CAT_LABEL = { solo: "Solo", solo_global: "Solo Global", "7_to_smoke": "7 to Smoke" };
const LOST_AT = { Final: [2, "Runner-up"], "Third place": [4, "Fourth"], Semifinal: [4, "Semifinalist"], "Semifinal round": [4, "Semifinals"],
  "Semifinal tiebreaker": [4, "Semifinals"], "Top 8": [8, "Top 8"], "Quarterfinal round": [8, "Quarterfinals"], "Quarterfinal tiebreaker": [8, "Quarterfinals"],
  "Top 16": [16, "Top 16"], "Top 32": [32, "Top 32"], "Round of 64": [64, "Top 64"] };
const bidOf = (r) => r?.beatboxer;

function resultIn(d, id) {
  if (bidOf(d.champion) === id) return [1, "Champion"];
  if (bidOf(d.co_champion) === id) return [1, "Co-champion"];
  if (bidOf(d.runner_up) === id) return [2, "Runner-up"];
  if (bidOf(d.third) === id) return [3, "Third"];
  const pts = (d.points || []).find((x) => x.beatboxer === id);
  if (pts) return [50, `${pts.points} point${pts.points === 1 ? "" : "s"}`];
  const pl = (d.placements || []).find((x) => x.beatboxer === id);
  if (pl) return [pl.rank, ordinal(pl.rank)];
  let best = null;
  for (const b of d.battles || []) {
    if (bidOf(b.a) !== id && bidOf(b.b) !== id) continue;
    const lost = bidOf(b.winner) && bidOf(b.winner) !== id;
    const info = LOST_AT[b.round] || [99, b.round];
    const rank = lost ? info[0] : info[0] / 2;
    if (!best || rank < best[0]) best = [rank, lost ? info[1] : `${info[1]}`];
  }
  if (best) return best;
  const sd = (d.seeding || []).find((x) => x.beatboxer === id);
  if (sd) return [100 + sd.rank, `Eliminations (${ordinal(sd.rank)})`];
  if ((d.participants || []).some((x) => x.beatboxer === id)) return [200, "Entered"];
  const wr = (d.wildcard_runners_up || []).find((x) => x.beatboxer === id);
  if (wr) return [300, `Wildcard runner-up${wr.place ? ` (${ordinal(wr.place)})` : ""}`];
  return null;
}

export function realAppearances(id) {
  const out = [];
  for (const [cid, eds] of Object.entries(A.data.history)) {
    eds.forEach((e, idx) => {
      for (const [cat, d] of Object.entries(e.categories || {})) {
        const r = resultIn(d, id);
        if (r) out.push({ year: e.year, month: e.month || 0, name: e.name, cat: CAT_LABEL[cat] || cat, rank: r[0], result: r[1], href: `#history/${cid}/${idx}` });
      }
    });
  }
  return out.sort((a, b) => b.year - a.year || b.month - a.month || a.name.localeCompare(b.name));
}

function titleHref(id, t) {
  if (t.real) {
    const eds = A.data.history[t.comp] || [];
    const idx = eds.findIndex((e) => e.year === t.year && Object.values(e.categories || {}).some((d) => bidOf(d.champion) === id || bidOf(d.co_champion) === id));
    return idx >= 0 ? `#history/${t.comp}/${idx}` : `#champions`;
  }
  const arch = Object.values(A.state.archive).filter((a) => a.year === t.year);
  const hit = arch.find((a) => (a.comp === t.comp || (t.cat === "7_to_smoke" && a.comp === `${t.comp}_7ts`)) && a.champion === id)
    || arch.find((a) => a.comp === t.comp && a.smoke?.champion === id);
  return hit ? `#event/${encodeURIComponent(hit.key)}` : "#calendar";
}

export function viewHistory(arg) {
  const [cid, idxStr] = (arg || "").split("/");
  const e = (A.data.history[cid] || [])[+idxStr];
  if (!e) return `<p class="muted">Event not found.</p>`;
  const ev = { comp: cid, national: compName(cid) && cid.startsWith("nat_") ? cid.slice(4) : null };
  const k = kindOf(ev);
  const where = [e.dates, e.location].filter(Boolean).join(" · ");
  const judges = (e.judges || []).map(bidOf).filter(Boolean);
  const cats = Object.entries(e.categories || {}).sort(([a], [b]) => (a === "solo" ? -1 : b === "solo" ? 1 : 0));
  return `<header class="ev-head k-${k}"><div><p class="eyebrow">${kindIcon(k)} Real results · ${esc(where || e.year)}</p><h1>${esc(e.name)}</h1></div>
      <span class="chip">${esc(e.status === "upcoming" ? "Upcoming" : "History")}</span></header>
    ${cats.map(([cat, d]) => historyCategory(cat, d)).join("") || `<section class="card"><p class="muted">No solo results recorded for this edition.</p></section>`}
    ${judges.length ? `<section class="card"><h2>Judges</h2><ul class="plain">${judges.map((j) => `<li>${avatar(j)}${nameLink(j)}</li>`).join("")}</ul></section>` : ""}`;
}

function historyCategory(cat, d) {
  const pod = [bidOf(d.champion), bidOf(d.runner_up), bidOf(d.third)].filter(Boolean);
  const rounds = [];
  for (const b of d.battles || []) {
    let col = rounds.find((c) => c.name === b.round);
    if (!col) rounds.push((col = { name: b.round, list: [] }));
    col.list.push(b);
  }
  const score = (b) => (b.score || "").replace(/\s*votes?\*?/gi, "").replace(/\*\*/g, "").split(/\s*-\s*/);
  const ranked = (d.seeding || d.placements || []).slice().sort((a, b) => a.rank - b.rank);
  const judges = (d.judges || []).map(bidOf).filter(Boolean);
  return `<section class="hist-cat">
    <h2 class="cat-h">${esc(CAT_LABEL[cat] || cat)}</h2>
    ${pod.length ? `<div class="podium">${pod.map((id, i) => `<a class="pod p${i + 1}" href="#bb/${encodeURIComponent(id)}">${avatar(id, "lg")}<span class="pl">${["Champion", "Runner-up", "Third"][i]}</span><b>${esc(P(id)?.name || id)}</b><span class="muted">${flag(P(id)?.country)} ${esc(countryName(P(id)?.country))}</span></a>`).join("")}</div>` : ""}
    ${rounds.length ? `<section class="card"><h2>Battles</h2><div class="bracket">${rounds.map((c) => `
      <div class="br-col"><h4>${esc(c.name)}</h4><div class="br-list">${c.list.map((b) => { const [sa, sb] = score(b); const w = bidOf(b.winner); return `
        <div class="br-b">
          <div class="${w === bidOf(b.a) ? "win" : ""}">${nameLink(bidOf(b.a))}<span class="v">${esc(sa || "")}</span></div>
          <div class="${w === bidOf(b.b) ? "win" : ""}">${b.b ? nameLink(bidOf(b.b)) : "<span class='muted'>bye</span>"}<span class="v">${esc(sb || "")}</span></div>
        </div>`; }).join("")}</div></div>`).join("")}</div></section>` : ""}
    <div class="grid2">
      ${d.points ? `<section class="card"><h2>Points</h2><table class="tbl"><tbody>${d.points.slice().sort((a, b) => b.points - a.points).map((x) => `<tr><td>${nameLink(x.beatboxer)}</td><td class="num">${x.points}</td></tr>`).join("")}</tbody></table></section>` : ""}
      ${ranked.length ? `<section class="card"><h2>${d.seeding ? "Elimination ranking" : "Final standings"}</h2><ol class="plain two">${ranked.map((x) => `<li><span class="rk">${x.rank}</span>${nameLink(x.beatboxer)}</li>`).join("")}</ol></section>` : ""}
      ${d.participants?.length ? `<section class="card"><h2>Entrants</h2><ul class="plain">${d.participants.map((x) => `<li>${nameLink(x.beatboxer)}${x.qualification ? `<span class="muted small">${esc(x.qualification)}</span>` : ""}</li>`).join("")}</ul></section>` : ""}
      ${judges.length ? `<section class="card"><h2>Judges</h2><ul class="plain">${judges.map((j) => `<li>${avatar(j)}${nameLink(j)}</li>`).join("")}</ul></section>` : ""}
    </div>
  </section>`;
}

function sparkline(hist = []) {
  if (hist.length < 2) return `<p class="muted small">The rating chart fills in after a season.</p>`;
  const w = 320, h = 70, pad = 6;
  const ys = hist.map((x) => x.r), lo = Math.min(...ys) - 2, hi = Math.max(...ys) + 2;
  const X = (i) => pad + (i * (w - 2 * pad)) / (hist.length - 1), Y = (v) => h - pad - ((v - lo) * (h - 2 * pad)) / (hi - lo || 1);
  const d = hist.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x.r).toFixed(1)}`).join("");
  return `<figure class="spark"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Rating by season">
    <path d="${d} L${X(hist.length - 1)},${h} L${X(0)},${h} Z" class="area"/><path d="${d}" class="line"/>
    <circle cx="${X(hist.length - 1)}" cy="${Y(ys[ys.length - 1])}" r="3.5" class="dot"/></svg>
    <figcaption class="muted small">Rating ${Math.round(hist[0].r)} in ${hist[0].y} → ${Math.round(ys[ys.length - 1])} in ${hist[hist.length - 1].y}</figcaption></figure>`;
}

// ---------------- champions ----------------
export function viewChampions() {
  const st = A.state;
  const grid = nationalChampionGrid(st);
  const years = [];
  for (let y = Math.max(2017, st.year - 9); y <= st.year; y++) years.push(y);
  const ccs = Object.keys(grid).sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const majors = ["gbb", "bbwc"].map((c) => ({ c, list: championsOf(st, c).reverse() }));
  return `<header class="page-h"><div><p class="eyebrow">Hall of fame</p><h1>Champions</h1></div></header>
  <div class="grid2">${majors.map(({ c, list }) => `<section class="card"><h2>${esc(compName(c))}</h2><ol class="plain champs">${list.map((x) => `<li><span class="yr">${x.year}</span>${avatar(x.id)}${nameLink(x.id)}${x.real ? "" : ' <span class="chip sim">sim</span>'}</li>`).join("")}</ol></section>`).join("")}</div>
  <section class="card"><h2>National champions</h2>
    <div class="tbl-wrap"><table class="tbl nat-grid"><thead><tr><th>Country</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
    ${ccs.map((cc) => `<tr><td>${flag(cc)} ${esc(countryName(cc))}</td>${years.map((y) => `<td>${grid[cc][y] ? nameLink(grid[cc][y], false) : '<span class="muted">·</span>'}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div></section>`;
}

// ---------------- countries ----------------
export function viewCountries() {
  const st = A.state;
  const by = {};
  for (const p of Object.values(st.people)) if (p.status === "active" && p.country && p.rating != null) (by[p.country] ||= []).push(p);
  const rows = Object.entries(by).map(([cc, list]) => {
    list.sort((a, b) => b.rating - a.rating);
    const v = list.map((p) => p.rating).concat(Array(10).fill(40));
    const level = 0.5 * v[0] + 0.3 * (v[1] + v[2] + v[3]) / 3 + 0.2 * v.slice(4, 10).reduce((a, b) => a + b, 0) / 6;
    return { cc, list, level };
  }).sort((a, b) => b.level - a.level);
  return `<header class="page-h"><div><p class="eyebrow">Scene by scene</p><h1>Countries</h1></div><p class="muted small">Level comes from each country's best active beatboxers.</p></header>
  <div class="country-grid">${rows.map((r) => `<a class="country" href="#people?c=${encodeURIComponent(r.cc)}">
    <span class="cflag">${flag(r.cc, false)}</span><span class="cname">${esc(countryName(r.cc))}</span><span class="clevel">${Math.round(r.level)}</span>
    <span class="cbar"><span style="width:${Math.round(r.level)}%"></span></span>
    <span class="ctop">${r.list.slice(0, 3).map((p) => esc(p.name)).join(" · ")}</span><span class="muted small">${r.list.length} active</span></a>`).join("")}</div>`;
}

// ---------------- custom tournaments ----------------
export function viewCustom(pick = []) {
  const st = A.state;
  const countries = [...new Set(Object.values(st.people).filter((p) => p.status === "active").map((p) => p.country).filter(Boolean))]
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  return `<header class="page-h"><div><p class="eyebrow">Your own event</p><h1>Custom tournament</h1></div></header>
  <div class="grid2">
    <section class="card"><h2>Set it up</h2>
      <form class="edit" data-form="custom">
        <label class="wide">Name<input name="name" value="Dream Battle ${st.year}" required></label>
        <label>Bracket size<select name="bracket"><option>4</option><option selected>8</option><option>16</option><option>32</option></select></label>
        <label>Entrants (elimination if more than the bracket)<input name="field" type="number" min="4" max="64" value="8"></label>
        <label>Field<select name="mode"><option value="top">Best active beatboxers</option><option value="country">Best of one country</option><option value="pick">Pick by hand</option><option value="prospects">Most room to grow</option></select></label>
        <label>Country<select name="country">${countries.map((c) => `<option value="${c}">${esc(countryName(c))}</option>`).join("")}</select></label>
        <label class="check"><input type="checkbox" name="live" checked> Watch it live</label>
        <label class="check"><input type="checkbox" name="third" checked> Third place battle</label>
        <label class="check"><input type="checkbox" name="progression"> Results change ratings</label>
        <label class="check"><input type="checkbox" name="cutscene" checked> Champion cutscene</label>
        <div class="wide"><span class="lbl">Hand-picked (${pick.length})</span>
          <div class="picks">${pick.map((id) => `<span class="pick">${nameLink(id)}<button type="button" data-act="unpick" data-id="${esc(id)}" aria-label="Remove">×</button></span>`).join("") || '<span class="muted small">Search below to add names</span>'}</div>
          <input id="pick-q" placeholder="Search a name to add" autocomplete="off"><div class="pick-results" id="pick-results"></div>
        </div>
        <div class="wide"><button class="btn primary" type="submit">Run tournament</button></div>
      </form>
    </section>
    <section class="card"><h2>Past custom tournaments</h2>
      <ul class="plain">${st.customs.map((c) => `<li><span class="yr">${c.year}</span><a href="#event/${encodeURIComponent(c.key)}">${esc(c.name)}</a> · ${nameLink(c.champion)}</li>`).join("") || "<li class='muted'>None yet</li>"}</ul>
    </section>
  </div>`;
}

// ---------------- settings ----------------
export function viewSettings() {
  const s = A.state.settings;
  const box = (k, label, def = false) => `<label class="check"><input type="checkbox" data-setting="${k}"${(s[k] ?? def) ? " checked" : ""}> ${label}</label>`;
  return `<header class="page-h"><div><p class="eyebrow">Game</p><h1>Settings & saves</h1></div></header>
  <div class="grid2">
    <section class="card"><h2>Show</h2>
      ${box("askBefore", "Ask me before every GBB qualifier, the GBB wildcards, GBB and BBWC", true)}
      <label>When not asking<select data-setting-select="defaultChoice">
        ${[["watch", "Watch wildcards, then the battles"], ["battle", "Skip to the battles"], ["skip", "Skip the competition"]].map(([v, l]) => `<option value="${v}"${(s.defaultChoice || "watch") === v ? " selected" : ""}>${l}</option>`).join("")}
      </select></label>
      ${A.state.seasonChoice?.year === A.state.year ? `<p class="small muted">You chose "${esc(A.state.seasonChoice.choice)}" for the rest of ${A.state.year}. <button class="btn small" data-act="forgetchoice">Ask again</button></p>` : ""}
      ${box("cutscenes", "Champion, retirement and comeback cutscenes", true)}
      ${box("nationalCutscenes", "A cutscene for every national champion")}
      ${box("sound", "Beat and sound effects", true)}
      <div class="row gap mt"><button class="btn" data-act="demo" data-type="ceremony">Preview wildcard ceremony</button><button class="btn" data-act="demo" data-type="champion">Preview champion</button><button class="btn" data-act="demo" data-type="live">Preview a live battle</button><button class="btn" data-act="demo" data-type="retirement">Preview retirement</button></div>
    </section>
    <section class="card"><h2>Save game</h2>
      <p class="muted small">The game saves itself in this browser after every step. Export a file to back it up or move it to another device.</p>
      <div class="row gap"><button class="btn" data-act="export">Export save file</button>
        <label class="btn">Import save file<input type="file" accept="application/json" data-import hidden></label></div>
      <div class="row gap mt"><button class="btn danger" data-act="newgame">Start a new game from 2027</button></div>
      <p class="muted small" data-confirm></p>
    </section>
  </div>`;
}
