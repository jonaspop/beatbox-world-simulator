// Animated cutscenes drawn on a canvas, with a small synthesized beat (kick / snare / hats).
// playCutscene(scene, helpers) resolves when the scene ends or the viewer skips it.

let audioCtx = null;
function ctxAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; }
  }
  if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function noiseBuffer(ac) {
  const b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

import { themeFor } from "./art.js";

// colour helpers for the themed scenes
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => `rgba(${rgb(hex).join(",")},${a})`;
const inkOn = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0b0b0d" : "#ffffff"; };

// one mute switch for every beat that is playing
let MUTED = false;
const BEATS = new Set();
export function setMuted(m) {
  MUTED = !!m;
  for (const b of BEATS) b.applyMute();
}
export const isMuted = () => MUTED;

export class Beat {
  constructor(bpm = 96, mood = "hype") {
    this.ac = ctxAudio();
    this.bpm = bpm;
    this.mood = mood;
    this.on = !!this.ac;
    if (!this.on) return;
    this.master = this.ac.createGain();
    this.level = mood === "hype" ? 0.55 : 0.45;
    this.master.gain.value = MUTED ? 0 : this.level;
    this.master.connect(this.ac.destination);
    BEATS.add(this);
    this.noise = noiseBuffer(this.ac);
    this.step = 0;
    this.next = this.ac.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  schedule() {
    const spb = 60 / this.bpm / 4; // 16th notes
    while (this.next < this.ac.currentTime + 0.12) {
      const s = this.step % 16;
      if (this.mood === "soft") {
        if (s === 0) this.pad(this.next, [220, 277, 330]);
        if (s === 8) this.pad(this.next, [196, 247, 294]);
        if (s % 4 === 2) this.hat(this.next, 0.04);
      } else if (this.mood === "warm") {
        // laid-back groove: soft kick, light hats, slow chords
        const bar = Math.floor(this.step / 16) % 2;
        if (s === 0) this.pad(this.next, bar ? [196, 247, 294] : [220, 262, 330]);
        if (s === 0 || s === 10) this.kick(this.next, 0.55);
        if (s === 8) this.snare(this.next, 0.28);
        if (s % 4 === 2) this.hat(this.next, 0.035);
      } else {
        if (s === 0 || s === 7 || s === 10) this.kick(this.next);
        if (s === 4 || s === 12) this.snare(this.next);
        if (s % 2 === 0) this.hat(this.next, s % 4 === 2 ? 0.09 : 0.05);
        if (s === 14 && this.step % 32 === 30) this.snare(this.next, 0.5);
      }
      this.next += spb;
      this.step++;
    }
  }
  applyMute() {
    if (!this.on) return;
    const t = this.ac.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(MUTED ? 0 : this.level, t, 0.05);
  }
  kick(t, vol = 1) {
    if (!this.on) return;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.3);
  }
  snare(t, vol = 0.8) {
    const n = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    n.buffer = this.noise;
    f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(f).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.2);
    // the "pf" lip snare body
    const o = this.ac.createOscillator(), og = this.ac.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    og.gain.setValueAtTime(vol * 0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.1);
  }
  hat(t, vol) {
    const n = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    n.buffer = this.noise;
    f.type = "highpass"; f.frequency.value = 7500;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    n.connect(f).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.05);
  }
  pad(t, freqs) {
    for (const fr of freqs) {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = "sine"; o.frequency.value = fr;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 2.4);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 2.5);
    }
  }
  riser(dur = 1.2) {
    if (!this.on) return;
    const t = this.ac.currentTime;
    const n = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    n.buffer = this.noise; n.loop = true;
    f.type = "bandpass"; f.Q.value = 3;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    g.gain.setValueAtTime(0.01, t); g.gain.exponentialRampToValueAtTime(0.4, t + dur);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.05);
    n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + dur + 0.1);
  }
  crash() {
    if (!this.on) return;
    const t = this.ac.currentTime;
    const n = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    n.buffer = this.noise; n.loop = true;
    f.type = "highpass"; f.frequency.value = 3000;
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + 1.7);
    this.kick(t);
  }
  get beatPhase() { return this.on ? ((this.ac.currentTime * this.bpm) / 60) % 1 : (performance.now() / 1000 * this.bpm / 60) % 1; }
  stop() {
    if (!this.on) return;
    BEATS.delete(this);
    clearInterval(this.timer);
    const t = this.ac.currentTime;
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.4);
    setTimeout(() => this.master.disconnect(), 500);
  }
}

// ---------- drawing helpers ----------
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeBack = (t) => { t = Math.min(1, Math.max(0, t)); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
const BODY = '"Manrope", system-ui, sans-serif';

function fitText(g, text, maxW, size, weight = 900, family = DISPLAY) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > maxW && s > 12) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
  return s;
}

function spotlights(g, W, H, t, color = "255,214,140") {
  for (let i = 0; i < 3; i++) {
    const a = Math.sin(t * 0.6 + i * 2.1) * 0.35;
    const x = W * (0.2 + i * 0.3);
    g.save();
    g.translate(x, -20);
    g.rotate(a);
    const grad = g.createLinearGradient(0, 0, 0, H * 1.1);
    grad.addColorStop(0, `rgba(${color},0.32)`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-14, 0); g.lineTo(14, 0); g.lineTo(W * 0.16, H * 1.1); g.lineTo(-W * 0.16, H * 1.1);
    g.closePath(); g.fill();
    g.restore();
  }
}

function crowd(g, W, H, phase, t) {
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const y0 = H - 40 - r * 34;
    const n = Math.ceil(W / 34) + 2;
    g.fillStyle = `rgba(8,6,12,${0.85 - r * 0.2})`;
    for (let i = 0; i < n; i++) {
      const seed = Math.sin(i * 12.9898 + r * 78.233) * 43758.5453;
      const rnd = seed - Math.floor(seed);
      const jump = Math.max(0, Math.sin((phase + rnd) * Math.PI * 2)) * (6 + rnd * 10);
      const x = i * 34 - 20 + r * 17;
      const y = y0 - jump;
      g.beginPath(); g.arc(x, y - 22, 9 + rnd * 3, 0, Math.PI * 2); g.fill();
      g.fillRect(x - 13, y - 12, 26, 60);
      if (rnd > 0.7) { // hands up
        g.fillRect(x - 15, y - 48 - jump * 0.5, 5, 34);
        g.fillRect(x + 10, y - 48 - jump * 0.5, 5, 34);
      }
    }
  }
}

