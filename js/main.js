import { loadData, saveGame, loadGame, putImage, deleteImage, warmImages, imageCache, flagColors, esc, SAVE_VERSION } from "./data.js";
import { setData, newGame, attachState, runNext, nextEvent, runCustom, ranking } from "./sim.js";
import * as V from "./views.js";
import { playCutscene } from "./cutscene.js";

const app = { state: null, data: null, busy: false, picks: [] };
const $main = document.getElementById("main");
const $status = document.getElementById("status");

// ---------- boot ----------
(async function boot() {
  try {
    app.data = await loadData((f) => { $main.innerHTML = loader(f); });
    setData(app.data);
    await warmImages();
    const saved = await loadGame("auto");
    app.state = saved && saved.version === SAVE_VERSION ? attachState(saved) : newGame();
    V.bindViews(app);
    window.addEventListener("hashchange", render);
    render();
  } catch (e) {
    console.error(e);
    $main.innerHTML = `<section class="card"><h2>Could not start</h2><p>${esc(e.message)}</p>
      <p class="muted">Open the game through a web server (for example GitHub Pages, or <code>python -m http.server</code> in the project folder). Browsers block the data files when the page is opened straight from disk.</p></section>`;
  }
})();

function loader(f) {
  return `<section class="boot"><h1>Beatbox World Simulator</h1><div class="meter"><span style="width:${Math.round(f * 100)}%"></span></div><p class="muted">Loading the scene… ${Math.round(f * 100)}%</p></section>`;
}

