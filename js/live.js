// Live viewer: replays a finished tournament step by step — elimination reveal, then every battle
// with both performers' rounds and the five judges' votes one at a time.
import { esc } from "./data.js";
import { Beat, setMuted, isMuted } from "./cutscene.js";

// background for the live battles: event artwork, then for big events sweeping light beams,
// a scrolling outlined event name and a crowd bouncing to the beat
function crowdSVG() {
  let s = "";
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 34; i++) {
      const x = i * 48 + (row ? 24 : 0) + ((i * 37) % 13), y = 210 - row * 34, r = 13 + ((i * 7 + row * 5) % 6);
      const arms = (i * 11 + row) % 5 === 0 ? `<path d="M${x - 14} ${y - 6}l-10 -46h7l11 42ZM${x + 14} ${y - 6}l10 -46h-7l-11 42Z"/>` : "";
      s += `<g class="cr c${(i + row) % 3}"><circle cx="${x}" cy="${y - r - 14}" r="${r}"/><rect x="${x - 22}" y="${y - 12}" width="44" height="80" rx="18"/>${arms}</g>`;
    }
  }
  return `<svg class="stage-crowd" viewBox="0 0 1640 240" preserveAspectRatio="xMidYMax slice">${s}</svg>`;
}
function stageHTML(st) {
  if (!st) return "";
  const words = Array(6).fill(esc(st.title || "")).join(" · ");
  return `<div class="stage${st.big ? " big" : ""}" style="--sc:${st.color}" aria-hidden="true">
    <div class="stage-art">${st.art}</div>
    ${st.big ? `<div class="stage-marquee"><span>${words} · </span><span>${words} · </span></div>
    <div class="stage-beams"><i></i><i></i><i></i><i></i><i></i></div>` : ""}
    <div class="stage-floor"></div>
    ${st.big ? crowdSVG() : ""}
  </div>`;
}

