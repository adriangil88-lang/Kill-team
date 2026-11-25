/* fx.js — sonido sintetizado (WebAudio), efectos visuales sobre el tablero y avisos de fase.
   Sin ficheros externos: todo se genera en tiempo de ejecución. */
let AC = null, master = null, muted = false, vol = 0.7;
try { muted = localStorage.getItem('kt.mute') === '1'; const v = parseFloat(localStorage.getItem('kt.vol')); if (v >= 0 && v <= 1) vol = v; } catch (e) { }

function ctx() {
  if (AC) return AC;
  try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); master = AC.createGain(); master.gain.value = vol; master.connect(AC.destination); } catch (e) { AC = null; }
  return AC;
}
export function unlock() { const a = ctx(); if (a && a.state === 'suspended') a.resume(); }
export function isMuted() { return muted; }
export function setMuted(m) { muted = !!m; try { localStorage.setItem('kt.mute', muted ? '1' : '0'); } catch (e) { } }
export function getVol() { return vol; }
export function setVol(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = vol; try { localStorage.setItem('kt.vol', String(vol)); } catch (e) { } }

function noiseBuf(a, dur) { const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(a, t, f0, f1, dur, type, peak) { const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); env(g, t, 0.005, dur, peak); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); }
function burst(a, t, dur, f0, f1, peak, q = 1, type = 'lowpass') { const s = a.createBufferSource(); s.buffer = noiseBuf(a, dur + 0.05); const f = a.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); const g = a.createGain(); env(g, t, 0.004, dur, peak); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05); }

const S = {
  click: (a, t) => tone(a, t, 900, 600, 0.05, 'square', 0.05),
  select: (a, t) => { tone(a, t, 520, 520, 0.06, 'triangle', 0.08); tone(a, t + 0.06, 780, 780, 0.08, 'triangle', 0.08); },
  err: (a, t) => tone(a, t, 180, 120, 0.18, 'sawtooth', 0.09),
  step: (a, t) => { burst(a, t, 0.07, 700, 200, 0.12); burst(a, t + 0.16, 0.07, 650, 180, 0.1); },
  dice: (a, t) => { for (let i = 0; i < 5; i++) burst(a, t + i * 0.055 + Math.random() * 0.02, 0.04, 3200 + Math.random() * 1500, 1200, 0.1, 2, 'bandpass'); },
  shot: (a, t) => { burst(a, t, 0.22, 5200, 300, 0.28, 0.7); tone(a, t, 150, 45, 0.2, 'sine', 0.3); },
  burst: (a, t) => { for (let i = 0; i < 4; i++) S.shot(a, t + i * 0.09); },
  hit: (a, t) => { tone(a, t, 120, 40, 0.16, 'sine', 0.35); burst(a, t, 0.1, 1800, 200, 0.14); },
  miss: (a, t) => burst(a, t, 0.18, 4200, 1200, 0.07, 3, 'bandpass'),
  melee: (a, t) => { tone(a, t, 1500, 1100, 0.2, 'square', 0.05); tone(a, t, 2230, 1800, 0.18, 'sine', 0.06); burst(a, t, 0.08, 6000, 800, 0.16); },
  block: (a, t) => { tone(a, t, 900, 760, 0.12, 'square', 0.05); burst(a, t, 0.05, 5000, 1500, 0.1); },
  dead: (a, t) => { tone(a, t, 320, 50, 0.55, 'sawtooth', 0.14); burst(a, t, 0.35, 900, 100, 0.18); },
  phase: (a, t) => { tone(a, t, 392, 392, 0.3, 'triangle', 0.12); tone(a, t + 0.14, 587, 587, 0.45, 'triangle', 0.12); },
  turn: (a, t) => { tone(a, t, 330, 330, 0.25, 'sine', 0.14); tone(a, t + 0.12, 494, 494, 0.25, 'sine', 0.14); tone(a, t + 0.24, 659, 659, 0.5, 'sine', 0.14); },
  score: (a, t) => { tone(a, t, 784, 784, 0.12, 'square', 0.05); tone(a, t + 0.09, 1047, 1047, 0.25, 'square', 0.05); },
  win: (a, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.13, f, f, 0.4, 'triangle', 0.15)); },
  lose: (a, t) => { [392, 330, 262].forEach((f, i) => tone(a, t + i * 0.18, f, f * 0.98, 0.45, 'triangle', 0.13)); },
  cp: (a, t) => { tone(a, t, 660, 990, 0.18, 'sine', 0.1); },
};
export function play(name) {
  if (muted) return; const a = ctx(); if (!a || !S[name]) return; if (a.state === 'suspended') a.resume();
  try { S[name](a, a.currentTime + 0.01); } catch (e) { }
}

