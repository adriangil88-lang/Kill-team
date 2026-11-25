// Mesa libre · estilo Tabletop Simulator. Sin reglas: todo se mueve a mano.
import { createView3D } from './view3d.js';

const FACES = [
  { v: 1, n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0] }, { v: 6, n: [0, 0, -1], u: [1, 0, 0], w: [0, -1, 0] },
  { v: 2, n: [1, 0, 0], u: [0, 1, 0], w: [0, 0, 1] }, { v: 5, n: [-1, 0, 0], u: [0, -1, 0], w: [0, 0, 1] },
  { v: 3, n: [0, 1, 0], u: [0, 0, 1], w: [1, 0, 0] }, { v: 4, n: [0, -1, 0], u: [0, 0, 1], w: [-1, 0, 0] }];
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [-1, 1], [1, -1], [1, 1]], 5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] };
const mul = (A, B) => { const R = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; };
const app = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
function axisAngle(a, th) { const l = Math.hypot(...a) || 1, x = a[0] / l, y = a[1] / l, z = a[2] / l, c = Math.cos(th), s = Math.sin(th), t = 1 - c; return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]; }
const Rz = a => axisAngle([0, 0, 1], a);
// rotación mínima que lleva n a +z
function align(n) { const d = n[2]; if (d > 0.9999) return axisAngle([1, 0, 0], 0); if (d < -0.9999) return axisAngle([1, 0, 0], Math.PI); return axisAngle([n[1], -n[0], 0], Math.acos(d)); }
// matriz final de un dado que muestra `val` arriba
export function finalRot(val, yaw) { const f = FACES.find(q => q.v === val); return mul(Rz(yaw), align(f.n)); }
export function topFace(R) { let b = null, bz = -9; for (const f of FACES) { const z = app(R, f.n)[2]; if (z > bz) { bz = z; b = f.v; } } return b; }

