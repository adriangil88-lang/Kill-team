// Self-learning AI: linear state-value V(s)=sigmoid(w·f(s)) trained by self-play (logistic TD / Monte-Carlo targets).
import * as E from './engine.js';
const hasKw = (o, k) => !!(o.kw && o.kw.includes(k));

export const FEATURES = ['bias', 'wounds', 'alive', 'vp', 'objCtl', 'objDist', 'exposure', 'firepower', 'cover', 'melee', 'cp', 'tempo', 'hold', 'stage', 'tacProg'];
export const DEFAULT_W = [0, 3.0, 1.6, 2.2, 1.6, -1.4, -0.9, 0.9, 0.4, 0.5, 0.15, 0.3, 0.5, 0.3, 1.0];

export function features(s, p) {
  const q = 1 - p; const f = new Array(FEATURES.length).fill(0);
  const mine = s.ops.filter(o => o.p === p), theirs = s.ops.filter(o => o.p !== p);
  const wTot = a => a.reduce((x, o) => x + (o.alive ? o.w : 0), 0), wMax = a => a.reduce((x, o) => x + o.W, 0) || 1;
  const am = mine.filter(o => o.alive), at = theirs.filter(o => o.alive);
  f[0] = 1;
  f[1] = wTot(mine) / wMax(mine) - wTot(theirs) / wMax(theirs);
  f[2] = (am.length / (mine.length || 1)) - (at.length / (theirs.length || 1));
  f[3] = (s.vp[p] - (s.np > 2 ? Math.max(...s.vp.filter((_, i) => i !== p)) : s.vp[q])) / 6;
  const ctl = E.objControl(s);
  f[4] = (ctl.filter(c => c === p).length - ctl.filter(c => c >= 0 && c !== p).length) / Math.max(1, s.objs.length);
  // distance of my ops to nearest objective not controlled by me
  let dsum = 0;
  for (const o of am) { let best = 40; s.objs.forEach((ob, i) => { if (ctl[i] !== p) best = Math.min(best, E.D(o, ob)); }); dsum += best; }
  f[5] = am.length ? dsum / am.length / 30 : 1;
  // exposure / firepower / cover
  let exp = 0, fire = 0, cov = 0, cnt = 0, hold = 0, stg = 0;
  for (const o of am) {
    let e = 0, dmin = 99; for (const t of at) { const d = E.D(o, t); if (d < dmin) dmin = d; if (d < 14 && E.los(s, t, o)) { e += E.inCover(s, t, o) ? 0.5 : 1; } }
    if (e === 0 && dmin >= 6 && dmin < 14) stg++; // a la espera: fuera de su vista pero a distancia de golpe en el turno siguiente
    s.objs.forEach((ob, i) => { if (ctl[i] === p && E.D(o, ob) <= 3) hold++; }); // defensa: agente sobre un objetivo que controlo
    exp += e; cnt++;
    let any = false; for (const t of at) if (E.D(o, t) < 14 && E.los(s, o, t)) { fire++; any = true; }
    if (E.inCover(s, at[0] || o, o) || s.terrain.some(r => r.t === 'cover' && E.D(o, { x: Math.max(r.x, Math.min(o.x, r.x + r.w)), y: Math.max(r.y, Math.min(o.y, r.y + r.h)) }) < 1.2)) cov++;
  }
  f[14] = s.aop ? Math.min(1.5, tacProgress(s, p) / 2) : 0; // progreso hacia los PV de la operación táctica propia
  f[12] = cnt ? Math.min(1, hold / cnt) : 0; f[13] = cnt ? stg / cnt : 0;
  f[6] = cnt ? exp / cnt / 3 : 0; f[7] = cnt ? fire / cnt / 3 : 0; f[8] = cnt ? cov / cnt : 0;
  // melee advantage among engaged ops
  let ma = 0; for (const o of am) if (E.engaged(s, o)) { const bw = o.weapons.filter(w => w.m).reduce((x, w) => Math.max(x, w.atk * w.d), 0); ma += bw * o.w / (o.W * 12); }
  for (const o of at) if (E.engaged(s, o)) { const bw = o.weapons.filter(w => w.m).reduce((x, w) => Math.max(x, w.atk * w.d), 0); ma -= bw * o.w / (o.W * 12); }
  f[9] = ma / 3;
  f[10] = (s.cp[p] - (s.np > 2 ? Math.max(...s.cp.filter((_, i) => i !== p)) : s.cp[q])) / 4;
  f[11] = (mine.filter(o => o.alive && o.ready).length - theirs.filter(o => o.alive && o.ready).length) / 6;
  return f;
}
const sig = x => 1 / (1 + Math.exp(-x));

/* ---------- decisiones OPCIONALES aprendidas ----------
   Toda decisión que el reglamento deja como opcional (usar o no una acción de misión, un ardid, una acción gratuita...) pasa por optTake():
   sesgo aprendido por clave (logit) + muestreo (nivel difícil: determinista salvo exploración). Los sesgos se entrenan por autojuego (optLearn)
   con un gradiente de política: si se tomó y se ganó, sube; si se tomó y se perdió, baja (y al revés al no tomarla). `prior` = comportamiento de partida. */
export const OPT = {};
export function optSet(o) { for (const k of Object.keys(OPT)) delete OPT[k]; if (o) Object.assign(OPT, o); }
let optLog = [[], []], isAIfn = null, optLevel = 'medium', fam = 'g';
const famOf = s => s.nj ? 'nj' : s.ty ? 'ty' : s.dv ? 'dv' : s.twp >= 7 ? 'sh' : s.twp ? 'tw' : s.vcm ? 'vc' : s.ao ? 'ao' : s.jm ? 'jm' : s.vkp ? 'vk' : 'g';
const gv = (k, d) => OPT[fam + '|' + k] != null ? OPT[fam + '|' + k] : OPT[k] != null ? OPT[k] : d; // parámetro aprendido: el de esta familia de mapa, o el general, o el inicial
export function setIsAI(f) { isAIfn = f; }
export function optReset() { optLog = [[], []]; bonCnt = [{}, {}]; }
export function optTake(s, p, key, prior = 0, gain = 0) {
  const z = gv(key, prior) + gain, pr = sig(z);
  const take = optLevel === 'hard' ? (Math.random() < 0.04 ? Math.random() < 0.5 : z > 0) : Math.random() < pr;
  if (optLog[p] && optLog[p].length < 400) optLog[p].push({ key: fam + '|' + key, base: key, take, pr, prior });
  return take;
}

/* Elecciones entre varias opciones: la heurística de antes ordena las opciones (la suya = posición 0) y el autoaprendizaje decide qué posición tomar
   (softmax con sesgos aprendidos por etapa y posición; el prior favorece la heurística). Se entrena con el mismo gradiente de política que optTake. */
/* Decisiones opcionales preguntadas por el motor (ask): la IA elige por autoaprendizaje; la opción por defecto es la heurística (prior) y las demás se exploran. */
export function askChoice(s, p, key, opts, def) {
  if (!s.ask) return undefined; const stage = 'ask:' + String(key).split(':')[0];
  const R = [opts.find(o => o.v === def) || opts[0], ...opts.filter(o => o.v !== (opts.find(o2 => o2.v === def) || opts[0]).v)];
  return R[optRank(s, p, stage, R.length)].v;
}
export function optRank(s, p, stage, n) {
  if (n <= 1) return 0;
  const lg = [], keys = []; for (let r = 0; r < n; r++) { const k = 'r:' + stage + ':' + r; keys.push(fam + '|' + k); lg.push(gv(k, r === 0 ? 2.5 : -0.6 * r)); }
  const mx = Math.max(...lg), ex = lg.map(z => Math.exp(z - mx)), sm = ex.reduce((x, y) => x + y, 0), pr = ex.map(x => x / sm);
  let c = 0;
  if (optLevel === 'hard' && Math.random() >= 0.04) c = pr.indexOf(Math.max(...pr));
  else { let u = Math.random(), acc = 0; c = n - 1; for (let r = 0; r < n; r++) { acc += pr[r]; if (u < acc) { c = r; break; } } }
  if (optLog[p] && optLog[p].length < 400) optLog[p].push({ multi: true, keys, pr, c, lg });
  return c;
}
const VOC = { pprim: () => ['kill', 'crit', 'tac'], mark: () => ['khorne', 'tzeentch'], mtac: () => ['engage', 'conceal'], pat: (s, pd) => { const c = s.ops[pd.op].pat || []; return ['agr', 'vel', 'def'].filter(x => !c.includes(x)); }, ct: (s, pd) => { const have = s.ct[pd.p]; return ['sharpshooter', 'hardy', 'stealthy', 'aggressive', 'mobile', 'dueller', 'resolute', 'siege'].filter(k => !have.includes(k)); } };
function optChoice(s, c) { // c: acción elegida por la heurística; devuelve la acción final tras el selector aprendido
  const pd = s.pend; if (!c || !pd) return c;
  if (pd.kind === 'pprim' && c.t === 'pprim') { const L = VOC.pprim(); return mkRank(s, pd.p, 'pprim', L, c.v, v => ({ ...c, v })); }
  if (pd.kind === 'quarry' && c.t === 'quarry' && Array.isArray(pd.ops) && pd.ops.includes(c.tg)) return mkRank(s, pd.p, 'quarry', pd.ops, c.tg, v => ({ ...c, tg: v }));
  if (pd.kind === 'dply' && c.t === 'dply' && Array.isArray(pd.ops) && pd.ops.includes(c.op)) return mkRank(s, pd.p, 'dply', pd.ops, c.op, v => ({ ...c, op: v }));
  if (pd.kind !== 'imp' || c.t !== pd.stage || c.v === undefined || c.k !== undefined || c.al !== undefined || c.ord !== undefined) return c;
  if (['gam', 'syn', 'plc', 'gch', 'imp', 'ccs', 'ord'].includes(pd.stage)) return c;
  let L = Array.isArray(pd.ops) && pd.ops.length ? pd.ops : (VOC[pd.stage] ? VOC[pd.stage](s, pd) : null);
  if (!L || !L.includes(c.v)) return c;
  return mkRank(s, pd.p, pd.stage, L, c.v, v => ({ ...c, v }));
}
function mkRank(s, p, stage, L, heur, build) { const R = [heur, ...L.filter(x => x !== heur)]; return build(R[optRank(s, p, stage, R.length)]); }

/* Bonos de valoración (antes constantes fijas): ahora son parámetros aprendidos. Cada partida refuerza los tipos de acción elegidos si se ganó y los debilita si se perdió (respecto a su cuota media). */
const BON0 = { shoot: 0.025, fight: 0.04, signal: 0.004, sac: 0.004, ga: -0.03, lunge: 0.01, tacmv: 0.03, retreat: 0.0, threat: 0.0 };
export const mulT = k => Math.exp(gv('m:' + k, 0));
export const bon = k => gv('b:' + k, BON0[k] || 0);
let bonCnt = [{}, {}];
function bonPick(p, k) { if (bonCnt[p]) bonCnt[p][k] = (bonCnt[p][k] || 0) + 1; }
function bonLearn(p, outcome, lr) {
  const c = bonCnt[p] || {}, N = Object.values(c).reduce((x, y) => x + y, 0); if (N < 4) { bonCnt[p] = {}; return; }
  for (const k of Object.keys(c)) { if (!k.startsWith('m:')) continue; const sh = c[k] / N, bs = gv('s:' + k, sh); OPT[fam + '|s:' + k] = bs * 0.9 + sh * 0.1; OPT[fam + '|' + k] = Math.max(-1.5, Math.min(1.5, gv(k, 0) + lr * (outcome - 0.5) * 2 * (sh - bs) * 10)); }
  for (const k of Object.keys(BON0)) { const sh = (c[k] || 0) / N, bs = gv('s:' + k, sh); OPT[fam + '|s:' + k] = bs * 0.9 + sh * 0.1; const b = bon(k); OPT[fam + '|b:' + k] = Math.max(-0.12, Math.min(0.25, b + lr * (outcome - 0.5) * 0.25 * (sh - bs))); }
  bonCnt[p] = {};
}
export function optPloy(s, p, id, pol) { // ardides que el motor usa automáticamente: la política fija (umbral de PC) pasa a ser solo el punto de partida
  if (!isAIfn || !isAIfn(s, p)) return null;
  return optTake(s, p, 'fp:' + id, s.cp[p] >= pol ? 2 : -2);
}
export function optLearn(p, outcome, lr = 0.06) {
  for (const e of optLog[p] || []) { if (e.multi) { for (let r = 0; r < e.keys.length; r++) { const k = e.keys[r], b = OPT[k] != null ? OPT[k] : e.lg[r]; OPT[k] = Math.max(-6, Math.min(6, b + lr * (outcome - 0.5) * 4 * ((r === e.c ? 1 : 0) - e.pr[r]))); } continue; } const k = e.key; const b = OPT[k] != null ? OPT[k] : (OPT[e.base] != null ? OPT[e.base] : e.prior); OPT[k] = Math.max(-6, Math.min(6, b + lr * (outcome - 0.5) * 4 * ((e.take ? 1 : 0) - e.pr))); }
  optLog[p] = []; bonLearn(p, outcome, lr);
}
export function value(f, w) { let z = 0; for (let i = 0; i < f.length; i++) z += f[i] * w[i]; return sig(z); }