/* ------------------------- efectos visuales sobre el tablero ------------------------- */
const Q = []; /* {t0,dur,draw(c,u,now)} */
let cv = null, cx = null, locate = null, wrap = null, W = 0, H = 0, dpr = 1;
export function init(canvas, wrapEl, locateFn) { cv = canvas; wrap = wrapEl; cx = canvas.getContext('2d'); locate = locateFn; requestAnimationFrame(frame); }
function fit() { if (!cv || !wrap) return; const w = wrap.clientWidth, h = wrap.clientHeight, d = window.devicePixelRatio || 1; if (w !== W || h !== H || d !== dpr) { W = w; H = h; dpr = d; cv.width = Math.round(w * d); cv.height = Math.round(h * d); cv.style.width = w + 'px'; cv.style.height = h + 'px'; } }
function frame(now) {
  requestAnimationFrame(frame);
  if (!cx) return; fit(); cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
  for (let i = Q.length - 1; i >= 0; i--) { const e = Q[i], u = (now - e.t0) / e.dur; if (u < 0) continue; if (u >= 1) { Q.splice(i, 1); continue; } try { e.draw(cx, u, now); } catch (er) { Q.splice(i, 1); } }
}
const add = (delay, dur, draw) => Q.push({ t0: performance.now() + delay, dur, draw });
const ease = u => 1 - Math.pow(1 - u, 3);
function pt(i) { const p = locate && locate(i); return p && isFinite(p[0]) ? p : null; }

