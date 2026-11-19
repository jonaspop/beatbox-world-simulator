import { loadData, saveGame, loadGame, putImage, deleteImage, warmImages, imageCache, flagColors, flagUrl, esc, SAVE_VERSION } from "./data.js";
import { setData, newGame, attachState, runNext, nextEvent, runCustom, runBracket, ranking } from "./sim.js";
import * as V from "./views.js";
import { playCutscene, setMuted } from "./cutscene.js";
import { watchLive } from "./live.js";

const app = { state: null, data: null, busy: false, picks: [] };
const $main = document.getElementById("main");
const $status = document.getElementById("status");
const setting = (k, def = true) => app.state.settings[k] ?? def;

// ---------- boot ----------
(async function boot() {
  try {
    app.data = await loadData((f) => { $main.innerHTML = loader(f); });
    setData(app.data);
    await warmImages();
    const saved = await loadGame("auto");
    app.state = saved && saved.version === SAVE_VERSION ? attachState(saved) : newGame();
    V.bindViews(app);
    setMuted(!setting("sound"));
    window.addEventListener("hashchange", render);
    render();
  } catch (e) {
    console.error(e);
    $main.innerHTML = `<section class="card"><h2>Could not start</h2><p>${esc(e.message)}</p>
      <p class="muted">Open the game through a web server (GitHub Pages, or <code>python -m http.server</code> in the project folder). Browsers block the data files when the page is opened straight from disk.</p></section>`;
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
    people: () => V.viewPeople(r.params), rankings: () => V.viewPeople(r.params), bb: () => V.viewProfile(r.arg),
    history: () => V.viewHistory(r.arg),
    champions: () => V.viewChampions(), countries: () => V.viewCountries(), custom: () => V.viewCustom(app.picks),
    settings: () => V.viewSettings(),
  };
  $main.innerHTML = (views[r.name] || views.home)();
  const navName = r.name === "bb" || r.name === "rankings" ? "people" : r.name === "event" ? "calendar" : r.name === "history" ? "champions" : r.name;
  window.scrollTo(0, 0);
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${navName}`));
  updateStatus();
  if (r.name === "people") {
    const q = document.getElementById("people-q");
    if (q && r.params.get("q")) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
}
function updateStatus() {
  const ev = nextEvent(app.state);
  $status.innerHTML = `<span class="yr">${app.state.year}</span><span>${ev ? `Next · ${esc(ev.name.replace(` ${app.state.year}`, ""))}` : "Season over"}</span>`;
  const m = document.getElementById("mute");
  if (m) { m.textContent = setting("sound") ? "Mute" : "Unmute"; m.setAttribute("aria-pressed", String(!setting("sound"))); }
}
async function setSound(on) {
  app.state.settings.sound = on;
  setMuted(!on);
  updateStatus();
  await saveGame("auto", app.state);
}

// ---------- the choice before qualifiers, GBB and BBWC ----------
function choicesFor(ev) {
  if (ev.kind === "wildcards") return [["watch", "Watch wildcards", "The full wildcard ceremony, one beatboxer at a time"], ["skip", "Skip", "Just show the results"]];
  if (ev.qualifier) return [["watch", "Watch wildcards", "Wildcard ceremony, then every battle live"], ["battle", "Skip to battle", "Straight to the live battles"], ["skip", "Skip competition", "Simulate it and move on"]];
  if (["gbb", "bbwc"].includes(ev.comp)) return [["battle", "Watch it live", "Every battle and every judge's vote"], ["skip", "Skip competition", "Simulate it and move on"]];
  return null;
}
function askChoice(ev) {
  const opts = choicesFor(ev);
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "choice";
    el.innerHTML = `<div class="choice-box" role="dialog" aria-modal="true" aria-labelledby="choice-h">
      <p class="eyebrow">${V.kindIcon(V.kindOf(ev))} ${esc(V.KIND_LABEL[V.kindOf(ev)] || "Event")} · ${esc(ev.name.match(/\d{4}/)?.[0] || "")}</p>
      <h2 id="choice-h">${esc(ev.name)}</h2>
      <div class="choice-opts">${opts.map(([k, label, sub], i) => `<button class="choice-opt${i === 0 ? " first" : ""}" data-choice="${k}"><b>${esc(label)}</b><span>${esc(sub)}</span></button>`).join("")}</div>
      <label class="check"><input type="checkbox" data-remember> Use this choice for the rest of the season</label>
    </div>`;
    document.body.appendChild(el);
    el.querySelector(".choice-opt").focus();
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-choice]");
      if (!b) return;
      const remember = el.querySelector("[data-remember]").checked;
      el.remove();
      resolve({ choice: b.dataset.choice, remember });
    });
  });
}
async function decide(ev) {
  const opts = choicesFor(ev);
  if (!opts) return null;
  const keys = opts.map((o) => o[0]);
  const fit = (c) => (keys.includes(c) ? c : c === "watch" && keys.includes("battle") ? "battle" : c === "battle" && keys.includes("watch") ? "watch" : keys[keys.length - 1]);
  const st = app.state;
  if (st.seasonChoice?.year === st.year) return fit(st.seasonChoice.choice);
  if (!setting("askBefore")) return fit(setting("defaultChoice", "watch"));
  const { choice, remember } = await askChoice(ev);
  if (remember) st.seasonChoice = { year: st.year, choice };
  return choice;
}

// ---------- helpers shared with the cutscenes and the live viewer ----------
const helpers = {
  person: (id) => { const p = app.state.people[id] || {}; return { name: p.name || id, country: p.country, countryName: V.countryName(p.country), status: p.status, rating: Math.round(p.rating ?? 0) }; },
  image: (id) => imageCache.get(id),
  flag: (cc) => flagColors(cc),
  flagUrl: (cc) => flagUrl(cc),
  flagHTML: (cc) => V.flag(cc),
  onMute: (muted) => setSound(!muted),
  avatarHTML: (id, size = "xl") => V.avatar(id, size),
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
const judgeNames = (r) => {
  const names = (r.judges || []).map((id) => app.state.people[id]?.name || id);
  while (names.length < 5) names.push("Guest judge");
  return names;
};
async function play(list) {
  for (const sc of list) await playCutscene(sc, helpers, { sound: setting("sound") });
}
const live = (rec) => watchLive(rec, helpers, { sound: setting("sound"), judges: judgeNames(rec) });

// which cutscenes are worth stopping for
function wanted(sc, ev, quiet) {
  if (sc.type === "ceremony") return true; // shown or skipped through the choice panel
  if (!setting("cutscenes")) return false;
  if (app.state.settings.favorites.includes(sc.id)) return true;
  if (sc.type === "champion" && sc.tier === "national") return setting("nationalCutscenes", false);
  if (!quiet) return true;
  return sc.type === "retirement" || sc.type === "comeback" || (sc.type === "champion" && ["gbb", "bbwc", "qualifier"].includes(sc.tier));
}

// ---------- simulation controls ----------
async function simUntil(stop, { quiet = false, liveKey = null, silentBefore = false } = {}) {
  if (app.busy) return;
  app.busy = true;
  document.body.classList.add("busy");
  try {
    for (let n = 0; n < 500; n++) {
      const ev = nextEvent(app.state);
      if (!ev || stop(ev, n)) break;
      const forced = liveKey && ev.key === liveKey;
      const silent = silentBefore && !forced;
      // qualifiers, GBB wildcards, GBB and BBWC ask how you want to see them
      const choice = silent ? null : forced ? "watch" : await decide(ev);
      const out = runNext(app.state);
      if (silent) { if (n % 8 === 7) await tick(ev); continue; }
      let scenes = out.cutscenes.filter((sc) => wanted(sc, ev, quiet && !forced));
      const hasBattles = out.result && out.result.battles?.length && out.result.format !== "7ts";
      let watch = forced && hasBattles;
      if (choice) {
        if (choice === "skip") scenes = scenes.filter((sc) => sc.type !== "ceremony" && sc.type !== "champion");
        if (choice === "battle") scenes = scenes.filter((sc) => sc.type !== "ceremony");
        watch = choice !== "skip" && hasBattles;
      }
      if (scenes.length || watch) {
        updateStatus(); // don't draw the results page yet: it would spoil the winner behind the overlay
        await play(scenes.filter((s) => s.before));
        if (watch) await live(app.state.archive[ev.key]);
        await play(scenes.filter((s) => !s.before));
      } else if (n % 8 === 7) await tick(ev);
    }
    await saveGame("auto", app.state);
  } finally {
    app.busy = false;
    document.body.classList.remove("busy");
    render();
  }
}
async function tick(ev) {
  $status.textContent = `Simulating… ${ev.name}`;
  await new Promise((r) => setTimeout(r));
}

// ---------- actions ----------
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.closest(".live")) return;
  const act = b.dataset.act;
  const st = app.state;
  if (act === "next") return simUntil((ev, n) => n >= 1);
  if (act === "month") { const m = nextEvent(st)?.month; return simUntil((ev) => ev.month !== m || ev.kind === "review", { quiet: true }); }
  if (act === "tognext") { let seen = false; return simUntil((ev) => { if (seen) return true; if (ev.comp === b.dataset.target) seen = true; return false; }, { quiet: true }); }
  if (act === "season") { const y = st.year; return simUntil(() => app.state.year !== y, { quiet: true }); }
  if (act === "runto") { const key = b.dataset.key; let hit = false; return simUntil((ev) => { if (hit) return true; if (ev.key === key) hit = true; return false; }, { quiet: true }).then(() => { location.hash = `#event/${encodeURIComponent(key)}`; }); }
  if (act === "live") {
    const key = b.dataset.key; let hit = false;
    await simUntil((ev) => { if (hit) return true; if (ev.key === key) hit = true; return false; }, { quiet: true, liveKey: key, silentBefore: true });
    location.hash = `#event/${encodeURIComponent(key)}`;
    return;
  }
  if (act === "replay") { const r = st.archive[b.dataset.key]; if (r) await live(r); return; }
  if (act === "mute") return setSound(!setting("sound"));
  if (act === "forgetchoice") { st.seasonChoice = null; await saveGame("auto", st); return render(); }
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
    if (b.dataset.armed) { const keep = app.state.settings; app.state = newGame(); app.state.settings = { ...keep, favorites: keep.favorites || [] }; await saveGame("auto", app.state); location.hash = "#home"; return render(); }
    b.dataset.armed = "1"; b.textContent = "Click again to wipe this save and restart"; if (c) c.textContent = "Pictures you uploaded are kept.";
  }
});