/* ---------- candidate generation ---------- */
function nearestRect(o) { return o; }
function moveCandidates(s, o, kind, p) {
  const R = E.reach(s, o, E.moveAllow(s, o, kind), kind); if (!R.cells.length) return [];
  const foes = s.ops.filter(e => e.alive && e.p !== o.p);
  const out = new Map(); const add = k => { if (k != null) out.set(k, 1); };
  const best = (fn, n = 1) => { let arr = R.cells.map(k => [fn(R.cellXY(k)), k]).sort((a, b) => a[0] - b[0]); for (let i = 0; i < Math.min(n, arr.length); i++) add(arr[i][1]); };
  if (kind === 'chg') {
    for (const e of foes) best(c => E.D(c, e) + (E.D(c, e) < 1.3 ? 9 : 0), 1);
  } else {
    if (s.twp && o.p === 0) for (const pt of E.twGoals(s, o)) { if (s.twp >= 7) { const F = aoField(s, pt); best(c => F(c), 2); } else best(c => E.D(c, pt), 2); }
    if (s.ao >= 2 && o.p < 2) { const g = aoGoal(s, o); if (g) { const F = aoField(s, g); best(c => F(c), 2); } }
    if (s.jm === 3 && o.p === 0) best(c => (s.dep.ax === 'x' ? E.BW - c.x : E.BH - c.y), 3); // Huida: hacia el borde de los ANJ
    const ctl = E.objControl(s);
    s.objs.forEach((ob, i) => { if (ctl[i] !== o.p) best(c => E.D(c, ob), 1); });
    best(c => { let m = 99; foes.forEach(e => { m = Math.min(m, E.D(c, e)); }); return Math.abs(m - 9); }, 2);
    if (kind !== 'chg' && foes.length && (o.w < o.W || foes.some(e => E.D(e, o) < 14))) { best(c => -retreatScore(s, o, c), 2); best(c => { let m = 99; foes.forEach(e => { m = Math.min(m, E.D(c, e)); }); return -m; }, 1); } // retirada: fuera de su vista / lejos
    s.objs.forEach((ob, i) => { if (ctl[i] === o.p && foes.length) { const fe = foes.slice().sort((x, y) => E.D(x, ob) - E.D(y, ob))[0]; best(c => E.D(c, ob) + (E.D(c, ob) > 3 ? 4 : 0), 1); if (E.D(fe, ob) < 14) best(c => E.D(c, ob) * 0.6 + E.D(c, { x: (ob.x * 2 + fe.x) / 3, y: (ob.y * 2 + fe.y) / 3 }) * 0.4, 1); } }); // defensa de objetivos propios: mantenerse y cerrar el paso
    if (foes.length) best(c => { let m = 99, seen = 0; foes.forEach(e => { m = Math.min(m, E.D(c, e)); if (E.D(c, e) < 16 && E.los(s, e, c.z != null ? { ...c, i: -1 } : c)) seen++; }); return seen * 5 + Math.abs(m - 10); }, 2); // posicionarse oculto a distancia de golpe para el turno siguiente
    best(c => { let m = 99; foes.forEach(e => { if (E.los(s, c.z != null ? { ...c, i: -1 } : c, e)) m = Math.min(m, E.D(c, e)); }); return m === 99 ? 50 : Math.abs(m - 7); }, 2); // buscar línea de visión para disparar
    best(c => { let d = 99; for (const r of s.terrain) { const cx = Math.max(r.x, Math.min(c.x, r.x + r.w)), cy = Math.max(r.y, Math.min(c.y, r.y + r.h)); d = Math.min(d, Math.hypot(c.x - cx, c.y - cy)); } return d + Math.random() * 0.4; }, 3);
    for (let i = 0; i < 3; i++) add(R.cells[Math.floor(Math.random() * R.cells.length)]);
    if (R.N && R.cells.some(k => k >= R.N)) best(c => -(c.z || 0) * 2 + E.D(c, o) * 0.3, 1); // subir a terreno Vantage
    if (s.aop) { // operaciones tácticas: acercarse a donde puntúan
      const t = s.tac[o.p], ax = s.dep.ax, L = ax === 'x' ? E.BW : E.BH, W2 = ax === 'x' ? E.BH : E.BW;
      const enemyPt = (fr) => { const v = o.p === 0 ? L * fr : L * (1 - fr); return ax === 'x' ? { x: v, y: W2 / 2 } : { x: W2 / 2, y: v }; };
      if ((t === 'banner' && !s.bannerDone[o.p]) || (t === 'envoy' && s.envoy[o.p] === o.i)) best(c => E.D(c, enemyPt(0.68)), 1);
      if (t === 'flank') { best(c => E.D(c, { ...enemyPt(0.65), [ax === 'x' ? 'y' : 'x']: W2 * 0.22 }), 1); best(c => E.D(c, { ...enemyPt(0.65), [ax === 'x' ? 'y' : 'x']: W2 * 0.78 }), 1); }
      if (t === 'devices' || t === 'sweep' || t === 'retrieval') s.objs.forEach((ob, i) => { if (E.objRole(s, i) !== o.p) best(c => E.D(c, ob), 1); });
      if (t === 'rout') best(c => E.D(c, enemyPt(0.82)), 1);
      if (t === 'dominate') for (const e of foes) best(c => E.D(c, e), 1);
      if (t === 'martyrs') s.objs.forEach((ob, i) => { if (ctl[i] !== o.p) best(c => E.D(c, ob), 1); });
      if (t === 'intel' || t === 'retrieval') for (const m of s.mm) if (m.c < 0 && m.p === o.p) best(c => E.D(c, m), 1);
    }
  }
  const res = [...out.keys()].map(k => { const c = R.cellXY(k); return { t: 'mv', k: kind, x: c.x, y: c.y, z: c.z || 0 }; });
  if (s.fx && s.team[o.p] === 'murderwing' && ['rep', 'fb', 'chg'].includes(kind) && !(s.act && s.act.react)) { // Mochila de salto: candidatos con IMPULSO
    let R2 = null; s.mwJ = true; try { R2 = E.reach(s, o, E.moveAllow(s, o, kind), kind); } catch (err) { R2 = null; } finally { s.mwJ = false; }
    if (R2 && R2.cells.length) { const o2 = new Map(); const b2 = (fn, n = 1) => { const arr = R2.cells.map(k => [fn(R2.cellXY(k)), k]).sort((x, y) => x[0] - y[0]); for (let i = 0; i < Math.min(n, arr.length); i++) o2.set(arr[i][1], 1); };
      if (kind === 'chg') { for (const e of foes) b2(c => E.D(c, e) + (E.D(c, e) < 1.3 ? 9 : 0), 1); } else { const ctl = E.objControl(s); s.objs.forEach((ob, i) => { if (ctl[i] !== o.p) b2(c => E.D(c, ob), 1); }); b2(c => { let m = 99; foes.forEach(e => { m = Math.min(m, E.D(c, e)); }); return Math.abs(m - 8); }, 2); }
      for (const k of o2.keys()) { const c = R2.cellXY(k); res.push({ t: 'mv', k: kind, x: c.x, y: c.y, z: c.z || 0, jmp: true }); } }
  }
  return res;
}
const hasMelee = o => o.weapons.some(w => w.m && w.atk >= 4);
const inspFree = (s, o) => E.inspCost(s, o) === 0 || E.fpWant(s, o.p, 'insp');
function tacGoal(s, o) { // punto objetivo de la op. táctica para este agente (Estandarte: el agente más adelantado; Enviado: el enviado)
  const t = s.tac[o.p], ax = s.dep.ax, L = ax === 'x' ? E.BW : E.BH, W2 = ax === 'x' ? E.BH : E.BW;
  const pt = fr => { const v = o.p === 0 ? L * fr : L * (1 - fr); return ax === 'x' ? { x: v, y: W2 / 2 } : { x: W2 / 2, y: v }; };
  if (t === 'banner' && !s.bannerDone[o.p]) { const adv = q => ax === 'x' ? (o.p === 0 ? q.x : -q.x) : (o.p === 0 ? q.y : -q.y); const lead = s.ops.filter(q => q.alive && q.p === o.p && !q.ug).sort((u, w) => adv(w) - adv(u))[0]; return lead === o ? pt(0.68) : null; }
  if (t === 'envoy' && s.envoy[o.p] === o.i) return pt(0.68);
  return null;
}
export function candidates(s) {
  const a = s.act; const o = s.ops[a.op]; const acts = E.opActions(s); const out = [];
  for (const k of acts) {
    if (k === 'shoot') {
      const pairs = [];
      for (const t of s.ops) for (let wi = 0; wi < o.weapons.length; wi++) { const w = o.weapons[wi]; if (!w.m && E.targetable(s, o, w, t)) pairs.push({ t: 'shoot', tg: t.i, wi, ev: E.expectedShoot(s, o, w, t) + (t.w <= 4 ? 1 : 0) - (/^wreathe in fire/i.test(w.n || '') ? 4 * s.ops.filter(f => f.alive && f !== o && f.p === o.p && !f.ug && Math.hypot(o.x - f.x, o.y - f.y) - 2 * E.RAD <= (w.rules.blast || 1)).length : 0) }); /* Envuelto: el Blast alcanza a los amigos cercanos */ }
      pairs.sort((x, y) => y.ev - x.ev); out.push(...pairs.slice(0, 5));
    } else if (k === 'spr') { // Esprintar (MOUNTED): planes de uno o dos tramos con pivotes
      const foes = s.ops.filter(e => e.alive && e.p !== o.p && !e.ug); const ctl = E.objControl(s); const goals = s.objs.filter((ob, i) => ctl[i] !== o.p);
      const cand = []; const fa0 = o.fa || 0; const pvs = [-45, -22, 0, 22, 45];
      const tryPlan = pl => { const r = E.sprRun(s, o, pl, 1); if (r.ok) cand.push({ pl, r }); };
      for (const pv of pvs) for (const d of [3, 4, 5, 7, 9]) tryPlan({ legs: [{ pv, d }], fin: 0 });
      for (const pv of pvs) for (const pv2 of [-45, 0, 45]) for (const d of [4, 6]) tryPlan({ legs: [{ pv, d }, { pv: pv2, d: 3 }], fin: 0 });
      for (const d of [1, 2, 3]) tryPlan({ legs: [{ pv: 0, d: -d }], fin: 0 });
      const pick = new Map(); const best = (fn, n = 1) => { const arr = cand.map(c => [fn(c), c]).sort((x, y) => x[0] - y[0]); for (let i = 0; i < Math.min(n, arr.length); i++) pick.set(arr[i][1], 1); };
      for (const g of goals) best(c => E.D(c.r, g), 1);
      for (const e of foes) best(c => (c.r.cz ? -5 : 0) + E.D(c.r, e), 1);
      best(c => { let m = 99; foes.forEach(e => { m = Math.min(m, E.D(c.r, e)); }); return Math.abs(m - 8); }, 2); for (let i = 0; i < 2 && cand.length; i++) pick.set(cand[Math.floor(Math.random() * cand.length)], 1);
      for (const c of pick.keys()) { const fe = foes.sort((x, y) => E.D(c.r, x) - E.D(c.r, y))[0]; let fin = 0; if (fe) { const ang = Math.atan2(fe.y - c.r.y, fe.x - c.r.x) - c.r.fa; let dg = ((ang * 180 / Math.PI + 540) % 360) - 180; fin = Math.max(-45, Math.min(45, Math.round(dg))); } out.push({ t: 'spr', plan: { legs: c.pl.legs, fin } }); }
    } else if (k === 'turn') {
      const fe = s.ops.filter(e => e.alive && e.p !== o.p && !e.ug).sort((x, y) => E.D(o, x) - E.D(o, y))[0]; if (fe) { const ang = Math.atan2(fe.y - o.y, fe.x - o.x) - (o.fa || 0); const dg = ((ang * 180 / Math.PI + 540) % 360) - 180; const d = Math.max(-45, Math.min(45, Math.round(dg))); if (Math.abs(d) >= 5) out.push({ t: 'turn', deg: d }); }
    } else if (k === 'guard') {
      if (s.ops.some(e => e.alive && e.p !== o.p && E.D(o, e) < 16)) out.push({ t: 'ga' });
    } else if (k === 'tac') {
      for (const c of E.tacActs(s, o)) if (!o.did['tac_' + c.v]) out.push(c);
    } else if (k === 'pick') {
      for (const j of E.pickTargets(s, o)) if (!(s.mm[j].k === 'beacon' && s.mm[j].p === o.p)) out.push({ t: 'pick', mk: j });
    } else if (k === 'send') {
      out.push({ t: 'send' });
    } else if (k === 'mission') {
      out.push({ t: 'mission' });
    } else if (k === 'hfight') {
      for (const x of E.hfightTargets(s, o)) o.weapons.forEach((w, wi) => { if (w.m) out.push({ t: 'hfight', tg: x.tg, wi }); });
    } else if (k === 'hmv') {
      /* la IA no usa el movimiento restante tras Operar portillo */
    } else if (k === 'hatch') {
      for (const h of E.hatchTargets(s, o)) if (!h.open) out.push({ t: 'hatch', h: h.pi }); /* la IA solo abre portillos */
    } else if (k === 'vc' || k === 'shext' || k === 'shpick' || k === 'tydrone' || k === 'ty' || k === 'tybomb' || k === 'dvtun' || k === 'dvscan' || k === 'dvsearch' || k === 'dvbcn') { /* acciones de misión propias (Volkus Compound, Shadowhunt): se eligen aparte, no son movimientos */
    } else if (k === 'scout') { out.push({ t: 'scout' });
    } else if (k === 'breach') {
      if (E.breachTargets(s, o).length) out.push({ t: 'breach' }); /* Tomb World: la IA abre brechas */
    } else if (k === 'tele') {
      for (const kk of E.teleOpts(s, o)) out.push({ t: 'tele', k: kk }); /* Tomb World: la IA usa los teletransportes */
    } else if (k === 'burrow') {
      if (o.ug) {
        const R = E.burrowReach(s, o); const foes = s.ops.filter(e => e.alive && !e.ug && e.p !== o.p);
        const sc = R.cells.map(c => { const q = R.cellXY(c); let m = 99; foes.forEach(e => { m = Math.min(m, E.D(q, e)); }); return [Math.abs(m - 1.8), c]; }).sort((a, b) => a[0] - b[0]);
        for (const [, c] of sc.slice(0, 3)) { const q = R.cellXY(c); out.push({ t: 'mv', k: 'burrow', x: q.x, y: q.y }); }
      } else if (s.ops.some(e => e.alive && !e.ug && e.p !== o.p && E.D(o, e) < 6) === false || o.w < o.W / 2) out.push({ t: 'burrow' });
    } else if (k === 'ccicon') { for (const v of ['inv', 'det']) out.push({ t: 'ccicon', v });
    } else if (k === 'ccabhor' || k === 'ccunleash') { /* PE: lo gasta el pend de ardides; se omite en candidatos */
    } else if (k === 'ccslay' || k === 'ccurge' || k === 'ccdelug' || k === 'ccvort') { for (const gi of E.wcTargets(s, o, k)) out.push({ t: k, tg: gi });
    } else if (k === 'cimentor' || k === 'cispeak') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.w - x.w)[0]; if (g) out.push({ t: k, tg: g.i }); /* Spiritual Mentor / Speak of Her Deeds */
    } else if (k === 'spload') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.w - x.w)[0]; if (g) out.push({ t: k, tg: g.i }); /* Load Weapon */
    } else if (k === 'bdimp') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.w - x.w)[0]; if (g) { const op = E.bdImpOpts(s, g); out.push({ t: k, tg: g.i, how: op.includes('fight') ? 'fight' : op.includes('shoot') ? 'shoot' : op[0] }); }
    } else if (k === 'gmspray') { if (E.wcTargets(s, o, k).length) { const sv = o.order; o.order = 'engage'; const can = o.weapons.some(w => !w.m && s.ops.some(e => e.alive && e.p !== o.p && !e.ug && E.targetable(s, o, w, e))); o.order = sv; out.push({ t: k, first: can ? 'shoot' : 'run' }); }
    } else if (k === 'edsow') { const tg = E.wcTargets(s, o, k); if (tg.length) out.push({ t: k, ob: tg[0] });
    } else if (k === 'edmoon') { const tg = E.wcTargets(s, o, k); if (tg.length) out.push({ t: k, d: tg[0] });
    } else if (k === 'edspir') { if (E.injured(o) && s.cp[o.p] >= 1) out.push({ t: k });
    } else if (k === 'edwail') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.w - x.w)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'exord') { /* la IA mantiene sus patrones */
    } else if (k === 'cuid') { const t = E.wcTargets(s, o, k); if (t.length) out.push({ t: k, po: t[0], order: 'engage' });
    } else if (k === 'swapop') { /* lo decide chooseAction al terminar */
    } else if (k === 'phscan') { if (E.wcTargets(s, o, k).length && s.ops.some(e => e.alive && e.p !== o.p && !e.ug && Math.hypot(o.x - e.x, o.y - e.y) < 20)) out.push({ t: k });
    } else if (k === 'exavi') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.w - x.w)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'bdstimm') { for (const fi of E.wcTargets(s, o, k)) { const f = s.ops[fi]; const rs = ['rej', 'enr', 'fort'].filter(r => !(f.stDone || []).includes(r)); const lost = f.W - f.w; const r = lost >= 4 && rs.includes('rej') ? 'rej' : f.weapons.some(w => w.m) && rs.includes('enr') ? 'enr' : rs.includes('fort') ? 'fort' : rs[0]; if (r) out.push({ t: k, tg: fi, rule: r }); }
    } else if (k === 'bdmom') { if (s.act.ap <= 1 && E.wcTargets(s, o, k).length) out.push({ t: k });
    } else if (k === 'bdcall') { /* la IA no lo usa */
    } else if (k === 'exbrut') { for (const ei of E.wcTargets(s, o, k)) { const e = s.ops[ei]; const hs = s.ops.filter(h => h.alive && h.p === o.p && h !== o && !h.ug && E.inCZ(s, h, e)); for (const h of hs) { const wi = h.weapons.findIndex(w => w.m); if (wi >= 0) out.push({ t: k, tg: ei, h: h.i, wi }); } }
    } else if (k === 'exnun') { const m = s.exNun && s.exNun[o.p]; if (E.wcTargets(s, o, k).length && (!m || Math.hypot(m.x - o.x, m.y - o.y) > 1.5)) out.push({ t: k });
    } else if (k === 'exsig') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.apl - x.apl)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'exopt') { if (E.wcTargets(s, o, k).length && s.ops.some(e => e.alive && e.p !== o.p && !e.ug && Math.hypot(o.x - e.x, o.y - e.y) < 24)) out.push({ t: k });
    } else if (k === 'exapr') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.w - x.w)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'exver') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.w - x.w)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'cinull') { if (E.wcTargets(s, o, k).length && s.ops.some(e => e.alive && e.p !== o.p && !e.ug && Math.hypot(o.x - e.x, o.y - e.y) <= ((o.nullR || 1) + 4))) out.push({ t: k });
    } else if (k === 'xvfoc') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.w - x.w)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'cncran') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.apl - x.apl)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'cnover') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).filter(e => e.ready).sort((x, y) => y.apl - x.apl)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'cnscar') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => (y.W - y.w) - (x.W - x.w))[0]; if (g && g.W - g.w >= 3) out.push({ t: k, tg: g.i });
    } else if (k === 'cnctl') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).filter(e => s.ops.some(f => f.alive && f.p !== e.p && !f.ug && Math.hypot(e.x - f.x, e.y - f.y) < 9)).sort((x, y) => y.w - x.w)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'cndist') { const c = E.cnDistCands(s, o)[0]; if (c && c.v >= 1.5) out.push({ t: k, tg: 0 });
    } else if (k === 'xvjam') { const g = E.wcTargets(s, o, k).map(i => s.ops[i]).sort((x, y) => y.apl - x.apl)[0]; if (g) out.push({ t: k, tg: g.i });
    } else if (k === 'bctrans' || k === 'bcmotem' || k === 'bcmoteh') { if (E.wcTargets(s, o, k).length) out.push({ t: k });
    } else if (k === 'bcnov') { for (const gi of E.wcTargets(s, o, k).slice(0, 3)) { out.push({ t: k, tg: gi, mode: 'dash' }); out.push({ t: k, tg: gi, mode: 'engage' }); }
    } else if (k === 'bcgaze' || k === 'bcomni' || k === 'bcdata' || k === 'bcbreach') { for (const gi of E.wcTargets(s, o, k).slice(0, 4)) out.push({ t: k, tg: gi });
    } else if (k === 'sforb') { const g = E.wcTargets(s, o, k); if (g.length) out.push({ t: k, tg: g[0] });
    } else if (k === 'phheal' || k === 'exheal' || k === 'spheal' || k === 'wsheal' || k === 'edwind' || k === 'edclean' || k === 'mwstrike' || k === 'mwslice' || k === 'mwsnatch' || k === 'mwshriek' || k === 'mwclaw' || k === 'mwvox' || k === 'mwcarve' || k === 'spiss' || k === 'spcam') { for (const gi of E.wcTargets(s, o, k)) out.push({ t: k, tg: gi });
    } else if (k === 'gmtrans') { for (const gi of E.wcTargets(s, o, k)) out.push({ t: k, tg: gi });
    } else if (k === 'gmfuel') { out.push({ t: k, tg: o.i });
    } else if (k === 'gvrej' || k === 'gvman' || k === 'gvfur' || k === 'gvrake' || k === 'gvsrg' || k === 'gvrag') { out.push({ t: k, tg: o.i });
    } else if (k === 'wscall') { const tg = E.wcTargets(s, o, k).filter(i => i !== o.i); if (tg.length && !s.ops[tg[0]].wsObs) out.push({ t: k, opt: 'obs', tg: tg[0] }); else if (E.wcTargets(s, o, k).length) out.push({ t: k, opt: 'mv', tg: o.i }); /* Call the Storm */
    } else if (k === 'wshs') { if (E.wcTargets(s, o, k).length) out.push({ t: k, opt: 'sev' }); /* Hunter's Senses */
    } else if (k === 'bdsac' || k === 'spdodge' || k === 'phguer' || k === 'spsilent' || k === 'mwwings' || k === 'bbjam' || k === 'sapexp' || k === 'gong' || k === 'mantle' || k === 'sweep' || k === 'uncomp' || k === 'knux' || k === 'sjam' || k === 'spot' || k === 'pss' || k === 'ugren' || k === 'appraise' || k === 'ravage' || k === 'tflux' || k === 'pare' || k === 'weave' || k === 'photon' || k === 'dun' || k === 'fate' || k === 'alight' || k === 'recon' || k === 'fury' || k === 'sfinc' || k === 'rejuv' || k === 'torment' || k === 'hamark' || k === 'mindc' || k === 'assas' || k === 'soul' || k === 'ghook' || k === 'tacmd' || k === 'kscan' || k === 'ward' || k === 'schan' || k === 'sheal2' || k === 'lfing' || k === 'capfl' || k === 'fkord' || k === 'gather' || k === 'sqguide' || k === 'trackE' || k === 'auspex' || k === 'optics' || k === 'astr' || k === 'rawph' || k === 'covert' || k === 'flail' || k === 'miasma' || k === 'pvital' || k === 'virpois' || k === 'icmd' || k === 'tspl' || k === 'ctnm' || k === 'chrm' || k === 'harb' || k === 'nshr' || k === 'vmad' || k === 'augw' || k === 'reinf' || k === 'crep' || k === 'accel' || k === 'rean1' || k === 'rean2' || k === 'mdv' || k === 'dimamb' || k === 'stlth' || k === 'mhunt' || k === 'fkeye' || k === 'energ' || k === 'lsight' || k === 'slip' || k === 'poach' || k === 'tassn' || k === 'cvchg' || k === 'cvfld' || k === 'hserum' || k === 'gend' || k === 'bwind' || k === 'sfall' || k === 'fadel' || k === 'raise' || k === 'rhet' || k === 'bcast' || k === 'chir' || k === 'whip' || k === 'exemp' || k === 'progena' || k === 'tcmd' || k === 'chasten' || k === 'tvul' || k === 'consp' || k === 'telo' || k === 'monsl' || k === 'grisly' || k === 'unleash' || k === 'kmplace' || k === 'kmpick' || k === 'scry' || k === 'mirror' || k === 'fogd' || k === 'aerial' || k === 'chelm' || k === 'optics' || k === 'icomm' || k === 'sling' || k === 'pacc' || k === 'tjam' || k === 'rpilot' || k === 'mimic' || k === 'pobj' || k === 'nbspot' || k === 'wayfind' || k === 'ipulse' || k === 'rctl' || k === 'bpoint' || k === 'weld' || k === 'premon') {
      for (const gi of E.wcTargets(s, o, k)) out.push({ t: k, tg: gi });
    } else if (k === 'insp') {
      if (inspFree(s, o)) { const melee = s.ops.some(e => e.alive && e.p !== o.p && E.D(o, e) < 8); out.push({ t: 'insp', v: melee ? 'bayonet' : 'aim' }); }
    } else if (k === 'mlightf') {
      const tg = E.mlTargets(s, o).map(i => s.ops[i]).sort((x, y) => ((y.ml || 0) < 3 ? 1 : 0) - ((x.ml || 0) < 3 ? 1 : 0) || E.D(o, x) - E.D(o, y))[0];
      if (tg) out.push({ t: 'mlightf', tg: tg.i });
    } else if (k === 'mlight') {
      const tg = E.mlTargets(s, o).map(i => s.ops[i]).sort((x, y) => ((y.ml || 0) < 3 ? 1 : 0) - ((x.ml || 0) < 3 ? 1 : 0) || E.D(o, x) - E.D(o, y))[0];
      if (tg && !o.did.shoot) out.push({ t: 'mlight', tg: tg.i });
    } else if (k === 'ros') {
      out.push({ t: 'ros' });
    } else if (k === 'ewill') {
      if (E.fpWant(s, o.p, 'ewill')) out.push({ t: 'ewill' });
    } else if (k === 'slink') {
      if (E.fpWant(s, o.p, 'slink')) out.push({ t: 'slink' });
    } else if (k === 'hide') {
      if (E.fpWant(s, o.p, 'hide')) out.push({ t: 'hide' });
    } else if (k === 'larc') {
      if (E.fpWant(s, o.p, 'larc') && !E.missionTargets(s, o).length) out.push({ t: 'larc' });
    } else if (k === 'drug') {
      for (const gi of E.wcTargets(s, o, k)) if (s.ops[gi].W - s.ops[gi].w >= 2) out.push({ t: 'drug', tg: gi });
    } else if (k === 'dkplace') {
      { const E2 = s.eq[o.p]; if (s.ops.some(e => e.alive && e.p !== o.p && !e.ug && E.D(o, e) <= 7)) out.push({ t: 'dkplace' }); }
    } else if (k === 'dkdet') {
      { const M = s.eq[o.p].dkMine; const n = s.ops.filter(e => e.alive && !e.ug && Math.hypot(e.x - M.x, e.y - M.y) - E.bR(e) <= 2); if (n.filter(e => e.p !== o.p).length > n.filter(e => e.p === o.p).length) out.push({ t: 'dkdet' }); }
    } else if (k === 'dkpick') {
    } else if (k === 'ddash') {
      out.push({ t: 'ddash' });
    } else if (k === 'pbar') {
      out.push({ t: 'pbar' });
    } else if (k === 'nbboost') {
      if (s.ops.some(e => e.alive && e.p !== o.p && !e.ug && E.D(o, e) <= o.move + 4.5 && E.D(o, e) > o.move + 2)) out.push({ t: 'nbboost' });
    } else if (k === 'invan') {
      if (s.act.ap <= 1) out.push({ t: 'invan' });
    } else if (k === 'invrj') {
      if (o.W - o.w >= 3) out.push({ t: 'invrj' });
    } else if (k === 'resheal') {
      if (o.W - o.w >= 3) out.push({ t: 'resheal' });
    } else if (k === 'resapl') {
      if (s.act.ap <= 1 && s.ops.some(e => e.alive && !e.ug && e.p !== o.p && E.D(o, e) < 14)) out.push({ t: 'resapl' });
    } else if (k === 'explode') {
      if (s.ops.filter(e => e.alive && e.p !== o.p && E.D(o, e) <= 2.4).length >= 1) out.push({ t: 'explode' });
    } else if (k === 'breakst') {
      // la IA no rompe terreno
    } else if (k === 'pulsa') {
      out.push({ t: 'pulsa' });
    } else if (k === 'brayhorn') {
      if (s.ops.some(f => f.alive && f.ready && f.p === o.p && f !== o)) out.push({ t: 'brayhorn' });
    } else if (k === 'drop' && (s.mm || []).some(m => m.k === 'beacon' && m.c === o.i) && s.objs.some(ob => ob.x > -50 && Math.hypot(ob.x - o.x, ob.y - o.y) <= 6)) { out.push({ t: 'drop' }); // Baliza de guía: soltarla cerca de objetivos para tirar por PC
    } else if (k === 'cord' || k === 'drop' || k === 'scroll') {
      // cambio de orden de Capricious Plan: la IA no lo usa (evita tratarlo como movimiento)
    } else if (k === 'smoke') {
      const near = s.ops.some(x => x.alive && x.p !== o.p && E.D(o, x) < 14 && !x.ug);
      if (near) for (const sp of E.smokeSpots(s, o)) if (sp.k === 'self') out.push({ t: 'smoke', spot: sp.k });
    } else if (k === 'stun') {
      for (const gi of E.stunTargets(s, o)) out.push({ t: 'stun', tg: gi });
    } else if (k === 'ammo') {
      out.push({ t: 'ammo' });
    } else if (k === 'slither' || k === 'ancest' || k === 'onslaught' || k === 'procliv' || k === 'cruel' || k === 'wrath' || k === 'mutab' || k === 'malig' || k === 'proppa' || k === 'kaboom' || k === 'dart' || k === 'elusive' || k === 'shame' || k === 'capric' || k === 'barge') {
      if (E.fpWant(s, o.p, k) && (k !== 'elusive' || o.order === 'conceal') && (k !== 'barge' || E.engaged(s, o))) out.push({ t: k });
    } else if (k === 'cmdov') {
      if (E.fpWant(s, o.p, 'cmdov')) { const cur = s.imp[o.p]; const melee = s.ops.some(e => e.alive && e.p !== o.p && E.D(o, e) < 8) && o.weapons.some(w => w.m); const v = melee ? 'conqueror' : 'protector'; if (v !== cur) out.push({ t: 'cmdov', v }); }
    } else if (k === 'omni') {
      if (o.w > 4 && E.fpWant(s, o.p, 'omni')) out.push({ t: 'omni' });
    } else if (k === 'cabal') {
      const ops = E.cabalOpts(s, o).filter(x => !x.act), best = ops.map(x => ({ x, w: s.ops[x.q].weapons[x.wi] })).sort((m, n) => n.w.atk * (n.w.d + n.w.cd) - m.w.atk * (m.w.d + m.w.cd))[0];
      if (best) out.push({ t: 'cabal', q: best.x.q, wi: best.x.wi });
    } else if (k === 'scrap') {
      out.push({ t: 'scrap' });
    } else if (k === 'gng') {
      for (const oi of E.gngTargets(s, o)) out.push({ t: 'gng', ob: oi });
    } else if (k === 'bonds' || k === 'mherd' || k === 'wdrill') {
      if (E.fpWant(s, o.p, k)) for (const gi of E.pairTargets(s, o, k)) out.push({ t: k, tg: gi });
    } else if (k === 'captiv') {
      if (E.fpWant(s, o.p, 'captiv')) for (const gi of E.captivTargets(s, o)) out.push({ t: 'captiv', tg: gi });
    } else if (k === 'hldoc') {
      if (s.cp[o.p] >= 2) { const near = Math.min(99, ...s.ops.filter(e => e.alive && e.p !== o.p && !e.ug).map(e => E.D(o, e) - 1.2)); out.push({ t: 'hldoc', v: near <= 2 ? 'doc_ass' : near <= 6 ? 'doc_tac' : 'doc_dev' }); }
    } else if (k === 'adjdoc') {
      if (E.fpWant(s, o.p, 'adjdoc')) {
        const cur = s.gam[o.p].find(g => /^doc_/.test(g)); const near = Math.min(99, ...s.ops.filter(e => e.alive && e.p !== o.p && !e.ug).map(e => E.D(o, e) - 1.2));
        const want = E.opActions(s).includes('fight') ? 'doc_ass' : near <= 6 ? 'doc_tac' : 'doc_dev';
        if (want !== cur) out.push({ t: 'adjdoc', id: want });
      }
    } else if (k === 'wreathe') {
      for (const gi of E.wreatheTargets(s, o)) out.push({ t: 'wreathe', tg: gi });
    } else if (k === 'medikit') {
      for (const gi of E.medikitTargets(s, o)) out.push({ t: 'medikit', tg: gi });
    } else if (k === 'lunge') {
      for (const gi of E.lungeTargets(s, o)) out.push({ t: 'lunge', tg: gi });
    } else if (k === 'mslt') { // Slither Out of Sight (Mandrakes)
      if (E.fpWant(s, o.p, 'mslt')) for (const gi of E.msltT(s, o)) out.push({ t: 'mslt', tg: gi });
    } else if (k === 'nth') { // Nowhere to Hide: la IA no la usa (1 PC); antes caía en la rama de movimiento y repetía una orden inválida
    } else if (k === 'sac') {
      if (s.ops.some(e => e.alive && e.p !== o.p && E.D(o, e) < 10)) out.push({ t: 'sac' });
    } else if (k === 'signal') {
      for (const gi of E.signalTargets(s, o)) if (s.ops[gi].ready) out.push({ t: 'signal', tg: gi });
    } else if (k === 'fight') {
      for (const t of E.enemiesInCR(s, o)) o.weapons.forEach((w, wi) => { if (w.m) out.push({ t: 'fight', tg: t.i, wi }); });
    } else if (k === 'storch') { // Skytorch Assault: solo destinos cuya franja alcance a algún enemigo
      for (const c of moveCandidates(s, o, k)) { const ax = o.x, ay = o.y, L2 = (c.x - ax) ** 2 + (c.y - ay) ** 2 || 1; const hit = s.ops.some(e => e.alive && e.p !== o.p && !e.ug && (() => { const u = Math.max(0, Math.min(1, ((e.x - ax) * (c.x - ax) + (e.y - ay) * (c.y - ay)) / L2)); return Math.hypot(e.x - (ax + u * (c.x - ax)), e.y - (ay + u * (c.y - ay))) <= 2 * E.RAD; })()); if (hit) out.push(c); }
    } else out.push(...moveCandidates(s, o, k));
  }
  out.push({ t: 'end' });
  return out;
}