function flagBand(g, x, y, w, h, colors, progress = 1) {
  const bw = w / colors.length;
  colors.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(x + i * bw, y, bw * clamp01(progress * colors.length - i) + 0.5, h);
  });
}

function portrait(g, cx, cy, r, img, name, colors) {
  g.save();
  g.beginPath(); g.arc(cx, cy, r + 6, 0, Math.PI * 2);
  g.fillStyle = "#f2b43c"; g.fill();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  if (img) {
    const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
    g.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
  } else {
    const strong = colors.filter((c) => !/^#f[0-9a-f]{5}$/i.test(c));
    const grad = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grad.addColorStop(0, strong[0] || "#6d6580"); grad.addColorStop(1, strong.length > 1 && strong[strong.length - 1] !== strong[0] ? strong[strong.length - 1] : "#1d1925");
    g.fillStyle = grad; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.font = `900 ${r * 0.9}px ${DISPLAY}`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(initials(name), cx, cy + r * 0.05);
  }
  g.restore();
}
const initials = (name) => (name || "?").replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

function trophy(g, cx, cy, s, glow) {
  g.save();
  g.translate(cx, cy);
  g.shadowColor = "rgba(242,180,60,0.9)";
  g.shadowBlur = 30 + glow * 40;
  const grad = g.createLinearGradient(-s, -s, s, s);
  grad.addColorStop(0, "#ffe7a6"); grad.addColorStop(0.5, "#f2b43c"); grad.addColorStop(1, "#a86b12");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(-s * 0.55, -s); g.lineTo(s * 0.55, -s);
  g.quadraticCurveTo(s * 0.55, -s * 0.1, 0, s * 0.05);
  g.quadraticCurveTo(-s * 0.55, -s * 0.1, -s * 0.55, -s);
  g.fill();
  g.fillRect(-s * 0.08, 0, s * 0.16, s * 0.5);
  g.fillRect(-s * 0.38, s * 0.48, s * 0.76, s * 0.14);
  g.lineWidth = s * 0.08; g.strokeStyle = grad;
  g.beginPath(); g.arc(-s * 0.55, -s * 0.62, s * 0.24, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
  g.beginPath(); g.arc(s * 0.55, -s * 0.62, s * 0.24, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
  // microphone engraving
  g.shadowBlur = 0;
  g.fillStyle = "rgba(90,50,5,0.55)";
  g.beginPath(); g.ellipse(0, -s * 0.6, s * 0.1, s * 0.16, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

class Confetti {
  constructor(W, H, colors) {
    this.p = Array.from({ length: 220 }, () => ({
      x: Math.random() * W, y: -Math.random() * H, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 160,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 8, w: 5 + Math.random() * 7, h: 3 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    this.H = H;
  }
  draw(g, dt) {
    for (const p of this.p) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.y > this.H + 20) { p.y = -20; }
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
  }
}

function loadImg(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

// ---------- scenes ----------
const SCENES = {
  async champion(g, sc, h) {
    const p = h.person(sc.id);
    const colors = h.flag(p.country);
    const img = await loadImg(h.image(sc.id));
    const big = sc.tier === "gbb" || sc.tier === "bbwc";
    const label = sc.tier === "bbwc" ? "WORLD CHAMPION" : sc.tier === "gbb" ? "GBB CHAMPION" : sc.tier === "national" ? "NATIONAL CHAMPION"
      : "CHAMPION";
    const flagImg = await loadImg(h.flagUrl(p.country));
    const extra = sc.tier === "qualifier" ? `QUALIFIED FOR GBB ${sc.ticketYear || ""}`.trim() : null;
    const theme = themeFor(sc.comp || (sc.tier === "gbb" ? "gbb" : sc.tier === "bbwc" ? "bbwc" : null));
    return { duration: big ? 8.5 : 6.8, bpm: 84, mood: "warm", img, colors, p, label, flagImg, extra, theme,
      record: h.record(sc.id), sub: sc.event, score: sc.score, runnerUp: sc.runnerUp ? h.person(sc.runnerUp).name : null };
  },
  async ceremony(g, sc, h) {
    // reveal from the last place up to number one
    const order = sc.ids.map((id, i) => ({ id, place: i + 1 })).reverse();
    const items = await Promise.all(order.map(async ({ id, place }) => {
      const p = h.person(id);
      return { p, place, img: await loadImg(h.image(id)), flag: await loadImg(h.flagUrl(p.country)), colors: h.flag(p.country) };
    }));
    const per = items.length > 12 ? 1.9 : 2.5;
    const accent = themeFor(sc.comp || "gbb").a;
    return { duration: 2.2 + items.length * per + 3.4 + items.length * 0.09, bpm: 86, mood: "warm", items, per, sub: sc.event, label: sc.label || "Wildcard", accent, accentInk: inkOn(accent) };
  },
  async wildcards(g, sc, h) {
    const people = sc.ids.map((id) => h.person(id));
    return { duration: 2.6 + people.length * 0.85 + 3.4, bpm: 92, people, sub: sc.event, flags: people.map((p) => h.flag(p.country)) };
  },
  async retirement(g, sc, h) {
    const p = h.person(sc.id);
    return { duration: 8.5, bpm: 70, mood: "soft", p, img: await loadImg(h.image(sc.id)), colors: h.flag(p.country), record: h.record(sc.id), career: h.career(sc.id) };
  },
  async comeback(g, sc, h) {
    const p = h.person(sc.id);
    return { duration: 5.5, bpm: 104, p, img: await loadImg(h.image(sc.id)), colors: h.flag(p.country), slamAt: 1.4 };
  },
};

// the winner gets a centered "champion poster": picture in a tall frame rising into a gold halo,
// slow turning rings and light rays, a giant outlined CHAMPION behind, crown-and-mic emblem, name and result
function drawChampion(g, W, H, t, s, beat) {
  g.globalAlpha = 1;
  g.fillStyle = "#0b0b0d"; g.fillRect(0, 0, W, H);
  const intro = 1.3;
  g.textBaseline = "alphabetic";
  if (t < intro + 0.2) {
    const a = Math.min(clamp01(t / 0.5), clamp01((intro + 0.2 - t) / 0.4));
    g.globalAlpha = a;
    g.textAlign = "center";
    g.fillStyle = "rgba(242,239,232,0.8)";
    g.font = `700 ${Math.max(13, W * 0.016)}px ${BODY}`;
    g.fillText(s.sub.toUpperCase(), W / 2, H * 0.46);
    g.fillStyle = "#f2efe8";
    g.font = `900 ${Math.min(W * 0.08, 92)}px ${DISPLAY}`;
    g.fillText("FINAL RESULT", W / 2, H * 0.46 + Math.min(W * 0.08, 92));
    g.globalAlpha = 1;
    return;
  }
  const local = t - intro;
  const appear = ease(local / 1.2);
  const T = s.theme;
  const cardH = Math.min(H * 0.44, 380), cardW = cardH * 0.8;
  const cx = W / 2, cy = H * 0.38;
  // the event's colour floods the screen from the centre
  const bg = g.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.75);
  bg.addColorStop(0, rgba(T.b, appear));
  bg.addColorStop(0.35, rgba(T.a, appear));
  bg.addColorStop(1, rgba(T.deep, appear));
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  champMotif(g, W, H, cx, cy, cardH, T, local, appear);
  g.fillStyle = rgba(T.deep, 0.22 * appear);
  const step = 16;
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const d = Math.hypot(x - cx, y - cy) / Math.max(W, H);
    const r = Math.max(0, (0.5 - d) * step * 0.32);
    if (r > 0.5) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }
  // light rays, turning very slowly
  g.save();
  g.translate(cx, cy);
  g.rotate(local * 0.04);
  g.strokeStyle = `rgba(255,255,255,${0.12 * appear})`;
  g.lineWidth = 2;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    g.beginPath(); g.moveTo(Math.cos(a) * cardH * 0.6, Math.sin(a) * cardH * 0.6); g.lineTo(Math.cos(a) * W, Math.sin(a) * W); g.stroke();
  }
  g.restore();
  // giant outlined watermark
  g.save();
  g.textAlign = "center";
  const wm = "CHAMPION";
  g.font = `900 ${Math.min(W * 0.34, H * 0.5)}px ${DISPLAY}`;
  g.lineWidth = 2;
  g.strokeStyle = `rgba(255,255,255,${0.2 * appear})`;
  g.strokeText(wm, cx, cy + Math.min(W * 0.11, H * 0.17));
  g.restore();
  // dashed rings
  g.save();
  g.strokeStyle = `rgba(255,255,255,${0.5 * appear})`;
  g.lineWidth = 1.5;
  [0.78, 0.98, 1.2].forEach((m, i) => {
    g.setLineDash([2 + i * 2, 9 + i * 3]);
    g.lineDashOffset = (i % 2 ? 1 : -1) * local * 14;
    g.beginPath(); g.arc(cx, cy, cardH * m, 0, Math.PI * 2); g.stroke();
  });
  g.restore();
  // the picture frame, rising into place (same cut corner as the avatars)
  const rise = ease((local - 0.2) / 1.0);
  const fx = cx - cardW / 2, fy = cy - cardH / 2 + (1 - rise) * 40;
  g.save();
  g.globalAlpha = rise;
  const framePath = (dx = 0, dy = 0) => {
    g.beginPath();
    g.moveTo(fx + dx, fy + dy); g.lineTo(fx + cardW + dx, fy + dy); g.lineTo(fx + cardW + dx, fy + cardH * 0.84 + dy); g.lineTo(fx + cardW * 0.84 + dx, fy + cardH + dy); g.lineTo(fx + dx, fy + cardH + dy); g.closePath();
  };
  framePath(14, 14); g.fillStyle = rgba(T.deep, 0.85); g.fill();
  framePath();
  g.save();
  g.clip();
  if (s.img) {
    const sc = Math.max(cardW / s.img.width, cardH / s.img.height) * (1.02 + local * 0.006);
    g.drawImage(s.img, cx - (s.img.width * sc) / 2, fy + cardH / 2 - (s.img.height * sc) / 2, s.img.width * sc, s.img.height * sc);
  } else {
    if (s.flagImg) {
      const sc = Math.max(cardW / s.flagImg.width, cardH / s.flagImg.height) * 1.1;
      g.drawImage(s.flagImg, cx - (s.flagImg.width * sc) / 2, fy + cardH / 2 - (s.flagImg.height * sc) / 2, s.flagImg.width * sc, s.flagImg.height * sc);
    }
    g.fillStyle = "rgba(8,8,10,0.66)"; g.fillRect(fx, fy, cardW, cardH);
    const fade = g.createLinearGradient(0, fy, 0, fy + cardH);
    fade.addColorStop(0, "rgba(255,194,61,0.10)"); fade.addColorStop(1, "rgba(8,8,10,0.5)");
    g.fillStyle = fade; g.fillRect(fx, fy, cardW, cardH);
    halftone(g, W, H, "rgba(0,0,0,0.4)");
    g.fillStyle = "rgba(242,239,232,0.92)";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `900 ${cardH * 0.42}px ${DISPLAY}`;
    g.fillText(initials(s.p.name), cx, fy + cardH * 0.52);
    g.textBaseline = "alphabetic";
  }
  g.restore();
  g.strokeStyle = "#ffffff"; g.lineWidth = 3; g.stroke();
  g.restore();
  // crown with a microphone, sitting on the frame
  const em = ease((local - 0.8) / 0.6);
  if (em > 0) {
    g.save();
    g.globalAlpha = em;
    g.translate(cx, fy - 6);
    const u = Math.max(14, cardH * 0.06);
    g.fillStyle = "#ffffff";
    g.shadowColor = rgba(T.deep, 0.6); g.shadowBlur = 12;
    g.beginPath();
    g.moveTo(-u * 1.6, 0); g.lineTo(-u * 1.6, -u * 1.1); g.lineTo(-u * 0.8, -u * 0.5); g.lineTo(0, -u * 1.5);
    g.lineTo(u * 0.8, -u * 0.5); g.lineTo(u * 1.6, -u * 1.1); g.lineTo(u * 1.6, 0); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = T.a;
    g.beginPath(); g.ellipse(0, -u * 0.62, u * 0.22, u * 0.32, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(-u * 0.05, -u * 0.32, u * 0.1, u * 0.26);
    g.restore();
  }
  // name, flag + country, how it was won
  const ty = fy + cardH + Math.min(H * 0.2, 150);
  const nm = ease((local - 0.9) / 0.8);
  // dark band behind all the text so the rays, dots and watermark never fight it
  const band = g.createLinearGradient(0, fy + cardH * 0.7, 0, H);
  band.addColorStop(0, "rgba(6,6,8,0)"); band.addColorStop(0.35, `rgba(6,6,8,${0.82 * nm})`); band.addColorStop(1, `rgba(6,6,8,${0.92 * nm})`);
  g.fillStyle = band; g.fillRect(0, fy + cardH * 0.7, W, H);
  g.save();
  g.globalAlpha = nm;
  g.textAlign = "center";
  const size = fitText(g, s.p.name.toUpperCase(), W * 0.82, Math.min(W * 0.11, H * 0.12));
  // title as a solid gold bar with dark letters
  const lf = Math.max(16, Math.min(W * 0.022, 24));
  g.font = `900 ${lf}px ${DISPLAY}`;
  const lw = g.measureText(s.label).width + 28;
  const ly = ty - size * 0.86 - 16;
  g.fillStyle = T.a;
  g.beginPath(); g.moveTo(cx - lw / 2, ly - lf - 6); g.lineTo(cx + lw / 2 + 8, ly - lf - 6); g.lineTo(cx + lw / 2, ly + 6); g.lineTo(cx - lw / 2 - 8, ly + 6); g.closePath(); g.fill();
  g.fillStyle = inkOn(T.a);
  g.fillText(s.label, cx, ly);
  // the name: big, with a dark outline and shadow
  g.font = `900 ${size}px ${DISPLAY}`;
  g.lineWidth = Math.max(4, size * 0.06); g.lineJoin = "round"; g.strokeStyle = "rgba(6,6,8,0.9)";
  g.strokeText(s.p.name.toUpperCase(), cx, ty);
  g.shadowColor = "rgba(0,0,0,0.75)"; g.shadowBlur = 18;
  g.fillStyle = "#f7f4ee";
  g.fillText(s.p.name.toUpperCase(), cx, ty);
  g.shadowBlur = 0;
  const lineW = Math.min(W * 0.3, 280) * ease((local - 1.3) / 1.0);
  g.fillStyle = T.a;
  g.fillRect(cx - lineW / 2, ty + 12, lineW, 3);
  g.font = `800 ${Math.max(15, W * 0.018)}px ${BODY}`;
  const cname = s.p.countryName.toUpperCase();
  const cw = g.measureText(cname).width + (s.flagImg ? 46 : 0);
  if (s.flagImg) g.drawImage(s.flagImg, cx - cw / 2, ty + 26, 36, 27);
  g.textAlign = "left";
  g.fillStyle = "#f2efe8";
  g.fillText(cname, cx - cw / 2 + (s.flagImg ? 46 : 0), ty + 46);
  g.textAlign = "center";
  g.globalAlpha = nm * clamp01((local - 1.8) / 0.8);
  g.font = `700 ${Math.max(14, W * 0.016)}px ${BODY}`;
  g.fillStyle = "rgba(242,239,232,0.92)";
  const how = [s.runnerUp ? `Beat ${s.runnerUp} in the final${s.score ? ` · ${s.score}` : ""}` : null, s.extra].filter(Boolean).join("   ·   ");
  if (how) g.fillText(how, cx, ty + 80);
  g.restore();
  // event name, top left
  g.globalAlpha = appear;
  g.textAlign = "left";
  g.font = `700 ${Math.max(12, W * 0.014)}px ${BODY}`;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = 8;
  g.fillText(s.sub.toUpperCase(), 28, 40);
  g.shadowBlur = 0;
  g.globalAlpha = 1;
}

// each event's own pattern behind the champion: sunset stripes, a globe, stars, diagonal stripes…
function champMotif(g, W, H, cx, cy, cardH, T, local, appear) {
  g.save();
  g.globalAlpha = appear;
  const R = cardH * 1.25;
  if (T.motif === "sunset") {
    // retro sun with cut stripes, pink into orange
    const sun = g.createLinearGradient(0, cy - R, 0, cy + R);
    sun.addColorStop(0, "rgba(255,214,110,0.75)"); sun.addColorStop(1, rgba(T.a, 0.2));
    g.fillStyle = sun; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = rgba(T.deep, 0.5);
    for (let i = 0; i < 9; i++) g.fillRect(0, cy + i * R * 0.12, W, 3 + i * 1.6);
  } else if (T.motif === "stripes") {
    g.fillStyle = "rgba(255,255,255,0.12)";
    const off = (local * 18) % 80;
    for (let x = -H; x < W + H; x += 80) { g.beginPath(); g.moveTo(x + off, H); g.lineTo(x + off + H * 0.6, 0); g.lineTo(x + off + H * 0.6 + 34, 0); g.lineTo(x + off + 34, H); g.fill(); }
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, R * 0.92, 0, Math.PI * 2); g.stroke();
  } else if (T.motif === "globe") {
    g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 2;
    g.save(); g.translate(cx, cy);
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 5; k++) { const rx = Math.abs(Math.cos(local * 0.3 + (k * Math.PI) / 5)) * R; g.beginPath(); g.ellipse(0, 0, rx, R, 0, 0, Math.PI * 2); g.stroke(); }
    for (const f of [-0.6, -0.3, 0, 0.3, 0.6]) { const y = f * R, w = Math.sqrt(R * R - y * y); g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke(); }
    g.restore();
  } else if (T.motif === "stars") {
    g.fillStyle = "rgba(255,255,255,0.85)";
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + local * 0.05, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, rr = Math.max(8, cardH * 0.045);
      g.beginPath();
      for (let j = 0; j < 10; j++) { const b = -Math.PI / 2 + (j * Math.PI) / 5, q = j % 2 ? rr * 0.42 : rr; g.lineTo(x + Math.cos(b) * q, y + Math.sin(b) * q); }
      g.closePath(); g.fill();
    }
  } else if (T.motif === "dots") {
    g.fillStyle = "rgba(255,255,255,0.22)";
    const step = 30;
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      const d = Math.hypot(x - cx, y - cy) / Math.max(W, H);
      const r = Math.max(0, Math.sin(d * 14 - local * 1.2) * 5 + 2);
      g.beginPath(); g.arc(x + ((y / step) % 2 ? step / 2 : 0), y, r, 0, Math.PI * 2); g.fill();
    }
  } else if (T.motif === "rays") {
    g.fillStyle = "rgba(255,255,255,0.1)";
    g.translate(cx, cy); g.rotate(-local * 0.03);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * W * 1.5, Math.sin(a) * W * 1.5); g.lineTo(Math.cos(a + 0.12) * W * 1.5, Math.sin(a + 0.12) * W * 1.5); g.fill(); }
  } else {
    // gold: soft concentric rings moving outwards
    g.strokeStyle = rgba(T.deep, 0.18);
    for (let i = 1; i < 9; i++) { g.lineWidth = i % 2 ? 2 : 8; g.beginPath(); g.arc(cx, cy, cardH * 0.4 * i + (local * 12) % (cardH * 0.4), 0, Math.PI * 2); g.stroke(); }
  }
  g.restore();
}

