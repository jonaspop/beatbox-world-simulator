// Colour themes per competition (shared by the champion cutscene and the event graphics)
// and generated SVG artwork for every event: majors, qualifiers, internationals and national championships.
import { esc, flagUrl } from "./data.js";

// a: main colour, b: light partner, deep: dark base, motif: the pattern drawn behind
export const THEMES = {
  gbb: { a: "#ff5b1f", b: "#ffa143", deep: "#2b0a02", motif: "rays", label: "GBB" },
  bbwc: { a: "#2f7bff", b: "#7cc0ff", deep: "#04112e", motif: "globe", label: "WORLD" },
  gbc: { a: "#ff3d9a", b: "#ff9ccc", deep: "#2e0418", motif: "dots", label: "GBC" },
  fbb: { a: "#ff5fa2", b: "#ffb067", deep: "#2a0830", motif: "sunset", label: "FLORIDA" },
  bcj: { a: "#2156d8", b: "#ffffff", deep: "#071a4d", motif: "stripes", label: "BEATCITY" },
  ebc: { a: "#16b863", b: "#8ef2b8", deep: "#032816", motif: "stars", label: "EUROPE" },
  gold: { a: "#ffc23d", b: "#fff0a8", deep: "#2e2003", motif: "rings", label: "CHAMPION" },
};
// the champion cutscene colour for a competition
export function themeFor(comp) {
  if (!comp) return THEMES.gold;
  if (comp === "gbb" || comp.startsWith("gbb_")) return THEMES.gbb;
  if (comp === "bbwc") return THEMES.bbwc;
  if (comp === "gbc" || comp === "gbc_global") return THEMES.gbc;
  return THEMES[comp] || THEMES.gold;
}

// event graphics use the same themes, plus their own colours for the other internationals and qualifiers
const EXTRA = {
  gnb: { a: "#59c3ff", b: "#d8f3ff", deep: "#041a2b", motif: "peaks", label: "GREAT NORTH" },
  mba: { a: "#ff4d4d", b: "#ffc15c", deep: "#2b0505", motif: "rays", label: "MAESTRO" },
  apac: { a: "#ff7b3d", b: "#ffd35c", deep: "#2a0d02", motif: "rings", label: "APAC" },
  amrq: { a: "#e0a030", b: "#ffe2a0", deep: "#291804", motif: "dunes", label: "AFRICA · MENA" },
  lacup: { a: "#8a5cff", b: "#d4c2ff", deep: "#14063a", motif: "eq", label: "LA CUP" },
  one_one: { a: "#00c2c7", b: "#b8fbff", deep: "#022a2b", motif: "split", label: "ONE ONE" },
  vokal_total: { a: "#ff3b4f", b: "#ffb3bb", deep: "#2b030a", motif: "eq", label: "VOKAL TOTAL" },
  bayreuth: { a: "#c25cff", b: "#f0c8ff", deep: "#22053a", motif: "rings", label: "BAYREUTH" },
  nue: { a: "#d8ff3d", b: "#f4ffc0", deep: "#1c2603", motif: "split", label: "NUE" },
  btw: { a: "#3dd6ff", b: "#c5f5ff", deep: "#03202b", motif: "globe", label: "TO WORLD" },
  botm: { a: "#4fd1b5", b: "#c9fff2", deep: "#03261f", motif: "eq", label: "OF THE MONTH" },
  gbb_wildcards: { a: "#7ab0ff", b: "#e1edff", deep: "#08142e", motif: "starfield", label: "WILDCARDS" },
  gbb_7ts: { a: "#ff5b1f", b: "#ffd0b8", deep: "#1c0a04", motif: "smoke", label: "7 TO SMOKE" },
  gbb_second_league: { a: "#ff8a3d", b: "#ffd9b8", deep: "#2b1204", motif: "split", label: "SECOND LEAGUE" },
  season_review: { a: "#ff4a5a", b: "#ffc2c8", deep: "#22050a", motif: "grid", label: "REVIEW" },
  custom: { a: "#f2efe8", b: "#ffffff", deep: "#1a1a1f", motif: "eq", label: "CUSTOM" },
};
export function artTheme(ev) {
  if (ev.national) return { a: "#ffc23d", b: "#fff0a8", deep: "#0d0d10", motif: "national", label: "NATIONAL" };
  const base = EXTRA[ev.comp] || (["gbb", "bbwc", "gbc", "gbc_global", "fbb", "bcj", "ebc"].includes(ev.comp) ? themeFor(ev.comp) : null);
  if (base) return base;
  let h = 0;
  for (const ch of ev.comp || "x") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { a: `hsl(${h % 360} 85% 60%)`, b: `hsl(${h % 360} 90% 85%)`, deep: `hsl(${h % 360} 60% 9%)`, motif: "eq", label: "BATTLE" };
}

let uid = 0;
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; };
const R = (seed) => { let s = seed || 1; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); };