/* Retirada: puntuación 0..1 de cuánto mejora una casilla de destino (menos enemigos que me ven y más lejos de ellos) para un agente expuesto o herido. */
function retreatScore(s, o, c) {
  const foes = s.ops.filter(e => e.alive && e.p !== o.p && !e.ug); if (!foes.length) return 0;
  const seen = pt => foes.filter(e => E.D(e, pt) < 16 && E.los(s, e, pt.z != null ? { ...pt, i: -1 } : pt)).length;
  const s0 = seen(o), s1 = seen(c), d0 = Math.min(...foes.map(e => E.D(e, o))), d1 = Math.min(...foes.map(e => E.D(e, c)));
  const hurt = 1 - o.w / o.W; if (s0 === 0 && hurt < 0.4) return 0;
  return Math.max(0, Math.min(1, (s0 - s1) * 0.4 + Math.min(1, Math.max(0, d1 - d0) / 6) * 0.4 + hurt * 0.4 * (d1 > d0 ? 1 : 0)));
}
/* Amenaza que el rival puede ejercer sobre mis agentes (daño esperado máximo por agente enemigo): aproxima su respuesta al acabar mi activación. */
function threatOf(s, p) {
  let t = 0; const mine = s.ops.filter(o => o.alive && o.p === p && !o.ug);
  for (const e of s.ops) { if (!e.alive || e.p === p || e.ug) continue; let m = 0; for (const o of mine) { if (E.D(e, o) > 20) continue; for (const w of e.weapons) if (!w.m && E.targetable(s, e, w, o)) { const v = E.expectedShoot(s, e, w, o) / Math.max(1, o.w); if (v > m) m = v; } } t += m; }
  return t;
}