const ord = (n) => { const t = n % 100, u = n % 10; return `${n}${t >= 11 && t <= 13 ? "TH" : u === 1 ? "ST" : u === 2 ? "ND" : u === 3 ? "RD" : "TH"}`; };

function halftone(g, W, H, color, from = 0) {
  g.fillStyle = color;
  const step = 14;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const k = Math.max(0, (x / W) * 0.9 + (y / H) * 0.4 - 0.35 + from);
      const r = Math.min(step * 0.48, k * step * 0.55);
      if (r > 0.4) { g.beginPath(); g.arc(x + ((y / step) % 2 ? step / 2 : 0), y, r, 0, Math.PI * 2); g.fill(); }
    }
  }
}

function coverImage(g, img, W, H, zoom = 1) {
  const s = Math.max(W / img.width, H / img.height) * zoom;
  g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
}

// a generated "poster" for beatboxers without a photo: their flag, halftone dots and giant initials
function posterArt(g, W, H, it, k, accent = "255,120,40", streak = 0.05) {
  g.fillStyle = "#0b0b0d"; g.fillRect(0, 0, W, H);
  if (it.flag) {
    g.save();
    g.filter = "blur(26px) saturate(1.3) brightness(0.5)";
    coverImage(g, it.flag, W, H, 1.15 + k * 0.05);
    g.restore();
    // dim it in every browser (some ignore canvas filters on SVG images)
    g.fillStyle = "rgba(8,8,10,0.62)"; g.fillRect(0, 0, W, H);
  }
  halftone(g, W, H, "rgba(0,0,0,0.55)");
  const corner = g.createLinearGradient(0, H, W * 0.55, H * 0.35);
  corner.addColorStop(0, "rgba(5,5,6,0.9)"); corner.addColorStop(1, "rgba(5,5,6,0)");
  g.fillStyle = corner; g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W * 0.68, H * 0.52);
  g.rotate(-0.08);
  g.font = `900 ${Math.min(W * 0.5, H * 0.9)}px ${DISPLAY}`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 3;
  g.strokeStyle = "rgba(242,239,232,0.22)";
  g.strokeText(initials(it.p.name), k * 30, 0);
  g.restore();
  // diagonal light streaks
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 2; i++) {
    const x = W * (0.42 + i * 0.26) + k * 30;
    const grad = g.createLinearGradient(x, 0, x + 120, H);
    grad.addColorStop(0, `rgba(${accent},0)`); grad.addColorStop(0.5, `rgba(${accent},${streak})`); grad.addColorStop(1, `rgba(${accent},0)`);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 70, 0); g.lineTo(x + 260, H); g.lineTo(x + 190, H); g.fill();
  }
  g.restore();
}