function motif(t, u, seed) {
  const r = R(seed);
  const W = 1200, H = 420;
  switch (t.motif) {
    case "rays": {
      let d = "";
      for (let i = 0; i < 26; i++) {
        const a0 = Math.PI + (i / 26) * Math.PI, a1 = a0 + Math.PI / 52;
        d += `M900 470L${900 + Math.cos(a0) * 1400} ${470 + Math.sin(a0) * 1400}L${900 + Math.cos(a1) * 1400} ${470 + Math.sin(a1) * 1400}Z`;
      }
      return `<path d="${d}" fill="${t.b}" opacity="0.16"/><circle cx="900" cy="470" r="210" fill="${t.a}" opacity="0.5"/><circle cx="900" cy="470" r="130" fill="${t.b}" opacity="0.35"/>`;
    }
    case "globe": {
      let s = `<g fill="none" stroke="${t.b}" stroke-width="2" opacity="0.45"><circle cx="900" cy="210" r="190"/>`;
      for (const k of [0.25, 0.55, 0.82]) s += `<ellipse cx="900" cy="210" rx="${190 * k}" ry="190"/>`;
      for (const y of [-120, -60, 0, 60, 120]) { const w = Math.sqrt(190 * 190 - y * y); s += `<path d="M${900 - w} ${210 + y}H${900 + w}"/>`; }
      s += `</g><circle cx="900" cy="210" r="260" fill="none" stroke="${t.a}" stroke-width="1.5" stroke-dasharray="3 9" opacity="0.8"/>`;
      return s;
    }
    case "dots": {
      let s = "";
      for (let y = 10; y < H; y += 26) for (let x = 520; x < W + 20; x += 26) {
        const d = Math.hypot(x - 980, y - 200) / 520;
        const rr = Math.max(0, (1 - d) * 11);
        if (rr > 0.8) s += `<circle cx="${x + ((y / 26) % 2 ? 13 : 0)}" cy="${y}" r="${rr.toFixed(1)}"/>`;
      }
      return `<g fill="${t.b}" opacity="0.55">${s}</g>`;
    }
    case "sunset": {
      let s = `<defs><linearGradient id="sun${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="${t.a}"/></linearGradient></defs>`;
      s += `<circle cx="880" cy="250" r="190" fill="url(#sun${u})"/>`;
      for (let i = 0; i < 7; i++) s += `<rect x="660" y="${265 + i * 24}" width="440" height="${4 + i * 2.2}" fill="${t.deep}"/>`;
      s += `<path d="M0 420V360Q300 320 600 360T1200 340V420Z" fill="${t.deep}" opacity="0.9"/>`;
      // palms
      s += `<g fill="${t.deep}"><path d="M1050 420C1046 340 1040 290 1030 250h8c12 40 18 90 20 170Z"/><path d="M1034 250c-40-30-90-24-120 4 36-14 78-12 116 0-34 6-64 26-80 54 30-26 62-40 90-46-6 30-2 58 10 86-4-34-2-62 8-84 22 22 36 50 42 80 0-36-14-66-36-92 34 0 66 14 92 40-20-34-54-54-92-56 30-14 66-12 96 6-32-28-80-30-120-6Z"/></g>`;
      return s;
    }
    case "stripes": {
      let s = "";
      for (let i = -6; i < 30; i++) s += `<path d="M${i * 60} 420L${i * 60 + 240} 0h28L${i * 60 + 28} 420Z" fill="#ffffff" opacity="${i % 2 ? 0.1 : 0.04}"/>`;
      s += `<circle cx="920" cy="210" r="150" fill="#ffffff" opacity="0.92"/><circle cx="920" cy="210" r="96" fill="${t.a}"/>`;
      s += `<circle cx="920" cy="210" r="200" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.5"/>`;
      return s;
    }
    case "stars": {
      let s = "";
      const star = (cx, cy, rr) => { let d = ""; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, q = k % 2 ? rr * 0.42 : rr; d += `${k ? "L" : "M"}${(cx + Math.cos(a) * q).toFixed(1)} ${(cy + Math.sin(a) * q).toFixed(1)}`; } return `<path d="${d}Z"/>`; };
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; s += star(900 + Math.cos(a) * 150, 210 + Math.sin(a) * 150, 20); }
      return `<g fill="${t.b}" opacity="0.85">${s}</g><circle cx="900" cy="210" r="225" fill="none" stroke="${t.b}" stroke-width="2" opacity="0.3"/>`;
    }
    case "peaks":
      return `<path d="M480 420L700 150L820 270L960 90L1120 300L1200 230V420Z" fill="${t.b}" opacity="0.2"/><path d="M560 420L760 230L880 330L1030 180L1200 360V420Z" fill="${t.a}" opacity="0.45"/><path d="M960 90L1000 140L980 150L960 130L935 150Z" fill="#fff" opacity="0.8"/>`;
    case "dunes":
      return `<circle cx="960" cy="150" r="80" fill="${t.b}" opacity="0.8"/><path d="M400 420Q650 260 900 330T1200 300V420Z" fill="${t.a}" opacity="0.55"/><path d="M500 420Q760 330 1000 380T1200 370V420Z" fill="${t.deep}" opacity="0.7"/>`;
    case "split":
      return `<path d="M640 0H1200V420H460Z" fill="${t.a}" opacity="0.32"/><path d="M820 0H860L700 420H660Z" fill="${t.b}" opacity="0.55"/><path d="M900 0H915L755 420H740Z" fill="${t.b}" opacity="0.35"/>`;
    case "starfield": {
      let s = "";
      for (let i = 0; i < 70; i++) s += `<circle cx="${(400 + r() * 800).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(0.8 + r() * 2.6).toFixed(1)}"/>`;
      return `<g fill="${t.b}" opacity="0.7">${s}</g><path d="M920 90l26 58 63 6-48 42 14 62-55-33-55 33 14-62-48-42 63-6Z" fill="${t.a}" opacity="0.85"/>`;
    }
    case "smoke": {
      let s = "";
      for (let i = 0; i < 6; i++) s += `<path d="M${620 + i * 80} 420C${560 + i * 80} 320 ${720 + i * 80} 260 ${640 + i * 80} 160S${700 + i * 80} 40 ${660 + i * 80} 0" fill="none" stroke="${t.b}" stroke-width="${10 - i}" opacity="${0.12 + i * 0.03}"/>`;
      return s + `<text x="1010" y="360" font-size="360" font-weight="900" fill="${t.a}" opacity="0.5" text-anchor="middle" font-family="Big Shoulders Display, Impact, sans-serif">7</text>`;
    }
    case "grid": {
      let s = "";
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) s += `<rect x="${700 + i * 80}" y="${60 + j * 80}" width="66" height="66" rx="6" fill="${t.b}" opacity="${(0.05 + r() * 0.22).toFixed(2)}"/>`;
      return s;
    }
    case "rings": {
      let s = `<g fill="none" stroke="${t.b}">`;
      for (let i = 1; i <= 7; i++) s += `<circle cx="920" cy="210" r="${i * 42}" stroke-width="${i % 2 ? 2 : 6}" opacity="${0.5 - i * 0.05}"/>`;
      return s + `</g>`;
    }
    case "eq":
    default: {
      let s = "";
      for (let i = 0; i < 34; i++) {
        const h = 40 + r() * 260 * (0.4 + 0.6 * Math.sin((i / 34) * Math.PI));
        s += `<rect x="${560 + i * 19}" y="${420 - h}" width="12" height="${h}" rx="3"/>`;
      }
      return `<g fill="${t.b}" opacity="0.5">${s}</g><circle cx="940" cy="170" r="120" fill="none" stroke="${t.a}" stroke-width="10" opacity="0.6"/>`;
    }
  }
}