export function watchLive(result, h, { sound = true, judges = [] } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "live";
    el.innerHTML = `
      <header class="live-top">
        <div class="live-title"><span class="live-dot"></span><b>${esc(result.name)}</b><span class="live-stage" data-stage>Starting</span></div>
        <div class="live-ctl">
          <button class="btn small" data-c="mute">${isMuted() ? "Unmute" : "Mute"}</button>
          <button class="btn small" data-c="pause">Pause</button>
          <button class="btn small" data-c="speed">Speed 1×</button>
          <button class="btn small" data-c="skip">Skip battle</button>
          <button class="btn small" data-c="end">Skip to results</button>
        </div>
      </header>
      <div class="live-body"><div class="live-main-wrap">${stageHTML(h.stage?.(result))}<section class="live-main" data-main></section></div><aside class="live-side" data-side></aside></div>`;
    document.body.appendChild(el);
    const $ = (s) => el.querySelector(s);
    const main = $("[data-main]"), side = $("[data-side]"), stage = $("[data-stage]");
    let speed = 1, paused = false, skipOne = false, skipAll = false, closed = false;
    setMuted(!sound);
    const beat = new Beat(96);
    const speeds = [1, 2, 4, 8];

    const wait = (ms) => new Promise((res) => {
      let left = ms;
      let last = performance.now();
      const tick = (now) => {
        if (closed) return res();
        if (!paused) left -= (now - last) * speed;
        last = now;
        if (left <= 0 || skipOne || skipAll) res(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    el.addEventListener("click", (e) => {
      const c = e.target.closest("[data-c]")?.dataset.c;
      if (!c) return;
      if (c === "mute") { setMuted(!isMuted()); e.target.textContent = isMuted() ? "Unmute" : "Mute"; h.onMute?.(isMuted()); }
      if (c === "pause") { paused = !paused; e.target.textContent = paused ? "Play" : "Pause"; }
      if (c === "speed") { speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; e.target.textContent = `Speed ${speed}×`; }
      if (c === "skip") skipOne = true;
      if (c === "end") skipAll = true;
      if (c === "close") finish();
    });
    const onKey = (e) => {
      if (e.key === "Escape") skipAll = true;
      if (e.key === " ") { e.preventDefault(); paused = !paused; }
      if (e.key === "ArrowRight") skipOne = true;
    };
    window.addEventListener("keydown", onKey);
    function finish() {
      if (closed) return;
      closed = true;
      beat?.stop();
      window.removeEventListener("keydown", onKey);
      el.classList.add("out");
      setTimeout(() => { el.remove(); resolve(); }, 250);
    }

    const card = (id, side) => {
      const p = h.person(id);
      return `<div class="vs-side ${side}">
        <div class="vs-pic">${h.avatarHTML(id)}</div>
        <div class="vs-name">${h.flagHTML(p.country)}<b>${esc(p.name)}</b></div>
        <div class="vs-meta">${esc(p.countryName)} · rating ${p.rating}</div>
        <div class="vs-wave" aria-hidden="true">${"<i></i>".repeat(18)}</div>
        <div class="vs-votes"></div>
      </div>`;
    };

    // side panel: bracket progress
    const rounds = [];
    for (const b of result.battles) {
      let col = rounds.find((c) => c.name === b.round);
      if (!col) rounds.push((col = { name: b.round, list: [] }));
      col.list.push(b);
    }
    const shown = new Set();
    // later-round pairings stay hidden until both battles that feed them are over (no spoilers)
    const known = (b) => rounds[0].list.includes(b) || shown.has(b) || b === current0
      || result.battles.slice(0, result.battles.indexOf(b)).every((x) => shown.has(x));
    let current0 = null;
    const drawSide = (current) => {
      current0 = current;
      side.innerHTML = rounds.map((c) => `<div class="ls-round"><h4>${esc(c.name)}</h4>${c.list.map((b) => {
        const done = shown.has(b);
        const vis = known(b);
        return `<div class="ls-b ${b === current ? "now" : ""}">
          <span class="${done && b.w === b.a ? "w" : ""}">${vis ? esc(h.person(b.a).name) : "TBD"}</span>
          <span class="ls-v">${done ? `${b.votes[0]}–${b.votes[1]}` : b === current ? "LIVE" : ""}</span>
          <span class="${done && b.w === b.b ? "w" : ""}">${vis ? esc(h.person(b.b).name) : "TBD"}</span></div>`;
      }).join("")}</div>`).join("");
    };

    (async () => {
      // 1. elimination reveal
      if (result.elimination && result.bracketSize && result.elimination.length > result.bracketSize) {
        stage.textContent = "Elimination results";
        const list = result.elimination;
        main.innerHTML = `<div class="elim"><h2>Elimination ranking</h2><p class="muted">Top ${result.bracketSize} go to the battles</p><ol class="elim-list"></ol></div>`;
        const ol = main.querySelector(".elim-list");
        const rows = list.map((id, i) => {
          const li = document.createElement("li");
          li.className = `elim-row ${i < result.bracketSize ? "in" : "out"}${i < 3 ? ` s${i + 1}` : ""}`;
          li.innerHTML = `<span class="er-rank">${i + 1}</span>${h.avatarHTML(id, "sm")}${h.flagHTML(h.person(id).country)}<b>${esc(h.person(id).name)}</b><span class="er-tag">${i < result.bracketSize ? "Battles" : "Out"}</span>`;
          return li;
        });
        rows.forEach((li) => ol.appendChild(li));
        if (result.bracketSize < list.length) rows[result.bracketSize - 1].classList.add("cut");
        for (let i = rows.length - 1; i >= 0 && !skipAll; i--) {
          rows[i].classList.add("show");
          if (beat?.on) beat.hat(beat.ac.currentTime, 0.12);
          await wait(i < result.bracketSize ? 520 : 260);
        }
        rows.forEach((r) => r.classList.add("show"));
        skipOne = false;
        await wait(1400);
        skipOne = false;
      }
      // 2. battles
      for (const b of result.battles) {
        if (skipAll) break;
        skipOne = false;
        stage.textContent = b.round;
        drawSide(b);
        main.innerHTML = `<div class="vs">
          ${card(b.a, "left")}
          <div class="vs-mid"><span class="vs-mark">VS</span><span class="vs-round">${esc(b.round)}</span><span class="vs-phase" data-phase>Get ready</span><span class="vs-tally" aria-hidden="true">${"<i></i>".repeat(5)}</span></div>
          ${card(b.b, "right")}
        </div>`;
        const L = main.querySelector(".vs-side.left"), R = main.querySelector(".vs-side.right"), phase = main.querySelector("[data-phase]");
        await wait(1100);
        for (const [who, label] of [[L, `${h.person(b.a).name} · round 1`], [R, `${h.person(b.b).name} · round 1`], [L, "Round 2"], [R, "Round 2"]]) {
          if (skipOne || skipAll) break;
          L.classList.toggle("on", who === L); R.classList.toggle("on", who === R);
          phase.textContent = label;
          await wait(1050);
        }
        L.classList.remove("on"); R.classList.remove("on");
        phase.textContent = "Judges decide";
        await wait(500);
        const jv = b.jv || Array.from({ length: 5 }, (_, i) => (i < b.votes[0] ? 0 : 1));
        const names = judges.length ? judges : ["Judge 1", "Judge 2", "Judge 3", "Judge 4", "Judge 5"];
        let va = 0, vb = 0;
        for (let i = 0; i < jv.length; i++) {
          if (skipOne || skipAll) break;
          const tgt = jv[i] === 0 ? L : R;
          jv[i] === 0 ? va++ : vb++;
          const chip = document.createElement("span");
          chip.className = "vote";
          chip.textContent = names[i % names.length];
          tgt.querySelector(".vs-votes").appendChild(chip);
          main.querySelectorAll(".vs-tally i")[i]?.classList.add(jv[i] === 0 ? "l" : "r");
          phase.textContent = `${va} – ${vb}`;
          if (beat?.on) beat.kick(beat.ac.currentTime);
          await wait(620);
        }
        const winSide = b.w === b.a ? L : R;
        winSide.classList.add("winner");
        const stg = el.querySelector(".stage");
        if (stg) { stg.classList.remove("flash"); void stg.offsetWidth; stg.classList.add("flash"); }
        (winSide === L ? R : L).classList.add("loser");
        phase.innerHTML = `<b>${esc(h.person(b.w).name)}</b> wins ${Math.max(...b.votes)}–${Math.min(...b.votes)}`;
        shown.add(b);
        drawSide(null);
        if (beat?.on) beat.crash();
        skipOne = false;
        await wait(1500);
      }
      // 3. podium
      result.battles.forEach((b) => shown.add(b));
      drawSide(null);
      stage.textContent = "Results";
      const pod = [result.champion, result.runnerUp, result.third].filter(Boolean);
      main.innerHTML = `<div class="live-pod">${pod.map((id, i) => `<div class="lp p${i + 1}">${h.avatarHTML(id, "lg")}<span>${["Champion", "Runner-up", "Third"][i]}</span><b>${esc(h.person(id).name)}</b></div>`).join("")}
        <button class="btn primary" data-c="close">Continue</button></div>`;
    })();
  });
}