/* Progreso hacia los puntos de la operación táctica propia (las 12 operaciones). Se usa como rasgo de valoración con peso aprendido. */
function tacProgress(s, p) {
  const t = s.tac && s.tac[p]; if (!t) return 0; const e = 1 - p, mine = s.ops.filter(o => o.alive && o.p === p && !o.ug), foes = s.ops.filter(o => o.alive && o.p === e && !o.ug);
  const L = s.dep.ax === 'x' ? E.BW : E.BH;
  switch (t) {
    case 'devices': return (s.dev[p] || []).filter(Boolean).length;
    case 'intel': return s.mm.some(m => m.k === 'intel' && m.p === p && m.c >= 0) ? 1.5 : s.mm.some(m => m.k === 'intel' && m.p === p) ? 0.5 : 0;
    case 'track': return foes.filter(en => mine.some(f => f.order === 'conceal' && !E.engaged(s, f) && E.D(f, en) - E.bR(f) - E.bR(en) <= 6 && f.weapons.some(w => !w.m && E.targetable(s, f, w, en)) && !en.weapons.some(w => !w.m && E.targetable(s, en, w, f)))).length;
    case 'flank': { const sd = [false, false]; for (const o of mine) { const inE = s.dep.ax === 'x' ? (p === 0 ? o.x > E.BW / 2 : o.x < E.BW / 2) : (p === 0 ? o.y > E.BH / 2 : o.y < E.BH / 2); if (inE) sd[(s.dep.ax === 'x' ? o.y : o.x) < (s.dep.ax === 'x' ? E.BH : E.BW) / 2 ? 0 : 1] = true; } return sd.filter(Boolean).length; }
    case 'retrieval': return (s.searched[p] || []).filter(Boolean).length + (s.mm.some(m => m.k === 'retr' && m.p === p && m.c >= 0) ? 1 : 0);
    case 'scout': return Math.min(2, (s.monitored[p] || []).filter(i => s.ops[i].alive).length);
    case 'dominate': return mine.reduce((x, o) => x + (o.dom || 0), 0);
    case 'rout': return (s.routV && s.routV[p] && s.routV[p][s.tp]) || 0;
    case 'sweep': return (s.cleared[p] || []).filter(Boolean).length;
    case 'martyrs': return (s.martyr[p] || []).reduce((x, y) => x + y, 0);
    case 'banner': return s.bannerDone[p] ? 1.5 : 0;
    case 'envoy': { const ev = s.envoy[p] >= 0 ? s.ops[s.envoy[p]] : null; if (!ev || !ev.alive) return 0; const adv = s.dep.ax === 'x' ? (p === 0 ? ev.x : E.BW - ev.x) : (p === 0 ? ev.y : E.BH - ev.y); return Math.max(0, adv / L * 2); }
  }
  return 0;
}
/* Elección de operación táctica de la IA: sesgo aprendido por operación (prior 0 = equiprobable), softmax. */
export function pickTac(p, opts) {
  const key = id => 'tacsel:' + id, lg = opts.map(id => (OPT['g|' + key(id)] != null ? OPT['g|' + key(id)] : OPT[key(id)] != null ? OPT[key(id)] : 0));
  const mx = Math.max(...lg), ex = lg.map(z => Math.exp(z - mx)), sm = ex.reduce((x, y) => x + y, 0), pr = ex.map(x => x / sm);
  let u = Math.random(), c = opts.length - 1, acc = 0; for (let i = 0; i < pr.length; i++) { acc += pr[i]; if (u < acc) { c = i; break; } }
  if (optLog[p]) optLog[p].push({ multi: true, keys: opts.map(id => 'g|' + key(id)), pr, c, lg });
  return opts[c];
}
/* ---------- decision ---------- */
const LEVEL = globalThis.KT_LEVEL || { easy: { samples: 2, eps: 0.4, look: false, top: 0, act: 1 }, medium: { samples: 4, eps: 0.12, look: true, top: 3, act: 1 }, hard: { samples: 8, eps: 0, look: true, top: 6, act: 2 } };
const STEALTH = +(globalThis.process && process.env && process.env.KT_STEALTH) || 0.12;
function evalAction(s, a, p, W, samples) {
  let tot = 0;
  for (let i = 0; i < samples; i++) {
    const c = E.clone(s); c.rs = (c.rs + i * 7919 + 1) | 0; E.apply(c, a);
    tot += value(features(c, p), W);
    if (c.over) tot += (c.winner === p ? 1 : c.winner === -1 ? 0 : -1);
  }
  return tot / samples;
}

