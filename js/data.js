// Data loading, game state, saving (IndexedDB) and small shared helpers.

export const START_YEAR = 2027;
export const SAVE_VERSION = 2;

// ---------- random numbers (seeded, so a save can be replayed) ----------
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return {
    next,
    get state() { return s; },
    set state(v) { s = v >>> 0 || 1; },
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(1e-9, next()), v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance: (p) => next() < p,
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
  };
}

// ---------- regions (used to decide who enters which event) ----------
const REGION_LIST = {
  europe: "fr de it es gb gb-sct gb-wls gb-eng gb-nir ie be nl ch at dk se no fi pl cz sk hu ro bg rs si hr gr pt lt lv ee ua by ru lu ge tr az",
  north_america: "us ca mx",
  latin_america: "br ar cl co ve pe bo ec uy py cr ni mx",
  asia: "jp kr cn hk tw sg my id vn th ph in pk ir kz",
  oceania: "au nz",
  africa_mena: "ma eg tn dz sa ae jo lb sy iq za ng ke gh mg ci il kw qa bh om",
};
export const REGION = {};
for (const [r, codes] of Object.entries(REGION_LIST)) for (const c of codes.split(" ")) (REGION[c] ||= []).push(r);
export const inRegion = (cc, region) => (REGION[cc] || []).includes(region);

// ---------- country colours (simple tricolour flags drawn in CSS / canvas) ----------
const FLAG = {
  fr: ["#1f4fa8", "#f4f4f4", "#d8323c"], it: ["#1d8f4e", "#f4f4f4", "#d63a3a"], be: ["#1b1b1b", "#f6cd36", "#e2363b"],
  de: ["#1b1b1b", "#dd2b2b", "#f3c623"], us: ["#2b3f8f", "#f4f4f4", "#c8323c"], gb: ["#22377c", "#f4f4f4", "#cf2d3c"],
  "gb-sct": ["#1d5fb0", "#f4f4f4", "#1d5fb0"], "gb-wls": ["#f4f4f4", "#d8323c", "#1f8a45"], ie: ["#1e9a5a", "#f4f4f4", "#f08a2c"],
  es: ["#c8262c", "#f5c33b", "#c8262c"], pt: ["#1e7a3d", "#d8323c", "#f3c623"], nl: ["#b8263a", "#f4f4f4", "#24489b"],
  ch: ["#d8262c", "#f4f4f4", "#d8262c"], at: ["#d32f3a", "#f4f4f4", "#d32f3a"], dk: ["#c8263a", "#f4f4f4", "#c8263a"],
  se: ["#2462a5", "#f5c93a", "#2462a5"], no: ["#c8263a", "#f4f4f4", "#24489b"], fi: ["#f4f4f4", "#2155a3", "#f4f4f4"],
  pl: ["#f4f4f4", "#d8263c", "#d8263c"], cz: ["#f4f4f4", "#d8263c", "#21468f"], sk: ["#f4f4f4", "#2148a3", "#d8263c"],
  bg: ["#f4f4f4", "#1e9a5a", "#d8263c"], ru: ["#f4f4f4", "#2450a3", "#d8263c"], ua: ["#2a64b8", "#f5d03a", "#f5d03a"],
  lt: ["#f2be2c", "#1e7a45", "#c8323c"], hu: ["#c8323c", "#f4f4f4", "#3a7a45"], ro: ["#2548a0", "#f3c623", "#cf2d3c"],
  tr: ["#d8263c", "#f4f4f4", "#d8263c"], gr: ["#2a64b8", "#f4f4f4", "#2a64b8"], ca: ["#d8263c", "#f4f4f4", "#d8263c"],
  mx: ["#1e7a45", "#f4f4f4", "#c8263a"], br: ["#1f9a4a", "#f5d03a", "#22408f"], ar: ["#74ace0", "#f4f4f4", "#74ace0"],
  cl: ["#2452a5", "#f4f4f4", "#d8263c"], co: ["#f5cd30", "#24489b", "#d8263c"], ve: ["#f2c230", "#21468f", "#cf2d3c"],
  pe: ["#d8263c", "#f4f4f4", "#d8263c"], bo: ["#d8263c", "#f5d03a", "#1e9a4a"], ni: ["#2a64b8", "#f4f4f4", "#2a64b8"],
  jp: ["#f4f4f4", "#cf2d3c", "#f4f4f4"], kr: ["#f4f4f4", "#cf2d3c", "#2450a3"], cn: ["#d8263c", "#f5cd30", "#d8263c"],
  hk: ["#d8263c", "#f4f4f4", "#d8263c"], tw: ["#2450a3", "#d8263c", "#d8263c"], sg: ["#d8263c", "#f4f4f4", "#f4f4f4"],
  my: ["#22408f", "#f5cd30", "#cf2d3c"], id: ["#d8263c", "#f4f4f4", "#f4f4f4"], ph: ["#2452a5", "#f4f4f4", "#d8263c"],
  in: ["#f29a3a", "#f4f4f4", "#1e9a4a"], pk: ["#1e6a3d", "#f4f4f4", "#1e6a3d"], ir: ["#1e9a4a", "#f4f4f4", "#d8263c"],
  kz: ["#2ab1d8", "#f5cd30", "#2ab1d8"], vn: ["#d8263c", "#f5cd30", "#d8263c"], th: ["#d8263c", "#f4f4f4", "#24408f"],
  au: ["#22377c", "#f4f4f4", "#22377c"], nz: ["#22377c", "#d8263c", "#22377c"], za: ["#1e7a45", "#f5cd30", "#d8323c"],
  ma: ["#c8263a", "#1e7a45", "#c8263a"], eg: ["#d8263c", "#f4f4f4", "#1b1b1b"], tn: ["#d8263c", "#f4f4f4", "#d8263c"],
  sa: ["#1e7a45", "#f4f4f4", "#1e7a45"], il: ["#f4f4f4", "#2452a5", "#f4f4f4"], jo: ["#1b1b1b", "#f4f4f4", "#1e7a45"],
  sy: ["#d8263c", "#f4f4f4", "#1b1b1b"], az: ["#2ab1d8", "#d8263c", "#1e9a4a"], ge: ["#f4f4f4", "#d8263c", "#f4f4f4"],
  lv: ["#9e2b37", "#f4f4f4", "#9e2b37"], ee: ["#2a6fc0", "#1b1b1b", "#f4f4f4"], lu: ["#e2363b", "#f4f4f4", "#3ea0dc"],
  si: ["#f4f4f4", "#2452a5", "#d8263c"], hr: ["#d8263c", "#f4f4f4", "#24408f"], rs: ["#c8323c", "#24408f", "#f4f4f4"],
  by: ["#c8323c", "#c8323c", "#3a8a45"], ci: ["#f29a3a", "#f4f4f4", "#1e9a4a"], dz: ["#1e7a45", "#f4f4f4", "#d8263c"],
};
export function flagColors(cc) {
  if (FLAG[cc]) return FLAG[cc];
  let h = 0;
  for (const ch of cc || "xx") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return [`hsl(${hue} 55% 45%)`, "#f1edf6", `hsl(${(hue + 160) % 360} 55% 45%)`];
}