// a tall portrait card with the cut corner, placed right of centre (above the name on narrow screens)
function photoCard(g, W, H, img, k, show, accent = "#ff5b1f") {
  if (show <= 0) return;
  const wide = W > H * 1.05;
  const ch = wide ? Math.min(H * 0.66, 560) : Math.min(H * 0.46, W * 0.9);
  const cw = ch * 0.8;
  const cx = wide ? W * 0.66 : W / 2;
  const cy = wide ? H * 0.47 : H * 0.36;
  const x = cx - cw / 2 + k * 10, y = cy - ch / 2 + (1 - show) * 30;
  const path = () => {
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + cw, y); g.lineTo(x + cw, y + ch * 0.86); g.lineTo(x + cw * 0.86, y + ch); g.lineTo(x, y + ch); g.closePath();
  };
  g.save();
  g.globalAlpha = show;
  // soft shadow and an offset orange plate behind the card
  g.fillStyle = accent;
  g.save(); g.translate(14, 14); path(); g.fill(); g.restore();
  g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 40;
  path(); g.fillStyle = "#0b0b0d"; g.fill();
  g.shadowBlur = 0;
  g.save();
  path(); g.clip();
  const sc = Math.max(cw / img.width, ch / img.height) * (1.02 + k * 0.04);
  g.drawImage(img, cx + k * 10 - (img.width * sc) / 2, y + ch / 2 - (img.height * sc) / 2, img.width * sc, img.height * sc);
  // a little of the halftone texture over the photo so it belongs to the poster
  const fade = g.createLinearGradient(0, y + ch * 0.55, 0, y + ch);
  fade.addColorStop(0, "rgba(11,11,13,0)"); fade.addColorStop(1, "rgba(11,11,13,0.45)");
  g.fillStyle = fade; g.fillRect(x, y, cw, ch);
  g.restore();
  path(); g.strokeStyle = "rgba(242,239,232,0.9)"; g.lineWidth = 2; g.stroke();
  g.restore();
}