/* ---------- ANJ (Operaciones conjuntas, Manual págs. 87-88): comportamientos Peleador / Tirador y principio de amenaza ---------- */
const anjFoes = (s, o) => s.ops.filter(e => e.alive && e.p !== o.p && !e.ug);
function withPos(o, c, fn) { const sv = [o.x, o.y, o.z, o.order]; o.x = c.x; o.y = c.y; o.z = c.z || 0; o.order = 'engage'; try { return fn(); } finally { [o.x, o.y, o.z, o.order] = sv; } }
const anjShooter = o => hasKw(o, 'TIRADOR') || hasKw(o, 'NPOFS') || o.nbeh === 'ojo_preciso' || (o.nem && o.beh === 'marksman');
const anjAtkVal = (w, e) => w.atk * (w.d + w.cd) / 2;
function anjShootTargets(s, o, c) { return withPos(o, c || o, () => { const out = []; for (const t of anjFoes(s, o)) { let bw = -1, bv = -1; o.weapons.forEach((w, wi) => { if (!w.m && E.targetable(s, o, w, t)) { const v = E.expectedShoot(s, o, w, t); if (v > bv) { bv = v; bw = wi; } } }); if (bw >= 0) out.push({ t, wi: bw }); } return out; }); }
const anjCover = (s, o, c) => withPos(o, c || o, () => anjFoes(s, o).length > 0 && anjFoes(s, o).some(e => E.coverInfo(s, e, o).any));
const anjSeesObj = (s, o, c) => withPos(o, c || o, () => s.objs.some(ob => E.los(s, o, ob)));
function anjPickShot(s, o, list) { // principio de amenaza: no ofuscado, no a cubierto, con marcador en su zona de control, más cercano, herido, apostado
  const key = x => { const t = x.t, ci = E.sight(s, o, t); const mk = s.objs.some(ob => Math.hypot(ob.x - t.x, ob.y - t.y) <= E.CR); return [ci.obsc ? 1 : 0, ci.any ? 1 : 0, mk ? 0 : 1, E.D(o, t), t.w < t.W ? 0 : 1, t.ready ? 0 : 1]; };
  return list.map(x => ({ x, k: key(x) })).sort((a, b) => { for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; return 0; })[0].x;
}
function anjPathDist(s, e) { try { return E.reach(s, e, 80, 'rep'); } catch (err) { return null; } } // distancia por el camino más corto desde el enemigo a cada casilla
const anjClosed = (s, o) => [...(s.hatch || []).filter(h => !h.open), ...(s.vcNpo === 0 && o.p === 0 && s.vc ? s.vc.stk.filter(k => !k.open) : [])]; /* portillos cerrados y, para los NPO de Ofensiva del Compound, empalizadas cerradas */
const anjLate = s => s.tp >= 4; /* «unless four turning points are nearly complete»: en el último PI los NPO de Ofensiva no tienen precaución */
const anjStkNear = (s, o, d) => !!(s.vcNpo === 0 && o.p === 0 && s.vc && s.vc.stk.some(k => !k.open && Math.hypot(Math.max(k.r.x - o.x, 0, o.x - (k.r.x + k.r.w)), Math.max(k.r.y - o.y, 0, o.y - (k.r.y + k.r.h))) <= d));
function anjBlocked(s, o) { /* ¿ningún enemigo es alcanzable por camino (portillos cerrados)? */
  if (!anjClosed(s, o).length) return false; const foes = anjFoes(s, o); if (!foes.length) return false;
  let st; try { st = E.reach(s, o, 1, 'rep').start; } catch (err) { return false; }
  return foes.every(e => { const P = anjPathDist(s, e); return !P || !isFinite(P.dist[st]); });
}
function anjMoveCell(s, o, kind) { // devuelve {x,y,z} para el movimiento del comportamiento, o null
  const R = E.reach(s, o, E.moveAllow(s, o, kind), kind); if (!R.cells.length) return null;
  if (s.vcNpo === 1 && o.p === 1) { /* NPO Defensa: no salen del recinto */ const inn = R.cells.filter(k => E.vcInside(s, R.cellXY(k))); if (!inn.length) return null; R.cells = inn; } const foes = anjFoes(s, o); if (!foes.length) return null;
  if (kind !== 'chg' && anjBlocked(s, o)) { /* ir hacia el portillo cerrado más cercano */
    const hs = anjClosed(s, o); const hd = c => Math.min(...hs.map(h => Math.hypot(Math.max(h.r.x - c.x, 0, c.x - (h.r.x + h.r.w)), Math.max(h.r.y - c.y, 0, c.y - (h.r.y + h.r.h)))));
    const srt = R.cells.map(k => [hd(R.cellXY(k)), k]).sort((a, b) => a[0] - b[0]);
    if (s.vcNpo === 0 && o.p === 0 && s.vc && !anjLate(s)) { /* Compound, NPO Ofensiva: «con precaución» = se acercan a la empalizada por la casilla con cobertura (a ≤1,5" de la más cercana); en el último PI no */ const pool = srt.filter(x => x[0] <= srt[0][0] + 1.5).slice(0, 25); const cv = pool.find(x => anjCover(s, o, R.cellXY(x[1]))); const k = (cv || pool[0])[1]; return { ...R.cellXY(k), k }; }
    return { ...R.cellXY(srt[0][1]), k: srt[0][1] };
  }
  if ((s.ao === 6 || s.ar) && o.abK && (kind === 'rep' || kind === 'dash' || kind === 'fb')) { /* Decaying Generatorium · Drawn to Energy: Reposicionarse/Correr hacia el marcador de objetivo más cercano */ const obs = s.objs.filter(b => b.x > -50); if (obs.length) { const tg = obs.slice().sort((a, b) => E.D(o, a) - E.D(o, b))[0]; const k = R.cells.slice().sort((a, b) => E.D(R.cellXY(a), tg) - E.D(R.cellXY(b), tg))[0]; return { ...R.cellXY(k), k }; } }
  const vis0 = s.ao === 6 && o.abK ? foes.filter(e => E.los(s, o, e)) : []; /* Modified Threat Principle: el blanco es el operativo jugador visible más cercano (o simplemente el más cercano si ninguno es visible) */
  const cand = (vis0.length ? vis0 : foes).slice().sort((a, b) => E.D(o, a) - E.D(o, b)).slice(0, vis0.length ? 1 : 3); const PDs = cand.map(e => anjPathDist(s, e)); const dAt = (k, c) => { let m = Infinity; PDs.forEach((P, i) => { const v = P ? P.dist[k] : Infinity; if (v < m) m = v; }); return isFinite(m) ? m : 60 + Math.min(...cand.map(e => E.D(c, e))); };
  let near = cand[0]; { let bd = Infinity; PDs.forEach((P, i) => { const v = P ? P.dist[R.start] : Infinity; if (v < bd) { bd = v; near = cand[i]; } }); } const XY = k => R.cellXY(k);
  if (kind === 'chg') { const inZ = R.cells.filter(k => E.D(XY(k), near) <= E.CR + 0.01); const pool = inZ.length ? inZ : R.cells; const k = pool.slice().sort((a, b) => R.dist[a] - R.dist[b])[0]; return { ...XY(k), k }; }
  const shooter = anjShooter(o); let cells = R.cells;
  if (shooter) { // a cubierto y con blanco válido no ofuscado; si no, con un marcador visible; si no, hacia el enemigo
    const sample = cells.length > 120 ? cells.filter((_, i) => i % Math.ceil(cells.length / 120) === 0) : cells;
    const sc = sample.map(k => { const c = XY(k); const cov = anjCover(s, o, c); const tg = anjShootTargets(s, o, c).filter(x => withPos(o, c, () => !E.sight(s, o, x.t).obsc)).length > 0; const ob = anjSeesObj(s, o, c); return { k, v: (cov ? 4 : 0) + (tg ? 2 : 0) + (ob ? 1 : 0) - E.D(c, near) * 0.01 }; }).sort((a, b) => b.v - a.v);
    return sc.length ? { ...XY(sc[0].k), k: sc[0].k } : null;
  }
  const dk = k => dAt(k, XY(k));
  const best = cells.map(k => [dk(k), k]).sort((a, b) => a[0] - b[0]); const lim = best[0][0] + 1.5;
  const pool = best.filter(x => x[0] <= lim).slice(0, 25); const cov = pool.find(x => anjCover(s, o, XY(x[1])));
  const k = (cov || pool[0])[1]; return { ...XY(k), k };
}
function anjAct(s) { // siguiente acción del ANJ activo: la primera de su comportamiento que pueda realizar (si ninguna, acaba su activación)
  const o = s.ops[s.act.op]; const acts = E.opActions(s); const shooter = anjShooter(o);
  if (s.hatch && s.hatch.length && !o.did.hatch) { /* Combate cerrado: los ANJ operan portillos si es necesario para cumplir su comportamiento */
    if (acts.includes('hfight')) { const hf = E.hfightTargets(s, o); if (hf.length) { const wi = o.weapons.findIndex(w => w.m); if (wi >= 0 && !o.did.fight && !shooter) return { t: 'hfight', tg: hf[0].tg, wi }; } }
    if (acts.includes('hatch') && anjBlocked(s, o)) { const ht = E.hatchTargets(s, o).filter(h => !h.open); if (ht.length) return { t: 'hatch', h: ht[0].pi }; }
  }
  if (s.vcNpo === 1 && o.p === 1 && acts.includes('guard') && !o.did.guard && E.vcBunkerI(s, o) >= 0 && !s.ops.some(g => g.alive && g.p === 1 && g.guard && g.i !== o.i && E.vcBunkerI(s, g) === E.vcBunkerI(s, o)) && !(acts.includes('shoot') && anjShootTargets(s, o).length) && !(!anjShooter(o) && E.enemiesInCR(s, o).length)) return { t: 'ga' }; /* Defensa: un solo operativo en guardia por búnker, cuando no podría Disparar ni Combatir */
  if (s.vcNpo === 0 && o.p === 0 && s.vc && acts.includes('vc') && !E.enemiesInCR(s, o).length && !(acts.includes('shoot') && anjShootTargets(s, o).length)) { /* Ofensiva: tratan de abrir la empalizada (Disparar si son tiradores, Combatir si no); con precaución, un tirador dispara desde donde está en vez de acercarse */ const L = E.vcActs(s, o).filter(c => c.v !== 'door'); const want = L.filter(c => shooter ? c.v === 'shoot' : c.v === 'fight'); const pool = want.length ? want : L; if (pool.length) { const val = c => c.wi >= 0 ? anjAtkVal(o.weapons[c.wi]) : 9; const c = pool.slice().sort((a, b) => val(b) - val(a))[0]; return { t: 'vc', v: c.v, k: c.k, wi: c.wi }; } }
  const NSEQ = { batallador: ['fight', 'chg', 'rep', 'shoot', 'dash'], ojo_preciso: ['fb', 'shoot', 'rep', 'dash'], peleon: ['fight', 'chg', 'rep', 'dash'], guardian: ['fight', 'shoot', 'chg', 'rep', 'dash'] }; /* comportamientos de las cartas ANJ (nemesis.json: behaviours.order) */
  const seq = (!o.nem && NSEQ[o.nbeh]) ? NSEQ[o.nbeh] : (o.nem && (o.beh === 'guardian' || o.beh === 'battler')) ? ['fight', 'shoot', 'chg', 'rep', 'dash'] : hasKw(o, 'NPOFS') ? ['fight', 'shoot', 'rep', 'dash'] : shooter ? (s.twp ? ['fb', 'shoot', 'rep', 'dash', 'fight'] : ['fb', 'shoot', 'rep', 'dash']) : ['fight', 'chg', 'rep', 'dash'];
  for (const k of seq) {
    if (!acts.includes(k)) continue;
    if (k === 'fight') { const foes = E.enemiesInCR(s, o); if (!foes.length) continue; const t = s.ao === 6 && o.abK ? foes.slice().sort((a, b) => E.D(o, a) - E.D(o, b))[0] : foes.slice().sort((a, b) => (a.w < a.W ? 0 : 1) - (b.w < b.W ? 0 : 1) || (s.objs.some(ob => Math.hypot(ob.x - a.x, ob.y - a.y) <= E.CR) ? 0 : 1) - (s.objs.some(ob => Math.hypot(ob.x - b.x, ob.y - b.y) <= E.CR) ? 0 : 1) || (a.ready ? 0 : 1) - (b.ready ? 0 : 1))[0]; let wi = -1, bv = -1; o.weapons.forEach((w, i) => { if (w.m && anjAtkVal(w) > bv) { bv = anjAtkVal(w); wi = i; } }); if (wi >= 0) return { t: 'fight', tg: t.i, wi }; continue; }
    if (k === 'shoot') { const L = anjShootTargets(s, o); if (!L.length) continue; const pk = anjPickShot(s, o, L); return { t: 'shoot', tg: pk.t.i, wi: pk.wi }; }
    const c = anjMoveCell(s, o, k); if (c) return { t: 'mv', k, x: c.x, y: c.y, z: c.z || 0 };
  }
  return { t: 'end' };
}
function anjCanAct(s, o) { // ¿puede Combatir/Disparar (según su comportamiento) en esta activación?
  const eng = E.enemiesInCR(s, o).length > 0; if (eng && hasKw(o, 'NPOFS')) return true; if (!eng && anjStkNear(s, o, 1.7) && anjBlocked(s, o)) return true; /* NPO Ofensiva junto a una empalizada cerrada que les corta el paso: pueden actuar contra ella */
  if (!anjShooter(o)) { if (eng) return true; const sv = o.order; o.order = 'engage'; try { const R = E.reach(s, o, E.moveAllow(s, o, 'chg'), 'chg'); return R.cells.length > 0; } finally { o.order = sv; } }
  if (eng) return o.apl >= 3 && (() => { const sv = o.order; o.order = 'engage'; try { const R = E.reach(s, o, E.moveAllow(s, o, 'fb'), 'fb'); return R.cells.some((k, i) => i % 6 === 0 && anjShootTargets(s, o, R.cellXY(k)).length); } finally { o.order = sv; } })();
  if (anjShootTargets(s, o).length) return true;
  const sv = o.order; o.order = 'engage'; try { const R = E.reach(s, o, E.moveAllow(s, o, 'rep'), 'rep'); const st = Math.ceil(R.cells.length / 80) || 1; return R.cells.some((k, i) => i % st === 0 && anjShootTargets(s, o, R.cellXY(k)).length); } finally { o.order = sv; }
}
export function anjChoose(s) {
  if (s.pend) {
    if (s.ao && s.pend.kind === 'react' && (s.pend.p === s.npoP || ((s.am1 || s.ar) && s.pend.p >= 1))) return { t: 'rpass' }; /* AO: los NPO no contraatacan */ if (s.pend.kind === 'react' && s.pend.p === (s.npoP ?? s.vcNpo ?? 1)) { // reaccionar: la primera acción de su comportamiento; si no puede, pasa
      for (const oi of (s.pend.ops || [])) { const c = E.clone(s); E.apply(c, { t: 'react', op: oi }); if (!c.act) continue; const a = anjAct(c); if (a.t !== 'end') return { t: 'react', op: oi, then: a }; }
      return { t: 'rpass' };
    }
    return null;
  }
  if (!s.act) {
    const NPp = (s.am1 || s.ar) ? s.active : (s.npoP ?? s.vcNpo ?? 1); const ready = s.ops.filter(o => o.p === NPp && o.alive && o.ready && E.canActivate(s, o)); if (!ready.length) return null;
    const foes = s.ops.filter(e => e.alive && e.p !== NPp && !e.ug);
    const sc = ready.map(o => { const can = anjCanAct(s, o); const wv = Math.max(0, ...o.weapons.filter(w => !!w.m === !anjShooter(o)).map(w => anjAtkVal(w))); return { o, can, wv, cov: foes.some(f => E.coverInfo(s, f, o).any) ? 1 : 0, d: Math.min(99, ...foes.map(f => E.D(o, f))) }; })
      .sort((a, b) => (b.can ? 1 : 0) - (a.can ? 1 : 0) || (a.can && b.can ? b.wv - a.wv : 0) || a.cov - b.cov || a.d - b.d);
    const f = sc[0]; return { t: 'act', op: f.o.i, order: f.can ? 'engage' : 'conceal' };
  }
  return anjAct(s);
}