// a wide banner (viewBox 1200x420) drawn behind event headers, the home hero and feed posts
export function eventArt(ev, { big = "", year = "" } = {}) {
  const t = artTheme(ev);
  const u = `a${++uid}`;
  const seed = hash(ev.comp + (ev.national || ""));
  const label = (big || t.label).toUpperCase();
  const flag = ev.national ? flagUrl(ev.national) : null;
  return `<svg class="ev-art" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="bg${u}" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="${t.deep}"/><stop offset="0.55" stop-color="${t.deep}"/><stop offset="1" stop-color="${t.a}" stop-opacity="0.9"/></linearGradient>
      <pattern id="ht${u}" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.5" fill="#000" opacity="0.35"/></pattern>
      <linearGradient id="fade${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#07080c" stop-opacity="0.95"/><stop offset="0.5" stop-color="#07080c" stop-opacity="0.55"/><stop offset="1" stop-color="#07080c" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="1200" height="420" fill="url(#bg${u})"/>
    ${flag ? `<g transform="rotate(-8 900 210)"><image href="${esc(flag)}" x="560" y="-40" width="700" height="525" preserveAspectRatio="xMidYMid slice" opacity="0.9"/></g>
      <rect width="1200" height="420" fill="${t.deep}" opacity="0.35"/>
      <g transform="translate(1075 118)"><circle r="92" fill="${t.a}"/><circle r="80" fill="none" stroke="${t.deep}" stroke-width="3" stroke-dasharray="4 6"/>
        <text y="-14" text-anchor="middle" font-size="22" font-weight="800" fill="${t.deep}" font-family="Manrope, sans-serif" letter-spacing="4">NATIONAL</text>
        <text y="30" text-anchor="middle" font-size="54" font-weight="900" fill="${t.deep}" font-family="Big Shoulders Display, Impact, sans-serif">${esc((ev.national || "").toUpperCase())}</text>
        <text y="54" text-anchor="middle" font-size="16" font-weight="800" fill="${t.deep}" font-family="Manrope, sans-serif" letter-spacing="3">${esc(year)}</text></g>` : motif(t, u, seed)}
    <rect width="1200" height="420" fill="url(#ht${u})"/>
    <text x="1180" y="400" text-anchor="end" font-size="${Math.min(190, 1500 / Math.max(4, label.length))}" font-weight="900" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="2.5" font-family="Big Shoulders Display, Impact, sans-serif">${esc(label)}</text>
    <rect width="1200" height="420" fill="url(#fade${u})"/>
  </svg>`;
}
