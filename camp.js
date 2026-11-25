/* Ctesiphus Expedition — campaña de mapa hexagonal (reglas del PDF «Ctesiphus Expedition»), modo solo/cooperativo.
   Lógica pura (testeable en Node) + pequeña interfaz SVG (mountCampaign). */

/* ---------- tablas D36 ---------- */
const R = (n, t) => ({ n, t });
export const SL = { // localizaciones de superficie
  11: R('Ruina', 'Sin reglas adicionales. No se vuelve a tirar si sale más de una vez.'),
  21: R('Fisura tectónica', 'Este hexágono queda bloqueado.'),
  22: R('Campamento abandonado', 'Al explorarlo, tira 1D6 = Puntos de Suministro (PS) que contiene. Buscar: gana D3 de sus PS.'),
  23: R('Edificios criovolcánicos', 'Buscar: gasta 1 o 2 PS y tira 1 o 2 D3: 1 nada; 2 ganas D3 PS; 3 ganas 1 PC. Cada resultado 2 y 3, una vez por campaña.'),
  24: R('Impacto de asteroide', 'No se puede Reabastecer aquí. Maniobra: +1 PS para ir a un hex de superficie desde aquí; −1 PS para ir a uno de tumba.'),
  25: R('Zona de aterrizaje', 'Acampar aquí cuesta 1 PS. Reabastecer aquí da D3 PS adicionales.'),
  26: R('Torre de observación', 'Buscar: Explorar gratis (cualquier hex de superficie sin explorar) o un hex a ≤3 generando 2 resultados y eligiendo. Campamento: al explorar superficie generas 2 resultados y eliges; Explorar nunca cuesta más de 1 PS en superficie.'),
  31: R('Nave estrellada', 'Al explorarlo, tira 1D6 = información. Buscar: gana D3 de información; cada una = Explorar gratis cualquier hex de superficie sin explorar.'),
  32: R('Alijo de recursos', 'Al explorarlo, tira 2D6 = PS que contiene. Buscar: gana D6 de sus PS.'),
  33: R('Estelas estelares', 'Buscar: D3: 1 nada; 2 mueves tu equipo a otro hex de superficie; 3 a un hex de tumba. Campamento: +1 PC.'),
  34: R('Obelisco de piedra negra', 'Buscar: +1 PC (una vez por campaña). Campamento: +1 PC.'),
  35: R('Fortaleza abandonada', 'La primera vez que se Acampe aquí puedes mover tu base aquí (la anterior pasa a Campamento abandonado) y ganas 1 PC. Campamento: +1 PC (no si moviste la base). Buscar: gana D3 PS.'),
  36: R('Guarida de bestia', 'Fase de amenaza: si estás a ≤2 hex de superficie, tira D6 + (distancia, máx. 2); con 5+ no te ataca; si no, pierdes D6 PS. No se puede Acampar hasta Demoler (no en la misma ronda en que se explora).'),
};
export const TL = { // localizaciones de tumba
  11: R('Ruina', 'Sin reglas adicionales. No se vuelve a tirar si sale más de una vez.'),
  21: R('Portal transdimensional', 'Buscar: elige un hex de tumba y uno de superficie. Al iniciar Maniobra aquí puedes ir a uno de ellos (distancia 1) y seguir hasta 2 hex más. 1 vez por ronda.'),
  22: R('Laberinto de transeptos', 'Maniobra: salir de este hex cuesta 1 PS más. Campamento: no se puede Demoler aquí (salvo por el Almacén del Juicio Final) e ignoras la regla anterior.'),
  23: R('Crisol de susurros', 'Al explorarlo, tira D3 = PC que contiene. Buscar: 1/3/5 PS y tira 1/2/3 D6: cualquier 5+ = ganas 1 de sus PC. Campamento: al inicio de la amenaza tira D6: 5+ = 1 de sus PC.'),
  24: R('Santuario de células de energía', 'La primera vez que se Demuela: pierdes D6 PS si tu equipo está en tumba (en solitario, solo amenaza +D3) y ya no se puede Acampar. Campamento: +1 PC.'),
  25: R('Fulcro transtécnico', 'Buscar: elige otro hex de tumba para bloquearlo (se desbloquea el anterior). Campamento: al final de la campaña, con 5+ PS ganas 1 PC.'),
  26: R('Punto caliente de energía', 'Campamento: +1 PC y +1 PS al inicio de cada fase de amenaza.'),
  31: R('Terminal vivitrófica', 'Buscar: tira 2D6 y puedes gastar esa cantidad de PS para ganar 1 PC (una vez por campaña). Campamento: al final de la campaña, con 5+ PS ganas 1 PC.'),
  32: R('Ataúd hiperfractal', 'Primer Acampar aquí: se libera al prisionero. Demoler: lo elimina. Campamento: mueve al prisionero D3 hex al inicio de la amenaza (sin efecto en solitario).'),
  33: R('Cripta de revivificación', 'Al inicio de la fase de acción, Reabastecer gratis si estás aquí. Campamento: al inicio de la amenaza D3: con 2+ ganas ese número de PS.'),
  34: R('Augurio astral', 'Buscar: la primera vez D3 PC (una vez por campaña).'),
  35: R('Almacén del Juicio Final', 'Al explorarlo, tira D3 = PS adicionales que cuesta Buscar. Buscar: elige un hex de tumba, Demuélelo gratis (quita tu campamento), queda bloqueado y ganas 1 PC. En solitario: amenaza +D3.'),
  36: R('Matriz dimensional', 'Buscar: obtienes la llave dimensional. En Movimiento: Maniobra dimensional = a cualquier hex por 1 PS (pierdes la llave).'),
};
export const SC = { // condiciones de superficie (id de batalla = 'SC<n>')
  11: R('Condiciones despejadas', 'Sin reglas adicionales.'),
  21: R('Tormentas de polvo', 'Empeora 1 el Impacto de las armas a distancia, salvo que haya terreno pesado a su alcance de control, esté en una fortaleza o bajo terreno Vantage.'),
  22: R('Campo de radiación', 'Al activarse un operativo sin terreno pesado a su alcance de control, tira D6: si es menor que su Salvación, recibe daño igual al dado.'),
  23: R('Tierra marchita', 'En el paso Preparar de cada fase de estrategia, 1 daño a cada operativo sobre el suelo (no en fortaleza).'),
  24: R('Ataque con misiles', 'En la primera fase de estrategia tira D3+1: en ese punto de inflexión, D6+3 daño a cada operativo a ≤6" del centro.'),
  25: R('Campo minado', 'Un marcador de Minas en el centro de cada objetivo; cada jugador debe llevar Minas y hasta 5 equipos.'),
  26: R('Montículos de cráneos', 'El ganador gana 1 PC adicional (una vez por campaña).'),
  31: R('Temblores subterráneos', 'Carga: −1" al Movimiento. Correr: −1" de distancia.'),
  32: R('Campo de partículas exóticas', 'Al disparar con la línea central interpuesta, repites un éxito crítico (o normal).'),
  33: R('Vegetación metálica', 'Cada jugador lleva barricada pesada (hasta 5 equipos). Cruzar una barricada pesada a ≤1": D3 daño. Carga −1" Mov., Correr −1".'),
  34: R('Fragmentos girománticos', 'Al disparar, si algún dado de ataque es 1, repites todos los dados.'),
  35: R('Ventisca criofluxiva', 'Al cargar: tira D6; si supera el APL, tu rival mueve tu operativo hacia el enemigo elegido.'),
  36: R('Anomalía gravítica', 'Una vez por PI, un operativo que se mueva puede VOLAR (se recoloca a ≤ su Movimiento).'),
};
export const TC = { // condiciones de tumba
  11: R('Condiciones despejadas', 'Sin reglas adicionales.'),
  21: R('Oscuridad', 'Al disparar a un operativo a más de 8", el objetivo está oculto.'),
  22: R('Enjambre de escarabajos', 'Un marcador de enjambre en el centro se mueve 2D3" hacia el operativo más cercano cada fase de estrategia; D3 daño una vez por activación si está a su alcance.'),
  23: R('Ruptura de tesla', 'En la 2.ª y 4.ª fase de estrategia, 1 daño a cada operativo con Muro a su alcance (o junto a uno que lo tenga).'),
  24: R('Error de sistema automático', 'En cada fase de estrategia, una escotilla aleatoria cambia (abierta/cerrada).'),
  25: R('Estructura debilitada', 'Brecha y Operar escotilla cuestan 1 PA menos.'),
  26: R('Fatiga de la cripta', 'Cada fase de estrategia, N operativos (N = punto de inflexión) restan 1 APL hasta el final de su siguiente activación.'),
  31: R('Difusión temporal', 'Al activarse un operativo, D6: 1-2 → −1" Mov.; 3-4 nada; 5+ → +1" Mov.'),
  32: R('Brecha hiperespacial', 'Un operativo aleatorio de cada equipo se retira y reaparece en la 2.ª fase de estrategia (a ≤6" del borde o ≤3" de un amigo).'),
  33: R('Defunción xenoviral', 'Al incapacitarse un operativo, cada otro a ≤2": D6, con 4+ recibe 2 de daño.'),
  34: R('Tumba que colapsa', 'En la 2.ª fase de estrategia, D3 daño a cada operativo con punto de brecha a su alcance; luego se abren todos los puntos de brecha.'),
  35: R('Trampas de red nanotejida', 'Al terminar Correr, D6: con 1 recibe un token Web (no puede hacer acciones de movimiento).'),
  36: R('Acoso neurotécnico', 'Al activarse un operativo que disputa un objetivo, D6: 1-2 → su APL cuenta 1 menos para controlar marcadores hasta su siguiente activación.'),
};
/* condiciones que el motor aplica automáticamente en la batalla */
export const AUTO_COND = new Set(['SC22', 'SC23', 'SC24', 'SC26', 'SC31', 'TC21', 'TC23', 'TC24', 'TC25', 'TC31', 'TC33', 'TC34', 'SC11', 'TC11', 'SC21', 'TC26', 'TC36', 'SC32', 'SC34', 'SC36', 'TC35', 'TC32', 'TC22', 'SC25', 'SC33', 'SC35']);