const _aoF = new Map();
export function aoField(s, g, strict) { // distancia por rejilla (BFS 8 vías) hasta g, esquivando muros; en caché por objetivo y estado de portillos
  const key = (strict ? 'S' : 'L') + Math.round(g.x * 2) + ',' + Math.round(g.y * 2) + ',' + s.terrain.length + ',' + (s.hatch || []).map(h => h.open ? 1 : 0).join('') + (s.bpt || []).map(b => b.open ? 1 : 0).join('') + (s.ep || []).map(e => e.lock ? 1 : 0).join('');
  if (_aoF.has(key)) return _aoF.get(key);
  const C = 0.4, W = Math.ceil(E.BW / C), H = Math.ceil(E.BH / C), blk = new Uint8Array(W * H);
  const hs = new Set((s.hatch || []).map(h => h.r)); if (!strict) for (const b of (s.bpt || [])) if (!b.open) hs.add(b.r);
  for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) { const x = (i + 0.5) * C, y = (j + 0.5) * C; for (const t of s.terrain) { if (hs.has(t)) continue; const cx = Math.max(t.x, Math.min(x, t.x + t.w)), cy = Math.max(t.y, Math.min(y, t.y + t.h)); if (Math.hypot(x - cx, y - cy) < 0.5) { blk[i * H + j] = 1; break; } } }
  const d = new Float32Array(W * H).fill(1e9); const gi = Math.min(W - 1, Math.max(0, g.x / C | 0)), gj = Math.min(H - 1, Math.max(0, g.y / C | 0)); let q = [gi * H + gj]; d[q[0]] = 0;
  const near = {}; (s.ep || []).forEach((e, k) => { for (const [P, Q, side] of [[e.a, e.b, 0], [e.b, e.a, 1]]) { const cells = []; for (let i = Math.max(0, (P.x - 1.6) / C | 0); i <= Math.min(W - 1, (P.x + 1.6) / C | 0); i++) for (let j = Math.max(0, (P.y - 1.6) / C | 0); j <= Math.min(H - 1, (P.y + 1.6) / C | 0); j++) if (!blk[i * H + j] && Math.hypot((i + 0.5) * C - P.x, (j + 0.5) * C - P.y) <= 1.6) cells.push(i * H + j); (near[k + ':' + side] = cells); } });
  const portal = new Map(); for (const key of Object.keys(near)) { const [k, side] = key.split(':'); for (const c of near[key]) { if (!portal.has(c)) portal.set(c, []); portal.get(c).push(k + ':' + (1 - side)); } }
  for (let h = 0; h < q.length; h++) { const c = q[h], i = c / H | 0, j = c % H; const dc = d[c];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const n = ni * H + nj; if (blk[n] && n !== q[0]) continue; const nd = dc + (di && dj ? 1.414 : 1) * C; if (nd < d[n]) { d[n] = nd; q.push(n); } }
    const pk = portal.get(c); if (pk) for (const key of pk) for (const n of near[key]) { const nd = dc + 3; if (nd < d[n]) { d[n] = nd; q.push(n); } } }
  const d2 = Float32Array.from(d); for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) if (d[i * H + j] >= 1e9) { let v = 1e9; for (let r = 1; r <= 4 && v >= 1e9; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const w = d[ni * H + nj]; if (w < 1e9) v = Math.min(v, w + Math.hypot(di, dj) * C); } d2[i * H + j] = v; }
  const f = p => { const i = Math.min(W - 1, Math.max(0, p.x / C | 0)), j = Math.min(H - 1, Math.max(0, p.y / C | 0)); const v = d2[i * H + j]; return v >= 1e9 ? E.D(p, g) + 50 : v; };
  if (_aoF.size > 12) _aoF.clear(); _aoF.set(key, f); return f;
}

function aoGoal(s, o) { // Adversary Ops 2/3: hacia la cámara; en AO3 el portador huye por el borde superior vía Entryway
  if (s.aoObj == null || s.aoObj < 0) return null; const ob = s.objs[s.aoObj];
  if (s.ao === 3) { const ci = s.carry[s.aoObj];
    if (ci === o.i) { if (o.y > 17) { const e = (s.ep || []).filter(x => !x.lock).map(x => x.b).sort((p, q) => E.D(o, p) - E.D(o, q))[0]; if (e) return e; const l = (s.ep || []).map(x => x.b).sort((p, q) => E.D(o, p) - E.D(o, q))[0]; return l || ob; } return { x: o.x, y: 0.5 }; }
    if (o.y > 17 && o.i % 2 === 0 && (s.ep || []).some(x => x.lock) && ci !== o.i) return [...s.ep].filter(x => x.lock).map(x => x.b).sort((p, q) => E.D(o, p) - E.D(o, q))[0];
    if (ci >= 0) return s.ops[ci] && s.ops[ci].alive ? s.ops[ci] : ob;
    if ((s.ep || []).some(x => x.lock) && o.y < 17 && (s.ep || []).length) { return [...s.ep].map(x => x.a).sort((p, q) => E.D(o, p) - E.D(o, q))[0]; }
    return ob; }
  return ob;
}