function drawCeremony(g, W, H, t, s, beat) {
  const i = Math.floor((t - 2.2) / s.per);
  g.globalAlpha = 1;
  g.fillStyle = "#0b0b0d"; g.fillRect(0, 0, W, H);
  if (t < 2.2) {
    // opener
    const k = ease(t / 1.4);
    halftone(g, W, H, "rgba(242,239,232,0.05)", -0.2 + k * 0.2);
    g.textAlign = "left";
    g.globalAlpha = Math.min(k, clamp01((2.2 - t) / 0.4));
    g.fillStyle = "#f2efe8";
    const fs = fitText(g, `${s.label.toUpperCase()} RESULTS`, W * 0.8, Math.min(W * 0.1, 116));
    g.font = `900 ${fs}px ${DISPLAY}`;
    g.fillText(`${s.label.toUpperCase()} RESULTS`, W * 0.07 - (1 - k) * 24, H * 0.52);
    g.fillStyle = s.accent;
    g.fillRect(W * 0.07, H * 0.52 + 18, W * 0.22 * k, 5);
    g.font = `700 ${Math.max(14, W * 0.018)}px ${BODY}`;
    g.fillStyle = "rgba(242,239,232,0.75)";
    g.fillText(s.sub.toUpperCase(), W * 0.07, H * 0.52 - fs * 0.85);
    g.globalAlpha = 1;
    return;
  }
  if (i >= s.items.length) {
    // closer: everyone at once, as a wall of picture cards with flag, place and name
    const t0 = 2.2 + s.items.length * s.per, lt = t - t0;
    const k = ease(lt / 0.6);
    halftone(g, W, H, "rgba(242,239,232,0.04)");
    const glow = g.createRadialGradient(W / 2, 0, 10, W / 2, 0, Math.max(W, H) * 0.8);
    glow.addColorStop(0, rgba(s.accent, 0.28 * k)); glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.globalAlpha = k;
    g.textAlign = "center";
    g.fillStyle = s.accent;
    g.font = `800 ${Math.max(12, Math.min(W * 0.016, 18))}px ${BODY}`;
    g.fillText(`${s.label.toUpperCase()} WINNERS`.split("").join(String.fromCharCode(8202)), W / 2, H * 0.075);
    g.fillStyle = "#f2efe8";
    const ts = fitText(g, s.sub.toUpperCase(), W * 0.9, Math.min(W * 0.06, H * 0.08, 64));
    g.font = `900 ${ts}px ${DISPLAY}`;
    g.fillText(s.sub.toUpperCase(), W / 2, H * 0.075 + ts + 6);
    const list = s.items.slice().reverse(); // 1st place first
    const top = H * 0.075 + ts + 26, availH = H - top - 30, availW = W * 0.92, gap = Math.max(8, W * 0.01);
    let best = null;
    for (let c = 1; c <= Math.min(10, list.length); c++) {
      const rows = Math.ceil(list.length / c);
      let cw = (availW - (c - 1) * gap) / c, ch = cw * 1.28;
      if (rows * ch + (rows - 1) * gap > availH) { ch = (availH - (rows - 1) * gap) / rows; cw = ch / 1.28; }
      if (!best || cw > best.cw) best = { c, rows, cw, ch };
    }
    const { c: cols, cw, ch } = best;
    const gridW = cols * cw + (cols - 1) * gap;
    list.forEach((it, j) => {
      const a = ease((lt - 0.3 - j * 0.09) / 0.5);
      if (a <= 0) return;
      const col = j % cols, row = Math.floor(j / cols);
      const lastRow = Math.floor((list.length - 1) / cols) === row ? list.length - row * cols : cols;
      const rowW = lastRow * cw + (lastRow - 1) * gap;
      const x = (W - (row === Math.floor((list.length - 1) / cols) ? rowW : gridW)) / 2 + col * (cw + gap);
      const y = top + row * (ch + gap) + (1 - a) * 24;
      g.save();
      g.globalAlpha = a;
      const r = Math.min(16, cw * 0.08);
      g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 20;
      g.beginPath(); g.roundRect(x, y, cw, ch, r); g.fillStyle = "#16171d"; g.fill();
      g.shadowBlur = 0;
      g.save(); g.beginPath(); g.roundRect(x, y, cw, ch, r); g.clip();
      const pic = it.img || it.flag;
      if (pic) {
        const sc = Math.max(cw / pic.width, ch / pic.height);
        // photos lean towards the top (faces), flags sit in the middle
        g.drawImage(pic, x + cw / 2 - (pic.width * sc) / 2, y + (ch - pic.height * sc) * (it.img ? 0.25 : 0.5), pic.width * sc, pic.height * sc);
      }
      if (!it.img) {
        g.fillStyle = "rgba(8,8,10,0.55)"; g.fillRect(x, y, cw, ch);
        g.fillStyle = "rgba(255,255,255,0.9)"; g.textAlign = "center";
        g.font = `900 ${cw * 0.42}px ${DISPLAY}`;
        g.fillText(initials(it.p.name), x + cw / 2, y + ch * 0.5);
      }
      const fade = g.createLinearGradient(0, y + ch * 0.45, 0, y + ch);
      fade.addColorStop(0, "rgba(8,8,10,0)"); fade.addColorStop(1, "rgba(8,8,10,0.95)");
      g.fillStyle = fade; g.fillRect(x, y, cw, ch);
      g.restore();
      g.beginPath(); g.roundRect(x, y, cw, ch, r);
      g.strokeStyle = j === 0 ? s.accent : "rgba(255,255,255,0.18)"; g.lineWidth = j === 0 ? 2.5 : 1; g.stroke();
      // place badge
      const bs = Math.max(11, Math.min(cw * 0.14, 22));
      g.font = `900 ${bs}px ${DISPLAY}`;
      const pl = ord(it.place);
      const bw = g.measureText(pl).width + bs * 0.9;
      g.fillStyle = s.accent;
      g.beginPath(); g.roundRect(x + 8, y + 8, bw, bs * 1.45, 6); g.fill();
      g.fillStyle = s.accentInk; g.textAlign = "left";
      g.fillText(pl, x + 8 + bs * 0.45, y + 8 + bs * 1.1);
      // flag + name
      const fh = Math.max(10, Math.min(cw * 0.1, 20)), fw = fh * 4 / 3;
      if (it.flag && it.img) g.drawImage(it.flag, x + 10, y + ch - fh * 2.9, fw, fh);
      const ns = fitText(g, it.p.name.toUpperCase(), cw - 20, Math.max(12, Math.min(cw * 0.16, 30)));
      g.font = `900 ${ns}px ${DISPLAY}`;
      g.fillStyle = "#f7f4ee";
      g.fillText(it.p.name.toUpperCase(), x + 10, y + ch - 10);
      g.restore();
    });
    g.globalAlpha = 1;
    return;
  }
  const it = s.items[i];
  const local = t - 2.2 - i * s.per;
  const k = clamp01(local / s.per);
  if (!s[`hit${i}`]) { s[`hit${i}`] = true; if (beat.on) beat.kick(beat.ac.currentTime, 0.6); }
  // background: the flag poster art, always; their photo sits on it as a framed portrait card
  posterArt(g, W, H, it, k);
  if (it.img) photoCard(g, W, H, it.img, k, ease((local - 0.1) / 0.7), s.accent);
  // gentle fade between people instead of a flash
  const fadeIn = 1 - ease(local / 0.45), fadeOut = ease((local - (s.per - 0.3)) / 0.3);
  const cover = Math.max(fadeIn, fadeOut);
  if (cover > 0) { g.fillStyle = `rgba(11,11,13,${cover})`; g.fillRect(0, 0, W, H); }
  // top-left event line + counter
  g.textAlign = "left";
  g.font = `700 ${Math.max(12, W * 0.014)}px ${BODY}`;
  g.fillStyle = "rgba(242,239,232,0.85)";
  g.fillText(`${s.sub.toUpperCase()}  ·  ${s.label.toUpperCase()} RESULTS`, 28, 40);
  g.textAlign = "right";
  g.fillText(`${it.place} / ${s.items.length}`, W - 28, 40);
  // lower third, bottom-left
  const slide = ease((local - 0.2) / 0.6);
  const x0 = 28 - (1 - slide) * 60, base = H - 56;
  g.globalAlpha = slide * (1 - fadeOut);
  const nameSize = fitText(g, it.p.name.toUpperCase(), W * 0.62, Math.min(W * 0.1, 120));
  g.textAlign = "left";
  g.save();
  g.fillStyle = s.accent;
  g.beginPath(); g.moveTo(x0, base - nameSize - 46); g.lineTo(x0 + 250, base - nameSize - 46); g.lineTo(x0 + 236, base - nameSize - 14); g.lineTo(x0, base - nameSize - 14); g.fill();
  g.fillStyle = s.accentInk;
  g.font = `900 ${22}px ${DISPLAY}`;
  g.fillText(`${ord(it.place)} ${s.label.toUpperCase()}`, x0 + 12, base - nameSize - 22);
  g.fillStyle = "#f2efe8";
  g.font = `900 ${nameSize}px ${DISPLAY}`;
  g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 18;
  g.fillText(it.p.name.toUpperCase(), x0, base - 4);
  g.shadowBlur = 0;
  if (it.flag) g.drawImage(it.flag, x0, base + 8, 36, 27);
  g.font = `700 ${Math.max(14, W * 0.017)}px ${BODY}`;
  g.fillStyle = "rgba(242,239,232,0.85)";
  g.fillText(it.p.countryName.toUpperCase(), x0 + (it.flag ? 46 : 0), base + 30);
  g.restore();
}