const row = (t, k) => t[k] || t[11];
function rng(C) { C.rs = (C.rs + 0x6D2B79F5) | 0; let t = Math.imul(C.rs ^ (C.rs >>> 15), 1 | C.rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const d = (C, n) => 1 + Math.floor(rng(C) * n);
const d36 = C => d(C, 3) * 10 + d(C, 6);
const norm = k => k >= 11 && k <= 16 ? 11 : k;
const clampSP = v => Math.max(0, Math.min(10, v));

/* ---------- mapas (alturas de columna; las 26/33/36/37/52 casillas de los mapas del PDF) ---------- */
export const MAPS = [
  { n: 'Mapa pequeño (26 hex)', cols: [4, 5, 5, 5, 4, 3] },
  { n: 'Mapa medio (33 hex)', cols: [5, 6, 6, 6, 5, 5] },
  { n: 'Mapa medio (36 hex)', cols: [6, 6, 6, 6, 6, 6] },
  { n: 'Mapa medio (37 hex)', cols: [4, 5, 6, 7, 6, 5, 4] },
  { n: 'Mapa grande (52 hex)', cols: [5, 6, 7, 8, 7, 6, 5, 4, 4] },
];
const HX = 0.8660254;
function build(map) {
  const H = [], hmax = Math.max(...map.cols); let id = 1;
  map.cols.forEach((h, c) => { const sh = Math.floor((hmax - h) / 2); for (let r = 0; r < h; r++) H.push({ id: id++, c, r, x: c * HX, y: r + sh + 0.5 * (c % 2), type: 'S', expl: false, loc: null, cond: null, qty: 0, extra: 0 }); });
  for (const a of H) a.adj = H.filter(b => b !== a && ((Math.abs(Math.abs(a.x - b.x) - HX) < 0.01 && Math.abs(Math.abs(a.y - b.y) - 0.5) < 0.01) || (Math.abs(a.x - b.x) < 0.01 && Math.abs(Math.abs(a.y - b.y) - 1) < 0.01))).map(b => b.id);
  const cen = H.reduce((s, h) => ({ x: s.x + h.x / H.length, y: s.y + h.y / H.length }), { x: 0, y: 0 });
  const dist = H.map(h => ({ h, d: Math.hypot(h.x - cen.x, h.y - cen.y) })).sort((a, b) => a.d - b.d);
  const nT = Math.round(H.length * 0.36); for (let i = 0; i < nT; i++) dist[i].h.type = 'T';
  const far = dist.slice().reverse(); let nb = 0; for (const f of far) { if (nb >= (H.length > 40 ? 4 : 3)) break; if (f.h.adj.length <= 4 && !H.some(o => o.type === 'B' && f.h.adj.includes(o.id))) { f.h.type = 'B'; nb++; } }
  return H;
}
const SEARCHABLE = new Set([1022, 1023, 1026, 1031, 1032, 1033, 1034, 1035, 2021, 2023, 2025, 2031, 2034, 2035, 2036]);
const hexOf = (C, id) => C.H.find(h => h.id === id);
export function hexDist(C, a, b) { // distancia en hex ignorando bloqueos
  const seen = new Map([[a, 0]]); const q = [a]; while (q.length) { const x = q.shift(); if (x === b) return seen.get(x); for (const n of hexOf(C, x).adj) if (!seen.has(n)) { seen.set(n, seen.get(x) + 1); q.push(n); } } return 99;
}
function pathDist(C, a, b) { // evita bloqueados
  const seen = new Map([[a, 0]]); const q = [a]; while (q.length) { const x = q.shift(); if (x === b) return seen.get(x); for (const n of hexOf(C, x).adj) if (!seen.has(n) && hexOf(C, n).type !== 'B') { seen.set(n, seen.get(x) + 1); q.push(n); } } return 99;
}

/* ---------- campaña ---------- */
export function newCampaign(o = {}) {
  const mp = Number.isInteger(o.map) ? o.map : 1;
  const C = { v: 1, seed: o.seed || ((Math.random() * 1e9) | 0), rs: 0, map: mp, H: build(MAPS[mp]), threat: 0, round: 1, phase: 'base', over: false, success: false, log: [], lowered: 0, key: false, ptl: null, ptlUsed: -1, fulc: 0, prevBase: [], lastBattle: null, won: 0, played: 0, spent: 0, expl: 0, inc: 0, cp: 0, sp: 10, hex: 0, base: 0, camps: [], moved: false, mustMove: false, did: {}, once: {}, cs: o.cs || 'Mi equipo' };
  C.rs = C.seed | 0; return C;
}
export function chooseBase(C, id) {
  const h = hexOf(C, id); if (!h || h.type !== 'S') return false;
  h.expl = true; h.loc = 'BASE'; h.cond = 11; C.base = id; C.hex = id; C.phase = 'move'; log(C, `Base en el hex ${id}.`); return true;
}
function log(C, m) { C.log.push(`R${C.round}: ${m}`); if (C.log.length > 200) C.log.shift(); }
const locOf = h => h.loc === 'BASE' ? null : (h.type === 'S' ? SL : TL)[norm(h.loc)];
export const hexName = h => h.loc === 'BASE' ? 'Base' : h.loc ? locOf(h).n : '—';
export const hexCond = h => h.cond ? (h.type === 'S' ? SC : TC)[norm(h.cond)] : null;
export const condId = h => h.cond ? (h.type === 'S' ? 'SC' : 'TC') + norm(h.cond) : null;
const hasLoc = (C, type, k) => C.H.some(h => h.type === type && h.loc === k);
const here = C => hexOf(C, C.hex);
const hereLoc = C => { const h = here(C); return h.loc === 'BASE' ? 0 : norm(h.loc) + (h.type === 'S' ? 1000 : 2000); }; // 1022 = SL22, 2035 = TL35
const camp = (C, code) => C.camps.some(id => { const h = hexOf(C, id); return h && (h.type === 'S' ? 1000 : 2000) + norm(h.loc) === code && !(C.fulc === id); });
const campHere = C => C.camps.includes(C.hex);

/* Explorar un hex (libro p. 7) */
export function explore(C, id, scout) {
  const h = hexOf(C, id); if (!h || h.expl || h.type === 'B' || h.loc === 'BASE') return null;
  const T = h.type === 'S' ? SL : TL;
  const used = k => C.H.some(o => o.expl && o.type === h.type && o !== h && o.loc != null && norm(o.loc) === k);
  const usedC = k => C.H.some(o => o.expl && o.type === h.type && o !== h && o.cond != null && norm(o.cond) === k);
  const gen = (u, ex) => { for (let i = 0; i < 60; i++) { const k = norm(d36(C)); if (k === ex || !u(k)) return k; } return 11; };
  let l = gen(used, 11);
  if (h.type === 'S' && (camp(C, 1026) || (C.hex === id && false))) { const l2 = gen(used, 11); if ((l === 11 || l === 21) && l2 !== 11) l = l2; log(C, 'Torre de observación (campamento): generas 2 resultados y eliges el mejor.'); }
  h.loc = l; h.cond = gen(usedC, 11); h.expl = true; C.expl++;
  const code = (h.type === 'S' ? 1000 : 2000) + l;
  if (code === 1022) h.qty = d(C, 6); else if (code === 1031) h.qty = d(C, 6); else if (code === 1032) h.qty = d(C, 6) + d(C, 6); else if (code === 2023) h.qty = d(C, 3); else if (code === 2035) h.extra = d(C, 3);
  h.explRound = C.round; if (code === 1021) { h.type = 'B'; if (C.hex === id) C.mustMove = true; }
  log(C, `Explorado hex ${id}: ${h.type === 'B' ? 'Fisura tectónica (bloqueado)' : (T[l].n + ' · ' + (hexCond(h) || { n: '' }).n)}`);
  if (h.type === 'T' && !scout) threatRoll(C, 4, 'explorar tumba');
  return h;
}
function threatRoll(C, min, why) { const r = d(C, 6); if (r >= min) { C.threat++; log(C, `Amenaza +1 (${why}: D6=${r}).`); checkEnd(C); } else log(C, `${why}: D6=${r}, sin aumento de amenaza.`); }
function checkEnd(C) { if (C.threat >= 10) C.threatMax = true; }

/* ---------- movimiento ---------- */
function stepCost(C, from, to) {
  let c = 1; const a = hexOf(C, from), b = hexOf(C, to);
  if (a.loc === 22 && a.type === 'T' && !camp(C, 2022)) c += 1;
  if (a.type === 'S' && norm(a.loc) === 24) { if (b.type === 'S') c += 1; else c -= 1; }
  return Math.max(0, c);
}
/* hexes alcanzables con Maniobra: {id: coste} */
export function reach(C) {
  const out = new Map(); const start = C.hex; const best = new Map([[start, 0]]); const q = [[start, 0, 0]];
  const portal = C.ptl && here(C).type === 'T' && norm(here(C).loc) === 21 ? C.ptl : null;
  const push = (id, steps, cost) => { if (hexOf(C, id).type === 'B') return; if (best.has(id) && best.get(id) <= cost) return; best.set(id, cost); q.push([id, steps, cost]); };
  while (q.length) { const [id, steps, cost] = q.shift(); if (cost > C.sp) continue; if (id !== start) out.set(id, Math.min(out.get(id) ?? 99, cost)); if (steps >= 3) continue; for (const n of hexOf(C, id).adj) { const c = cost + stepCost(C, id, n); if (c <= C.sp) push(n, steps + 1, c); } if (id === start && portal) for (const p of portal) { push(p, 1, cost); } }
  out.delete(start); return out;
}
export function maneuver(C, id) {
  if (C.phase !== 'move') return false; const r = reach(C); if (!r.has(id)) return false;
  C.sp = clampSP(C.sp - r.get(id)); C.hex = id; C.mustMove = false; C.phase = 'battle'; log(C, `Maniobra a hex ${id} (−${r.get(id)} PS).`);
  const h = hexOf(C, id); if (!h.expl) explore(C, id, false); return true;
}
export function dimManeuver(C, id) {
  if (C.phase !== 'move' || !C.key || C.sp < 1 || hexOf(C, id).type === 'B' || id === C.hex) return false;
  C.sp -= 1; C.key = false; C.hex = id; C.mustMove = false; C.phase = 'battle'; log(C, `Maniobra dimensional a hex ${id}.`); if (!hexOf(C, id).expl) explore(C, id, false); return true;
}
function nearestAnchor(C, fromId) {
  const anchors = [C.base, ...C.camps].filter(a => hexOf(C, a).type !== 'B' && C.fulc !== a);
  const ds = anchors.map(a => ({ a, d: hexDist(C, fromId, a) })).filter(x => x.a !== fromId).sort((x, y) => x.d - y.d); return ds[0];
}
export function regroup(C) {
  if (C.phase !== 'move') return false; const n = nearestAnchor(C, C.hex); if (!n) return false; C.hex = n.a; C.mustMove = false; C.phase = 'battle'; log(C, `Reagrupar al hex ${n.a}.`); return true;
}
export function hold(C) { if (C.phase !== 'move' || C.mustMove) return false; C.phase = 'battle'; log(C, 'Mantener posición.'); return true; }

/* ---------- batalla ---------- */
export function battleCond(C) { const h = here(C); return h.loc === 'BASE' ? 'TC11' : condId(h); }
export function battleKind(C) { return here(C).type === 'T' ? 'tomb' : 'surface'; }
/* res: {win:bool, draw:bool, inc: nº de operativos enemigos incapacitados (ya ponderado)} */
export function battleResult(C, res) {
  if (C.phase !== 'battle') return false; C.played++; C.inc += res.inc || 0; C.wonRound = !!res.win;
  if (res.win) { C.won++; C.cp++; log(C, 'Victoria: +1 PC.'); const h = here(C); if (h.type === 'S' && norm(h.cond) === 26 && !C.once.skull) { C.once.skull = 1; C.cp++; log(C, 'Montículos de cráneos: +1 PC.'); } } else { C.sp = clampSP(C.sp + 1); log(C, (res.draw ? 'Empate' : 'Derrota') + ': +1 PS.'); }
  threatRoll(C, res.win ? 3 : 5, 'fin de batalla'); C.phase = 'action'; C.did = {}; C.actionN = 0;
  if (hereLoc(C) === 2033 && !C.did.freeRes) { C.did.freeRes = 1; resupply(C, true); }
  return true;
}

/* ---------- acciones ---------- */
const spend = (C, n) => { C.sp -= n; C.spent += n; };
function canAct(C) { return C.phase === 'action' && !C.did.act; }
export function scoutCost(C, id) { const h = hexOf(C, id); return (C.camps.some(c => hexOf(C, c) && hexOf(C, c).type === 'S' && norm(hexOf(C, c).loc) === 26) && h.type === 'S') ? 1 : hexDist(C, C.hex, id); }
export function scout(C, id) { // gasta tantos PS como la distancia (1-3)
  if (!canAct(C)) return false; const h = hexOf(C, id); if (!h || h.expl || h.type === 'B' || h.loc === 'BASE') return false;
  const dd = hexDist(C, C.hex, id), cost = scoutCost(C, id); if (dd > 3 || dd < 1 || cost > C.sp) return false;
  spend(C, cost); C.did.act = 1; explore(C, id, true); return true;
}
export function resupply(C, free) {
  if (!free && !canAct(C)) return false; const h = here(C); const code = hereLoc(C);
  if (code === 1024 || h.type === 'B') { log(C, 'No se puede Reabastecer aquí.'); return false; }
  let g = h.loc === 'BASE' ? 10 : campHere(C) ? d(C, 3) + 3 : 1; if (code === 1025) g += d(C, 3);
  C.sp = clampSP(C.sp + g); log(C, `Reabastecer: +${g} PS.`); if (!free) C.did.act = 1; return true;
}
export function lowerThreat(C) { // solo/coop: bajar amenaza al Reabastecer (máx. 3 veces por campaña)
  if (C.lowered >= 3 || C.threat <= 0) return false; const inb = C.hex === C.base || campHere(C); const v = inb ? d(C, 3) : 1; C.threat = Math.max(0, C.threat - v); C.lowered++; log(C, `Amenaza −${v}.`); return true;
}
/* Buscar: opts = {sp: PS gastados extra, hex: elección} */
export function search(C, o = {}) {
  if (!canAct(C)) return { ok: false, msg: 'No puedes Buscar ahora.' }; const h = here(C); const code = hereLoc(C);
  if (h.loc === 'BASE' || !SEARCHABLE.has(code)) return { ok: false, msg: 'Este hex no tiene regla de Buscar.' };
  let cost = 1 + (code === 2035 ? h.extra : 0); let msg = '';
  const nothing = { ok: false, msg: 'Este hex no tiene regla de Buscar.' };
  switch (code) {
    case 1022: { if (h.qty <= 0) return { ok: false, msg: 'No quedan PS aquí.' }; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); const g = Math.min(h.qty, d(C, 3)); h.qty -= g; C.sp = clampSP(C.sp + g); msg = `+${g} PS (quedan ${h.qty}).`; break; }
    case 1032: { if (h.qty <= 0) return { ok: false, msg: 'No quedan PS aquí.' }; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); const g = Math.min(h.qty, d(C, 6)); h.qty -= g; C.sp = clampSP(C.sp + g); msg = `+${g} PS (quedan ${h.qty}).`; break; }
    case 1023: { const n = o.sp === 2 ? 2 : 1; cost = n; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); const rs = []; for (let i = 0; i < n; i++) rs.push(d(C, 3)); msg = `D3: ${rs.join(', ')}. `; for (const r of rs) { if (r === 2 && !C.once.cv2) { C.once.cv2 = 1; const g = d(C, 3); C.sp = clampSP(C.sp + g); msg += `+${g} PS. `; } else if (r === 3 && !C.once.cv3) { C.once.cv3 = 1; C.cp++; msg += '+1 PC. '; } } break; }
    case 1026: { if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; const id = o.hex; const t = id && hexOf(C, id); if (!t || t.expl || t.type !== 'S' || t.loc === 'BASE') return { ok: false, msg: 'Elige un hex de superficie sin explorar.' }; spend(C, cost); explore(C, id, true); msg = `Explorado el hex ${id} gratis.`; break; }
    case 1031: { if (h.qty <= 0) return { ok: false, msg: 'No queda información.' }; const id = o.hex; const t = id && hexOf(C, id); if (!t || t.expl || t.type !== 'S' || t.loc === 'BASE') return { ok: false, msg: 'Elige un hex de superficie sin explorar.' }; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); h.qty--; explore(C, id, true); msg = `Información usada: hex ${id} explorado (quedan ${h.qty}).`; break; }
    case 1033: { if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; const r = d(C, 3); if (r >= 2) { const id = o.hex; const t = id && hexOf(C, id); const okT = t && t.type === (r === 2 ? 'S' : 'T') && t.id !== C.hex; if (!okT) return { ok: false, msg: `Sale ${r}: elige un hex de ${r === 2 ? 'superficie' : 'tumba'} distinto (tira de nuevo al elegir).`, need: r === 2 ? 'S' : 'T', roll: r }; spend(C, cost); C.hex = id; if (!t.expl) explore(C, id, false); msg = `D3=${r}: tu equipo se traslada al hex ${id}.`; } else { spend(C, cost); msg = 'D3=1: nada.'; } break; }
    case 1034: { if (C.once.obe) return { ok: false, msg: 'Ya buscaste aquí.' }; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); C.once.obe = 1; C.cp++; msg = '+1 PC.'; break; }
    case 1035: { if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); const g = d(C, 3); C.sp = clampSP(C.sp + g); msg = `+${g} PS.`; break; }
    case 2021: { if (C.ptlUsed === C.round) return { ok: false, msg: 'Una vez por ronda.' }; const a = hexOf(C, o.t), b = hexOf(C, o.s); if (!a || !b || a.type !== 'T' || b.type !== 'S' || !a.expl && false) return { ok: false, msg: 'Elige un hex de tumba y uno de superficie.' }; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); C.ptl = [a.id, b.id]; C.ptlUsed = C.round; msg = `Portal enlazado con los hex ${a.id} y ${b.id}.`; break; }
    case 2023: { if (h.qty <= 0) return { ok: false, msg: 'No quedan PC aquí.' }; const n = o.sp === 5 ? 5 : o.sp === 3 ? 3 : 1; cost = n; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); const dice = n === 1 ? 1 : n === 3 ? 2 : 3; const rs = []; for (let i = 0; i < dice; i++) rs.push(d(C, 6)); msg = `D6: ${rs.join(', ')}. `; if (rs.some(r => r >= 5)) { h.qty--; C.cp++; msg += '+1 PC.'; } break; }
    case 2025: { const t = hexOf(C, o.hex); if (!t || t.type !== 'T' || t.id === C.hex) return { ok: false, msg: 'Elige otro hex de tumba.' }; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); if (C.fulc) { /* desbloquea */ } C.fulc = 0; const prev = C.blkT; if (prev) { const p = hexOf(C, prev); if (p) p.type = 'T'; } t.type = 'B'; C.blkT = t.id; if (C.camps.includes(t.id)) C.fulc = t.id; msg = `Hex ${t.id} bloqueado.`; break; }
    case 2031: { if (C.once.vit) return { ok: false, msg: 'Una vez por campaña.' }; const r = d(C, 6) + d(C, 6); if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); if (C.sp >= r) { spend(C, r); C.cp++; C.once.vit = 1; msg = `2D6=${r}: gastas ${r} PS y ganas 1 PC.`; } else msg = `2D6=${r}: no puedes pagarlo.`; break; }
    case 2034: { if (C.once.aug) return { ok: false, msg: 'Una vez por campaña.' }; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); C.once.aug = 1; const g = d(C, 3); C.cp += g; msg = `+${g} PC.`; break; }
    case 2035: { const t = hexOf(C, o.hex); if (!t || t.type !== 'T' || t.id === C.hex && false || t.loc === 'BASE') return { ok: false, msg: 'Elige un hex de tumba.' }; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); C.camps = C.camps.filter(c => c !== t.id); t.type = 'B'; C.cp++; const th = d(C, 3); C.threat += th; msg = `Hex ${t.id} demolido y bloqueado: +1 PC; amenaza +${th}.`; checkEnd(C); break; }
    case 2036: { if (C.key) return { ok: false, msg: 'Ya tienes la llave.' }; if (C.sp < cost) return { ok: false, msg: 'PS insuficientes.' }; spend(C, cost); C.key = true; msg = 'Obtienes la llave dimensional.'; break; }
    default: return nothing;
  }
  C.did.act = 1; log(C, `Buscar (${hexName(h)}): ${msg}`);
  if (code !== 2035 && code !== 1033 && !(o.noThreat)) { const r = d(C, 6); if (r >= 5) { if (C.sp >= 1 && o.payThreat) { spend(C, 1); log(C, 'Amenaza evitada pagando 1 PS.'); } else { C.threat++; log(C, `Buscar: D6=${r}, amenaza +1.`); checkEnd(C); } } }
  return { ok: true, msg };
}
export function encampCost(C) { const h = here(C); if (hereLoc(C) === 1025) return 1; const n = nearestAnchorCost(C); return n; }
function nearestAnchorCost(C) { const anchors = [C.base, ...C.camps]; let b = 99; for (const a of anchors) b = Math.min(b, pathDist(C, C.hex, a)); return b === 99 ? 1 : b; }
export function encamp(C, o = {}) {
  if (!canAct(C)) return { ok: false, msg: 'No puedes Acampar ahora.' }; const h = here(C); const code = hereLoc(C);
  if (h.type === 'B' || h.loc === 'BASE' || C.camps.includes(C.hex)) return { ok: false, msg: 'No se puede acampar aquí.' };
  if (code === 1036 && !h.beastDead) return { ok: false, msg: 'La bestia lo impide: Demuele primero.' };
  if (code === 2024 && h.noEncamp) return { ok: false, msg: 'El santuario ya no admite campamento.' };
  const cost = encampCost(C); if (cost > C.sp) return { ok: false, msg: 'PS insuficientes.' };
  if (C.camps.length >= 2 && !o.remove) return { ok: false, msg: 'Ya tienes 2 campamentos: elige uno que quitar.', need: 'remove' };
  spend(C, cost); if (C.camps.length >= 2) C.camps = C.camps.filter(c => c !== o.remove); let msg = 'Campamento fundado.';
  if (code === 1035 && !C.once.fort && o.moveBase) { C.once.fort = 1; const old = hexOf(C, C.base); old.loc = 22; old.qty = d(C, 6); old.cond = d36(C); old.expl = true; C.base = C.hex; h.loc = 'BASE'; C.cp++; msg = 'Base trasladada a la Fortaleza (+1 PC).'; }
  else C.camps.push(C.hex);
  if (code === 1035 && !C.once.fort) C.once.fort = 1;
  C.did.act = 1; log(C, `Acampar: ${msg} (−${cost} PS)`); return { ok: true, msg };
}
export function demolish(C) {
  if (!canAct(C)) return { ok: false, msg: 'No puedes Demoler ahora.' }; const h = here(C); const code = hereLoc(C);
  if (C.sp < 3) return { ok: false, msg: 'Cuesta 3 PS.' };
  if (code === 1036 && !h.beastDead) { if (h.explRound === C.round) return { ok: false, msg: 'No en la misma ronda en que se explora.' }; spend(C, 3); h.beastDead = true; C.did.act = 1; log(C, 'La bestia ha sido destruida.'); return { ok: true, msg: 'Bestia destruida.' }; }
  if (code === 2024 && !h.noEncamp) { spend(C, 3); h.noEncamp = true; C.did.act = 1; const th = d(C, 3); C.threat += th; log(C, `Santuario demolido: amenaza +${th}.`); checkEnd(C); return { ok: true, msg: `Amenaza +${th}.` }; }
  if (code === 2032) { spend(C, 3); C.did.act = 1; C.prisoner = 0; return { ok: true, msg: 'Prisionero eliminado.' }; }
  return { ok: false, msg: 'No hay nada que Demoler aquí (en solitario no hay campamentos rivales).' };
}
export function endActions(C) {
  if (C.phase !== 'action') return false; C.phase = 'threat'; threatPhase(C); return true;
}
/* ---------- fase de amenaza ---------- */
function threatPhase(C) {
  for (const id of C.camps) { const h = hexOf(C, id); if (!h || C.fulc === id) continue; const code = (h.type === 'S' ? 1000 : 2000) + norm(h.loc);
    if (code === 2026) { C.sp = clampSP(C.sp + 1); log(C, 'Punto caliente: +1 PS.'); }
    if (code === 2023 && h.qty > 0) { const r = d(C, 6); if (r >= 5) { h.qty--; C.cp++; log(C, 'Crisol de susurros (campamento): +1 PC.'); } }
    if (code === 2033) { const r = d(C, 3); if (r >= 2) { C.sp = clampSP(C.sp + r); log(C, `Cripta de revivificación: +${r} PS.`); } }
  }
  const bl = C.H.find(h => h.loc === 36 && h.type === 'S' && h.expl && !h.beastDead);
  if (bl && C.hex !== bl.id) { const dd = hexDist(C, C.hex, bl.id); if (dd <= 2 && hereType(C) === 'S') { const r = d(C, 6) + Math.min(2, dd); if (r < 5) { const l = d(C, 6); C.sp = clampSP(C.sp - l); log(C, `¡La bestia ataca! −${l} PS.`); } else log(C, 'La bestia no te alcanza.'); } }
  else if (bl && C.hex === bl.id) { const r = d(C, 6); if (r < 5) { const l = d(C, 6); C.sp = clampSP(C.sp - l); log(C, `¡La bestia ataca! −${l} PS.`); } }
  endRound(C);
}
const hereType = C => here(C).type === 'T' ? 'T' : 'S';
function endRound(C) {
  if (C.threat >= 10) { C.over = true; endScore(C); return; }
  C.round++; C.phase = 'move'; C.did = {}; if (here(C).type === 'B') C.mustMove = true; log(C, `Nueva ronda ${C.round}. Amenaza ${C.threat}.`);
}
function endScore(C) {
  for (const id of C.camps) { const h = hexOf(C, id); if (!h || C.fulc === id) continue; const code = (h.type === 'S' ? 1000 : 2000) + norm(h.loc); if ((code === 2025 || code === 2031) && C.sp >= 5) { C.cp++; log(C, `${SL && TL[norm(h.loc)].n}: +1 PC final.`); } }
  C.success = totalCP(C) >= 10; log(C, C.success ? `¡Campaña lograda con ${totalCP(C)} PC!` : `Campaña fracasada: ${totalCP(C)} PC (hacían falta 10).`);
}
const CAMPCP = new Set([1033, 1034, 1035, 2024, 2026]);
export function campCP(C) { return C.camps.filter(id => { const h = hexOf(C, id); return h && C.fulc !== id && CAMPCP.has((h.type === 'S' ? 1000 : 2000) + norm(h.loc)); }).length; }
export const totalCP = C => C.cp + campCP(C);
export function summary(C) { return { cp: totalCP(C), sp: C.sp, threat: C.threat, round: C.round, spent: C.spent, expl: C.expl, played: C.played, won: C.won, inc: C.inc }; }
/* operativos incapacitados ponderados por heridas (≤5: 0; 6-10: 1; ≥11: 2) */
export const incWeight = w => w <= 5 ? 0 : w <= 10 ? 1 : 2;

