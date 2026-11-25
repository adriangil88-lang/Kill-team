// Lightweight 3D board renderer (perspective projection + painter's algorithm on Canvas2D). No dependencies.
function opKind(op) { // tipo de silueta de la ficha original (sin modelo propio)
  const kw = (op.kw || []).join(' ').toUpperCase(), r = String(op.role || '').toUpperCase(), all = kw + ' ' + r;
  if (/LEADER|SERGEANT|COMMANDER|WATCHMASTER|CHAMPION|EXARCH|BOSS|PATRIARCH|MAGUS|ICONWARD|TEMPESTOR|SORCERER|PRIME|NOB\b|ALPHA|WARRIOR\b.*CAPTAIN|KILL-BROKER/.test(all) && !/GUNNER|SNIPER/.test(r)) return 'leader';
  if (/MEDIC|MEDIK|VOX|COMMS|SAPPER|ENGINEER|APOTHECARY|TECH|DRONE|MARKER|SPOTTER|FAMILIAR|PSYK|PSYCHIC|CRYPTEK|APPRENTEK|SHAMAN|ASTROPATH|INTERROGATOR|ZEALOT/.test(all)) return 'special';
  if (/SNIPER|HEAVY|GUNNER/.test(r)) return 'heavy';
  const ws = op.weapons || [], val = w => (w.atk || 1) * ((w.d || 3) + (w.cd || 4)); let m = 0, g = 0; for (const w of ws) { if (w.m) m = Math.max(m, val(w)); else g = Math.max(g, val(w)); }
  return m > g * 1.15 ? 'melee' : 'shooter';
}
export function createView3D(E) {
  const V = { yaw: 0, pitch: 0.92, dist: 36, F: 800, cx: 0, cy: 0, W: 0, H: 0, pawns: [], pos: {}, last: 0 };
  const T = { x: E.BW / 2, y: E.BH / 2 };
  const TOK = {}; // fichas del mod de Tabletop Simulator (img/tok/)
  const grBadge = n => { const k = 'GR:' + n; if (!TOK[k]) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#5a1d14'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.strokeStyle = '#e8c36a'; x.lineWidth = 4; x.stroke(); x.fillStyle = '#fff'; x.font = 'bold 34px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, 32, 35); c.naturalWidth = c.naturalHeight = 64; c.complete = true; TOK[k] = c; } return TOK[k]; }; // Hearthkyn: Grudge n
  function tokImg(k) { if (k.startsWith('GR:')) return grBadge(+k.slice(3)); let im = TOK[k]; if (!im) { im = TOK[k] = new Image(); im.src = 'img/tok/' + k + '.webp'; } return im.complete && im.naturalWidth ? im : null; }
  function drawToks(ctx, s, op, cx, yb, sz) { // fila de fichas centrada sobre el agente; yb = borde inferior
    const L = E.opTokens ? E.opTokens(s, op) : []; if (!L.length) return; const gap = 2; let x = cx - (L.length * sz + (L.length - 1) * gap) / 2;
    for (const k of L) { const im = tokImg(k); if (im) { const r = im.naturalWidth / im.naturalHeight; const w = r >= 1 ? sz : sz * r, h = r >= 1 ? sz / r : sz; ctx.drawImage(im, x + (sz - w) / 2, yb - sz + (sz - h) / 2, w, h); } x += sz + gap; }
  }
  const addPoly = (ctx, q) => { let A = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; A += a[0] * b[1] - b[0] * a[1]; } if (A < 0) q = q.slice().reverse(); q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }; // polígono con orientación fija: así la unión se rellena con un solo tono
  let eye, f, r, u;
  const norm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  function cam() {
    const c = Math.cos(V.pitch), s = Math.sin(V.pitch);
    eye = { x: T.x + V.dist * c * Math.sin(V.yaw), y: T.y + V.dist * c * Math.cos(V.yaw), z: V.dist * s };
    f = norm({ x: T.x - eye.x, y: T.y - eye.y, z: -eye.z });
    r = norm({ x: -f.y, y: f.x, z: 0 });
    u = { x: f.y * r.z - f.z * r.y, y: f.z * r.x - f.x * r.z, z: f.x * r.y - f.y * r.x };
  }
  function P(x, y, z) {
    if (V.ortho) return [x * V.ortho, y * V.ortho, 1];
    const vx = x - eye.x, vy = y - eye.y, vz = z - eye.z; const zc = vx * f.x + vy * f.y + vz * f.z;
    if (zc < 0.5) return null;
    return [V.cx + V.F * (vx * r.x + vy * r.y + vz * r.z) / zc, V.cy - V.F * (vx * u.x + vy * u.y + vz * u.z) / zc, zc];
  }
  function fit() {
    const Hu = Math.max(V.H * 0.3, V.H - (V.inset || 0)); V.F = Math.max(V.W, Math.min(V.H * 1.7, V.W * 2.2)); const Wu = Math.max(V.W * 0.3, V.W - (V.insetR || 0)); V.cx = Wu / 2; V.cy = (V.inset ? Hu * 0.5 : V.H * 0.52);
    for (let d = 22; d < 160; d += 1) { V.dist = d; cam(); let ok = true; for (const [x, y] of [[0, 0], [E.BW, 0], [0, E.BH], [E.BW, E.BH]]) { const p = P(x, y, 0); if (!p || p[0] < Wu * 0.03 || p[0] > Wu * 0.97 || p[1] < Hu * 0.07 || p[1] > Hu * 0.96) ok = false; } if (ok) break; }
    V.fitDist = V.dist;
  }
  V.fitInset = (px, pr) => { V.inset = Math.max(0, px | 0); V.insetR = Math.max(0, pr | 0); V.reset(); }; /* encuadra el mapa entero en la parte visible sobre el panel desplegado */
  V.resize = (w, h) => { if (w !== V.W || h !== V.H) { V.W = w; V.H = h; fit(); } };
  V.reset = () => { V.focused = null; V.yaw = 0; V.pitch = 0.92; T.x = E.BW / 2; T.y = E.BH / 2; fit(); };
  V.camState = () => { cam(); return { eye, f, r, u, F: V.F, cx: V.cx, cy: V.cy, vw: V.W, vh: V.H }; }; V.T = T; V.eyePos = () => { cam(); return eye; };
  V.pan = (dx, dy) => { V.fly = null; cam(); const g = Math.hypot(f.x, f.y) || 1; const fx = f.x / g, fy = f.y / g; T.x = Math.max(-4, Math.min(E.BW + 4, T.x + r.x * dx + fx * dy)); T.y = Math.max(-4, Math.min(E.BH + 4, T.y + r.y * dx + fy * dy)); };
  V.panK = () => V.dist / V.F * 1.6; // píxeles de pantalla → unidades de tablero
  V.focusOn = (x, y) => { T.x = Math.max(-4, Math.min(E.BW + 4, x)); T.y = Math.max(-4, Math.min(E.BH + 4, y)); V.dist = 14; V.pitch = 0.85; };
  V.rotate = (dx, dy) => { V.yaw += dx * 0.008; V.pitch = Math.max(0.05, Math.min(1.5, V.pitch + dy * 0.006)); };
  V.flyTo = (x, y, d, ms) => { V.fly = { x0: T.x, y0: T.y, d0: V.dist, x: Math.max(-4, Math.min(E.BW + 4, x)), y: Math.max(-4, Math.min(E.BH + 4, y)), d: Math.max(14, Math.min(70, d)), ms: Math.max(120, ms || 700), t0: performance.now() }; V.focused = null; }; /* cámara animada (seguimiento de la IA) */
  V.flyStep = () => { const f = V.fly; if (!f) return; const k = Math.min(1, (performance.now() - f.t0) / f.ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; T.x = f.x0 + (f.x - f.x0) * e; T.y = f.y0 + (f.y - f.y0) * e; V.dist = f.d0 + (f.d - f.d0) * e; if (k >= 1) V.fly = null; };
  V.zoom = k => { V.fly = null; V.dist = Math.max(14, Math.min(70, V.dist * k)); };
  V.project = (x, y, z) => { cam(); return P(x, y, z); };
  V.unproject = (sx, sy) => {
    cam(); const d = { x: f.x * V.F + r.x * (sx - V.cx) + u.x * (V.cy - sy), y: f.y * V.F + r.y * (sx - V.cx) + u.y * (V.cy - sy), z: f.z * V.F + r.z * (sx - V.cx) + u.z * (V.cy - sy) };
    if (d.z >= -1e-6) return { x: -99, y: -99 }; const t = -eye.z / d.z; return { x: eye.x + d.x * t, y: eye.y + d.y * t };
  };
  V.pickOp = (sx, sy) => { let best = null; for (const p of V.pawns) { const d = Math.hypot(p.sx - sx, p.sy - sy); if (d <= p.r && (!best || p.zc < best.zc)) best = p; } return best ? best.i : null; };

  const L = norm({ x: -0.45, y: -0.55, z: 0.75 });
  const sh = (c, k) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  function poly(ctx, pts, fill, stroke, lw) {
    const q = []; for (const p of pts) { const s = P(p[0], p[1], p[2]); if (!s) return; q.push(s); }
    ctx.beginPath(); q.forEach((s, i) => i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  const BW0 = s => E.BW, BH0 = s => E.BH;
function ocirc(o, x, y, rad, z, n = 28) { if (typeof o.bh !== 'number') return circ(x, y, rad, z, n); const a = [], k = o.bh / o.br, f = o.fa != null ? o.fa : (o.fa0 || 0), cf = Math.cos(f), sf = Math.sin(f); for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, u = Math.cos(t) * rad, w = Math.sin(t) * rad * k; a.push([x + u * cf - w * sf, y + u * sf + w * cf, z]); } return a; }
function circ(x, y, rad, z, n = 28) { const a = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; a.push([x + Math.cos(t) * rad, y + Math.sin(t) * rad, z]); } return a; }
  function line(ctx, a, b, col, lw, dash) { const p = P(a[0], a[1], a[2]), q = P(b[0], b[1], b[2]); if (!p || !q) return; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]); }
  function text(ctx, s, x, y, z, col, size, bg) { if (V.ortho && V.q) { V.q.push([s, x, y, z, col, size, bg]); return; } const p = P(x, y, z); if (!p) return; const px = Math.max(10, Math.min(size, V.F * 0.55 / p[2] * (size / 14))); ctx.font = `700 ${px}px system-ui`; ctx.textAlign = 'center'; if (bg) { const w = ctx.measureText(s).width + 8; ctx.fillStyle = bg; ctx.fillRect(p[0] - w / 2, p[1] - px, w, px + 5); } ctx.fillStyle = col; ctx.fillText(s, p[0], p[1]); }

  function box(ctx, x0, y0, w, h, z1, col, edge) {
    const c = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
    const faces = [{ n: { x: 0, y: -1, z: 0 }, a: [0, 1] }, { n: { x: 1, y: 0, z: 0 }, a: [1, 2] }, { n: { x: 0, y: 1, z: 0 }, a: [2, 3] }, { n: { x: -1, y: 0, z: 0 }, a: [3, 0] }];
    for (const fc of faces) {
      const A = c[fc.a[0]], B = c[fc.a[1]]; const mid = { x: (A[0] + B[0]) / 2, y: (A[1] + B[1]) / 2, z: z1 / 2 };
      if (dot(fc.n, { x: eye.x - mid.x, y: eye.y - mid.y, z: eye.z - mid.z }) <= 0) continue;
      const k = 0.42 + 0.58 * Math.max(0, dot(fc.n, L));
      poly(ctx, [[A[0], A[1], 0], [B[0], B[1], 0], [B[0], B[1], z1], [A[0], A[1], z1]], sh(col, k), edge, 1);
    }
    poly(ctx, c.map(p => [p[0], p[1], z1]), sh(col, 1.18), edge, 1);
  }
  function pawn(ctx, o, x, y, col, alpha, glow, injured, order) {
    const R = E.bR(o) * 0.92, Hh = 1.35; const dark = [col[0] * .45, col[1] * .45, col[2] * .45];
    ctx.globalAlpha = alpha;
    // base
    poly(ctx, ocirc(o, x, y, E.bR(o), 0.02), '#10151c', glow || (injured ? '#ff4d5e' : '#05070a'), glow ? 3 : 2);
    poly(ctx, ocirc(o, x, y, E.bR(o), 0.22), sh(col, .6), '#05070a', 1);
    // body cylinder
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2; const nn = { x: Math.cos(am), y: Math.sin(am), z: 0 };
      const mid = { x: x + nn.x * R, y: y + nn.y * R, z: 0.7 }; if (dot(nn, { x: eye.x - mid.x, y: eye.y - mid.y, z: eye.z - mid.z }) <= 0) continue;
      const k = 0.4 + 0.75 * Math.max(0, dot(nn, L));
      poly(ctx, [[x + Math.cos(a0) * R, y + Math.sin(a0) * R, 0.22], [x + Math.cos(a1) * R, y + Math.sin(a1) * R, 0.22], [x + Math.cos(a1) * R * .8, y + Math.sin(a1) * R * .8, Hh], [x + Math.cos(a0) * R * .8, y + Math.sin(a0) * R * .8, Hh]], sh(col, k), null);
    }
    poly(ctx, circ(x, y, R * .8, Hh), sh(col, 1.25), null);
    // head
    const hp = P(x, y, Hh + 0.32); const hr = hp ? V.F * 0.34 / hp[2] : 0;
    if (hp) { const g = ctx.createRadialGradient(hp[0] - hr * .35, hp[1] - hr * .35, hr * .1, hp[0], hp[1], hr); g.addColorStop(0, sh(col, 1.5)); g.addColorStop(1, sh(dark, 1)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hp[0], hp[1], hr, 0, 7); ctx.fill(); ctx.strokeStyle = '#05070a'; ctx.lineWidth = 1.2; ctx.stroke(); }
    if (order === 'conceal') { poly(ctx, circ(x, y, E.bR(o) + 0.12, 0.05), null, '#cbd5e1', 1.5); }
    ctx.globalAlpha = 1;
  }

  function groundLayer(ctx, s, G, t, o, ctl) {
    const { COL, viewer, showEnemy } = o; const U = G.ui;
    // objectives (floor rings)
    if (s.escM) { poly(ctx, circ(Math.min(BW0(s), Math.max(0, s.escM.x)), Math.min(BH0(s), Math.max(0, s.escM.y)), 1.0, 0.03, 36), 'rgba(120,255,120,.2)', '#7dff7d', 2); }
    if (s.tele) for (const tp of s.tele) { poly(ctx, circ(tp.x, tp.y, 1.18, 0.03, 40), 'rgba(80,220,200,.18)', '#4fe3cf', 1.8); poly(ctx, circ(tp.x, tp.y, 0.55, 0.03, 28), 'rgba(80,220,200,.25)', null); } // Tomb World: plataformas de teletransporte
    s.objs.forEach((ob, i) => { const c = ctl[i] < 0 ? '#c8d0dc' : COL[ctl[i]]; ctx.setLineDash([6, 5]); poly(ctx, circ(ob.x, ob.y, E.OBJ_R, 0.03, 40), 'rgba(255,255,255,.03)', c, 1.6); ctx.setLineDash([]); });
    if (E.groundTokens) for (const m of [...E.groundTokens(s), ...((o && o.stickers) || [])]) { const im = tokImg(m.k), p = P(m.x, m.y, 0.03); if (im && p) { const sz = V.ortho ? 1.3 * V.ortho : Math.max(12, V.F * 1.3 / p[2]); ctx.drawImage(im, p[0] - sz / 2, p[1] - sz / 2, sz, sz); } } /* Booby Trap, Trip Alarm, Caída */
    if (s.eq) s.eq.forEach((e, ep) => { (e.smokes || []).forEach(m => poly(ctx, circ(m.x, m.y, 1, 0.02, 24), 'rgba(190,195,205,.45)', 'rgba(230,232,238,.8)', 1.2)); (e.mines || []).forEach(m => poly(ctx, circ(m.x, m.y, 0.3, 0.02, 14), '#2a2d33', COL[ep], 1.2)); if (e.ammo) poly(ctx, circ(e.ammo.x, e.ammo.y, 0.4, 0.02, 4), '#6b5a2a', COL[ep], 1.2); });
    for (let p = 0; p < 2; p++) { const T = s.tun && s.tun[p]; if (!T || !T.length) continue; const col = COL[p]; for (let i = 1; i < T.length; i++) line(ctx, [T[i - 1].x, T[i - 1].y, 0.03], [T[i].x, T[i].y, 0.03], col, 7, [2, 6]); T.forEach(m => poly(ctx, circ(m.x, m.y, 0.5, 0.03), 'rgba(0,0,0,.4)', col, 2)); }
    // reach overlay (batched)
    if (U.R && U.cells) {
      ctx.fillStyle = 'rgba(56,210,122,.28)'; ctx.beginPath(); const h = (U.R.fine ? U.R.fine.step : E.GRID) / 2;
      if (U.R.fine && U.R.fine.rb) { const F = U.R.fine; if (!F.edge) { const key = new Set(F.pts.map(c => Math.round(c.x / F.step) + ',' + Math.round(c.y / F.step))); F.edge = F.pts.filter(c => { const i = Math.round(c.x / F.step), j = Math.round(c.y / F.step); return !(key.has((i + 1) + ',' + j) && key.has((i - 1) + ',' + j) && key.has(i + ',' + (j + 1)) && key.has(i + ',' + (j - 1))); }); } for (const c of F.edge) { let ok = true; const q = []; for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, pp = P(c.x + F.rb * Math.cos(a), c.y + F.rb * Math.sin(a), 0.03); if (!pp) { ok = false; break; } q.push(pp); } if (!ok) continue; addPoly(ctx, q); } }
      for (const c of (U.R.fine ? U.R.fine.pts : [...U.R.cells].map(k => U.R.cellXY(k)))) { const a = P(c.x - h, c.y - h, 0.04), b = P(c.x + h, c.y - h, 0.04), d = P(c.x + h, c.y + h, 0.04), e = P(c.x - h, c.y + h, 0.04); if (!a || !b || !d || !e) continue; addPoly(ctx, [a, b, d, e]); }
      ctx.fill();
      if (U.mode === 'deploy' && U.pending && U.dplyOp != null && s.ops[U.dplyOp]) poly(ctx, circ(U.pending.x, U.pending.y, E.bR(s.ops[U.dplyOp]), 0.07), 'rgba(255,255,255,.3)', '#fff', 3); // peana a escala donde se va a desplegar
      const tg = U.pending || U.hover;
      if (tg) { const k = E.cellOf(U.R, tg.x, tg.y); if (U.cells.has(k)) { const path = U.R.path(k); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); path.forEach((p, i) => { const q = P(p.x, p.y, 0.08); if (!q) return; i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]); const c = U.R.cellXY(k); poly(ctx, circ(c.x, c.y, E.RAD, 0.06), 'rgba(255,255,255,.35)', '#fff', 2); text(ctx, U.R.dist[k].toFixed(1) + '"', c.x, c.y, 1.9, '#fff', 15, 'rgba(0,0,0,.6)'); } }
    }
    // enemy last activation
    if (showEnemy) {
      const ep = 1 - viewer; const evs = G.lastBy[ep] || []; const pulse = 0.6 + 0.3 * Math.sin(t / 300);
      for (const ev of evs) {
        if (ev.k === 'move') { ctx.globalAlpha = pulse; ctx.strokeStyle = COL[ep]; ctx.lineWidth = 3.5; ctx.setLineDash([3, 8]); ctx.lineCap = 'round'; ctx.beginPath(); ev.path.forEach((p, i) => { const q = P(p.x, p.y, 0.1); if (!q) return; i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]); poly(ctx, circ(ev.from.x, ev.from.y, E.RAD, 0.06), COL[ep] + '55', COL[ep], 2); ctx.globalAlpha = 1; }
        if (ev.k === 'shoot' || ev.k === 'fight') { const a = s.ops[ev.op], b = s.ops[ev.tg]; const hit = ev.k === 'shoot' ? ev.res.some(x => x.dmg > 0) : ev.steps.some(x => x.dmg); const col = hit ? '#ff4d5e' : '#ffb347'; ctx.globalAlpha = pulse + .15; line(ctx, [a.x, a.y, 1.3], [b.x, b.y, 1.3], col, 3, ev.k === 'shoot' ? [10, 6] : []); ctx.globalAlpha = 1; text(ctx, ev.k === 'shoot' ? '✸' : '⚔', b.x, b.y, 3.1, col, 26); }
        if (ev.k === 'act') { const op = s.ops[ev.op]; poly(ctx, circ(op.x, op.y, E.RAD + .35, 0.07), null, '#ffd24a', 2.5); }
      }
    }
    // selection / targets rings
    for (const op of s.ops) { if (!op.alive) continue; const act = s.act && s.act.op === op.i; if (U.sel === op.i || act) poly(ctx, circ((V.pos[op.i] || op).x, (V.pos[op.i] || op).y, E.RAD + .3 + Math.sin(t / 250) * .06, 0.07), null, act ? '#ffd24a' : '#ffffff', 3); }
    if (U.targets) for (const [i] of U.targets) { const op = s.ops[i], p = V.pos[i] || op; poly(ctx, circ(p.x, p.y, E.RAD + .45 + Math.sin(t / 200) * .08, 0.08), 'rgba(255,77,94,.15)', '#ff4d5e', 3); }

  }


  const faceTo = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  V.face = {}; V.lift = {}; V.clm = {};
  const GROUNDIMG = new Image(); GROUNDIMG.src = 'ground.webp'; const VGROUND = new Image(); VGROUND.src = 'vground.webp'; const TGROUND = new Image(); TGROUND.src = 'twground.webp'; const YGROUND = new Image(); YGROUND.src = 'tyground.webp';
  function drawGL(ctx, s, G, t, o) {
    const { COL, viewer, showEnemy, gl: GL } = o; const U = G.ui; const SCg = o.gsc || 32;
    const gc = o.ground; const gw = Math.round(E.BW * SCg), gh = Math.round(E.BH * SCg); if (gc.width !== gw) { gc.width = gw; gc.height = gh; }
    const g = gc.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, gh); gr.addColorStop(0, '#222b38'); gr.addColorStop(1, '#171e29'); g.fillStyle = gr; g.fillRect(0, 0, gw, gh);
    const vol = (s.layout >= 8 && s.layout < 14) || s.layout >= E.VC0; const GI = s.tyF && YGROUND.complete && YGROUND.naturalWidth ? YGROUND : vol && VGROUND.complete && VGROUND.naturalWidth ? VGROUND : (s.tw || s.custom) && TGROUND.complete && TGROUND.naturalWidth ? TGROUND : GROUNDIMG; if (GI.complete && GI.naturalWidth) { g.globalAlpha = .95; g.drawImage(GI, 0, 0, gw, gh); g.globalAlpha = 1; g.fillStyle = 'rgba(14,20,30,.32)'; g.fillRect(0, 0, gw, gh); }
    const dp = s.dep || { ax: 'x', d: 6 }, dl = dp.d * SCg; g.fillStyle = 'rgba(255,122,42,.14)'; if (dp.ax === 'x') g.fillRect(0, 0, dl, gh); else g.fillRect(0, 0, gw, dl); g.fillStyle = 'rgba(53,182,255,.14)'; if (dp.ax === 'x') g.fillRect(gw - dl, 0, dl, gh); else g.fillRect(0, gh - dl, gw, dl);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.beginPath(); for (let i = 0; i <= E.BW; i++) { g.moveTo(i * SCg, 0); g.lineTo(i * SCg, gh); } for (let j = 0; j <= E.BH; j++) { g.moveTo(0, j * SCg); g.lineTo(gw, j * SCg); } g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 2; g.strokeRect(1, 1, gw - 2, gh - 2);
    const ctl = E.objControl(s); cam(); V.ortho = SCg; V.q = [];
    groundLayer(g, s, G, t, o, ctl); if (o.groundExtra) o.groundExtra(g); V.ortho = 0;
    GL.setGround(gc);
    const hexf = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const ops = []; V.pawns = []; const wlls = (s.terrain || []).filter(r => r.t === 'wall');
    for (const op of s.ops) {
      const p = V.pos[op.i]; const act = s.act && s.act.op === op.i;
      let fa = V.face[op.i]; if (fa == null) fa = V.face[op.i] = op.p ? Math.PI : 0;
      const dx = op.x - p.x, dy = op.y - p.y; { let tg = 0; if (op.alive && !(op.z > 0.2) && Math.hypot(dx, dy) > 0.03) for (const r of wlls) { const ex = Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), ey = Math.max(r.y - p.y, 0, p.y - (r.y + r.h)), c = Math.max(0, Math.min(1, (0.6 - Math.hypot(ex, ey)) / 0.6)); if (c > tg) tg = c; } V.clm[op.i] = (V.clm[op.i] || 0) + (tg * 2 - (V.clm[op.i] || 0)) * 0.3; } /* al cruzar un muro la peana sube y baja en vez de atravesarlo */ if (Math.hypot(dx, dy) > 0.06) V.face[op.i] = fa = faceTo(fa, Math.atan2(dy, dx), 0.18);
      ops.push({ kind: opKind(op), nm: op.role || '', x: p.x, y: p.y, yaw: fa, alive: op.alive, mesh: o.meshOf ? o.meshOf(op) : null, h: o.heightOf ? o.heightOf(op) : 0, col: hexf(COL[op.p]), dim: !op.ready && !act, hurt: E.injured(op), glow: !!(U.sel === op.i || act), order: op.order, z0: (op.z || 0) + (V.clm[op.i] || 0) + (V.lift[op.i] = (V.lift[op.i] || 0) + (((o.lifted === op.i) ? 0.9 : 0) - (V.lift[op.i] || 0)) * 0.25) });
    }
    const S = { fsteps: s.fsteps || null, vcSk: s.vc ? s.vc.stk.map(k => ({ r: k.r, door: k.door, open: k.open })) : null, tm: t, vol: (s.layout >= 8 && s.layout < 14) || s.layout >= E.VC0, pieces: s.pieces ? s.pieces.map((p, i) => ({ open: !!(s.hatch && s.hatch.some(h => h.pi === i && h.open)), k: p[0], x: E.BW / 2 + p[1], y: E.BH / 2 + p[2], rot: p[3], sx: p[4], sy: p[5], sz: p[6], h: p[7] || 0, fi: p[8] })) : null, terrain: s.terrain, oct: !!s.oct, bz: s.bz || null, tw: !!(s.tw || s.custom), hl: o.hlTerr || null, doors: s.tw && s.hatch ? s.hatch.map(h => h.r) : null, brs: s.tw && s.bpt ? s.bpt.map(b => b.r) : null, tele: s.tele || null, tyF: s.tyF || null, tyDr: s.tyDr || null, tySac: s.tySac || null, escM: s.escM || null, ladders: s.ladders || [], marks: s.eq ? s.eq.flatMap((e, ep) => [...(e.smokes || []).map(m => ({ k: 's', x: m.x, y: m.y, p: ep })), ...(e.mines || []).map(m => ({ k: 'm', x: m.x, y: m.y, p: ep })), ...(e.ammo ? [{ k: 'a', x: e.ammo.x, y: e.ammo.y, p: ep }] : []), ...(e.comms ? [{ k: 'c', x: e.comms.x, y: e.comms.y, p: ep }] : [])]) : [], objs: s.objs.map((ob, i) => ({ x: ob.x, y: ob.y, col: ctl[i] < 0 ? [.78, .82, .88] : hexf(COL[ctl[i]]) })), ops, dice: o.dice || [], tokens: o.tokens || [] };
    const cs = V.camState(); GL.resize(V.W, V.H, o.dpr || 1); GL.render(cs, S);
    // capa 2D: textos y barras
    for (const q of V.q) text(ctx, q[0], q[1], q[2], q[3], q[4], q[5], q[6]); V.q = [];
    const placed = []; const ovl = (x0, y0, w, h) => placed.find(r => x0 < r[0] + r[2] && x0 + w > r[0] && y0 < r[1] + r[3] && y0 + h > r[1]);
    const fit = (x0, y0, w, h) => { let dy = 0; for (let k = 0; k < 8; k++) { const hit = ovl(x0, y0 + dy, w, h); if (!hit) break; dy = hit[1] - h - 1 - y0; } placed.push([x0, y0 + dy, w, h]); return dy; };
    const pri = z => (U.sel === z.i || (s.act && s.act.op === z.i)) ? 1 : 0;
    const order = s.ops.filter(z => z.alive).sort((a, b) => (pri(b) - pri(a)) || (V.pos[b.i].y - V.pos[a.i].y));
    for (const op of order) {
      const p = V.pos[op.i];
      const mk = o.meshOf && GL.meshes[o.meshOf(op)]; const mh = mk ? Math.min(3.2, mk.bb[1]) : 1.9; let top = P(p.x, p.y, mh + 0.55); const c = P(p.x, p.y, mh * 0.5);
      if (c) V.pawns.push({ i: op.i, sx: c[0], sy: c[1], zc: c[2], r: Math.max(16, V.F * 0.95 / c[2]) });
      if (top) {
        const idx = s.ops.filter(z => z.p === op.p).indexOf(op) + 1; const fs = Math.max(9, Math.min(15, V.F * 0.4 / top[2])) * (V.W < 520 ? 0.78 : 1);
        const nm0 = String((V.nameOf && V.nameOf(op.i)) || op.role || '').replace(/\s+/g, ' '), lim = V.W < 520 ? 13 : 20, nm = nm0.length > lim ? nm0.slice(0, lim - 1) + '…' : nm0, lab = nm ? idx + ' · ' + nm : String(idx); /* nombre de la unidad sobre su cabeza */
        ctx.font = `800 ${fs}px system-ui`; const w = Math.max(Math.max(18, Math.min(46, V.F * 1.1 / top[2])) * (V.W < 520 ? 0.75 : 1), ctx.measureText(lab).width + 8); const hbar = Math.max(4, fs * .3); const dyL = fit(top[0] - w / 2, top[1] - hbar - fs - 2, w, hbar + fs + 4); if (dyL) top = [top[0], top[1] + dyL, top[2]];
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(top[0] - w / 2, top[1] - hbar - fs - 2, w, hbar + fs + 4);
        ctx.fillStyle = '#fff'; ctx.font = `800 ${fs}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(lab, top[0], top[1] - hbar - 4);
        ctx.fillStyle = '#222b38'; ctx.fillRect(top[0] - w / 2 + 2, top[1] - hbar, w - 4, hbar - 2);
        ctx.fillStyle = op.w / op.W > .5 ? '#38d27a' : '#ff4d5e'; ctx.fillRect(top[0] - w / 2 + 2, top[1] - hbar, (w - 4) * op.w / op.W, hbar - 2);
        { const act = s.act && s.act.op === op.i, im = tokImg((op.order === 'conceal' ? 'Conceal_' : 'Engage_') + ((!op.ready && !act) ? 'activated' : 'ready')); if (im) { const sz = Math.max(11, Math.min(34, V.F * 0.9 / top[2])) * (V.W < 520 ? 0.8 : 1); ctx.drawImage(im, top[0] - sz / 2, top[1] - hbar - fs - 2 - sz - 2, sz, sz); } } /* ficha de orden del libro (Trabarse / Ocultarse) sobre la etiqueta, sin solaparla */
        /* fichas de operativo: solo en su carta */
        
        if (U.targets && U.targets.has(op.i)) { ctx.fillStyle = '#000b'; ctx.fillRect(top[0] - 24, top[1] - hbar - fs - 24, 48, 18); ctx.fillStyle = '#ff9aa4'; ctx.font = '700 12px system-ui'; ctx.fillText('≈' + U.targets.get(op.i).toFixed(1), top[0], top[1] - hbar - fs - 10); }
      }
    }
    ctx.textAlign = 'start';
  }

  // Main draw ------------------------------------------------------------------
  V.draw = (ctx, s, G, t, o) => {
    const { COL, viewer, showEnemy } = o; V.flyStep(); cam(); V.pawns = [];
    const now = performance.now(); const dt = Math.min(64, now - (V.last || now)); V.last = now; const lerp = 1 - Math.pow(0.0012, dt / 1000);
    for (const op of s.ops) { const p = V.pos[op.i] || (V.pos[op.i] = { x: op.x, y: op.y }); p.x += (op.x - p.x) * lerp; p.y += (op.y - p.y) * lerp; if (Math.hypot(op.x - p.x, op.y - p.y) < 0.01) { p.x = op.x; p.y = op.y; } }
    if (o.gl && o.gl.ok) return drawGL(ctx, s, G, t, o);
    // background / floor
    const bg = ctx.createLinearGradient(0, 0, 0, V.H); bg.addColorStop(0, '#0a0d12'); bg.addColorStop(1, '#151b25'); ctx.fillStyle = bg; ctx.fillRect(0, 0, V.W, V.H);
    // table skirt
    poly(ctx, [[0, E.BH, 0], [E.BW, E.BH, 0], [E.BW, E.BH, -0.7], [0, E.BH, -0.7]], '#0c1017', '#2a3344');
    poly(ctx, [[0, 0, 0], [E.BW, 0, 0], [E.BW, E.BH, 0], [0, E.BH, 0]], '#1a212c', '#3a475c', 2);
    if (s.zones) { s.zones.forEach((zs, p) => { const c = ['rgba(255,122,42,.14)', 'rgba(53,182,255,.14)', 'rgba(125,219,90,.14)', 'rgba(214,91,255,.14)'][p]; for (const Z of zs) poly(ctx, [[Z[0], Z[1], 0.01], [Z[0] + Z[2], Z[1], 0.01], [Z[0] + Z[2], Z[1] + Z[3], 0.01], [Z[0], Z[1] + Z[3], 0.01]], c); }); } else { const dp = s.dep || { ax: 'x', d: 6 }, d = dp.d, A = dp.ax === 'x';
      poly(ctx, A ? [[0, 0, 0.01], [d, 0, 0.01], [d, E.BH, 0.01], [0, E.BH, 0.01]] : [[0, 0, 0.01], [E.BW, 0, 0.01], [E.BW, d, 0.01], [0, d, 0.01]], 'rgba(255,122,42,.12)');
      poly(ctx, A ? [[E.BW - d, 0, 0.01], [E.BW, 0, 0.01], [E.BW, E.BH, 0.01], [E.BW - d, E.BH, 0.01]] : [[0, E.BH - d, 0.01], [E.BW, E.BH - d, 0.01], [E.BW, E.BH, 0.01], [0, E.BH, 0.01]], 'rgba(53,182,255,.12)'); }
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= E.BW; i++) { const a = P(i, 0, 0), b = P(i, E.BH, 0); if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } }
    for (let j = 0; j <= E.BH; j++) { const a = P(0, j, 0), b = P(E.BW, j, 0); if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } }
    ctx.stroke();
    // objectives (floor rings)
    const ctl = E.objControl(s);
    if (s.escM) { poly(ctx, circ(Math.min(BW0(s), Math.max(0, s.escM.x)), Math.min(BH0(s), Math.max(0, s.escM.y)), 1.0, 0.03, 36), 'rgba(120,255,120,.2)', '#7dff7d', 2); }
    if (s.tele) for (const tp of s.tele) { poly(ctx, circ(tp.x, tp.y, 1.18, 0.03, 40), 'rgba(80,220,200,.18)', '#4fe3cf', 1.8); poly(ctx, circ(tp.x, tp.y, 0.55, 0.03, 28), 'rgba(80,220,200,.25)', null); } // Tomb World: plataformas de teletransporte
    s.objs.forEach((ob, i) => { const c = ctl[i] < 0 ? '#c8d0dc' : COL[ctl[i]]; ctx.setLineDash([6, 5]); poly(ctx, circ(ob.x, ob.y, E.OBJ_R, 0.03, 40), 'rgba(255,255,255,.03)', c, 1.6); ctx.setLineDash([]); });
    if (E.groundTokens) for (const m of [...E.groundTokens(s), ...((o && o.stickers) || [])]) { const im = tokImg(m.k), p = P(m.x, m.y, 0.03); if (im && p) { const sz = V.ortho ? 1.3 * V.ortho : Math.max(12, V.F * 1.3 / p[2]); ctx.drawImage(im, p[0] - sz / 2, p[1] - sz / 2, sz, sz); } } /* Booby Trap, Trip Alarm, Caída */
    if (s.eq) s.eq.forEach((e, ep) => { (e.smokes || []).forEach(m => poly(ctx, circ(m.x, m.y, 1, 0.02, 24), 'rgba(190,195,205,.45)', 'rgba(230,232,238,.8)', 1.2)); (e.mines || []).forEach(m => poly(ctx, circ(m.x, m.y, 0.3, 0.02, 14), '#2a2d33', COL[ep], 1.2)); if (e.ammo) poly(ctx, circ(e.ammo.x, e.ammo.y, 0.4, 0.02, 4), '#6b5a2a', COL[ep], 1.2); });
    // reach overlay (batched)
    const U = G.ui;
    if (globalThis.__DBGW) for (const r of (s.terrain || [])) { const q = [P(r.x, r.y, 0.05), P(r.x + r.w, r.y, 0.05), P(r.x + r.w, r.y + r.h, 0.05), P(r.x, r.y + r.h, 0.05)]; if (q.every(Boolean)) { ctx.save(); ctx.strokeStyle = r.t === 'wall' ? '#f33' : '#3af'; ctx.lineWidth = 2; ctx.beginPath(); q.forEach((a, i) => i ? ctx.lineTo(a[0], a[1]) : ctx.moveTo(a[0], a[1])); ctx.closePath(); ctx.stroke(); ctx.restore(); } } /* depuración */
    if (U.R && U.cells) {
      ctx.fillStyle = 'rgba(56,210,122,.28)'; ctx.beginPath(); const h = (U.R.fine ? U.R.fine.step : E.GRID) / 2;
      if (U.R.fine && U.R.fine.rb) { const F = U.R.fine; if (!F.edge) { const key = new Set(F.pts.map(c => Math.round(c.x / F.step) + ',' + Math.round(c.y / F.step))); F.edge = F.pts.filter(c => { const i = Math.round(c.x / F.step), j = Math.round(c.y / F.step); return !(key.has((i + 1) + ',' + j) && key.has((i - 1) + ',' + j) && key.has(i + ',' + (j + 1)) && key.has(i + ',' + (j - 1))); }); } for (const c of F.edge) { let ok = true; const q = []; for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, pp = P(c.x + F.rb * Math.cos(a), c.y + F.rb * Math.sin(a), 0.03); if (!pp) { ok = false; break; } q.push(pp); } if (!ok) continue; addPoly(ctx, q); } }
      for (const c of (U.R.fine ? U.R.fine.pts : [...U.R.cells].map(k => U.R.cellXY(k)))) { const a = P(c.x - h, c.y - h, 0.04), b = P(c.x + h, c.y - h, 0.04), d = P(c.x + h, c.y + h, 0.04), e = P(c.x - h, c.y + h, 0.04); if (!a || !b || !d || !e) continue; addPoly(ctx, [a, b, d, e]); }
      ctx.fill();
      if (U.mode === 'deploy' && U.pending && U.dplyOp != null && s.ops[U.dplyOp]) poly(ctx, circ(U.pending.x, U.pending.y, E.bR(s.ops[U.dplyOp]), 0.07), 'rgba(255,255,255,.3)', '#fff', 3); // peana a escala donde se va a desplegar
      const tg = U.pending || U.hover;
      if (tg) { const k = E.cellOf(U.R, tg.x, tg.y); if (U.cells.has(k)) { const path = U.R.path(k); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); path.forEach((p, i) => { const q = P(p.x, p.y, 0.08); if (!q) return; i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]); const c = U.R.cellXY(k); poly(ctx, circ(c.x, c.y, E.RAD, 0.06), 'rgba(255,255,255,.35)', '#fff', 2); text(ctx, U.R.dist[k].toFixed(1) + '"', c.x, c.y, 1.9, '#fff', 15, 'rgba(0,0,0,.6)'); } }
    }
    // enemy last activation
    if (showEnemy) {
      const ep = 1 - viewer; const evs = G.lastBy[ep] || []; const pulse = 0.6 + 0.3 * Math.sin(t / 300);
      for (const ev of evs) {
        if (ev.k === 'move') { ctx.globalAlpha = pulse; ctx.strokeStyle = COL[ep]; ctx.lineWidth = 3.5; ctx.setLineDash([3, 8]); ctx.lineCap = 'round'; ctx.beginPath(); ev.path.forEach((p, i) => { const q = P(p.x, p.y, 0.1); if (!q) return; i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]); poly(ctx, circ(ev.from.x, ev.from.y, E.RAD, 0.06), COL[ep] + '55', COL[ep], 2); ctx.globalAlpha = 1; }
        if (ev.k === 'shoot' || ev.k === 'fight') { const a = s.ops[ev.op], b = s.ops[ev.tg]; const hit = ev.k === 'shoot' ? ev.res.some(x => x.dmg > 0) : ev.steps.some(x => x.dmg); const col = hit ? '#ff4d5e' : '#ffb347'; ctx.globalAlpha = pulse + .15; line(ctx, [a.x, a.y, 1.3], [b.x, b.y, 1.3], col, 3, ev.k === 'shoot' ? [10, 6] : []); ctx.globalAlpha = 1; text(ctx, ev.k === 'shoot' ? '✸' : '⚔', b.x, b.y, 3.1, col, 26); }
        if (ev.k === 'act') { const op = s.ops[ev.op]; poly(ctx, circ(op.x, op.y, E.RAD + .35, 0.07), null, '#ffd24a', 2.5); }
      }
    }
    // selection / targets rings
    for (const op of s.ops) { if (!op.alive) continue; const act = s.act && s.act.op === op.i; if (U.sel === op.i || act) poly(ctx, circ((V.pos[op.i] || op).x, (V.pos[op.i] || op).y, E.RAD + .3 + Math.sin(t / 250) * .06, 0.07), null, act ? '#ffd24a' : '#ffffff', 3); }
    if (U.targets) for (const [i] of U.targets) { const op = s.ops[i], p = V.pos[i] || op; poly(ctx, circ(p.x, p.y, E.RAD + .45 + Math.sin(t / 200) * .08, 0.08), 'rgba(255,77,94,.15)', '#ff4d5e', 3); }

    // 3D objects, painter-sorted
    const items = []; const push = (x, y, fn) => { const zc = (x - eye.x) * f.x + (y - eye.y) * f.y + (0 - eye.z) * f.z; items.push({ zc, fn }); };
    const WALL = hex('#46566a'), COVER = hex('#7f9248');
    for (const rc of s.terrain) {
      const wall = rc.t === 'wall', hgt = wall ? 2.4 : 0.85, col = wall ? WALL : COVER;
      const nx = Math.max(1, Math.round(rc.w / 1)), ny = Math.max(1, Math.round(rc.h / 1)); const tw = rc.w / nx, th = rc.h / ny;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x0 = rc.x + i * tw, y0 = rc.y + j * th; push(x0 + tw / 2, y0 + th / 2, () => box(ctx, x0, y0, tw, th, hgt, col, 'rgba(0,0,0,.45)')); }
    }
    s.objs.forEach((ob, i) => { const c = ctl[i] < 0 ? hex('#c8d0dc') : hex(COL[ctl[i]]); push(ob.x, ob.y, () => { poly(ctx, circ(ob.x, ob.y, 0.55, 0), sh(c, .5), null); poly(ctx, circ(ob.x, ob.y, 0.5, 0.35), sh(c, 1), '#05070a', 1); const tp = P(ob.x, ob.y, 0.75); if (tp) { ctx.fillStyle = sh(c, 1.2); ctx.beginPath(); const r2 = V.F * 0.22 / tp[2]; ctx.moveTo(tp[0], tp[1] - r2); ctx.lineTo(tp[0] + r2 * .7, tp[1]); ctx.lineTo(tp[0], tp[1] + r2); ctx.lineTo(tp[0] - r2 * .7, tp[1]); ctx.closePath(); ctx.fill(); } }); });
    for (const op of s.ops) {
      if (!op.alive) continue; const p = V.pos[op.i]; const col = hex(COL[op.p]); const act = s.act && s.act.op === op.i;
      push(p.x, p.y, () => {
        pawn(ctx, op, p.x, p.y, col, (!op.ready && !act) ? 0.6 : 1, null, E.injured(op), op.order);
        { const mk = P(p.x, p.y, 2.0 + (op.z || 0)); if (mk) { const w = V.F * 0.2 / mk[2], hh = w * 1.5, c = 0.25 + 0.75 * Math.abs(Math.cos(t / 700 + p.x * 1.7 + p.y)), dim = !op.ready && !act; ctx.save(); ctx.globalAlpha = dim ? 0.45 : 1; ctx.fillStyle = op.order === 'conceal' ? '#73b8ff' : '#ffb82e'; ctx.strokeStyle = '#0b0e13'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mk[0] - w * c, mk[1] - hh); ctx.lineTo(mk[0] + w * c, mk[1] - hh); ctx.lineTo(mk[0], mk[1]); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); } } // marcador de orden (▼ giratorio)
        const top = P(p.x, p.y, 2.05); const base = P(p.x, p.y, 0.4);
        if (top && base) {
          const idx = s.ops.filter(z => z.p === op.p).indexOf(op) + 1; const fs = Math.max(11, Math.min(20, V.F * 0.5 / top[2]));
          const nm0 = String((V.nameOf && V.nameOf(op.i)) || op.role || '').replace(/\s+/g, ' '), lim = V.W < 520 ? 13 : 20, nm = nm0.length > lim ? nm0.slice(0, lim - 1) + '…' : nm0, lab = nm ? idx + ' · ' + nm : String(idx);
          ctx.font = `800 ${fs}px system-ui`; const w = Math.max(Math.max(26, V.F * 1.5 / top[2]), ctx.measureText(lab).width + 8); const hbar = Math.max(4, fs * .32);
          ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(top[0] - w / 2, top[1] - hbar - fs - 2, w, hbar + fs + 4);
          ctx.fillStyle = '#fff'; ctx.font = `800 ${fs}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(lab, top[0], top[1] - hbar - 4);
          ctx.fillStyle = '#222b38'; ctx.fillRect(top[0] - w / 2 + 2, top[1] - hbar, w - 4, hbar - 2);
          ctx.fillStyle = op.w / op.W > .5 ? '#38d27a' : '#ff4d5e'; ctx.fillRect(top[0] - w / 2 + 2, top[1] - hbar, (w - 4) * op.w / op.W, hbar - 2);
          /* fichas de operativo: solo en su carta */
          if (U.targets && U.targets.has(op.i)) { ctx.fillStyle = '#000b'; ctx.fillRect(top[0] - 24, top[1] - hbar - fs - 24, 48, 18); ctx.fillStyle = '#ff9aa4'; ctx.font = '700 12px system-ui'; ctx.fillText('≈' + U.targets.get(op.i).toFixed(1), top[0], top[1] - hbar - fs - 10); }
        }
        const c = P(p.x, p.y, 0.9); if (c) V.pawns.push({ i: op.i, sx: c[0], sy: c[1], zc: c[2], r: Math.max(16, V.F * 0.95 / c[2]) });
      });
    }
    items.sort((a, b) => b.zc - a.zc); for (const it of items) it.fn();
    ctx.textAlign = 'start';
  };
  return V;
}
