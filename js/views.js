// HTML for each screen. Views read from the app context and return markup; main.js wires the actions.
import { esc, round, flagColors, avatarColors, imageCache, MONTH_NAMES } from "./data.js";
import { comp, compName, nextEvent, ranking, nationalChampionGrid, championsOf, ordinal } from "./sim.js";

let A; // app context: { state, data }
export const bindViews = (ctx) => { A = ctx; };

const P = (id) => A.state.people[id];
export const countryName = (cc) => A.data.countryNames[cc]?.name || A.data.countries[cc]?.name || (cc || "?").toUpperCase();

export function flag(cc, title = true) {
  if (!cc) return "";
  const [a, b, c] = flagColors(cc);
  return `<span class="flag" style="--fa:${a};--fb:${b};--fc:${c}"${title ? ` title="${esc(countryName(cc))}"` : ""}></span>`;
}
export function avatar(id, size = "sm") {
  const p = P(id);
  const img = imageCache.get(id);
  if (img) return `<span class="av av-${size}"><img src="${img}" alt=""></span>`;
  const [a, c] = avatarColors(p?.country);
  const ini = (p?.name || "?").replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return `<span class="av av-${size}" style="--fa:${a};--fc:${c}">${esc(ini)}</span>`;
}
export const nameLink = (id, withFlag = true) => {
  const p = P(id);
  if (!p) return `<span class="muted">${esc(id)}</span>`;
  return `<a class="who" href="#bb/${encodeURIComponent(id)}">${withFlag ? flag(p.country) : ""}${esc(p.name)}</a>`;
};
const statusChip = (s) => `<span class="chip st-${esc(s)}">${esc(s)}</span>`;
const kindOf = (ev) => ev.kind === "review" ? "review" : ev.kind === "wildcards" ? "wild" : ev.national ? "nat"
  : ["gbb", "bbwc", "gbb_7ts"].includes(ev.comp) ? "major" : ev.qualifier ? "qual" : ev.comp === "botm" ? "open" : "intl";
const KIND_LABEL = { nat: "National", qual: "GBB qualifier", major: "Major", open: "Open", intl: "International", wild: "Wildcards", review: "Season" };
const ratingBar = (v, pot) => `<span class="rbar"><span class="rbar-pot" style="width:${Math.min(100, pot ?? v)}%"></span><span class="rbar-now" style="width:${Math.min(100, v)}%"></span></span>`;