function drawWildcards(g, W, H, t, s, beat) {
  g.fillStyle = "#08070c"; g.fillRect(0, 0, W, H);
  spotlights(g, W, H, t, "120,190,255");
  g.textAlign = "center";
  g.fillStyle = "#f2b43c";
  g.font = `900 ${fitText(g, "WILDCARD WINNERS", W * 0.8, Math.min(W * 0.08, 80))}px ${DISPLAY}`;
  g.fillText("WILDCARD WINNERS", W / 2, H * 0.12);
  g.fillStyle = "rgba(236,231,243,0.75)";
  g.font = `600 ${Math.max(13, W * 0.016)}px ${BODY}`;
  g.fillText(s.sub.toUpperCase(), W / 2, H * 0.12 + 30);
  const n = s.people.length;
  const cols = n > 8 ? 3 : 2;
  const rowsN = Math.ceil(n / cols);
  const cw = Math.min(380, (W - 60) / cols - 16), ch = Math.min(64, (H * 0.68) / rowsN - 10);
  s.people.forEach((p, i) => {
    const start = 1.6 + i * 0.85;
    const k = t - start;
    if (k < 0) return;
    if (k < 0.05 && !s[`hit${i}`]) { s[`hit${i}`] = true; beat.kick(beat.ac?.currentTime || 0); }
    const col = i % cols, row = Math.floor(i / cols);
    const x0 = W / 2 - (cols * (cw + 16)) / 2 + col * (cw + 16) + 8;
    const y0 = H * 0.22 + row * (ch + 10);
    const slide = 1 - ease(k * 2.4);
    g.save();
    g.translate(slide * (col === 0 ? -W * 0.5 : W * 0.5), 0);
    g.fillStyle = "rgba(23,20,31,0.94)";
    g.fillRect(x0, y0, cw, ch);
    flagBand(g, x0, y0, 8, ch, s.flags[i]);
    g.textAlign = "left";
    g.fillStyle = "#f2b43c";
    g.font = `800 ${Math.max(11, ch * 0.26)}px ${BODY}`;
    g.fillText(`${i + 1}${["st", "nd", "rd"][i] || "th"} WILDCARD`, x0 + 20, y0 + ch * 0.36);
    g.fillStyle = "#ece7f3";
    g.font = `900 ${fitText(g, p.name.toUpperCase(), cw - 120, ch * 0.5)}px ${DISPLAY}`;
    g.fillText(p.name.toUpperCase(), x0 + 20, y0 + ch * 0.82);
    g.textAlign = "right";
    g.fillStyle = "rgba(236,231,243,0.6)";
    g.font = `600 ${Math.max(11, ch * 0.24)}px ${BODY}`;
    g.fillText(p.countryName, x0 + cw - 12, y0 + ch * 0.82);
    g.restore();
  });
  crowd(g, W, H, beat.beatPhase, t);
}