function floatText(i, text, color, delay = 0, big = false) {
  add(delay, 1100, (c, u) => { const p = pt(i); if (!p) return; const y = p[1] - 28 - ease(u) * 34, a = u < .15 ? u / .15 : u > .7 ? (1 - u) / .3 : 1;
    c.globalAlpha = Math.max(0, a); c.font = `900 ${big ? 26 : 20}px system-ui`; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(text, p[0], y); c.fillStyle = color; c.fillText(text, p[0], y); c.globalAlpha = 1; });
}
function tracer(a, b, color, delay, dur = 260) {
  add(delay, dur, (c, u) => { const A = pt(a), B = pt(b); if (!A || !B) return; const h = ease(u), t0 = Math.max(0, h - .35), x0 = A[0] + (B[0] - A[0]) * t0, y0 = A[1] + (B[1] - A[1]) * t0, x1 = A[0] + (B[0] - A[0]) * h, y1 = A[1] + (B[1] - A[1]) * h;
    const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, color); c.strokeStyle = g; c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    if (u < .25) { c.fillStyle = `rgba(255,230,160,${1 - u * 4})`; c.beginPath(); c.arc(A[0], A[1], 14 * (1 - u * 3), 0, 7); c.fill(); } });
}
function impact(i, color, delay, r = 34) {
  add(delay, 380, (c, u) => { const p = pt(i); if (!p) return; const rr = r * ease(u); c.globalAlpha = 1 - u; c.strokeStyle = color; c.lineWidth = 4 * (1 - u) + 1; c.beginPath(); c.arc(p[0], p[1], rr, 0, 7); c.stroke();
    c.fillStyle = color; for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4 + 0.4, d = rr * 1.1; c.beginPath(); c.arc(p[0] + Math.cos(an) * d, p[1] + Math.sin(an) * d, 2.5 * (1 - u), 0, 7); c.fill(); } c.globalAlpha = 1; });
}
function clash(a, b, delay) {
  add(delay, 420, (c, u) => { const A = pt(a), B = pt(b); if (!A || !B) return; const x = (A[0] + B[0]) / 2, y = (A[1] + B[1]) / 2 - 10, r = 26 * ease(u); c.globalAlpha = 1 - u; c.strokeStyle = '#ffd24a'; c.lineWidth = 3;
    for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3 + u, r0 = r * .4; c.beginPath(); c.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); c.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); c.stroke(); } c.globalAlpha = 1; });
}
function shake(ms = 260, px = 5) { if (!wrap || !wrap.animate) return; wrap.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${px}px,${-px / 2}px)` }, { transform: `translate(${-px}px,${px / 2}px)` }, { transform: `translate(${px / 2}px,0)` }, { transform: 'translate(0,0)' }], { duration: ms, easing: 'ease-out' }); }
function banner(html, cls = '') { if (!wrap) return; const b = document.createElement('div'); b.className = 'banner ' + cls; b.innerHTML = html; wrap.appendChild(b); setTimeout(() => b.remove(), 1900); }

/* Punto de entrada: eventos del motor. G = estado de la app (G.s, G.names). */
export function onEvent(ev, G, COL) {
  const s = G.s; if (!s) return; const col = p => (COL && COL[p]) || '#fff';
  switch (ev.k) {
    case 'shoot': {
      const dm = (ev.res || []).reduce((x, r) => x + (r.dmg || 0), 0), n = (ev.atk || []).length;
      play('dice'); tracer(ev.op, ev.tg, col(ev.p), 180); play(n >= 4 ? 'burst' : 'shot');
      if (dm > 0) { setTimeout(() => play('hit'), 300); impact(ev.tg, '#ff4d5e', 300); floatText(ev.tg, '−' + dm, '#ff6b7a', 320, true); if (dm >= 6) shake(300, 6); }
      else { setTimeout(() => play('miss'), 300); floatText(ev.tg, 'Sin daño', '#ffd9a0', 320); }
      for (const r of (ev.res || [])) if (r.tg != null && r.tg !== ev.tg && r.dmg) floatText(r.tg, '−' + r.dmg, '#ff6b7a', 340);
      break;
    }
    case 'fight': {
      const dm = (ev.steps || []).reduce((x, y) => x + (y.dmg || 0), 0), dmA = (ev.steps || []).filter(x => x.kind === 'strike').length;
      play('dice'); clash(ev.op, ev.tg, 150); setTimeout(() => play('melee'), 170);
      if (dm > 0) { setTimeout(() => play('hit'), 330); impact(ev.tg, '#ff4d5e', 330); floatText(ev.tg, '−' + dm, '#ff6b7a', 350, true); shake(260, 5); }
      else if (dmA === 0) { setTimeout(() => play('block'), 330); floatText(ev.tg, 'Parada', '#9ad1ff', 340); }
      break;
    }
    case 'dead': play('dead'); setTimeout(() => play('dead'), 0); floatText(ev.op, '✖', '#ff4d5e', 420, true); impact(ev.op, '#ff4d5e', 420, 46); shake(380, 8); break;
    case 'move': play('step'); break;
    case 'act': play('select'); break;
    case 'tp': play('turn'); banner(`Punto de giro <b>${ev.n}</b>`, 'tp'); break;
    case 'cp': play('cp'); break;
    case 'over': play(ev.winner === (G.me != null ? G.me : 0) ? 'win' : ev.winner < 0 ? 'phase' : 'lose'); break;
    case 'score': case 'vp': play('score'); break;
  }
}