// ---------------- home ----------------
export function viewHome() {
  const st = A.state;
  const ev = nextEvent(st);
  const top = ranking(st, { by: "elo" }).slice(0, 10);
  const q = st.qualified[st.year] || [];
  const done = st.season.events.filter((e) => e.status === "done" && A.state.archive[e.key]?.champion).slice(-8).reverse();
  return `
  <section class="hero">
    <div class="hero-txt">
      <p class="eyebrow">Season ${st.year}</p>
      <h1>${ev ? esc(ev.name) : "Season complete"}</h1>
      <p class="lede">${ev ? `Next up · ${MONTH_NAMES[ev.month - 1]} ${ev.day} · ${KIND_LABEL[kindOf(ev)]}` : ""}</p>
      <div class="row gap">
        <button class="btn primary" data-act="next">Run next event</button>
        <button class="btn" data-act="month">Sim the month</button>
        <button class="btn" data-act="tognext" data-target="gbb">Sim to GBB</button>
        <button class="btn" data-act="season">Sim the season</button>
      </div>
    </div>
    <div class="hero-meter">
      <div class="meter-label">Season progress</div>
      <div class="meter"><span style="width:${Math.round(100 * st.season.events.filter((e) => e.status !== "upcoming").length / st.season.events.length)}%"></span></div>
      <div class="meter-sub">${st.season.events.filter((e) => e.status !== "upcoming").length} of ${st.season.events.length} events</div>
    </div>
  </section>
  <div class="grid3">
    <section class="card">
      <header class="card-h"><h2>World ranking</h2><a href="#rankings">All</a></header>
      <ol class="rank-list">${top.map((p, i) => `<li><span class="rk">${i + 1}</span>${avatar(p.id)}${nameLink(p.id)}<span class="num">${Math.round(p.elo)}</span></li>`).join("")}</ol>
    </section>
    <section class="card">
      <header class="card-h"><h2>GBB ${st.year} field</h2><span class="muted">${q.length} qualified</span></header>
      <ul class="q-list">${q.map((x) => `<li>${nameLink(x.id)}<span class="muted small">${esc(x.reason)}</span></li>`).join("") || `<li class="muted">Nobody yet. Qualifiers and wildcards fill the field.</li>`}</ul>
    </section>
    <section class="card">
      <header class="card-h"><h2>Headlines</h2></header>
      <ul class="news">${st.news.slice(0, 14).map((n) => `<li class="n-${n.kind}"><span class="when">${MONTH_NAMES[(n.month || 1) - 1].slice(0, 3)} ${n.year}</span>${esc(n.text)}</li>`).join("") || `<li class="muted">The ${st.year} season hasn't started. Run the first event.</li>`}</ul>
    </section>
  </div>
  <section class="card">
    <header class="card-h"><h2>Latest champions</h2><a href="#calendar">Calendar</a></header>
    <div class="champ-strip">${done.map((e) => { const r = A.state.archive[e.key]; return `<a class="champ-tile" href="#event/${encodeURIComponent(e.key)}">${avatar(r.champion, "md")}<b>${esc(P(r.champion).name)}</b><span>${esc(e.name)}</span></a>`; }).join("") || `<p class="muted">Results appear here as the season runs.</p>`}</div>
  </section>`;
}

// ---------------- calendar ----------------
export function viewCalendar() {
  const st = A.state;
  const byMonth = Array.from({ length: 12 }, () => []);
  for (const e of st.season.events) byMonth[e.month - 1].push(e);
  return `
  <header class="page-h"><h1>${st.year} calendar</h1>
    <div class="legend">${Object.entries(KIND_LABEL).map(([k, v]) => `<span class="lg k-${k}">${v}</span>`).join("")}</div></header>
  <div class="cal">${byMonth.map((list, m) => `
    <section class="cal-m"><h3>${MONTH_NAMES[m]}</h3>
      ${list.map((e) => { const r = st.archive[e.key]; return `<a class="cal-e k-${kindOf(e)} ${e.status}" href="#event/${encodeURIComponent(e.key)}">
        <span class="d">${e.day}</span><span class="t">${esc(e.name.replace(` ${st.year}`, ""))}</span>
        ${r?.champion ? `<span class="w">${flag(P(r.champion).country)}${esc(P(r.champion).name)}</span>` : e.status === "skipped" ? `<span class="w muted">not held</span>` : ""}</a>`; }).join("") || `<p class="muted small">No events</p>`}
    </section>`).join("")}</div>`;
}

// ---------------- event ----------------
export function viewEvent(key) {
  const st = A.state;
  const ev = st.season.events.find((e) => e.key === key) || st.archive[key];
  if (!ev) return `<p class="muted">Event not found.</p>`;
  const r = st.archive[key];
  const head = `<header class="page-h"><div><p class="eyebrow">${MONTH_NAMES[(ev.month || 1) - 1]} ${ev.day || ""}, ${ev.year} · ${KIND_LABEL[kindOf(ev)] || "Custom"}</p><h1>${esc(ev.name)}</h1></div>
    ${!r && ev.status === "upcoming" ? `<button class="btn primary" data-act="runto" data-key="${esc(key)}">Sim up to this event</button>` : ""}</header>`;
  if (!r) return head + `<p class="muted">This event hasn't happened yet.</p>`;
  if (r.skipped) return head + `<p class="muted">Not held: ${esc(r.reason || "not enough entrants")}.</p>`;
  if (r.kind === "wildcards") {
    return head + `<div class="grid2"><section class="card"><h2>Wildcard winners</h2><ol class="plain">${r.winners.map((id, i) => `<li><span class="rk">${ordinal(i + 1)}</span>${nameLink(id)}</li>`).join("")}</ol></section>
      <section class="card"><h2>Runners-up · go to the Second League</h2><ol class="plain">${r.runnersUp.map((id) => `<li>${nameLink(id)}</li>`).join("")}</ol></section></div>`;
  }
  if (r.kind === "review") {
    return head + `<div class="grid3"><section class="card"><h2>Retired</h2><ul class="plain">${r.retired.map((id) => `<li>${nameLink(id)} ${statusChip(P(id).status)}</li>`).join("") || "<li class='muted'>Nobody</li>"}</ul></section>
      <section class="card"><h2>Comebacks</h2><ul class="plain">${r.comebacks.map((id) => `<li>${nameLink(id)}</li>`).join("") || "<li class='muted'>None</li>"}</ul></section>
      <section class="card"><h2>New names (${r.rookies.length})</h2><ul class="plain cols">${r.rookies.slice(0, 60).map((id) => `<li>${nameLink(id)} <span class="muted small">pot ${round(P(id).potential)}</span></li>`).join("")}</ul></section></div>`;
  }
  const podium = [r.champion, r.runnerUp, r.third].filter(Boolean);
  return head + `
  <section class="podium">${podium.map((id, i) => `<a class="pod p${i + 1}" href="#bb/${encodeURIComponent(id)}">${avatar(id, "lg")}<span class="pl">${["Champion", "Runner-up", "Third"][i]}</span><b>${esc(P(id).name)}</b><span class="muted">${esc(countryName(P(id).country))}</span></a>`).join("")}</section>
  ${r.format === "7ts" ? smokeTable(r) : bracketView(r)}
  <div class="grid2">
    ${r.elimination ? `<section class="card"><h2>Elimination ranking</h2><ol class="plain two">${r.elimination.map((id, i) => `<li class="${i < r.bracketSize ? "" : "out"}"><span class="rk">${i + 1}</span>${nameLink(id)}</li>`).join("")}</ol></section>` : ""}
    <section class="card"><h2>Judges</h2><ul class="plain">${(r.judges || []).map((id) => `<li>${nameLink(id)}</li>`).join("") || "<li class='muted'>Not recorded</li>"}</ul>
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

// ---------------- rankings ----------------
export function viewRankings(params) {
  const by = params.get("by") || "elo";
  const cc = params.get("c") || "";
  const status = params.get("s") || "active";
  const list = ranking(A.state, { by, country: cc || null, status }).slice(0, 300);
  const countries = [...new Set(Object.values(A.state.people).filter((p) => p.status === "active").map((p) => p.country).filter(Boolean))]
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  return `<header class="page-h"><h1>Rankings</h1>
    <form class="filters" data-form="rankings">
      <label>Sort by <select name="by"><option value="elo"${by === "elo" ? " selected" : ""}>Elo points</option><option value="rating"${by === "rating" ? " selected" : ""}>Skill rating</option></select></label>
      <label>Country <select name="c"><option value="">Everywhere</option>${countries.map((c) => `<option value="${c}"${c === cc ? " selected" : ""}>${esc(countryName(c))}</option>`).join("")}</select></label>
      <label>Status <select name="s">${["active", "retired", "judge", "all"].map((s) => `<option${s === status ? " selected" : ""}>${s}</option>`).join("")}</select></label>
    </form></header>
  <div class="tbl-wrap"><table class="tbl rank-tbl"><thead><tr><th>#</th><th>Beatboxer</th><th>Country</th><th class="num">Elo</th><th>Rating / potential</th><th class="num">Titles</th></tr></thead><tbody>
  ${list.map((p, i) => `<tr><td class="rk">${i + 1}</td><td>${avatar(p.id)}${nameLink(p.id, false)}</td><td>${flag(p.country)} ${esc(countryName(p.country))}</td>
    <td class="num">${Math.round(p.elo)}</td><td class="rcell"><span class="num">${round(p.rating)}</span>${ratingBar(p.rating, p.potential)}<span class="num muted">${round(p.potential)}</span></td><td class="num">${p.titles.length}</td></tr>`).join("")}
  </tbody></table></div>`;
}

// ---------------- beatboxer list (search + create) ----------------
export function viewPeople(params) {
  const q = (params.get("q") || "").toLowerCase();
  const list = Object.values(A.state.people).filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.includes(q) || (p.aliases || []).some((a) => a.toLowerCase().includes(q)))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 200);
  return `<header class="page-h"><h1>Beatboxers</h1>
    <form class="filters" data-form="people"><label>Search <input name="q" id="people-q" value="${esc(params.get("q") || "")}" placeholder="Name or alias" autocomplete="off"></label></form>
    <button class="btn" data-act="create">Add a beatboxer</button></header>
  <p class="muted small">Click anyone to see their profile, edit their stats or give them a picture.</p>
  <div class="people-grid">${list.map((p) => `<a class="person" href="#bb/${encodeURIComponent(p.id)}">${avatar(p.id, "md")}<span><b>${esc(p.name)}</b><span class="muted small">${flag(p.country)} ${esc(countryName(p.country))} · ${esc(p.status)}</span></span><span class="num big">${round(p.rating)}</span></a>`).join("")}</div>`;
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
  return `
  <section class="profile">
    <div class="pf-pic">${avatar(id, "xl")}
      <label class="btn small">Upload picture<input type="file" accept="image/*" data-upload="${esc(id)}" hidden></label>
      ${imageCache.get(id) ? `<button class="btn small ghost" data-act="rmpic" data-id="${esc(id)}">Remove picture</button>` : ""}
    </div>
    <div class="pf-main">
      <p class="eyebrow">${flag(p.country)} ${esc(countryName(p.country))}${p.countries?.length > 1 ? ` · also ${p.countries.slice(1).map((c) => esc(countryName(c))).join(", ")}` : ""}</p>
      <h1>${esc(p.name)} ${statusChip(p.status)}</h1>
      ${p.aliases?.length ? `<p class="muted small">Also known as ${p.aliases.map(esc).join(", ")}</p>` : ""}
      <div class="stats">
        <div><span class="lbl">Rating</span><span class="big num">${round(p.rating)}</span></div>
        <div><span class="lbl">Potential</span><span class="big num">${round(p.potential)}</span></div>
        <div><span class="lbl">Peak</span><span class="big num">${round(p.peak)}</span></div>
        <div><span class="lbl">Elo</span><span class="big num">${Math.round(p.elo)}</span></div>
        <div><span class="lbl">Debut</span><span class="big num">${p.debut ?? "–"}</span></div>
        <div><span class="lbl">Titles</span><span class="big num">${p.titles.length}</span></div>
      </div>
      ${sparkline(p.hist)}
      <button class="btn ${fav ? "primary" : ""}" data-act="fav" data-id="${esc(id)}">${fav ? "Following · cutscenes on" : "Follow (cutscene when they win)"}</button>
    </div>
  </section>
  <div class="grid2">
    <section class="card"><h2>Edit stats</h2>
      <form class="edit" data-form="edit" data-id="${esc(id)}">
        <label>Name<input name="name" value="${esc(p.name)}" required></label>
        <label>Country<select name="country">${countries.map((c) => `<option value="${c}"${c === p.country ? " selected" : ""}>${esc(countryName(c))}</option>`).join("")}</select></label>
        <label>Status<select name="status">${["active", "retired", "judge", "removed"].map((s) => `<option${s === p.status ? " selected" : ""}>${s}</option>`).join("")}</select></label>
        <label>Rating<input name="rating" type="number" min="1" max="99" step="1" value="${round(p.rating)}"></label>
        <label>Potential<input name="potential" type="number" min="1" max="99" step="1" value="${round(p.potential)}"></label>
        <label>Retirement chance per season<input name="retirementRisk" type="number" min="0" max="1" step="0.01" value="${(p.retirementRisk ?? 0).toFixed(2)}"></label>
        <label>Becomes judge on retiring<input name="judgeChance" type="number" min="0" max="1" step="0.01" value="${(p.judgeChance ?? 0).toFixed(2)}"></label>
        <label class="wide">Note<input name="note" value="${esc(p.note || "")}"></label>
        <div class="wide row gap"><button class="btn primary" type="submit">Save changes</button><span class="muted small" data-saved></span></div>
      </form>
    </section>
    <section class="card"><h2>Titles</h2>
      <ul class="plain">${titles.map((t) => `<li><span class="yr">${t.year}</span>${esc(compName(t.comp))}${t.cat && t.cat !== "solo" ? ` <span class="muted">(${esc(t.cat.replace(/_/g, " "))})</span>` : ""}${t.real ? "" : ' <span class="chip sim">sim</span>'}</li>`).join("") || "<li class='muted'>No titles yet</li>"}</ul>
      <h2 class="mt">Simulated results</h2>
      <ul class="plain">${results.map((r) => { const pl = r.standings.indexOf(id); return `<li><span class="yr">${r.year}</span><a href="#event/${encodeURIComponent(r.key)}">${esc(r.name)}</a> <span class="muted">${pl === 0 ? "🏆 Champion" : pl >= 0 ? ordinal(pl + 1) : "entered"}</span></li>`; }).join("") || "<li class='muted'>Nothing simulated yet</li>"}</ul>
    </section>
  </div>`;
}

function sparkline(hist = []) {
  if (hist.length < 2) return `<p class="muted small">Rating history appears after a season.</p>`;
  const w = 320, h = 70, pad = 6;
  const ys = hist.map((x) => x.r), lo = Math.min(...ys) - 2, hi = Math.max(...ys) + 2;
  const X = (i) => pad + (i * (w - 2 * pad)) / (hist.length - 1), Y = (v) => h - pad - ((v - lo) * (h - 2 * pad)) / (hi - lo || 1);
  const d = hist.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x.r).toFixed(1)}`).join("");
  return `<figure class="spark"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Rating by season">
    <path d="${d} L${X(hist.length - 1)},${h} L${X(0)},${h} Z" class="area"/><path d="${d}" class="line"/>
    <circle cx="${X(hist.length - 1)}" cy="${Y(ys[ys.length - 1])}" r="3.5" class="dot"/></svg>
    <figcaption class="muted small">${hist[0].y}: ${Math.round(hist[0].r)} → ${hist[hist.length - 1].y}: ${Math.round(ys[ys.length - 1])}</figcaption></figure>`;
}