function drawRetirement(g, W, H, t, s) {
  g.fillStyle = "#050407"; g.fillRect(0, 0, W, H);
  const fadeIn = clamp01(t / 1.5), fadeOut = clamp01((s.duration - t) / 1.5);
  const a = Math.min(fadeIn, fadeOut);
  const spot = g.createRadialGradient(W / 2, H * 0.36, 10, W / 2, H * 0.36, Math.min(W, H) * 0.55);
  spot.addColorStop(0, `rgba(255,220,170,${0.22 * a})`);
  spot.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = spot; g.fillRect(0, 0, W, H);
  g.globalAlpha = a;
  portrait(g, W / 2, H * 0.32, Math.min(W, H) * 0.12, s.img, s.p.name, s.colors.map((c) => c));
  g.textAlign = "center";
  g.fillStyle = "#ece7f3";
  g.font = `900 ${fitText(g, s.p.name.toUpperCase(), W * 0.8, Math.min(W * 0.1, 110))}px ${DISPLAY}`;
  g.fillText(s.p.name.toUpperCase(), W / 2, H * 0.58);
  g.fillStyle = "#f2b43c";
  g.font = `800 ${Math.max(16, W * 0.024)}px ${DISPLAY}`;
  g.fillText(s.p.status === "judge" ? "RETIRES · JOINS THE JUDGING TABLE" : "RETIRES FROM COMPETITION", W / 2, H * 0.58 + 44);
  g.fillStyle = "rgba(236,231,243,0.7)";
  g.font = `500 ${Math.max(13, W * 0.016)}px ${BODY}`;
  s.career.slice(0, 4).forEach((line, i) => {
    g.globalAlpha = a * clamp01((t - 2 - i * 0.5) / 0.8);
    g.fillText(line, W / 2, H * 0.58 + 84 + i * 26);
  });
  g.globalAlpha = 1;
}