// real flag artwork (flag-icons, MIT licence) — includes Scotland, Wales, England, Northern Ireland
export const FLAG_ICONS_VERSION = "7.2.3";
export const flagUrl = (cc) => (cc ? `https://cdn.jsdelivr.net/npm/flag-icons@${FLAG_ICONS_VERSION}/flags/4x3/${cc}.svg` : null);

// two strong colours for avatars (skips the white stripe so initials stay readable)
const isLight = (c) => /^#f[0-9a-f]f[0-9a-f]f/i.test(c) || c === "#f4f4f4" || c === "#f1edf6";
export function avatarColors(cc) {
  const cols = flagColors(cc).filter((c) => !isLight(c));
  if (cols.length === 0) return ["#6d6580", "#2b2634"];
  if (cols.length === 1) return [cols[0], "#1d1925"];
  return [cols[0], cols[cols.length - 1] === cols[0] ? "#1d1925" : cols[cols.length - 1]];
}

// ---------- loading ----------
async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return r.json();
}

export async function loadData(onProgress = () => {}) {
  const [competitions, beatboxers, countries, countryNames, eloRules, pictures] = await Promise.all([
    getJSON("data/competitions.json"), getJSON("data/beatboxers.json"), getJSON("data/countries.json"),
    getJSON("data/country_names.json"), getJSON("data/elo_rules.json"), getJSON("data/pictures.json").catch(() => ({})),
  ]);
  for (const [id, pic] of Object.entries(pictures)) defaultPictures.set(id, pic);
  onProgress(0.3);
  const history = {};
  let done = 0;
  await Promise.all(competitions.map(async (c) => {
    try { history[c.id] = (await getJSON(`data/${c.history_file}`)).editions; } catch { history[c.id] = []; }
    onProgress(0.3 + 0.7 * (++done / competitions.length));
  }));
  return { competitions, beatboxers, countries, countryNames, eloRules, history };
}

// ---------- IndexedDB: one store for saves, one for pictures ----------
let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("beatbox-world-sim", 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("saves")) d.createObjectStore("saves");
        if (!d.objectStoreNames.contains("images")) d.createObjectStore("images");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function idb(store, mode, fn) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("Storage unavailable:", e);
    return undefined;
  }
}
export const saveGame = (slot, state) => idb("saves", "readwrite", (s) => s.put(state, slot));
export const loadGame = (slot) => idb("saves", "readonly", (s) => s.get(slot));
export const deleteGame = (slot) => idb("saves", "readwrite", (s) => s.delete(slot));
export const putImage = (id, dataUrl) => idb("images", "readwrite", (s) => s.put(dataUrl, id));
export const getImage = (id) => idb("images", "readonly", (s) => s.get(id));
export const deleteImage = (id) => idb("images", "readwrite", (s) => s.delete(id));
export const allImageKeys = () => idb("images", "readonly", (s) => s.getAllKeys());

// pictures: the game ships default photos (data/pictures.json); your own uploads/pastes override them
export const defaultPictures = new Map(); // id -> { src, source }
export const localPictures = new Set();   // ids with a picture you added yourself
export const imageCache = new Map();      // id -> url to draw
export async function warmImages() {
  for (const [id, pic] of defaultPictures) imageCache.set(id, pic.src);
  const keys = (await allImageKeys()) || [];
  await Promise.all(keys.map(async (k) => { imageCache.set(k, await getImage(k)); localPictures.add(k); }));
}
export function forgetLocalPicture(id) {
  localPictures.delete(id);
  if (defaultPictures.has(id)) imageCache.set(id, defaultPictures.get(id).src);
  else imageCache.delete(id);
}

// ---------- formatting ----------
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const round = (v) => (v == null ? "–" : Math.round(v));