// filters and forms
document.addEventListener("change", async (e) => {
  const f = e.target.closest("[data-form='people']");
  if (f && e.target.name !== "q") { location.hash = `#people?${new URLSearchParams(new FormData(f))}`; return; }
  if (e.target.matches("[data-setting]")) {
    const k = e.target.dataset.setting;
    if (k === "sound") return setSound(e.target.checked);
    app.state.settings[k] = e.target.checked; await saveGame("auto", app.state); return;
  }
  if (e.target.matches("[data-setting-select]")) { app.state.settings[e.target.dataset.settingSelect] = e.target.value; await saveGame("auto", app.state); return; }
  if (e.target.matches("[data-upload]")) return uploadPicture(e.target.dataset.upload, e.target.files[0]);
  if (e.target.matches("[data-import]")) return importSave(e.target.files[0]);
});
let searchTimer;
document.addEventListener("input", (e) => {
  if (e.target.id === "people-q") {
    clearTimeout(searchTimer);
    const f = e.target.closest("form");
    searchTimer = setTimeout(() => { history.replaceState(null, "", `#people?${new URLSearchParams(new FormData(f))}`); render(); }, 220);
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
  p.noSolo = !!d.noSolo;
  p.note = d.note;
  p.handEdited = true;
  await saveGame("auto", app.state);
  render();
  const s = document.querySelector("[data-saved]");
  if (s) s.textContent = "Saved";
}

async function uploadPicture(id, file) {
  if (!file) return;
  try {
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
    if (!img) throw new Error("That file isn't an image the browser can read");
    // keep a larger picture so it looks sharp in full-screen ceremonies
    const S = 900, c = document.createElement("canvas");
    const s = Math.min(1, S / Math.max(img.width, img.height));
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const small = c.toDataURL("image/jpeg", 0.88);
    await putImage(id, small);
    imageCache.set(id, small);
    render();
    toast("Picture saved");
  } catch (err) { toast(`Could not use that picture: ${err.message}`); }
}

function createPerson() {
  const st = app.state;
  let n = 1, id;
  do { id = `custom${n++}`; } while (st.people[id]);
  st.people[id] = { id, name: "New Beatboxer", country: "us", countries: ["us"], status: "active", rating: 60, potential: 75, peak: 60,
    elo: 1000, debut: st.year, lastCompeted: null, retirementRisk: 0.05, judgeChance: 0.2, titles: [], form: 0, hist: [], aliases: [], note: "", created: true };
  location.hash = `#bb/${id}`;
}

async function customTournament(f) {
  const st = app.state;
  const d = Object.fromEntries(new FormData(f));
  const bracket = +d.bracket, field = Math.max(bracket, Math.min(64, +d.field || bracket));
  const act = ranking(st, { by: "rating" }).filter((p) => !p.noSolo);
  let ids;
  if (d.mode === "pick") ids = app.picks.slice();
  else if (d.mode === "country") ids = act.filter((p) => p.country === d.country).slice(0, field).map((p) => p.id);
  else if (d.mode === "prospects") ids = act.filter((p) => p.rating >= 55).sort((a, b) => (b.potential - b.rating) - (a.potential - a.rating)).slice(0, field).map((p) => p.id);
  else ids = act.slice(0, field).map((p) => p.id);
  if (ids.length < 2) { toast("Add at least two beatboxers."); return; }
  const rec = runCustom(st, { name: d.name, ids, bracket: Math.min(bracket, ids.length), third: !!d.third, progression: !!d.progression });
  rec.judges = ranking(st, { by: "rating", status: "judge" }).slice(0, 5).map((p) => p.id);
  await saveGame("auto", st);
  if (d.live) await live(rec);
  if (d.cutscene && setting("cutscenes")) await playCutscene({ type: "champion", id: rec.champion, event: d.name, tier: "event", runnerUp: rec.runnerUp }, helpers, { sound: setting("sound") });
  location.hash = `#event/${encodeURIComponent(rec.key)}`;
}
function toast(text) {
  const n = document.createElement("div");
  n.className = "toast"; n.textContent = text;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2800);
}

async function demo(type) {
  const top = ranking(app.state, { by: "rating" }).filter((p) => !p.noSolo);
  if (type === "live") {
    const ids = top.slice(0, 8).map((p) => p.id);
    const res = runBracket(app.state, ids, { bracket: 8, third: true, elimination: false });
    return live({ ...res, name: "Preview battle", judges: ranking(app.state, { by: "rating", status: "judge" }).slice(0, 5).map((p) => p.id) });
  }
  const sc = type === "ceremony" ? { type, ids: top.slice(6, 14).map((p) => p.id), event: `Grand Beatbox Battle ${app.state.year}`, label: "Wildcard" }
    : type === "retirement" ? { type, id: top[0].id } : { type: "champion", id: top[0].id, event: `Grand Beatbox Battle ${app.state.year}`, tier: "gbb", runnerUp: top[1].id };
  await playCutscene(sc, helpers, { sound: setting("sound") });
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
    toast("Save loaded");
  } catch (err) { toast(`Could not load that file: ${err.message}`); }
}