export function createTable(E, cv, hooks) {
  const V = createView3D(E); const ctx = cv.getContext('2d');
  const T = { s: null, names: [], tokens: [], dice: [], ruler: null, tool: 'move', sel: null, selTok: null, selTer: null, terrainEdit: false, snap: false, nTok: 0, running: false, W: 0, H: 0, DPR: 1, drag: null, th: 4, sum: null };
  const COL = ['#ff7a2a', '#35b6ff', '#7ddb5a', '#d65bff'], TOKC = ['#ff7a2a', '#35b6ff', '#ff4d5e', '#ffd24a', '#cbd5e1', '#38d27a'];
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const sh = (c, k) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
  const G = { ui: { sel: null, R: null, cells: null, targets: null, pending: null, hover: null }, lastBy: [[], []] };

  T.started = false; const go = () => { T.started = true; };
  T.open = (s, names) => { T.started = false;
    T.s = s; T.names = names; T.tokens = []; T.dice = []; T.ruler = null; T.sel = null; T.selTok = null; T.selTer = null; if (s.custom) T.terrainEdit = true; T.sum = null; V.pos = {};
    for (const o of s.ops) { o.ready = true; o.order = 'engage'; o.ring = 0; V.pos[o.i] = { x: o.x, y: o.y }; }
    V.W = 0; V.reset(); hooks.change && hooks.change();
  };
  T.start = () => { if (T.running) return; T.running = true; requestAnimationFrame(loop); };
  T.stop = () => { T.running = false; };
  T.resize = () => { const r = cv.parentElement.getBoundingClientRect(); if (!r.width) return; T.DPR = Math.min(2, devicePixelRatio || 1); cv.width = r.width * T.DPR; cv.height = r.height * T.DPR; T.W = r.width; T.H = r.height; V.W = 0; };

  // ---------------------------------------------------------------- dados
  T.throwDice = (n, only) => { go();
    const list = only ? [only] : []; if (!only) { T.dice = []; for (let i = 0; i < n; i++) { const d = {}; T.dice.push(d); list.push(d); } }
    const side = Math.random() * 4 | 0; const now = performance.now();
    list.forEach((d, k) => {
      const a = Math.random() * Math.PI * 2; const sx = E.BW / 2 + (Math.random() - .5) * 8 + Math.cos(a) * 2, sy = E.BH / 2 + (Math.random() - .5) * 4 + Math.sin(a) * 2;
      const dir = Math.random() * Math.PI * 2, sp = 14 + Math.random() * 8;
      const val = 1 + (Math.random() * 6 | 0);
      Object.assign(d, { x: sx, y: sy, z: 3 + Math.random() * 2, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp * .7, vz: 6 + Math.random() * 5, val, Rf: finalRot(val, Math.random() * 6.28), ax: [Math.random() - .5, Math.random() - .5, Math.random() - .5], th0: 14 + Math.random() * 14, t0: now + k * 40, dur: 1500 + Math.random() * 300, done: false, last: now + k * 40, rest: [0, 0] }); d.th = d.th0;
    });
    T.sum = null; hooks.change && hooks.change();
  };
  T.clearDice = () => { T.dice = []; T.sum = null; hooks.change && hooks.change(); };
  function stepDice(now) {
    let any = false;
    for (const d of T.dice) {
      if (d.done) continue; const dt = Math.min(0.04, Math.max(0, (now - d.last) / 1000)); d.last = now; if (now < d.t0) { any = true; continue; }
      const prog = Math.min(1, (now - d.t0) / d.dur);
      d.vz -= 38 * dt; d.z += d.vz * dt; if (d.z < 0) { d.z = 0; d.vz = Math.abs(d.vz) * 0.45; if (d.vz < 1.5) d.vz = 0; }
      const k = Math.exp(-(d.z > 0.05 ? 0.4 : 2.4) * dt); d.vx *= k; d.vy *= k; d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < 0.7) { d.x = 0.7; d.vx = Math.abs(d.vx) * .6; } if (d.x > E.BW - .7) { d.x = E.BW - .7; d.vx = -Math.abs(d.vx) * .6; } if (d.y < 0.7) { d.y = 0.7; d.vy = Math.abs(d.vy) * .6; } if (d.y > E.BH - .7) { d.y = E.BH - .7; d.vy = -Math.abs(d.vy) * .6; }
      d.th = d.th0 * Math.pow(1 - prog, 2);
      if (prog >= 1) { d.done = true; d.th = 0; d.z = 0; d.vx = d.vy = d.vz = 0; } else any = true;
    }
    for (let it = 0; it < 3; it++) for (let i = 0; i < T.dice.length; i++) for (let j = i + 1; j < T.dice.length; j++) { const a = T.dice[i], b = T.dice[j]; const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy) || .01; if (dd < 1.05) { const m = (1.05 - dd) / 2; a.x -= dx / dd * m; a.y -= dy / dd * m; b.x += dx / dd * m; b.y += dy / dd * m; } }
    if (!any && T.dice.length && !T.sum && T.dice.every(d => d.done)) { T.sum = true; hooks.change && hooks.change(); }
  }
  T.result = () => { const v = T.dice.filter(d => d.done).map(d => d.val); return { vals: v, sum: v.reduce((a, b) => a + b, 0), ok: v.filter(x => x >= T.th).length, crit: v.filter(x => x === 6).length, pending: T.dice.length - v.length }; };

  // ---------------------------------------------------------------- fichas, aros
  T.addSticker = k => { const t = { id: ++T.nTok, x: E.BW / 2 + (Math.random() - .5) * 3, y: E.BH / 2 + (Math.random() - .5) * 3, c: '#ffffff', n: '', img: k }; T.tokens.push(t); T.selTok = t.id; T.sel = null; hooks.change && hooks.change(); };
  T.addToken = c => { const t = { id: ++T.nTok, x: E.BW / 2 + (Math.random() - .5) * 3, y: E.BH / 2 + (Math.random() - .5) * 3, c: TOKC[c % TOKC.length], n: '' }; T.tokens.push(t); T.selTok = t.id; T.sel = null; hooks.change && hooks.change(); };
  T.cycleRing = () => { go(); const o = T.s && T.s.ops[T.sel]; if (!o) return; const seq = [0, 2, 3, 6, 9]; o.ring = seq[(seq.indexOf(o.ring) + 1) % seq.length]; hooks.change && hooks.change(); };
  T.wound = d => { go(); const o = T.s.ops[T.sel]; if (!o) return; o.w = Math.max(0, Math.min(o.W, o.w + d)); o.alive = o.w > 0; hooks.change && hooks.change(); };
  T.toggle = k => { go(); const o = T.s.ops[T.sel]; if (!o) return; if (k === 'alive') { o.alive = !o.alive; if (o.alive && o.w <= 0) o.w = 1; } if (k === 'ready') { o.ready = !o.ready; o.ap = o.ready ? 0 : o.apl; } if (k === 'order') o.order = o.order === 'conceal' ? 'engage' : 'conceal'; hooks.change && hooks.change(); };
  // Editor de escenografía (mapa personalizado)
  const TERP = { wall: { n: 'Muro', w: 4, h: .5, t: 'wall' }, wallS: { n: 'Muro corto', w: 2, h: .5, t: 'wall' }, pillar: { n: 'Pilar', w: 1, h: 1, t: 'wall' }, block: { n: 'Bloque pesado', w: 5, h: 3, t: 'wall' }, light: { n: 'Cobertura ligera', w: 3, h: 1.5, t: 'cover' }, lightL: { n: 'Cobertura ligera grande', w: 4, h: 3, t: 'cover' }, bHeavy: { n: 'Barricada pesada', w: 2.7, h: .9, t: 'wall', eq: true, kind: 'heavy' }, bLight: { n: 'Barricada ligera', w: 2.5, h: .6, t: 'cover', eq: true, kind: 'light' }, bPort: { n: 'Barricada portátil', w: 1.1, h: .85, t: 'cover', eq: true, kind: 'port', prot: true }, razor: { n: 'Alambre de púas', w: 3.3, h: .6, t: 'razor', eq: true, kind: 'razor' } };
  T.terPalette = TERP;
  T.addTerrain = k => { const p = TERP[k]; if (!p || !T.s || T.started) return; const r = { x: Math.max(0, Math.min(E.BW - p.w, E.BW / 2 - p.w / 2)), y: Math.max(0, Math.min(E.BH - p.h, E.BH / 2 - p.h / 2)), w: p.w, h: p.h, t: p.t }; if (p.eq) { r.eq = true; r.kind = p.kind; if (p.prot) r.prot = true; } T.s.terrain.push(r); T.selTer = r; T.terrainEdit = true; hooks.change && hooks.change(); };
  const clampTer = r => { r.w = Math.max(.25, Math.min(E.BW, r.w)); r.h = Math.max(.25, Math.min(E.BH, r.h)); r.x = Math.max(0, Math.min(E.BW - r.w, r.x)); r.y = Math.max(0, Math.min(E.BH - r.h, r.y)); };
  T.terOp = op => { const r = T.selTer; if (!r || !T.s || !T.s.terrain.includes(r) || (T.started && op === 'dup')) return; const cx = r.x + r.w / 2, cy = r.y + r.h / 2, hz = r.w >= r.h;
    if (op === 'rot') { const w = r.w; r.w = r.h; r.h = w; r.x = cx - r.w / 2; r.y = cy - r.h / 2; }
    else if (op === 'lp' || op === 'lm') { const d = op === 'lp' ? .5 : -.5; if (hz) { r.w += d; r.x = cx - r.w / 2; } else { r.h += d; r.y = cy - r.h / 2; } }
    else if (op === 'tp' || op === 'tm') { const d = op === 'tp' ? .25 : -.25; if (hz) { r.h += d; r.y = cy - r.h / 2; } else { r.w += d; r.x = cx - r.w / 2; } }
    else if (op === 'del') { T.s.terrain = T.s.terrain.filter(q => q !== r); T.selTer = null; }
    else if (op === 'dup') { const q = { ...r, x: r.x + 1, y: r.y + 1 }; T.s.terrain.push(q); T.selTer = q; clampTer(q); }
    if (T.selTer && op !== 'del') clampTer(T.selTer); hooks.change && hooks.change(); };
  T.clearTerrain = () => { if (!T.s) return; T.s.terrain = []; T.selTer = null; hooks.change && hooks.change(); };
  T.removeSel = () => { if (T.selTok) { T.tokens = T.tokens.filter(t => t.id !== T.selTok); T.selTok = null; hooks.change && hooks.change(); } };
  T.reset = () => { const ex = T.s; hooks.reset && hooks.reset(); };

  // ---------------------------------------------------------------- puntero
  const xy = e => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  const onTable = e => { const { sx, sy } = xy(e); return V.unproject(sx, sy); };
  const snap = p => T.snap ? { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 } : p;
  const clampP = p => ({ x: Math.max(0.3, Math.min(E.BW - .3, p.x)), y: Math.max(0.3, Math.min(E.BH - .3, p.y)) });
  function pickAll(e) {
    const { sx, sy } = xy(e); const best = (arr, f) => { let b = null; for (const it of arr) { const q = f(it); if (q && (!b || q.zc < b.zc)) b = Object.assign(q, { it }); } return b; };
    const R = Math.max(14, V.F * 0.5 / 36);
    const d = best(T.dice, d => { const p = V.project(d.x, d.y, .45); return p && Math.hypot(p[0] - sx, p[1] - sy) < Math.max(15, V.F * .55 / p[2]) ? { zc: p[2] } : null; });
    if (d) return { k: 'die', it: d.it };
    const tk = best(T.tokens, t => { const p = V.project(t.x, t.y, .2); return p && Math.hypot(p[0] - sx, p[1] - sy) < Math.max(13, V.F * .5 / p[2]) ? { zc: p[2] } : null; });
    if (tk) return { k: 'tok', it: tk.it };
    const op = V.pickOp(sx, sy); if (op != null) return { k: 'op', it: T.s.ops[op] };
    const b = V.unproject(sx, sy);
    const ob = T.s.objs.find(o => Math.hypot(o.x - b.x, o.y - b.y) < .8); if (ob) return { k: 'obj', it: ob };
    if (T.terrainEdit) { const rc = [...T.s.terrain].reverse().find(r => b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h); if (rc) { T.s.pieces = null; return { k: 'ter', it: rc }; } }
    return null;
  }
  const ptrs = new Map(); let lastTap = { t: 0, id: null };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (!T.s) return; cv.setPointerCapture && cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size > 1) { T.drag = { mode: 'cam', moved: true }; return; }
    const pan = e.button === 1 || e.ctrlKey || e.metaKey; const rot = e.button === 2;
    if (pan) { T.drag = { mode: 'pan', moved: true }; return; } if (rot) { T.drag = { mode: 'cam', moved: true }; return; }
    if (T.tool === 'ruler') { const p = snapToOp(onTable(e)); T.ruler = { a: p, b: p, live: true }; T.drag = { mode: 'ruler', moved: true }; return; }
    const h = pickAll(e);
    if (h && h.k === 'die') { T.drag = { mode: 'die', it: h.it, moved: false, e }; return; }
    if (h && h.k === 'op' && T.pick && h.it.alive && T.s.ops[T.sel] && h.it.p !== T.s.ops[T.sel].p) { T.pick(h.it); T.drag = { mode: 'cam', moved: true }; return; }
    if (h) {
      if (h.k === 'op') { T.sel = h.it.i; T.selTok = null; } else if (h.k === 'tok') { T.selTok = h.it.id; T.sel = null; } else if (h.k === 'ter') { T.selTer = h.it; T.sel = null; T.selTok = null; }
      const b = onTable(e); T.drag = { mode: 'item', k: h.k, it: h.it, off: { x: (h.it.x ?? h.it.x) - b.x, y: h.it.y - b.y }, moved: false, t0: performance.now(), x0: e.clientX, y0: e.clientY }; hooks.change && hooks.change(); return;
    }
    T.drag = { mode: 'cam', moved: false, dist: 0 };
  });
  function snapToOp(p) { for (const o of T.s.ops) if (o.alive && Math.hypot(o.x - p.x, o.y - p.y) < E.RAD + .3) return { x: o.x, y: o.y, op: o.i }; return { x: p.x, y: p.y }; }
  cv.addEventListener('pointermove', e => {
    if (!T.s || !ptrs.has(e.pointerId)) return; const p = ptrs.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y; const d = T.drag; if (!d) return;
    if (ptrs.size === 2) { const o = [...ptrs.entries()].find(([id]) => id !== e.pointerId)[1]; const d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y); if (d0 > 0 && d1 > 0) V.zoom(d0 / d1); V.rotate(-dx * .25, dy * .25); }
    else if (d.mode === 'cam') { d.dist = (d.dist || 0) + Math.abs(dx) + Math.abs(dy); if (d.dist > 4) d.moved = true; V.rotate(-dx, dy); }
    else if (d.mode === 'pan') { const k = V.dist / V.F * 1.1; V.pan(-dx * k, dy * k); }
    else if (d.mode === 'ruler') { const q = snapToOp(onTable(e)); T.ruler.b = q; hooks.change && hooks.change(); }
    else if (d.mode === 'item') {
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; } d.moved = true;
      const b = onTable(e); let np = snap(clampP({ x: b.x + d.off.x, y: b.y + d.off.y }));
      if (d.k === 'ter') { np = { x: Math.max(0, Math.min(E.BW - d.it.w, np.x)), y: Math.max(0, Math.min(E.BH - d.it.h, np.y)) }; }
      d.it.x = np.x; d.it.y = np.y; if (d.k === 'op') { const q = V.pos[d.it.i]; if (q) { q.x = np.x; q.y = np.y; } }
      d.out = b.x < -0.5 || b.x > E.BW + .5 || b.y < -.5 || b.y > E.BH + .5;
    } else if (d.mode === 'die') { d.moved = true; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); const d = T.drag; if (ptrs.size) return; T.drag = null; if (!d) return;
    if (d.mode === 'ruler' && T.ruler) { T.ruler.live = false; if (Math.hypot(T.ruler.a.x - T.ruler.b.x, T.ruler.a.y - T.ruler.b.y) < .2) T.ruler = null; hooks.change && hooks.change(); }
    if (d.mode === 'die' && !d.moved) { T.throwDice(1, d.it); }
    if (d.mode === 'cam' && !d.moved) { T.sel = null; T.selTok = null; hooks.change && hooks.change(); }
    if (d.mode === 'item' && d.k === 'tok') {
      if (d.out) { T.tokens = T.tokens.filter(t => t !== d.it); T.selTok = null; hooks.change && hooks.change(); }
      else if (!d.moved) { const now = performance.now(); if (lastTap.id === d.it.id && now - lastTap.t < 420) { T.tokens = T.tokens.filter(t => t !== d.it); T.selTok = null; hooks.change && hooks.change(); } lastTap = { t: now, id: d.it.id }; }
    }
    if (d.mode === 'item' && d.k === 'op' && !d.moved) { const now = performance.now(); if (lastTap.id === 'op' + d.it.i && now - lastTap.t < 420) hooks.card && hooks.card(d.it, T.names[d.it.i]); lastTap = { t: now, id: 'op' + d.it.i }; }
    if (d.mode === 'item' && d.k === 'op' && d.moved) { go(); hooks.change && hooks.change(); }
    if (d.mode === 'item' && (d.k === 'ter' || d.k === 'obj') && d.moved) hooks.change && hooks.change();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); V.zoom(e.deltaY > 0 ? 1.08 : .92); }, { passive: false });
  cv.addEventListener('dblclick', e => { if (!pickAll(e)) V.reset(); });
  addEventListener('keydown', e => {
    if (!T.running || !T.s || /input|select|textarea/i.test((e.target.tagName || ''))) return; const k = V.dist * .03;
    const m = { ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, 1], w: [0, 1], ArrowDown: [0, -1], s: [0, -1] }[e.key];
    if (m) { V.pan(m[0] * k, m[1] * k); e.preventDefault(); }
    if (e.key === 'q') V.rotate(-14, 0); if (e.key === 'e') V.rotate(14, 0); if (e.key === 'r') T.throwDice(T.nDice || 4);
  });

  // ---------------------------------------------------------------- dibujo
  let C = ctx;
  function ring(x, y, r, z, col, lw, fill, dash) {
    const pts = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; const p = V.project(x + Math.cos(a) * r, y + Math.sin(a) * r, z); if (!p) return; pts.push(p); }
    C.beginPath(); pts.forEach((p, i) => i ? C.lineTo(p[0], p[1]) : C.moveTo(p[0], p[1])); C.closePath(); if (dash) C.setLineDash(dash); if (fill) { C.fillStyle = fill; C.fill(); } if (col) { C.strokeStyle = col; C.lineWidth = lw || 1.5; C.stroke(); } C.setLineDash([]);
  }
  function label(s, x, y, z, col, size, bg) { const p = V.project(x, y, z); if (!p) return; C.font = `700 ${size}px system-ui`; C.textAlign = 'center'; const w = C.measureText(s).width + 10; if (bg) { C.fillStyle = bg; C.fillRect(p[0] - w / 2, p[1] - size, w, size + 6); } C.fillStyle = col; C.fillText(s, p[0], p[1]); }
  function dieState(d) { const h = .45; const R0 = d.done ? d.Rf : mul(axisAngle(d.ax, d.th || 0), d.Rf); let minz = 9; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) minz = Math.min(minz, app(R0, [sx * h, sy * h, sz * h])[2]); return { x: d.x, y: d.y, z: d.z - minz, R: R0 }; }
  function drawDie(d) {
    const h = .45; const R0 = d.done ? d.Rf : mul(axisAngle(d.ax, d.th || 0), d.Rf);
    let minz = 9; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) minz = Math.min(minz, app(R0, [sx * h, sy * h, sz * h])[2]);
    const cx = d.x, cy = d.y, cz = d.z - minz; const e = V.eyePos();
    ring(d.x, d.y, .55 * (1 + d.z * .08), .02, null, 0, `rgba(0,0,0,${Math.max(.1, .38 - d.z * .05)})`);
    const faces = FACES.map(f => { const n = app(R0, f.n); const c = [cx + n[0] * h, cy + n[1] * h, cz + n[2] * h]; return { f, n, c, vis: n[0] * (e.x - c[0]) + n[1] * (e.y - c[1]) + n[2] * (e.z - c[2]) > 0, d: Math.hypot(e.x - c[0], e.y - c[1], e.z - c[2]) }; }).filter(q => q.vis).sort((a, b) => b.d - a.d);
    const sel = d.done ? 1 : 1;
    for (const q of faces) {
      const u = app(R0, q.f.u), w = app(R0, q.f.w); const P = (a, b) => V.project(q.c[0] + (u[0] * a + w[0] * b) * h, q.c[1] + (u[1] * a + w[1] * b) * h, q.c[2] + (u[2] * a + w[2] * b) * h);
      const pts = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)]; if (pts.some(p => !p)) continue;
      const L = Math.max(0, q.n[0] * -.4 + q.n[1] * -.5 + q.n[2] * .77); const k = 0.55 + .5 * L;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = `rgb(${236 * k | 0},${232 * k | 0},${222 * k | 0})`; ctx.fill(); ctx.strokeStyle = '#6b6558'; ctx.lineWidth = 1; ctx.stroke();
      for (const [a, b] of PIPS[q.f.v]) { const pr = []; for (let i = 0; i < 10; i++) { const t = i / 10 * 6.283; const p = P(a * .5 + Math.cos(t) * .16, b * .5 + Math.sin(t) * .16); if (p) pr.push(p); } if (pr.length < 10) continue; ctx.beginPath(); pr.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = q.f.v === 1 ? '#c0262d' : '#1a1a1a'; ctx.fill(); }
    }
    if (T.sum && d.done && d.val >= T.th) ring(d.x, d.y, .62, .04, d.val === 6 ? '#ffd24a' : '#38d27a', 2.5);
  }
  function decals(now) {
    if (T.sel != null) { const o = T.s.ops[T.sel]; if (o) ring(o.x, o.y, E.RAD + .3 + Math.sin(now / 250) * .06, .07, '#fff', 3); }
    for (const o of T.s.ops) { if (!o.alive || !o.ring) continue; const col = COL[o.p]; ring(o.x, o.y, o.ring + E.RAD, .05, col, 2, col + '18', [6, 5]); }
    for (const t of T.tokens) { if (T.selTok === t.id) ring(t.x, t.y, .6, .05, '#fff', 2.5); }
    for (const d of T.dice) if (T.sum && d.done && d.val >= T.th) ring(d.x, d.y, .62, .04, d.val === 6 ? '#ffd24a' : '#38d27a', 2.5);
  }
  function marks() {
    for (const o of T.s.ops) { if (!o.alive) continue; if (o.ring) label(o.ring + '"', o.x, o.y + o.ring + E.RAD, .1, '#fff', 12, 'rgba(0,0,0,.55)'); if (!o.ready) label('✓', o.x + .6, o.y, 2.0, '#aab4c4', 15); if (o.order === 'conceal') label('◌', o.x - .6, o.y, 2.0, '#cbd5e1', 15); }
    if (T.drag && T.drag.mode === 'item' && T.drag.moved && T.drag.out) label('Soltar fuera = quitar', T.drag.it.x, T.drag.it.y, 2.3, '#ff9aa4', 13, 'rgba(0,0,0,.6)');
    if (T.ruler) {
      const { a, b } = T.ruler; const d = Math.hypot(a.x - b.x, a.y - b.y); const pa = V.project(a.x, a.y, .15), pb = V.project(b.x, b.y, .15);
      if (pa && pb) {
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
        const n = Math.floor(d); for (let i = 1; i <= n; i++) { const t = i / d; const q = V.project(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, .15); if (q) { ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.arc(q[0], q[1], 3.2, 0, 7); ctx.fill(); } }
        ring(a.x, a.y, .22, .15, '#ffd24a', 2, '#ffd24a'); ring(b.x, b.y, .22, .15, '#ffd24a', 2, '#ffd24a');
        const edge = (a.op != null && b.op != null) ? ` · bordes ${Math.max(0, d - 2 * E.RAD).toFixed(1)}"` : '';
        label(d.toFixed(1) + '"' + edge, (a.x + b.x) / 2, (a.y + b.y) / 2, .8, '#ffd24a', 15, 'rgba(0,0,0,.72)');
      }
    }
  }
  function frame(now) {
    if (!T.s || !T.W) return; ctx.setTransform(T.DPR, 0, 0, T.DPR, 0, 0); ctx.clearRect(0, 0, T.W, T.H);
    V.resize(T.W, T.H); stepDice(now);
    G.ui.sel = T.sel;
    for (const o of T.s.ops) { const p = V.pos[o.i]; if (p && T.drag && T.drag.it === o) { p.x = o.x; p.y = o.y; } }
    const glo = hooks.gl && hooks.gl(); C = ctx;
    if (glo) {
      const dice = T.dice.filter(d => d.t0 <= now).map(dieState); const tokens = T.tokens.filter(t => !t.img).map(t => ({ x: t.x, y: t.y, col: hex(t.c).map(v => v / 255) })), stickers = T.tokens.filter(t => t.img).map(t => ({ k: t.img, x: t.x, y: t.y }));
      V.draw(ctx, T.s, G, now, Object.assign({ COL, viewer: 0, showEnemy: false, dice, tokens, stickers, dpr: T.DPR, hlTerr: (T.selTer && T.s && T.s.custom && T.s.terrain.includes(T.selTer)) ? T.selTer : null, lifted: (T.drag && T.drag.mode === 'item' && T.drag.k === 'op' && T.drag.moved) ? T.drag.it.i : -1, groundExtra: g => { C = g; decals(now); C = ctx; } }, glo));
      marks(); ctx.textAlign = 'start'; return;
    }
    V.draw(ctx, T.s, G, now, { COL, viewer: 0, showEnemy: false });
    decals(now); marks();
    for (const t of T.tokens) { if (t.img) continue; const col = hex(t.c); ring(t.x, t.y, .42, .02, null, 0, 'rgba(0,0,0,.4)'); ring(t.x, t.y, .4, .26, '#05070a', 1.2, sh(col, 1)); ring(t.x, t.y, .4, .0, '#05070a', 1, sh(col, .55)); }
    const dl = [...T.dice].sort((p, q) => V.project(q.x, q.y, 0)[2] - V.project(p.x, p.y, 0)[2]); for (const d of dl) if (d.t0 <= now) drawDie(d);
    ctx.textAlign = 'start';
  }
  function loop(now) { if (!T.running) return; try { frame(now); } catch (e) { console.error(e); } requestAnimationFrame(loop); }
  T.V = V; T.frame = frame;
  return T;
}