function drawComeback(g, W, H, t, s, beat) {
  g.fillStyle = "#08070c"; g.fillRect(0, 0, W, H);
  spotlights(g, W, H, t);
  g.textAlign = "center";
  if (t > s.slamAt && !s.hit) { s.hit = true; beat.crash(); }
  const k = clamp01((t - s.slamAt) * 2);
  portrait(g, W / 2, H * 0.32, Math.min(W, H) * 0.1 * easeBack(k), s.img, s.p.name, s.colors);
  const glitch = t > s.slamAt && t < s.slamAt + 0.5 ? (Math.random() - 0.5) * 18 : 0;
  g.fillStyle = "#ff5a4e";
  g.font = `900 ${fitText(g, s.p.name.toUpperCase(), W * 0.8, Math.min(W * 0.12, 120))}px ${DISPLAY}`;
  g.fillText(s.p.name.toUpperCase(), W / 2 + glitch, H * 0.6);
  g.fillStyle = "#ece7f3";
  g.font = `900 ${Math.max(22, W * 0.04)}px ${DISPLAY}`;
  g.globalAlpha = k;
  g.fillText("IS BACK", W / 2, H * 0.6 + 56);
  g.globalAlpha = 1;
  crowd(g, W, H, beat.beatPhase, t);
}

const DRAW = { champion: drawChampion, wildcards: drawWildcards, retirement: drawRetirement, comeback: drawComeback, ceremony: drawCeremony };

export async function playCutscene(sc, helpers, { sound = true } = {}) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const wrap = document.createElement("div");
  wrap.className = "cutscene";
  wrap.innerHTML = `<canvas></canvas><div class="cs-ctl"><button class="cs-btn" type="button" data-mute>${MUTED ? "Unmute" : "Mute"}</button><button class="cs-btn" type="button" data-skip>Skip ▸</button></div>`;
  document.body.appendChild(wrap);
  const cv = wrap.querySelector("canvas");
  const g = cv.getContext("2d");
  let W = 0, H = 0;
  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener("resize", size);
  await document.fonts?.ready;
  const s = await SCENES[sc.type](g, sc, helpers);
  setMuted(!sound);
  const real = new Beat(s.bpm, s.mood);
  const beat = real.on ? real : { on: false, beatPhase: 0, kick() {}, crash() {}, riser() {}, stop() {}, get ac() { return null; } };
  if (s.slamAt) setTimeout(() => beat.riser(Math.max(0.6, s.slamAt - 0.2)), 200);
  wrap.querySelector("[data-mute]").addEventListener("click", (e) => {
    setMuted(!MUTED);
    e.target.textContent = MUTED ? "Unmute" : "Mute";
    helpers.onMute?.(MUTED);
  });
  return new Promise((resolve) => {
    let done = false, last = performance.now(), t0 = last;
    const finish = () => {
      if (done) return;
      done = true;
      beat.stop();
      window.removeEventListener("resize", size);
      window.removeEventListener("keydown", onKey);
      wrap.classList.add("out");
      setTimeout(() => { wrap.remove(); resolve(); }, 300);
    };
    const onKey = (e) => { if (e.key === "Escape" || e.key === " " || e.key === "Enter") { e.preventDefault(); finish(); } };
    wrap.querySelector("[data-skip]").addEventListener("click", finish);
    window.addEventListener("keydown", onKey);
    const frame = (now) => {
      if (done) return;
      const t = reduce ? s.duration * 0.9 : (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try { DRAW[sc.type](g, W, H, t, s, beat, dt); } catch (e) { console.error(e); finish(); return; }
      if (t >= s.duration && !reduce) finish();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