// ---------- routing ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1) || "home");
  const [path, query = ""] = h.split("?");
  const [name, ...rest] = path.split("/");
  return { name, arg: rest.join("/"), params: new URLSearchParams(query) };
}
function render() {
  if (!app.state) return;
  const r = route();
  const views = {
    home: () => V.viewHome(), calendar: () => V.viewCalendar(), event: () => V.viewEvent(r.arg),
    rankings: () => V.viewRankings(r.params), people: () => V.viewPeople(r.params), bb: () => V.viewProfile(r.arg),
    champions: () => V.viewChampions(), countries: () => V.viewCountries(), custom: () => V.viewCustom(app.picks),
    settings: () => V.viewSettings(),
  };
  $main.innerHTML = (views[r.name] || views.home)();
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${r.name}` || (r.name === "bb" && a.getAttribute("href") === "#people")));
  updateStatus();
  if (r.name === "people") {
    const q = document.getElementById("people-q");
    if (q && document.activeElement !== q && r.params.get("q")) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
}
function updateStatus() {
  const ev = nextEvent(app.state);
  $status.innerHTML = `<span class="yr">${app.state.year}</span><span>${ev ? `Next: ${esc(ev.name.replace(` ${app.state.year}`, ""))}` : "Season over"}</span>`;
}

// ---------- cutscene helpers ----------
const helpers = {
  person: (id) => { const p = app.state.people[id] || {}; return { name: p.name || id, country: p.country, countryName: V.countryName(p.country), status: p.status }; },
  image: (id) => imageCache.get(id),
  flag: (cc) => flagColors(cc),
  record: (id) => { const p = app.state.people[id]; return `Rating ${Math.round(p.rating)} · ${p.titles.length} career title${p.titles.length === 1 ? "" : "s"}`; },
  career: (id) => {
    const p = app.state.people[id];
    const majors = p.titles.filter((t) => (t.comp === "gbb" || t.comp === "bbwc") && t.cat === "solo");
    const lines = [];
    if (p.debut) lines.push(`On the scene since ${p.debut}`);
    if (majors.length) lines.push(`${majors.length} major title${majors.length > 1 ? "s" : ""}: ${majors.map((t) => `${t.comp.toUpperCase()} ${t.year}`).join(", ")}`);
    lines.push(`${p.titles.length} titles in total`);
    lines.push(`Peak rating ${Math.round(p.peak ?? p.rating)}`);
    return lines;
  },
};
async function play(list) {
  if (!app.state.settings.cutscenes) return;
  for (const sc of list) await playCutscene(sc, helpers, { sound: app.state.settings.sound });
}

// ---------- simulation controls ----------
const BIG = new Set(["gbb", "bbwc", "gbb_wildcards"]);
async function simUntil(stop, { quiet = false } = {}) {
  if (app.busy) return;
  app.busy = true;
  document.body.classList.add("busy");
  const queued = [];
  try {
    for (let n = 0; n < 400; n++) {
      const ev = nextEvent(app.state);
      if (!ev || stop(ev, n)) break;
      const out = runNext(app.state);
      // when simming many events, only keep the cutscenes that matter
      for (const sc of out.cutscenes) {
        if (!quiet || BIG.has(ev.comp) || sc.type === "retirement" || sc.type === "comeback" || app.state.settings.favorites.includes(sc.id)) queued.push(sc);
      }
      if (n % 6 === 5) { $status.textContent = `Simulating… ${ev.name}`; await new Promise((r) => setTimeout(r)); }
      if (queued.length && !quiet) break;
      if (queued.some((sc) => sc.type !== "retirement") && quiet) { await flush(queued); }
    }
    await flush(queued);
    await saveGame("auto", app.state);
  } finally {
    app.busy = false;
    document.body.classList.remove("busy");
    render();
  }
}
async function flush(queued) {
  if (!queued.length) return;
  render();
  await play(queued.splice(0));
}

// ---------- actions ----------
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const st = app.state;
  if (act === "next") return simUntil((ev, n) => n >= 1);
  if (act === "month") { const m = nextEvent(st)?.month; return simUntil((ev) => ev.month !== m || ev.kind === "review", { quiet: true }); }
  if (act === "tognext") { let seen = false; return simUntil((ev) => { if (seen) return true; if (ev.comp === b.dataset.target) seen = true; return false; }, { quiet: true }); }
  if (act === "season") { const y = st.year; return simUntil(() => app.state.year !== y, { quiet: true }); }
  if (act === "runto") { const key = b.dataset.key; let hit = false; return simUntil((ev) => { if (hit) return true; if (ev.key === key) hit = true; return false; }, { quiet: true }).then(() => { location.hash = `#event/${encodeURIComponent(key)}`; }); }
  if (act === "fav") {
    const id = b.dataset.id, f = st.settings.favorites;
    st.settings.favorites = f.includes(id) ? f.filter((x) => x !== id) : f.concat(id);
    await saveGame("auto", st); return render();
  }
  if (act === "rmpic") { await deleteImage(b.dataset.id); imageCache.delete(b.dataset.id); return render(); }
  if (act === "create") return createPerson();
  if (act === "unpick") { app.picks = app.picks.filter((x) => x !== b.dataset.id); return render(); }
  if (act === "addpick") { if (!app.picks.includes(b.dataset.id)) app.picks.push(b.dataset.id); return render(); }
  if (act === "demo") return demo(b.dataset.type);
  if (act === "export") return exportSave();
  if (act === "newgame") {
    const c = document.querySelector("[data-confirm]");
    if (b.dataset.armed) { app.state = newGame(); await saveGame("auto", app.state); location.hash = "#home"; return render(); }
    b.dataset.armed = "1"; b.textContent = "Click again to wipe this save and restart"; if (c) c.textContent = "Pictures you uploaded are kept.";
  }
});

// filters and forms
document.addEventListener("change", async (e) => {
  const f = e.target.closest("[data-form='rankings']");
  if (f) { const q = new URLSearchParams(new FormData(f)); location.hash = `#rankings?${q}`; return; }
  if (e.target.matches("[data-setting]")) { app.state.settings[e.target.dataset.setting] = e.target.checked; await saveGame("auto", app.state); return; }
  if (e.target.matches("[data-upload]")) return uploadPicture(e.target.dataset.upload, e.target.files[0]);
  if (e.target.matches("[data-import]")) return importSave(e.target.files[0]);
});
let searchTimer;
document.addEventListener("input", (e) => {
  if (e.target.id === "people-q") {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { history.replaceState(null, "", `#people?q=${encodeURIComponent(e.target.value)}`); render(); }, 220);
  }
  if (e.target.id === "pick-q") {
    const q = e.target.value.toLowerCase();
    const box = document.getElementById("pick-results");
    const list = q.length < 2 ? [] : Object.values(app.state.people).filter((p) => p.rating != null && p.status !== "removed" && p.name.toLowerCase().includes(q)).slice(0, 12);
    box.innerHTML = list.map((p) => `<button type="button" class="pick-r" data-act="addpick" data-id="${esc(p.id)}">${V.flag(p.country)} ${esc(p.name)} <span class="muted">${Math.round(p.rating)}</span></button>`).join("");
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === "edit") return saveEdit(f);
  if (f.dataset.form === "custom") return customTournament(f);
});