/* ---------- interfaz ---------- */
const COLS = { S: '#c9d4dc', T: '#5f7a6c', B: '#14181c' };
export function mountCampaign(root, api) {
  let C = null; let sel = 0; let pick = null; let msg = '';
  const save = () => { try { localStorage.setItem('kt_camp', JSON.stringify(C)); } catch (e) { } };
  const load = () => { try { const v = JSON.parse(localStorage.getItem('kt_camp')); if (v && v.v === 1) return v; } catch (e) { } return null; };
  const E = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function hexSvg() {
    const S = 34, W = 0.5774 * S; const xs = C.H.map(h => h.x * S), ys = C.H.map(h => h.y * S);
    const minx = Math.min(...xs) - S, miny = Math.min(...ys) - S * 0.7, maxx = Math.max(...xs) + S, maxy = Math.max(...ys) + S * 0.7;
    let g = ''; const reachM = C.phase === 'move' && !C.over ? reach(C) : new Map();
    for (const h of C.H) {
      const cx = h.x * S, cy = h.y * S, r = 0.5774 * S; const pts = [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 3 * i; return (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1); }).join(' ');
      const can = reachM.has(h.id), isSel = sel === h.id;
      const fill = h.type === 'B' ? COLS.B : !h.expl && h.loc !== 'BASE' ? (h.type === 'T' ? '#7f948a' : '#e6edf1') : h.type === 'T' ? COLS.T : COLS.S;
      g += `<g data-h="${h.id}" style="cursor:pointer"><polygon points="${pts}" fill="${fill}" stroke="${can ? '#ffb020' : isSel ? '#2f86ff' : '#0008'}" stroke-width="${can || isSel ? 3 : 1}"/>`;
      g += `<text x="${cx - r * 0.55}" y="${cy - r * 0.45}" font-size="10" font-weight="700" fill="${h.type === 'B' ? '#fffc' : '#000b'}">${h.id}</text>`;
      if (h.loc === 'BASE') g += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12">🏠</text>`;
      else if (h.expl && h.type !== 'B') g += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="7.5" fill="${h.type === 'T' ? '#fff' : '#111'}">${E(hexName(h).slice(0, 13))}</text>`;
      if (C.camps.includes(h.id)) g += `<text x="${cx + r * 0.3}" y="${cy - r * 0.5}" font-size="11">⛺</text>`;
      if (C.hex === h.id) g += `<circle cx="${cx}" cy="${cy + r * 0.55}" r="6" fill="#ff3b3b" stroke="#fff" stroke-width="1.5"/>`;
      if (can) g += `<text x="${cx}" y="${cy + r * 0.75}" text-anchor="middle" font-size="9" fill="#b36b00" font-weight="700">−${reachM.get(h.id)}</text>`;
      g += '</g>';
    }
    return `<svg viewBox="${minx} ${miny} ${maxx - minx} ${maxy - miny}" style="width:100%;max-height:70vh;background:#0e1319;border-radius:10px">${g}</svg>`;
  }
  function panel() {
    const h = hexOf(C, sel || C.hex) || C.H[0]; let t = '';
    const L = h.loc === 'BASE' ? { n: 'Tu base', t: 'Hexágono de inicio; se Reabastece a 10 PS.' } : h.expl ? locOf(h) : null; const K = h.expl && h.loc !== 'BASE' ? hexCond(h) : null;
    t += `<h4>Hex ${h.id} · ${h.type === 'S' ? 'Superficie' : h.type === 'T' ? 'Tumba' : 'Bloqueado'}</h4>`;
    t += L ? `<p><b>${E(L.n)}</b>${h.qty ? ` · contiene ${h.qty}` : ''}<br>${E(L.t)}</p>` : '<p class="hint">Sin explorar.</p>';
    if (K) { const id = condId(h); t += `<p><b>Condición: ${E(K.n)}</b>${AUTO_COND.has(id) ? ' <span class="tag">automática</span>' : ' <span class="tag" style="opacity:.6">manual</span>'}<br>${E(K.t)}</p>`; }
    return t;
  }
  function actions() {
    let a = ''; const ph = C.phase; const btn = (k, l, dis) => `<button class="btn small" data-a="${k}" ${dis ? 'disabled' : ''}>${l}</button> `;
    if (C.over) return `<h3>${C.success ? '🏆 Campaña lograda' : '☠ Campaña fracasada'}</h3><p>${totalCP(C)} Puntos de Campaña (objetivo: 10 o más).</p>` + btn('new', 'Nueva campaña');
    if (ph === 'base') return '<p>Pulsa un hexágono de <b>superficie</b> para fundar tu base.</p>';
    if (ph === 'move') { a += `<p><b>1. Movimiento</b> ${C.mustMove ? '— tu hex está bloqueado: debes salir' : ''}<br>Maniobra: pulsa un hex naranja (≤3 hex, 1 PS por hex). </p>` + btn('regroup', 'Reagrupar (a base/campamento)') + btn('hold', 'Mantener', C.mustMove) + (C.key ? btn('dim', 'Maniobra dimensional (1 PS): pulsa un hex') : ''); }
    if (ph === 'battle') { const cid = battleCond(C); const K = cid ? (cid[0] === 'S' ? SC : TC)[+cid.slice(2)] : null; a += `<p><b>2. Batalla</b> — condición: <b>${K ? E(K.n) : '—'}</b> (${battleKind(C) === 'tomb' ? 'tumba: usa Tomb World' : 'superficie: Volkus u otro'}).</p>` + btn('fight', '⚔ Jugar la batalla (Joint Ops)') + btn('fightq', 'Resultado manual: Victoria') + btn('fightd', 'Empate') + btn('fightl', 'Derrota'); }
    if (ph === 'action') {
      const code = hereLoc(C), done = C.did.act; a += `<p><b>3. Acciones</b> (una): ${done ? 'ya realizada' : 'elige'}</p>`;
      a += btn('scout', 'Explorar (pulsa un hex sin explorar a ≤3)', done) + btn('resupply', 'Reabastecer', done || code === 1024) + btn('search', 'Buscar', done) + btn('encamp', `Acampar (${encampCost(C)} PS)`, done) + btn('demolish', 'Demoler (3 PS)', done) + btn('lowt', 'Bajar amenaza (al Reabastecer)', C.lowered >= 3 || !C.did.act);
      a += `<br>` + btn('end', 'Terminar acciones → Fase de amenaza');
    }
    if (pick) a += `<p class="hint" style="color:#ffb020">${E(pick.txt)}</p>`;
    return a + (msg ? `<p class="hint" style="color:#7fd">${E(msg)}</p>` : '');
  }
  function render() {
    if (!C) { root.innerHTML = `<div class="menu-wrap"><h2>Ctesiphus Expedition</h2><p class="hint">Campaña solo/cooperativa: explora el hexágono, gestiona Suministros y termina con 10+ Puntos de Campaña antes de que la amenaza llegue a 10.</p>
      <label class="field">Mapa<select id="cmap">${MAPS.map((m, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${m.n}</option>`).join('')}</select></label>
      <details class="adv" open><summary>Qué significa cada marcador</summary><ul class="hint" style="padding-left:18px;margin:6px 0"><li><b>PS</b>: Puntos de Suministro.</li><li><b>PC</b>: Puntos de Campaña; necesitas 10 o más.</li><li><b>Amenaza</b>: si llega a 10, pierdes.</li><li><b>Ronda</b>: turno actual de la expedición.</li></ul></details>
      <div class="row camp-start"><button class="btn big" id="cnew">Nueva campaña</button>${load() ? '<button class="btn ghost" id="ccont">Continuar campaña</button>' : ''}<button class="btn ghost" id="cback">Volver</button></div></div>`;
      root.querySelector('#cnew').onclick = () => { C = newCampaign({ map: +root.querySelector('#cmap').value }); sel = 0; msg = ''; save(); render(); };
      const cc = root.querySelector('#ccont'); if (cc) cc.onclick = () => { C = load(); render(); };
      root.querySelector('#cback').onclick = () => api.exit(); return;
    }
    const sp = `<span class="tag">PS ${C.sp}/10</span> <span class="tag">PC ${totalCP(C)}</span> <span class="tag" style="background:#a22">Amenaza ${C.threat}/10</span> <span class="tag">Ronda ${C.round}</span>`;
    root.innerHTML = `<div class="menu-wrap"><div class="row" style="justify-content:space-between"><h2>Ctesiphus Expedition</h2><div>${sp} <button class="btn ghost small" id="cback">Salir</button></div></div>
      <div class="grid2"><div class="card">${hexSvg()}<p class="hint">Pulsa un hexágono para ver su localización y condición. Hexes naranjas = alcanzables con Maniobra.</p></div>
      <div class="card">${actions()}<hr>${panel()}<hr><div style="max-height:22vh;overflow:auto;font-size:12px">${C.log.slice(-14).reverse().map(l => '<div>' + E(l) + '</div>').join('')}</div></div></div></div>`;
    root.querySelector('#cback').onclick = () => { save(); C = null; api.exit(); };
    root.querySelectorAll('[data-h]').forEach(el => el.onclick = () => onHex(+el.dataset.h));
    root.querySelectorAll('[data-a]').forEach(el => el.onclick = () => onAct(el.dataset.a));
  }
  function done(m) { msg = m || ''; pick = null; save(); render(); }
  function onHex(id) {
    sel = id; const h = hexOf(C, id);
    if (C.phase === 'base') { if (chooseBase(C, id)) done('Base fundada.'); else done('La base debe estar en un hex de superficie.'); return; }
    if (pick) { const p = pick; if (p.k === 'scout') { done(scout(C, id) ? 'Hex explorado.' : 'Hex no válido (sin explorar, a ≤3 y con PS).'); return; } if (p.k === 'dim') { done(dimManeuver(C, id) ? 'Maniobra dimensional.' : 'No válido.'); return; } if (p.k === 'search') { const r = search(C, { ...p.o, hex: id, t: p.o.t || (h.type === 'T' ? id : undefined), s: h.type === 'S' ? id : p.o.s }); if (r.need) { done(r.msg); return; } if (p.o.t === undefined && p.two && h.type === 'T') { pick = { k: 'search', two: 1, o: { t: id }, txt: 'Ahora pulsa el hex de superficie.' }; render(); return; } done(r.msg); return; } }
    if (C.phase === 'move' && !C.over) { if (reach(C).has(id)) { maneuver(C, id); done(); return; } }
    render();
  }
  function onAct(k) {
    msg = ''; pick = null;
    if (k === 'new') { C = null; render(); return; }
    if (k === 'regroup') return done(regroup(C) ? 'Reagrupado.' : 'No hay base/campamento al que ir.');
    if (k === 'hold') return done(hold(C) ? '' : 'Debes salir del hex bloqueado.');
    if (k === 'dim') { pick = { k: 'dim', txt: 'Pulsa el hex destino.' }; return render(); }
    if (k === 'fight') { save(); api.battle(C, res => { battleResult(C, res); save(); render(); }); return; }
    if (k === 'fightq') { battleResult(C, { win: true, inc: 0 }); return done(); }
    if (k === 'fightd') { battleResult(C, { draw: true }); return done(); }
    if (k === 'fightl') { battleResult(C, {}); return done(); }
    if (k === 'scout') { pick = { k: 'scout', txt: 'Pulsa un hex sin explorar a ≤3 hex (cuesta 1 PS por hex).' }; return render(); }
    if (k === 'resupply') return done(resupply(C) ? '' : 'No se puede Reabastecer aquí.');
    if (k === 'lowt') return done(lowerThreat(C) ? '' : 'No se puede bajar más.');
    if (k === 'encamp') { const r = encamp(C, {}); if (r.need === 'remove') { const rm = C.camps[0]; const r2 = encamp(C, { remove: rm }); return done(r2.msg + ` (se retiró el campamento del hex ${rm})`); } return done(r.msg); }
    if (k === 'demolish') return done(demolish(C).msg);
    if (k === 'end') { endActions(C); return done(); }
    if (k === 'search') {
      const code = hereLoc(C); const g = (o, txt, two) => { pick = { k: 'search', o, txt, two }; render(); };
      if ([1026, 1031, 1033, 2025, 2035].includes(code)) return g({}, code === 1033 ? 'Pulsa el hex destino (tira D3 al confirmar).' : 'Pulsa el hex objetivo.');
      if (code === 2021) return g({}, 'Pulsa primero un hex de tumba.', 1);
      if (code === 1023) { const r = search(C, { sp: C.sp >= 2 ? 2 : 1 }); return done(r.msg); }
      if (code === 2023) { const n = C.sp >= 5 ? 5 : C.sp >= 3 ? 3 : 1; const r = search(C, { sp: n }); return done(r.msg); }
      const r = search(C, {}); return done(r.msg);
    }
  }
  render(); return { render, resume(res) { C = load(); if (C) { battleResult(C, res); save(); } render(); }, get C() { return C; } };
}