// ---------------- champions ----------------
export function viewChampions() {
  const st = A.state;
  const grid = nationalChampionGrid(st);
  const years = [];
  for (let y = Math.max(2017, st.year - 9); y <= st.year; y++) years.push(y);
  const ccs = Object.keys(grid).sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const majors = ["gbb", "bbwc"].map((c) => ({ c, list: championsOf(st, c).reverse() }));
  return `<header class="page-h"><h1>Champions</h1></header>
  <div class="grid2">${majors.map(({ c, list }) => `<section class="card"><h2>${esc(compName(c))}</h2><ol class="plain">${list.map((x) => `<li><span class="yr">${x.year}</span>${nameLink(x.id)}${x.real ? "" : ' <span class="chip sim">sim</span>'}</li>`).join("")}</ol></section>`).join("")}</div>
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
  return `<header class="page-h"><h1>Countries</h1><p class="muted">Level comes from each country's best active beatboxers.</p></header>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Country</th><th class="num">Level</th><th class="num">Active</th><th>Top beatboxers</th></tr></thead><tbody>
  ${rows.map((r, i) => `<tr><td class="rk">${i + 1}</td><td>${flag(r.cc)} ${esc(countryName(r.cc))}</td><td class="num">${Math.round(r.level)}</td><td class="num">${r.list.length}</td>
    <td>${r.list.slice(0, 4).map((p) => `${nameLink(p.id, false)} <span class="muted small">${round(p.rating)}</span>`).join(" · ")}</td></tr>`).join("")}
  </tbody></table></div>`;
}

// ---------------- custom tournaments ----------------
export function viewCustom(pick = []) {
  const st = A.state;
  const countries = [...new Set(Object.values(st.people).filter((p) => p.status === "active").map((p) => p.country).filter(Boolean))]
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  return `<header class="page-h"><h1>Custom tournament</h1></header>
  <div class="grid2">
    <section class="card"><h2>Set it up</h2>
      <form class="edit" data-form="custom">
        <label class="wide">Name<input name="name" value="Dream Battle ${st.year}" required></label>
        <label>Bracket size<select name="bracket"><option>4</option><option selected>8</option><option>16</option><option>32</option></select></label>
        <label>Field<select name="mode"><option value="top">World top by rating</option><option value="country">Top of one country</option><option value="pick">Pick by hand</option><option value="prospects">Best prospects</option></select></label>
        <label>Country (for "top of one country")<select name="country">${countries.map((c) => `<option value="${c}">${esc(countryName(c))}</option>`).join("")}</select></label>
        <label>Entrants (elimination round if more than the bracket)<input name="field" type="number" min="4" max="64" value="8"></label>
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
  const box = (k, label) => `<label class="check"><input type="checkbox" data-setting="${k}"${s[k] ? " checked" : ""}> ${label}</label>`;
  return `<header class="page-h"><h1>Settings & saves</h1></header>
  <div class="grid2">
    <section class="card"><h2>Cutscenes</h2>
      ${box("cutscenes", "Play cutscenes (GBB, BBWC, wildcards, legends retiring)")}
      ${box("sound", "Beat and sound effects")}
      ${box("nationalCutscenes", "Also play a cutscene for every national champion")}
      <div class="row gap mt"><button class="btn" data-act="demo" data-type="champion">Preview champion</button><button class="btn" data-act="demo" data-type="wildcards">Preview wildcards</button><button class="btn" data-act="demo" data-type="retirement">Preview retirement</button></div>
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