export function chooseAction(s, level, W, explore = 0) { let c; optLevel = level; fam = famOf(s); E.setMwCoarse(true); try { c = chooseAction0(s, level, W, explore); } finally { E.setMwCoarse(false); } try { c = optChoice(s, c); } catch (e) { } if (c && c.t === 'end' && s.act && s.act.po != null && s.act.pap > 0 && (s.act.sw || 0) < 2 && !s.pend && optTake(s, s.active, 'swapop', 1.5)) return { t: 'swapop' }; return c; }
function chooseAction0(s, level, W, explore = 0) { E.syncTW(s);
  if (s.ao && ((s.am1 || s.ar) ? (s.pend ? s.pend.p >= 1 : s.active >= 1) : (s.pend ? s.pend.p === s.npoP : s.active === s.npoP))) { const r = anjChoose(s); if (r) return r; }
  if (s.vcNpo != null && (s.pend ? s.pend.p === s.vcNpo : s.active === s.vcNpo)) { const r = anjChoose(s); if (r) return r; } // Volkus en solitario/cooperativo: comportamientos NPO del libro
  if (s.jm && (s.pend ? s.pend.p === 1 : s.active === 1)) { const r = anjChoose(s); if (r) return r; } // ANJ: comportamientos del libro
  if (s.am1 && !s.pend && s.act && !s.act.react && s.active === 0) { const ac = E.opActions(s); if (ac.includes('amel')) return { t: 'amel' }; /* Eliminar activos siempre que se pueda: cada marcador es 1 PV */
    if (ac.includes('esc')) { const o = s.ops[s.act.op], left = s.objs.filter(b => b.x > -50).length, hurt = o.w <= o.W / 2; if (s.tp >= 4 || !left || (hurt && s.tp >= 2) || (s.tp >= 3 && optTake(s, 0, 'm:esc', 3))) return { t: 'esc' }; } }
  else if (s.ar && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('arpk')) return { t: 'arpk' };
  else if (s.twp && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('esc') && optTake(s, 0, 'm:esc', 3)) return { t: 'esc' };
  if ((s.twp === 2 || s.twp === 4) && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('breach') && E.breachTargets(s, s.ops[s.act.op]).length && optTake(s, 0, 'm:breach', 3)) return { t: 'breach' }; // misiones de brecha: la IA las prioriza
  if (s.twp === 3 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('pick') && !s.carry.some(c => c >= 0) && optTake(s, 0, 'm:pick', 3)) return { t: 'pick' };
  if (s.twp === 5 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('scout') && optTake(s, 0, 'm:scout', 3)) return { t: 'scout' };
  if (s.ty === 2 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('ty')) { const o = s.ops[s.act.op], L = E.tyActs(s, o); const sc = c => { const w = o.weapons[c.wi]; return w.atk * (w.d + w.cd) / 2 * (c.v === 'fight' ? 1.4 : 1); }; const foe = s.ops.some(e => e.alive && e.p === 1 && !e.ug && E.D(e, o) < 4); if (L.length && !(foe && E.opActions(s).includes('fight')) && optTake(s, 0, 'm:ty2', 3)) return L.slice().sort((x, y) => sc(y) - sc(x))[0]; } // Typhon 2: atacar el saco de gestación salvo que haya un NPO encima
  if (s.ty && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('tydrone') && optTake(s, 0, 'm:tydrone', 3)) return { t: 'tydrone' }; // Typhon: desplegar el dron en cuanto se controla un nido
  if (s.vcm && !s.pend && s.act && !s.act.react && s.active === 0 && s.act.ap >= 1) { // Volkus Compound: el Ataque abre brechas cuando su arma puede dañar la empalizada
    const o = s.ops[s.act.op], L = E.opActions(s).includes('vc') ? E.vcActs(s, o) : []; const good = L.filter(c => c.v === 'fight' ? (c.wi === -1 || o.weapons[c.wi].cd > 5) : c.v === 'shoot' ? (o.weapons[c.wi].d > 3 || o.weapons[c.wi].cd > 3) : false);
    if (good.length && optTake(s, 0, 'm:vc', -0.4)) { good.sort((p, q) => (q.v === 'fight') - (p.v === 'fight') || (q.wi === -1 ? 9 : o.weapons[q.wi].cd) - (p.wi === -1 ? 9 : o.weapons[p.wi].cd)); return good[0]; } }
  if (s.dv === 2 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('dvtun') && optTake(s, 0, 'm:dvtun', 3)) return { t: 'dvtun' };
  if (s.nj === 3 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('njext') && optTake(s, 0, 'm:njext', 3)) return { t: 'njext' };
  if (s.ao === 6 && !s.pend && s.act && !s.act.react && s.active < 2) { const ac = E.opActions(s); if (ac.includes('abtap') && optTake(s, s.active, 'm:abtap', 3)) return { t: 'abtap' }; if (ac.includes('abpk') && optTake(s, s.active, 'm:abpk', 2)) return { t: 'abpk' }; }
  if (s.nop && s.nopM === 4 && !s.pend && s.act && !s.act.react) { const ac = E.opActions(s).filter(x => /^nopdem/.test(x)); if (ac.length && optTake(s, s.active, 'm:nopdem', 3)) return { t: 'nopdem', n: Math.max(...ac.map(x => +x.slice(6))) }; }
  if (s.nj === 1 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('njsab') && optTake(s, 0, 'm:njsab', 3)) return { t: 'njsab' };
  if (s.dv === 4 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('dvsearch') && optTake(s, 0, 'm:dvsearch', 3)) return { t: 'dvsearch' };
  if (s.dv === 8 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('dvbcn')) { const o = s.ops[s.act.op], rt = s.ops.find(e => e.p === 1 && e.dvRT && e.alive && !e.ug); if (rt && E.D(o, rt) <= 6 && optTake(s, 0, 'm:dvbcn', 3)) return { t: 'dvbcn' }; } // Devlan 8: baliza cuando el Red Terror está cerca
  if (s.dv === 3 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('dvscan') && !s.ops.some(e => e.p === 0 && e.scan && (e.alive || e.esc)) && optTake(s, 0, 'm:dvscan', 3)) return { t: 'dvscan' };
  if (s.ty === 5 && !s.pend && s.act && !s.act.react && s.active === 0) { const A5 = E.opActions(s); if (A5.includes('tybomb') && optTake(s, 0, 'm:tybomb', 3)) return { t: 'tybomb' }; if (A5.includes('shpick') && optTake(s, 0, 'm:shpick', 3)) return { t: 'shpick' }; }
  if (s.twp === 8 && !s.pend && s.act && !s.act.react && s.active === 0) { const A8 = E.opActions(s); if (A8.includes('shext') && optTake(s, 0, 'm:shext', 3)) return { t: 'shext' }; if (A8.includes('shpick') && optTake(s, 0, 'm:shpick', 3)) return { t: 'shpick' }; }
  if (s.aa && !s.pend && s.act && !s.act.react && E.opActions(s).includes('esc')) return { t: 'esc' }; // Asalto aerotransportado: Huir / Extracción
  if (s.jm === 3 && !s.pend && s.act && !s.act.react && s.active === 0 && E.opActions(s).includes('esc') && (s.tp >= 2 || explore === 0) && optTake(s, 0, 'm:esc', 3)) return { t: 'esc' }; // Huida: la IA de los jugadores huye en cuanto puede
  const p = s.pend && s.pend.kind === 'imp' ? s.pend.p : s.active; const L = LEVEL[level] || LEVEL.medium; const eps = Math.max(L.eps, explore);
  if (s.pend && s.pend.kind === 'imp' && String(s.pend.stage).startsWith('bz')) return bzPend(s);
  if (!s.pend && s.bz && s.act && !s.act.rctl) { const c = bzAI(s); if (c) return c; }
  if (!s.pend && s.exForce && s.act && s.act.op === s.exForce.op && s.act.amb != null && !s.act.ambDone) { const cs = candidates(s).filter(c => c.t === 'shoot' || c.t === 'fight'); if (cs.length) { let b = cs[0], bv = -1e9; for (const c of cs) { const v = evalAction(s, c, s.act.p, W, 1); if (v > bv) { bv = v; b = c; } } return b; } } // Orden de ejecución: el agente interruptor debe disparar o combatir contra el marcado
  if (!s.pend && s.act && !s.act.react && s.fx && E.opActions(s).includes('wmark') && optTake(s, s.active, 'o:wmark', 2)) return { t: 'wmark' }; // Cortar el velo: marcador de Warp
  if (!s.pend && s.act && !s.act.react && s.fx && E.opActions(s).includes('exnun')) { const o = s.ops[s.act.op], m = s.exNun && s.exNun[o.p]; if ((!m || Math.hypot(m.x - o.x, m.y - o.y) > 1.5) && optTake(s, s.active, 'o:exnun', 2)) return { t: 'exnun' }; } // Nuncio-aquila: la IA lo despliega (0 PA)
  if (s.pend && s.pend.kind === 'imp' && s.pend.stage === 'plc') { if (s.pend.k === 'fmv' && E.plcReach(s).cells.length === 0) return { t: 'plc', skip: true }; const c = E.plcSuggest(s); return { t: 'plc', x: c.x, y: c.y }; } // colocación libre: la IA usa el punto sugerido
  if (s.pend && s.pend.kind === 'imp' && s.pend.stage === 'gch') return { t: 'gch', v: s.pend.def != null && s.pend.opts.some(x => x.v === s.pend.def) ? s.pend.def : s.pend.opts[0].v }; // elección del jugador: la IA usa la opción por defecto
  if (s.pend && s.pend.kind === 'imp') { if (s.pend.stage === 'gam') { const av = E.availPloys(s, s.pend.p); if (s.cp[s.pend.p] >= 3 && av.length) { const pk = av[(s.tp + s.gam[s.pend.p].length) % av.length]; if (optTake(s, s.pend.p, 'gam:' + pk.id, 1.5)) return { t: 'gam', id: pk.id }; } return { t: 'gam', id: null }; }
    if (s.pend.stage === 'ct') { const have = s.ct[s.pend.p]; const pref = ['sharpshooter', 'hardy', 'stealthy', 'aggressive', 'mobile', 'dueller', 'resolute', 'siege'].filter(k => !have.includes(k)); return { t: 'ct', v: pref[0] }; }
    if (s.pend.stage === 'upg') { const o = s.ops[s.pend.op], c = o.upg || []; const pri = hasKw(o, 'LEYSTALKER') ? ['glo', 'fate', 'nexus', 'nomad', 'elus'] : hasKw(o, 'STONESINGER') ? ['wrath', 'wail', 'wind', 'clean', 'sow'] : (o.i % 2 ? ['spear', 'moon', 'nimb', 'refl', 'stance'] : ['spear', 'moon', 'stance', 'nimb', 'refl']); const w = pri.find(x => !c.includes(x)); return { t: 'upg', v: c.length >= 2 || !w ? 'done' : w }; }
    if (s.pend.stage === 'pat') { const o = s.ops[s.pend.op], c = o.pat || []; return { t: 'pat', v: ['agr', 'vel', 'def'].find(x => !c.includes(x)) }; }
    if (s.pend.stage === 'mark') { const o = s.ops[s.pend.op]; return { t: 'mark', v: hasMelee(o) && !/BALEFIRE/.test(o.kw.join()) ? 'khorne' : 'tzeentch' }; }
    if (s.pend.stage === 'skill') return { t: 'skill', v: s.pend.second ? 'ice' : 'lightup' };
    if (s.pend.stage === 'adapt') return { t: 'adapt', v: s.pend.ops[Math.floor(Math.random() * s.pend.ops.length)] };
    if (s.pend.stage === 'nbord') { const sc = i => { const sp = s.pend.spots[i]; return s.ops.filter(o => o.alive && o.p === s.pend.p && Math.hypot(o.x - sp.x, o.y - sp.y) <= 3 + E.RAD).length + Math.random() * 0.1; }; return { t: 'nbord', v: s.pend.ops.slice().sort((x, y) => sc(y) - sc(x))[0] }; }
    if (s.pend.stage === 'mtac') { const n = s.ops.filter(e => e.alive && e.p !== s.pend.p && e.order === 'engage').length, m = s.ops.filter(e => e.alive && e.p !== s.pend.p && e.order !== 'engage').length; return { t: 'mtac', v: n >= m ? 'engage' : 'conceal' }; }
    if (s.pend.stage === 'hfocus') { const dg = s.ops.find(o => o.alive && o.p === s.pend.p && hasKw(o, 'DIRGEMAW')); const v = dg ? s.pend.ops.slice().sort((x, y) => E.D(dg, s.ops[x]) - E.D(dg, s.ops[y]))[0] : null; return { t: 'hfocus', v }; }
    if (s.pend.stage === 'engin') return { t: 'engin', v: ['d', 'lethal', 'balanced'].find(k => s.pend.ops.includes(k)) };
    if (s.pend.stage === 'boon') { const pref = ['astral', 'incorp', 'swell', 'echoes', 'timewalk', 'master', 'flight', 'mutant']; return { t: 'boon', v: pref.find(k => s.pend.ops.includes(k)) }; }
    if (s.pend.stage === 'tc') { const q = 1 - s.pend.p; const rg = s.ops.filter(e => e.p === q).reduce((m, e) => m + e.weapons.filter(w => !w.m).reduce((x, w) => Math.max(x, w.atk * w.d), 0), 0), ml = s.ops.filter(e => e.p === q).reduce((m, e) => m + e.weapons.filter(w => w.m).reduce((x, w) => Math.max(x, w.atk * w.d), 0), 0); return { t: 'tc', v: rg > ml * 1.3 ? 'barrel' : ml > rg ? 'rust' : 'vox' }; }
    if (s.pend.stage === 'saed') { const V = s.vd[s.pend.p]; const mel = i => s.ops[i].weapons.filter(w => w.m).reduce((m, w) => Math.max(m, w.atk * (w.d + w.cd)), 0), rng = i => s.ops[i].weapons.filter(w => !w.m).reduce((m, w) => Math.max(m, w.atk * (w.d + w.cd)), 0);
      if (!V.al) { const em = s.pend.ops.reduce((m, i) => m + mel(i), 0), er = s.pend.ops.reduce((m, i) => m + rng(i), 0); const al = em >= er ? 'epic' : 'melo'; const f = al === 'epic' ? mel : rng; return { t: 'saed', al, v: s.pend.ops.slice().sort((x, y) => f(y) - f(x))[0] }; }
      const f = V.al === 'epic' ? mel : rng; return { t: 'saed', v: s.pend.ops.slice().sort((x, y) => f(y) - f(x))[0] }; }
    if (s.pend.stage === 'writhe') { const sc = i => { const o = s.ops[i]; return o.W - o.w; }; return { t: 'writhe', v: s.pend.ops.slice().sort((x, y) => sc(y) - sc(x))[0] }; }
    if (s.pend.stage === 'rtd') { const sc = i => { const o = s.ops[i]; return -Math.min(99, ...s.ops.filter(e => e.alive && e.p !== o.p).map(e => Math.hypot(e.x - o.x, e.y - o.y))); }; return { t: 'rtd', v: s.pend.ops.slice().sort((x, y) => sc(y) - sc(x))[0] }; }
    if (s.pend.stage === 'spdis') return { t: 'spdis', v: s.pend.ops[0] };
    if (s.pend.stage === 'regroup') { const sc = i => E.regroupMates(s, s.ops[i]).length; return { t: 'regroup', v: s.pend.ops.slice().sort((x, y) => sc(y) - sc(x))[0] }; }
    if (s.pend.stage === 'hkm') { const q = s.pend.id === 'toil' ? 1 - s.pend.p : s.pend.p; const ops = s.ops.filter(o => o.alive && o.p === q); const sc = i => ops.reduce((m, o) => m + Math.hypot(o.x - s.objs[i].x, o.y - s.objs[i].y), 0); return { t: 'hkm', v: s.pend.ops.slice().sort((x, y) => sc(x) - sc(y))[0] }; }
    if (s.pend.stage === 'denounce') { const best = s.pend.ops.map(i => s.ops[i]).sort((u, v) => v.weapons.reduce((m, w) => Math.max(m, w.atk * (w.d + w.cd)), 0) - u.weapons.reduce((m, w) => Math.max(m, w.atk * (w.d + w.cd)), 0))[0]; return { t: 'denounce', v: best.i }; }
    if (s.pend.stage === 'envoy') { const me = s.pend.p; const pick = s.pend.ops.map(i => s.ops[i]).sort((u, v) => (s.dep.ax === 'x' ? (me === 0 ? v.x - u.x : u.x - v.x) : (me === 0 ? v.y - u.y : u.y - v.y)) + (v.w - u.w) * 0.1)[0]; return { t: 'envoy', v: pick.i }; }
    if (s.pend.stage === 'rb') { const me = s.pend.p, ctl = E.objControl(s); const c = s.objs.map((_, i) => i); const mine = c.filter(i => ctl[i] === me); return { t: 'rb', v: (mine.length ? mine : c)[Math.floor(Math.random() * (mine.length || c.length))] }; }
    if (s.pend.stage === 'claim') { const me = s.pend.p, ctl = E.objControl(s), op = E.claimOpts(s, me); const best = op.slice().sort((x, y) => (ctl[y] === me) - (ctl[x] === me) || (E.objRole(s, y) === me) - (E.objRole(s, x) === me))[0]; return { t: 'claim', ob: best, v: ctl[best] === me || E.objRole(s, best) === me ? 'ctl' : 'nocont' }; }
    if (s.pend.stage === 'art') { const u = s.artUsed[s.pend.p]; return { t: 'art', v: !u.includes('mont') ? 'mont' : !u.includes('kauy') ? 'kauy' : 'none' }; }
    if (s.pend.stage === 'ccg') { const pref = ['sinew', 'chitin', 'fleet', 'horned', 'barbed', 'wings']; return { t: 'ccg', v: pref.find(k => s.pend.ops.includes(k)) || s.pend.ops[0] }; }
    if (s.pend.stage === 'ccm') { const c = s.pend.ops.map(i => s.ops[i]); const b = c.map(o => ({ o, k: E.ccOpts ? E.ccOpts(s, o) : ['turn'] })).filter(x => x.k.length)[0]; return b ? { t: 'ccm', v: b.o.i, k: b.k.includes('turn') ? 'turn' : b.k[0] } : { t: 'ccm', v: null }; }
    if (s.pend.stage === 'ccs') return { t: 'ccs', v: null };
    if (s.pend.stage === 'ord') return { t: 'ord', v: 'aim' };
    if (s.pend.stage === 'tun') { const pk = E.tunnelPicks(s, s.pend.p); const last = s.tun[s.pend.p][s.tun[s.pend.p].length - 1]; const sc = pk.map(c => { let d = 1e9; s.objs.forEach(ob => { d = Math.min(d, E.D(c, ob)); }); return [d, c]; }).sort((x, y) => x[0] - y[0]); for (const [, c] of sc) { const a2 = { t: 'tun', x: c.x, y: c.y }, cl = E.clone(s); E.apply(cl, a2); if (!cl.pend || cl.pend.stage !== 'tun') return a2; } return { t: 'tun', skip: true }; } // solo propone casillas que el motor acepta (si no, se omite)
  return s.pend.stage === 'syn' ? { t: 'syn', v: optTake(s, s.pend.p, 'o:syn', 1) } : { t: 'imp', v: 'protector' }; } // heurística: dotación a distancia → Protector
  if (s.pend) return choosePend(s, p, L, W);
  if (!s.act) {
    if (E.mwSkipOk && E.mwSkipOk(s, p) && optTake(s, p, 'o:mwskip', 1)) return { t: 'mwskip' };
    if (E.mwNarcOk && E.mwNarcOk(s, p) && optTake(s, p, 'o:mwnarc', 1)) return { t: 'mwnarc' };
    const ready = s.ops.filter(o => o.p === p && o.alive && o.ready && E.canActivate(s, o));
    if (Math.random() < eps) { const o = ready[Math.floor(Math.random() * ready.length)]; return { t: 'act', op: o.i, order: 'engage' }; }
    let best = null, bv = -1e9;
    for (const o of ready) {
      const foes = s.ops.filter(e => e.alive && e.p !== p);
      const near = foes.some(e => E.D(o, e) < 18);
      const orders = near ? ['engage'] : ['conceal', 'engage'];
      const vars = [{}]; if (E.fpWant(s, p, 'edict')) { const et = E.edictTargets(s, o); if (et.length) vars.push({ edict: et[0] }); }
      for (const order of orders) for (const vr of vars) {
        const act0 = { t: 'act', op: o.i, order, ...vr };
        const c = E.clone(s); E.apply(c, act0);
        if (!c.act) { const v0 = value(features(c, p), W); if (v0 > bv) { bv = v0; best = act0; } continue; } // murió por veneno al activarse
        const cands = candidates(c); let v = -1e9;
        const lim = L.look && L.act > 1 ? cands : cands.filter(x => x.t !== 'end').slice(0, 12);
        for (const a of (lim.length ? lim : cands)) v = Math.max(v, evalAction(c, a, p, W, L.act || (L.look ? 2 : 1)));
        const bonus = (o.weapons.some(w => !w.m) ? 0 : 0) + (order === 'conceal' && near ? 0 : 0);
        if (v + bonus + (vr.edict != null ? 0.004 : 0) > bv) { bv = v + bonus + (vr.edict != null ? 0.004 : 0); best = act0; }
      }
    }
    return best;
  }
  const cands = candidates(s);
  if (Math.random() < eps) { const nz = cands.filter(c => c.t !== 'end'); if (nz.length && Math.random() < 0.8) return nz[Math.floor(Math.random() * nz.length)]; }
  let best = cands[cands.length - 1], bv = -1e9; const cscore = [], tagOf = new Map();
  const base = value(features(s, p), W); const hasShoot = cands.some(c => c.t === 'shoot' || c.t === 'fight');
  for (const a of cands) {
    let v = evalAction(s, a, p, W, L.samples); const tags = [];
    if (a.t === 'signal' || a.t === 'sac') v += bon(a.t);
    if (a.t === 'shoot') v += bon('shoot'); // agresividad (bono aprendido)
    if (a.t === 'fight') v += bon('fight');
    if (a.t === 'mv' && (a.k === 'fb' || a.k === 'rep' || a.k === 'dash') && s.act) { const o0 = s.ops[s.act.op]; if (retreatScore(s, o0, a) > 0) v += bon('retreat') * retreatScore(s, o0, a); }
    { const v0_ = v;
    if (s.twp && p === 0 && (a.t === 'shoot' || a.t === 'fight') && !((s.ty && !(s.ty === 1 && s.tyA && !s.tyA.raised)) || (s.dv && !(s.dv === 6 && s.dvSense && s.dvSense.length)))) v -= STEALTH * /* el sigilo solo importa donde disparar tiene coste: Tomb World, Typhon 1 antes de la alarma, Devlan 6 con cartas de Percepción */ (s.thr > 0 ? 1.3 - Math.min(1, s.thr / 15) * 0.6 : 1); // Tomb World: sigilo, cada disparo/combate sube la amenaza
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g1'); tags.push('g1'); } }
    { const v0_ = v;
    if (a.t === 'ga' && hasShoot) v += bon('ga');
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g2'); tags.push('g2'); } }
    { const v0_ = v;
    if (a.t === 'lunge') v += bon('lunge');
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g3'); tags.push('g3'); } }
    { const v0_ = v;
    if (a.t === 'tele' && s.twp >= 7 && s.ep) { const o = s.ops[s.act.op]; const G = E.twGoals(s, o); const g = G && G[0]; if (g && (g.y > 17) !== (o.y > 17) && !(s.twp === 9 && !s.ctan)) v += 0.05; } /* Shadowhunt: cruzar por Entryway hacia el objetivo del otro tablero */ if (a.t === 'gvman') v += 0.03; if (a.t === 'gvrej') v += 0.02 + 0.01 * (s.ops[s.act.op].W - s.ops[s.act.op].w); if (a.t === 'gvfur' || a.t === 'gvrag') { const og = s.ops[s.act.op]; v += s.ops.some(e => e.alive && e.p !== og.p && !e.ug && E.D(og, e) < 8) ? 0.025 : -0.01; } if (a.t === 'gvsrg' || a.t === 'gvrake') v += 0.012; if (a.t === 'medikit') v += 0.006; if (a.t === 'tac') v += 0.008; if (a.t === 'pick') v += 0.006; if (a.t === 'mission' || a.t === 'send') v += 0.006; if (a.t === 'hatch') v += 0.012; if (a.t === 'breach') v += 0.01; if (a.t === 'tele') v += 0.004; if (a.t === 'hfight') v += 0.004; if (a.t === 'wreathe' || a.t === 'fate' || a.t === 'alight' || a.t === 'fury' || a.t === 'rejuv' || a.t === 'torment' || a.t === 'drug' || a.t === 'premon') v += 0.005; if (a.t === 'recon') v += 0.008; if (a.t === 'stun') v += 0.004; if (a.t === 'slither' || a.t === 'cruel') v += 0.006; if (a.t === 'ancest' || a.t === 'onslaught' || a.t === 'procliv') v += 0.015; if (a.t === 'wrath') v += 0.012; if (a.t === 'adjdoc') v += 0.004; if (a.t === 'mutab') v += 0.012; if (a.t === 'captiv') v += 0.006; if (a.t === 'ammo') v += 0.02;
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g4'); tags.push('g4'); } }
    { const v0_ = v;
    if (a.t === 'mv' && s.aop && s.act) { const g = tacGoal(s, s.ops[s.act.op]); if (g) { const o = s.ops[s.act.op]; v += bon('tacmv') * Math.max(0, E.D(o, g) - E.D(a, g)) / 6; } } // op. táctica: avanzar hacia donde puntúa
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g5'); tags.push('g5'); } }
    { const v0_ = v;
    if (a.t === 'mv' && s.twp && p === 0 && s.act) { const o = s.ops[s.act.op], G = E.twGoals(s, o); if (G.length) { const Fs = s.twp >= 7 ? G.map(g => aoField(s, g)) : null; const d0 = Fs ? Math.min(...Fs.map(F => F(o))) : Math.min(...G.map(g => E.D(o, g))), d1 = Fs ? Math.min(...Fs.map(F => F(a))) : Math.min(...G.map(g => E.D(a, g))); v += (s.twp >= 7 ? 0.14 : 0.05) * Math.max(-1, (d0 - d1) / 6); } } // Tomb World: avanzar hacia el objetivo de la misión
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g6'); tags.push('g6'); } }
    { const v0_ = v;
    if (s.ao >= 2 && s.act && p < 2) { const o = s.ops[s.act.op]; const g = aoGoal(s, o); if (g) { if (a.t === 'mv') { const F = aoField(s, g); v += (s.ao === 3 && (s.carry[s.aoObj] === o.i || (o.i % 2 === 0 && o.y > 17 && (s.ep || []).some(x => x.lock))) ? 0.2 : 0.06) * Math.max(-1, (F(o) - F(a)) / 6); } if (a.t === 'tele' && s.ao === 3 && s.carry[s.aoObj] === o.i) v += 0.3; if (a.t === 'breach' && s.ao === 3) v += 0.3; } if (a.t === 'mission' && s.ao >= 2) v += 0.06; }
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g7'); tags.push('g7'); } }
    { const v0_ = v;
    if (a.t === 'breach' && s.twp >= 7 && s.act) { const o = s.ops[s.act.op]; const G = E.twGoals(s, o); if (G.length && G.some(g => aoField(s, g, true)(o) > aoField(s, g)(o) + 3)) v += 0.3; }
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g8'); tags.push('g8'); } }
    { const v0_ = v;
    if (a.t === 'tele' && s.twp >= 7 && s.act) { const o = s.ops[s.act.op]; const tp = E.telePair(s, o); const G = E.twGoals(s, o); if (tp && G.length) { const Fs = G.map(g => aoField(s, g)); const f0 = Math.min(...Fs.map(F => F(o))), f1 = Math.min(...Fs.map(F => F(tp.B))); if (f1 < f0 - 1) v += 0.3; } }
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g9'); tags.push('g9'); } }
    { const v0_ = v;
    if (a.t === 'hatch' && (s.twp >= 7 || s.ao >= 2)) v += 0.12;
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g10'); tags.push('g10'); } }
    { const v0_ = v;
    if (s.ao === 3 && s.act && a.t === 'mv' && s.carry[s.aoObj] >= 0 && s.carry[s.aoObj] !== s.act.op && (s.ep || []).some(e => !e.lock && [e.a, e.b].some(P => Math.hypot(a.x - P.x, a.y - P.y) < 2.3))) v -= 0.15; // no estorbar el Entryway del portador
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g11'); tags.push('g11'); } }
    { const v0_ = v;
    if (a.t === 'end') v -= 0.002 * (s.act.ap > 0 ? s.act.ap : 0); // tiny push to use AP
    if (v !== v0_) { v = v0_ + (v - v0_) * mulT('g12'); tags.push('g12'); } }
    cscore.push([v, a]); tagOf.set(a, tags);
    if (v > bv) { bv = v; best = a; }
  }
  if (L.look && cscore.length > 1) { // nivel difícil: amenaza del rival tras la acción (respuesta aproximada), con peso aprendido
    const top = cscore.slice().sort((x, y) => y[0] - x[0]).slice(0, L.top || 4); let b2 = -1e9;
    for (const [v0, a0] of top) { const c = E.clone(s); E.apply(c, a0); const v1 = v0 - bon('threat') * threatOf(c, p); if (v1 > b2) { b2 = v1; best = a0; bv = v0; } }
  }
  for (const tg of tagOf.get(best) || []) bonPick(p, 'm:' + tg);
  bonPick(p, best.t === 'shoot' || best.t === 'fight' ? best.t : best.t === 'mv' && ['fb', 'rep', 'dash'].includes(best.k) && s.act && retreatScore(s, s.ops[s.act.op], best) > 0 ? 'retreat' : best.t === 'ga' || best.t === 'lunge' || best.t === 'signal' || best.t === 'sac' ? best.t : 'x');
  if (best.t === 'end' || bv <= base - 0.0005) return { t: 'end' };
  return best;
}

/* ---------- decisiones pendientes: interrupción de guardia y reacción ---------- */
function choosePend(s, p, L, W) {
  const base = value(features(s, p), W);
  if (s.pend.kind === 'guard') {
    let best = { t: 'ipass' }, bv = base;
    for (const gi of s.pend.ops) {
      const g = s.ops[gi];
      for (const op of E.guardOptions(s, g)) {
        const a = { t: 'intr', op: gi, k: op.k, tg: op.tg, wi: op.wi };
        const v = evalAction(s, a, p, W, L.samples + 1) + (op.pb ? -0.01 : 0);
        if (v > bv + 0.0005) { bv = v; best = a; }
      }
    }
    return best;
  }
  if (s.pend.kind === 'eqp') return { t: 'eqp', n: s.pend.pcs[0].n }; // piezas de equipo: posición sugerida por el motor
  if (s.pend.kind === 'dply') return { t: 'dply', op: s.pend.ops[0] }; // despliegue: casilla sugerida por el motor
  if (s.pend.kind === 'pprim') return { t: 'pprim', v: 'kill' }; // operación principal: Asesinato (política previa)
  if (s.pend.kind === 'exprep') { // Explorar → Reposicionar: el agente y destino que mejor valora la evaluación
    let kb = { t: 'exprepx' }, kv = -1e9;
    for (const oi of (s.pend.ops || [])) {
      const c = E.clone(s); E.apply(c, { t: 'exprep', op: oi }); if (!c.act) continue;
      for (const a of candidates(c)) { if (a.t === 'end') continue; const v = evalAction(c, a, p, W, 1); if (v > kv) { kv = v; kb = { t: 'exprep', op: oi }; } }
    }
    return kb;
  }
  if (s.pend.kind === 'seize') { // Seize the Initiative: acción gratuita sin mover
    let kb = { t: 'spass' }, kv = base;
    for (const oi of (s.pend.ops.length && optTake(s, p, 'o:seize', E.fpWant(s, p, 'seize') ? 1.5 : -1.5) ? s.pend.ops : [])) {
      const c = E.clone(s); E.apply(c, { t: 'seize', op: oi }); if (!c.act) continue;
      for (const a of candidates(c)) { if (a.t === 'end') continue; const v = evalAction(c, a, p, W, 1); if (v > kv + 0.002) { kv = v; kb = { t: 'seize', op: oi }; } }
    }
    return kb;
  }
  if (s.pend.kind === 'quarry') { // Quarry: la presa más valiosa (la que más daño recibe por herida) y cercana
    const me = s.ops.filter(e => e.alive && e.p === s.pend.p); const best = s.pend.ops.map(i => s.ops[i]).sort((x, y) => (Math.min(...me.map(m => E.D(m, x))) + x.w * 0.5) - (Math.min(...me.map(m => E.D(m, y))) + y.w * 0.5))[0];
    return { t: 'quarry', tg: best.i };
  }
  if (s.pend.kind === 'worthy') { // A Worthy Cause: acción de misión gratuita (siempre que haya objetivo)
    return s.pend.ops.length && optTake(s, s.pend.p, 'o:worthy', E.fpWant(s, s.pend.p, 'worthy') ? 2 : -1.5) ? { t: 'worthy', op: s.pend.ops[0] } : { t: 'wpass' };
  }
  if (s.pend.kind === 'scarper') { // Scarper: Correr gratis si mejora la valoración
    let kb = { t: 'scpass' }, kv = base;
    for (const oi of (s.pend.ops || [])) { const c = E.clone(s); E.apply(c, { t: 'scarper', op: oi }); if (!c.act) continue;
      for (const a of candidates(c)) { if (a.t !== 'mv') continue; const v = evalAction(c, a, p, W, 1); if (v > kv + 0.002) { kv = v; kb = { t: 'scarper', op: oi }; } } }
    return kb;
  }
  if (s.pend.kind === 'bcnet') { // Network Counteract: acción de 1 PA si mejora la valoración
    let kb = { t: 'bcpass' }, kv = base;
    for (const oi of (s.pend.ops || [])) for (const od of ['engage', 'conceal']) {
      const c = E.clone(s); E.apply(c, { t: 'bcnet', op: oi, order: od }); if (!c.act) continue;
      for (const x of candidates(c)) { if (x.t === 'end') continue; const v = evalAction(c, x, p, W, 1); if (v > kv + 0.002) { kv = v; kb = { t: 'bcnet', op: oi, order: od }; } }
    }
    return kb;
  }
  if (s.pend.kind === 'insid') { // Insidious: Correr gratis oculto; solo si mejora la valoración
    let kb = { t: 'ipass2' }, kv = base;
    for (const oi of (s.pend.ops || [])) {
      const c = E.clone(s); E.apply(c, { t: 'insid', op: oi }); if (!c.act) continue;
      for (const a of candidates(c)) { if (a.t !== 'mv') continue; const v = evalAction(c, a, p, W, 1); if (v > kv + 0.002) { kv = v; kb = { t: 'insid', op: oi }; } }
    }
    return kb;
  }
  if (s.pend.kind === 'krump') { // Krump 'Em!: acción gratuita de Combatir al final de la fase
    let kb = { t: 'kpass' }, kv = base;
    for (const oi of (s.pend.ops || [])) {
      const c = E.clone(s); E.apply(c, { t: 'krump', op: oi }); if (!c.act) continue;
      for (const a of candidates(c)) { if (a.t !== 'fight') continue; const v = evalAction(c, a, p, W, 1); if (v > kv + 0.002) { kv = v; kb = { t: 'krump', op: oi }; } }
    }
    return kb;
  }
  // reaccionar: probar cada agente usado con una acción de 1 PA
  let best = { t: 'rpass' }, bv = base;
  for (const oi of (s.pend.ops || [])) {
    const c = E.clone(s); E.apply(c, { t: 'react', op: oi });
    if (!c.act) continue;
    for (const a of candidates(c)) {
      if (a.t === 'end' || a.t === 'ga') continue;
      const v = evalAction(c, a, p, W, 1);
      if (v > bv + 0.002) { bv = v; best = { t: 'react', op: oi, then: a }; }
    }
  }
  return best;
}

/* ---------- learning ---------- */
export function learn(W, samples, outcome, lr = 0.05) {
  // samples: array of feature vectors (from the perspective of the player who got `outcome`: 1 win, 0.5 draw, 0 loss)
  const g = new Array(W.length).fill(0);
  for (const f of samples) { const v = value(f, W); const err = outcome - v; for (let i = 0; i < W.length; i++) g[i] += err * f[i]; }
  const n = Math.max(1, samples.length);
  for (let i = 0; i < W.length; i++) W[i] += lr * g[i] / n * 4;
  return W;
}
export function outcomeFor(s, p) { return s.winner === -1 ? 0.5 : (s.winner === p ? 1 : 0); }

/* ===== Blood and Zeal (IA) ===== */
const bzTried = { k: '' };
function bzPend(s) {
  const pd = s.pend, p = pd.p, B = s.bz;
  if (pd.stage === 'bzd') {
    const cnt = ty => B.hand[p].concat(B.disc[p]).filter(i => E.BZ[i].t === ty).length; let v = cnt('b') <= cnt('z') ? 'b' : 'z';
    if (!B.deck[v].length) v = v === 'b' ? 'z' : 'b'; return { t: 'bzd', v };
  }
  if (pd.stage === 'bzl') { const good = ['b_crit', 'b_maxA', 'b_dshot', 'b_dstrike', 'b_rrA', 'z_revive', 'z_maxD', 'z_critD', 'z_cp', 'z_heal', 'z_free', 'z_ndshot', 'z_ndstrike']; return { t: 'bzd', v: good.includes(pd.look) ? 'take' : 'other' }; }
  if (pd.stage === 'bzp') {
    const low = ['z_reveal', 'b_pmiss', 'b_return', 'z_apl', 'b_steal', 'z_ploy', 'b_ploy'];
    if (B.hand[p].length) { const h = B.hand[p].slice().sort((x, y) => low.indexOf(y) - low.indexOf(x))[0]; return { t: 'bzp', h }; }
    return { t: 'bzp', d: B.disc[p].slice(-2) };
  }
  if (pd.stage === 'bze') {
    const foes = s.ops.filter(e => e.alive && e.p !== p && !e.ug); const sc = i => { const o = s.ops[i]; return -Math.min(99, ...foes.map(e => E.D(o, e))); };
    const v = pd.ops.slice().sort((x, y) => sc(y) - sc(x))[0]; return { t: 'bze', v, ord: 'engage' };
  }
  return { t: 'bzd', v: 'b' };
}
function bzAI(s) {
  const p = s.active, B = s.bz; if (s.act.p !== p && !B.hand[p].includes('z_cp')) return null; const o = s.ops[s.act.op];
  for (const id of E.BZ_OUT) {
    if (!E.bzWin(s, p, id)) continue; let a = { t: 'bz', p, id };
    if (id === 'z_heal' && o.W - o.w < 3) continue;
    if (id === 'z_free' && s.act.ap < 1) continue;
    if (id === 'z_apl') { const opts = E.bzAplOpts(s, p); const ob = opts.find(i => s.ops.some(e => e.alive && e.p !== p && !e.ug && E.contestsOb(s, e, i))); if (ob == null) continue; a.ob = ob; }
    if (id === 'z_ploy') { if (s.cp[p] < 3) continue; a.v = E.bzPloyOpts(s, p)[0]; if (!a.v) continue; }
    if (id === 'b_return') { const d = B.disc[1 - p]; a.v = d[d.length - 1]; }
    const key = id + ':' + s.actSeq + ':' + s.act.op + ':' + s.act.ap + ':' + s.tp + ':' + B.hand[p].length; if (bzTried.k === key) continue; bzTried.k = key; if (!optTake(s, p, 'bz:' + id, 2)) continue;
    return a;
  }
  return null;
}