async function saveEdit(f) {
  const p = app.state.people[f.dataset.id];
  const d = Object.fromEntries(new FormData(f));
  const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v)));
  p.name = d.name.trim() || p.name;
  if (d.country !== p.country) { p.country = d.country; p.countries = [d.country, ...(p.countries || []).filter((c) => c !== d.country)]; }
  p.status = d.status;
  p.rating = num(d.rating, 1, 99);
  p.potential = Math.max(p.rating, num(d.potential, 1, 99));
  p.peak = Math.max(p.peak ?? p.rating, p.rating);
  p.retirementRisk = num(d.retirementRisk, 0, 1);
  p.judgeChance = num(d.judgeChance, 0, 1);
  p.note = d.note;
  p.handEdited = true;
  await saveGame("auto", app.state);
  render();
  const s = document.querySelector("[data-saved]");
  if (s) s.textContent = "Saved";
}

async function uploadPicture(id, file) {
  if (!file) return;
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
  if (!img) return;
  const S = 320, c = document.createElement("canvas");
  c.width = S; c.height = S;
  const s = Math.max(S / img.width, S / img.height);
  c.getContext("2d").drawImage(img, (S - img.width * s) / 2, (S - img.height * s) / 2, img.width * s, img.height * s);
  const small = c.toDataURL("image/jpeg", 0.86);
  await putImage(id, small);
  imageCache.set(id, small);
  render();
}

function createPerson() {
  const st = app.state;
  let n = 1, id;
  do { id = `custom${n++}`; } while (st.people[id]);
  st.people[id] = { id, name: "New Beatboxer", country: "us", countries: ["us"], status: "active", rating: 55, potential: 75, peak: 55,
    elo: 1000, debut: st.year, lastCompeted: null, retirementRisk: 0.05, judgeChance: 0.2, titles: [], form: 0, hist: [], aliases: [], note: "", created: true };
  location.hash = `#bb/${id}`;
}

async function customTournament(f) {
  const st = app.state;
  const d = Object.fromEntries(new FormData(f));
  const bracket = +d.bracket, field = Math.max(bracket, Math.min(64, +d.field || bracket));
  const act = ranking(st, { by: "rating" });
  let ids;
  if (d.mode === "pick") ids = app.picks.slice();
  else if (d.mode === "country") ids = act.filter((p) => p.country === d.country).slice(0, field).map((p) => p.id);
  else if (d.mode === "prospects") ids = act.filter((p) => p.rating >= 55).sort((a, b) => (b.potential - b.rating) - (a.potential - a.rating)).slice(0, field).map((p) => p.id);
  else ids = act.slice(0, field).map((p) => p.id);
  if (ids.length < 2) { alertCard("Add at least two beatboxers."); return; }
  const rec = runCustom(st, { name: d.name, ids, bracket: Math.min(bracket, ids.length), third: !!d.third, progression: !!d.progression });
  await saveGame("auto", st);
  if (d.cutscene && st.settings.cutscenes) await playCutscene({ type: "champion", id: rec.champion, event: d.name, tier: "event", runnerUp: rec.runnerUp }, helpers, { sound: st.settings.sound });
  location.hash = `#event/${encodeURIComponent(rec.key)}`;
}
function alertCard(text) {
  const n = document.createElement("div");
  n.className = "toast"; n.textContent = text;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2600);
}

async function demo(type) {
  const top = ranking(app.state, { by: "rating" });
  const sc = type === "wildcards" ? { type, ids: top.slice(8, 20).map((p) => p.id), event: `GBB ${app.state.year}` }
    : type === "retirement" ? { type, id: top[0].id } : { type: "champion", id: top[0].id, event: `Grand Beatbox Battle ${app.state.year}`, tier: "gbb", runnerUp: top[1].id };
  await playCutscene(sc, helpers, { sound: app.state.settings.sound });
}

function exportSave() {
  const blob = new Blob([JSON.stringify(app.state)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `beatbox-world-sim-${app.state.year}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importSave(file) {
  if (!file) return;
  try {
    const st = JSON.parse(await file.text());
    if (!st.people || !st.season) throw new Error("not a save file");
    app.state = attachState(st);
    await saveGame("auto", app.state);
    location.hash = "#home";
    render();
    alertCard("Save loaded");
  } catch (err) { alertCard(`Could not load that file: ${err.message}`); }
}
