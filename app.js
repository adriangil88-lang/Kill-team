import * as E from './engine.js';
import { NRANGED, NMELEE, NSIZE, NTRAITS, NBEH, NALLEG, nselCount, buildNemesis } from './nemesis.js';
import * as AI from './ai.js';
import { createView3D } from './view3d.js';
const HQ3D = Math.min(screen.width, screen.height) >= 700; /* PC / iPad: calidad máxima */
import { createTable } from './sandbox.js';
import { createGL } from './gl3d.js';
import { NET as KNET } from './net.js';
import * as FX from './fx.js';
import * as ESM from './es.js';
import { mountCampaign, incWeight } from './camp.js';
import { tutorialHTML, TUT_N, ctxHelp } from './tutorial.js';
import { DC } from './dcrop.js';

const V3 = createView3D(E); window.__v3 = V3; V3.nameOf = i => (G.names && G.names[i]) || ''; /* nombre de cada unidad sobre su cabeza */
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];
const H = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SAVE = 'kt_save_v2', WKEY = 'kt_w_v2';
const COL = ['#ff7a2a', '#35b6ff', '#7ddb5a', '#d65bff'];
const LVL = { easy: 'Fácil', medium: 'Medio', hard: 'Difícil' };
const KIND = { storch: 'Skytorch Assault', flurry: 'Remolino de cuchillas', shp: 'Paso de sombra', rep2: 'Resto del movimiento (Andanada fugaz)', rep: 'Reposicionarse', mwb: 'Moverse con barricada', dash: 'Correr', fb: 'Retroceder', chg: 'Cargar', shoot: 'Disparar', fight: 'Combatir' };

let DB = [];
const PK = () => DB.filter(x => !x.anj && !x.locked); // equipos elegibles: sin ANJ ni equipos bloqueados (sin carta de construcción de plantilla)
let AIW = { w: AI.DEFAULT_W.slice(), games: 0, pre: 0 };
const M = { mode: 'ai', level: 'medium', side: 0, teams: [{ id: null, ops: [] }, { id: null, ops: [] }] };
const G = { s: null, setup: null, acts: [], mode: 'ai', me: 0, level: 'medium', busy: false, names: [], lastBy: [[], []], evIdx: 0, log: [], ui: { sel: null, mode: null, R: null, cells: null, pending: null, hover: null, targets: null }, showEnemy: true, hist: [[], []], learned: false, anim: [] };

/* ============================ util ============================ */
function toast(t, ms = 2200) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, ms); }
const b64 = u8 => { let s = ''; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = t => { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; const s = atob(t); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
async function pack(o) {
  const j = new TextEncoder().encode(JSON.stringify(o));
  if (window.CompressionStream) { const cs = new CompressionStream('deflate-raw'); const w = cs.writable.getWriter(); w.write(j); w.close(); return 'Z' + b64(new Uint8Array(await new Response(cs.readable).arrayBuffer())); }
  return 'J' + b64(j);
}
async function unpack(t) {
  t = t.trim(); const u = unb64(t.slice(1));
  if (t[0] === 'Z') { const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(u); w.close(); return JSON.parse(new TextDecoder().decode(await new Response(ds.readable).arrayBuffer())); }
  return JSON.parse(new TextDecoder().decode(u));
}
function loadW() {
  try { const j = JSON.parse(localStorage.getItem(WKEY)); if (j && j.w && j.w.length <= AI.DEFAULT_W.length) { while (j.w.length < AI.DEFAULT_W.length) j.w.push(AI.DEFAULT_W[j.w.length]); AIW = j; AI.optSet(j.o); return true; } } catch (e) { }
  return false;
}
function saveW() { AIW.o = Object.assign({}, AI.OPT); try { localStorage.setItem(WKEY, JSON.stringify(AIW)); } catch (e) { } refreshAIStat(); }
function refreshAIStat() {
  $('#aiStat').innerHTML = `<span>Partidas de aprendizaje</span><b>${AIW.pre + AIW.games}</b><span>Entrenada en este dispositivo</span><b>${AIW.games}</b><span>Valoración de posiciones</span><b>${AI.FEATURES.length} rasgos</b>`;
}

/* ============================ MENÚ ============================ */
function teamById(id) { return DB.find(t => t.id === id); }
const baseId = x => String(x).split('#')[0];
const optLabel = set => [...new Set(set.map(n => ESM.esWeapon(n.replace(/\s*\(.*\)\s*$/, ''))))].join(', ');
function defaultRoster(t, mix = false) { // reintenta hasta que la lista aleatoria sea legal (medias selecciones)
  if (!mix || !t.sel || !t.sel.total) return defaultRoster0(t, mix);
  for (let k = 0; k < 60; k++) { const r = defaultRoster0(t, true); if (!E.rosterIssues(t, r).length) return r; }
  return defaultRoster0(t, false);
}
function defaultRoster0(t, mix = false) { // lista por defecto: legal según la hoja de selección si la hay; mix: orden y opciones de armas al azar (IA, entrenamiento)
  const S = t.sel; if (!S || !S.total) return t.ops.slice(0, Math.min(8, t.ops.length)).map(o => o.id);
  const ids = []; if ((S.lead || []).length) { const ld = S.lead[mix ? Math.floor(Math.random() * S.lead.length) : 0], LL = t.opts && t.opts[ld], k = mix && LL ? Math.floor(Math.random() * LL.length) : 0; ids.push(k ? ld + '#' + k : ld); } for (const f of (S.fixed || [])) if (!ids.includes(f)) ids.push(f); for (const k in (S.count || {})) { const L = (t.opts && t.opts[k]) || [null]; let j = 0; while (ids.filter(x => baseId(x) === k).length < S.count[k]) { let ok = false; for (let z = 0; z < L.length && !ok; z++) { const kk = (j + z) % L.length; ids.push(kk ? k + '#' + kk : k); if (E.rosterIssues(t, ids).some(x => /Máximo/.test(x))) ids.pop(); else ok = true; } if (!ok) ids.push(k); j++; } }
  const W = id => { const o = t.ops.find(o => o.id === id); return (S.weight && S.weight[id] != null) ? S.weight[id] : E.selWeight(t.id, o || {}); };
  const tot = () => ids.reduce((a, id) => a + W(id), 0);
  const cand = t.ops.filter(o => !(S.lead || []).includes(o.id) && !ids.includes(o.id) && !(S.exclude || []).includes(o.id)); if (mix) cand.sort(() => Math.random() - .5);
  const bad = () => E.rosterIssues(t, ids).some(x => /Máximo|requiere|repetido/.test(x));
  const tryAdd = id => { const L = (t.opts && t.opts[id]) || [null]; const ks = L.map((_, k) => k); if (mix) ks.sort(() => Math.random() - .5); for (const k of ks) { ids.push(k ? id + '#' + k : id); if (!bad()) return true; ids.pop(); } return false; }; // prueba las opciones de armas hasta respetar los límites
  for (const o of cand) { if (tot() + W(o.id) > S.total) continue; tryAdd(o.id); }
  const rep = (S.repeat || []).filter(id => !(S.lead || []).includes(id)).sort((a, b) => (/warrior|trooper|boy$/i.test(b) ? 1 : 0) - (/warrior|trooper|boy$/i.test(a) ? 1 : 0)); let guard = 0;
  while (rep.length && tot() < S.total && guard++ < 30) { let added = false; for (const id of rep) { if (tot() + W(id) > S.total) continue; if (tryAdd(id)) { added = true; break; } } if (!added) break; }
  return ids;
}
/* Nombre de banda con, entre paréntesis, el máximo de miniaturas que despliega */
function bandMax(x) { return x && x.sel && x.sel.total ? x.sel.total : 0; }
function bandLbl(x) { return H(x.name) + (bandMax(x) ? ' (' + bandMax(x) + ')' : ''); }
function bandStatus(t, cur) { const iss = [...E.rosterIssues(t, cur.ops, cur.swap || []), ...E.eqIssues(t, cur.ops, cur.eq || [])]; const few = cur.ops.length < 3; return { iss, few, ok: !iss.length && !few }; }
function renderTeamCard(p) {
  const c = $('#teamCard' + p), cur = M.teams[p];
  const t = teamById(cur.id), st = bandStatus(t, cur);
  const ai = (M.mode === 'ai' && ((+M.side) !== p)) || (M.mode === 'mp' && p !== 0);
  c.innerHTML = `<h2><span style="color:${COL[p]}">● Jugador ${p + 1}${ai ? ' (IA)' : ''}</span><span class="pill">${cur.ops.length} operativos${(() => { const n = cur.ops.reduce((a, id) => a + E.selWeight(t.id, t.ops.find(o => o.id === baseId(id)) || {}), 0); return n !== cur.ops.length ? ' · ' + n + ' selecciones' : ''; })()}</span></h2>
  <label class="hint" style="display:block;margin:0 0 4px">Ejército (al elegirlo se abre su banda)</label>
  <button class="bandtile" data-a="pick" aria-label="Cambiar banda"><span><b>${H(t.name)}</b><small>${t.ops.filter(o => !o.hide).length} tipos de agente</small></span><i>›</i></button>
  <select data-p="${p}" hidden>${PK().map(x => `<option value="${x.id}" ${x.id === cur.id ? 'selected' : ''}>${bandLbl(x)}</option>`).join('')}</select>
  <p class="hint" style="margin:6px 0;color:${st.ok ? '#7bd88f' : '#f2b84b'}">${st.ok ? '✓ Banda configurada' : '⚠ ' + (st.iss.length ? st.iss.map(H).join(' · ') : 'Faltan operativos (mínimo 3)')}</p>
  <div class="row" style="margin:0"><button class="btn small" data-a="band">Configurar banda</button><button class="btn ghost small" data-a="auto">Auto</button></div>`;
  $('select', c).onchange = e => { cur.id = e.target.value; cur.swap = []; cur.ops = defaultRoster(teamById(cur.id), ai); cur.eq = (cur.eq || []).filter(x => !x.startsWith('f_')); renderTeamCard(p); openBand(p); };
  $$('[data-a]', c).forEach(b => b.onclick = () => { if (b.dataset.a === 'pick') { pickBand(p); return; } if (b.dataset.a === 'auto') { cur.ops = defaultRoster(t, ai); cur.swap = []; renderTeamCard(p); } else openBand(p); });
}
/* ---- Pantalla de banda: carta de configuración, ardides y cartas de unidades; la configuración se hace desde las propias cartas ---- */
const FEQ_CARDS = (() => { const q = n => 'img/fq_' + n + '.webp', d = {
  gellerpox_infected: { mutoid: q('mutoid'), mutated: 'img/BC37C356401370.webp', polluted: 'img/85A201D55BA405.webp', bellows: 'img/A3C8B0AD3492F5_10.webp' },
  chaos_cult: { ccscript: q('ccscript'), cccovert: 'img/D9DC8D7C243732_9.webp', ccvile: 'img/D9DC8D7C243732_11.webp', cctalis: 'img/D9DC8D7C243732_10.webp' },
  blooded: { bdsigil: q('bdsigil'), bdblades: 'img/54F685757D7B55_3.webp', bdsymbols: 'img/54F685757D7B55_2.webp', bdtroph: 'img/54F685757D7B55_1.webp' },
  exaction_squad: { exmanacle: q('exmanacle'), exshell: 'img/263FC95651907C_8.webp', exlumen: 'img/263FC95651907C_7.webp', exvisor: 'img/263FC95651907C_5.webp' },
  phobos_strike_team: { phammo: q('phammo'), phgren: 'img/4345FF9DBBEF61_15.webp', phseals: 'img/4345FF9DBBEF61_14.webp', phblade: 'img/4345FF9DBBEF61_16.webp' },
  spectre_squad: { sovw: q('sovw'), spflare: q('spflare'), spcam: 'img/E84AE3CE6FD8CF_11.webp', tvid: 'img/E84AE3CE6FD8CF_9.webp' },
  xv26_stealth_battlesuits: { xvblack: q('xvblack'), xvjam: 'img/B7A21599C28FCB_18.webp', xvmulti: 'img/0E1615AA09CCAF_13.webp', xvlock: 'img/0C85DF7AF48CF2_11.webp' },
  exodite_dragon_masters: { edspirit: q('edspirit'), edmesh: q('edmesh'), edtal: q('edtal'), edlil: q('edlil') },
  sanctifiers: { sftexis: q('sftexis'), sforbs: q('sforbs'), sfsym: 'img/1FFB3B40399D34_15.webp', sfseals: 'img/1FFB3B40399D34_13.webp' },
  celestian_insidiants: { cirelic: q('cirelic'), cipsyk: q('cipsyk'), civox: q('civox'), ciflag: q('ciflag') },
  murderwing: { wfuel: q('wfuel'), vcast: q('vcast'), clawed: 'img/8584153DA542C8_9.webp', bfins: 'img/8584153DA542C8_8.webp' },
  wolf_scouts: { wsfrost: q('wsfrost'), wstroph: 'img/FA07C1E8A85151_11.webp', wswolf: 'img/FA07C1E8A85151_10.webp', wsrunic: 'img/FA07C1E8A85151_9.webp' } }; return d; })();
const FEQ_ORDER = { raveners: ['senses', 'metam', 'chroma', 'acid'], deathwatch: ['scruta', 'cuffs', 'reserve', 'digital'], inquisitorial_agent: ['rosette', 'daggers', 'bodysuit', 'servo'], legionary: ['warded', 'tainted', 'talis', 'malefic'], pathfinder: ['tao', 'himl', 'orbital', 'photon'], vespid_stingwing: ['neuro', 'converg', 'accel', 'aggress'], voiddancer_troupe: ['wraith', 'toxin', 'deathmask', 'understudy'], wyrmblade: ['traps', 'spot', 'blasting', 'knives'], goremongers: ['gmsigil', 'gmtotem', 'gmcad', 'gmchains'], canoptek_circle: ['cnphase', 'cnaw', 'cnnano', 'cnmm'] }; // orden de las cartas de equipo de facción → id del equipo (cuando difiere del orden del motor)
const FEQ_IDENT = ['angel_of_death', 'blades_of_khaine', 'brood_brothers', 'corsair_voidscarred', 'death_korps', 'elucidian_starstrider', 'farstalker_kinbands', 'fellgor_ravager', 'hand_of_the_archons', 'hearthkyn_salvager', 'hernkyn_yaegir', 'hierotek_circle', 'hunter_clade', 'imperial_navy_breacher', 'kasrkin', 'kommandos', 'mandrakes', 'nemesis_claw', 'novitiate', 'plague_marine', 'ratling', 'scout_squad', 'tempestus_aquilon', 'warpcoven', 'wrecka_krew', 'battleclade'];
function openBand(p) { M.band = p; $('#menu').classList.remove('active'); $('#band').classList.add('active'); renderBand(true); }
function closeBand() { $('#band').classList.remove('active'); $('#menu').classList.add('active'); for (let p = 0; p < 4; p++) renderTeamCard(p); if (M.fromQuick && $('#quickView')) { $('#homeView').hidden = true; $('#cfgView').hidden = true; $('#quickView').hidden = false; window.scrollTo(0, 0); } }
function zoomCard(u, alt) { $('#modal').classList.remove('peek'); $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><div class="cards one">${zoomHTML(u, alt)}</div>`; $('#modal').hidden = false; $('#mx').onclick = closeModal; }
function renderBand(top) {
  const hs = [...document.querySelectorAll('#band .bscroll,#band .ueq,#band .bnav')].map(x => x.scrollLeft), hk = document.querySelector('#band .bscroll,#band .ueq') ? $('#band').scrollTop : null;
  try { return renderBand0(top); } finally { if (hs.some(v => v)) { const L = [...document.querySelectorAll('#band .bscroll,#band .ueq,#band .bnav')]; L.forEach((x, i) => { if (hs[i]) x.scrollLeft = hs[i]; }); } }
}
function renderBand0(top) {
  const el = $('#band'), p = M.band, cur = M.teams[p], t = teamById(cur.id), st = bandStatus(t, cur), keep = el.scrollTop;
  const NP = M.mode === 'mp' ? +M.np : (M.mode === 'coop' ? 1 : 2), nextP = (M.mode === 'hot' || M.mode === 'mp') && p + 1 < NP ? p + 1 : -1;
  const C = t.cards || {}, imgs = (k, cls) => (C[k] || []).map(u => `<span class="zc">${cimg(u, cls)}<button class="eqzoom" data-z="${u}" aria-label="Ampliar carta">🔍</button></span>`).join('');
  const swapIds = t.sel && (t.sel.swap || t.sel.swapDyn) ? [...(E.PLOYS[t.id] || []).map(x => [x.id, x.n]), ...(E.FPLOY_ALL[t.id] || []).map(id => [id, String(E.FPLOY_TXT[id] || id).split(':')[0]])] : [];
  const cap0 = 4 + (cur.ops.some(id => /watch_sergeant|hearthkyn_salvager_lugger|ratling_fixer/.test(id)) ? 1 : 0);
  const pkOK = cur.ops.some(id => /spectre_guide/.test(id)), PK_OK = E.PK_OK, cap = cap0 + (pkOK ? 1 : 0); /* Prepared Killzone (Guide): +1 opcion de equipo, solo Alijo de municion o terreno de equipo */
  const eqF = (E.FEQ[cur.id] || []).map(f => ['f_' + f.id, f.n, f.t]), eqU = Object.entries(E.EQUIP).map(([k, n]) => [k, n, E.EQUIP_TXT[k]]);
  const chip = ([k, n, tt]) => `<button class="chip ${(cur.eq || []).includes(k) ? 'on' : ''}" data-eq="${k}" title="${H(tt || '')}">${H(n)}</button>`;
  const opCard = o => {
    const rep = t.sel && (t.sel.repeat || []).includes(o.id), n = cur.ops.filter(x => baseId(x) === o.id).length, L = t.opts && t.opts[o.id];
    const ctl = rep ? `<span class="cnt"><button class="btn ghost small" data-dec="${o.id}">−</button><b>${n}</b><button class="btn small" data-inc="${o.id}">+</button></span>` : `<button class="btn small ${n ? '' : 'ghost'}" data-tog="${o.id}">${n ? '✓ En la banda' : 'Añadir a la banda'}</button>`;
    const wcpick = !!(L && n && (o.img || [])[0] && ESM.cardOrNull((o.img || [])[0], '', o) && /class="ecard op/.test(ESM.cardOrNull((o.img || [])[0], '', o) || ''));
    const wjs = L && n ? cur.ops.map((x, j) => [x, j]).filter(([x]) => baseId(x) === o.id).map(([, j]) => j) : [];
    const wsel0 = Math.min((M.wcopy || {})[o.id] || 0, Math.max(0, wjs.length - 1));
    const ws = wcpick ? `${wjs.length > 1 ? `<div class="wtabs">${wjs.map((j, q) => `<button class="chip ${q === wsel0 ? 'on' : ''}" data-wc="${o.id}" data-q="${q}">Agente ${q + 1}</button>`).join('')}</div>` : ''}<p class="hint wph">Toca un arma de la carta para equiparla${wjs.length > 1 ? ' al agente elegido' : ''}.</p>` : L && n ? cur.ops.map((x, j) => [x, j]).filter(([x]) => baseId(x) === o.id).map(([x, j]) => `<select class="wsel" data-j="${j}">${L.map((set, k) => `<option value="${k}" ${(+(String(x).split('#')[1]) || 0) === k ? 'selected' : ''}>${H(optLabel(set))}</option>`).join('')}</select>`).join('') : (L ? `<span class="hint">${L.length} opciones de armas</span>` : '');
    const face0 = (o.img || [])[0] ? cimg(o.img[0], '', o.role, o) : `<div class="noimg"><b>${H(o.role)}</b><br>A${o.apl} M${o.move}" S${o.save}+ H${o.wounds}<br>${o.w.slice(0, 4).map(w => H(w.n)).join(' · ')}</div>`;
    const face = o.back ? flipWrap(face0, [o.back]) : face0;
    return `<div class="bcard ${n ? 'sel' : ''}"${wcpick ? ` data-opid="${o.id}" data-wsel="${wsel0}" data-wj="${wjs.join(',')}"` : ''}><span class="bbadge">${n > 1 ? '×' + n : '✓'}</span>${face}<div class="bctl">${ctl}${ws}</div></div>`;
  };
  const on = k => (cur.eq || []).includes(k), zbtn = u => `<button class="eqzoom" data-z="${u}" aria-label="Ampliar carta">🔍</button>`;
  const FMAP = FEQ_ORDER[t.id] || (FEQ_IDENT.includes(t.id) ? (E.FEQ[t.id] || []).map(f => f.id) : null), eqImgs = C.equipment || [];
  const mapped = new Set(); let eqCards = '';
  const FC = FEQ_CARDS[t.id]; if (FC) { const ids = Object.keys(FC); ids.forEach(f => mapped.add(f)); eqCards = `<div class="bscroll">${ids.map(fid => `<div class="eqc ${on('f_' + fid) ? 'on' : ''}" data-eq="f_${fid}">${cimg(FC[fid], 'eqimg')}<span class="eqtick">✓</span>${zbtn(FC[fid])}</div>`).join('')}</div>`; } else if (eqImgs.length) eqCards = `<div class="bscroll">${eqImgs.map((u, k) => { const fid = FMAP && FMAP.length === eqImgs.length ? FMAP[k] : null; if (!fid) return cimg(u, 'eqimg'); mapped.add(fid); return `<div class="eqc ${on('f_' + fid) ? 'on' : ''}" data-eq="f_${fid}">${cimg(u, 'eqimg')}<span class="eqtick">✓</span>${zbtn(u)}</div>`; }).join('')}</div>`;
  const rest = eqF.filter(f => !mapped.has(f[0].slice(2))); if (rest.length) eqCards += `<h4>De facción (sin carta enlazada)</h4><div class="chips">${rest.map(chip).join('')}</div>`;
  const UE = [['ue_ammo', ['ammo']], ['ue_razor', ['razor']], ['ue_comms', ['comms']], ['ue_mines', ['mines']], ['ue_breach', ['breachc']], ['ue_barr', ['barr_light', 'barr_heavy'], ['2 ligeras', '1 pesada']], ['ue_ladders', ['ladders']], ['ue_port1', ['barr_port']], ['ue_expl', ['gren_ff', 'gren_fk', 'gren_kk'], ['2 frag', 'frag + krak', '2 krak']], ['ue_util1', ['util_stun2', 'util_smoke2', 'util_smokestun'], ['2 aturdidoras', '2 humo', 'humo + aturdidora']], ['ue_util2']];
  const ueCards = UE.map(([n, ks, lb]) => { const u = 'img/' + n + '.webp', img = flipWrap(`<img class="eqimg" loading="lazy" data-z="${u}" src="${IMGU(u)}" alt="Equipo universal">`, IMGB(u)); if (!ks) return `<div class="eqc ro">${img}${zbtn(u)}</div>`; if (ks.length === 1) return `<div class="eqc ${on(ks[0]) ? 'on' : ''}" data-eq="${ks[0]}">${img}<span class="eqtick">✓</span>${zbtn(u)}</div>`; return `<div class="eqc multi ${ks.some(on) ? 'on' : ''}">${img}<span class="eqtick">✓</span>${zbtn(u)}<div class="eqopts">${ks.map((k, q) => `<button class="chip ${on(k) ? 'on' : ''}" data-eq="${k}">${lb[q]}</button>`).join('')}</div></div>`; }).join('');
  el.innerHTML = `<div class="band-wrap">
  <header class="band-top"><button class="btn ghost small" id="bBack">← Menú</button><div class="bt"><b style="color:${COL[p]}">● Jugador ${p + 1}</b></div></header>
  <select id="bTeam">${PK().map(x => `<option value="${x.id}" ${x.id === cur.id ? 'selected' : ''}>${bandLbl(x)}</option>`).join('')}</select>
  <h2>${H(t.name)}</h2>
  ${errBox(t.id)}
  <div class="bsum"><span><b>${cur.ops.length}</b> agentes</span><span><b>${(cur.eq || []).filter(x => !x.startsWith('phgs_')).length}/${cap}</b> equipo</span><span class="${st.ok ? 'ok' : 'warn'}">${st.ok ? '✓ Lista' : 'Incompleta'}</span></div>
  <section class="bsec roster"><h3>Configuración de la banda</h3>${(C.roster || []).length ? `<div class="bscroll">${imgs('roster', 'wide')}</div>` : '<p class="hint">Sin carta de configuración en los archivos.</p>'}
    <p class="hint">Elige operativos, cantidades y armas directamente en las cartas de abajo.</p></section>
  ${swapIds.length ? `<section class="bsec"><h3>Ardides a 0 PC (cambian selecciones)</h3><p class="hint">${t.sel.swapDyn ? 'Ardides RATLING a 0 PC por cada hueco de BULLGRYN/OGRYN sin usar' : 'Selecciones cambiadas por ardides a 0 PC'} (máx. ${E.swapMax(t, cur.ops)})</p><div class="chips">${swapIds.map(([id, n]) => `<button class="chip ${(cur.swap || []).includes(id) ? 'on' : ''}" data-swap="${id}">${H(n)}</button>`).join('')}</div></section>` : ''}
  ${(C.strategy || []).length || (C.firefight || []).length || (C.rule || []).length ? `<section class="bsec"><h3>Ardides y reglas</h3>${(C.rule || []).length ? `<h4>Regla de facción</h4><div class="bscroll">${imgs('rule')}</div>` : ''}${(C.strategy || []).length ? `<h4>Ardides estratégicos</h4><div class="bscroll">${imgs('strategy')}</div>` : ''}${(C.firefight || []).length ? `<h4>Ardides de combate</h4><div class="bscroll">${imgs('firefight')}</div>` : ''}</section>` : ''}
  <section class="bsec"><h3>Equipo <span class="pill">${(cur.eq || []).filter(x => !x.startsWith('phgs_')).length}/${cap}</span></h3><p class="hint"><b>Máximo ${cap} opciones de equipo en total</b>, sumando las de facción y las universales (no puedes elegir la misma opción dos veces). Toca una carta para elegirla o quitarla (la lupa la amplía).</p>${eqCards}${(cur.eq || []).includes('f_phgren') ? `<h4>Additional Utility Grenades: elige el reparto de las 4 granadas</h4><div class="chips">${[0, 1, 2, 3, 4].map(n => chip(['phgs_' + n, n + ' aturdidoras + ' + (4 - n) + ' de humo', ''])).join('')}</div>` : ''}<h4>Equipo universal <span class="hint">(cuenta para el mismo límite de ${cap}: ahora ${(cur.eq || []).filter(x => !x.startsWith('phgs_')).length}/${cap})</span></h4><div class="bscroll ueq">${ueCards}</div></section>
  <section class="bsec"><h3>Operativos <span class="pill">${cur.ops.length} en la banda</span></h3><div class="bgrid">${t.ops.filter(o => !o.hide).map(opCard).join('')}</div></section>
  <div class="band-bar"><div class="bst" style="color:${st.ok ? '#7bd88f' : '#f2b84b'}">${st.ok ? '✓ Banda lista' : '⚠ ' + (st.iss.length ? st.iss.map(H).join(' · ') : 'Faltan agentes (mínimo 3)')}</div>
    <div class="row" style="margin:0">${nextP >= 0 ? `<button class="btn ghost" id="bNext">Jugador ${nextP + 1} →</button>` : ''}${st.ok ? `<button class="btn big" id="bGo">⚔ A la batalla</button>` : ''}</div></div></div>`;
  $$('[data-wc]', el).forEach(b => b.onclick = () => { M.wcopy = M.wcopy || {}; M.wcopy[b.dataset.wc] = +b.dataset.q; renderBand(); });
  $$('.bcard[data-opid]', el).forEach(card => {
    const id = card.dataset.opid, L = t.opts[id], js = card.dataset.wj.split(',').map(Number), q = +card.dataset.wsel, j = js[q];
    const curK = +(String(cur.ops[j]).split('#')[1]) || 0, set = L[curK] || [];
    card.querySelectorAll('tr[data-w]').forEach(tr => {
      const w = tr.dataset.w, inSet = set.includes(w); if (!L.some(s => s.includes(w))) return; tr.classList.add('wp', inSet ? 'on' : 'off');
      tr.onclick = ev => { ev.stopPropagation(); if (inSet) return; let best = -1, bk = -1; L.forEach((s, k) => { if (!s.includes(w)) return; const ov = s.filter(x => set.includes(x)).length; if (ov > best) { best = ov; bk = k; } }); if (bk < 0) return; cur.ops = cur.ops.slice(); cur.ops[j] = baseId(cur.ops[j]) + (bk ? '#' + bk : ''); renderBand(); };
    });
  });
  $$('[data-z]', el).forEach(i => { if ((i.closest('.eqc') || i.closest('.zc')) && !i.classList.contains('eqzoom')) return; i.onclick = ev => { ev.stopPropagation(); zoomCard(i.dataset.z, i.alt); }; });
  $('#bBack').onclick = closeBand;
  $('#bTeam').onchange = e => { cur.id = e.target.value; cur.swap = []; cur.ops = defaultRoster(teamById(cur.id), (M.mode === 'ai' && p !== +M.side) || (M.mode === 'mp' && p !== 0)); cur.eq = (cur.eq || []).filter(x => !x.startsWith('f_')); renderBand(true); };
  $$('[data-tog]', el).forEach(b => b.onclick = () => { const id = b.dataset.tog; if (!cur.ops.some(x => baseId(x) === id) && t.sel && cur.ops.length >= t.sel.total) { toast('La banda ya tiene ' + t.sel.total + ' agentes: quita uno antes de añadir otro.'); return; } cur.ops = cur.ops.some(x => baseId(x) === id) ? cur.ops.filter(x => baseId(x) !== id) : [...cur.ops, id]; renderBand(); });
  $$('[data-inc]', el).forEach(b => b.onclick = () => { if (t.sel && cur.ops.length >= t.sel.total) { toast('La banda ya tiene ' + t.sel.total + ' agentes: quita uno antes de añadir otro.'); return; } cur.ops = [...cur.ops, b.dataset.inc]; renderBand(); });
  $$('[data-dec]', el).forEach(b => b.onclick = () => { const i = cur.ops.map(baseId).lastIndexOf(b.dataset.dec); if (i >= 0) { cur.ops = cur.ops.slice(); cur.ops.splice(i, 1); } renderBand(); });
  $$('select.wsel', el).forEach(sl => sl.onchange = () => { const j = +sl.dataset.j; cur.ops = cur.ops.slice(); cur.ops[j] = baseId(cur.ops[j]) + (+sl.value ? '#' + sl.value : ''); renderBand(); });
  $$('[data-swap]', el).forEach(b => b.onclick = () => { const id = b.dataset.swap, sw = cur.swap || []; cur.swap = sw.includes(id) ? sw.filter(x => x !== id) : [...sw, id]; renderBand(); });
  $$('[data-eq]', el).forEach(b => b.onclick = () => { const k = b.dataset.eq; let L = (cur.eq || []).filter(x => x !== k); if (!(cur.eq || []).includes(k)) { for (const g of E.EQ_GROUPS) if (g.includes(k)) L = L.filter(x => x === k || !g.includes(x)); if (k.startsWith('phgs_')) L = L.filter(x => !x.startsWith('phgs_')); L.push(k); } if (!L.includes('f_phgren')) L = L.filter(x => !x.startsWith('phgs_')); L = L; const Lc = L.filter(x => !x.startsWith('phgs_')); if (Lc.length > cap || (pkOK && L.filter(x => !PK_OK.includes(x) && !x.startsWith('phgs_')).length > cap0)) { toast(Lc.length > cap ? 'Máximo ' + cap + ' piezas de equipo' : 'Prepared Killzone: la pieza extra solo puede ser Alijo de munición o terreno de equipo'); return; } cur.eq = L; renderBand(); });
  if ($('#bNext')) $('#bNext').onclick = () => { M.band = nextP; renderBand(true); };
  if ($('#bGo')) $('#bGo').onclick = () => { for (let q = 0; q < 4; q++) renderTeamCard(q); startFromMenu(); };
  try { const hs = [...el.querySelectorAll('.bsec > h3')].filter(h => h.textContent.trim()); if (hs.length > 2) { const nav = document.createElement('nav'); nav.className = 'bnav'; nav.setAttribute('aria-label', 'Secciones'); hs.forEach((h, i) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = h.textContent.trim().split(/\s+/).slice(0, 2).join(' '); b.onclick = () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }); nav.appendChild(b); h.style.scrollMarginTop = '64px'; h.parentElement.style.scrollMarginTop = '64px'; }); const wrap = el.querySelector('.band-wrap') || el, h2 = wrap.querySelector('h2'); if (h2) h2.before(nav); else wrap.prepend(nav); } } catch (e) { }
  $$('img', el).forEach(im => { if (im.closest('button,a,.eqc') || im.dataset.z) return; im.style.cursor = 'zoom-in'; im.onclick = () => { $('#modalBox').innerHTML = `<button class="icon x" id="mx" aria-label="Cerrar">✕</button><div style="overflow:auto;max-height:78vh;-webkit-overflow-scrolling:touch"><img src="${im.src}" alt="Carta ampliada" style="width:170%;max-width:none;display:block"></div><p class="hint">Desplaza para ver toda la carta.</p>`; $('#modal').hidden = false; $('#mx').onclick = closeModal; }; });
  el.scrollTop = top ? 0 : keep;
}
function pickBand(p) {
  const cur = M.teams[p], list = PK(); const draw = q => { const f = list.filter(x => !q || x.name.toLowerCase().includes(q.toLowerCase())); $('#bpList').innerHTML = f.map(x => `<button class="bpitem ${x.id === cur.id ? 'on' : ''}" data-id="${x.id}"><b>${H(x.name)}</b><small>${x.ops.filter(o => !o.hide).length} agentes</small></button>`).join('') || '<p class="hint">Sin resultados</p>'; $$('#bpList .bpitem').forEach(b => b.onclick = () => { closeModal(); const sel = $('#teamCard' + p + ' select'); sel.value = b.dataset.id; sel.dispatchEvent(new Event('change')); }); };
  $('#modalBox').innerHTML = `<button class="icon x" id="mx" aria-label="Cerrar">✕</button><h2>Elegir banda · Jugador ${p + 1}</h2><input id="bpQ" type="search" placeholder="Buscar banda…" aria-label="Buscar banda"><div id="bpList" class="bplist"></div>`; $('#modal').hidden = false; $('#mx').onclick = closeModal; draw(''); $('#bpQ').oninput = e => draw(e.target.value);
}
function showHome() { M.fromQuick = false; if ($('#nemView')) $('#nemView').hidden = true; $('#homeView').hidden = false; $('#cfgView').hidden = true; if ($('#quickView')) $('#quickView').hidden = true; try { const sv = localStorage.getItem(SAVE); $('#btnContinue').hidden = !sv; } catch (e) { } window.scrollTo(0, 0); }
function showCfg() { M.fromQuick = false; if ($('#nemView')) $('#nemView').hidden = true; $('#homeView').hidden = true; if ($('#quickView')) $('#quickView').hidden = true; $('#cfgView').hidden = false; window.scrollTo(0, 0); }
/* Etiqueta clara de los mapas Descent (Shadowhunt): 3 de misión conjunta, 3 de operación aprobada y 6 mapas universales del libro */
function mapLbl(n) { const m = /^Descent (JO|AO|U)(\d)$/.exec(n); return m ? 'Descent · ' + ({ JO: 'Misión conjunta ', AO: 'Operación aprobada ', U: 'Mapa universal ' })[m[1]] + m[2] : n; }
function quickPlay() { // pantalla propia: seleccionar banda y banda rival (desplegables con todas las bandas + Aleatoria)
  const PL = PK().slice().sort((a, b) => a.name.localeCompare(b.name, 'es')), rnd = () => PL[Math.floor(Math.random() * PL.length)];
  const opts = '<option value="">Aleatoria</option>' + PL.map(x => `<option value="${x.id}">${bandLbl(x)}</option>`).join('');
  $('#qA').innerHTML = opts; $('#qB').innerHTML = opts;
  const isMod = (n, i) => /^Abierto/.test(n) || (i >= E.DSC0 && !/^(Nemesis|Octarius)/.test(n)), qM = E.MAPNAMES.map((n, i) => [n, i]).filter(([n, i]) => i < E.TY0 || i >= E.OCT0), BOOK = qM.filter(([n, i]) => !isMod(n, i)), MODS = qM.filter(([n, i]) => isMod(n, i)); // escenarios normales de los libros (Gallowdark, Volkus, Tomb World) · Mod = mapas abiertos + Descent, Volkus Compound y Typhon AO (no son mapa normal: tienen reglas propias y salen con aviso)
  $('#qMap').innerHTML = '<option value="">Aleatorio</option><option value="none">Ninguno</option>' + BOOK.map(([n, i]) => `<option value="${i}">${mapLbl(n)}</option>`).join('');
  $('#qMod').innerHTML = '<option value="">Ninguno</option>' + MODS.map(([n, i]) => `<option value="${i}">${mapLbl(n)}</option>`).join('');
  $('#qCamp').innerHTML = '<option value="">Ninguna (partida suelta)</option><option value="ctes">Ctesiphus Expedition (campaña con mapa de hexágonos)</option><option value="dv">Terror en Devlan (9 misiones enlazadas)</option><option value="ty">Typhon (6 misiones en árbol)</option><option value="sh">Shadowhunt (3 misiones)</option>';
  try { const sm = localStorage.getItem('kt_map'); if (sm !== null && (sm === 'none' || BOOK.some(([n, i]) => String(i) === sm))) $('#qMap').value = sm; const sd = localStorage.getItem('kt_mod'); if (sd) $('#qMod').value = sd; } catch (e) { }
  $('#qMap').onchange = () => { const v = $('#qMap').value; if (v !== '' && v !== 'none') { $('#qMod').value = ''; $('#qCamp').value = ''; } }; $('#qMod').onchange = () => { if ($('#qMod').value !== '') { $('#qMap').value = 'none'; $('#qCamp').value = ''; } }; $('#qCamp').onchange = () => { if ($('#qCamp').value !== '') { $('#qMap').value = 'none'; $('#qMod').value = ''; } }; // solo uno de los dos manda
  $('#homeView').hidden = true; $('#cfgView').hidden = true; $('#quickView').hidden = false; window.scrollTo(0, 0);
  $('#qBack').onclick = showHome;
  $('#qGo').onclick = () => {
    const ia = $('#qA').value, ib = $('#qB').value; let A = PL.find(x => x.id === ia) || null, B = PL.find(x => x.id === ib) || null;
    if (!A) { A = rnd(); while (B && A.id === B.id && PL.length > 1) A = rnd(); }
    if (!B) { B = rnd(); while (B.id === A.id && PL.length > 1) B = rnd(); }
    const camp = $('#qCamp').value; let mv = $('#qMod').value !== '' ? $('#qMod').value : ($('#qMap').value === 'none' ? '' : $('#qMap').value); if (mv === '' && !camp) mv = String(BOOK[Math.floor(Math.random() * BOOK.length)][1]); // «Aleatorio» = al azar entre los escenarios de los libros
    $('#quickView').hidden = true; $('#cfgView').hidden = false; $('#mapSel').value = mv; try { localStorage.setItem('kt_map', $('#qMap').value); localStorage.setItem('kt_mod', $('#qMod').value); } catch (e) { }
    if (camp) { M.teams[0] = { id: A.id, ops: defaultRoster(A, false), swap: [], eq: [] }; M.teams[1] = { id: B.id, ops: defaultRoster(B, true), swap: [], eq: [] }; renderTeamCard(0); renderTeamCard(1);
      if (camp === 'ctes') { $('#cfgView').hidden = true; $('#homeView').hidden = false; $('#btnCamp').click(); return; } // Campaña Ctesiphus Expedition: su propia pantalla de mapa
      $('#segMode [data-v=coop]').click(); const first = { dv: '41', ty: '31', sh: '21' }[camp]; if ($('#jmSel')) $('#jmSel').value = first; toast('Campaña de los libros: empiezas por la misión 1 (cooperativo contra los ANJ). Al terminar cada misión, «Siguiente misión» sigue el árbol del libro.'); return; }
    $('#segMode [data-v=ai]').click(); $('#segLevel [data-v=medium]').click(); $('#segSide [data-v="0"]').click(); if ($('#aopChk')) { $('#aopChk').checked = true; $('#aopRow').hidden = false; if ($('#aoSel')) $('#aoSel').value = ''; if ($('#bzChk')) $('#bzChk').checked = false; for (const q of [0, 1]) if ($('#tac' + q)) $('#tac' + q).value = ''; } // Partida rápida = pack de misiones Operaciones Aprobadas (secuencia de 6 pasos)
    M.teams[0] = { id: A.id, ops: defaultRoster(A, false), swap: [], eq: [] }; M.teams[1] = { id: B.id, ops: defaultRoster(B, true), swap: [], eq: [] }; renderTeamCard(0); renderTeamCard(1);
    M.fromQuick = true; openBand(0); // configuración de TU banda con todas sus datacards; «A la batalla» arranca contra la IA
  };
}
const ABOUT_TXT = 'Los stats de armas y operativos se leyeron por OCR de tus cartas; revisa la ficha original dentro del juego (botón «Carta»). Las reglas únicas de cada kill team (ardides, reglas de facción, habilidades) se consultan en sus cartas: el motor automatiza el reglamento base y las reglas de arma.';
function initMenu() {
  $('#btnQuick').onclick = () => { const cur = ($('#segMode .on') || {}).dataset?.v; if (cur && cur !== 'ai') showCfg(); else quickPlay(); }; $('#cfgBack').onclick = showHome;
  const markModes = () => { const cur = ($('#segMode .on') || {}).dataset?.v; $$('#modeCards [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === cur)); };
  $$('#modeCards [data-mode]').forEach(b => b.onclick = () => { const t = $('#segMode [data-v=' + b.dataset.mode + ']'); if (t) t.click(); markModes(); });
  $$('#segMode [data-v]').forEach(b => b.addEventListener('click', () => setTimeout(markModes, 0)));
  markModes();
  $('#btnAbout').onclick = () => { $('#modalBox').innerHTML = `<button class="icon x" id="mx" aria-label="Cerrar">✕</button><h2>Acerca de los datos</h2><p class="hint">${H(ABOUT_TXT)}</p>`; $('#modal').hidden = false; $('#mx').onclick = closeModal; };
  showHome();

  if ($('#aopChk')) $('#aopChk').onchange = e => { $('#aopRow').hidden = !e.target.checked; };
  const PL = PK(); M.teams[0] = { id: PL[0].id, ops: defaultRoster(PL[0]) };
  const j = Math.min(PL.length - 1, 3); M.teams[1] = { id: PL[j].id, ops: defaultRoster(PL[j]) };
  for (const p of [2, 3]) { const j2 = Math.min(PL.length - 1, 2 + 3 * p); M.teams[p] = { id: PL[j2].id, ops: defaultRoster(PL[j2]) }; }
  renderTeamCard(0); renderTeamCard(1); renderTeamCard(2); renderTeamCard(3);
  const seg = (id, key, cb) => $$('#' + id + ' button').forEach(b => b.onclick = () => { $$('#' + id + ' button').forEach(x => x.classList.remove('on')); b.classList.add('on'); M[key] = b.dataset.v; cb && cb(); });
  seg('segMode', 'mode', () => { const co = M.mode === 'coop', mp = M.mode === 'mp'; $('#mpOpts').hidden = !mp; $('#teamCard2').hidden = !(mp && +M.np >= 3); $('#teamCard3').hidden = !(mp && +M.np >= 4); $('#aiOpts').hidden = M.mode !== 'ai' && !co && !mp; $('#coopOpts').hidden = !co; $('#teamCard1').hidden = co; $('#segSide').previousElementSibling.hidden = co || mp; $('#segSide').hidden = co || mp; if (co || mp) M.side = 0; $('#netOpts').hidden = M.mode !== 'net'; renderTeamCard(0); renderTeamCard(1); });
  M.np = 4; seg('segNp', 'np', () => { $('#teamCard2').hidden = !(M.mode === 'mp' && +M.np >= 3); $('#teamCard3').hidden = !(M.mode === 'mp' && +M.np >= 4); });
  seg('segLevel', 'level'); seg('segSide', 'side', () => { renderTeamCard(0); renderTeamCard(1); });
  $('#aiInfo').textContent = 'La IA juega con la valoración aprendida. Fácil comete errores a propósito; Difícil simula más tiradas por decisión.';
  $('#btnStart').onclick = startFromMenu;
  $('#btnJoin').onclick = () => { $('#joinCode').hidden = !$('#joinCode').hidden; $('#joinRow').hidden = $('#joinCode').hidden; };
  $('#btnJoinGo').onclick = async () => { const rc = $('#joinCode').value.trim().toUpperCase(); if (/^[A-Z0-9]{4,8}$/.test(rc)) { netJoinLive(rc); return; } try { const o = await unpack($('#joinCode').value); if (o.pre) { await exploreNetJoin(o); return; } beginGame(o.setup, o.acts || [], { mode: 'net', me: 1 }); } catch (e) { toast('Código no válido'); } };
  $('#btnTrain').onclick = () => trainSelf(10);
  $('#btnResetAI').onclick = () => { AIW = { w: AI.DEFAULT_W.slice(), games: 0, pre: 0 }; saveW(); toast('IA reiniciada a los valores base'); };
  if ($('#btnLoadSlot')) $('#btnLoadSlot').onclick = () => openLoad(false);
  const sv = localStorage.getItem(SAVE); if (sv) { $('#btnContinue').hidden = false; $('#btnContinue').onclick = () => { try { const o = JSON.parse(sv); beginGame(o.setup, o.acts, { mode: o.mode, me: o.me, level: o.level }); } catch (e) { toast('No se pudo cargar'); } }; }
  refreshAIStat();
}
try { const sm = localStorage.getItem('kt_map'); if (sm !== null) $('#mapSel').value = sm; $('#mapSel').onchange = () => { try { localStorage.setItem('kt_map', $('#mapSel').value); } catch (e) {} }; } catch (e) {}
for (const sel of ['#mapSel', '#tMap']) { const el = $(sel); el.innerHTML = '<option value="">Aleatorio</option>' + E.MAPNAMES.map((n, i) => i >= E.TY0 && i < E.OCT0 ? '' : `<option value="${i}">${mapLbl(n)}</option>`).join(''); }
$('#tMap').insertAdjacentHTML('beforeend', '<option value="custom">Personalizado (editable)</option>');
// Mapa abierto personalizado de la Mesa libre: tamaño y escenografía a elección, guardados en este navegador
const SBC = { on: false, data: (() => { try { const d = JSON.parse(localStorage.getItem('kt_custom') || 'null'); if (d && d.bw && d.bh) return d; } catch (e) {} return { bw: 30, bh: 22, t: [], o: null }; })() };
const sbcSave = () => { if (!SBC.on || !TB.s || !TB.s.custom) return; const r2 = v => Math.round(v * 100) / 100; SBC.data = { bw: E.BW, bh: E.BH, t: TB.s.terrain.map(r => { const q = { x: r2(r.x), y: r2(r.y), w: r2(r.w), h: r2(r.h), t: r.t }; if (r.eq) { q.eq = true; q.kind = r.kind; if (r.prot) q.prot = true; } return q; }), o: TB.s.objs.map(o => [r2(o.x), r2(o.y)]) }; try { localStorage.setItem('kt_custom', JSON.stringify(SBC.data)); } catch (e) {} };
try { const sm = localStorage.getItem('kt_map'); if (sm !== null) { $('#mapSel').value = sm; $('#tMap').value = sm; } } catch (e) {}
const OCT_MIS = {
'1.1': 'Misión 1.1 · Reconocer el terreno (tabla 1).|REGLAS: acción de misión Reconocer la zona (1 PA): mientras esté en el punto aventajado de un elemento de terreno denominado Punto de reconocimiento A–D, siempre que ningún agente enemigo esté en el punto aventajado del mismo elemento. Hasta el final del Punto de inflexión no puede efectuar otra acción; ese Punto de reconocimiento se considera reconocido hasta el final del PI. Cada Punto de reconocimiento solo puede ser reconocido por tus fuerzas una vez por PI.|OBJETIVO: cada vez que un agente amigo efectúa Reconocer la zona, PV según el punto reconocido (máx. 6 PV por jugador y PI): A 0 atacante / 3 defensor; B 1 / 2; C 2 / 1; D 3 / 0.|EQUIPO: servoaugur [1 PE]: un agente con este equipo puede efectuar acciones en un PI en el que haya efectuado Reconocer la zona.|CAMPAÑA: Operaciones tácticas «Reconocimiento» ≥3 PV → +1 punto de requisición. Operaciones especiales (Escapada / Infiltrarse en el enemigo, «Líneas enemigas controladas»): si los cuatro puntos fueron reconocidos en el mismo PI, −1 partida para completar la operación 1.',
'1.2': 'Misión 1.2 · Búsqueda y recuperación (tabla 1).|REGLAS: acción de misión Buscar reliquias (1 PA): a ▲ o menos de un Montón de chatarra que controles y que no haya sido registrado por un agente amigo en este PI (el montón se trata como marcador de objetivo grande, pero se mide a cualquiera de sus partes en lugar de a su centro). Hasta el inicio del siguiente PI ese montón ha sido investigado por tus agentes. Cada Montón puede ser investigado un máximo de cuatro veces durante la batalla. Cada vez que se efectúa, si la Reliquia no ha sido descubierta aún, tira 1D6: con 6+ la Reliquia es descubierta y colocas un marcador de objetivo que la representa a ▲ del agente que la descubrió.|Asegurar la Reliquia: se puede efectuar Recoger sobre su marcador; quien lo transporta no puede Correr.|OBJETIVO: cada vez que un agente amigo efectúa Buscar reliquias, 1 PV (máx. 3 PV por jugador y PI); +1 PV si un agente amigo descubre la Reliquia; +2 PV si un agente amigo controla el marcador de Reliquia al final de la batalla (3 PV si un agente amigo lo transporta).|EQUIPO: arqueoauspex [1 PE]: suma 1 a la tirada de Buscar reliquias.|CAMPAÑA: Operaciones tácticas «Reconocimiento» ≥3 PV → +1 req. Operaciones especiales (Recuperar arqueotecnología / Rescate, «Reliquia recuperada»): si un agente amigo lleva la Reliquia y está en tu zona de descenso al final, −1 partida.',
'1.3': 'Misión 1.3 · Conseguir combustible (tabla 1).|REGLAS: acción de misión Tomar prestado (1 PA): a ▲ o menos de la Tubería de salida de combustible (en el lateral del Pozo petrolífero), si la controlas y ningún otro agente ha extraído combustible en este PI (se trata como marcador de objetivo, pero se mide a cualquiera de sus partes). Hasta el inicio del siguiente PI el combustible está siendo extraído. Hasta el final del PI el agente no puede efectuar ninguna otra acción. Cada vez, coloca un marcador de objetivo de Combustible refinado a ▲ del agente que la efectuó.|Recoger combustible: Recoger se puede efectuar sobre cualquier marcador de objetivo; quien lo transporta no puede Correr.|Prometio volátil: cuando un agente amigo efectúa un ataque de disparo contra un blanco que transporta un marcador de objetivo, si en el paso de tirar dados de ataque guardas algún impacto crítico, el bidón puede explotar. Tras resolver todos los ataques a distancia de ese agente en esa acción, antes de retirar incapacitados, tira 1D6 por cada bidón que podría explotar: con 6, todos los agentes a ○ o menos del portador sufren una herida mortal. El marcador es entonces retirado de la batalla.|OBJETIVO: cada vez que un agente amigo efectúa Tomar prestado, 1 PV; al final de la batalla, 2 PV por cada marcador de objetivo que controlen tus agentes; si controlas uno o más marcadores de Combustible refinado, +3 PV.|EQUIPO: autoextractor [1 PE]: al efectuar Tomar prestado, si no transporta otro marcador, no se coloca el marcador a ▲; el agente lo transporta automáticamente.|CAMPAÑA: Operaciones tácticas «Seguridad» ≥3 PV → +1 req. Operaciones especiales (Asegurar el distrito / Rescate, «Combustible refinado»): si un agente amigo transporta la Reliquia de combustible refinado y está en tu zona de descenso, −1 partida.',
'2.1': 'Misión 2.1 · Eliminar el objetivo (tabla 2).|REGLAS: Comandante: antes de desplegar, el defensor designa una miniatura como su Comandante (si alguno de sus agentes es LÍDER, debe ser uno de ellos). Debe desplegarse completamente en la zona objetivo y comenzar la batalla en ella (no puede usar habilidad ni opción de exploración para salir antes de que empiece).|Acción de misión Revisar los planes (1 PA): el Comandante del defensor, mientras esté completamente en la zona objetivo; hasta el final del PI no puede efectuar otra acción.|Ataque sorpresa: el atacante decide quién tiene la iniciativa en el primer PI.|OBJETIVO: cada vez que el Comandante efectúa Revisar los planes, el defensor 2 PV; al final de la batalla, 3 PV al jugador que controla la zona objetivo (controla quien tenga mayor LPA combinado de sus agentes en la zona que el combinado de los agentes enemigos en ella); al final, si al Comandante le quedan todas las heridas, el defensor 1 PV; si el Comandante está herido, el atacante 6 PV (9 PV si está incapacitado).|EQUIPO del defensor: medicae automático [1 PE]: una vez por PI, un agente con él puede efectuar Administrar medicina (1 PA): mientras su Comandante esté visible y a ▲ o menos; el Comandante recupera 2 heridas perdidas.|CAMPAÑA: tácticas atacante «Buscar y destruir» ≥3 PV → +1 req.; defensor «Seguridad» ≥3 PV → +1 req. Especiales: Objetivo eliminado (Eliminación / Orden de Purga): si el comandante enemigo estaba incapacitado al final del 2.º PI, −1 partida. Solo un rasguño (Celebrar el ritual / Asegurar distrito): si su comandante no está incapacitado ni ha sufrido daño antes del último PI, −1 partida.',
'2.2': 'Misión 2.2 · Saboteadores (tabla 2).|REGLAS: Argucia: tras elegir su comando, el defensor lo divide en dos fuerzas, con el mayor número posible de miniaturas en cada una. El atacante elige una: esa fuerza ha sido engañada y sus agentes no comienzan en la zona de aniquilación, sino que llegan más tarde.|Es un señuelo, regresemos a la base: al inicio de la fase de estrategia del 2.º PI, el defensor tira 1D6 por cada agente de la fuerza engañada: con 4+ regresa y se despliega en cualquier punto completamente en su zona de descenso, completamente a ■ o menos de un borde del campo de batalla y a más de ▲ de todo agente enemigo. Al inicio de la fase de estrategia del 3.er PI, todos los restantes regresan y se despliegan en cualquier punto completamente a ■ o menos de cualquier borde del campo de batalla y a más de ▲ de todo agente enemigo.|Acción de misión (atacante) Poner explosivos (1 PA): a ▲ o menos de la instalación vital; no si está en la zona de amenaza de un agente enemigo. La estructura sufre 1 punto de daño (2 si el agente está en lo alto del punto aventajado de la instalación). Hasta el final del PI el agente no puede efectuar Carga ni Disparo.|OBJETIVO: al final de la batalla, según los puntos de daño de la instalación vital (atacante / defensor): 0 → 0 / 12; 1-3 → 4 / 8; 4-6 → 8 / 4; 7+ → 12 / 0.|EQUIPO atacante: cargas de fusión [1 PE]: Poner explosivos causa 1 punto de daño adicional. Defensor: voco de emergencia [1 PE]: suma 1 a la tirada de regreso.|CAMPAÑA: tácticas atacante «Infiltración» ≥3 PV → +1 req.; defensor «Seguridad» ≥3 PV → +1 req. Especiales: Defensa íntegra (Unidos por el honor / Asegurar distrito) si la instalación no sufrió daño, −1 partida; Arrasado hasta los cimientos (Demolición / Infiltrarse en el enemigo) si sufrió 7+ puntos, −1 partida.',
'2.3': 'Misión 2.3 · Entrega de suministros (tabla 2).|REGLAS: Llegan suministros: al inicio de la fase de estrategia del 3.er PI, los jugadores determinan al azar uno de los marcadores de objetivo y lo retiran. Al inicio de la fase de estrategia del 4.º PI, determinan al azar uno de los dos restantes y lo retiran. El restante representa los suministros recibidos.|EQUIPO: baliza [1 PE]: una vez por PI un agente con baliza puede efectuar Activar baliza (1 PA): a ▲ o menos de un marcador de objetivo que controle; ese marcador obtiene 1 punto de baliza. Al determinar al azar qué marcador retirar, si el elegido tiene 1 o más puntos de baliza, réstale 1 y vuelve a determinar al azar (si se elige otra vez uno con puntos, repite hasta que salga uno sin puntos de baliza, que se retira).|OBJETIVO: al final de cada PI, PV por cada marcador de objetivo que controles: PI 1 → 2; PI 2 → 2; PI 3 → 3; PI 4 → 6.|CAMPAÑA: Operaciones tácticas «Seguridad» ≥3 PV → +1 req. Especiales (Recuperar arqueotecnología / Unidos por el honor, «Asegurado en persona»): si un LÍDER de tu comando controla el marcador de Suministros entregados al final, −1 partida.',
'3.1': 'Misión 3.1 · Emboscada (tabla 3).|REGLAS: Posiciones ocultas: el atacante despliega primero a todos sus agentes con despliegue oculto: asigna un número único a cada agente y, en lugar de desplegarlo, coloca un marcador numerado boca abajo (o un número/dado secreto junto al marcador). Debe desplegar los marcadores entre sus dos zonas de descenso lo más uniformemente posible. Después el defensor despliega todo su comando normalmente. Luego los marcadores del atacante se ponen boca arriba y se sustituyen por el agente correspondiente.|El elemento sorpresa: el atacante decide quién tiene la iniciativa en el primer PI.|Escape: los agentes del defensor pueden salir por el borde de la zona de aniquilación del atacante; han escapado, no participan más en la misión y no cuentan como incapacitados a ningún efecto de reglas.|OBJETIVO: cada vez que un agente del defensor escapa, el defensor 2 PV; cada vez que un agente del defensor resulta incapacitado, el atacante 2 PV.|EQUIPO atacante: señuelo [1 PE]: por cada agente con señuelo, un marcador de despliegue oculto adicional (sin número, se retira al sustituir los demás). Defensor: escáner [2 PE]: por cada agente con escáner, antes de colocar cualquiera de tus agentes eliges un marcador de despliegue oculto; el atacante debe ponerlo boca arriba (y sustituirlo si es un agente).|CAMPAÑA: tácticas atacante «Buscar y destruir» ≥3 PV → +1 req.; defensor «Seguridad» ≥3 PV → +1 req. Especiales: Emboscada perfecta (Orden de purga / Eliminación) si todo agente enemigo resultó herido o incapacitado, −1 partida; Evasión (Rescate / Escapada) si la mitad o más de tus agentes escapó, −1 partida.',
'3.2': 'Misión 3.2 · Evacuación (tabla 3).|REGLAS: Rodeados: el defensor no tiene borde de la zona de aniquilación; todos los bordes cuentan como borde del atacante.|Fuerte: los cuatro Muros se combinan en un único Fuerte; los agentes no pueden entrar en él, deben escalar a su punto aventajado.|Fuerza de rescate: tras elegir su comando, el defensor lo divide en dos fuerzas, con el mayor número posible de miniaturas en cada una; el atacante elige una, que será la fuerza de rescate y no comienza en la zona de aniquilación (llegará más tarde). Los agentes del otro grupo son espías.|Llegan refuerzos: al inicio de la fase de estrategia del 2.º PI, el defensor tira 1D6 por cada agente de la fuerza de rescate: con 4+ regresa y se despliega en cualquier punto completamente a ■ o menos de cualquier borde del campo de batalla y fuera de la zona de amenaza de todo agente enemigo. Al inicio de la fase de estrategia del 3.er PI, todos los restantes regresan y se despliegan igual.|Poca munición: cada vez que un espía efectúa Disparo o Disparos defensivos, tras resolverla tira 1D6: con 1-2, coloca un marcador de sin munición; no puede efectuar Disparo ni Disparos defensivos con las armas de su tarjeta de datos mientras lo tenga. Acción de misión de los espías Repartir munición y recargar (1 PA): puedes quitar ese marcador.|OBJETIVO: al final de cada PI, el defensor 1 PV por cada espía en un punto aventajado de un elemento de terreno completamente en su zona de descenso (máx. 3 PV por PI); cada vez que un espía resulta incapacitado, el atacante 3 PV; al final de la batalla, el atacante 1 PV por cada espía del defensor en el campo de batalla que esté herido o que no esté en un punto aventajado de un elemento de terreno completamente en su zona de descenso.|EQUIPO atacante: inhibidores [1 PE]: una vez por PI, cuando el defensor tira el regreso de un agente de la fuerza de rescate, un agente con inhibidor puede usarlo: −1 a la tirada. Defensor: más balas [1 PE]: una vez por batalla, la primera tirada de munición fallida de este agente se considera pasada.|CAMPAÑA: tácticas atacante «Infiltración» ≥3 PV → +1 req.; defensor «Reconocimiento» ≥3 PV → +1 req. Especiales: ¡No habrá prisioneros! (Orden de purga / Unidos por el honor) si todo espía resultó herido o incapacitado, −1 partida; Fuga (Rescate / Asegurar distrito) si ningún espía resultó incapacitado y todos están en la zona de descenso del defensor, −1 partida.',
'3.3': 'Misión 3.3 · Romper defensas (tabla 3).|REGLAS: acción de misión Minar zona (1 PA): a ▲ o menos de un marcador de objetivo que controle, que esté en la zona de descenso del enemigo y que no haya sido ya minado; hasta el final del PI no puede efectuar Carga ni Disparo; el marcador queda minado.|EQUIPO: garfio de agarre [1 PE]: habilidad: al ascender/descender trepando, la primera distancia vertical de hasta 3 solo cuenta como 1 para ese trepar; no necesita estar a ▲ de una parte trepable para trepar; al dejarse caer, la ubicación prevista puede estar a cualquier distancia vertical, y cualquier distancia vertical que recorre cuenta como la mitad para la caída.|OBJETIVO: al final de cada PI, 1 PV si uno o más agentes amigos están completamente en la zona de descenso del enemigo; al final de cada PI, 1 PV si controlas el marcador de objetivo del punto aventajado del Pozo petrolífero; al final de la batalla, 4 PV por cada marcador de objetivo de la zona de descenso enemiga que fue minado; al final de la batalla, 2 PV por cada marcador de objetivo de tu zona de descenso que no fue minado.|CAMPAÑA: Operaciones tácticas «Seguridad» ≥1 PV o «Infiltración» ≥1 PV → +1 req. Especiales (Demolición / Infiltrarse en el enemigo, «Defensas superadas»): si has minado ambos marcadores del enemigo y tienes al menos dos agentes en la zona de descenso rival, −1 partida.' };
function octRules(m) { const k = (E.OCT[m - E.OCT0] || {}).oct;
  return ['Kill Team: Octarius', ['Zona de aniquilación Octarius (30"×22"): Muros destartalados, un Pozo petrolífero, Barricadas destartaladas y Montones de chatarra; el terreno y las zonas de descenso del atacante (jugador 1) y del defensor (jugador 2) son los de la misión ' + k + ' del libro.', 'Muro destartalado: partes con distintos rasgos: franqueable y ligero (parapeto), punto aventajado (la cubierta, se trepa) y pesado (el cuerpo).', 'Pozo petrolífero: una parte con el rasgo punto aventajado (la plataforma); el resto de partes tienen el rasgo pesado.', 'Barricada destartalada: todas sus partes tienen los rasgos ligero y franqueable.', 'Montón de chatarra: todas sus partes tienen los rasgos ligero y escarpado.', 'Escarpado: un agente no puede trepar por esta parte del elemento de terreno. En su lugar ha de lanzarse por encima, con la acción Lanzarse por encima o Cargar por encima.', 'Lanzarse por encima (1 PA, se trata como Movimiento normal): a ▲ o menos de una parte escarpada; se mueve como si pudiera VOLAR con movimiento ilimitado y debe terminar a ▲ o menos de una parte escarpada. Puede moverse a la zona de amenaza de un enemigo pero no terminar en ella. No desde la zona de amenaza enemiga ni en la activación en que efectuó Movimiento normal, Retroceder o Cargar.', 'Cargar por encima (1 PA, se trata como Carga): igual, con las reglas de Carga. No con orden de Ocultarse ni a ▲ o menos de enemigos, ni en la activación en que efectuó Movimiento normal o Retroceder.', ...(OCT_MIS[k] || '').split('|')]]; }
const SPECIAL_RULES = { gdp: () => GDP_RULES,
  ar: ['Archivista 1 · Traición (misión conjunta de tres bandos)', ['Jugadores + el Archivista (operativo amigo que avanza solo por el Camino al activarse), Centinelas NPO (15 puntos, en su mitad, fuera de la cámara) y el posible traidor. Cada PI (desde el 2.º) se tira 2D6 (+1 si 2+ agentes van por delante del Archivista, +1 en PI 3-4, +2 si un agente lleva el marcador): con 7+ (seguro en el PI 4) el Archivista se vuelve Némesis NPO y va a por el marcador.', 'Recoger marcador (1 PA): en la cámara; quien lo lleva no puede Correr. Ganáis si un agente lo lleva a vuestra mitad; perdéis si el Archivista traidor lo controla o sigue en territorio NPO.']],
  am1: ['Ambull 1 · El enemigo oculto (misión conjunta de tres bandos)', ['Tres bandos: los jugadores, los Centinelas NPO (D6+10 puntos, con Ocultarse en zonas de descenso NPO alternas desde una al azar) y los Intrusos (Ambull + 2 Borewyrm en reserva). En lugar de la iniciativa se establece un orden: un D6 por bando (los empates se repiten) y se activa en ese orden.', 'Eliminar activos (1 PA): retira un marcador que controlas (no en el 1.er PI ni a alcance de control enemigo) y roba una carta del mazo del Intruso. Los Centinelas se activan por el principio de amenaza y no contraatacan; refuerzos como gambito: +D3 puntos desde el 2.º PI, con Ocultarse tocando el borde NPO. Los Intrusos se activan con el mazo de activación NPO si hay alguno en el killzone.', 'Escapar: tus agentes pueden salir por el borde inferior (Reposicionarse). Fin: todos escapados o incapacitados. PV: 1 por marcador retirado (jugadores); 1 NPO por cada marcador en pie y 1 por cada tercio de tus operativos iniciales incapacitados. Gana quien tenga más.', 'Aviso: los suelos y escalones de las ruinas no están modelados; solo cuentan sus muros.']],
  vmp: ['Squad-Games Vulkus Map Pack', ['Mapa de Squad-Games (licencia CC BY 4.0). Designed by Squad-Games – www.squad-games.net', 'Distribución remix de terreno Vulkus (o Double Vulkus). Los muros y marcos pesados bloquean; el terreno ligero y los barriles dan cobertura sin bloquear. Las zonas de despliegue son las franjas azul y naranja.', 'Aviso: las ruinas grises (escalones y suelos) no están modeladas; solo cuentan sus muros.']],
  aa: ['Asalto aerotransportado (Asalto a la colmena)', ['Misión de Ataque contra Defensa con roles fijos (se te preguntará qué rol juegas). Mapas de Volkus; las zonas de descenso y las fortalezas son las del mapa de misión.', '2A, 2B, 3A y 3B: el defensor despliega primero, totalmente en su zona de descenso y con Ocultarse. Los agentes del asaltante empiezan «en las alturas» (el texto impreso dice «defensor» por errata): al activarse pueden aterrizar (cuenta como Reposicionarse; cuesta 1 PA) totalmente en su zona de descenso o, en el PI 2, a ≤6" de ella, fuera de zonas de control y sin peana bajo terreno Aventajado. Deben haber aterrizado al final del PI 2.', '2B: al ir a aterrizar, D6: con 6, 1D3 de daño; si el resultado es mayor que su LPA, debe aterrizar totalmente en un sector aleatorio (cuatro sectores verticales).', '1A: Plantar bomba (asaltante) / Desactivar bomba (defensor), 1 PA en un marcador controlado (no en el PI 1). Cuenta atrás 1D6+3 activaciones; si explota, gana el asaltante (errata del libro: dice «defensor»). El defensor gana si todos los asaltantes caen o, desde el PI 4, no hay bomba.', '2A, 2B, 3B: las fortalezas empiezan aseguradas por el defensor; al final de cada PI se asegura la que tenga más LPA completamente dentro. Desde el PI 4 gana quien controle ambas. 3B: Bombardeo (gambito del asaltante, una vez): −1 LPA a quien se active en territorio defensor y daño (D6 1-3 en fortaleza; 2D6 fuera). 3B: el defensor también gana si, desde el PI 4, ningún asaltante está totalmente en su territorio.', '3C: el asaltante despliega primero; los defensores «rodean al enemigo» (aterrizan al activarse en su territorio o a ≤ Movimiento de cualquier borde). Extracción aerotransportada (desde el PI 4, desde lo más alto de la Fortaleza B) y La moral flaquea; gana el asaltante si huye la mitad o más. Aproximación: la extracción se ofrece al agente que está en lo más alto de la Fortaleza B.', 'El mapa 3A no está incluido: el PDF aportado no trae la p.65.']],
  oct: octRules,
  desc: ['Descent (Shadowhunt)', ['El campo de batalla son dos tableros pequeños unidos por marcadores Entryway, no un tablero único.', 'Un agente a ≤1,6" de un Entryway puede teletransportarse al marcador pareja (Reposicionarse, Retirarse o Cargar sin moverse), una vez por punto de inflexión y si el destino no está ocupado.', 'Disparar a través de un Entryway ignora el alcance; el blanco no cuenta como cubierto ni ofuscado.', 'Los pasillos son muy estrechos: el movimiento usa el radio real de la peana, y una peana grande puede no caber en algunos huecos.', 'Variantes: Joint Ops (JO1–3, cooperativo), Adversary Ops (AO1–3) y 2 jugadores (U1–U6). Algunos Entryway empiezan bloqueados hasta abrirlos.']],
  vc: ['Volkus Compound', ['No es una partida normal: es una misión de Ataque contra Defensa con roles fijos. Se te preguntará qué rol juegas.', 'La Defensa coloca primero y después un tercio de su comando cada vez; el Ataque despliega en una zona en forma de escalera.', 'Hay empalizadas, búnkeres y puertas que se trepan o se abren, y bombardeo preliminar.', 'No se usan Operaciones Aprobadas ni Blood and Zeal en esta misión.']],
  ty: ['Typhon · Adversary Ops', ['Hay un tercer bando (los NPO tiránidos) que actúa solo.', 'Las peanas empiezan en posiciones fijas del mapa: no hay fase de despliegue normal.', 'La infestación cuenta como terreno propio del escenario.', 'El turno de los NPO y las condiciones de victoria son los del dosier de Typhon, no los de una partida estándar.']],
  open: ['Mapa abierto (Mod)', ['Este mapa solo existe en el mod: no sale en los libros.', 'Se juega con las reglas estándar sobre un tablero distinto.']]
};
const GDP_RULES = ['Squad-Games Gallowdark+', ['Mapa de Squad-Games (licencia CC BY 4.0). Designed by Squad-Games – www.squad-games.net', 'Gallowdark+ amplía Gallowdark con muros que se pueden romper (puntos de brecha), plataformas de teletransporte y terreno ligero; usa las reglas de Tomb World.', 'PUNTO DE BRECHA: tiene dos estados, cerrado y abierto, y dos partes: un punto de acceso y un muro de brecha. Empiezan CERRADOS. Cerrado: el muro de brecha está dentro del punto de acceso, y ambos son terreno Pesado y Muro. Abierto: el muro de brecha se retira de la zona de combate y el punto de acceso es terreno Accesible e Insignificante, además de Expuesto (el cobertura y la ofuscación las dan entonces los muros a cada lado). Una vez abierto no se puede cerrar.', 'ACCIÓN BREACH (2 PA): abre un punto de brecha cerrado cuyo punto de acceso esté dentro del alcance de control del agente. Un agente con «breach marker», «grenadier» o «mine» en su datacard, o con un arma con Perforante 2 o Perforante Crits 2 (salvo las que tienen Blast o Torrent), la hace por 1 PA menos (mínimo 1 PA), pero no en una activación/contraactivación en la que haya hecho Cargar o Disparar (ni a la inversa).', 'Tira un D6 por cada agente al otro lado del punto de acceso que lo tenga en su alcance de control: con 4+ resta 1 a su APL hasta el final de su siguiente activación y recibe un daño igual a la mitad del resultado (redondeando hacia arriba).', 'Un agente no puede hacer Breach durante el primer punto de inflexión, dentro del alcance de control de un enemigo, ni en un turno en que fue desplegado.', 'PLATAFORMA DE TELETRANSPORTE: terreno Expuesto, Insignificante y Aventajado. Solo un agente a la vez, y mientras esté en ella no toca el suelo de la zona de combate. Desde el segundo punto de inflexión, cuando un agente amigo en una plataforma haga Cargar, Retirarse o Reposicionarse, puede teletransportarse: no se mueve, se retira y se coloca en la otra plataforma (debe cumplir el resto de requisitos de la acción; p. ej. al Cargar debe acabar en alcance de control de un enemigo). Si hay otro agente en la otra plataforma, se intercambian (si es enemigo, su jugador lo coloca).', 'TERRENO LIGERO: grupos de piezas de terreno Ligero (barriles, cajas, escombros).']];
function specialKey(setup) { const m = setup.map; if (setup.joint) { const j = +setup.joint.mission; if (j >= 21 && j <= 23) return 'desc'; if (j === 65) return 'am1'; if (j === 66) return 'ar'; return null; } if (!Number.isInteger(m)) return null; if (m >= E.TYA0 && m < E.TY0) return 'ty'; if (m >= E.VC0 && m < E.TYA0) return 'vc'; if (m >= E.DSC0 && m < E.VC0) return 'desc'; if (m >= E.OCT0 && m < E.OCT0 + E.OCT.length) return 'oct'; if (m >= E.AAM0 && m < E.AAM0 + E.AAM.length) return 'aa'; if (m >= E.GDP0 && m < E.GDP0 + E.GDP.length) return 'gdp'; if (m >= E.VMP0 && m < E.VMP0 + E.VMP.length) return 'vmp'; if (/^Abierto/.test(E.MAPNAMES[m] || '')) return 'open'; return null; }
function startFromMenu() {
  const NP = M.mode === 'mp' ? +M.np : 2; for (const t of (M.mode === 'coop' ? [M.teams[0]] : M.teams.slice(0, NP))) if (t.ops.length < 3) return toast('Cada equipo necesita al menos 3 operativos');
  if (!startFromMenu.ok) { const iss = M.teams.slice(0, NP).map((t, p) => M.mode === 'coop' && p === 1 ? { p, l: [] } : ({ p, l: [...E.rosterIssues(teamById(t.id), t.ops, t.swap || []), ...E.eqIssues(teamById(t.id), t.ops, t.eq || [])] })).filter(x => x.l.length); // listas no legales: aviso con confirmación en la página
    if (iss.length) { toast('La lista no sigue la hoja de selección: corrígela para jugar'); $('#modalBox').innerHTML = `<h2>Lista no legal</h2>` + iss.map(x => `<p><b style="color:${COL[x.p]}">Jugador ${x.p + 1}</b>: ${x.l.map(H).join(' · ')}</p>`).join('') + `<div class="acts"><button class="btn" id="legBack">Volver a la lista</button></div>`; $('#modal').hidden = false; $('#legBack').onclick = closeModal; return; } }
  { const mp0 = parseInt($('#mapSel').value), k0 = specialKey({ map: Number.isInteger(mp0) ? mp0 : null, joint: M.mode === 'coop' ? { mission: +$('#jmSel').value } : null }); if (k0 && !startFromMenu.rulesOk) { const [ti, li] = typeof SPECIAL_RULES[k0] === 'function' ? SPECIAL_RULES[k0](mp0) : SPECIAL_RULES[k0]; $('#modalBox').innerHTML = `<h2>${H(ti)} · no es mapa normal</h2><p class="hint">Reglas especiales de este escenario:</p><ul>${li.map(x => `<li>${H(x)}</li>`).join('')}</ul><div class="acts"><button class="btn" id="spGo">Entendido, jugar</button><button class="btn ghost" id="spNo">Volver</button></div>`; $('#modal').hidden = false; $('#spNo').onclick = closeModal; $('#spGo').onclick = () => { closeModal(); startFromMenu.rulesOk = true; try { startFromMenu(); } finally { startFromMenu.rulesOk = false; } }; return; } }
  const sd = parseInt($('#seed').value); const seed = Number.isFinite(sd) ? sd : (Math.random() * 1e9) | 0;
  const setup = { seed, teams: M.teams.slice(0, NP).map((t, p) => ({ id: t.id, ops: t.ops.slice(), swap: (t.swap || []).slice(), eq: (t.eq || (M.mode === 'ai' && p !== +M.side ? [...(E.FEQ[t.id] || []).slice(0, 2).map(f => 'f_' + f.id), 'gren_fk', 'mines', 'ammo', 'barr_light'].slice(0, 4) : [])).slice() })) }; const mp = parseInt($('#mapSel').value); if (Number.isInteger(mp)) setup.map = mp; const cs = parseInt(($('#critSel') || {}).value); if (Number.isInteger(cs)) setup.crit = cs; if ($('#aopChk') && $('#aopChk').checked) { setup.aop = true; setup.teams.forEach((t, p) => { const tv = $('#tac' + p).value; if (tv) t.tac = tv; if (M.mode === 'ai' && p !== +M.side) { t.prim = 'kill'; delete t.tac; } /* la operación principal se elige en secreto en el gambito estratégico del 1.er PI */ }); }
  if ($('#jmDif') && +$('#jmDif').value) setup.jmDif = +$('#jmDif').value;
  if ($('#aoSel') && +$('#aoSel').value && M.mode !== 'mp' && M.mode !== 'coop') { setup.ao = +$('#aoSel').value; delete setup.bz; if (setup.ao !== 4) delete setup.map; /* Tomb World AO conserva el mapa elegido si es de Tomb World */ }
  if ($('#bzChk') && $('#bzChk').checked && M.mode !== 'mp' && M.mode !== 'coop' && !setup.ao) setup.bz = true; // Blood and Zeal
  if ($('#ggChk') && $('#ggChk').checked && M.mode !== 'mp' && M.mode !== 'coop' && !setup.ao && !setup.bz && !setup.joint) setup.gg = true; // Hivestorm: The Great Gun Fires
  if ($('#nopSel') && $('#nopSel').value && (M.mode === 'ai' || M.mode === 'hot') && !setup.ao && !setup.bz) { const [z0, z1] = $('#nopSel').value.split('|'); setup.nops = { sz0: z0, sz1: z1, st0: +($('#nopSt0') ? $('#nopSt0').value : 0), st1: +($('#nopSt1') ? $('#nopSt1').value : 0) }; if (M.nopExtra) { Object.assign(setup.nops, M.nopExtra); M.nopExtra = null; } }
  if (M.mode === 'mp') { beginGame(setup, [], { mode: 'ai', me: 0, level: M.level }); return; }
  if (M.mode === 'coop') { setup.joint = { mission: +$('#jmSel').value, tyMix: !!($('#tyMix') && $('#tyMix').checked), njRole: $('#njRole') ? $('#njRole').value : undefined, njSize: $('#njSize') && $('#njSize').value ? $('#njSize').value : undefined, njAl: $('#njAl') && $('#njAl').value ? $('#njAl').value : undefined, njCfg: (() => { const c = {}; if ($('#njBeh') && $('#njBeh').value) c.behaviour = $('#njBeh').value; if ($('#njTr') && $('#njTr').value) c.traits = [$('#njTr').value]; if ($('#njNm') && $('#njNm').value.trim()) c.name = $('#njNm').value.trim(); const wr = $('#njWr') && $('#njWr').value, wm = $('#njWm') && $('#njWm').value; if (wr || wm) c.weapons = [wr || 'Autocannon', wm || 'Close combat weapon']; return Object.keys(c).length ? c : undefined; })() }; setup.teams[1] = { id: 'anj', ops: [], eq: [] }; setup.teams[0].eq = (M.teams[0].eq || []).slice(); beginGame(setup, [], { mode: 'ai', me: 0, level: M.level }); return; }
  if (M.mode === 'net') { if (!setup.ao && !setup.bz && !setup.joint) { setup.aop = true; setup.teams.forEach((t, p) => { if (p === 1) delete t.tac; }); } netHostLive(setup); return; }
  if (Number.isInteger(setup.map) && setup.map >= E.TYA0 && setup.map < E.TY0 && !setup.ao && !setup.joint && M.mode !== 'mp' && M.mode !== 'coop') { setup.ao = 5; delete setup.bz; delete setup.aop; } // mapa de Typhon AO elegido a mano = Adversary Ops de Typhon
  if (Number.isInteger(setup.map) && setup.map >= E.VC0 && setup.map < E.TYA0 && !setup.ao && !setup.joint && (M.mode === 'ai' || M.mode === 'hot')) { // Volkus Compound: misión Ataque contra Defensa (el jugador 1 del motor ataca)
    delete setup.aop; delete setup.bz; const hi = M.mode === 'ai' ? +M.side : 0, human = setup.teams[hi], other = setup.teams[1 - hi];
    vcRoleChoose(human, other).then(({ def, ruse, npo }) => { setup.vcRuse = ruse; setup.depInit = 1; /* libro: la Defensa empieza colocando el equipo y después un tercio del comando cada vez */ const opp = npo ? { id: 'anj', ops: [], eq: [] } : other; setup.teams = def ? [opp, human] : [human, opp]; beginGame(setup, [], { mode: M.mode, me: M.mode === 'ai' ? (def ? 1 : 0) : 0, level: M.level }); }); return; }
  if (Number.isInteger(setup.map) && setup.map >= E.AAM0 && setup.map < E.AAM0 + E.AAM.length && !setup.ao && !setup.joint && (M.mode === 'ai' || M.mode === 'hot')) { // Asalto aerotransportado: roles fijos Asaltante / Defensor
    const seat = M.mode === 'ai' ? +M.side : 0; delete setup.aop; delete setup.bz; delete setup.gg;
    $('#modalBox').innerHTML = `<h2>${H(E.AAM[setup.map - E.AAM0].n)}</h2><p>Misión de Asalto aerotransportado: roles fijos. ¿Qué rol juega ${M.mode === 'ai' ? 'tu equipo' : 'el Jugador 1'}?</p><div class="acts"><button class="btn" id="aaAtk">Asaltante</button><button class="btn" id="aaDef">Defensor</button></div>`; $('#modal').hidden = false;
    const go = atk => { closeModal(); setup.aaRole = atk ? seat : 1 - seat; beginGame(setup, [], { mode: M.mode, me: seat, level: M.level }); };
    $('#aaAtk').onclick = () => go(true); $('#aaDef').onclick = () => go(false); return; }
  if (!setup.ao && !setup.bz && !setup.joint && (M.mode === 'ai' || M.mode === 'hot')) { prepStep(setup).then(sw => beginGame(setup, [], { mode: M.mode, me: M.mode === 'ai' ? (sw ? 1 - +M.side : +M.side) : 0, level: M.level })); return; }
  if (setup.aop && (M.mode === 'ai' || M.mode === 'hot')) { exploreStep(setup).then(sw => beginGame(setup, [], { mode: M.mode, me: M.mode === 'ai' ? (sw ? 1 - +M.side : +M.side) : 0, level: M.level })); return; }
  beginGame(setup, [], { mode: M.mode, me: M.mode === 'ai' ? +M.side : 0, level: M.level });
}

/* Secuencia de juego (manual, pág. 110): 1 Montar la batalla · 2 Elegir agentes · 3 Desplegar · 4 Librar la batalla. Se resuelve visiblemente en todas las partidas estándar de 2 jugadores. */
const d6r = () => 1 + Math.floor(Math.random() * 6);
function prepRoll() { let r = [d6r(), d6r()]; const log = [r.slice()]; while (r[0] === r[1]) { r = [d6r(), d6r()]; log.push(r.slice()); } return { w: r[0] > r[1] ? 0 : 1, log }; }
const eqName = (tid, k) => E.EQUIP[k] || ((E.FEQ[tid] || []).find(f => 'f_' + f.id === k) || {}).n || k;
function prepSummary(setup, info) { // pasos 2-4 revelados: agentes, equipo, 2 PM, despliegue e iniciativa
  return new Promise(res => {
    const nm = p => M.mode === 'hot' ? `Jugador ${p + 1}` : (p === info.me ? 'Tú' : 'Rival');
    const rost = p => { const T = setup.teams[p], t = teamById(T.id), cnt = {}; for (const id of T.ops) { const b = baseId(id), o = t.ops.find(x => x.id === b); const n = ESM.esName(o ? o.name : b); cnt[n] = (cnt[n] || 0) + 1; } return Object.entries(cnt).map(([n, c]) => c > 1 ? n + ' ×' + c : n).join(', '); };
    const eq = p => { const T = setup.teams[p]; const l = (T.eq || []).map(k => eqName(T.id, k)); return l.length ? l.map(H).join(', ') : 'ninguna'; };
    const tr = p => Math.max(1, Math.ceil(setup.teams[p].ops.length / 3));
    $('#modalBox').innerHTML = `<h2>Preparación de la batalla</h2>
      <p><b>1 · Montar la batalla</b><br>Comandos: ${[0, 1].map(p => `${nm(p)} <b>${H(teamById(setup.teams[p].id).name)}</b>`).join(' contra ')}. Tirada de desempate (${info.rolls.map(r => r.join('–')).join(', ')}): <b>${nm(info.depInit)}</b> tiene la iniciativa en el despliegue, los marcadores de objetivo quedan colocados según la misión y ${nm(info.depInit)} elige su zona de descenso (${info.sw ? 'cambiada con el rival' : 'la elegida'}).</p>
      <p><b>2 · Elegir agentes</b> (revelación simultánea)<br>${[0, 1].map(p => `<b style="color:${COL[p]}">${nm(p)}</b>: ${rost(p).replace(/^$/, '–')}<br><span class="hint">Equipo: ${eq(p)} · 2 PM${info.late ? ' · operación táctica elegida en secreto' : ''}</span>`).join('<br>')}</p>
      <p><b>3 · Desplegar agentes</b><br>Primero se despliegan por turnos las piezas de equipo previas a la batalla y después un tercio del comando cada vez (${tr(0)} y ${tr(1)} agentes), empezando por ${nm(info.depInit)}, completamente en su zona de descenso y con orden de Ocultarse.</p>
      ${info.late ? `<p><b>4 · Explorar</b><br>Tras el despliegue, cada jugador elige en secreto Equipar, Ardid o Reposicionar y se revelan a la vez; lo resuelve primero quien tiene la iniciativa.</p><p><b>5 · Librar la batalla</b><br>La iniciativa del primer punto de inflexión la decide Explorar: Equipar gana a Ardid, Ardid gana a Reposicionar y Reposicionar gana a Equipar; si empatan decide quien no tuvo la iniciativa en el despliegue. Como gambito estratégico, cada jugador elige en secreto su operación principal.</p><p><b>6 · Fin de la batalla</b><br>Tras cuatro puntos de inflexión se revela la operación principal y gana quien tenga más PV.</p>` : `<p><b>4 · Librar la batalla</b><br>Desempate del primer punto de inflexión (${info.rolls1.map(r => r.join('–')).join(', ')}${info.tie ? ', empate: decide quien no tuvo la iniciativa en el despliegue' : ''}): ${nm(info.dec)} decide y la iniciativa es de <b>${nm(info.init)}</b>.</p>`}
      <button class="btn" id="expGo">Empezar el despliegue</button>`;
    $('#modal').hidden = false; $('#expGo').onclick = () => { closeModal(); res(); };
  });
}
/* Cartas de operación táctica (texto de las cartas del Approved Ops Card Pack 2025 traducido: erratas oct. '26, Wahapedia y KTDash) */
const TACCARD = {
  flank: { rev: 'Como GAMBITO ESTRATÉGICO.', rules: 'Divide la zona de matanza en dos flancos (izquierdo y derecho) con una línea imaginaria como la línea central, pero que va del centro del borde de cada jugador. Un operativo disputa un flanco mientras está completamente dentro de él y completamente en el territorio del oponente. Los operativos amigos controlan un flanco si el APL total de los que lo disputan es mayor que el de los enemigos.', vp: 'Tras revelar esta op, al final de cada punto de inflexión tras el primero, por cada flanco que controlen tus operativos, 1 PV. En el cuarto, si también controlaban ese flanco al final del tercero, 2 PV en su lugar. No más de 2 PV de esta op por punto de inflexión.' },
  retrieval: { rev: 'La primera vez que anotes PV de esta op.', act: ['RECUPERAR · 1 PA', 'Si el operativo activo controla un marcador de objetivo que no haya sido registrado por operativos amigos, pasa a llevar uno de tus marcadores de misión de Recuperación y ese marcador de objetivo queda registrado. Los operativos amigos pueden hacer Recoger marcador sobre tus marcadores de Recuperación. No se puede hacer durante el primer punto de inflexión, dentro del alcance de control de un enemigo ni si ya se lleva un marcador.'], vp: 'La primera vez que cada marcador de objetivo es registrado por operativos amigos, 1 PV. Al final de la batalla, por cada marcador de Recuperación que lleven tus operativos, 1 PV.' },
  martyrs: { rev: 'La primera vez que un operativo amigo es incapacitado mientras disputa un marcador de objetivo.', rules: 'Siempre que un operativo amigo es incapacitado mientras disputa un marcador de objetivo, ese marcador gana uno de tus tokens de Mártir. Solo cuenta la primera vez que cada operativo es incapacitado (si vuelve y es incapacitado de nuevo, no hay segundo token).', vp: 'Al final de cada punto de inflexión tras el primero, si tus operativos disputan un marcador con uno o más de tus tokens de Mártir, puedes retirar cualquiera de ellos. Por cada token retirado, 1 PV; si además tus operativos controlan ese marcador, 2 PV en su lugar. No más de 2 PV de esta op por punto de inflexión.' },
  envoy: { rev: 'La primera vez que elijas un enviado.', rules: 'Como GAMBITO ESTRATÉGICO en cada punto de inflexión tras el primero, elige un operativo amigo como tu enviado hasta el paso Preparar de la siguiente fase de Estrategia. No puedes elegir uno que hayas elegido en un punto anterior ni uno ignorado para la op de matar.', vp: 'Al final de cada punto de inflexión tras el primero, si tu enviado está completamente en territorio enemigo y fuera del alcance de control de enemigos, 1 PV; si además no ha perdido heridas en ese punto de inflexión, 2 PV en su lugar.' },
  sweep: { rev: 'La primera vez que un operativo enemigo es incapacitado mientras disputa un marcador de objetivo, o la primera vez que un operativo amigo hace la acción Despejar (lo que ocurra primero).', rules: 'Cuando un operativo enemigo que disputa un marcador de objetivo es incapacitado, ese marcador queda barrido hasta el paso Preparar de la siguiente fase de Estrategia.', act: ['DESPEJAR · 1 PA', 'Un marcador de objetivo que controla el operativo activo queda despejado durante el punto de inflexión. No se puede hacer durante el primer punto de inflexión ni dentro del alcance de control de un enemigo.'], vp: 'Al final de cada punto de inflexión tras el primero, si el marcador central o el de tu oponente está despejado y los operativos enemigos no lo disputan, 1 PV; si además está barrido, 2 PV en su lugar. Si tus operativos controlan un marcador barrido, 1 PV. No más de 2 PV de esta op por punto de inflexión.' },
  dominate: { rev: 'La primera vez que un operativo enemigo es incapacitado por un operativo amigo.', rules: 'Cada vez que un operativo amigo incapacita a un operativo enemigo, ese operativo amigo gana uno de tus tokens de Dominar, o dos si el enemigo tenía una característica de Heridas de 12 o más.', vp: 'Al final del tercer y del cuarto punto de inflexión puedes retirar tokens de Dominar de operativos amigos que estén en la zona de matanza y no estén incapacitados. Por cada uno retirado, 1 PV. No más de 3 PV de esta op por punto de inflexión.' },
  devices: { rev: 'La primera vez que un operativo amigo realiza la acción Colocar dispositivo.', act: ['COLOCAR DISPOSITIVO · 1 PA', 'Un marcador de objetivo que controla el operativo activo gana uno de tus tokens de Dispositivo. No se puede hacer durante el primer punto de inflexión, dentro del alcance de control de un operativo enemigo ni sobre un marcador que ya tenga un token de Dispositivo tuyo.'], vp: 'Al final de cada punto de inflexión tras el primero, 1 PV si el marcador de objetivo de tu oponente tiene uno de tus tokens de Dispositivo. Además, 1 PV por cada otro marcador de objetivo disputado que tenga uno de tus tokens de Dispositivo. Máximo 2 PV de esta op por punto de inflexión.' },
  intel: { rev: 'La primera vez que un operativo enemigo es incapacitado.', rules: 'Cuando un operativo enemigo es incapacitado, antes de retirarlo coloca uno de tus marcadores de misión de Información dentro de su alcance de control. Los operativos amigos pueden hacer Recoger marcador sobre tus marcadores de Información, ignorando el primero que ya lleven: cada uno puede llevar hasta dos de Información, o uno de Información y otro marcador.', vp: 'Al final de cada punto de inflexión tras el primero, si tus operativos llevan alguno de tus marcadores de Información, 1 PV. Al final de la batalla, 1 PV por cada marcador de Información tuyo que lleven tus operativos.' },
  track: { rev: 'La primera vez que anotes PV de esta op.', rules: 'Un operativo enemigo está rastreado si es un blanco válido para un operativo amigo situado a 6" o menos de él. Ese operativo amigo debe tener orden de Ocultarse, no puede ser un blanco válido para el enemigo al que rastrea y no puede estar dentro del alcance de control de operativos enemigos.', vp: 'Al final de cada punto de inflexión tras el primero: si hay un operativo enemigo rastreado, 1 PV (2 PV en el cuarto punto de inflexión); si hay dos o más, 2 PV. Máximo 2 PV de esta op por punto de inflexión.' },
  rout: { rev: 'La primera vez que anotes PV de esta op.', vp: 'Cuando un operativo amigo incapacita a un operativo enemigo estando a 6" o menos de la zona de descenso de tu oponente, 1 PV, o 2 PV si ese enemigo tenía una característica de Heridas de 12 o más. Máximo 2 PV de esta op por punto de inflexión.' },
  scout: { rev: 'La primera vez que un operativo amigo realiza la acción Explorar.', act: ['EXPLORAR · 1 PA', 'Elige un operativo enemigo listo, visible para el operativo activo y a más de 6" de él: queda vigilado hasta el paso Preparar de la siguiente fase de Estrategia. No se puede hacer con orden de Enfrentar, durante el primer punto de inflexión ni dentro del alcance de control de un enemigo.'], vp: 'Al final de cada punto de inflexión tras el primero, 1 PV por cada operativo enemigo vigilado que sea visible para operativos amigos (no tiene que ser el que hizo la acción). Máximo 2 PV de esta op por punto de inflexión.' },
  implant: { rev: 'Cuando vayas a infligir daño con un éxito de un golpe (combate) o de un disparo a un enemigo a 6" o menos.', rules: 'No se puede en el primer punto de inflexión. En lugar de infligir el daño de un éxito, puedes implantar a ese operativo enemigo: no pierde heridas por ese éxito. No se puede si el dado inflige 0 de daño. Cada operativo enemigo solo puede ser implantado una vez. (Carta del pack Approved Ops 2024, reconstruida desde descripciones secundarias.)', vp: '1 PV al implantar. Al final de cada punto de inflexión tras el primero, 1 PV si hay un operativo implantado por ti aún en la zona de matanza (también bajo tierra).' },
  surveil: { rev: 'Cuando un operativo amigo elija un blanco válido para Disparar estando totalmente en territorio enemigo.', rules: 'No se puede en el primer punto de inflexión. Reúnes vigilancia al elegir el blanco; una vez por punto de inflexión. (Carta del pack Approved Ops 2024, reconstruida desde descripciones secundarias.)', vp: '1 PV al reunir vigilancia. Al final del punto de inflexión, 1 PV si un operativo que la reunió sigue vivo con orden de Ocultarse.' },
  banner: { rev: 'Cuando realices la acción Plantar estandarte.', act: ['PLANTAR ESTANDARTE · 1 PA', 'Coloca tu marcador de misión de Estandarte dentro del alcance de control del operativo activo, completamente en territorio de tu oponente y a más de 5" de un borde neutral de la zona de matanza. Los operativos pueden hacer Recoger marcador sobre él. No se puede hacer durante el primer punto de inflexión, dentro del alcance de control de un enemigo ni si un operativo amigo ya la ha realizado en la batalla.'], vp: 'Al final de cada punto de inflexión tras el primero, si el marcador está completamente en territorio de tu oponente y tus operativos lo controlan, 1 PV; si ningún operativo enemigo lo disputa, 2 PV en su lugar. El marcador debe estar en la zona de matanza (no llevado).' } };
const TACIMG = new Set(['devices', 'intel', 'track', 'flank', 'retrieval', 'scout', 'dominate', 'rout', 'sweep', 'envoy', 'martyrs', 'banner']); /* cartas originales (Approved Ops Card Pack 2025) en ao/ */
function tacCardHTML(k, nb) { const c = TACCARD[k] || {}, T = E.TAC[k]; const sec = (h, t) => t ? `<div class="tc-s"><b>${h}</b><p>${H(t)}</p></div>` : '';
  const im = TACIMG.has(k) ? `<img class="tc-img" src="ao/tac_${k}.webp" alt="Carta ${H(T[1])}" loading="lazy">` : '';
  if (im) return `<div class="tcard tcimg">${im}<details><summary>Ver texto en español</summary>${sec('REVELAR', c.rev)}${sec('REGLAS ADICIONALES', c.rules)}${c.act ? `<div class="tc-s"><b>ACCIÓN DE MISIÓN · ${H(c.act[0])}</b><p>${H(c.act[1])}</p></div>` : ''}${sec('PUNTOS DE VICTORIA', c.vp)}</details>${nb ? '' : `<button class="btn" data-tac="${k}">Elegir esta operación</button>`}</div>`;
  return `<div class="tcard"><div class="tc-h"><span>${H(T[0])} · OP TÁCTICA</span></div><div class="tc-t">${H(T[1])}</div>${sec('REVELAR', c.rev)}${sec('REGLAS ADICIONALES', c.rules)}${c.act ? `<div class="tc-s"><b>ACCIÓN DE MISIÓN · ${H(c.act[0])}</b><p>${H(c.act[1])}</p></div>` : ''}${sec('PUNTOS DE VICTORIA', c.vp)}${c.sum ? '<p class="tc-n"></p>' : ''}${nb ? '' : `<button class="btn" data-tac="${k}">Elegir esta operación</button>`}</div>`; }
/* Volkus Compound: elegir bando. Devuelve true si el jugador (o el Jugador 1 en el mismo dispositivo) defiende. */
function vcRoleChoose(human, other) { return new Promise(res => { const RU = [['sa', 'Ataque', 'Ataque sorpresa', 'El Ataque tira dos dados de iniciativa y elige; lo pierde la primera vez que no tenga la iniciativa.'], ['night', 'Ataque', 'Asalto nocturno', 'Al disparar, el blanco está oscurecido salvo a 6" o menos o dentro de la zona de la Defensa.'], ['breach', 'Ataque', 'Cargas de demolición', 'Arma de combate solo contra empalizadas: 3 ataques, 2+, daño 5/8.'], ['bomb', 'Ataque', 'Bombardeo preliminar', 'En el primer punto de inflexión los agentes de la Defensa no mueven más de 3" y el Ataque no se mueve por la zona de la Defensa salvo con la peana bajo terreno Vantage.'], ['wire', 'Defensa', 'Alambre de espino', 'Quien trepa una empalizada o un búnker, o entra/sale de una fortaleza, sufre D3 de daño (sin efecto si sigue totalmente dentro de la zona de la Defensa).'], ['traps', 'Defensa', 'Trampas explosivas', 'La primera vez que alguien cruza cada puerta o brecha: D6; con 4+ sufre ese daño.'], ['cs', 'Defensa', 'Puesto de mando', 'La Defensa empieza con 1 PC adicional.'], ['stock', 'Defensa', 'Provisiones', 'La Defensa puede elegir una opción de equipo adicional (la eliges abajo).']];
  $('#modalBox').innerHTML = `<h2>Volkus Compound</h2><p class="hint">Un comando asalta el recinto y el otro lo defiende. El Ataque despliega en sus zonas de descenso y decide la iniciativa del primer punto de inflexión; la Defensa despliega dentro del recinto. Tras cuatro puntos de inflexión gana quien controle el marcador central; si nadie, el mayor grado de bajas. Si un comando queda incapacitado por completo, gana el rival.</p><details><summary>Ardides opcionales</summary>${RU.map(r => `<label class="field"><span><input type="checkbox" data-ruse="${r[0]}"> <b>${r[2]}</b> <small>(${r[1]})</small><br><small>${r[3]}</small></span></label>`).join('')}</details><label class="field"><span><b>Provisiones</b> (solo si lo marcas arriba): equipo adicional de la Defensa <select id="vcStk"><option value="">—</option>${Object.entries(E.EQUIP).filter(([k]) => !((human.eq || []).includes(k) || (other.eq || []).includes(k))).map(([k, n]) => `<option value="${k}">${H(n)}</option>`).join('')}</select></span></label><label class="field"><span><b>Escalones de fuego</b> (la Defensa puede colocar hasta seis; terreno Vantage, Insignificante y Expuesto; se colocan pegados a empalizadas y búnkeres) <select id="vcFs">${[6,5,4,3,2,1,0].map(n => `<option value="${n}">${n}</option>`).join('')}</select></span></label>${M.mode === 'ai' ? '<label class="field"><span><input type="checkbox" id="vcNpo"> <b>Solitario / cooperativo</b>: el rival son agentes no jugadores (hasta 90 Heridas en total) en vez del comando elegido</span></label>' : ''}<div class="acts"><button class="btn" id="vcOff">${M.mode === 'hot' ? 'El Jugador 1 ataca' : 'Atacar el recinto'}</button><button class="btn" id="vcDef">${M.mode === 'hot' ? 'El Jugador 1 defiende' : 'Defender el recinto'}</button></div>`; $('#modal').hidden = false;
  const go = def => { const R = {}; $$('#modalBox input[data-ruse]').forEach(c => { if (c.checked) R[c.dataset.ruse] = true; }); R.fs = $('#vcFs') ? +$('#vcFs').value : 6; const npo = !!($('#vcNpo') && $('#vcNpo').checked); const sel = $('#vcStk') ? $('#vcStk').value : ''; closeModal(); /* Provisiones: la Defensa añade una opción de equipo más */ if (R.stock && sel) { const D = def ? human : (npo ? null : other); if (D) D.eq = [...(D.eq || []), ...((D.eq || []).includes(sel) ? [] : [sel])]; } res({ def, ruse: R, npo }); }; $('#vcOff').onclick = () => go(false); $('#vcDef').onclick = () => go(true); }); }
/* Operaciones Aprobadas · paso 2: cada jugador elige en secreto una operación táctica de uno de los arquetipos de su comando */
function tacChoose(setup, p) {
  return new Promise(res => { const T = setup.teams[p]; if (T.tac) return res(); const t = teamById(T.id); const kws = T.ops.map(id => (t.ops.find(o => o.id === baseId(id)) || {}).kw || []).flat(); const L = E.tacOptions(T.id, kws); if (!L.length) return res();
    const arch = [...new Set(L.map(k => E.TAC[k][0]))]; let ai = 0;
    const draw = () => { const ks = L.filter(k => E.TAC[k][0] === arch[ai]);
      $('#modalBox').innerHTML = `<div class="tacsel"><h2>Operación táctica${M.mode === 'hot' ? ' · Jugador ' + (p + 1) : ''}</h2><p class="hint">Paso 2 · Elegir agentes: elige en secreto una operación táctica. Elige arquetipo y desliza las cartas a izquierda o derecha.</p>
        <div class="deckchips">${arch.map((a, i) => `<button class="chip ${i === ai ? 'on' : ''}" data-a="${i}">${H(a)} (${L.filter(q => E.TAC[q][0] === a).length})</button>`).join('')}</div>
        <div class="tacctr" id="tcCtr">1/${ks.length}</div>
        ${stripShell(ks.map(k => tacCardHTML(k, true) + `<button class="btn" data-tac="${k}">Elegir esta operación</button>`), 'tacstrip')}</div>`;
      $$('#modalBox [data-a]').forEach(b => b.onclick = () => { ai = +b.dataset.a; draw(); });
      $$('#modalBox button[data-tac]').forEach(b => b.onclick = () => { T.tac = b.dataset.tac; closeModal(); res(); });
      stripWire($('#modalBox'), ks.length, '#tcCtr'); };
    draw(); $('#modal').hidden = false; });
}
async function prepStep(setup) { // mismo dispositivo y vs IA; devuelve si hay que intercambiar los asientos
  const late = !!setup.aop; if (late) setup.explLate = true; // Operaciones Aprobadas: el paso Explorar se juega DESPUÉS de desplegar los agentes y decide la iniciativa (lo resuelve el motor)
  const R = prepRoll(), depInit = R.w, seats = M.mode === 'hot' ? [0, 1] : [+M.side];
  const z = await exploreChoose(setup, seats, depInit, false, true);
  if (late) for (const p of seats) await tacChoose(setup, p);
  const R1 = late ? { w: depInit, log: [], tie: false } : (() => { let r = [d6r(), d6r()]; const log = [r.slice()]; const tie = r[0] === r[1]; return { w: tie ? 1 - depInit : (r[0] > r[1] ? 0 : 1), log, tie }; })();
  const dec = R1.w; let init = dec;
  const local = !late && (M.mode === 'hot' || dec === +M.side);
  if (local) init = await new Promise(res => { const nm = p => M.mode === 'hot' ? `Jugador ${p + 1}` : (p === +M.side ? 'tú' : 'el rival'); $('#modalBox').innerHTML = `<h2>Iniciativa del primer punto de inflexión</h2><p>Desempate ${R1.log.map(r => r.join('–')).join(', ')}${R1.tie ? ' (empate: decide quien no tuvo la iniciativa en el despliegue)' : ''}. Decide ${nm(dec)}: ¿quién tiene la iniciativa?</p><div class="acts"><button class="btn" data-i="${dec}">${M.mode === 'hot' ? 'Jugador ' + (dec + 1) : 'Yo'}</button><button class="btn" data-i="${1 - dec}">${M.mode === 'hot' ? 'Jugador ' + (2 - dec) : 'El rival'}</button></div>`; $('#modal').hidden = false; $$('#modalBox button[data-i]').forEach(b => b.onclick = () => { closeModal(); res(+b.dataset.i); }); });
  setup.init = late ? undefined : init; setup.depInit = depInit; const sw = z.z !== depInit;
  const info = { rolls: R.log, rolls1: R1.log, tie: R1.tie, depInit, dec, init, sw, late };
  if (sw) { setup.teams.reverse(); setup.init = 1 - setup.init; setup.depInit = z.z; info.depInit = z.z; info.dec = 1 - info.dec; info.init = setup.init; info.sw = true; }
  info.me = M.mode === 'ai' ? (sw ? 1 - +M.side : +M.side) : 0; { const nm = q => M.mode === 'hot' ? `Jugador ${q + 1}` : (q === info.me ? 'Tú' : 'El rival'); toast(`Pasos 1 y 2 hechos · ${nm(info.depInit)} ${info.depInit === info.me && M.mode !== 'hot' ? 'tienes' : 'tiene'} la iniciativa de despliegue (tirada ${info.rolls.map(r => r.join('–')).join(', ')}) · empieza el paso 3: Desplegar`, 5200); } return sw;
}
/* Operaciones Aprobadas · pasos 1 y 4: zona de descenso (quien tiene la iniciativa en el despliegue) y «Explorar» (Equipar / Ardid / Reposicionar) */
const EXP_NM = { eq: 'Equipar', ard: 'Ardid', rep: 'Reposicionar' }, EXP_BEATS = { eq: 'ard', ard: 'rep', rep: 'eq' };
function exploreFree(setup, p) { const L = setup.teams[p].eq || [], hasG = L.some(x => x.startsWith('gren_')); const out = []; for (const f of (E.FEQ[setup.teams[p].id] || [])) if (!L.includes('f_' + f.id)) out.push({ k: 'f_' + f.id, n: f.n, t: f.t }); for (const [k, n] of Object.entries(E.EQUIP)) if (!L.includes(k) && !(hasG && k.startsWith('gren_'))) out.push({ k, n, t: E.EQUIP_TXT[k] }); return out; }
function exploreZoneDesc(setup) { let desc = ['Zona de la izquierda / superior', 'Zona de la derecha / inferior']; try { const pr = E.newGame({ ...setup, aop: false, init: undefined, depInit: undefined, teams: setup.teams.map(t => ({ ...t, eq: [] })) }, DB); const cen = p => { if (pr.zones) { const Z = pr.zones[p][0]; return { x: Z[0] + Z[2] / 2, y: Z[1] + Z[3] / 2 }; } return pr.dep.ax === 'x' ? { x: p ? E.BW : 0, y: E.BH / 2 } : { x: E.BW / 2, y: p ? E.BH : 0 }; }; const d = p => { const c = cen(p); const dx = c.x - E.BW / 2, dy = c.y - E.BH / 2; return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'izquierda' : 'derecha') : (dy < 0 ? 'superior' : 'inferior'); }; desc = [0, 1].map(p => 'Zona de descenso ' + d(p)); exploreZoneDesc.pr = pr; } catch (e) { exploreZoneDesc.pr = null; } return desc; }
/* mapa de la batalla ya montado dentro del popup de zona de descenso: terreno, objetivos y las dos zonas pulsables */
function zoneRects(pr, p) { if (pr.zones) return pr.zones[p]; const dd = Math.max(2, (pr.dep && pr.dep.d) || 3); if (pr.dep && pr.dep.ax === 'y') return [p ? [0, E.BH - dd, E.BW, dd] : [0, 0, E.BW, dd]]; return [p ? [E.BW - 6, 0, 6, E.BH] : [0, 0, 6, E.BH]]; }
function zoneMapDraw(cv, pr, hi) {
  const w = Math.min(cv.parentElement.clientWidth || 360, 720), SCm = w / E.BW, h = Math.round(E.BH * SCm), D = window.devicePixelRatio || 1; cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * D); cv.height = Math.round(h * D);
  const c = cv.getContext('2d'); c.setTransform(D, 0, 0, D, 0, 0); const X = x => x * SCm, Y = y => y * SCm;
  c.fillStyle = '#161d27'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1; c.beginPath(); for (let i = 0; i <= E.BW; i += 2) { c.moveTo(X(i), 0); c.lineTo(X(i), h); } for (let j = 0; j <= E.BH; j += 2) { c.moveTo(0, Y(j)); c.lineTo(w, Y(j)); } c.stroke();
  const ZC = ['#ff7a2a', '#35b6ff']; for (let p = 0; p < 2; p++) for (const Z of zoneRects(pr, p)) { c.globalAlpha = hi === p ? .5 : .28; c.fillStyle = ZC[p]; c.fillRect(X(Z[0]), Y(Z[1]), Z[2] * SCm, Z[3] * SCm); c.globalAlpha = 1; c.strokeStyle = ZC[p]; c.lineWidth = hi === p ? 3 : 1.5; c.strokeRect(X(Z[0]), Y(Z[1]), Z[2] * SCm, Z[3] * SCm); }
  for (const r of pr.terrain || []) { if (r.ty != null) continue; if (r.t === 'wall') { c.fillStyle = '#3a4656'; c.fillRect(X(r.x), Y(r.y), r.w * SCm, r.h * SCm); c.strokeStyle = '#7d8da3'; c.lineWidth = 1; c.strokeRect(X(r.x), Y(r.y), r.w * SCm, r.h * SCm); } else if (r.t === 'razor') { c.strokeStyle = '#d6574f'; c.setLineDash([2, 3]); c.strokeRect(X(r.x), Y(r.y), r.w * SCm, r.h * SCm); c.setLineDash([]); } else { c.fillStyle = 'rgba(112,128,64,.55)'; c.fillRect(X(r.x), Y(r.y), r.w * SCm, r.h * SCm); } }
  (pr.objs || []).forEach((o, i) => { if (o.x == null || o.x < -50) return; c.fillStyle = '#ffd24a'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.arc(X(o.x), Y(o.y), Math.max(5, SCm * .6), 0, 7); c.fill(); c.stroke(); });
  c.strokeStyle = '#3a475c'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); c.font = '800 ' + Math.max(11, Math.round(SCm * 1.1)) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3;
  for (let p = 0; p < 2; p++) { const Z = zoneRects(pr, p)[0]; if (!Z) continue; const tx = X(Z[0] + Z[2] / 2), ty = Y(Z[1] + Z[3] / 2), L = p ? 'B' : 'A'; c.strokeText(L, tx, ty); c.fillText(L, tx, ty); }
}
/* elige (modales) lo que corresponde a los asientos locales; los rivales de IA eligen solos; lo de un rival remoto queda null */
function exploreChoose(setup, seats, depInit, net, noExp) {
  return new Promise(res => {
    const isAI = p => !net && M.mode === 'ai' && p !== +M.side, local = p => seats.includes(p) || isAI(p);
    const out = { z: null, pick: [null, null], extra: [null, null] };
    const box = h => { $('#modalBox').innerHTML = h; $('#modal').hidden = false; };
    const lab = p => M.mode === 'hot' ? ` · Jugador ${p + 1}` : '';
    const tri = '<p class="hint">En la iniciativa: Equipar gana a Ardid, Ardid gana a Reposicionar y Reposicionar gana a Equipar. Si empatan, decide el jugador que no tuvo la iniciativa en el despliegue.</p>';
    const ask = p => {
      if (p >= 2 || !setup.aop || noExp) { closeModal(); return res(out); } // sin Operaciones Aprobadas no hay paso Explorar: solo zona de descenso
      if (!local(p)) return ask(p + 1);
      if (isAI(p)) { const f = exploreFree(setup, p), o = ['ard', 'rep'].concat(f.length ? ['eq'] : []); out.pick[p] = o[Math.floor(Math.random() * o.length)]; if (out.pick[p] === 'eq') out.extra[p] = f[Math.floor(Math.random() * f.length)].k; return ask(p + 1); }
      box(`<h2>Explorar${lab(p)}</h2><p>Elige en secreto una opción de exploración previa a la partida:</p>
        <p><button class="btn" data-x="eq" ${exploreFree(setup, p).length ? '' : 'disabled'}>Equipar</button> Elige una opción de equipo adicional que no hayas elegido.</p>
        <p><button class="btn" data-x="ard">Ardid</button> En la primera fase de estrategia puedes usar un ardid estratégico por 0 PM.</p>
        <p><button class="btn" data-x="rep">Reposicionar</button> Acción libre de Reposicionarse con un agente completamente dentro de tu zona de descenso; debe acabar a 3" o menos de ella.</p>${tri}`);
      $$('#modalBox button[data-x]').forEach(b => b.onclick = () => {
        const k = b.dataset.x; if (k !== 'eq') { out.pick[p] = k; return ask(p + 1); }
        box(`<h2>Equipar${lab(p)}</h2><p>Opción de equipo adicional:</p>` + exploreFree(setup, p).map(f => `<label title="${H(f.t || '')}" style="display:block"><input type="radio" name="xeq" value="${f.k}"> ${H(f.n)}</label>`).join('') + `<p><button class="btn" id="eqOk">Confirmar</button> <button class="btn ghost" id="eqBack">Volver</button></p>`);
        $('#eqBack').onclick = () => ask(p); $('#eqOk').onclick = () => { const r = $('#modalBox input[name=xeq]:checked'); if (!r) { toast('Elige una opción de equipo'); return; } out.pick[p] = 'eq'; out.extra[p] = r.value; ask(p + 1); };
      });
    };
    if (local(depInit)) {
      if (isAI(depInit)) { out.z = Math.random() < 0.5 ? 0 : 1; return ask(0); }
      const desc = exploreZoneDesc(setup);
      const pr = exploreZoneDesc.pr; box(`<h2>Zona de descenso${lab(depInit)}</h2><p>Tienes la iniciativa en el despliegue: elige tu zona de descenso mirando el campo de batalla ya montado. Tu rival tendrá la otra.</p>${pr ? '<div class="zmwrap"><canvas id="zmCv" class="zmcv"></canvas></div><p class="hint">Amarillo: objetivos · verde: terreno ligero · gris: muros. Toca una zona del mapa o un botón.</p>' : ''}<p class="zmbtn"><button class="btn" data-z="0" style="border-color:#ff7a2a">A · ${H(desc[0])}</button> <button class="btn" data-z="1" style="border-color:#35b6ff">B · ${H(desc[1])}</button></p>`);
      const cvz = $('#zmCv'); if (pr && cvz) { let hi = null; const drw = () => zoneMapDraw(cvz, pr, hi); drw();
        const zAt = e => { const r = cvz.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * E.BW, y = (e.clientY - r.top) / r.height * E.BH; for (let q = 0; q < 2; q++) for (const Z of zoneRects(pr, q)) if (x >= Z[0] && x <= Z[0] + Z[2] && y >= Z[1] && y <= Z[1] + Z[3]) return q; return null; };
        cvz.onpointermove = e => { const q = zAt(e); if (q !== hi) { hi = q; drw(); } }; cvz.onclick = e => { const q = zAt(e); if (q != null) { out.z = q; ask(0); } }; }
      $$('#modalBox button[data-z]').forEach(b => b.onclick = () => { out.z = +b.dataset.z; ask(0); });
    } else ask(0);
  });
}
/* aplica las elecciones a la configuración: opciones de equipo, ardid, reposicionar, iniciativa del 1.er PI e intercambio de jugadores según la zona */
function exploreResolve(setup, depInit, r) {
  const a = r.pick[0], b = r.pick[1], w = a === b ? 1 - depInit : (EXP_BEATS[a] === b ? 0 : 1);
  for (let p = 0; p < 2; p++) { const T = setup.teams[p]; if (r.pick[p] === 'eq' && r.extra[p]) { T.eq = [...(T.eq || []), r.extra[p]]; T.xeq = r.extra[p]; } if (r.pick[p] === 'ard') T.ardid = true; if (r.pick[p] === 'rep') T.exprep = true; }
  const info = { a, b, w, tie: a === b, depInit, extra: r.extra.slice(), ids: setup.teams.map(t => t.id), sw: r.z !== depInit };
  setup.init = w; setup.depInit = depInit;
  if (info.sw) { setup.teams.reverse(); setup.init = 1 - setup.init; setup.depInit = r.z; }
  return info;
}
/* modal de revelación; me = asiento propio (antes del intercambio) o null (mismo dispositivo); extraHtml: código para el anfitrión */
function exploreReveal(info, me, extraHtml) {
  return new Promise(res => {
    const nm = p => me == null ? `Jugador ${p + 1}` : (p === me ? 'Tú' : 'Rival');
    const xn = (p) => { const k = info.extra[p]; return info[p ? 'b' : 'a'] === 'eq' && k ? ' (' + H(E.EQUIP[k] || ((E.FEQ[info.ids[p]] || []).find(f => 'f_' + f.id === k) || {}).n || k) + ')' : ''; };
    $('#modalBox').innerHTML = `<h2>Explorar: revelación</h2><p>${nm(0)}: <b>${EXP_NM[info.a]}</b>${xn(0)}<br>${nm(1)}: <b>${EXP_NM[info.b]}</b>${xn(1)}</p><p>${info.tie ? 'Empate: decide quien no tuvo la iniciativa en el despliegue (' + nm(1 - info.depInit) + '). ' : ''}<b>Iniciativa: ${nm(info.w)}</b>.</p>${extraHtml || ''}<button class="btn" id="expGo">Continuar</button>`;
    $('#modal').hidden = false; $('#expGo').onclick = () => { closeModal(); res(); };
  });
}
async function exploreStep(setup) { // mismo dispositivo y vs IA
  const depInit = Math.random() < 0.5 ? 0 : 1, seats = M.mode === 'hot' ? [0, 1] : [+M.side];
  const r = await exploreChoose(setup, seats, depInit), info = exploreResolve(setup, depInit, r);
  await exploreReveal(info, M.mode === 'hot' ? null : +M.side); return info.sw;
}
/* En línea: el anfitrión elige y envía un código de invitación; el invitado elige, ve el resultado y devuelve su elección en otro código */
async function exploreNetHost(setup) { // respaldo por códigos: mismo orden que la conexión en vivo (zona de descenso y operación táctica; Explorar se juega en la partida tras desplegar)
  const depInit = Math.random() < 0.5 ? 0 : 1, mine = await netPrep(setup, depInit, 0);
  const A = await pack({ pre: 1, setup, depInit, z: mine.z, tac: mine.tac });
  $('#modalBox').innerHTML = `<h2>Partida en línea · Preparación</h2><p class="hint">1. Envía este código de invitación al rival.<br>2. Cuando él haya elegido, te devolverá un código: pégalo abajo y comenzáis.</p><textarea id="netA" readonly style="width:100%;height:80px">${A}</textarea><div class="row"><button class="btn ghost small" id="netACopy">Copiar</button></div><textarea id="netB" placeholder="Pega aquí el código de respuesta del rival" style="width:100%;height:80px"></textarea><div class="acts"><button class="btn" id="netBGo">Empezar</button></div>`;
  $('#netACopy').onclick = async () => { try { await navigator.clipboard.writeText(A); toast('Código copiado'); } catch (e) { $('#netA').select(); } };
  $('#netBGo').onclick = async () => { try {
    const o = await unpack($('#netB').value); if (!o.post) throw 0;
    const z = depInit === 0 ? mine.z : o.z; if (z == null) throw 0;
    if (mine.tac) setup.teams[0].tac = mine.tac; if (o.tac) setup.teams[1].tac = o.tac;
    setup.explLate = true; setup.depInit = depInit; delete setup.init; const sw = z !== depInit; if (sw) { setup.teams.reverse(); setup.depInit = z; }
    const me = sw ? 1 : 0; await netShow(setup, sw, me, depInit, []);
    beginGame(setup, [], { mode: 'net', me, level: M.level });
  } catch (e) { toast('Código de respuesta no válido'); } };
}
async function exploreNetJoin(o) {
  const setup = o.setup, depInit = o.depInit, mine = await netPrep(setup, depInit, 1);
  const B = await pack({ post: 1, z: mine.z, tac: mine.tac });
  if (o.tac) setup.teams[0].tac = o.tac; if (mine.tac) setup.teams[1].tac = mine.tac;
  const z = depInit === 0 ? o.z : mine.z; setup.explLate = true; setup.depInit = depInit; delete setup.init; const sw = z !== depInit; if (sw) { setup.teams.reverse(); setup.depInit = z; }
  const me = sw ? 0 : 1; await netShow(setup, sw, me, depInit, []);
  $('#modalBox').innerHTML = `<h2>Partida en línea</h2><p class="hint">Envía este código al anfitrión para que empiece la partida:</p><textarea id="netB2" readonly style="width:100%;height:80px">${B}</textarea><div class="row"><button class="btn ghost small" id="netB2Copy">Copiar</button><button class="btn" id="netB2Go">Empezar</button></div>`; $('#modal').hidden = false;
  $('#netB2Copy').onclick = async () => { try { await navigator.clipboard.writeText(B); toast('Código copiado'); } catch (e) { $('#netB2').select(); } };
  $('#netB2Go').onclick = () => { closeModal(); beginGame(setup, [], { mode: 'net', me, level: M.level }); };
}


/* ============================ WEBGL (miniaturas reales) ============================ */
const mkGLCanvas = () => { const c = document.createElement('canvas'); c.id = 'glcv'; c.hidden = true; c.addEventListener('webglcontextlost', e => { e.preventDefault(); GLR.ok = false; GLR.lost = true; }); c.addEventListener('webglcontextrestored', () => glRebuild()); return c; };
let GLR = createGL(E, mkGLCanvas());
/* Pérdida de contexto WebGL (al minimizar / cambiar de ventana el navegador puede descartar la GPU): se reconstruye el renderizador sin recargar la partida */
function glRebuild() {
  const old = GLR.gl && GLR.gl.canvas, n = createGL(E, mkGLCanvas()); if (!n.ok) { setTimeout(glRebuild, 1500); return; }
  GLR = n; if (old && old.parentElement) old.remove(); GLR.loadMeshes('meshes.json').then(k => { if (k) for (const op of (G.s ? G.s.ops : [])) { GLR.ensure(meshKeyOf(op)); if (op.cct) for (const m of ['mutant', 'torment']) GLR.ensure('op:chaos_cult_' + m); } }); try { resize(); } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) return; try { if (GLR.gl && (GLR.lost || GLR.gl.isContextLost())) glRebuild(); else if (G && G.s) { resize(); } } catch (e) { } });
function glBadge() { let b = $('#glload'); if (!b) { const w = $('#boardwrap'); if (!w) return; b = document.createElement('div'); b.id = 'glload'; b.hidden = true; w.appendChild(b); } const n = KNET.pending; b.hidden = !(n > 0 && G && G.view3d && G.s); if (n > 0) b.textContent = 'Cargando gráficos… (' + n + ')'; }
setInterval(() => { try { glBadge(); } catch (e) { } }, 700);
const GROUND = document.createElement('canvas');
let MESHSEL = {}; try { MESHSEL = JSON.parse(localStorage.getItem('kt_mesh') || '{}'); } catch (e) { }
const hashS = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
function opKeys() { // modelos de operativo + miniaturas del mod sin asignar a ningún operativo (se pueden elegir a mano con ◀ ▶)
  if (!GLR.keys) return []; if (GLR._opk) return GLR._opk; const ix = GLR.index, seen = new Set(), L = GLR.keys.filter(k => k.startsWith('op:'));
  for (const k of L) seen.add(ix[k].n + '|' + ix[k].t);
  const orph = GLR.keys.filter(k => /^[0-9A-Za-z]{6}$/.test(k) && ix[k] && ix[k].n > 2000 && !seen.has(ix[k].n + '|' + ix[k].t));
  return (GLR._opk = L.concat(orph)); }
function meshKeyOf(op) { // modelo propio del operativo (mods de equipo de TTS); si no hay, uno de su equipo; si no, otro modelo de Kill Team
  if (!GLR.keys) return null; const id = op.id + '|' + op.p; let k = null;
  if (GLR.index['op:' + op.id]) return 'op:' + op.id;
  return null; /* sin modelo propio: ficha original (peana de color + silueta por tipo + nombre), no la figura de otro operativo */
}
function cycleMesh(op, d) { if (!GLR.keys) return; const id = op.id + '|' + op.p; const L = opKeys().length ? opKeys() : GLR.keys; const n = L.length; const i = (L.indexOf(meshKeyOf(op)) + d + n) % n; MESHSEL[id] = L[i]; try { localStorage.setItem('kt_mesh', JSON.stringify(MESHSEL)); } catch (e) { } GLR.ensure(L[i]); }
function glOpts(dpr) { return GLR.ok ? { gl: GLR, ground: GROUND, meshOf: meshKeyOf, dpr, gsc: HQ3D ? 44 : 32 } : {}; }
function placeGL(box, on) { if (!GLR.ok) return false; const c = GLR.gl.canvas; if (on) { if (c.parentElement !== box) box.insertBefore(c, box.firstChild); c.hidden = false; } else c.hidden = true; return on; }
if (GLR.ok) GLR.loadMeshes('meshes.json').then(n => { if (n) { for (const op of (G.s ? G.s.ops : [])) { GLR.ensure(meshKeyOf(op)); if (op.cct) for (const m of ['mutant', 'torment']) GLR.ensure('op:chaos_cult_' + m); } } });

/* ============================ PARTIDA ============================ */
/* Arsenal contaminado (Polluted Stockpile, Gellerpox): tras revelar el equipo se tiran 2D6; con 7+ el jugador de Gellerpox elige qué equipo pierde su rival; si no, el rival elige cuál de los suyos pierde. La IA elige sola y se avisa con un OK. */
function beginGame(setup, acts, o) {
  const p = (setup.teams || []).findIndex((t, i) => i < 2 && t && t.id === 'gellerpox_infected' && (t.eq || []).includes('f_polluted'));
  if (p < 0 || setup.poll || (acts && acts.length) || !(o.mode === 'ai' || o.mode === 'hot') || !setup.teams[1 - p] || !(setup.teams[1 - p].eq || []).length) return beginGame0(setup, acts, o);
  const q = 1 - p, r = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6), ch = r >= 7 ? p : q, L = setup.teams[q].eq.slice(), nm = k => eqName(setup.teams[q].id, k);
  const done = rm => { setup.poll = { r, rm }; closeModal(); beginGame0(setup, acts, o); };
  const who = x => o.mode === 'hot' ? `Jugador ${x + 1}` : (x === o.me ? 'Tú' : 'La IA');
  const head = `<h2>Arsenal contaminado</h2><p>Tirada de 2D6: <b>${r}</b>. ${r >= 7 ? `${who(p)} (Gellerpox) elimina una opción de equipo de ${who(q).toLowerCase()}.` : `${who(q)} debe eliminar una de sus propias opciones de equipo.`}</p>`;
  if (o.mode === 'ai' && ch !== o.me) { const dfl = L[r >= 7 ? 0 : L.length - 1]; let rm = dfl; try { const pk = AI.askChoice({ ask: [true, true] }, ch, 'pollute:' + (r >= 7 ? 'foe' : 'own'), L.map(k => ({ v: k, l: nm(k) })), dfl); if (pk !== undefined && L.includes(pk)) rm = pk; } catch (er) { } /* la IA elige por autoaprendizaje (con el valor por defecto como sesgo) */ $('#modalBox').innerHTML = head + `<p class="hint">La IA elige: <b>${H(nm(rm))}</b>.</p><div class="acts"><button class="btn" id="pollOk">OK</button></div>`; $('#modal').hidden = false; $('#pollOk').onclick = () => done(rm); return; }
  $('#modalBox').innerHTML = head + `<div class="acts">` + L.map(k => `<button class="btn" data-poll="${H(k)}">${H(nm(k))}</button>`).join('') + `</div>`; $('#modal').hidden = false;
  $$('#modalBox button[data-poll]').forEach(b => b.onclick = () => done(b.dataset.poll));
}
let TRAINING = false;
AI.setIsAI((s, p) => TRAINING || (G.s === s && G.mode === 'ai' && p !== G.me));
E.setOptHook((s, p, id, pol) => AI.optPloy(s, p, id, pol));
E.setTacHook((p, opts) => AI.pickTac(p, opts));
E.setAskHook((s, p, key, opts, def) => AI.askChoice(s, p, key, opts, def));
function beginGame0(setup, acts, o) {
  G.setup = setup; G.mode = o.mode; G.me = o.me; G.level = o.level || 'medium';
  G.postN = []; G.postOpen = false; if ($('#autoNote')) $('#autoNote').hidden = true;
  G.s = E.newGame(setup, DB); G.s.rec = true; G.s.ask = Array.from({ length: G.s.np || 2 }, (_, q) => o.mode === 'ai' ? q === +G.me : true); G.s.noNotes = o.mode === 'net'; /* en línea no hay avisos: las preguntas las responde quien juega la acción */ /* decisiones a mitad de resolución: pregunta a los jugadores humanos */ G.acts = []; G.log = []; G.lastBy = Array.from({ length: G.s.np || 2 }, () => []); G.evIdx = 0; G.hist = Array.from({ length: G.s.np || 2 }, () => []); G.learned = false; G.busy = false;
  G.names = G.s.ops.map(op => { const same = G.s.ops.filter(x => x.p === op.p && x.role === op.role); return op.role + (same.length > 1 ? ' ' + String.fromCharCode(65 + same.indexOf(op)) : ''); });
  G.segs = []; for (const a of acts) { segMark(G.s.pend && G.s.pend.p != null ? G.s.pend.p : G.s.active, G.acts.length); E.apply(G.s, a); G.acts.push(a); }
  G.ui = { sel: null, mode: null, R: null, cells: null, pending: null, hover: null, targets: null };
  rebuildLog(); G.evIdx = G.s.ev.length;
  $('#menu').classList.remove('active'); $('#band').classList.remove('active'); $('#game').classList.add('active');
  $('#tabNet').hidden = G.mode !== 'net';
  const tn = p => teamById(setup.teams[p].id).name;
  $('#name0').dataset.full = tn(0) + (G.mode === 'ai' && G.me !== 0 ? ' · IA' : ''); $('#name1').dataset.full = tn(1) + (G.mode === 'ai' && G.me !== 1 ? ' · IA' : ''); refreshNames(); Z2 = 1; PCX = null; { const bl = $('#btnLegend'); if (bl) { bl.hidden = !G.s.vkp; G.legendOn = false; bl.setAttribute('aria-pressed', 'false'); bl.textContent = 'Leyenda de alturas: no'; } }
  G.undoFloor = o.floor != null ? o.floor : (acts ? acts.length : 0); setTab('act'); resize(); refreshAll(); save(); if (G.mode === 'net') updateNet(); undoBtn();
  tick();
}
/* Guardar / cargar partida: lista de ranuras en localStorage (reproducen la partida desde setup+acciones, como «Continuar») + código copiable/pegable */
const SLOTS = 'kt_slots_v1';
const slotsGet = () => { try { const a = JSON.parse(localStorage.getItem(SLOTS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const slotsSet = a => { try { localStorage.setItem(SLOTS, JSON.stringify(a)); return true; } catch (e) { return false; } };
function slotDesc() { const s = G.s, su = G.setup || {}; const mi = s.layout != null ? s.layout : su.map; const mn = (E.MAPNAMES && E.MAPNAMES[mi]) || ('Mapa ' + mi); const d = new Date(); const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); return `${mn} · TP ${s.tp}/4 · ${G.mode === 'ai' ? 'vs IA' : 'local'} · ${d.getDate()}/${d.getMonth() + 1} ${hh}`; }
const dlSave = async (filename, text) => { try { const d = window.claude && await window.claude.use('downloads'); if (!d) return 'na'; await d.save({ filename, data: text }); return 'ok'; } catch (e) { return e && e.code === 'declined' ? 'no' : 'err'; } };
function saveSlot() { // guardar varias partidas: en el navegador (lista) o como archivo .json
  if (!G.s || G.mode === 'net') { toast('En partidas en línea no se puede guardar'); return; }
  const v = { setup: G.setup, acts: G.acts, mode: G.mode, me: G.me, level: G.level }, d0 = slotDesc();
  $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>Guardar partida</h2><label class="field"><span>Nombre</span><input id="svName" type="text" value="${H(d0)}" style="width:100%"></label><div class="acts"><button class="btn" id="svLoc">Guardar en este dispositivo (lista)</button><button class="btn" id="svFile">Guardar como archivo (.json)</button></div><p class="hint">Puedes guardar tantas partidas como quieras. El archivo se carga luego con «Cargar partida → Desde archivo».</p>`; $('#modal').hidden = false; $('#mx').onclick = closeModal;
  const nm = () => ($('#svName').value || d0).trim() || d0;
  $('#svLoc').onclick = () => { const a = slotsGet(); a.unshift({ ts: Date.now(), d: nm(), v }); a.length = Math.min(a.length, 60); if (!slotsSet(a)) { toast('No se pudo guardar en el dispositivo (almacenamiento lleno o bloqueado): usa «Guardar como archivo».'); return; } closeModal(); toast('Partida guardada ✔ (' + nm() + ')'); };
  $('#svFile').onclick = async () => { const nmx = nm(), fn = 'kt-' + nmx.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '_').replace(/\s+/g, '-').slice(0, 60) + '.json', r = await dlSave(fn, JSON.stringify({ kt: 'save', d: nmx, v })); if (r === 'ok') { closeModal(); toast('Archivo guardado ✔'); } else if (r === 'no') toast('Guardado cancelado'); else toast('Este visor no permite guardar archivos: usa «Guardar en este dispositivo» o «Copiar código».'); };
}
function openLoad(inGame) {
  const back = () => { closeModal(); };
  const draw = () => { const L = slotsGet(); $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>Cargar partida</h2>${inGame ? '<p class="hint">Se abandona la partida actual (guárdala antes si quieres conservarla).</p>' : ''}<h3 style="margin:6px 0 4px">Desde archivo</h3><div class="acts"><label class="btn" style="cursor:pointer">Elegir archivo .json…<input id="ldFile" type="file" accept=".json,application/json" style="display:none"></label></div><h3 style="margin:10px 0 4px">Guardadas en este dispositivo</h3><div class="acts">${L.length ? L.map((x, i) => `<div class="row" style="gap:6px"><button class="btn" data-ld="${i}" style="flex:1;text-align:left">${H(x.d)}</button><button class="btn ghost small" data-rm="${i}" aria-label="Borrar">🗑</button></div>`).join('') : '<p class="hint">No hay partidas guardadas.</p>'}</div><h3 style="margin:10px 0 4px">Desde código</h3><textarea id="ldCode" rows="3" placeholder="Pega aquí un código de partida" style="width:100%"></textarea><div class="acts"><button class="btn ghost" id="ldGo">Cargar código</button></div>`;
    $('#mx').onclick = back;
    $$('[data-rm]').forEach(b => b.onclick = () => { const L2 = slotsGet(); L2.splice(+b.dataset.rm, 1); slotsSet(L2); draw(); });
    const go = o => { try { if (!o || !o.setup) throw 0; closeModal(); clearTimeout(tick.t); if (inGame) { G.ui = G.ui || {}; } $('#menu').classList.remove('active'); beginGame(o.setup, o.acts || [], { mode: o.mode || 'ai', me: o.me == null ? 0 : o.me, level: o.level }); toast('Partida cargada'); } catch (e) { toast('No se pudo cargar la partida'); } };
    $$('[data-ld]').forEach(b => b.onclick = () => go(slotsGet()[+b.dataset.ld] && slotsGet()[+b.dataset.ld].v));
    $('#ldFile').onchange = async e => { const f = e.target.files && e.target.files[0]; if (!f) return; try { const o = JSON.parse(await f.text()); go(o.v || o); } catch (er) { toast('El archivo no es una partida válida'); } };
    $('#ldGo').onclick = async () => { try { const o = await unpack($('#ldCode').value); go({ mode: 'hot', me: 0, ...o }); } catch (e) { toast('Código no válido'); } };
  };
  draw(); $('#modal').hidden = false;
}
function save() { try { if (G.s && !G.s.over) localStorage.setItem(SAVE, JSON.stringify({ setup: G.setup, acts: G.acts, mode: G.mode, me: G.me, level: G.level })); else localStorage.removeItem(SAVE); } catch (e) { } }
const hasKwA = (o, k) => !!(o.kw && o.kw.includes(k));
const isLocal = p => G.mode === 'hot' || (G.mode === 'ai' && p === G.me) || (G.mode === 'net' && p === G.me);
const viewer = () => G.mode === 'hot' ? G.s.active : G.me;

function rebuildLog() { G.log = []; G.lastBy = [[], []]; for (const ev of G.s.ev) logEv(ev, false); }
function logEv(ev, popup) {
  const s = G.s, nm = i => G.names[i] || '?';
  if (ev.p !== undefined && ev.k === 'act') G.lastBy[ev.p] = [ev];
  else if (ev.p !== undefined && ['move', 'shoot', 'fight', 'end'].includes(ev.k) && G.lastBy[ev.p]) G.lastBy[ev.p].push(ev);
  let t = null, cls = 'sys';
  switch (ev.k) {
    case 'tp': t = `── Punto de giro ${ev.n} · inicia el Jugador ${ev.init + 1} ──`; break;
    case 'act': t = `${nm(ev.op)} se activa (${ev.order === 'engage' ? 'Trabarse' : 'Ocultarse'})`; cls = 'p' + ev.p; break;
    case 'prim': t = `Jugador ${ev.p + 1}: Modo primario ${E.IMPS[ev.v]}`; cls = 'p' + ev.p; break;
    case 'imp': t = `Jugador ${ev.p + 1}: Imperativo ${E.IMPS[ev.v]}${ev.ign ? ' (ignora Deprecación)' : ''}`; cls = 'p' + ev.p; break;
    case 'mark': t = `${nm(ev.op)}: Marca ${E.MARKS[ev.v]}`; cls = 'p' + ev.p; break;
    case 'tacrev': t = `Jugador ${ev.p + 1} revela su op. táctica: ${E.TAC[ev.id][1]}`; cls = 'p' + ev.p; break;
    case 'tacact': t = `${nm(ev.op)}: ${({ dev: 'Colocar dispositivo', retr: 'Recuperar', clear: 'Despejar', scout: 'Explorar', banner: 'Plantar estandarte', pick: 'Recoger marcador', drop: 'Colocar marcador' })[ev.v]}${ev.ob != null ? ' (marcador ' + (ev.ob + 1) + ')' : ''}${ev.tg != null ? ' → ' + nm(ev.tg) : ''}`; cls = 'p' + ev.p; break;
    case 'scarper': t = `${nm(ev.op)}: Scarper (Correr gratis)`; cls = 'p' + ev.p; break;
    case 'denounce': t = `Jugador ${ev.p + 1} denuncia a ${nm(ev.op)} (D3 = ${ev.n})`; cls = 'p' + ev.p; break;
    case 'envoy': t = `Jugador ${ev.p + 1}: enviado ${nm(ev.op)}`; cls = 'p' + ev.p; break;
    case 'primop': t = `Jugador ${ev.p + 1}: op. principal ${({ crit: 'crítica', tac: 'táctica', kill: 'asesinato' })[ev.op]} → +${ev.v} PV`; cls = 'p' + ev.p; break;
    case 'send': t = `${nm(ev.op)}: Enviar datos (marcador ${ev.ob + 1}, ${ev.v} PV)`; cls = 'p' + ev.p; break;
    case 'rb': t = `Reinicio: J1 eligió el ${ev.sel[0] + 1}, J2 el ${ev.sel[1] + 1}; inerte: ${ev.inert.map(i => i + 1).join(', ')}`; break;
    case 'claim': t = `Jugador ${ev.p + 1} reclama el marcador ${ev.ob + 1}: ${ev.v === 'ctl' ? 'lo controlará' : 'el rival no lo disputará'} al final del PI`; cls = 'p' + ev.p; break;
    case 'art': t = `Jugador ${ev.p + 1}: Art of War — ${ev.v === 'mont' ? 'Mont’ka (+1" Movimiento)' : ev.v === 'kauy' ? 'Kauyon (Markerlight gratis con Conceal)' : 'no usa'}`; cls = 'p' + ev.p; break;
    case 'skill': t = `Jugador ${ev.p + 1}: habilidad «${E.SKILL[ev.v]}»`; cls = 'p' + ev.p; break;
    case 'ord': t = `Jugador ${ev.p + 1}: orden «${E.ORD[ev.v]}»`; cls = 'p' + ev.p; break;
    case 'pain': t = ev.g > 0 ? `${nm(ev.op)} gana ${ev.g} ficha${ev.g > 1 ? 's' : ''} de Dolor${ev.why ? ' (' + ev.why + ')' : ''} · total ${ev.n}` : `${nm(ev.op)} gasta una ficha de Dolor: ${ev.why} · quedan ${ev.n}`; cls = ''; break;
    case 'bdisp': t = `Brutal Display (${nm(ev.by)}): ${nm(ev.op)} no puede controlar marcadores ni Recoger/misión hasta el siguiente PI`; cls = ''; break;
    case 'wctok': t = `${nm(ev.op)} usa ${ev.t} sobre ${nm(ev.tg)}`; cls = 'p' + ev.p; break;
    case 'grasp': t = `${nm(ev.op)} queda atrapado por Tentacled Grasp (no se retira)`; cls = ''; break;
    case 'conv': t = `${nm(ev.op)} resiste (Outright Conviction): queda con 1 herida`; cls = ''; break;
    case 'fploy': t = `Ardid de tiroteo (1 CP): ${E.FPLOY_TXT[ev.id] || ev.id}`; cls = 'p' + ev.p; break;
    case 'hypex': t = ev.hy ? `¡Mina HY-Pex! ${nm(ev.op)} sufre ${ev.dmg} de daño` : `${nm(ev.op)} destapa un marcador de campo de minas vacío`; cls = ''; break;
    case 'mine': t = `¡Mina! ${nm(ev.op)} sufre ${ev.dmg} de daño`; cls = ''; break;
    case 'mlight': t = `${nm(ev.op)}: Markerlight sobre ${nm(ev.tg)} (${ev.n} fichas)`; cls = 'p' + ev.p; break;
    case 'ros': t = `${nm(ev.op)}: Inquisitorial Rosette`; cls = 'p' + ev.p; break;
    case 'ewill': t = `${nm(ev.op)}: The Emperor's Will`; cls = 'p' + ev.p; break;
    case 'slink': t = `${nm(ev.op)}: Slink into Darkness, pasa a Conceal`; cls = 'p' + ev.p; break;
    case 'hide': t = `${nm(ev.op)}: Shoot and Hide, pasa a Conceal`; cls = 'p' + ev.p; break;
    case 'cabal': t = `${nm(ev.op)}: Psychic Cabal, toma ${ev.w} de ${nm(ev.q)}`; cls = 'p' + ev.p; break;
    case 'scrap': t = `${nm(ev.op)}: Scrapcode Overload`; cls = 'p' + ev.p; break;
    case 'gng': t = `${nm(ev.op)}: Give No Ground, los Kasrkin controlan el marcador ${ev.ob + 1}`; cls = 'p' + ev.p; break;
    case 'smoke': t = `${nm(ev.op)} lanza una granada de humo`; cls = ''; break;
    case 'stun': t = `${nm(ev.op)} lanza granada aturdidora sobre ${nm(ev.tg)} (${ev.hit.length} afectados, -1 APL)`; cls = ''; break;
    case 'ammo': t = `${nm(ev.op)} usa el alijo de munición (repite un dado de ataque este punto de giro)`; cls = ''; break;
    case 'wreathe': t = `${nm(ev.op)} envuelve en Balefire a ${nm(ev.tg)}`; cls = 'p' + ev.p; break;
    case 'bz': t = `Jugador ${ev.p + 1} usa la carta de ${E.BZ[ev.id].t === 'b' ? 'SANGRE' : 'FERVOR'}: ${E.BZ[ev.id].n}${ev.why ? ' (' + ev.why + ')' : ''}`; cls = 'p' + ev.p; break;
    case 'plc': t = `Jugador ${ev.p + 1} coloca un marcador`; cls = 'p' + ev.p; break;
    case 'gch': t = `Jugador ${ev.p + 1} elige: ${ev.v}`; cls = 'p' + ev.p; break;
    case 'bzfx': t = `↳ ${ev.t === 'revive' ? 'queda con 1 herida y no puede ser incapacitado en esta acción' : ev.t}`; cls = ''; break;
    case 'bzdraw': t = `Jugador ${ev.p + 1} roba una carta de ${ev.t === 'b' ? 'SANGRE' : 'FERVOR'}`; cls = 'p' + ev.p; break;
    case 'bzact': t = ev.kind === 'hallow' ? `${nm(ev.op)} consagra/profana la estatua del santuario (roba una carta)` : `${nm(ev.op)} reza/blasfema ante la estatua (baraja y roba una carta)`; cls = 'p' + ev.p; break;
    case 'ccturn': t = `${nm(ev.op)} muta: ahora es ${ev.to === 'mutant' ? 'ACCURSED MUTANT' : 'ACCURSED TORMENT'}`; cls = ''; break;
    case 'ccgift': t = `Chaos Cult: Don Maldito ${ev.slot === 'pri' ? 'primario' : 'secundario'} = ${E.CC_GIFTS[ev.v] || ev.v}`; cls = ''; break;
    case 'ccmut': t = `${nm(ev.op)}: Mutación (${ev.kind === 'turn' ? 'transformar' : 'curar'})`; cls = ''; break;
    case 'sheal': t = `${nm(ev.op)} recupera ${ev.n} heridas (Soul Harvest)`; cls = ''; break;
    case 'soul': t = `Soul Harvest +${ev.n}`; cls = 'p' + ev.p; break;
    case 'pcoll': t = `Part Collector: ${nm(ev.op)} sufre ${ev.dmg} de daño`; cls = ''; break;
    case 'heal': t = `${nm(ev.op)} cura ${ev.hp} heridas a ${nm(ev.tg)}`; cls = 'p' + ev.p; break;
    case 'ct': t = `Jugador ${ev.p + 1}: táctica de capítulo ${ev.n === 1 ? 'primaria' : 'secundaria'}: ${E.CT[ev.v]}`; cls = 'p' + ev.p; break;
    case 'gam': t = `Jugador ${ev.p + 1} usa el ardid «${ev.n}»`; cls = 'p' + ev.p; break;
    case 'gampass': t = `Jugador ${ev.p + 1} pasa (ardides)`; cls = 'p' + ev.p; break;
    case 'divert': t = `Jugador ${ev.p + 1}: Desviar y desaparecer`; cls = 'p' + ev.p; break;
    case 'recon': t = `Jugador ${ev.p + 1}: Barrido de reconocimiento (borde ${ev.edge || '—'})`; cls = 'p' + ev.p; break;
    case 'absauth': t = `Jugador ${ev.p + 1}: Absolute Authority anula el ardid «${ev.id}» del jugador ${ev.tg + 1} (PC reembolsado)`; cls = 'p' + ev.p; break;
    case 'tun': t = `Jugador ${ev.p + 1}: marcador de Túnel ${ev.n}`; cls = 'p' + ev.p; break;
    case 'burrow': t = `${nm(ev.op)} ${ev.down ? 'se entierra' : 'emerge (Túnel / HIDING)'}`; cls = 'p' + ev.p; break;
    case 'hidlost': t = `${nm(ev.op)} sigue en HIDING al final del PI 2: incapacitado`; cls = 'p' + ev.p; break;
    case 'syn': t = `Vínculo sináptico: ${ev.r} → ${ev.eff === 'pc' ? '+1 PC' : ev.eff === 'daño' ? 'el Prime sufre ' + ev.r : 'nada'}`; cls = 'p' + ev.p; break;
    case 'lunge': t = `${nm(ev.op)} embiste a ${nm(ev.tg)} (${ev.dmg} daño, envenenado)`; cls = 'p' + ev.p; break;
    case 'sac': t = `${nm(ev.op)} distiende el saco dorsal`; cls = 'p' + ev.p; break;
    case 'poison': t = `${nm(ev.op)} sufre ${ev.dmg} de daño por veneno`; cls = 'p'; break;
    case 'signal': t = `${nm(ev.op)} hace Señal a ${nm(ev.tg)} (+1 PA)`; cls = 'p' + ev.p; break;
    case 'guard': t = `${nm(ev.op)} se pone en guardia`; cls = 'p' + ev.p; break;
    case 'vox': t = ev.ok ? `Vox Scream: ${nm(ev.op)} no puede activarse (D6 = ${ev.r})` : `Vox Scream falla (D6 = ${ev.r}); se reembolsa el PC`; cls = 'p' + ev.p; break;
    case 'react': t = `${nm(ev.op)} reacciona (acción gratuita, máx. 2")`; cls = 'p' + ev.p; break;
    case 'intr': t = `${nm(ev.op)} interrumpe desde la guardia → ${nm(ev.tg)}`; cls = 'p' + ev.p; break;
    case 'hatch': t = `${nm(ev.op)} ${ev.open ? 'abre' : 'cierra'} una escotilla`; cls = 'p' + ev.p; break;
    case 'thr': t = `Nivel de amenaza ${ev.v} (grado ${ev.g})`; cls = 'p1'; break;
    case 'twev': t = `Carta de evento: ${ev.name}`; cls = 'p1'; break;
    case 'twnpo': t = `${nm(ev.op)} entra en la zona de muerte (${ev.why})`; cls = 'p1'; break;
    case 'breach': t = `${nm(ev.op)} abre un punto de brecha${ev.n ? ' (' + ev.n + ' al otro lado)' : ''}`; cls = 'p' + ev.p; break;
    case 'tele': t = `${nm(ev.op)} se teletransporta${ev.sw >= 0 ? ' (intercambia con ' + nm(ev.sw) + ')' : ''}`; cls = 'p' + ev.p; break;
    case 'escape': t = `${nm(ev.op)} huye por el borde`; cls = 'p' + ev.p; break;
    case 'reinforce': t = `Refuerzo ANJ: ${nm(ev.op)} entra en juego`; cls = 'p1'; break;
    case 'jmend': t = ev.win ? 'Misión cumplida' : 'Misión fracasada'; cls = 'p'; break;
    case 'mission': t = `${nm(ev.op)}: ${E.MISSION_NAMES[ev.kind]} (marcador ${ev.ob + 1})`; cls = 'p' + ev.p; break;
    case 'move': t = `${nm(ev.op)}: ${KIND[ev.kind]} (${Math.hypot(ev.to.x - ev.from.x, ev.to.y - ev.from.y).toFixed(1)}")`; cls = 'p' + ev.p; break;
    case 'shoot': { const d = ev.res.reduce((x, r) => x + r.dmg, 0); t = `${nm(ev.op)} dispara ${ev.w} a ${nm(ev.tg)}: ${d ? '−' + d + ' heridas' : 'sin daño'}`; cls = 'p' + ev.p; break; }
    case 'fight': { const d1 = ev.steps.filter(x => x.by === ev.op).reduce((a, x) => a + (x.dmg || 0), 0), d2 = ev.steps.filter(x => x.by === ev.tg).reduce((a, x) => a + (x.dmg || 0), 0); t = `${nm(ev.op)} combate con ${nm(ev.tg)}: −${d1} / recibe −${d2}`; cls = 'p' + ev.p; break; }
    case 'dead': t = `✖ ${nm(ev.op)} incapacitado`; cls = 'p' + (1 - ev.p); break;
    case 'injured': t = `${nm(ev.op)} queda herido (−2" movimiento, +1 a impactar)`; break;
    case 'score': t = `+${ev.v} PV para Jugador ${ev.p + 1} (${({ crit: 'operación crítica', loot: 'saquear', kill: 'operación de asesinato', tac: 'operación táctica', primary: 'operación principal', bz: 'cartas de Sangre/Fervor descartadas' })[ev.why] || ev.why})`; cls = 'p' + ev.p; break;
    case 'cp': t = `Jugador ${ev.p + 1} usa 1 PC (repetir dado)`; cls = 'p' + ev.p; break;
    case 'hot': t = `${nm(ev.op)} sufre ${ev.dmg} por arma Caliente`; break;
    case 'grudge': t = `${nm(ev.op)} gana una ficha de Rencor (${ev.n})`; cls = 'p' + ev.p; break;
    case 'hkm': t = `Jugador ${ev.p + 1}: ${ev.id === 'need' ? 'La necesidad guarda' : ev.id === 'hum' ? 'Atraídos por el zumbido' : 'El esfuerzo gana'} en ${ev.v >= 1000 ? 'un marcador de misión propio' : 'el objetivo ' + (ev.v + 1)}`; cls = 'p' + ev.p; break;
    case 'aerial': t = `Agilidad aérea: ${nm(ev.op)} ignora un dado de daño normal (${ev.r})`; break;
    case 'regroup': t = `Jugador ${ev.p + 1}: Reagruparse hacia ${nm(ev.op)}`; cls = 'p' + ev.p; break;
    case 'wecome': t = `Venimos a por vosotros: ${nm(ev.by)} inflige ${ev.dmg} a ${nm(ev.op)}`; break;
    case 'rtd': t = `Regreso a la oscuridad: ${nm(ev.op)}`; cls = 'p' + ev.p; break;
    case 'resil': t = `Revoltingly Resilient: ${nm(ev.op)} reduce ${ev.n} de daño`; break;
    case 'saed': t = `Saedath: ${nm(ev.op)} ${ev.piv ? `tiene el PAPEL PRINCIPAL (${ev.al === 'epic' ? 'Épica' : 'Melodrama'})` : ev.perf ? 'gana el Galardón tras la actuación' : 'gana el Galardón'}`; cls = 'p' + ev.p; break;
    case 'jest': t = `La broma de Cegorach: ${nm(ev.op)} tira ${ev.r}${ev.ok ? ' — el golpe bloquea' : ''}`; break;
    case 'amped': t = `Pasados de vueltas: ${nm(ev.op)} recupera ${ev.n} heridas`; break;
    case 'tank': t = `Tanked Up: ${nm(ev.op)} +1 APL hasta su siguiente activación`; break;
    case 'shhh': t = `Jugador ${ev.p + 1}: ¡Ssssshhhh! (Correr gratis de KOMMANDOS)`; cls = 'p' + ev.p; break;
    case 'sia': t = `Munición especial: ${nm(ev.op)} — ${({ saturate: 'Saturar', lethal: 'Letal 5+', devastating: 'Devastadora 1', severe: 'Severa' })[ev.v]}`; break;
    case 'mtac': t = `Jugador ${ev.p + 1}: Tácticas de misión contra ${ev.v === 'engage' ? 'Trabarse' : 'Ocultarse'}`; cls = 'p' + ev.p; break;
    case 'frenzy': t = `${nm(ev.op)} entra en FRENESÍ (no cae; ficha de Frenesí)`; cls = 'p' + ev.p; break;
    case 'violent': t = `Temperamento violento: ${nm(ev.op)} repite todos sus dados`; break;
    case 'blood': t = `Bloodsense: ${nm(ev.op)} se activará a continuación`; cls = 'p' + ev.p; break;
    case 'res': t = `Jugador ${ev.p + 1}: ${ev.n} punto(s) Resourceful`; cls = 'p' + ev.p; break;
    case 'resp': t = ev.v === 'apl' ? `Resourceful: ${nm(ev.op)} +1 APL` : `Resourceful: ${nm(ev.op)} recupera ${ev.n} heridas`; break;
    case 'daunt': t = `Jugador ${ev.p + 1}: Dauntless Explorers (Reposicionar gratis)`; cls = 'p' + ev.p; break;
    case 'nbord': t = `Jugador ${ev.p + 1}: ${ev.id === 'attack' ? 'Orden de ataque' : ev.id === 'sweep' ? 'Barrido de limpieza' : 'Orden de defensa'} (${ev.lab.startsWith('op') ? 'junto a ' + nm(+ev.lab.slice(2)) : ev.lab})`; cls = 'p' + ev.p; break;
    case 'shp': t = `Paso de sombra: ${nm(ev.op)} reaparece en otra sombra (sin Disparar ni Combatir este PI)`; break;
    case 'creep': t = `Horror reptante: ${nm(ev.op)} Corre gratis entre sombras`; cls = 'p' + ev.p; break;
    case 'fate2': t = `Jugador ${ev.p + 1}: El destino es mi arma — reserva ${ev.d.join(' y ')}`; cls = 'p' + ev.p; break;
    case 'fate2u': t = `El destino es mi arma: un dado de ${nm(ev.op)} pasa a ser ${ev.v}`; break;
    case 'dun': t = `¡Hazlo ya!: ${nm(ev.tg)} tendrá +1 APL en su siguiente activación`; break;
    case 'feqh': t = `${ev.why}: ${nm(ev.op)} recupera ${ev.n} heridas`; break;
    case 'acid': t = `Sangre ácida: ${nm(ev.op)} sufre 1 de daño`; break;
    case 'senses': t = `Jugador ${ev.p + 1}: Sentidos agudizados — repite su dado de iniciativa`; cls = 'p' + ev.p; break;
    case 'commg': t = `Jugador ${ev.p + 1}: +${ev.n} puntos de Communion (${ev.tot})`; cls = 'p' + ev.p; break;
    case 'comm': t = `Communion: gasta 1 punto (${ev.why})${ev.free ? ' — gratis' : ` — quedan ${ev.n}`}`; cls = 'p' + ev.p; break;
    case 'feq': t = `Equipo de facción: ${ev.id}${ev.op != null && ev.op >= 0 ? ' — ' + nm(ev.op) : ''}`; break;
    case 'dzmove': t = `Jugador ${ev.p + 1}: ${({ guises: 'Disfraces encubiertos' })[ev.why] || ev.why} (${ev.n} Reposicionar gratis)`; cls = 'p' + ev.p; break;
    case 'snare': t = `Cadena trampa: ${nm(ev.op)} ${ev.ok ? 'no puede Retirarse' : 'se libera'} (${ev.r.join(', ')})`; break;
    case 'gas': t = `Jugador ${ev.p + 1}: Bombardeo de gas (−1 APL a ≤3" del marcador)`; cls = 'p' + ev.p; break;
    case 'tc': t = `Jugador ${ev.p + 1}: TECHNO-CURSE ${E.TC[ev.v]}`; cls = 'p' + ev.p; break;
    case 'rust': t = `Screaming Rustspikes: ${nm(ev.op)} sufre ${ev.n} de daño`; break;
    case 'wp': t = `Wrecka Rampage: gasta ${ev.spent} punto(s) Wrecka (quedan ${ev.left})`; cls = 'p' + ev.p; break;
    case 'boon': t = ev.use ? `Ecos de la disformidad: ${nm(ev.op)} hace una acción adicional en la contraacción` : `${nm(ev.op)}: Don de Tzeentch «${E.BOON[ev.v]}»`; cls = 'p' + ev.p; break;
    case 'engin': t = `Engineered: ${nm(ev.op)} — ${E.ENGIN[ev.v]}`; cls = 'p' + ev.p; break;
    case 'whisper': t = `Susurros del tormento: ${nm(ev.op)} (${ev.r})${ev.ok ? ' no puede activarse' : ''}`; cls = 'p' + ev.p; break;
    case 'hfocus': t = `Haunting Focus: ${nm(ev.op)} se activa antes que ${nm(ev.tg)}`; cls = 'p' + ev.p; break;
    case 'hftok': t = `Jugador ${ev.p + 1}: Haunting Focus sobre ${nm(ev.op)}`; cls = 'p' + ev.p; break;
    case 'pare': t = `Proyección pareidólica: ${nm(ev.op)} sobre ${nm(ev.tg)}`; break;
    case 'tflux': t = `Flujo temporal: ${nm(ev.op)} marca a ${nm(ev.tg)}`; break;
    case 'medic': t = `¡Médico!: ${nm(ev.by)} salva a ${nm(ev.op)} (queda con 1 herida)`; break;
    case 'xf': t = `${nm(ev.op)} gana una ficha de Fuego cruzado (${ev.n})${ev.upr ? ' — Levantamiento' : ''}`; break;
    case 'xfrr': t = `Se retira una ficha de Fuego cruzado de ${nm(ev.op)}: repetición`; break;
    case 'cultdev': t = `Devoción al Culto: ${nm(ev.op)} tira ${ev.r}${ev.ok ? ' y golpea antes de caer' : ' sin éxito'}`; break;
    case 'over': t = ev.winner < 0 ? 'Fin de la partida: empate' : `Fin de la partida: gana el Jugador ${ev.winner + 1}`; break;
  }
  if (t) G.log.unshift({ t, cls, tp: ev.tp, hl: false });
  if (popup) {
    if (ployEvPop(ev)) { } else if (ev.k === 'shoot') showDice(ev); else if (ev.k === 'fight') showFightDice(ev);
    try { FX.onEvent(ev, G, COL); } catch (e) { }
    if (ev.k === 'dead') toast(`✖ ${nm(ev.op)} incapacitado`);
  }
}
function processEvents() { const s = G.s; G.ployBatch = s.ev.slice(G.evIdx).some(e => e.k === 'fploy' || e.k === 'gam'); for (let i = G.evIdx; i < s.ev.length; i++) logEv(s.ev[i], true); G.evIdx = s.ev.length; }

function reactSummary(ev) {
  if (!ev) return '';
  const cn = d => d.c === 'c' ? 'crítico' : d.c === 'n' ? 'normal' : 'fallo';
  if (ev.k === 'shoot') return `Ataque: ${ev.atk.map(d => d.r + ' (' + cn(d) + ')').join(', ')}. Daño resultante: ${(ev.res || []).map(r => r.dmg).join(' / ')}.`;
  return `Ataque: ${ev.atk.map(d => d.r + ' (' + cn(d) + ')').join(', ')} · Defensa: ${ev.def.map(d => d.r + ' (' + cn(d) + ')').join(', ')}.`;
}
function showReact(a, pv, silent) {
  const s = G.s, chosen = [];
  const draw = () => {
    $('#modalBox').innerHTML = `<h2>Ardides de tiroteo</h2><p class="muted">Resultado sin ardid. ${reactSummary(pv.ev)}</p>${ployMode() ? '<div class="kcards">' + pv.offers.map(o => ployCardHTML(fireCard(o.id), o.p)).join('') + '</div>' : ''}<div class="acts">` +
      pv.offers.map((o, i) => `<button class="btn ${chosen.includes(i) ? '' : 'ghost'}" data-o="${i}">${chosen.includes(i) ? '✔ ' : ''}J${o.p + 1}: ${E.FPLOY_TXT[o.id]} (1 CP, tienes ${s.cp[o.p]})</button>`).join('') +
      `<button class="btn" id="rgo">Continuar${chosen.length ? ' usando ' + chosen.length : ' sin usar'}</button></div>`;
    $$('[data-o]').forEach(b => b.onclick = () => { const i = +b.dataset.o, k = chosen.indexOf(i); if (k < 0) chosen.push(i); else chosen.splice(k, 1); draw(); });
    $('#rgo').onclick = () => { closeModal(); dispatch({ ...a, fp: chosen.map(i => pv.offers[i].p + ':' + pv.offers[i].id) }, silent); };
  };
  $('#modal').hidden = false; draw();
}
function dispatch(a, silent, noManual) {
  if (G.replaying) return;
  if (!a.fp) { const pv = E.previewOffers(G.s, a); const mine = pv && pv.offers.filter(o => isLocal(o.p)); if (mine && mine.length) { clearTimeout(tick.t); showReact(a, { ...pv, offers: mine }, silent); return; } }
  if (G.manual && !noManual && !a.dice && !a.dm) { const dm = [0, 1, 2, 3].map(isLocal); const r = E.tryDice(G.s, a, [], dm); if (r.need) { clearTimeout(tick.t); askDice(a, [], dm, silent, r.need); return; } }
  const s = G.s; const pl = a.t === 'act' ? s.ops[a.op].p : (a.t === 'end' && s.act ? s.act.p : null);
  const pn0 = s.ev.length, pnP = (s.pend && s.pend.p != null) ? s.pend.p : s.active, pnGap = G.mode === 'net' || ((a.t === 'gch' || a.t === 'plc') && s.pend && s.pend.k !== 'resume');
  segMark(pnP, G.acts.length); E.apply(s, a); G.acts.push(a);
  if (a.t === 'end' || (G.mode === 'ai' && pnP !== G.me) || G.mode === 'net') G.undoFloor = G.acts.length; /* deshacer: solo hasta el último pase de turno o jugada rival */
  if (G.mode === 'net' && NET.live && !NET.rx) netSend({ t: 'act', n: G.acts.length - 1, a });
  if (pnGap) postNotes(s, pn0, pnP);
  if (pl !== null && G.hist[pl]) G.hist[pl].push(AI.features(s, pl));
  processEvents();
  if (!silent) { save(); refreshAll(); tick(); }
  undoBtn();
}
function undoBtn() { const b = $('#btnUndo'); if (b) b.disabled = !(G.s && G.mode !== 'net' && !G.s.over && G.acts.length > (G.undoFloor || 0)); }
function undo() { // deshacer paso a paso lo hecho desde el último pase de turno: se reconstruye la partida con una acción menos (el motor es determinista)
  if (!G.s || G.mode === 'net' || G.busy) return; const fl = G.undoFloor || 0; if (G.acts.length <= fl) { toast('No hay nada que deshacer en este turno'); return; }
  clearTimeout(tick.t); const acts = G.acts.slice(0, -1), last = G.acts[G.acts.length - 1]; const o = { mode: G.mode, me: G.me, level: G.level, floor: fl }; closeModal(); const ab = $('#autoNote'); if (ab) ab.hidden = true;
  beginGame0(G.setup, acts, o); toast('Deshecho: ' + (last.t === 'act' ? 'activación' : last.t === 'mv' ? 'movimiento' : last.t) + ' (quedan ' + (G.acts.length - fl) + ' deshacibles)'); }
$('#btnUndo').onclick = undo;
/* Avisos a posteriori: cubren lo que el aviso previo del motor no alcanza (efectos automáticos que se disparan al responder una pregunta o colocar algo de la cola de preparación, y todas las partidas en red). Misma regla de visibilidad: quien no realiza la acción lo ve todo; quien la realiza, solo lo que no es suyo. */
function postNotes(s, i0, actP) {
  const L = G.postN || (G.postN = []);
  for (let i = i0; i < s.ev.length; i++) { const e = s.ev[i]; if (!e || e.k !== 'feq' || !e.id) continue;
    const own = e.p != null ? e.p : (e.op != null && e.op >= 0 && s.ops[e.op] ? s.ops[e.op].p : null);
    if (G.mode !== 'hot' && G.me === actP && (own === G.me || own == null)) continue;
    if (G.mode === 'hot' && own === actP) continue;
    const t = String(e.id) + (e.op != null && e.op >= 0 && s.ops[e.op] ? ' — ' + s.ops[e.op].name : (e.p != null ? ' — Jugador ' + (e.p + 1) : '')); if (!L.includes(t)) L.push(t); }
  if (L.length) showPostNotes();
}
function showPostNotes() {
  let box = $('#autoNote'); if (!box) { box = document.createElement('div'); box.id = 'autoNote'; box.className = 'modal autonote'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); document.body.appendChild(box); }
  if (ployMode()) G.postN = (G.postN || []).filter(x => /ardid|gambito|ploy/i.test(x));
  if (G.mode === 'ai' && G.aiActing && !G.replaying && (G.postN || []).length) { const L0 = G.postN.slice(0, 8); G.postN = []; box.hidden = true; for (const t of L0) dqPush({ k: 'note', vid: true, ms: 2400, html: `<h2>El rival usa equipo / datacard</h2><p>${H(t)}</p>` }); G.postOpen = !!G.dqOpen; return; }
  const L = G.postN || []; if (!L.length) { box.hidden = true; G.postOpen = !!G.dqOpen; return; }
  box.innerHTML = `<div class="modal-box"><h2>Aviso: acciones automáticas</h2><p class="hint">El juego ha aplicado esto por sí solo:</p><ul class="notes">` + L.slice(0, 14).map(x => `<li>${H(x)}</li>`).join('') + (L.length > 14 ? `<li>… y ${L.length - 14} más (ver el registro)</li>` : '') + `</ul><div class="acts"><button class="btn" id="autoNoteOk">OK</button></div></div>`;
  box.hidden = false; G.postOpen = true; $('#autoNoteOk').onclick = () => { G.postN = []; G.postOpen = false; box.hidden = true; tick(); };
}

/* ---- Dados manuales: el jugador introduce los dados; el motor aplica todos los efectos automáticamente ---- */
G.manual = (() => { try { return localStorage.getItem('kt_manual') === '1'; } catch (e) { return false; } })();
function askDice(a, list, dm, silent, label) {
  let box = $('#diceBox'); if (!box) { box = document.createElement('div'); box.id = 'diceBox'; box.className = 'dicemodal'; document.body.appendChild(box); }
  const draw = lab => {
    box.hidden = false;
    box.innerHTML = `<div class="dl"><b>${H(lab)}</b> · dados: ${list.length ? list.map(v => `<span class="dc">${v}</span>`).join('') : '—'}</div><div class="dk">${[1, 2, 3, 4, 5, 6].map(v => `<button class="btn" data-v="${v}">${v}</button>`).join('')}<button class="btn ghost" data-v="u">⌫</button><button class="btn ghost" data-v="r">🎲 Auto</button><button class="btn ghost" data-v="x">✕</button></div>`;
    box.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = b.dataset.v;
      if (k === 'x') { box.hidden = true; refreshAll(); tick(); return; }
      if (k === 'r') { box.hidden = true; dispatch({ ...a }, silent, true); return; }
      if (k === 'u') { list.pop(); const r = E.tryDice(G.s, a, list, dm); draw(r.need || lab); return; }
      list.push(+k); const r = E.tryDice(G.s, a, list, dm);
      if (r.need) { draw(r.need); return; }
      box.hidden = true; dispatch({ ...a, dice: list.slice(0, r.used), dm }, silent);
    });
  };
  draw(label);
}

function tick() {
  const s = G.s; if (!s) return;
  if (s.over) return showEnd();
  const p = actor(s);
  clearTimeout(tick.t);
  if (G.mode === 'ai' && p !== G.me) { G.busy = true; $('#thinking').hidden = false; tick.t = setTimeout(aiMove, (G.level === 'hard' ? 380 : 520) * 1.6 / (G.aiSpd || 1)); }
  else { G.busy = false; $('#thinking').hidden = true; if (isLocal(p) && !s.act) { autoSelect(); refreshAll(); } }
  if (G.mode === 'net') updateNet();
  setStatus(); maybeStratDeck();
}
/* Quién debe responder ahora: si hay una pregunta, colocación o aviso dirigido a un jugador concreto (p. ej. una decisión del defensor durante la activación de la IA), responde ese jugador y no el que está activo. */
function actor(s) { return ((G.mode === 'ai' || G.mode === 'net') && s.pend && s.pend.kind === 'imp' && (s.pend.stage === 'gch' || s.pend.stage === 'plc') && s.pend.p != null) ? s.pend.p : s.active; }
function aiMove() {
  const s = G.s; if (!s || s.over || !(G.mode === 'ai' && actor(s) !== G.me)) return;
  if (G.postOpen) return; // hay un aviso abierto: la IA espera al OK
  let a; try { a = AI.chooseAction(s, G.level, AIW.w); } catch (e) { console.error(e); a = s.act ? { t: 'end' } : { t: 'act', op: s.ops.find(o => o.p === s.active && o.alive && o.ready).i, order: 'engage' }; }
  if (!a) a = s.act ? { t: 'end' } : null; if (!a) { const o = s.ops.find(o => o.p === s.active && o.alive && o.ready && E.canActivate(s, o)); a = o ? { t: 'act', op: o.i, order: 'engage' } : null; } if (!a) return;
  aiCam(s, a); G.aiActing = true; try { dispatch(a); } finally { G.aiActing = false; }
}
/* Velocidad de la IA / vídeos (×0,5 · ×1 · ×2 · ×4) y cámara que sigue su acción */
G.aiSpd = (() => { try { return +localStorage.getItem('kt_aispd') || 1; } catch (e) { return 1; } })();
function aiCam(s, a) { try {
  if (!G.view3d || G.camOff) return; const o = a.op != null ? s.ops[a.op] : (s.act ? s.ops[s.act.op] : null); let x = o && o.x, y = o && o.y, d = 24;
  if (a.t === 'mv' || a.t === 'move') { const px = a.x != null ? a.x : (a.to && a.to.x), py = a.y != null ? a.y : (a.to && a.to.y); if (px != null && py != null && o) { x = (o.x + px) / 2; y = (o.y + py) / 2; d = Math.max(22, Math.min(38, Math.hypot(o.x - px, o.y - py) * 2.2 + 18)); } }
  else if (a.tg != null && s.ops[a.tg] && o) { const t = s.ops[a.tg]; x = (o.x + t.x) / 2; y = (o.y + t.y) / 2; d = Math.max(22, Math.min(40, Math.hypot(o.x - t.x, o.y - t.y) * 2 + 16)); }
  if (x == null || x < 0) return; V3.flyTo(x, y, d, 750 / (G.aiSpd || 1)); dirty = true; } catch (e) { } }
function aiSpdCycle() { const L = [0.5, 1, 2, 4]; G.aiSpd = L[(L.indexOf(G.aiSpd) + 1) % L.length] || 1; try { localStorage.setItem('kt_aispd', String(G.aiSpd)); } catch (e) { } const b = $('#aiSpdBtn'); if (b) b.textContent = '×' + G.aiSpd; }
function autoSelect() {
  const s = G.s; if (G.ui.sel != null && s.ops[G.ui.sel].alive && s.ops[G.ui.sel].p === s.active && s.ops[G.ui.sel].ready) return;
  const r = s.ops.filter(o => o.p === s.active && o.alive && o.ready && E.canActivate(s, o)); G.ui.sel = r.length ? r[0].i : null;
}

function setStatus() {
  const s = G.s, st = $('#status'); let t = '';
  if (s.over) t = 'Partida terminada';
  else if (G.mode === 'ai' && actor(s) !== G.me) t = 'Turno de la IA…' + ((s.eqp && !s.eqp.done) || (s.dply && !s.dply.done) ? ' (paso 3 · Desplegar)' : (s.aop && s.explLate && !s.explDone && s.tp === 1 ? ' (paso 4 · Explorar)' : ''));
  else if (G.mode === 'net' && actor(s) !== G.me) t = NET.live ? 'Turno del rival…' + (NET.up ? '' : ' (sin conexión: se reintenta)') : 'Turno del rival · pega su código de jugada (pestaña En línea)';
  else {
    const who = G.mode === 'hot' ? `Jugador ${s.active + 1}: ` : '';
    if (s.pend && s.pend.kind === 'imp' && s.pend.stage === 'gch') t = who + (s.pend.note ? 'lee el aviso y pulsa OK' : /^expl/.test(s.pend.k || '') ? 'paso 4 · Explorar: elige en el panel de Acción' : 'elige una opción en el panel de Acción');
    else if (s.pend && s.pend.kind === 'imp' && s.pend.stage === 'plc') t = who + 'coloca en el mapa lo que indica el panel de Acción';
    else if (s.pend) t = who + (s.pend.kind === 'imp' ? (String(s.pend.stage).startsWith('bz') ? 'Blood and Zeal: ' + ({ bzd: 'roba una carta (Sangre o Fervor)', bzl: 'estatua: mira una carta y decide', bzp: 'baraja una carta o dos descartadas (Praise/Blaspheme)', bze: 'elige el agente de la acción gratuita' })[s.pend.stage] : s.pend.stage === 'mark' ? 'elige una Marca del Caos' : s.pend.stage === 'skill' ? 'elige una habilidad con las armas' : s.pend.stage === 'art' ? 'usa Art of War' : s.pend.stage === 'hkm' ? 'elige un marcador para su ardid' : s.pend.stage === 'regroup' ? 'elige a quién reagruparse' : s.pend.stage === 'rtd' ? 'elige quién regresa a la oscuridad' : s.pend.stage === 'writhe' ? 'elige qué RAVENER se escabulle' : s.pend.stage === 'ccg' ? 'elige un Don Maldito' : s.pend.stage === 'ccm' ? 'decide una Mutación' : s.pend.stage === 'ccs' ? 'usa Baleful Script' : s.pend.stage === 'saed' ? 'elige su Alegoría (Saedath)' : s.pend.stage === 'tc' ? 'elige su TECHNO-CURSE' : s.pend.stage === 'boon' ? 'elige un Don de Tzeentch' : s.pend.stage === 'engin' ? 'mejora las armas de VULGRAR' : s.pend.stage === 'hfocus' ? 'elige el blanco de Haunting Focus' : s.pend.stage === 'mtac' ? 'elige la orden de Tácticas de misión' : s.pend.stage === 'nbord' ? 'coloca su marcador de orden' : s.pend.stage === 'adapt' ? 'cambia su táctica secundaria' : s.pend.stage === 'denounce' ? 'elige a quién denunciar' : s.pend.stage === 'envoy' ? 'elige su enviado' : s.pend.stage === 'rb' ? 'elige en secreto un marcador (Reinicio)' : s.pend.stage === 'claim' ? 'reclama un marcador (Reclamar propiedad)' : s.pend.stage === 'ord' ? 'da una orden de guardia' : s.pend.stage === 'ct' ? 'elige una táctica de capítulo' : s.pend.stage === 'gam' ? 'elige un ardid de estrategia o pasa' : s.pend.stage === 'tun' ? 'coloca un marcador de Túnel' : s.pend.stage === 'syn' ? 'decide si usas Vínculo sináptico' : s.pend.stage === 'prim' ? 'elige tu Modo primario' : 'elige el Imperativo de Doctrina') : s.pend.kind === 'seize' ? 'puedes usar Seize the Initiative' : s.pend.kind === 'quarry' ? 'designa su presa' : s.pend.kind === 'worthy' ? 'puedes usar A Worthy Cause' : s.pend.kind === 'scarper' ? 'puede usar Scarper' : s.pend.kind === 'bcnet' ? 'puedes usar Network Counteract' : s.pend.kind === 'insid' ? 'puedes usar Insidious' : s.pend.kind === 'krump' ? "puedes usar Krump 'Em!" : s.pend.kind === 'react' ? 'puedes reaccionar con un agente usado' : s.pend.kind === 'dply' ? 'paso 3 · despliega tus agentes en tu zona de descenso' : s.pend.kind === 'eqp' ? 'paso 3 · coloca tus piezas de equipo' : s.pend.kind === 'pprim' ? 'gambito estratégico: elige en secreto tu operación principal' : s.pend.kind === 'exprep' ? 'Explorar: Reposicionar' : 'puedes interrumpir con un agente en guardia');
    else if (s.act && s.act.xr) t = who + 'Explorar: elige el destino del Reposicionamiento libre (a ≤3" de tu zona de descenso)';
    else if (!s.act) t = who + 'elige un operativo listo y actívalo';
    else if (G.ui.mode === 'shoot' || G.ui.mode === 'fight') t = who + 'toca el objetivo (marcado en rojo)';
    else if (G.ui.mode) t = who + (G.ui.pending ? 'confirma el movimiento' : 'toca una casilla verde para mover');
    else t = who + `${G.names[s.act.op]} · ${s.act.ap} PA restantes`;
  }
  st.textContent = t;
}

/* ============================ PANELES ============================ */
function opFloat(s) { // móvil: la datacard de la unidad tocada va en un desplegable en la parte inferior (sobre la hoja de acciones)
  const f = $('#opFloat'); if (!f) return; const i = G.ui.tapSel, o = i != null && s && s.ops[i];
  if (!MOB() || !o || (!G.ui.cardForce && s.act && s.act.op === i && s.act.p === s.active && isLocal(s.active))) { f.hidden = true; f.innerHTML = ''; return; }
  const op = G.ui.cardOpen === true, nm = H(G.names[o.i]);
  f.innerHTML = `<div class="odh"><button class="odt" id="opTog" aria-expanded="${op}" aria-label="${op ? 'Plegar' : 'Desplegar'} la datacard de ${nm}"><span class="odc">${op ? '▾' : '▴'}</span> Datacard · <b>${nm}</b></button><button class="icon x" id="opFx" aria-label="Cerrar">✕</button></div><div class="odb">${opTokSide(o)}<div class="cards one odc1">` + (dcHTML(o) || (o.img || []).slice(0, 1).map(u => ESM.cardOrNull(u, 'zoom', opByImg(u)) || `<img src="${IMGU(u)}" alt="${nm}">`).join('') || opCard(o, true)) + '</div></div><div class="tkfx" id="tkFx" hidden></div>'; f.classList.toggle('fold', !op); f.hidden = false;
  $('#opTog').onclick = () => { G.ui.cardOpen = G.ui.cardOpen !== true; opFloat(G.s); };
  $$('#opFloat .tkb').forEach(bt => bt.onclick = () => { const fx = $('#tkFx'), k = bt.dataset.tk, on = bt.classList.contains('on'); $$('#opFloat .tkb').forEach(x => x.classList.remove('on')); if (on) { fx.hidden = true; return; } bt.classList.add('on'); const [n, e] = tkInfo(k); const ab = TKA[k.startsWith('GR:') ? 'GR' : k]; const tm = ab && DB.find(q => q.id === ab[0]); fx.innerHTML = `<b>${H(n)}</b><span>${H(e)}</span>` + (tm ? `<button class="btn ghost small" id="tkLink" aria-label="Ver la habilidad en las cartas de la banda">Habilidad de banda: <b>${H(ab[2])}</b> · ${H(tm.name)} ▸ ver carta</button>` : ''); fx.hidden = false; if (tm) $('#tkLink').onclick = () => showFactionCards(tm, ab[1]); });
  $('#opFx').onclick = () => { G.ui.tapSel = null; G.ui.cardForce = false; opFloat(G.s); };
}
/* Al empezar el despliegue: se levanta el panel y el mapa se encuadra entero en la zona visible */
function deployFit() { try { if (!G.s || !G.s.dply || G.s.dply.done) return; if (MOB()) setSheet(true); setTimeout(() => { const r = $('#sideRight').getBoundingClientRect(), c = cv.getBoundingClientRect(); if (r.width >= c.width * 0.7) V3.fitInset(Math.max(0, c.bottom - Math.max(r.top, c.top)), 0); else V3.fitInset(0, Math.max(0, c.right - Math.max(r.left, c.left))); dirty = true; }, MOB() ? 330 : 60); } catch (e) { } }
function refreshAll() { const s = G.s; if (!s) return; if (s.dply && !s.dply.done && G.deployFit !== G.setup && !G.replaying) { G.deployFit = G.setup; setTimeout(deployFit, 120); } const key = (s.pend ? 'p' : '') + (s.act ? s.act.op : -1) + ':' + (s.over ? 1 : 0); if (key !== G.sheetKey) { G.ui.tapSel = null; G.ui.cardForce = false; } if (MOB()) { if (G.ui.mode) setSheet(false); else if (key !== G.sheetKey && (s.pend || s.act || s.over)) setSheet(true); G.sheetKey = key; } else G.sheetKey = key; const js = s.jm ? E.jmStatus(s) : null; $('#tpLabel').textContent = `TP ${s.tp}/${E.TPS}`; $('#initLabel').textContent = `Iniciativa: J${s.init + 1} · ${s.jm ? 'Misión conjunta: ' + js.name + (s.jm === 2 ? ' (' + js.sab + '/' + js.objs + ' sabotajes)' : s.jm === 3 ? ' (' + js.esc + ' huidos)' : s.dv ? (dv => (dv.m === 9 ? ' · ' + (s.tp >= 5 ? 'Objetivo cumplido: habéis aguantado hasta el PI 5' : 'Aguanta hasta el PI 5') + ' · Red Terror: ' + (dv.rt.ug ? 'bajo tierra' + (dv.rt.regen ? ' (regenerando ' + dv.rt.regen + ')' : '') : (dv.rt.lurk ? 'acecho ' : 'caza ') + dv.rt.w + '/' + dv.rt.W) : dv.m === 8 ? ' · Daño por balizas al Red Terror ' + dv.bd + '/35' + (dv.bcn ? ' · baliza activa: ataque en ' + dv.bcn.n + ' activación(es)' : '') + ' · Red Terror: ' + (dv.rt.ug ? 'bajo tierra' + (dv.rt.regen ? ' (regenerando ' + dv.rt.regen + ')' : '') : (dv.rt.lurk ? 'acecho ' : 'caza ') + dv.rt.w + '/' + dv.rt.W) + (dv.rem.length ? ' · cartas retiradas ' + dv.rem.join(', ') : '') : dv.m === 7 ? ' · Red Terror: ' + (dv.out ? 'sin aparecer (acércate a la zona 4)' : (dv.rt.ug ? 'bajo tierra' + (dv.rt.regen ? ' (regenerando ' + dv.rt.regen + ')' : '') : (dv.rt.lurk ? 'acecho ' : 'caza ') + dv.rt.w) + ' · Heridas máximas ' + dv.rt.W + '/30 (gana al llegar a 0)') + (dv.rem.length ? ' · cartas retiradas ' + dv.rem.join(', ') : '') : dv.m === 6 ? ' · Reagruparse en una zona segura' + (dv.secure >= 0 ? ' (ahora: zona ' + (dv.secure + 1) + ' segura)' : '') + (s.tp >= 4 ? '' : ' desde el final del PI 4') + ' · cartas de Percepción ' + dv.sense + ' · Red Terror: ' + (dv.rt.ug ? 'bajo tierra' + (dv.rt.regen ? ' (regenerando ' + dv.rt.regen + ')' : '') : (dv.rt.lurk ? 'acecho ' : 'caza ') + dv.rt.w + '/' + dv.rt.W) : dv.m === 5 ? ' · Zonas NPO comprobadas ' + dv.chk.filter(Boolean).length + '/' + dv.chk.length + ' · Regeneraciones del Red Terror ' + dv.reg + '/3 · Red Terror: ' + (dv.out ? 'sin aparecer' : dv.rt.ug ? 'bajo tierra' + (dv.rt.regen ? ' (regenerando ' + dv.rt.regen + ')' : '') : (dv.rt.lurk ? 'acecho ' : 'caza ') + dv.rt.w + '/' + dv.rt.W) : dv.m === 4 ? ' · Guaridas ' + dv.lair + '/3 (controláis ' + dv.lairCtl + ') · registrados ' + dv.srch + '/6 · Red Terror: ' + (dv.rt.ug ? 'bajo tierra' + (dv.rt.regen ? ' (regenerando ' + dv.rt.regen + ')' : '') : (dv.rt.lurk ? 'acecho ' : 'caza ') + dv.rt.w + '/' + dv.rt.W) + (s.tp >= 4 ? ' · gana quien controle 2 guaridas al final del PI' : ' · desde el PI 4') : dv.m === 3 ? ' · ' + dv.esc + ' huidos · Escáner: ' + (dv.scanEsc ? 'a salvo' : dv.scan ? 'conseguido, falta huir' : 'sin conseguir') + ' · Red Terror: ' + (dv.rt.ug ? 'bajo tierra' + (dv.rt.regen ? ' (regenerando ' + dv.rt.regen + ')' : '') : (dv.rt.lurk ? 'acecho ' : 'caza ') + dv.rt.w + '/' + dv.rt.W) : dv.m === 2 ? ' · Túneles ' + dv.tun + '/' + dv.tunN + ' · Red Terror: ' + (dv.rt.gone ? 'se ha retirado' : dv.rt.ug ? 'bajo tierra' + (dv.rt.regen ? ' (regenerando ' + dv.rt.regen + ')' : '') : (dv.rt.lurk ? 'acecho ' : 'caza ') + dv.rt.w + '/' + dv.rt.W) : ' · ' + dv.esc + ' huidos') + ' · NPO ' + dv.npo + ' (' + dv.rdy + ' sin activar) · mazo NPO: quedan ' + dv.deck + (dv.dis.length ? ' · descartadas ' + dv.dis.join(', ') : '') + (dv.m === 1 && !dv.one ? ' · el nido aún duerme' : ''))(E.dvStatus(s)) : s.ty ? (ty => ty.m === 5 ? ' · Bomba: ' + (ty.bomb && ty.bomb.c >= 0 ? s.ops[ty.bomb.c].name : ty.bomb && ty.bomb.set ? 'en el suelo' : 'sin asignar') : ty.m === 6 ? ' · NPO ' + ty.npo + ' · refuerzos pendientes: ' + (ty.rd.length ? ty.rd.join(', ') : 'ninguno') + (s.tp < 5 ? ' · aguanta hasta el PI 5' : ' · elimina a todos los NPO') : ty.m === 4 ? ' · Nodos ' + ty.sacs.map(w => w > 0 ? w + '/10' : 'destruido').join(' · ') + ' · ' + ty.tg + ' con designador' : ty.m === 3 ? ' · ' + ty.esc + ' huidos · refuerzos pendientes: ' + (ty.rd.length ? ty.rd.join(', ') : 'ninguno') : ty.m === 2 ? ' · Sacos ' + ty.sacs.map(w => w > 0 ? w + '/20' : 'destruido').join(' · ') : ' · Drones ' + ty.drones + '/' + ty.total + (ty.raised ? ' · ¡ALARMA! quedan ' + ty.left + ' PI' : ' · Alarma ' + ty.score) + (ty.dorm ? ' · ' + ty.dorm + ' dormidos' : ''))(E.tyStatus(s)) : s.twp ? ' · Amenaza ' + js.thr + '/15 (grado ' + js.grade + ')' + (s.twp === 1 ? ' · ' + js.esc + ' huidos' : s.twp === 2 ? ' · ' + js.brd + '/7 abiertos' : s.twp === 4 ? ' · Sarcófago ' + js.sarc + '/20' : s.twp === 5 ? ' · Salas ' + js.scouted + '/3' : '') : '') : 'Op. crítica: ' + E.CRIT_NAMES[s.crit]}${s.aop ? ' · Op. táctica: ' + [0, 1].map(p => 'J' + (p + 1) + ' ' + ((s.tacRev[p] || p === viewer()) ? E.TAC[s.tac[p]][1] + (s.tacRev[p] ? '' : ' (oculta)') : 'oculta')).join(', ') : ''} · Asesinato ${s.kg[0]}-${s.kg[1]}`;
  const NPl = s.np || 2; { const ex = $('#extraScores'); let h2 = ''; for (let p = 2; p < NPl; p++) h2 += `<div class="score p${p}"><span class="dot"></span><b>J${p + 1}</b><span class="vp" id="vp${p}">0</span><span class="cp" id="cp${p}">0 PC</span></div>`; if (ex.dataset.n !== String(NPl)) { ex.innerHTML = h2; ex.dataset.n = NPl; ex.style.display = 'contents'; } }
  { const rb = $('#resBar'); if (rb) { const h = [0, 1].map(p => (E.playerTokens ? E.playerTokens(s, p) : []).map(t => `<span class="rchip p${p}${t.used ? ' used' : ''}" title="${H(t.tip || '')}"><img src="img/tok/${t.k}.webp" alt="">${t.n != null ? `<i>${t.n}</i>` : ''}</span>`).join('')); const sig = h.join('|'); if (rb.dataset.sig !== sig) { rb.dataset.sig = sig; rb.hidden = !(h[0] || h[1]); rb.innerHTML = `<div class="g p0">${h[0]}</div><div class="g p1">${h[1]}</div>`; } } } // fichas de recurso (fe, runas…)
  for (let p = 0; p < NPl; p++) { $('#vp' + p).textContent = js ? (p === 0 ? (js.plAlive + '/' + js.plTotal) : (js.anjAlive + '/' + js.anjTotal)) : s.vp[p]; $('#cp' + p).textContent = s.cp[p] + ' PC' + (s.team[p] === 'novitiate' ? ' · ' + ((s.faith || [0, 0])[p]) + ' Fe' : ''); $('.score.p' + p).classList.toggle('turn', s.active === p && !s.over); }
  renderAct(); renderTeams($('#pTeam')); renderTeams($('#rosterP0').parentElement, true); renderLog(); setStatus(); dirty = true; }

const TKL = { CC_node: 'Obelisk Node', CC_mm: 'Matrix Manipulator', CC_aw: 'Awakened Obelisk Node', CC_ps: 'Phase Shifter', HS_C8HX: 'C8 HX usada', Plus_1_red: '+1 APL', Plus_1_blue: '+1 APL', Minus_1_red: '−1 APL', IA_weathered: 'Weathered (usado)', HS_writ_of_claim: 'Writ of Claim', CV_OSA: 'One Step Ahead (usado)', pivotal_role: 'Pivotal Role', veil_of_tears: 'Telón / Rain of Tears', Rat_EA: 'Explosive arsenal usado', Rat_Evade: 'Evade', howling_banshee_aspect: 'Técnica: Howling Banshee', striking_scorpions_aspect: 'Técnica: Striking Scorpion', dire_avengers_aspect: 'Técnica: Dire Avenger', HS_system_jam: 'System Jam', HS_spot: 'Spot', IA_medic: '¡Médico!', HS_medic: '¡Médico!', N_medic: '¡Médico!', N_AB: 'Blinding Aura', N_DA: 'Glorious Martyrdom', M_SH2: "Shadow's Bite", M_PP: 'Nowhere to Hide', HA_painbringer: 'Painbringer', crossfire_token: 'Fuego cruzado', Rat_TD: 'Designar objetivo', Rat_EW: 'Alerta temprana', TA_melta_bomb: 'Mina', Crate_red: 'Objeto recogido', Crate_blue: 'Objeto recogido', Electric_red: 'Célula de energía', Electric_blue: 'Célula de energía', Exclamtion_red: 'Reliquia', Exclamtion_blue: 'Reliquia', Banner_red: 'Estandarte', Banner_blue: 'Estandarte', Scan_red: 'Información', Scan_blue: 'Información', Stun_grenade: 'Aturdido', HA_Poison: 'Veneno', IA_quarry: 'Presa', IA_chasten: 'Castigo', N_blaze: 'Llama', N_WiF: 'Whip into Frenzy', HA_pain_1: 'Dolor 1', HA_pain_2: 'Dolor 2', M_balefire: 'Balefire', M_oubliex: 'Oubliex', CV_warding_shield: 'Escudo protector', CV_erudite_hunter: 'Cazador erudito', TA_detected: 'Detectado', Rat_Spot: 'Marcado', Crosshair_red: 'Marcado', Rat_Optics: 'Óptica', SS_optics: 'Óptica', SS_AS: 'Auspex', SS_TE: 'Spot', SS_DT: 'Objetivo designado', M_ShG: 'Glifo de sombra', HA_hypex: 'Hypex', Rat_Scarp: 'Scarper', Fog_of_Dreams: 'Niebla de sueños', CV_faolchu: 'Vínculo de Faolchú', IA_denounce: 'Denunciado', IA_protection: 'Protección', IA_guidance: 'Guía', IA_denun: 'Tomo: Denunciation', IA_sanctif: 'Tomo: Sanctification', Accolade: 'Galardón', VD_Humbling: 'Humbling Cruelty (−2" Mov., −1 Impacto)' };
function opTokChips(o) { // fichas que lleva el operativo, mostradas sobre su carta (incluye las que le ponen los enemigos: Presa, Rencor, Detectado…)
  const L = (E.opTokens ? E.opTokens(G.s, o) : []).filter(k => !/^(Conceal|Engage|Injured)_/.test(k)); if (!L.length) return '';
  return `<div class="tkrow">${L.map(k => { const gr = k.startsWith('GR:'); const src = gr ? grBadge(+k.slice(3)).toDataURL() : 'img/tok/' + k + '.webp'; return `<span class="tkc"><img src="${src}" alt=""><small>${H(gr ? 'Rencor ' + k.slice(3) : TKL[k] || k.replace(/_/g, ' '))}</small></span>`; }).join('')}</div>`;
}
const TKE = { // efecto de cada ficha, copiado de las reglas oficiales (solo las verificadas en los libros; el resto se completa según se contraste)
  GR: ['Rencor (Hearthkyn Salvagers)', 'Dura toda la batalla. Cada vez que un HEARTHKYN SALVAGER dispara contra este operativo, lo combate o contraataca contra él, por cada ficha de Rencor que tenga puede retener un éxito normal como crítico (incluidos los ya retenidos por Accurate). Las fichas no se retiran al hacerlo.'],
  crossfire_token: ['Fuego cruzado (Brood Brothers)', 'Cada vez que un BROOD BROTHER dispara contra este operativo, lo combate o contraataca contra él, puede retirar cualquiera de estas fichas; por cada una que retire puede repetir un dado de ataque.'],
  IA_quarry: ['Presa (Inquisitorial Agents)', 'Es la presa de los Agentes durante este punto de inflexión: las armas de un INQUISITORIAL AGENT tienen Ceaseless al disparar, combatir o contraatacar contra este operativo. Si es incapacitado, el Inquisidor puede elegir otra presa.'],
  IA_chasten: ['Chasten (Inquisitorial Agents)', 'Hasta el final de su próxima activación, este operativo se trata como si no tuviera la regla adicional elegida (no un arma, ni una regla que se ignore en la op. de asesinato).'],
  N_blaze: ['Blaze (Novitiates)', 'Cada vez que este operativo se activa: sufre D3 de daño, y su jugador puede restar 1 a su LPA hasta el final de esa activación para retirar la ficha. Eso se hace antes de que realice ninguna acción en esa activación.'],
  Stun_grenade: ['Aturdido (granada aturdidora)', 'Ha fallado una prueba de aturdimiento (D6: con 3+ resta 1 a su LPA hasta el final de su próxima activación).'],
  Rat_TD: ['Designación de objetivo (Ratlings)', 'Hasta el final del punto de inflexión, cada vez que un RATLING dispara contra este operativo con un rifle, esa arma tiene la regla Letal 5+.'],
  HA_Poison: ['Veneno (Hand of the Archon)', 'Cada vez que se activa un operativo que tiene una ficha de Veneno, sufre D3 de daño.'],
  HA_pain_1: ['Dolor ×1 (Hand of the Archon)', 'Ficha de Dolor: el jugador puede gastar las fichas de Dolor de sus operativos HAND OF THE ARCHON en invigorations cuando se cumple su condición (una invigoration por activación o contraactuación, salvo Stimulated Senses, que puede usarse además de otra).'],
  HA_pain_2: ['Dolor ×2 (Hand of the Archon)', 'Dos fichas de Dolor: se pueden gastar en invigorations cuando se cumple su condición (una invigoration por activación o contraactuación, salvo Stimulated Senses, que puede usarse además de otra).'],
  HA_hypex: ['Hypex (droga de combate)', 'Este operativo puede ignorar cualquier cambio a su Movimiento por estar herido.'],
  HA_painbringer: ['Painbringer (droga de combate)', 'Cada vez que un dado de ataque inflige 3 o más de daño a este operativo, tira un D6: con 6, resta 1 al daño infligido.'],
  M_balefire: ['Balefire (Mandrakes)', 'Cuando un MANDRAKE amigo dispara contra un operativo que tiene una ficha de Balefire, suma 1 a ambos Dmg de sus armas a distancia y tienen la regla Saturate. Cuando un operativo dispara contra un MANDRAKE que tiene una ficha de Balefire, resta 1 a ambos Dmg de sus armas a distancia (mínimo 1).'],
  IA_protection: ['Protection (Inquisitorial Agents)', 'PSÍQUICO. Cuando un operativo dispara contra este operativo, en el paso Tirar dados de defensa puedes retener un fallo como éxito normal, o retener un éxito normal como crítico.'],
  IA_guidance: ['Guidance (Inquisitorial Agents)', 'PSÍQUICO. Cuando este operativo dispara, combate o contraataca, en el paso Tirar dados de ataque puedes retener un fallo como éxito normal, o retener un éxito normal como crítico.'],
  IA_weathered: ['Weathered usado (Inquisitorial Agents)', 'Una vez por punto de inflexión, cuando este operativo combate o contraataca, en el paso Resolver dados de ataque puede ignorar el daño de un éxito normal. Ya lo ha usado este punto de inflexión.'],
  HS_system_jam: ['System Jam (Hearthkyn Salvagers)', 'Hasta el final de la batalla, un operativo enemigo con ficha de System Jam no puede activarse hasta que todos los operativos enemigos sin ella estén agotados.'],
  HS_C8HX: ['C8 HX charge usada', 'Arma con Limitado 1 (alcance 4", Blast 1", Heavy solo Reposicionar, Perforante 1, Saturate): ya se ha usado.'],
  Rat_Evade: ['Evade (Ratlings) usado', 'Una vez por punto de inflexión, tras una acción de un operativo enemigo, puedes interrumpir y realizar con este operativo una acción gratuita de Dash. Ya lo ha usado este punto de inflexión.'],
  Rat_Optics: ['Optics (Ratlings)', 'Hasta el inicio de la próxima activación de este operativo, cuando dispara, los operativos enemigos no pueden estar ofuscados.'],
  Rat_EA: ['Explosive arsenal usado (Ratlings)', 'Arma Limitado 1 (alcance 3", Blast 1", Heavy solo Reposicionar, Perforante 1, Saturate): ya se ha usado.'],
  VD_Accolade: ['Accolade (Void-dancer Troupe)', 'Concede la regla Accolade de la alegoría elegida: Balanced en sus armas cuando combate (Epic) o en sus armas a distancia (Melodrama).'],
  pivotal_role: ['Pivotal Role (Void-dancer Troupe)', 'Mientras un operativo tiene el Pivotal Role, tiene la regla Accolade de la alegoría de tu banda. Cuando completa la actuación de la alegoría (una vez por punto de inflexión) puedes elegir otro VOID-DANCER TROUPE amigo para que gane Accolade.'],
  Conceal_ready: ['Orden: Ocultarse (lista)', 'Con Ocultarse el operativo no puede disparar (salvo armas Silenciosas), cargar ni reaccionar, pero no es blanco válido mientras está a cubierto. La ficha lista indica que aún no se ha activado en este punto de inflexión.'],
  Conceal_activated: ['Orden: Ocultarse (activado)', 'Ya se ha activado en este punto de inflexión con orden de Ocultarse (no puede disparar salvo armas Silenciosas ni cargar; no es blanco válido a cubierto).'],
  Engage_ready: ['Orden: Trabarse (lista)', 'Con Trabarse el operativo puede disparar, cargar y reaccionar con normalidad, pero es blanco válido aunque esté a cubierto. La ficha lista indica que aún no se ha activado en este punto de inflexión.'],
  Engage_activated: ['Orden: Trabarse (activado)', 'Ya se ha activado en este punto de inflexión con orden de Trabarse.'],
  Injured_red: ['Herido', 'Operativo con menos de la mitad de sus heridas: resta 2" a su Movimiento y empeora en 1 el Impactar de sus armas.'],
  Injured_blue: ['Herido', 'Operativo con menos de la mitad de sus heridas: resta 2" a su Movimiento y empeora en 1 el Impactar de sus armas.'],
  SS_AS: ['Auspex Scan (Scout Squad)', 'Hasta el inicio de la siguiente activación de este operativo o hasta que sea incapacitado: cuando un SCOUT SQUAD amigo dispara contra un operativo enemigo a 8" o menos de este operativo, ese enemigo no puede estar ofuscado.'],
  IA_denun: ['Denunciation (Inquisitorial Tome)', 'Cuando un INQUISITORIAL AGENT amigo dispara, combate o contraataca contra un operativo enemigo a 2" o menos de operativos amigos con esta regla, suma 1 al Atk de las armas de ese operativo amigo.'],
  IA_sanctif: ['Sanctification (Inquisitorial Tome)', 'Cuando un operativo enemigo dispara, combate o contraataca contra un INQUISITORIAL AGENT amigo a 2" o menos de operativos amigos con esta regla, resta 1 al Atk de las armas del enemigo.'],
  Fog_of_Dreams: ['Fog of Dreams (Void-dancer Troupe)', 'PSÍQUICO. Hasta el final del punto de inflexión, este operativo enemigo no puede activarse ni realizar acciones hasta que sea el último operativo enemigo en activarse, o hasta que el oponente haya completado la activación de un número de operativos enemigos igual al resultado del D6 (lo que ocurra primero).'],
  HS_medic: ['Medic! usado (Hearthkyn Salvagers)', 'Medic!: la primera vez por punto de inflexión que otro operativo amigo HEARTHKYN SALVAGER sería incapacitado estando visible y a 3" o menos de este operativo (y sin que ninguno esté en el área de control de un enemigo), no es incapacitado: le queda 1 herida y no puede ser incapacitado durante el resto de la acción. Después puede hacer un Dash gratis acabando en el área de control de este operativo; ambos restan 1 a su LPA hasta el final de sus siguientes activaciones y, si fue durante su activación, esa activación termina. Ya se ha usado este punto de inflexión.'],
  IA_medic: ['Medic! usado (Inquisitorial Agents)', 'Medic!: la primera vez por punto de inflexión que otro operativo amigo INQUISITORIAL AGENT sería incapacitado estando visible y a 3" o menos de este operativo (y sin que ninguno esté en el área de control de un enemigo), no es incapacitado: le queda 1 herida y no puede ser incapacitado durante el resto de la acción. Después puede hacer un Dash gratis acabando en el área de control de este operativo; ambos restan 1 a su LPA hasta el final de sus siguientes activaciones y, si fue durante su activación, esa activación termina. Ya se ha usado este punto de inflexión.'],
  HS_spot: ['Spot (Hearthkyn Salvagers)', 'Hasta el final del punto de inflexión, cuando un HEARTHKYN SALVAGER amigo a 3" o menos de quien lo hizo dispara contra este operativo, puedes usar este efecto: sus armas a distancia tienen Seek Light y este operativo no puede estar ofuscado.'],
  Rat_Spot: ['Spot (Ratlings)', 'Hasta el final del punto de inflexión, cuando un RATLING amigo a 3" o menos de quien lo hizo dispara contra este operativo, puedes usar este efecto: sus armas a distancia tienen Seek Light y este operativo no puede estar ofuscado.'],
  Rat_EW: ['Early Warning usado (Ratlings)', 'Una vez por punto de inflexión, tras una acción enemiga en la que se mueve o se despliega, el BATTLEMUTT puede interrumpir: cada RATLING amigo (salvo OGRYN y BULLGRYN) a 6" o menos de él y a 2" o menos de ese enemigo puede hacer un Dash o Fall Back gratis (sin mover más de 3"), sin acabar a 2" de un enemigo salvo que no sea visible para todos. Ya se ha usado este punto de inflexión.'],
  M_ShG: ['Shadow Glyph (Mandrakes)', 'Una vez por punto de inflexión, cuando un MANDRAKE amigo se activa WITHIN SHADOW, puedes usar esta regla: hasta el inicio de su siguiente activación, mientras tenga orden de Ocultarse y esté a cubierto, no puede ser elegido como blanco válido, con prioridad sobre cualquier otra regla (p. ej. Seek, terreno Vantage) salvo estar a 2" o menos.'],
  M_PP: ['Nowhere to Hide (Mandrakes)', 'Ardid de tiroteo: durante la activación de un MANDRAKE amigo, al realizar una acción en la que se mueve, hasta el final de esa activación puede mover atravesando partes de terreno como si no estuvieran, sin mover más de su Movimiento si es Cargar, y debe acabar donde pueda colocarse.'],
  M_SH2: ["Shadow's Bite (Mandrakes)", 'Ardid de tiroteo: cuando un enemigo realiza Combatir en una activación en la que Cargó y elige a un MANDRAKE WITHIN SHADOW para combatir contra él, en el paso Resolver dados de ataque resuelves tú el primer dado de ataque (es decir, el defensor en vez del atacante). Ya se ha usado este punto de inflexión.'],
  M_oubliex: ['Oubliex activo (Mandrakes NIGHTFIEND)', 'Se activa cuando el operativo se prepara (readied) o si incapacita a un enemigo con su huskblade. Mientras está activo, cuando un dado de ataque fuera a infligirle daño tira un D6: con 5+ ignora el daño de ese dado y el oubliex deja de estar activo.'],
  N_WiF: ['Whip into Frenzy (Novitiates)', 'Hasta el final de la siguiente activación de este operativo: suma 1" a su Movimiento y puede realizar dos acciones de Combatir durante ella, una de las cuales puede ser gratuita.'],
  N_AB: ['Blinding Aura usado (Novitiates)', 'Ardid de tiroteo: cuando un enemigo realiza Disparar y elige a un NOVITIATE amigo como blanco válido, hasta el final de esa activación/contraactuación, mientras ese NOVITIATE esté a más de 2" del enemigo, el oponente no puede elegirlo como blanco válido. Si no hay otros blancos válidos, la acción termina (no se cancela). No tiene efecto si no es el operativo elegido (p. ej. objetivo secundario por Blast). Ya usado este punto de inflexión.'],
  N_DA: ['Glorious Martyrdom usado (Novitiates)', 'Ardid de tiroteo: cuando un NOVITIATE amigo es incapacitado, por cada operativo enemigo visible y a 2" o menos de él, ganas 1 punto de Fe e infliges D3 de daño a ese enemigo (se tira por separado).'],
  N_medic: ['Medic! usado (Novitiates)', 'La primera vez por punto de inflexión que otro NOVITIATE amigo fuera retirado como incapacitado estando visible y a 3" o menos de este operativo (sin que ninguno esté en el área de control de un enemigo), no es incapacitado y le queda 1 herida. Después puede hacer un Dash gratis acabando en el área de control de este operativo; ambos restan 1 a su LPA hasta el final de sus siguientes activaciones y, si fue durante su activación, esa activación termina. Ya usado este punto de inflexión.'],
  CV_warding_shield: ['Warding Shield (Corsair Voidscarred)', 'PSÍQUICO. Hasta el inicio de la siguiente activación de quien lo lanzó, hasta que sea incapacitado o repita la acción (lo que ocurra primero), la primera vez que un dado de ataque inflige daño a este operativo, se ignora ese daño.'],
  CV_erudite_hunter: ['Erudite Hunter (Corsair Voidscarred)', 'GAMBITO ESTRATÉGICO sobre un operativo enemigo a 9" o menos. Una vez durante este punto de inflexión, tras una acción de ese enemigo en la que se mueve, puedes interrumpir su activación: el operativo con Erudite Hunter puede hacer un Reposicionar gratis (sin acabar más lejos del enemigo) o un Cargar gratis (puedes cambiar su orden y debe acabar en el área de control del enemigo).'],
  CV_OSA: ['One Step Ahead usado (Corsair Voidscarred)', 'Una vez por batalla, tras una acción de un enemigo durante su activación, si este operativo está listo: tira un D6; si supera la LPA de ese enemigo, puedes interrumpir su activación y realizar con este operativo un Disparar o un Combatir gratis (sin elegir a otro enemigo como blanco, salvo secundarios de Blast). Después resta 1 a su LPA hasta el final de su siguiente activación. Ya usado en esta batalla.'],
  CV_faolchu: ['Faolchú\'s Bond (Corsair Voidscarred)', 'La primera vez por punto de inflexión que este operativo contraataca sin haber usado su arma a distancia Faolchú en ese punto de inflexión, en el paso Resolver dados de ataque resuelves tú el primer dado de ataque (el defensor en vez del atacante). Ya usado este punto de inflexión.'],
  CV_mistfield: ['Mistfield (Corsair Voidscarred)', 'Una vez por punto de inflexión, cuando un operativo dispara a un CORSAIR VOIDSCARRED amigo a más de 3", al inicio de Tirar dados de defensa puedes empeorar en 1 la x de Perforante (Piercing 1 se ignora) hasta el final de esa secuencia.'],
  howling_banshee_aspect: ['Técnica de aspecto usada (Howling Banshee)', 'No se puede usar más de una Técnica de aspecto por activación o contraactuación, ni cada una más de una vez por punto de inflexión (dos si todos tus BLADES OF KHAINE comparten aspecto). Banshee: The Woe, Rain of Tears, Acrobatic, Scream-That-Steals, Shriek-That-Kills.'],
  striking_scorpions_aspect: ['Técnica de aspecto usada (Striking Scorpion)', 'No se puede usar más de una Técnica de aspecto por activación o contraactuación, ni cada una más de una vez por punto de inflexión (dos si todos tus BLADES OF KHAINE comparten aspecto). Scorpion: Patient Stalk Sudden Blow, Strike and Fade, Scorpion\'s Eye, Merciless Strikes, One with the Gloom.'],
  dire_avengers_aspect: ['Técnica de aspecto usada (Dire Avenger)', 'No se puede usar más de una Técnica de aspecto por activación o contraactuación, ni cada una más de una vez por punto de inflexión (dos si todos tus BLADES OF KHAINE comparten aspecto). Avenger: The Slicing Hurricane, Death of a Thousand Blades, Vigilance of the Avenger, Unstinting Immovable, Raging Heat of the Dying Flame.'],
  TA_detected: ['Detected (Tempestus Aquilons)', 'Ardid Eye Above: hasta el final del punto de inflexión, cuando este operativo dispara contra un TEMPESTUS AQUILON amigo puedes repetir un dado de defensa; cuando combate o contraataca contra él, uno de tus bloqueos puede asignarse para bloquear dos éxitos sin resolver (en vez de uno).'],
  SS_TE: ['Track Enemy (Scout Squad)', 'Hasta el final del punto de inflexión, cuando un SCOUT SQUAD amigo dispara contra este operativo, sus armas a distancia tienen la regla Seek Light.'],
  SS_DT: ['Designate Target (Scout Squad)', 'Ficha de Objetivo: cuando un SCOUT SQUAD amigo dispara, combate o contraataca contra este operativo, puedes repetir un dado de ataque.'],
  SS_optics: ['Optics (Scout Squad)', 'Hasta el inicio de la siguiente activación de este operativo, cuando dispara, los operativos enemigos no pueden estar ofuscados.'],
  veil_of_tears: ['The Curtain Falls usado (Void-dancer Troupe)', 'Ardid de tiroteo: cuando un VOID-DANCER TROUPE amigo combate y tras un éxito crítico el enemigo no es incapacitado, la secuencia termina (se descartan los dados restantes) y realiza un Fall Back gratis de hasta 3" (aunque una acción se lo impidiera). Ya usado este punto de inflexión.'],
  VD_Humbling: ['Humbling Cruelty (Void-dancer)', 'Mientras la tenga, este operativo resta 2" a su Movimiento y empeora en 1 el Impactar de sus armas (no acumulable con estar herido). Se retira al final de su próxima activación.'],
};
const TKA = { // ficha → [banda, pestaña de sus cartas, nombre de la habilidad que la concede]
  GR: ['hearthkyn_salvager', 'rule', 'Grudge'], crossfire_token: ['brood_brothers', 'rule', 'Crossfire'], IA_quarry: ['inquisitorial_agent', 'strategy', 'Quarry'], IA_chasten: ['inquisitorial_agent', 'rule', 'Chasten'], N_blaze: ['novitiate', 'firefight', 'Blazing Inferno'], Rat_TD: ['ratling', 'strategy', 'Target Designation'], VD_Humbling: ['voiddancer_troupe', 'roster', 'Humbling Cruelty'],
  HA_Poison: ['hand_of_the_archons', 'roster', 'Refined Poison'], HA_pain_1: ['hand_of_the_archons', 'rule', 'Pain / Invigorations'], HA_pain_2: ['hand_of_the_archons', 'rule', 'Pain / Invigorations'], HA_hypex: ['hand_of_the_archons', 'roster', 'Combat Drugs'], HA_painbringer: ['hand_of_the_archons', 'roster', 'Combat Drugs'],
  M_balefire: ['mandrakes', 'roster', 'Balefire'], M_oubliex: ['mandrakes', 'roster', 'Oubliex'], M_ShG: ['mandrakes', 'equipment', 'Shadow Glyph'], M_SH2: ['mandrakes', 'firefight', "Shadow's Bite"], M_PP: ['mandrakes', 'firefight', 'Nowhere to Hide'],
  IA_protection: ['inquisitorial_agent', 'roster', 'Scry'], IA_guidance: ['inquisitorial_agent', 'roster', 'Scry'], IA_weathered: ['inquisitorial_agent', 'roster', 'Weathered'], IA_denun: ['inquisitorial_agent', 'roster', 'Inquisitorial Tomes'], IA_sanctif: ['inquisitorial_agent', 'roster', 'Inquisitorial Tomes'], IA_medic: ['inquisitorial_agent', 'roster', 'Medic!'],
  HS_system_jam: ['hearthkyn_salvager', 'roster', 'System Jam'], HS_C8HX: ['hearthkyn_salvager', 'roster', 'C8 HX charge'], HS_medic: ['hearthkyn_salvager', 'roster', 'Medic!'], HS_spot: ['hearthkyn_salvager', 'roster', 'Spot'],
  Rat_Evade: ['ratling', 'roster', 'Evade'], Rat_Optics: ['ratling', 'roster', 'Optics'], Rat_EA: ['ratling', 'roster', 'Explosive arsenal'], Rat_Spot: ['ratling', 'roster', 'Spot'], Rat_EW: ['ratling', 'roster', 'Early Warning'],
  Accolade: ['voiddancer_troupe', 'rule', 'Accolade'], pivotal_role: ['voiddancer_troupe', 'rule', 'Pivotal Role'], Fog_of_Dreams: ['voiddancer_troupe', 'roster', 'Fog of Dreams'], veil_of_tears: ['voiddancer_troupe', 'firefight', 'The Curtain Falls'], VD_Humbling_: null,
  N_WiF: ['novitiate', 'roster', 'Whip into Frenzy'], N_AB: ['novitiate', 'firefight', 'Blinding Aura'], N_DA: ['novitiate', 'firefight', 'Glorious Martyrdom'], N_medic: ['novitiate', 'roster', 'Medic!'],
  CV_warding_shield: ['corsair_voidscarred', 'roster', 'Warding Shield'], CV_erudite_hunter: ['corsair_voidscarred', 'roster', 'Erudite Hunter'], CV_OSA: ['corsair_voidscarred', 'roster', 'One Step Ahead'], CV_faolchu: ['corsair_voidscarred', 'roster', "Faolchú's Bond"], CV_mistfield: ['corsair_voidscarred', 'equipment', 'Mistfield'],
  howling_banshee_aspect: ['blades_of_khaine', 'rule', 'Aspect Techniques'], striking_scorpions_aspect: ['blades_of_khaine', 'rule', 'Aspect Techniques'], dire_avengers_aspect: ['blades_of_khaine', 'rule', 'Aspect Techniques'],
  TA_detected: ['tempestus_aquilon', 'strategy', 'Eye Above'], SS_TE: ['scout_squad', 'roster', 'Track Enemy'], SS_DT: ['scout_squad', 'rule', 'Forward Scouting: Designate Target'], SS_AS: ['scout_squad', 'roster', 'Auspex Scan'], SS_optics: ['scout_squad', 'roster', 'Optics'],
};
const tkInfo = k => k === 'Accolade' ? TKE.VD_Accolade : k.startsWith('GR:') ? [TKE.GR[0] + ' ' + k.slice(3), TKE.GR[1]] : TKE[k] ? TKE[k] : [TKL[k] || k.replace(/_/g, ' '), 'Sin descripción de efecto todavía: consulta la carta de su banda.'];
function ordChoice(o) { const s = G.s; return !!(s && !s.act && !s.pend && !s.over && isLocal(actor(s)) && !(G.mode === 'ai' && actor(s) !== G.me) && o.p === s.active && o.ready && o.alive && E.canActivate(s, o)); }
function opTokSide(o) { // fichas del operativo a la izquierda de su datacard; al pulsar una sale su efecto. Si puede activarse, las fichas de orden SON la elección (Trabarse / Ocultarse)
  const ch = ordChoice(o); let L = (E.opTokens ? E.opTokens(G.s, o) : []).filter(k => !/^Injured_/.test(k) || E.injured(o)); if (ch) L = L.filter(k => !/^(Conceal|Engage)_/.test(k)); if (!L.length && !ch) return '';
  const ord = ch ? ['Engage', 'Conceal'].map(k => `<button class="tkb ord" data-ord="${k === 'Engage' ? 'engage' : 'conceal'}" data-op="${o.i}" aria-label="Activar con orden de ${k === 'Engage' ? 'Trabarse' : 'Ocultarse'}"><img src="img/tok/${k}_ready.webp" alt=""><small>${k === 'Engage' ? 'Trabarse' : 'Ocultarse'}</small></button>`).join('') : '';
  return `<div class="tkside">${ord}${L.map(k => { const gr = k.startsWith('GR:'); const src = gr ? grBadge(+k.slice(3)).toDataURL() : 'img/tok/' + k + '.webp'; const nm = tkInfo(k)[0]; return `<button class="tkb" data-tk="${H(k)}" aria-label="${H(nm)}: ver efecto"><img src="${src}" alt=""></button>`; }).join('')}</div>`;
}
function opImgRow(o) { // PC: datacard real (imagen) a la derecha y fichas a la izquierda, como en el móvil
  const nm = H(G.names[o.i]), im = (o.img || []).slice(0, 1).map(u => ESM.cardOrNull(u, 'zoom', opByImg(u)) || `<img src="${IMGU(u)}" alt="${nm}">`).join(''); if (!im) return '';
  return `<div class="pcdb"><div class="odb">${opTokSide(o)}<div class="cards one odc1">${im}</div></div><div class="tkfx pctkfx" hidden></div></div>`;
}
document.addEventListener('click', e => { const od = e.target.closest && e.target.closest('.tkb.ord'); if (od) { e.preventDefault(); dispatch({ t: 'act', op: +od.dataset.op, order: od.dataset.ord }); return; } const bt = e.target.closest && e.target.closest('#pAct .tkb'); if (!bt) return; const w = bt.closest('.pcdb'), fx = w && $('.pctkfx', w), k = bt.dataset.tk, on = bt.classList.contains('on'); if (!fx) return; $$('.tkb', w).forEach(x => x.classList.remove('on')); if (on) { fx.hidden = true; return; } bt.classList.add('on'); const [n, ef] = tkInfo(k); fx.innerHTML = `<b>${H(n)}</b><span>${H(ef)}</span>`; fx.hidden = false; });
/* datacard recortada: se apilan los tramos con contenido de la carta real (cabecera, armas, reglas, pie) sin el hueco en blanco */
const H_ = x => String(x).replace(/"/g, '%22');
function dcHTML(o) { // recorte con <img> (así el cargador de paquetes del artefacto resuelve la imagen)
  const L = DC[o.id]; if (!L) return '';
  return L.map(([u, x0, x1, W, H, r]) => { const w = x1 - x0, h = r.reduce((a, p) => a + p[1] - p[0], 0), im = H_(IMGU(u));
    return `<div class="dcrop" style="aspect-ratio:${w}/${h}">${r.map(([a, b]) => { const ph = b - a; return `<i style="flex:${ph} 0 0"><img src="${im}" alt="" draggable="false" style="width:${(W / w * 100).toFixed(3)}%;height:${(H / ph * 100).toFixed(3)}%;left:${(-x0 / w * 100).toFixed(3)}%;top:${(-a / ph * 100).toFixed(3)}%"></i>`; }).join('')}</div>`; }).join('');
}
function opMods(o) { const m = []; const a = E.effApl(o), mv = E.effMove(o); if (a !== o.apl) m.push(`LPA ${o.apl}→<b>${a}</b>`); if (mv !== o.move) m.push(`MOV ${o.move}"→<b>${mv}"</b>`); return m.length ? `<div class="dcmods">${m.join(' · ')}</div>` : ''; }
function opCardDC(o) { // la información de la unidad ES el recorte de su datacard; debajo, solo el estado vivo (heridas, órdenes, efectos)
  const pct = o.w / o.W * 100, crop = dcHTML(o); if (!crop) return '';
  return `<div class="opcard dc"><div class="dcst"><div class="wbar ${E.injured(o) ? 'low' : ''}"><i style="width:${pct}%"></i></div><span class="dcw">${o.w}/${o.W}</span><span class="pill" style="color:${COL[o.p]}">J${o.p + 1}</span><button class="btn ghost small" data-card="${o.i}" aria-label="Ver carta original de ${H(G.names[o.i])}">Carta</button></div>${opTokChips(o)}<div class="dcsub">${E.injured(o) ? 'HERIDO · ' : ''}${o.stun > 0 ? 'ATURDIDO · ' : ''}${o.order === 'engage' ? 'Trabarse' : 'Ocultarse'}${o.guard ? ' · EN GUARDIA' : ''}${o.frz ? ' · FRENESÍ' : ''}${o.pain > 0 ? ' · DOLOR ' + o.pain : ''}${o.drug ? ' · ' + E.DRUG_N[o.drug].toUpperCase() : ''}${o.bdTP === G.s.tp ? ' · BRUTAL DISPLAY' : ''}${(o.gr0 || 0) + (o.gr1 || 0) ? ` · RENCOR ×${(o.gr0 || 0) + (o.gr1 || 0)}` : ''}${(o.xf0 || 0) + (o.xf1 || 0) ? ` · FUEGO CRUZADO ×${(o.xf0 || 0) + (o.xf1 || 0)}` : ''}</div>${opMods(o)}<div class="pcdb"><div class="odb">${opTokSide(o)}<div class="cards one odc1">${crop}</div></div><div class="tkfx pctkfx" hidden></div></div></div>`;
}
function opCard(o, full) {
  if (full) { const dc = opCardDC(o); if (dc) return dc; }
  const pct = o.w / o.W * 100;
  return (full && (!MOB() || ordChoice(o)) ? opImgRow(o) : '') + `<div class="opcard"><h4><span>${H(G.names[o.i])}</span><span style="display:flex;gap:8px;align-items:center"><button class="btn ghost small" data-card="${o.i}" aria-label="Ver carta original de ${H(G.names[o.i])}">Carta</button><span class="pill" style="color:${COL[o.p]}">J${o.p + 1}</span></span></h4>
  <div class="wbar ${E.injured(o) ? 'low' : ''}"><i style="width:${pct}%"></i></div>${opTokChips(o)}<div style="font-size:12px;color:var(--mut);margin-top:3px">${o.w}/${o.W} heridas ${E.injured(o) ? '· HERIDO' : ''} ${o.stun > 0 ? '· ATURDIDO' : ''} · ${o.order === 'engage' ? 'Trabarse' : 'Ocultarse'}${o.guard ? ' · EN GUARDIA' : ''}${o.frz ? ' · FRENESÍ' : ''}${o.pain > 0 ? ' · DOLOR ' + o.pain : ''}${o.drug ? ' · ' + E.DRUG_N[o.drug].toUpperCase() : ''}${o.bdTP === G.s.tp ? ' · BRUTAL DISPLAY' : ''}${(o.gr0 || 0) + (o.gr1 || 0) ? ` · RENCOR ×${(o.gr0 || 0) + (o.gr1 || 0)}` : ''}${(o.xf0 || 0) + (o.xf1 || 0) ? ` · FUEGO CRUZADO ×${(o.xf0 || 0) + (o.xf1 || 0)}` : ''}</div>
  <div class="stats"><div><b>${E.effApl(o)}</b><span>APL</span></div><div><b>${E.effMove(o)}"</b><span>MOV</span></div><div><b>${o.save}+</b><span>SAVE</span></div><div><b>${o.W}</b><span>HER</span></div></div>
  ${full ? `<details class="wdet" ${MOB() ? '' : 'open'}><summary>Armas (${o.weapons.length})</summary><table class="weap"><tr><th>Arma</th><th>A</th><th>I</th><th>D</th><th>Reglas</th></tr>${o.weapons.map(w => `<tr><td>${w.m ? '⚔ ' : '◎ '}${H(w.n)}</td><td>${w.atk}</td><td>${w.hit}+</td><td>${w.d}/${w.cd}</td><td>${H(w.wr || '—')}</td></tr>`).join('')}</table></details>` : ''}
  </div>`;
}
function renderAct() {
  const s = G.s, el = $('#pAct'); let h = '';
  if (s.bz && !s.over) { const v = viewer(); h += `<div class="row"><button class="btn small" id="bzOpen">🂠 Cartas Sangre/Fervor · mano ${s.bz.hand[v].length} · rival ${s.bz.hand[1 - v].length}</button></div>`; }
  const my = isLocal(actor(s)) && !s.over && !(G.mode === 'ai' && actor(s) !== G.me);
  if (s.pend && my) {
    if (s.pend.kind === 'imp') {
      if (s.pend.stage === 'upg' || s.pend.stage === 'pat') { const o = s.ops[s.pend.op], up = s.pend.stage === 'upg', key = up ? 'upg' : 'pat', cur = o[key] || []; const kws = (o.kw || []).join('|'); const LL = [['nomad', 'Ejecutor nómada', 'Al Esprintar puede Disparar a mitad de la acción (VELOCIDAD previa) y seguir con la distancia restante'], ['elus', 'Fantasma esquivo', 'Al final de cada fase de tiroteo, Correr o Girar gratis (hasta 3")'], ['fate', 'Disparo predestinado', 'Una vez por PI al disparar con su rifle largo: no obscurecido / ignora control aliado'], ['nexus', 'Centinela del nexo', 'Una vez por PI, Guardia con VELOCIDAD 3-; sin penalizar el disparo a quemarropa'], ['glo', 'Manto crepuscular', 'Disparado a más de 8": un dado de defensa retenido / cobertura crítica']]; const LS = [['wail', 'Lamentos del mundo', 'Acción 1PA: -2 pulg. de MOV a un enemigo visible y a los cercanos'], ['clean', 'Purificación de la Luna Pálida', 'Acción 1PA: quita un efecto a un aliado visible'], ['sow', 'Sembrar las semillas', 'Una vez por PI: controla/disputa un marcador con APL 1'], ['wind', 'Gracia del viento', 'Acción 1PA: un aliado visible tiene VELOCIDAD +1'], ['wrath', 'Ira de la tierra', 'Arma a distancia Ira de la tierra (4 ATQ, 3+, 4/3)']]; const L = up ? (/LEYSTALKER/.test(kws) ? LL : /STONESINGER/.test(kws) ? LS : [['spear', 'Punta de lanza del clan', 'VELOCIDAD 4+: +1 de daño en el primer golpe normal; VELOCIDAD 7+: +1 al Daño normal en cuerpo a cuerpo'], ['stance', 'Postura afilada', 'Con las moonblades resuelve un éxito de bloqueo antes del orden normal'], ['refl', 'Reflejo concentrado', 'Al ser disparado a ≤6", 1 de daño al tirador por cada crítico asignado a bloquear'], ['nimb', 'Nimbo espectral', 'Una vez por PI, al combatir/replicar el rival no retiene como críticos resultados <6'], ['moon', 'Canto de la luna cazadora', 'Tras Esprintar adelante e incapacitar a un enemigo, fuera de su zona de control: Esprintar gratis adelante con la distancia restante (sin pivotar)']]) : [['agr', 'Agresivo', 'Armas cuerpo a cuerpo con Implacable'], ['vel', 'Veloz', '+2" de MOV'], ['def', 'Defensivo', 'Salvación mejorada en 1']]; h += `<h3>${up ? 'Mejoras de Clanblade' : 'Patrón de ataque'}</h3><p class="hint">Elige ${up ? 'hasta dos mejoras distintas' : 'dos patrones'} para <b>${H(G.names[s.pend.op])}</b> (${cur.length}/2).</p><div class="acts">` + L.filter(x => !cur.includes(x[0])).map(x => `<button class="btn" data-pend='${JSON.stringify({ t: s.pend.stage, v: x[0] })}'>${x[1]}<small>${x[2]}</small></button>`).join('') + (up && cur.length ? `<button class="btn" data-pend='${JSON.stringify({ t: 'upg', v: 'done' })}'>Terminar (${cur.length} elegida${cur.length > 1 ? 's' : ''})</button>` : '') + `</div>`; } else
      if (s.pend.stage === 'mark') h += `<h3>Marcas del Caos</h3><p class="hint">Elige la marca para <b>${H(G.names[s.pend.op])}</b>.</p><div class="acts">` + Object.keys(E.MARKS).map(k => `<button class="btn" data-pend='${JSON.stringify({ t: 'mark', v: k })}'>${E.MARKS[k]}<small>${E.MARK_TXT[k]}</small></button>`).join('') + `</div>`;
      else if (s.pend.stage === 'adapt') { h += `<h3>Tácticas adaptativas</h3><p class="hint">Nueva TÁCTICA DE CAPÍTULO secundaria hasta el final del PI.</p><div class="acts">`; for (const k of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'adapt', v: k })}' title="${H(E.CT_TXT[k] || '')}">${H(E.CT[k])}</button>`; h += '</div>'; }
      else if (s.pend.stage === 'plc') { h += `<h3>${H(s.pend.title)}</h3><p class="hint">Pulsa «Colocar» y toca un punto del mapa.</p><div class="acts"><button class="btn" data-plc="1">Colocar</button>${s.pend.k === 'fmv' && E.plcReach(s).cells.length === 0 ? '<button class="btn" data-plcskip="1">Sin destino válido: omitir</button>' : ''}</div>`; }
      else if (s.pend.stage === 'gch' && s.pend.note) { h += `<h3>Aviso</h3><p class="hint">El juego va a aplicar automáticamente:</p><ul class="notes">` + s.pend.note.map(x => `<li>${H(x)}</li>`).join('') + `</ul><div class="acts"><button class="btn" data-pend='${JSON.stringify({ t: 'gch', v: 1 })}'>OK</button></div>`; showNote(s.pend); }
      else if (s.pend.stage === 'gch') { if (/^expl/.test(s.pend.k || '')) { h += `<h3>Paso 4 · Explorar</h3><p class="hint">Último paso de «Montar la batalla», justo después de desplegar a todos los agentes. Elige en la ventana con las cartas.</p><div class="acts"><button class="btn" id="exOpen">Abrir las cartas de Explorar</button></div>`; showExplore(s.pend); } else h += `<h3>${H(s.pend.title)}</h3><div class="acts">` + s.pend.opts.map(x => `<button class="btn" data-pend='${JSON.stringify({ t: 'gch', v: x.v })}'>${H(x.l)}</button>`).join('') + '</div>'; }
      else if (s.pend.stage === 'nbord') { h += `<h3>${s.pend.id === 'attack' ? 'Orden de ataque' : s.pend.id === 'sweep' ? 'Barrido de limpieza' : 'Orden de defensa'}</h3><p class="hint">Coloca el marcador. Se retira en la siguiente fase de estrategia.</p><div class="acts">`; s.pend.spots.forEach((sp, i) => { h += `<button class="btn" data-pend='${JSON.stringify({ t: 'nbord', v: i })}'>${H(sp.lab.startsWith('op') ? 'Junto a ' + G.names[+sp.lab.slice(2)] : sp.lab)}</button>`; }); h += '</div>'; }
      else if (s.pend.stage === 'mtac') { h += `<h3>Tácticas de misión</h3><p class="hint">Elige la orden: contra enemigos con ella, las armas de los DEATHWATCH tienen Equilibrada este PI.</p><div class="acts"><button class="btn" data-pend='${JSON.stringify({ t: 'mtac', v: 'conceal' })}'>Ocultarse</button><button class="btn" data-pend='${JSON.stringify({ t: 'mtac', v: 'engage' })}'>Trabarse</button></div>`; }
      else if (s.pend.stage === 'hfocus') { h += `<h3>Haunting Focus (DIRGEMAW)</h3><p class="hint">Gambito: el enemigo elegido gana la ficha; la próxima vez que tu rival vaya a activarlo, si el DIRGEMAW está listo se activa antes y debe dispararle o combatirle primero.</p><div class="acts">`; for (const i of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'hfocus', v: i })}'>${H(G.names[i])}</button>`; h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'hfocus', v: null })}'>No</button></div>`; }
      else if (s.pend.stage === 'engin') { h += `<h3>Engineered — ${H(G.names[s.pend.op])}</h3><p class="hint">Elige hasta dos mejoras para sus Fleshmelded weapons (llevas ${(s.ops[s.pend.op].engN || 0)}).</p><div class="acts">`; for (const k of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'engin', v: k })}'>${H(E.ENGIN[k])}</button>`; h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'engin', v: null })}'>Terminar</button></div>`; }
      else if (s.pend.stage === 'boon') { h += `<h3>Don de Tzeentch — ${H(G.names[s.pend.op])}</h3><p class="hint">Cada SORCERER tiene un Don distinto para la batalla.</p><div class="acts">`; for (const k of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'boon', v: k })}' title="${H(E.BOON_TXT[k])}">${H(E.BOON[k])}</button>`; h += '</div>'; }
      else if (s.pend.stage === 'tc') { h += `<h3>TECHNO-CURSE</h3><p class="hint">Elige el TECHNO-CURSE de tus GELLERPOX para la batalla.</p><div class="acts">`; for (const k of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'tc', v: k })}' title="${H(E.TC_TXT[k])}">${H(E.TC[k])}</button>`; h += '</div>'; }
      else if (s.pend.stage === 'saed') { const V = s.vd[s.pend.p]; h += `<h3>Saedath</h3><p class="hint">${!V.al ? 'Elige la ALEGORÍA del equipo y el agente con el PAPEL PRINCIPAL. Épica: al combatir, sus armas de combate tienen Equilibrada (actuación: incapacitar combatiendo). Melodrama: sus armas a distancia tienen Equilibrada (actuación: incapacitar disparando). Cada vez que el PAPEL PRINCIPAL completa la actuación (una vez por PI), otro VOID-DANCER gana el Galardón.' : `Alegoría: ${V.al === 'epic' ? 'Épica' : 'Melodrama'}. Puedes dar el Galardón a otro VOID-DANCER.`}</p><div class="acts">`; if (V.al && !V.ltp && s.ops.some(l => l.alive && l.p === s.pend.p && hasKwA(l, 'LEAD PLAYER'))) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'saed', swap: true })}'>Lead the Performance (una vez por batalla): cambiar a ${V.al === 'epic' ? 'Melodrama' : 'Épica'}</button>`;
        for (const i of s.pend.ops) { if (!V.al) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'saed', al: 'epic', v: i })}'>Épica · ${H(G.names[i])}</button><button class="btn" data-pend='${JSON.stringify({ t: 'saed', al: 'melo', v: i })}'>Melodrama · ${H(G.names[i])}</button>`; else h += `<button class="btn" data-pend='${JSON.stringify({ t: 'saed', v: i })}'>${H(G.names[i])}</button>`; }
        if (V.al) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'saed', v: null })}'>No</button>`; h += '</div>'; }
      else if (s.pend.stage === 'bzd') { const B = s.bz; h += `<h3>Robar una carta</h3><p class="hint">Sangre (ofensiva): ${B.deck.b.length} en el mazo · Fervor (defensiva): ${B.deck.z.length}. No puedes ver la carta antes de robarla${E.bzCtl(s) === s.pend.p ? ' (controlas la estatua: podrás mirar una antes)' : ''}.</p><div class="acts">`; for (const [k, n] of [['b', 'Sangre'], ['z', 'Fervor']]) if (B.deck[k].length) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bzd', v: k })}'>${n} (${B.deck[k].length})</button>`; h += '</div>'; }
      else if (s.pend.stage === 'bzl') { const x = E.BZ[s.pend.look]; h += `<h3>Estatua: miras una carta</h3><img alt="" src="img/bz_${s.pend.look}.webp" style="width:110px;float:right;margin:0 0 4px 8px;border-radius:6px"><p><b>${H(x.n)}</b> (${x.t === 'b' ? 'Sangre' : 'Fervor'})</p><p class="hint">${H(x.d)}</p><div class="acts"><button class="btn" data-pend='${JSON.stringify({ t: 'bzd', v: 'take' })}'>Robar esta carta</button><button class="btn ghost" data-pend='${JSON.stringify({ t: 'bzd', v: 'other' })}'>Robar otra (sin mirarla)</button></div>`; }
      else if (s.pend.stage === 'bzp') { const B = s.bz, p = s.pend.p; h += `<h3>Praise / Blaspheme</h3><p class="hint">Baraja una carta de tu mano, o dos de tus descartadas (ojo: cuentan para los PV finales), y roba una carta.</p><div class="acts">`; for (const id of B.hand[p]) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bzp', h: id })}'>Mano: ${H(E.BZ[id].n)}</button>`; const d = B.disc[p].slice(-5); for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'bzp', d: [d[i], d[j]] })}'>Descartadas: ${H(E.BZ[d[i]].n)} + ${H(E.BZ[d[j]].n)}</button>`; h += '</div>'; }
      else if (s.pend.stage === 'bze') { const st = s.pend.ph === 'start'; h += `<h3>${st ? 'Acción gratuita inicial' : 'Acción gratuita final'}</h3><p class="hint">Un agente tuyo hace una acción gratuita (máx. 2" de movimiento). Puedes cambiar su orden.</p><div class="acts">`; for (const i of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bze', v: i, ord: 'engage' })}'>${H(G.names[i])} · Trabarse</button><button class="btn ghost" data-pend='${JSON.stringify({ t: 'bze', v: i, ord: 'conceal' })}'>${H(G.names[i])} · Ocultarse</button>`; h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'bze', v: null })}'>No usar la carta</button></div>`; }
      else if (s.pend.stage === 'ccg') { h += `<h3>Don Maldito (${s.pend.slot === 'pri' ? 'primario' : 'secundario'})</h3><div class="acts">`; for (const k of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ccg', v: k })}' title="${H(E.CC_GIFT_TXT[k] || '')}">${H(E.CC_GIFTS[k])}</button>`; h += '</div><p class="hint">' + s.pend.ops.map(k => H(E.CC_GIFTS[k] + ': ' + (E.CC_GIFT_TXT[k] || ''))).join('<br>') + '</p>'; }
      else if (s.pend.stage === 'ccm') { h += `<h3>Mutación (quedan ${s.pend.n})</h3><p class="hint">Elige un agente CHAOS CULT: transformarlo (DEVOTEE→MUTANT→TORMENT) o curarle 1D3+1.</p><div class="acts">`; for (const i of s.pend.ops) for (const k of E.ccOpts(s, s.ops[i])) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ccm', v: i, k })}'>${H(G.names[i])} · ${k === 'turn' ? 'transformar' : 'curar'}</button>`; h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ccm', v: null })}'>Terminar</button></div>`; }
      else if (s.pend.stage === 'ccs') { h += `<h3>Baleful Script</h3><p class="hint">Cambia un Don Maldito (una vez por batalla).</p><div class="acts">`; for (const v of s.pend.ops) { const [sl, g] = v.split('>'); h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ccs', v })}'>${sl === 'pri' ? 'Primario' : 'Secundario'} → ${H(E.CC_GIFTS[g])}</button>`; } h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ccs', v: null })}'>No usar</button></div>`; }
      else if (s.pend.stage === 'writhe') { h += `<h3>Escabullirse de la vista</h3><p class="hint">Elige el RAVENER que hace una Madriguera gratis (si está a ≤2" del TÚNEL, antes se mueve sobre él).</p><div class="acts">`; for (const i of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'writhe', v: i })}'>${H(G.names[i])}</button>`; h += '</div>'; }
      else if (s.pend.stage === 'rtd') { h += `<h3>Regreso a la oscuridad</h3><p class="hint">Elige el NEMESIS CLAW que se retira a las sombras (máx. 4", sin acercarse a enemigos, junto a terreno Pesado o bajo Vantage).</p><div class="acts">`; for (const i of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'rtd', v: i })}'>${H(G.names[i])}</button>`; h += '</div>'; }
      else if (s.pend.stage === 'spdis') { h += `<h3>Disappear</h3><p class="hint">Elige el SPECTRE y su destino: Reposicionarse gratis sin acabar más cerca de enemigos ni de su zona de despliegue (salvo dentro de la tuya).</p><div class="acts">`; for (const i of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'spdis', v: i, fmv: { who: i, mx: s.ops[i].move, kind: 'rep' } })}'>${H(G.names[i])}</button>`; h += '</div>'; }
      else if (s.pend.stage === 'regroup') { h += `<h3>Reagruparse</h3><p class="hint">Elige el DEATH KORPS hacia el que se reagrupan los demás (a ≤5" de él y fuera de zona de control enemiga, Corren gratis acabando más cerca).</p><div class="acts">`; for (const i of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'regroup', v: i })}'>${H(G.names[i])} (${E.regroupMates(s, s.ops[i]).length})</button>`; h += '</div>'; }
      else if (s.pend.stage === 'hkm') { h += `<h3>${s.pend.id === 'need' ? 'La necesidad guarda' : s.pend.id === 'hum' ? 'Atraídos por el zumbido' : 'El esfuerzo gana'}</h3><p class="hint">Elige el marcador de objetivo de este ardid.</p><div class="acts">`; for (const i of s.pend.ops) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'hkm', v: i })}'>${i >= 1000 ? 'Marcador de misión ' + (({ banner: 'Estandarte', retr: 'Caja', intel: 'Información' })[(s.mm[i - 1000] || {}).k] || '') : 'Objetivo ' + (i + 1)}</button>`; h += '</div>'; }
      else if (s.pend.stage === 'denounce') h += `<h3>Denunciar</h3><p class="hint">Elige el agente enemigo denunciado: este PI no podrá activarse hasta ser el último o hasta que tu rival complete 1D3 activaciones.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'denounce', v: i })}'>${H(G.names[i])}</button>`).join('') + '</div>';
      else if (s.pend.stage === 'envoy') h += `<h3>Enviado</h3><p class="hint">Gambito estratégico: elige un agente amigo como enviado hasta la fase de estrategia siguiente (no uno ya elegido). Al final del PI: totalmente en territorio enemigo y fuera de zonas de control enemigas, 1 PV; 2 PV si no ha perdido heridas este PI.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'envoy', v: i })}'>${H(G.names[i])}</button>`).join('') + '</div>';
      else if (s.pend.stage === 'rb') h += `<h3>Reinicio</h3><p class="hint">Elige en secreto un marcador de objetivo. Si ambos elegís el mismo, ese queda inerte este punto de inflexión; si no, queda inerte el que nadie eligió. (En partidas en el mismo dispositivo, que el rival no mire.)</p><div class="acts">` + s.objs.map((_, i) => `<button class="btn" data-pend='${JSON.stringify({ t: 'rb', v: i })}'>Marcador ${i + 1}</button>`).join('') + '</div>';
      else if (s.pend.stage === 'claim') h += `<h3>Reclamar propiedad</h3><p class="hint">Elige un marcador (no repetido en la batalla) y una afirmación para el final de este punto de inflexión; si se cumple, +1 PV.</p><div class="acts">` + E.claimOpts(s, s.pend.p).map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'claim', ob: i, v: 'ctl' })}'>Marcador ${i + 1}: lo controlaré</button><button class="btn ghost" data-pend='${JSON.stringify({ t: 'claim', ob: i, v: 'nocont' })}'>Marcador ${i + 1}: el rival no lo disputará</button>`).join('') + '</div>';
      else if (s.pend.stage === 'art') { const u = s.artUsed[s.pend.p]; h += `<h3>Art of War</h3><p class="hint">Gambito del SHAS’UI (una vez cada opción por batalla): Mont’ka añade 1" al Movimiento de tus PATHFINDER; Kauyon permite un Markerlight gratis a los que tengan orden Conceal. Hasta el final del punto de inflexión.</p><div class="acts">` + [['mont', 'Mont’ka'], ['kauy', 'Kauyon'], ['none', 'Ninguna']].filter(x => !u.includes(x[0])).map(x => `<button class="btn" data-pend='${JSON.stringify({ t: 'art', v: x[0] })}'>${x[1]}</button>`).join('') + '</div>'; }
      else if (s.pend.stage === 'skill') h += `<h3>Habilidad con las armas</h3><p class="hint">${s.pend.second ? 'Veteran Leadership: elige una segunda habilidad distinta.' : 'Gambito: elige la habilidad de tus Kasrkin hasta la siguiente fase de estrategia.'}</p><div class="acts">` + Object.keys(E.SKILL).filter(k => !s.pend.second || k !== s.skill[s.pend.p]).map(k => `<button class="btn" data-pend='${JSON.stringify({ t: 'skill', v: k })}'>${E.SKILL[k]}<small>${E.SKILL_TXT[k]}</small></button>`).join('') + `</div>`;
      else if (s.pend.stage === 'ord') h += `<h3>Órdenes de guardia</h3><p class="hint">Gambito del Watchmaster: elige una orden para tus Death Korps a ≤6" de él (hasta el final del punto de inflexión).</p><div class="acts">` + (E.feqOn(s, s.pend.p, 'beads') ? `<label style="width:100%">Comm-beads: <select id="ordOne"><option value="">a todos a ≤6"</option>${s.ops.filter(o => o.alive && o.p === s.pend.p).map(o => `<option value="${o.i}">solo a ${H(G.names[o.i])}</option>`).join('')}</select></label>` : '') + Object.keys(E.ORD).map(k => `<button class="btn" data-pend='${JSON.stringify({ t: 'ord', v: k })}'>${E.ORD[k]}<small>${E.ORD_TXT[k]}</small></button>`).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'ord', v: null })}'>No dar orden</button></div>`;
      else if (s.pend.stage === 'ct') h += `<h3>Tácticas de capítulo</h3><p class="hint">Elige la táctica ${s.ct[s.pend.p].length ? 'secundaria' : 'primaria'} de tus Angels of Death.</p><div class="acts">` + Object.keys(E.CT).filter(k => !s.ct[s.pend.p].includes(k)).map(k => `<button class="btn" data-pend='${JSON.stringify({ t: 'ct', v: k })}'>${E.CT[k]}<small>${E.CT_TXT[k]}</small></button>`).join('') + `</div>`;
      else if (s.pend.stage === 'gam') h += `<h3>Gambitos de ardid</h3><p class="hint">Ardides de estrategia (1 PC, activos todo el punto de inflexión). Tienes ${s.cp[s.pend.p]} PC.</p><div class="acts">` + E.availPloys(s, s.pend.p).map(x => `<button class="btn" data-pend='${JSON.stringify({ t: 'gam', id: x.id })}'>${x.n}<small>${x.t}</small></button>`).join('') + `<button class="btn" id="gamDeck">Ver las cartas</button><button class="btn ghost" data-pend='${JSON.stringify({ t: 'gam', id: null })}'>Pasar</button></div>`;
      else if (s.pend.stage === 'tun') h += `<h3>Túnel</h3><p class="hint">Gambito: coloca el marcador de Túnel nº ${s.tun[s.pend.p].length} a ≤5" del anterior (se muestran las direcciones posibles).</p><div class="acts">` + E.tunnelPicks(s, s.pend.p).map((c, i) => `<button class="btn" data-pend='${JSON.stringify({ t: 'tun', x: c.x, y: c.y })}' onmouseenter="0">Marcador → (${c.x.toFixed(0)}, ${c.y.toFixed(0)})</button>`).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'tun', skip: true })}'>No colocar</button></div>`;
      else if (s.pend.stage === 'syn') h += `<h3>Vínculo sináptico</h3><p class="hint">Gambito del Prime: tira un D6 y compara con el nº del punto de inflexión. El doble o más: +1 PC. Menos: el Prime sufre ese daño. Otro resultado: nada.</p><div class="acts"><button class="btn" data-pend='${JSON.stringify({ t: 'syn', v: true })}'>Usar Vínculo sináptico</button><button class="btn ghost" data-pend='${JSON.stringify({ t: 'syn', v: false })}'>No usar</button></div>`;
      else {
      const pr = s.pend.stage === 'prim';
      h += `<h3>Imperativos de Doctrina</h3><p class="hint">${pr ? 'Elige el <b>Modo primario</b> de tu equipo para toda la batalla. Una vez por batalla, al elegir ese Imperativo como gambito, ignoras su Deprecación.' : 'Gambito estratégico: elige el Imperativo vigente hasta la siguiente fase de estrategia. Optimización y Deprecación están ambas activas.'}</p><div class="acts">` + Object.keys(E.IMPS).map(k => `<button class="btn" data-pend='${JSON.stringify({ t: 'imp', v: k })}'>${E.IMPS[k]}${!pr && s.prim[s.pend.p] === k ? ' ★' : ''}<small>＋ ${E.IMP_TXT[k][0]} ／ － ${E.IMP_TXT[k][1]}</small></button>`).join('') + `</div>`; }
    } else if (s.pend.kind === 'eqp') {
      const U = G.ui, cur = s.pend.pcs.find(c => c.n === U.eqpN); h += `<h3>Desplegar piezas de equipo</h3><p class="hint">Se despliegan pieza a pieza, alternando. Elige una pieza y toca una casilla verde (en tu territorio y a más de 2" de otro terreno de equipo).</p><div class="acts">` + s.pend.pcs.map(c => `<button class="btn ${U.eqpN === c.n ? 'on' : ''}" data-eqp="${c.n}">${H(c.label)}</button>`).join('') + `</div>` + (cur ? `<div class="acts">${cur.kind === 'bar' ? '<button class="btn" data-eqprot="1">Girar</button>' : ''}${U.pending ? '<button class="btn" data-eqpok="1">Confirmar posición</button>' : ''}<button class="btn ghost" data-pend='${JSON.stringify({ t: 'eqp', n: cur.n })}'>Dejar donde está</button></div>` : '');
    } else if (s.pend.kind === 'dply') {
      const U = G.ui; h += `<h3>Desplegar agentes</h3><p class="hint">Te quedan ${s.pend.left} agentes por desplegar en este turno (un tercio del comando, redondeando al alza). Elige un agente y toca una casilla verde: debe quedar completamente dentro de tu zona de descenso y con orden de Ocultarse.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn ${U.dplyOp === i ? 'on' : ''}" data-dply="${i}">${H(G.names[i])}</button>`).join('') + `</div>` + (s.team[s.pend.p] === 'wyrmblade' && s.ops.some(q => q.p === s.pend.p && q.hid) ? `<p class="hint">Territorio familiar: elige qué agentes empiezan en HIDING (un tercio; los CULT AGENT no pueden).</p><div class="acts">` + s.pend.ops.filter(i => !s.ops[i].kw.includes('CULT AGENT')).map(i => `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'hidesw', op: i })}'>${H(G.names[i])} → HIDING</button>`).join('') + `</div>` : '') + (U.mode === 'deploy' && U.dplyOp != null ? `<div class="acts">${U.pending ? '<button class="btn" data-dplyok="1">Confirmar posición</button><button class="btn ghost" data-dplysnap="1">Pegar al terreno</button>' : ''}<button class="btn ghost" data-pend='${JSON.stringify({ t: 'dply', op: U.dplyOp })}'>Dejar en la casilla sugerida</button></div>` : '');
    } else if (s.pend.kind === 'pprim') {
      h += `<h3>Gambito estratégico: operación principal</h3><p class="hint">Elige en secreto una de tus tres operaciones como principal. Al final de la batalla obtendrás PV adicionales iguales a la mitad de los que hayas obtenido por ella (redondeando al alza).</p><div class="acts">` + [['crit', 'Crítica'], ['kill', 'Asesinato'], ['tac', 'Táctica']].map(([k, n]) => `<button class="btn" data-pend='${JSON.stringify({ t: 'pprim', v: k })}'>${n}</button>`).join('') + `</div>`;
    } else if (s.pend.kind === 'exprep') {
      h += `<h3>Explorar: Reposicionar</h3><p class="hint">Acción libre de Reposicionarse con un agente amigo completamente dentro de tu zona de descenso. Debe terminar a 3" o menos de ella. Elige el agente y luego su destino.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'exprep', op: i })}'>${H(G.names[i])}</button>`).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'exprepx' })}'>No reposicionar</button></div>`;
    } else if (s.pend.kind === 'seize') {
      h += `<h3>Seize the Initiative</h3><p class="hint">Inicio de la fase de tiroteo: por 1 PC, un KASRKIN hace una acción gratuita de 1 PA sin mover.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'seize', op: i })}'>${H(G.names[i])}</button>`).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'spass' })}'>No usar</button></div>`;
    } else if (s.pend.kind === 'quarry') {
      h += `<h3>Presa</h3><p class="hint">Designa a un enemigo como tu presa durante este punto de inflexión: tus INQUISITORIAL AGENT tendrán Incesante contra ella.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'quarry', tg: i })}'>${H(G.names[i])}</button>`).join('') + `</div>`;
    } else if (s.pend.kind === 'worthy') {
      h += `<h3>A Worthy Cause</h3><p class="hint">Inicio de la fase de tiroteo: por 1 PC, un PATHFINDER (no DRONE) hace una acción de misión gratuita.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'worthy', op: i })}'>${H(G.names[i])}</button>`).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'wpass' })}'>No usar</button></div>`;
    } else if (s.pend.kind === 'scarper') {
      h += `<h3>Scarper</h3><p class="hint">Tras la activación enemiga: un RATLING (no BULLGRYN, OGRYN ni SNEAK) puede hacer un Correr gratis (una vez por PI cada uno); no puede acabar a ≤3" de un enemigo salvo que ningún enemigo lo vea.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'scarper', op: i })}'>${H(G.names[i])}</button>`).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'scpass' })}'>No usar</button></div>`;
    } else if (s.pend.kind === 'bcnet') {
      h += `<h3>Network Counteract</h3><p class="hint">Tras Transfer Power: un SERVITOR no listo y no contrarrestado hace una acción de 1 PA, con orden elegida.</p><div class="acts">` + s.pend.ops.map(i => ['engage', 'conceal'].map(od => `<button class="btn" data-pend='${JSON.stringify({ t: 'bcnet', op: i, order: od })}'>${H(G.names[i])} (${od === 'engage' ? 'Enfrentar' : 'Ocultar'})</button>`).join('')).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'bcpass' })}'>No usar</button></div>`;
    } else if (s.pend.kind === 'insid') {
      h += `<h3>Insidious</h3><p class="hint">Tras una activación: por 1 PC, un BROOD BROTHER que no es blanco válido hace un Correr gratis y debe terminar también oculto.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'insid', op: i })}'>${H(G.names[i])}</button>`).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'ipass2' })}'>No usar</button></div>`;
    } else if (s.pend.kind === 'krump') {
      h += `<h3>Krump 'Em!</h3><p class="hint">Fin de la fase de tiroteo: por 1 PC, un KOMMANDO en zona de control hace una acción gratuita de Combatir.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'krump', op: i })}'>${H(G.names[i])}</button>`).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'kpass' })}'>No usar</button></div>`;
    } else if (s.pend.kind === 'react') {
      h += `<h3>Reaccionar</h3><p class="hint">A tu oponente aún le quedan agentes apostados y a ti no. Un agente usado con orden de Trabarse puede hacer gratis una acción de 1 PA (máx. 2" de movimiento). Cada agente solo reacciona una vez por punto de inflexión.</p><div class="acts">` + s.pend.ops.map(i => `<button class="btn" data-pend='${JSON.stringify({ t: 'react', op: i })}'>${H(G.names[i])}</button>`).join('') + `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'rpass' })}'>No reaccionar</button></div>`;
    } else {
      const act = s.ops[s.act.op]; h += `<h3>Interrumpir desde la guardia</h3><p class="hint">${H(G.names[act.i])} ha actuado. Interrumpe con un agente en guardia (acción gratis, una vez por activación). A bocajarro: Impactar −1 y sin contraataque.</p><div class="acts">`;
      for (const gi of s.pend.ops) for (const op of E.guardOptions(s, s.ops[gi])) { const w = s.ops[gi].weapons[op.wi]; h += `<button class="btn" data-pend='${JSON.stringify({ t: 'intr', op: gi, k: op.k, tg: op.tg, wi: op.wi })}'>${op.k === 'fight' ? 'Combatir' : op.pb ? 'Disparar a bocajarro' : 'Disparar'} · ${H(w.n)}<small>${H(G.names[gi])} → ${H(G.names[op.tg])} · ${Math.round(Math.hypot(s.ops[gi].x - s.ops[op.tg].x, s.ops[gi].y - s.ops[op.tg].y))}"${(() => { try { const ex = op.k === 'fight' ? E.expectedFight(s, s.ops[gi], w, s.ops[op.tg]) : E.expectedShoot(s, s.ops[gi], w, s.ops[op.tg]); return typeof ex === 'number' ? ' · ≈' + ex.toFixed(1) + ' daño' : ''; } catch (e) { return ''; } })()}</small></button>`; }
      h += `</div><div class="acts" style="margin-top:14px"><button class="btn ghost wide" data-pend='${JSON.stringify({ t: 'ipass' })}'>No interrumpir</button></div>`;
    }
  } else if (s.act) {
    const o = s.ops[s.act.op]; h += (MOB() && !LAND()) ? `<details class="opdet"><summary><b>${H(G.names[o.i])}</b> · ${o.w ?? o.wounds ?? ''} · ficha ▾</summary>${opCard(o, true)}</details>` : opCard(o, true);
    if (my) {
      const acts = E.opActions(s); const ap = '●'.repeat(Math.max(0, s.act.ap)) + '○'.repeat(Math.max(0, E.effApl(o) - s.act.ap));
      h += `<div style="margin:4px 0 8px;color:var(--acc2);font-weight:700;letter-spacing:.2em">PA ${ap}</div><div class="acts">`;
      const lab = { spr: ['Esprintar', '0 PA · tramos rectos adelante (máx. 9") / atrás (máx. 3") con pivotes ≤45°; 12" por PI'], turn: ['Girar', '0 PA · pivota hasta 45°'], repj: ['Reposicionarse con IMPULSO', '1 PA · Mochila de salto: tramo a pie + salto de X" (suma al movimiento)'], fbj: ['Retroceder con IMPULSO', '2 PA · Mochila de salto'], chgj: ['Cargar con IMPULSO', '1 PA · Mochila de salto (movimiento máx. 6")'], breach: ['Brecha', '2 PA (1 con «breach marker»/Piercing 2) · abrir muro de brecha'], scout: ['Explorar sala', '1 PA · reduce la amenaza al grado inferior (Explorar subcripta)'], tydrone: s.ty === 4 ? ['Colocar designador', '1 PA · marca un nido de cría (Q) o montículo (R) que controles; no en el 1.er PI ni en zona de control enemiga. En cada preparación recibe 2D6 de daño (y también todo agente a 2" o menos)'] : ['Desplegar dron de búsqueda', '1 PA · envía un dron por un nido de cría (Q) o montículo (R) que controles; no en el 1.er PI ni en zona de control enemiga. Hace tirar por la alarma'], shext: ['Extraer núcleo', '1 PA · llevas el marcador de Extracción y controlas el sarcófago sin NPO que lo disputen: −1 Integridad (una vez por PI, no en el 1.º)'], dvbcn: ['Colocar baliza', '1 PA · coloca una baliza a 3" o menos (lo más cerca posible del Red Terror): tras D6 activaciones, 2D6 de daño a todo agente a D6" o menos de ella, amigo o enemigo. Solo una baliza a la vez; no en zona de control enemiga'], njext: ['Coordinar extracción', '1 PA · si controlas el marcador: se sortea el borde de escape (no el vuestro); los agentes pueden salir por él estando totalmente en territorio NPO. No en el 1.er PI ni trabado; una vez por batalla'], abtap: ['Siphon Power', '1 PA · drena un marcador que controlas (+1 PV, máx. 2 PV por PI) y roba una carta del mazo del Intruso (no en el 1.er PI, ni en alcance de control enemigo)'], abpk: ['Recoger marcador Borewyrm', '1 PA · recoge un marcador Borewyrm a 1" (+1 PV al final si lo llevas)'], nopdem1: ['Demoler (1 PA)', '1 PA · tira 1D6: con 3+ se elimina del killzone un marcador que controlas (no en el 1.er PI ni en alcance de control enemigo)'], nopdem2: ['Demoler (2 PA)', '2 PA · tira 2D6: si alguno es 3+ se elimina un marcador que controlas'], nopdem3: ['Demoler (3 PA)', '3 PA · tira 3D6: si alguno es 3+ se elimina un marcador que controlas'], amel: ['Eliminar activos', '1 PA · el marcador de objetivo que controlas se retira del killzone (+1 PV para los jugadores); después se roba una carta del mazo del Intruso. No en el 1.er PI ni a alcance de control de un enemigo'], arpk: ['Recoger marcador', 'Recoges el marcador de objetivo (1 PA): no puedes Correr ni ser retirado y recolocado mientras lo lleves'], njsab: ['Sabotear nexo', '1 PA · un marcador que controlas queda saboteado hasta el final del PI: +1 PV; el tercer sabotaje del PI da 1 punto de sabotaje (descarta una carta de activación NPO). No en el 1.er PI, ni trabado, ni NÉMESIS'], dvsearch: ['Buscar', '1 PA · registra un marcador de objetivo que controles: se roba una carta de Búsqueda (puede ser una guarida, dar PC, hacer daño…). No en zona de control enemiga'], dvscan: ['Escanear al Red Terror', '1 PA · tira D6 y suma la distancia hasta el Red Terror: con 9 o menos el agente lleva un marcador de Escáner. El Red Terror debe ser un blanco válido; no en zona de control enemiga'], dvtun: ['Destruir túnel', '1 PA · destruye un marcador de objetivo que controles; aparece junto a él un Enjambre devorador (o un Termagant) herido. No en el 1.er PI ni en zona de control enemiga'], tybomb: ['Armar la bomba y descender', '1 PA · llevas la bomba, controlas el nido de cría (Q) y ningún NPO lo disputa: el agente desciende y ganáis. No en el 1.er PI ni en zona de control enemiga'], shpick: s.ty === 5 ? ['Recoger la bomba', '1 PA · quien la lleva no puede Cargar ni Correr y su Impacto empeora en 1'] : ['Recoger marcador de Extracción', '1 PA · quien lo lleva no puede Cargar ni Correr'], vault: ['Lanzarse por encima', '1 PA · Octarius: salto sobre un Montón de chatarra (escarpado)'], cvault: ['Cargar por encima', '1 PA · Octarius: carga sobre un Montón de chatarra (escarpado)'], tele_rep: ['Teletransporte', '1 PA · Reposicionarse a la otra plataforma'], tele_chg: ['Teletransporte (Cargar)', '1 PA · cargar desde la otra plataforma'], tele_fb: ['Teletransporte (Retirarse)', 'Retirarse a la otra plataforma'], storch: ['Skytorch Assault', '2 PA · volar +2" y lanzallamas'], flurry: ['Cleaver Flurry', '2 PA · Reposicionar +2" y 1D3+1'], shp: ['Paso de sombra', '1 PA · reaparecer en sombra'], rep2: ['Resto del movimiento', '0 PA · Andanada fugaz'], mwb: ['Moverse con barricada', '1 PA · M−2"'], rep: ['Reposición', '1 PA · mover'], dash: ['Carrera', '1 PA · 3"'], fb: ['Retirada', '2 PA · salir de combate'], chg: ['Cargar', '1 PA · mov+2"'], shoot: ['Disparar', '1 PA'], fight: ['Combatir', '1 PA'], guard: ['Ponerse en guardia', '1 PA · interrumpe'], hatch: ['Operar portillo', '1 PA · abrir/cerrar escotilla'], hfight: ['Combatir en escotilla', '1 PA · a través de una escotilla abierta'], hmv: ['Resto del movimiento', '0 PA · tras operar el portillo'], esc: ['Huir', '1 PA · salir por el borde enemigo'], mission: [E.MISSION_NAMES[s.crit], '1 PA · misión'], blink: ['Blink Pack', '1 PA · Reposicionar con salto warp ≤7"'], chgb: ['Cargar con Blink Pack', '1 PA · salto warp ≤7" que acaba en zona de control de un enemigo'], fbb: ['Retirarse con Blink Pack', 'PA de Retirarse · salto warp ≤7" fuera de zona de control'], burrow: [o.above ? 'Aterrizar (Drop Insertion)' : o.ug ? 'Emerger (Madriguera)' : 'Enterrarse (Madriguera)', o.above ? '0 PA · junto a un marcador de Caída' : '1 PA · Túnel'] }; try { E.setActLabels(Object.fromEntries(Object.entries(lab).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]))); } catch (er) { }
      for (const k of ['spr', 'turn', 'rep', 'repj', 'shp', 'blink', 'flurry', 'storch', 'rep2', 'mwb', 'dash', 'fb', 'fbj', 'fbb', 'chg', 'chgj', 'chgb', 'shoot', 'guard', 'fight', 'mission', 'burrow', 'esc', 'hatch', 'breach', 'scout', 'tydrone', 'tybomb', 'dvtun', 'dvscan', 'dvsearch', 'dvbcn', 'njsab', 'amel', 'arpk', 'njext', 'nopdem1', 'nopdem2', 'nopdem3', 'abtap', 'abpk', 'shext', 'shpick', 'tele_rep', 'tele_chg', 'tele_fb', 'hfight', 'hmv', 'vault', 'cvault']) { const tk = k.startsWith('tele_'); const jk = /^(rep|fb|chg)j$/.test(k); const MF = { scout: q => q.twp === 5, tydrone: q => q.ty === 1 || q.ty === 4, tybomb: q => q.ty === 5, dvtun: q => q.dv === 2, dvscan: q => q.dv === 3, dvsearch: q => !!q.dv, dvbcn: q => !!q.dv, njsab: q => q.nj === 1, amel: q => !!q.am1, arpk: q => !!q.ar, abtap: q => q.ao === 6, abpk: q => q.ao === 6, nopdem1: q => q.nopM === 4, nopdem2: q => q.nopM === 4, nopdem3: q => q.nopM === 4, njext: q => q.nj === 3, shext: q => !!q.shEx, shpick: q => !!q.shEx }; if (MF[k] && !acts.includes(k) && !MF[k](G.s)) continue; /* las acciones de misión solo salen en la misión que las usa */ if (jk && !(G.s.fx && G.s.team[G.s.ops[G.s.act.op].p] === 'murderwing' && acts.includes(k.slice(0, -1)))) continue; if (tk ? !(acts.includes('tele') && E.teleOpts(G.s, G.s.ops[G.s.act.op]).includes(k.slice(5))) : (k === 'breach' && !acts.includes('breach'))) continue; if (!tk && (k === 'esc' || k === 'vault' || k === 'cvault' || k === 'hatch' || k === 'hfight' || k === 'hmv' || k === 'burrow' || k === 'mwb' || k === 'rep2' || k === 'shp' || k === 'blink' || k === 'flurry' || k === 'storch' || k === 'spr' || k === 'turn') && !acts.includes(k)) continue; const on = tk || acts.includes(k) || (jk && acts.includes(k.slice(0, -1))); h += `<button class="btn ghost ${G.ui.mode === k ? 'on' : ''}" data-act="${k}" ${on ? '' : 'disabled'}>${lab[k][0]}<small>${lab[k][1]}</small></button>`; }
      if (acts.includes('signal')) { h += `<div class="hint" style="width:100%;margin-top:6px">Señal (1 PA): +1 PA al siguiente operativo amigo de Hunter Clade</div>`; for (const gi of E.signalTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'signal', tg: gi })}'>Señal → ${H(G.names[gi])}</button>`; }
      if (acts.includes('medikit')) { h += `<div class="hint" style="width:100%;margin-top:6px">Botiquín (1 PA): recupera 2D3 heridas</div>`; for (const gi of E.medikitTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'medikit', tg: gi })}'>Botiquín → ${H(G.names[gi])}</button>`; }
      if (acts.includes('wreathe')) { h += `<div class="hint" style="width:100%;margin-top:6px">Envolver en Balefire (1 PA): el objetivo visible recibe tu ficha</div>`; for (const gi of E.wreatheTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'wreathe', tg: gi })}'>Balefire → ${H(G.names[gi])}</button>`; }
      if (acts.includes('fate')) { h += `<div class="hint" style="width:100%;margin-top:6px">Protegido por el Destino (1 PA)</div>`; for (const gi of E.wcTargets(s, o, 'fate')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'fate', tg: gi })}'>Protegido por el Destino → ${H(G.names[gi])}</button>`; }
      if (acts.includes('alight')) { h += `<div class="hint" style="width:100%;margin-top:6px">Alight (Ceaseless contra el objetivo) (1 PA)</div>`; for (const gi of E.wcTargets(s, o, 'alight')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'alight', tg: gi })}'>Alight → ${H(G.names[gi])}</button>`; }
      if (acts.includes('recon')) { h += `<div class="hint" style="width:100%;margin-top:6px">Ritual de Reconstitución (2D3) (1 PA)</div>`; for (const gi of E.wcTargets(s, o, 'recon')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'recon', tg: gi })}'>Ritual de Reconstitución → ${H(G.names[gi])}</button>`; }
      if (acts.includes('fury')) { h += `<div class="hint" style="width:100%;margin-top:6px">Incitar furia (+1 APL) (1 PA)</div>`; for (const gi of E.wcTargets(s, o, 'fury')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'fury', tg: gi })}'>Incitar furia → ${H(G.names[gi])}</button>`; }
      if (acts.includes('sfinc')) { h += `<div class="hint" style="width:100%;margin-top:6px">Incentivise (+1 APL a otro SANCTIFIER) (1 PA)</div>`; for (const gi of E.wcTargets(s, o, 'sfinc')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'sfinc', tg: gi })}'>Incentivise → ${H(G.names[gi])}</button>`; }
      if (acts.includes('torment')) { h += `<div class="hint" style="width:100%;margin-top:6px">Granada de tormento (1 PA)</div>`; for (const gi of E.wcTargets(s, o, 'torment')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'torment', tg: gi })}'>Granada de tormento → ${H(G.names[gi])}</button>`; }
      if (acts.includes('premon')) { h += `<div class="hint" style="width:100%;margin-top:6px">Granada de premono (1 PA)</div>`; for (const gi of E.wcTargets(s, o, 'premon')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'premon', tg: gi })}'>Granada de premono → ${H(G.names[gi])}</button>`; }
      if (acts.includes('smoke')) { h += `<div class="hint" style="width:100%;margin-top:6px">Granada de humo (1 PA): área de 1" que ofusca</div>`; for (const sp of E.smokeSpots(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'smoke', spot: sp.k })}'>Humo ${sp.k === 'self' ? 'sobre el agente' : 'a ' + sp.k.slice(1) + '" hacia el enemigo'}</button>`; }
      if (acts.includes('stun')) { h += `<div class="hint" style="width:100%;margin-top:6px">Granada aturdidora (1 PA): D6 3+ resta 1 APL</div>`; for (const gi of E.stunTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'stun', tg: gi })}'>Aturdir → ${H(G.names[gi])}</button>`; }
      if (acts.includes('proppa')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'proppa' })}'>Proppa Scrap (1 CP): dos acciones de Combatir</button>`;
      if (acts.includes('kaboom')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'kaboom' })}'>Kaboom! (1 CP): +1" Blast y Severa en el próximo Disparo</button>`;
      if (acts.includes('malig')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'malig' })}'>Malignant Aura (1 CP): Perforante 1 a ≤3" en el próximo Disparar</button>`;
      if (acts.includes('mutab')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'mutab' })}'>Mutability and Change (1 CP): +1 APL, sin repetir acción</button>`;
      if (acts.includes('captiv')) { h += `<div class="hint" style="width:100%;margin-top:6px">Sickening Captivation (1 CP): -1 APL al enemigo</div>`; for (const gi of E.captivTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'captiv', tg: gi })}'>${nm(gi)}</button>`; }
      for (const [k, tx] of [['ancest', 'The Ancestors Are Watching (1 CP): Disparar o Combatir gratis'], ['onslaught', 'Frightening Onslaught (1 CP): Combatir gratis'], ['procliv', 'Proclivity for Murder (1 CP): Cargar (≤3") o Correr gratis']]) if (acts.includes(k)) h += `<button class="btn" data-pend='${JSON.stringify({ t: k })}'>${tx}</button>`;
      if (acts.includes('cruel')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'cruel' })}'>Cruel Deception (1 CP): Retirarse -1 PA</button>`;
      if (acts.includes('barge')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'barge' })}'>Barge (1 CP): atravesar enemigos y mover en zona de control</button>`;
      for (const pk of ['bonds', 'mherd', 'wdrill']) if (acts.includes(pk)) for (const gi of E.pairTargets(s, o, pk)) h += `<button class="btn" data-pend='${JSON.stringify({ t: pk, tg: gi })}'>${pk === 'bonds' ? 'Bonds That Bind' : pk === 'wdrill' ? 'Well-Drilled' : 'Mutant Herd'} (1 CP): activar después a ${H(G.names[gi])}</button>`;
      if (acts.includes('cmdov')) for (const iv of Object.keys(E.IMPS)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'cmdov', v: iv })}'>Command Override (1 CP): ${E.IMPS[iv]}</button>`;
      if (acts.includes('omni')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'omni' })}'>Omnissiah's Imperative (1 CP)</button>`;
      if (acts.includes('insp')) for (const v of Object.keys(E.ORD)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'insp', v })}' title="${H(E.ORD_TXT[v])}">Inspirational Leadership (${E.inspCost(s, o)} CP): ${H(E.ORD[v])}</button>`;
      if (acts.includes('resapl')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'resapl' })}'>Resourceful: +1 APL (${s.res[o.p]} pts)</button>`;
      if (acts.includes('resheal')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'resheal' })}'>Resourceful: recuperar D3+1 (${s.res[o.p]} pts)</button>`;
      if (acts.includes('mlightf')) for (const gi of E.mlTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'mlightf', tg: gi })}'>Markerlight GRATIS (Kauyon): ${H(G.names[gi])} (${s.ops[gi].ml || 0}/5)</button>`;
      if (acts.includes('mlight')) for (const gi of E.mlTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'mlight', tg: gi })}'>Markerlight (1 PA): ${H(G.names[gi])} (${s.ops[gi].ml || 0}/5)</button>`;
      if (acts.includes('ty')) for (const c of E.tyActs(s, o)) h += `<button class="btn" data-pend='${JSON.stringify(c)}'>${c.v === 'shoot' ? 'Disparar al saco de gestación · ' : 'Golpear el saco de gestación · '}${H(o.weapons[c.wi].n)} (1 PA)</button>`;
      if (acts.includes('vc')) for (const c of E.vcActs(s, o)) h += `<button class="btn" data-pend='${JSON.stringify(c)}'>${c.v === 'door' ? 'Abrir puerta de la empalizada (1 PA)' : c.v === 'shoot' ? 'Disparar a la empalizada · ' + H(o.weapons[c.wi].n) + ' (1 PA)' : 'Golpear la empalizada · ' + H(c.wi === -1 ? 'Carga de demolición' : o.weapons[c.wi].n) + ' (1 PA)'}<small> · brecha ${s.vc.stk[c.k].w}/8</small></button>`;
      if (acts.includes('tac')) for (const c of E.tacActs(s, o)) if (!o.did['tac_' + c.v]) h += `<button class="btn" data-pend='${JSON.stringify(c)}'>${({ dev: 'Colocar dispositivo', retr: 'Recuperar', clear: 'Despejar', scout: 'Explorar', banner: 'Plantar estandarte' })[c.v]} (1 PA)${c.ob != null ? ': marcador ' + (c.ob + 1) : ''}${c.tg != null ? ': ' + H(G.names[c.tg]) : ''}</button>`;
      if (acts.includes('drop')) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'drop' })}'>Colocar marcador que transporta (1 PA)</button>`;
      if (acts.includes('pick')) for (const j of E.pickTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'pick', mk: j })}'>Recoger marcador (1 PA): ${({ intel: 'Información', retr: 'Recuperación', banner: 'Estandarte', beacon: 'Baliza de guía', cad: 'Cadáver' })[s.mm[j].k]}</button>`;
      if (acts.includes('send')) for (const i of E.sendTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'send', ob: i })}'>Enviar datos (1 PA): marcador ${i + 1} → ${s.data[i]} PV</button>`;
      if (acts.includes('mission') && s.crit === 4 && s.orb === E.centreObj(s)) for (let j = 0; j < s.objs.length; j++) if (j !== s.orb) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'mission', to: j })}'>Mover Orbe al marcador ${j + 1}${E.objRole(s, j) === o.p ? ' (tuyo)' : ' (rival)'}</button>`;
      if (acts.includes('ros')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ros' })}'>Rosette (1/batalla): elegir nueva presa</button>`;
      if (acts.includes('ewill')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ewill' })}'>The Emperor's Will (1 CP): ignorar cambios de características</button>`;
      if (acts.includes('slink')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'slink' })}'>Slink into Darkness (1 CP): pasar a Conceal</button>`;
      if (acts.includes('mslt')) for (const i of E.msltT(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'mslt', tg: i })}'>Slither Out of Sight (1 CP): ${s.ops[i].name || ('#' + (i + 1))} pasa a Conceal</button>`;
      if (acts.includes('nth')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'nth' })}'>Nowhere to Hide (1 CP): moverse atravesando el terreno</button>`;
      if (acts.includes('hide')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'hide' })}'>Shoot and Hide (1 CP): pasar a Conceal</button>`;
      if (acts.includes('larc')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'larc' })}'>Larcenous (1 CP)</button>`;
      if (acts.includes('cabal')) for (const x of E.cabalOpts(s, o)) h += x.act ? `<button class="btn" data-pend='${JSON.stringify({ t: 'cabal', q: x.q, act: x.act })}'>Psychic Cabal (1 CP): acción ${({ fate: 'Protected by Fate', ravage: 'Ravage Destiny', recon: 'Reconstitution Ritual', tflux: 'Temporal Flux', alight: 'Alight' })[x.act]} de ${s.ops[x.q].name}</button>` : `<button class="btn" data-pend='${JSON.stringify({ t: 'cabal', q: x.q, wi: x.wi })}'>Psychic Cabal (1 CP): ${s.ops[x.q].weapons[x.wi].n} de ${s.ops[x.q].name}</button>`;
      if (acts.includes('scrap')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'scrap' })}'>Scrapcode Overload (1 CP)</button>`;
      if (acts.includes('gng')) for (const oi of E.gngTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'gng', ob: oi })}'>Give No Ground (1 CP): controlar el marcador ${oi + 1}</button>`;
      if (acts.includes('capric')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'capric' })}'>Capricious Plan (1 CP): Correr gratis y/o cambiar orden</button>`;
      if (acts.includes('cord')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'cord' })}'>Cambiar orden (Capricious Plan)</button>`;
      if (acts.includes('shame')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'shame' })}'>In Life, Shame (1 CP): todas las órdenes de Guardsman</button>`;
      if (acts.includes('elusive')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'elusive' })}'>Elusive Target (1 CP): no blanco válido con Ocultarse y cobertura</button>`;
      if (acts.includes('dart')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'dart' })}'>Darting Flight (1 CP): Reposicionarse +D3" (sin Disparar/Combatir este PI)</button>`;
      if (acts.includes('slither')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'slither' })}'>Slithering Evasion (1 CP): Retirarse -1 PA y Cargar desde la zona de control</button>`;
      if (acts.includes('wrath')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'wrath' })}'>Wrath of Vengeance (${s.ops[s.act.op].order === 'engage' ? '0' : '1'} CP): acción adicional gratuita distinta</button>`;
      if (acts.includes('adjdoc')) for (const d of ['doc_dev', 'doc_tac', 'doc_ass']) if (!s.gam[s.act.p].includes(d)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'adjdoc', id: d })}'>Adjust Doctrine (1 CP) → ${d === 'doc_dev' ? 'Devastadora' : d === 'doc_tac' ? 'Táctica' : 'de Asalto'}</button>`;
      if (acts.includes('ammo')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ammo' })}'>Usar alijo de munición (0 PA)</button>`;
      if (acts.includes('drug')) { h += `<div class="hint" style="width:100%;margin-top:6px">Administrar droga (2D3) (1 PA)</div>`; for (const gi of E.wcTargets(s, o, 'drug')) { if (s.ops[gi].w < s.ops[gi].W) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'drug', tg: gi })}'>Administrar droga (2D3) → ${H(G.names[gi])}</button>`; if (s.ops[gi].drug) for (const v of ['pain', 'adren', 'hypex']) if (v !== s.ops[gi].drug) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'drug', tg: gi, v })}'>${E.DRUG_N[v]} → ${H(G.names[gi])}</button>`; } }
      if (acts.includes('hamark')) { h += `<div class="hint" style="width:100%;margin-top:6px">Mark (1 PA): Seek Light y sin ofuscar contra ese enemigo este PI</div>`; for (const gi of E.wcTargets(s, o, 'hamark')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'hamark', tg: gi })}'>Mark → ${H(G.names[gi])}</button>`; }
      if (acts.includes('invan')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'invan' })}'>Dark Animus (1 ficha de Dolor): +1 APL</button>`;
      if (acts.includes('invrj')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'invrj' })}'>Accelerated Rejuvenation (1 ficha de Dolor): recupera D3+1</button>`;
      if (acts.includes('bzpraise')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bzpraise' })}'>Praise/Blaspheme (1 PA): baraja una carta de tu mano (o dos descartadas) y roba una</button>`;
      if (acts.includes('bzhallow')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bzhallow' })}'>Hallow/Defile (1 PA): consagra/profana la estatua y roba una carta (una vez por PI)</button>`;
      if (acts.includes('scroll')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'scroll' })}'>Pergaminos hechiceros: Don adicional hasta fin del PI</button>`;
      for (const [k, lab] of [['bdsac', 'Sacrilegious Actuation (1 PA): ganas una ficha de Blooded'], ['phguer', 'Guerrilla Warfare (1 PA): cambias el orden de este operativo (no en zona de control enemiga)'], ['mwwings', 'Wings of Darkness (ardid 1 PC, PI 2+): +3" a Retirarse/Reposicionarse; no podrá Disparar ni Combatir hasta el siguiente PI'], ['spsilent', 'Silent Killers (ardid 1 PC, solo en Conceal sin ser objetivo válido): puedes Cargar en Conceal; primer golpe +3 de daño sin resolver más éxitos'], ['auspt', 'Auspicator Tracking (ardid 1 PC, contraacción antes de actuar): cambias el orden de este operativo'], ['spdodge', 'Dodge (ardid 1 PC): Retirarse cuesta 1 PA menos esta activación'], ['mindc', 'Mind Control (2 PA): tirada D6+APL enfrentada; si ganas (una vez por batalla), el enemigo ataca a un aliado suyo y queda en Ocultarse'], ['assas', 'Assassinate (2 PA): Carga sin +2" a un enemigo que no te ve y Combate con un golpe extra'], ['soul', "Familiar's Soulsight (1 PA): ficha al enemigo (TALON: bio-dagger Brutal y Equilibrada; SNIPER: rifle con Saturar y no puede estar ofuscado)"], ['ghook', 'Grappling Hook (1 PA, cuenta como Reposicionarse): a ≤1" de un punto de terreno'], ['tacmd', 'Tactical Command (0 PA): eliges una habilidad más para ese KASRKIN (o recolocas el marcador de Clearance Sweep)'], ['ward', 'Warding Shield (1 PA, PSYCHIC): un CORSAIR VOIDSCARRED a ≤6" ignora el primer daño hasta tu siguiente activación'], ['schan', 'Soul Channel (1 PA, PSYCHIC): +1 APL a otro CORSAIR a ≤6" hasta el final de su siguiente activación'], ['sheal2', 'Soul Heal (1 PA, PSYCHIC): un CORSAIR a ≤6" recupera 2D3'], ['lfing', 'Light Fingers (ardid): Recoger marcador y misiones estando trabado esta activación'], ['capfl', 'Capricious Flight (ardid): Retirarse −1 PA esta activación'], ['fkord', 'Farstalker (contraacción): cambiar de orden en vez de contraactuar'], ['gather', 'Gather (1 PA): mueve hasta un marcador y lo recoge gratis'], ['sqguide', 'Guidance and Experience (0 PA, una vez por activación): +1 APL a un aliado visible hasta el final de su siguiente activación'], ['trackE', 'Track Enemy (1 PA): Seek Light contra un enemigo activado a ≤8" este PI'], ['auspex', 'Auspex Scan (1 PA): enemigos a ≤8" sin ofuscar para tus SCOUT'], ['optics', 'Optics (1 PA): sin ofuscar hasta su siguiente activación'], ['astr', 'Astartes Training (ardid, 1 PC): segundo Disparar o Combatir'], ['rawph', 'Raw Physiology (ardid, 1 PC): ignora estar herido'], ['covert', 'Covert Position (ardid, 1 PC): no es blanco en Ocultarse y a cubierto'], ['flail', 'Flail (1 PA): 1D3+2 a cada otro agente visible a ≤2" (con un 3, el enemigo gana Veneno)'], ['miasma', 'Poisonous Miasma (1 PA, PSYCHIC): Veneno al enemigo, o 3 de daño si ya lo tenía'], ['pvital', 'Putrescent Vitality (1 PA, PSYCHIC): 2D6; con 7 recupera 7, si no el dado más alto'], ['virpois', 'Virulent Poison (ardid, 1 PC): Veneno a un enemigo a ≤3" (o 2D6 7+ a ≤7")'], ['icmd', 'Interstitial Command (1 PA): otra HIEROTEK hace una acción gratuita de 1 PA (máx. 2" de movimiento)'], ['tspl', 'Timesplinter (1 PA): recoloca a un aliado activado a ≤5" (tú eliges dónde)'], ['ctnm', 'Countertemporal Nanomine (1 PA): marcador visible a ≤8" (lo colocas tú; por defecto junto al enemigo elegido); −2" de Movimiento a ≤4"'], ['chrm', 'Chronometron (1 PA): −1 Atk contra el aliado elegido'], ['harb', 'Harbinger of Despair (1 PA): marcador visible (lo colocas tú; por defecto junto al enemigo elegido)'], ['nshr', 'Nightmare Shroud (1 PA): los enemigos a ≤4" no repiten dados de ataque ni retienen críticos con menos de 6'], ['vmad', 'Vision of Madness (1 PA): ficha de Madness a un enemigo visible (1D6 ≥ su LPA: no puede activarse)'], ['augw', 'Augment Weapon (1 PA): dos reglas para un arma del aliado'], ['reinf', 'Reinforce Metal (1 PA): −1 al daño de 3+ sobre el aliado'], ['crep', 'Canoptek Repair (1 PA): el aliado recupera 2D3 heridas'], ['accel', 'Accelerate (1 PA): +1 APL a una DEATHMARK o IMMORTAL'], ['rean1', 'Reanimate (1 PA): 3+ en 1D6'], ['rean2', 'Reanimate (2 PA): automático'], ['mdv', 'Multi-Dimensional Vision (1 PA): sin ofuscar hasta su siguiente activación'], ['dimamb', 'Dimensional Ambush (ardid, 1 PC): Guardia en Ocultarse'], ['stlth', 'Stealth Attack (2 PA): Cargar gratis sin +2" y Combatir gratis con un golpe extra'], ['mhunt', "Marked for the Hunt (1 PA): marcador Pech'ra junto a un enemigo visible (Seek Light contra él)"], ['fkeye', 'From the Eye Above (1 PA): +1 APL a un aliado a ≤6" hasta el final de su siguiente activación'], ['energ', 'Energise (1 PA): Letal 5+ con el arco hasta que dispare o acabe el PI'], ['lsight', 'Long-Sight (1 PA): Letal 5+ (concealed/stationary) y sin ofuscar hasta su siguiente activación'], ['slip', 'Slip Away (ardid, 1 PC): Retirarse −1 PA esta activación'], ['poach', 'Poach (ardid, 1 PC): basta con disputar el marcador esta activación'], ['tassn', 'Trained Assassin (1 PA): cambiar su orden'], ['cvchg', 'Calibrate Voltagheist (0 PA): Charge — voltaic pistol con Letal 4+ hasta su siguiente activación'], ['cvfld', 'Calibrate Voltagheist (0 PA): Field — D6 al enemigo que acabe Cargar/Correr/Retirarse/Reposicionar visible a ≤4"'], ['hserum', 'Healing Serum (1 PA): un aliado en su zona de control recupera 1D3+3 heridas'], ['gend', 'Great Endurance (ardid, 1 PC): +1 APL esta activación'], ['bwind', 'Bladewind (ardid, 1 PC): puede hacer dos Combatir esta activación'], ['sfall', 'Starfall (ardid, 1 PC): puede hacer dos Disparar esta activación'], ['fadel', 'Fading Light (ardid, 1 PC): Retirarse −1 PA esta activación'], ['raise', 'Raise Icon (1 PA): +1 punto de Fe (+PI si controla un objetivo)'], ['rhet', 'Stirring Rhetoric (1 PA): +1 APL (máx. 3) a otra NOVITIATE hasta el final de su siguiente activación'], ['bcast', 'Auto-broadcaster (0 PA): coloca o mueve el marcador hasta 8"; los enemigos a ≤3" no repiten dados de ataque'], ['chir', "Chirurgeon's Tools (1 PA): una NOVITIATE en su zona de control recupera 2D3"], ['whip', 'Whip Into Frenzy (1 PA): otra NOVITIATE a ≤3" tiene +1" y dos Combatir (uno gratis) en su siguiente activación'], ['exemp', 'Tempestus Exemplars (ardid, 1 PC): Recoger/Colocar marcador y misiones a −1 PA esta activación'], ['progena', 'Progena (ardid, 1 PC): recupera 2D3 heridas e ignora los cambios de APL'], ['tcmd', 'Command (1 PA): +1 APL a otro TEMPESTUS AQUILON visible a ≤6" (no Servo-sentry) hasta el final de su siguiente activación'], ['chasten', 'Chasten (1 PA): un blanco válido a ≤6" pierde las acciones únicas de su ficha hasta el final de su siguiente activación'], ['tvul', 'Target Vulnerability (1 PA): el perfil estacionario del rifle tiene Letal 5+ esta activación'], ['consp', 'Conspire (1 PA): ganas 1 PC (una vez por PI)'], ['telo', 'Telepathic Overload (1 PA, PSYCHIC): −1 APL al blanco hasta el final de su siguiente activación'], ['monsl', 'Mental Onslaught (1 PA, PSYCHIC): 2 de daño (4 a ≤6") y se repite mientras el D6 supere su APL (máx. 8)'], ['grisly', 'Grisly Mark (2 PA): marcador; los enemigos a ≤3" pagan +1 PA por Recoger y misión y restan 1 al LPA al disputar'], ['unleash', 'Unleash Daemon (0 PA, una vez por batalla): −1 al Dmg de 4+, garra Incesante y Letal 5+; sin Recoger ni misiones'], ['kscan', 'Auspex Scan (1 PA): enemigos a ≤8" sin ofuscar para los KASRKIN'], ['kmplace', 'Colocar Melta Mine (1 PA; Correr gratis)'], ['kmpick', 'Recoger Melta Mine (1 PA)'], ['scry', 'Scry (1 PA): Guidance (convierte un fallo en éxito o un éxito en crítico al atacar) hasta su siguiente activación'], ['mirror', 'Mirror of Minds (1 PA): 5D6 contra 5D6, D3 por pareja (máx. 8)'], ['fogd', 'Fog of Dreams (1 PA): no puede activarse durante 1D6 activaciones o hasta ser el último'], ['aerial', 'Aerial Guidance (1 PA): Letal 5+ y Saturar para los VESPID a ≤6"'], ['chelm', 'Communion Helm (0 PA, 1 punto): acción de misión gratuita de un aliado a ≤3"'], ['optics', 'Optics (1 PA): sin ofuscar y Letal 5+ en el perfil estacionario'], ['icomm', 'Intercept Communications (1 PA): +1 APL hasta el final de su siguiente activación'], ['sling', 'Slingshot (1 PA, cuenta como Reposicionarse): destino nº'], ['pacc', 'Pulse Accelerator (1 PA): armas de pulso a ≤3" con Letal 5+ y Severa'], ['rpilot', 'Remote Pilot (1 PA): acción gratuita de un DRONE (máx. 2")'], ['tjam', 'System Jam (1 PA): −1 APL hasta el final de su siguiente activación'], ['mimic', 'Disconcerting Mimicry (1 PA): −1 APL, cambiar su orden o hacerle Correr (cada opción una vez por batalla)'], ['pobj', 'Poison Objective (1 PA): ficha Terrorchem en el objetivo'], ['nbspot', 'Spot (1 PA): Seek Light y sin ofuscar para los BREACHER contra ese enemigo'], ['wayfind', 'Wayfind (1 PA): +1 APL hasta el final de su siguiente activación'], ['ipulse', 'Interference Pulse (1 PA): con 3+, −1 APL'], ['rctl', 'Remote Control (1 PA): acción gratuita del C.A.T. UNIT (máx. 3")'], ['bpoint', 'Breach Point (1 PA): marcador de Brecha en el muro cercano'], ['weld', 'Weld Shut (1 PA): sueldas la escotilla cerrada a ≤1": Operarla cuesta 1 PA más a los demás'], ['bbjam', 'Jam (1 PA; 2 si solo es visible): no puede activarse hasta ser el último o tras 1D6 activaciones'], ['sapexp', 'Explosivos (1 PA): 1.ª vez marcador, 2.ª vez 2D6 a ≤2"'], ['gong', 'Gong Knell (1 PA): +1 Salvación contra disparos'], ['mantle', 'Mantle of Darkness (1 PA): FELLGOR a ≤3" con Ocultarse a cubierto no son blanco'], ['sweep', 'Sweeping Blow (1 PA): 1D3+1 a cada operativo a ≤2"'], ['uncomp', 'Uncompromising Attack (1 PA): Combatir y Disparar (autopistol) gratis'], ['knux', 'Knux Smash (1 PA): 1D3+1 de daño y Cargar gratis (máx. 3")'], ['sjam', 'System Jam (1 PA): no puede activarse hasta que los demás estén agotados'], ['spot', 'Spot (1 PA): tus HEARTHKYN a ≤3" del LOKÂTR le disparan con Buscar Ligero y sin ofuscado'], ['pss', 'Pan Spectral Scan (1 PA): marcador; disparos a ≤3" con Precisa 1 y Saturar'], ['ugren', 'Granada de utilidad (1 PA): +1 PA a Recoger y misión a ≤3"'], ['appraise', 'Accelerated Appraisal (1 PA): recolocar marcador de Ataque o Defensa']]) if (acts.includes(k)) { h += `<div class="hint" style="width:100%;margin-top:6px">${lab}</div>`; for (const gi of E.wcTargets(s, o, k)) h += `<button class="btn" data-pend='${JSON.stringify({ t: k, tg: gi })}'>→ ${(k === 'sling') ? 'destino ' + (gi + 1) : (k === 'rean1' || k === 'rean2') ? 'marcador ' + (gi + 1) : k === 'ghook' ? 'punto ' + (gi + 1) : H(G.names[gi])}</button>`; }
      if (acts.includes('sprend')) h += `<button class="btn ok" data-pend='${JSON.stringify({ t: 'sprend' })}'>Terminar Esprintar (VELOCIDAD según lo recorrido)</button>`;
      if (acts.includes('edspir')) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'edspir' })}'>Espíritu superviviente (ardid 1 PC): ignora los cambios de armas por herido</button>`;
      if (acts.includes('edsow')) for (const ob of E.wcTargets(s, o, 'edsow')) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'edsow', ob })}'>Sembrar las semillas (0 PA): marcador ${ob + 1}</button>`;
      if (acts.includes('edmoon')) { const mx = E.wcTargets(s, o, 'edmoon')[0]; for (let d = 1; d <= mx; d++) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'edmoon', d })}'>Canto de la luna cazadora: Esprintar gratis ${d}" adelante</button>`; }
      if (acts.includes('scry')) for (const gi of E.wcTargets(s, o, 'scry')) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'scry', tg: gi, v: 'prot' })}'>Scry: Protection → ${H(G.names[gi])}</button>`;
      if (acts.includes('wfold')) { const tg = E.wcTargets(s, o, 'wfold'); for (let i = 0; i < tg.length; i++) for (let j = i + 1; j < tg.length; j++) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'wfold', tg: tg[i], tg2: tg[j] })}'>Warp Fold (1 PA): intercambiar ${H(G.names[tg[i]])} y ${H(G.names[tg[j]])}</button>`; }
      if (acts.includes('hldoc')) for (const [k, n] of [['doc_dev', 'Devastadora'], ['doc_tac', 'Táctica'], ['doc_ass', 'de Asalto']]) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'hldoc', v: k })}'>Heroic Leader: Doctrina ${n} (${E.ployCost(s, o.p, k)} PC)</button>`;
      if (acts.includes('ipact')) for (const k of Object.keys(E.MARKS)) if (k !== o.mark) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'ipact', v: k })}'>Infernal Pact (una vez por batalla): Marca ${H(E.MARKS[k])}</button>`;
      if (acts.includes('pbar')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'pbar' })}'>${E.isESop && E.isESop(s, o) ? 'Uncompromising Fire' : 'Pistol Barrage'} (1 PA): dos Disparar gratis con sus dos armas indicadas (el motor elige blancos)</button>`;
      if (acts.includes('dkplace')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'dkplace' })}'>Colocar marcador de mina (1 PA; Mine Layer: Correr gratis)</button>`;
      if (acts.includes('dkpick')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'dkpick' })}'>Recoger marcador de mina (1 PA)</button>`;
      if (acts.includes('dkdet')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'dkdet' })}'>Remote detonator (1 PA): disparar a todos a ≤2" de la mina</button>`;
      if (acts.includes('intosh')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'intosh' })}'>Into Shadow (1 PA): cambiar de orden</button>`;
      if (acts.includes('ddash')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ddash' })}'>Dakka Dash (1 PA): Disparar con la dakka shoota y Correr gratis (el motor elige)</button>`;
      if (acts.includes('nbboost')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'nbboost' })}'>Boost (1 PA): +4" a la próxima Carga</button>`;
      if (acts.includes('cbr')) { h += `<button class="btn" data-pend='${JSON.stringify({ t: 'cbr', v: 'swap' })}'>Command Breach (0 PA): cambiar Attack/Defence Order</button>`; E.orderSpots(s, o.p).forEach((sp, i) => { if (!/^op/.test(sp.lab)) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'cbr', v: i })}'>Command Breach: recolocar en ${H(sp.lab)}</button>`; }); }
      if (acts.includes('explode')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'explode' })}'>¡Explosivos! (1 PA): el BOMB SQUIG es el blanco (Explosión 1")</button>`;
      if (acts.includes('pulsa')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'pulsa' })}'>Pulsa rokkit (1 PA): marcador Shokkwave sobre el grupo enemigo</button>`;
      if (acts.includes('breakst')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'breakst' })}'>Break Stuff (1 PA): romper terreno de equipo o abrir brecha</button>`;
      for (const [k, lb] of [['ccslay', 'Incite Slaughter (1 PA): un CHAOS CULT combate gratis'], ['ccurge', 'Incite Urgency (1 PA): un CHAOS CULT carga/corre gratis'], ['ccdelug', 'Heinous Deluge (1 PA, PSYCHIC): −1 APL al enemigo']]) if (acts.includes(k)) { h += `<div class="hint" style="width:100%;margin-top:6px">${lb}</div>`; for (const gi of E.wcTargets(s, o, k)) h += `<button class="btn" data-pend='${JSON.stringify({ t: k, tg: gi })}'>${H(G.names[gi])}</button>`; }
      if (acts.includes('ccicon')) { h += `<div class="hint" style="width:100%;margin-top:6px">Ruinous Icon (1 PA, PSYCHIC)</div><button class="btn" data-pend='${JSON.stringify({ t: 'ccicon', v: 'inv' })}'>Invigoration</button><button class="btn" data-pend='${JSON.stringify({ t: 'ccicon', v: 'det' })}'>Deterioration</button>`; }
      if (acts.includes('ccvort')) { h += `<div class="hint" style="width:100%;margin-top:6px">Malefic Vortex (1 PA, PSYCHIC): marcador sobre un enemigo visible; 1 de daño a los que estén a ≤2"</div>`; for (const gi of E.wcTargets(s, o, 'ccvort')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ccvort', tg: gi })}'>${H(G.names[gi])}</button>`; }
      if (acts.includes('ccabhor')) { h += `<div class="hint" style="width:100%;margin-top:6px">Abhorrent Mutation (1 PE)</div>`; for (const k of E.wcTargets(s, o, 'ccabhor')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ccabhor', v: k })}'>${H(E.CC_GIFTS[k])}</button>`; }
      if (acts.includes('ccunleash')) h += `<div class="hint" style="width:100%;margin-top:6px">Unleash the Daemon (1 PE): dos Combatir (uno gratis)</div><button class="btn" data-pend='${JSON.stringify({ t: 'ccunleash' })}'>Desatar al demonio</button>`;
      if (acts.includes('ravage')) { h += `<div class="hint" style="width:100%;margin-top:6px">Asolar el destino (1 PA, PSYCHIC): el enemigo repite sus 6 al atacar y su APL cuenta 1 menos para controlar marcadores</div>`; for (const gi of E.wcTargets(s, o, 'ravage')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'ravage', tg: gi })}'>→ ${H(G.names[gi])}</button>`; }
      if (acts.includes('tflux')) { h += `<div class="hint" style="width:100%;margin-top:6px">Flujo temporal (1 PA, PSYCHIC): al final de su siguiente activación vuelve al marcador</div>`; for (const gi of E.wcTargets(s, o, 'tflux')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'tflux', tg: gi })}'>→ ${H(G.names[gi])}</button>`; }
      if (acts.includes('brayhorn')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'brayhorn' })}'>Brayhorn (0 PA): +1" de Movimiento a los TZAANGOR</button>`;
      if (acts.includes('pare')) { h += `<div class="hint" style="width:100%;margin-top:6px">Proyección pareidólica (1 PA): Impacto 1 peor y −2" de Movimiento</div>`; for (const gi of E.wcTargets(s, o, 'pare')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'pare', tg: gi })}'>→ ${H(G.names[gi])}</button>`; }
      if (acts.includes('weave')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'weave' })}'>Tejer oscuridad (1 PA): humo persistente</button>`;
      if (acts.includes('photon')) { h += `<div class="hint" style="width:100%;margin-top:6px">Granada fotónica (1 PA): con 3+ resta 2" de Movimiento</div>`; for (const gi of E.wcTargets(s, o, 'photon')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'photon', tg: gi })}'>→ ${H(G.names[gi])}</button>`; }
      if (acts.includes('dun')) { h += `<div class="hint" style="width:100%;margin-top:6px">${o.kw && o.kw.includes('COMMS BOY') ? 'Escucha (Listen In' : '¡Hazlo ya! (Get It Dun!'}, 1 PA): +1 APL hasta el final de su siguiente activación</div>`; for (const gi of E.wcTargets(s, o, 'dun')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'dun', tg: gi })}'>→ ${H(G.names[gi])}</button>`; }
      if (acts.includes('wscall')) { const tg = (E.wcTargets(s, s.ops[s.act.op], 'wscall') || []).filter(i => i !== s.act.op); h += `<button class="btn" data-pend='${JSON.stringify({ t: 'wscall', opt: 'mv', tg: s.act.op })}'>Call the Storm (1 PA): recolocar la TORMENTA</button>`; for (const i of tg) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'wscall', opt: 'obs', tg: i })}'>Call the Storm (1 PA): ofuscar a ${s.ops[i].name}</button>`; }
      if (acts.includes('wshs')) for (const [op, ol] of [['sev', 'Severe'], ['sat', 'Saturate y sin ofuscación']]) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'wshs', opt: op })}'>Hunter's Senses (1 PA): ${ol}</button>`;
      for (const [ck, cl] of [['cimentor', 'Spiritual Mentor'], ['cispeak', 'Speak of Her Deeds']]) if (acts.includes(ck)) for (const gi of E.wcTargets(s, o, ck)) h += `<button class="btn" data-pend='${JSON.stringify({ t: ck, tg: gi })}'>${cl} (1 PA): ${s.ops[gi].name}</button>`;
      if (acts.includes('spload')) for (const gi of E.wcTargets(s, o, 'spload')) for (const ei of E.freeShotTargets(s, s.ops[gi], null)) { const en = esName(s.ops[ei].name); h += `<button class="btn" data-pend='${JSON.stringify({ t: 'spload', tg: gi, te: ei })}'>Load Weapon (1 PA): ${s.ops[gi].name} dispara a ${en}</button>`; }
      if (acts.includes('bdimp')) for (const gi of E.wcTargets(s, o, 'bdimp')) for (const hw of E.bdImpOpts(s, s.ops[gi])) { const base = hw === 'dash' || hw === 'charge' ? { t: 'bdimp', tg: gi, how: hw, fmv: { who: gi, mx: 2, kind: hw === 'dash' ? 'dash' : 'chg' } } : { t: 'bdimp', tg: gi, how: hw }; const g = s.ops[gi]; if (hw === 'shoot') { for (const ei of E.freeShotTargets(s, g)) h += `<button class="btn" data-pend='${JSON.stringify({ ...base, te: ei })}'>Imponer (1 PA) → ${esName(g.name)}: Disparar gratis a ${esName(s.ops[ei].name)}</button>`; } else h += `<button class="btn" data-pend='${JSON.stringify(base)}'>Imponer (1 PA) → ${esName(g.name)}: ${({ fight: 'Combatir', charge: 'Cargar (2")', dash: 'Correr (2")' })[hw]} gratis</button>`; }
      if (acts.includes('gmspray')) for (const ei of E.freeShotTargets(s, o, w => /autopistol/i.test(w.n))) { const en = esName(s.ops[ei].name); h += `<button class="btn" data-pend='${JSON.stringify({ t: 'gmspray', first: 'run', te: ei, fmv: { who: o.i, mx: 3, kind: 'dash' } })}'>Cargar y rociar (1 PA): Correr (eliges destino) y Disparar a ${en}</button><button class="btn" data-pend='${JSON.stringify({ t: 'gmspray', first: 'shoot', te: ei, fmv: { who: o.i, mx: 3, kind: 'dash' } })}'>Cargar y rociar (1 PA): Disparar a ${en} y Correr (eliges destino)</button>`; }
      if (acts.includes('edwail')) for (const gi of E.wcTargets(s, o, 'edwail')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'edwail', tg: gi })}'>Lamentos del mundo (1 PA) → ${esName(s.ops[gi].name)}</button>`
      if (acts.includes('exord')) for (const gi of E.wcTargets(s, o, 'exord')) { const m = s.ops[gi], N = { agr: 'Agresivo', vel: 'Veloz', def: 'Defensivo' }; for (const d of m.pat) for (const ad of ['agr', 'vel', 'def'].filter(x => !m.pat.includes(x))) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'exord', tg: gi, drop: d, add: ad })}'>Orden R-VR (0 PA): ${N[d]} → ${N[ad]}</button>`; }
      if (acts.includes('cuid')) for (const mi of E.wcTargets(s, o, 'cuid')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'cuid', po: mi, order: 'engage' })}'>Activar a la vez a ${esName(s.ops[mi].name)} (0 PA)</button>`
      if (acts.includes('swapop')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'swapop' })}'>Cambiar de agente (${esName(s.ops[s.act.po].name)}: ${s.act.pap} PA)</button>`
      if (acts.includes('phscan')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'phscan' })}'>Escaneo Auspex (1 PA): sin ofuscación a ≤8"</button>`
      if (acts.includes('exavi')) for (const gi of E.wcTargets(s, o, 'exavi')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'exavi', tg: gi })}'>Avistar → ${esName(s.ops[gi].name)}</button>`
      if (acts.includes('bdstimm')) for (const fi of E.wcTargets(s, o, 'bdstimm')) for (const [r, lb] of [['rej', 'Rejuvenecido'], ['enr', 'Enfurecido'], ['fort', 'Fortificado']]) if (!(s.ops[fi].stDone || []).includes(r)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bdstimm', tg: fi, rule: r })}'>Stimms (1 PA): ${lb} → ${s.ops[fi].name}</button>`;
      if (acts.includes('bdmom')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bdmom' })}'>Momento de renombre (1 PC): +1 LPA</button>`;
      if (acts.includes('bdcall')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bdcall' })}'>Desprecio insensible (1 PC)</button>`;
      if (acts.includes('exbrut')) for (const gi of E.wcTargets(s, o, 'exbrut')) for (const hh of s.ops.filter(x => x.alive && x.p === o.p && x !== o && !x.ug && E.inCZ(s, x, s.ops[gi]) && x.weapons.some(w => w.m))) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'exbrut', tg: gi, h: hh.i, wi: hh.weapons.findIndex(w => w.m) })}'>Refuerzo brutal (1 PC): ${esName(hh.name)} combate → ${esName(s.ops[gi].name)}</button>`
      if (acts.includes('wmark')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'wmark' })}'>Cortar el velo: colocar marcador de Warp (0 PA)</button>`;
      if (acts.includes('exnun')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'exnun' })}'>Desplegar Nuncio-aquila (0 PA)</button>`
      if (acts.includes('exsig')) for (const gi of E.wcTargets(s, o, 'exsig')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'exsig', tg: gi })}'>Señal (+1 LPA) → ${esName(s.ops[gi].name)}</button>`
      if (acts.includes('exopt')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'exopt' })}'>Óptica (1 PA): Letal 5+ y sin ofuscación</button>`
      if (acts.includes('exapr')) for (const gi of E.wcTargets(s, o, 'exapr')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'exapr', tg: gi })}'>Apresar → ${esName(s.ops[gi].name)}</button>`
      if (acts.includes('exver')) for (const gi of E.wcTargets(s, o, 'exver')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'exver', tg: gi })}'>Veriscant → ${esName(s.ops[gi].name)}</button>`
      if (acts.includes('cinull')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'cinull' })}'>Ritual de anulación (+1" alcance, ahora ${o.nullR || 1}")</button>`
      if (acts.includes('xvfoc')) for (const gi of E.wcTargets(s, o, 'xvfoc')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'xvfoc', tg: gi })}'>Luz marcadora enfocada → ${esName(s.ops[gi].name)}</button>`
      for (const [k, lab] of [['cnover', 'Overcharge (1 PA): +1 LPA'], ['cncran', 'Cranial Overload (1 PA): −1 LPA'], ['cnscar', 'Nanoscarab Beam (1 PA): recupera 3D3'], ['cnctl', 'Canoptek Control (1 PA): acción gratuita'], ['cnmb', 'Molecular Breach (1 PA): teletransporte']]) if (acts.includes(k)) for (const gi of E.wcTargets(s, o, k)) h += `<button class="btn" data-pend='${JSON.stringify({ t: k, tg: gi })}'>${lab} → ${esName(s.ops[gi].name)}</button>`;
      if (acts.includes('cndist')) E.cnDistCands(s, o).forEach((c, i) => { h += `<button class="btn" data-pend='${JSON.stringify({ t: 'cndist', tg: i })}'>Geomantic Disturbance (1 PA): punto (${c.x.toFixed(1)}, ${c.y.toFixed(1)}) · ${c.ne} enemigo(s)</button>`; });
      if (acts.includes('bctrans') && E.wcTargets(s, o, 'bctrans').length) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bctrans' })}'>Transfer Power (1 PA): Network Counteract al terminar</button>`;
      for (const [k, lab] of [['bcgaze', 'Gaze of the Omnissiah (1 PA)'], ['bcomni', 'Omniscanner (1 PA)'], ['bcdata', 'Datacoronal Accumulator (1 PA)']]) if (acts.includes(k)) for (const gi of E.wcTargets(s, o, k)) h += `<button class="btn" data-pend='${JSON.stringify({ t: k, tg: gi })}'>${lab} → ${esName(s.ops[gi].name)}</button>`;
      if (acts.includes('bcnov')) for (const gi of E.wcTargets(s, o, 'bcnov')) { const nm = esName(s.ops[gi].name); for (const [md, lab] of [['engage', 'Network Counteract (Enfrentar)'], ['conceal', 'Network Counteract (Ocultar)'], ['dash', 'Correr gratis']]) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bcnov', tg: gi, mode: md })}'>Network Override (1 PA): ${lab} → ${nm}</button>`; }
      if (acts.includes('bcbreach')) for (const gi of E.wcTargets(s, o, 'bcbreach')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'bcbreach', tg: gi })}'>Breach (1 PA) → muro ${gi}</button>`;
      for (const [k, lab] of [['bcmotem', 'Mote Access: misión'], ['bcmoteh', 'Mote Access: escotilla']]) if (acts.includes(k) && E.wcTargets(s, o, k).length) h += `<button class="btn" data-pend='${JSON.stringify({ t: k })}'>${lab}</button>`;
      if (acts.includes('xvjam')) for (const gi of E.wcTargets(s, o, 'xvjam')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'xvjam', tg: gi })}'>Bloqueo de sistemas (−1 LPA) → ${esName(s.ops[gi].name)}</button>`;
      if (acts.includes('sforb')) for (const gi of E.wcTargets(s, o, 'sforb')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'sforb', tg: gi })}'>Sanctification Orb (1 PA) → ${esName(s.ops[gi].name)}</button>`;
      if (acts.includes('exheal') && /STONESINGER/.test((o.kw || []).join('|')) && E.wcTargets(s, o, 'exheal').length) h += `<button class="btn ghost" data-pend='${JSON.stringify({ t: 'exheal', tg: E.wcTargets(s, o, 'exheal')[0], all: true })}'>Canción de renovación (1 PA): todos los DRAGON MASTER recuperan hasta D3</button>`;
      for (const hk of ['phheal', 'exheal', 'spheal', 'wsheal', 'edwind', 'edclean', 'mwstrike', 'mwslice', 'mwsnatch', 'mwshriek', 'mwclaw', 'mwvox', 'mwcarve', 'spiss', 'spcam']) if (acts.includes(hk)) for (const gi of E.wcTargets(s, o, hk)) h += `<button class="btn" data-pend='${JSON.stringify({ t: hk, tg: gi })}'>${hk === 'phheal' ? (s.team[o.p] === 'battleclade' ? 'Expedient Repair (D3+3 heridas)' : 'Guantelete Hélix (D3+3 heridas)') : hk === 'wsheal' ? 'Bálsamos curativos (D3+3 heridas)' : hk === 'edwind' ? 'Gracia del viento (VELOCIDAD +1)' : ({ spcam: 'Camuflaje avanzado', spiss: 'Encomendar misión (0 PA)', mwstrike: 'Golpe desde arriba (2D3+1)', mwslice: 'Corte desde arriba (D3+1)', mwsnatch: 'Arrebatar', mwshriek: 'Chillido (D3 y −1 LPA)', mwclaw: 'Carga con garras (1)', mwvox: 'Grito vox', mwcarve: 'Golpe tallado (2D3 a ≤2")' })[hk] || hk === 'edclean' ? 'Purificación de la Luna Pálida' : 'Botiquín (2D3 heridas)'} → ${esName(s.ops[gi].name)}</button>`;
      if (acts.includes('gmfuel')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'gmfuel', tg: o.i })}'>Combustible de sangre (1 PA): Severa</button>`;
      if (acts.includes('gmtrans')) for (const gi of E.wcTargets(s, o, 'gmtrans')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'gmtrans', tg: gi })}'>Ritual de transfusión (1 PA) → ${esName(s.ops[gi].name)}</button>`;
      { const GVN = { gvrej: 'Rejuvenate (recupera D3+1 heridas)', gvman: 'Mania (+1 APL)', gvfur: 'Fury (2 Combatir, el 2º gratis)', gvrake: 'Rake (D3 de daño al cargar)', gvsrg: 'Surge (+1" Mov.)', gvrag: 'Rage (+1 Atk melé)' }; const gl = Object.keys(GVN).filter(k => acts.includes(k)); if (gl.length) { h += `<div class="hint" style="width:100%;margin-top:6px">Sanguavitae (0 PA, gasta un nivel del Gore Tank; ahora: ${['vacío', 'medio', 'lleno'][o.gt] || '?'})</div>`; for (const k of gl) h += `<button class="btn" data-pend='${JSON.stringify({ t: k, tg: o.i })}'>${GVN[k]}</button>`; } }
      if (acts.includes('rejuv')) { h += `<div class="hint" style="width:100%;margin-top:6px">Rejuvenecimiento apoplético (1 PA)</div>`; for (const gi of E.wcTargets(s, o, 'rejuv')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'rejuv', tg: gi })}'>Rejuvenecimiento apoplético → ${H(G.names[gi])}</button>`; }
      if (acts.includes('lunge')) { h += `<div class="hint" style="width:100%;margin-top:6px">Embestida tóxica (1 PA): D3+2 de daño y veneno</div>`; for (const gi of E.lungeTargets(s, o)) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'lunge', tg: gi })}'>Embestida → ${H(G.names[gi])}</button>`; }
      if (acts.includes('sac')) h += `<button class="btn" data-pend='${JSON.stringify({ t: 'sac' })}'>Distender saco dorsal<small>1 PA · Letal 5+, +1 Atq, sin límite de alcance</small></button>`;
      if (G.ui.pending) h += `<button class="btn full" data-a="confirm">Confirmar movimiento</button>`;
      if (G.ui.mode) h += `<button class="btn ghost full" data-a="cancel">Cancelar</button>`;
      h += `<button class="btn full" data-a="end">Terminar activación</button></div>`;
    }
  } else if (G.ui.sel != null) {
    const o = s.ops[G.ui.sel];
    if (my && ordChoice(o)) h += `<div class="hint" style="font-weight:700;color:#ffd24a;margin:0 0 4px">Para activar, toca la ficha de orden junto a la carta: Trabarse u Ocultarse.</div>`;
    if (my && o.p === s.active && E.mwNarcOk && E.mwNarcOk(s, s.active)) h += `<div class="acts"><button class="btn ghost" data-a="mwnarc">Malicious Narcissism<small>Ardid 1 PC: saltar activaciones mientras tengas menos operativos listos</small></button></div>`;
    if (my && s.sim && s.act && s.act.op === o.i && !s.act.react && !s.pend && (s.sim.st[o.i === s.sim.a ? s.sim.b : s.sim.a] || (o.i === s.sim.a && s.pair && s.pair.a === o.i))) h += `<div class="acts"><button class="btn ghost" data-a="simsw">Cambiar de operativo<small>${H(s.sim.n || 'Extremis Mind-Link')}: activaciones simultáneas</small></button></div>`;
    if (my && E.cnAnimOk && o.p === s.active && E.cnAnimOk(s, s.active)) h += `<div class="acts"><button class="btn ghost" data-a="cnanim">Animate Obelisk Nodes<small>Ardid (1 PC): mueves los nodos 6" en total en vez de activar</small></button></div>`;
    if (my && E.phMatrixOk && s.act && s.act.op === o.i && E.phMatrixOk(s, o.p)) h += `<div class="acts"><button class="btn ghost" data-a="phmatrix">Comms Array<small>COMMSMAN · una vez por PI: cambia un ardid estratégico usado (sin coste)</small></button></div>`;
    if (my && E.cnNodalOk && s.act && s.act.op === o.i && E.cnNodalOk(s, o.p)) h += `<div class="acts"><button class="btn ghost" data-a="cnnodal">Nodal Response<small>Ardid (1 PC): cambia o usa un ardid estratégico</small></button></div>`;
    if (my && E.cnMmOk && s.act && s.act.op === o.i && E.cnMmOk(s, o.p)) h += `<div class="acts"><button class="btn ghost" data-a="cnmm">Matrix Manipulator<small>El GEOMANCER cuenta como cuarto nodo (una vez por batalla)</small></button></div>`;
    if (my && o.p === s.active && E.spSkipOk && E.spSkipOk(s, s.active)) h += `<div class="acts"><button class="btn ghost" data-a="spskip">Patience<small>Ardid: saltas esta activación</small></button></div>`;
    if (my && o.p === s.active && E.haSkipOk && E.haSkipOk(s, s.active)) h += `<div class="acts"><button class="btn ghost" data-a="haskip">Heinous Arrogance<small>Ardid 1 PC: saltas esta activación</small></button></div>`;
    if (my && o.p === s.active && E.phSkipOk && E.phSkipOk(s, s.active)) h += `<div class="acts"><button class="btn ghost" data-a="phskip">Patient Ambush<small>Ardid 1 PC: saltas esta activación</small></button></div>`;
    if (my && o.p === s.active && E.mwSkipOk && E.mwSkipOk(s, s.active)) h += `<div class="acts"><button class="btn" data-a="mwskip">Saltar activación<small>Malicious Narcissism: tienes menos operativos listos que el rival</small></button></div>`;
    h += opCard(o, true);
    if (my && o.p === s.active && o.ready && o.alive && E.canActivate(s, o) && E.edictTargets(s, o).length) h += `<div class="acts">` + E.edictTargets(s, o).map(gi => `<button class="btn" data-pend='${JSON.stringify({ t: 'act', op: o.i, order: 'engage', edict: gi })}'>Control Edict (1 CP): activar con ${H(G.names[gi])} (Trabarse)</button>`).join('') + `</div>`;
    if (!(my && o.p === s.active && o.ready && o.alive && E.canActivate(s, o)) && o.p === s.active && !o.ready) h += `<p class="hint">Ya se activó en este punto de giro.</p>`;
  } else h += `<p class="hint">Toca un operativo del tablero para ver su ficha.</p>`;
  if (!s.act && !s.pend && isLocal(s.active) && E.bribeOk(s, s.active)) h += `<button class="btn ghost full" data-pend='${JSON.stringify({ t: 'bribe' })}'>Warrant of Trade — Bribe: saltar esta activación (una vez por batalla)</button>`;
  if (!s.act && !s.pend && isLocal(s.active) && E.forebodeOk(s, s.active)) h += `<button class="btn ghost full" data-pend='${JSON.stringify({ t: 'forebode' })}'>Foreboding (1 punto de Presciencia): saltar esta activación</button>`;
  if (!s.over && !my) h += `<p class="hint">${G.mode === 'ai' ? 'La IA está jugando su activación. Su última jugada se resalta en el tablero.' : 'Esperando al rival.'}</p>`;
  if (!MOB() && G.ui.tapSel != null && s.ops[G.ui.tapSel] && (s.act || s.pend) && !(s.act && G.ui.tapSel === s.act.op)) h = `<p class="hint" style="margin:0 0 4px">👆 Operativo tocado: <b>${H(G.names[G.ui.tapSel])}</b> <button class="btn ghost small" id="tapClr">Cerrar ficha</button></p>` + opCard(s.ops[G.ui.tapSel], true) + (s.act ? `<p class="hint" style="margin:8px 0 4px">▶ Operativo activo: <b>${H(G.names[s.act.op])}</b></p>` : '') + h; el.innerHTML = h; if ($('#tapClr')) $('#tapClr').onclick = () => { G.ui.tapSel = null; renderAct(); }; opFloat(s);
  $$('[data-act]', el).forEach(b => b.onclick = () => { const k = b.dataset.act; if (k === 'guard') dispatch({ t: 'ga' }); else if (k === 'mission') dispatch({ t: 'mission' }); else if (k === 'esc') dispatch({ t: 'esc' }); else if (k === 'hatch') dispatch({ t: 'hatch' }); else if (k === 'breach') dispatch({ t: 'breach' }); else if (k === 'scout') dispatch({ t: 'scout' }); else if (k === 'shext') dispatch({ t: 'shext' }); else if (k === 'tydrone') dispatch({ t: 'tydrone' }); else if (k === 'tybomb') dispatch({ t: 'tybomb' }); else if (k === 'dvtun') dispatch({ t: 'dvtun' }); else if (k === 'dvscan') dispatch({ t: 'dvscan' }); else if (k === 'dvsearch') dispatch({ t: 'dvsearch' }); else if (k === 'dvbcn') dispatch({ t: 'dvbcn' }); else if (k === 'njsab') dispatch({ t: 'njsab' }); else if (k === 'amel') dispatch({ t: 'amel' }); else if (k === 'arpk') dispatch({ t: 'arpk' }); else if (k === 'njext') dispatch({ t: 'njext' }); else if (k.startsWith('nopdem')) dispatch({ t: 'nopdem', n: +k.slice(6) }); else if (k === 'abtap') dispatch({ t: 'abtap' }); else if (k === 'abpk') dispatch({ t: 'abpk' }); else if (k === 'shpick') dispatch({ t: 'shpick' }); else if (k.startsWith('tele_')) dispatch({ t: 'tele', k: k.slice(5) }); else if (k === 'burrow' && !G.s.ops[G.s.act.op].ug) dispatch({ t: 'burrow' }); else beginMode(k); });
  if ($('#bzOpen')) $('#bzOpen').onclick = showBZ;
  const eqpSel = n => { const s = G.s, c = s.pend.pcs.find(q => q.n === n); const pc = s.eqp.q[s.pend.p].find(q => q.n === n); G.ui.eqpN = n; if (G.ui.hz == null || G.ui.eqpHzN !== n) { G.ui.hz = pc && pc.ref ? pc.ref.w >= pc.ref.h : true; G.ui.eqpHzN = n; } G.ui.mode = 'eqp'; G.ui.pending = null; G.ui.R = E.eqpReach(s, s.pend.p, n, G.ui.hz); G.ui.cells = new Set(G.ui.R.cells); G.ui.targets = null; refreshAll(); };
  $$('[data-eqp]', el).forEach(b => b.onclick = () => eqpSel(+b.dataset.eqp));
  $$('[data-plcskip]', el).forEach(b => b.onclick = () => dispatch({ t: 'plc', skip: true }));
  $$('[data-plc]', el).forEach(b => b.onclick = () => { G.ui.mode = 'plc'; G.ui.pending = null; G.ui.R = E.plcReach(G.s); G.ui.cells = new Set(G.ui.R.cells); G.ui.targets = null; refreshAll(); });
  $$('[data-eqprot]', el).forEach(b => b.onclick = () => { G.ui.hz = !G.ui.hz; eqpSel(G.ui.eqpN); });
  $$('[data-eqpok]', el).forEach(b => b.onclick = () => confirmMove());
  $$('[data-dply]', el).forEach(b => b.onclick = () => { const i = +b.dataset.dply, o = G.s.ops[i]; G.ui.dplyOp = i; G.ui.sel = i; G.ui.mode = 'deploy'; G.ui.pending = null; G.ui.R = E.deployReach(G.s, o); G.ui.cells = new Set(G.ui.R.cells); G.ui.targets = null; refreshAll(); });
  if ($('#exOpen')) $('#exOpen').onclick = () => showExplore(G.s.pend, true);
  $$('[data-dplyok]', el).forEach(b => b.onclick = () => confirmMove());
  $$('[data-dplysnap]', el).forEach(b => b.onclick = () => { const U = G.ui, op = G.s.ops[U.dplyOp]; if (!U.pending || !op) return; const q = E.dplySnap(G.s, op, U.pending.x, U.pending.y); U.pending = { x: q.x, y: q.y, z: 0 }; toast('Peana pegada al terreno (' + q.x.toFixed(2) + ', ' + q.y.toFixed(2) + ')'); refreshAll(); });
  $$('[data-pend]', el).forEach(b => b.onclick = () => { const x = JSON.parse(b.dataset.pend); if (x.t === 'ord' && $('#ordOne') && $('#ordOne').value !== '') x.one = +$('#ordOne').value; if (x.fmv) { const f = x.fmv; delete x.fmv; const s = G.s, who = s.ops[f.who]; G.ui.mode = 'fmv'; G.ui.pending = null; G.ui.fbase = x; let R = null; try { R = E.reach(s, who, f.mx, f.kind); } catch (e) { R = null; } if (!R) { dispatch(x); return; } G.ui.R = R; G.ui.cells = new Set(R.cells.filter(k => isFinite(R.dist[k]) && R.dist[k] <= f.mx)); G.ui.targets = null; if (!G.ui.cells.size) { G.ui.mode = null; dispatch(x); return; } toast('Elige el destino (máx. ' + f.mx + '")'); refreshAll(); return; } dispatch(x); });
  $$('[data-card]', el).forEach(b => b.onclick = () => showOpCard(+b.dataset.card));
  $$('[data-a]', el).forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'mwnarc' || a === 'mwskip' || a === 'phskip' || a === 'haskip' || a === 'spskip' || a === 'simsw' || a === 'cnanim' || a === 'cnnodal' || a === 'phmatrix' || a === 'cnmm') { dispatch({ t: a }); return; }
    if (a === 'act-engage' || a === 'act-conceal') { dispatch({ t: 'act', op: G.ui.sel, order: a === 'act-engage' ? 'engage' : 'conceal' }); }
    if (a === 'end') { if (G.s.act && !G.s.act.react && E.taMustLand && E.taMustLand(G.s, G.s.ops[G.s.act.op])) { toast('Drop Insertion: este operativo debe aterrizar; menos de la mitad del equipo puede seguir arriba al final del punto de giro 1.'); return; } G.ui.mode = null; G.ui.pending = null; dispatch({ t: 'end' }); }
    if (a === 'cancel') { G.ui.mode = null; G.ui.pending = null; refreshAll(); }
    if (a === 'confirm') confirmMove();
  });
}
function renderTeams(el, left) {
  const s = G.s; if (!s) return; let h = '';
  for (let p = 0; p < (s.np || 2); p++) {
    h += `<h3 style="color:${COL[p]}">Jugador ${p + 1} · ${H(teamById(s.team[p] || G.setup.teams[p].id).name)}${(G.mode === 'ai' && p !== G.me) ? ' (IA)' : ''}</h3>`;
    for (const o of s.ops.filter(x => x.p === p)) h += `<div class="op-row ${G.ui.sel === o.i ? 'sel' : ''}" data-sel="${o.i}" style="${o.alive ? '' : 'opacity:.4'}"><span style="color:${COL[p]}">●</span><span>${H(G.names[o.i])}${o.alive ? '' : ' ✖'}<div class="wbar ${E.injured(o) ? 'low' : ''}" style="margin-top:3px"><i style="width:${o.alive ? o.w / o.W * 100 : 0}%"></i></div></span><span class="st">${o.alive ? o.w + '/' + o.W : ''} ${o.alive ? (o.ready ? '<b style="color:var(--ok)">listo</b>' : 'activado') : ''}</span></div>`;
    h += `<div class="row" style="margin-top:6px"><button class="btn ghost small" data-fc="${p}">Cartas de facción</button></div>`;
  }
  if (left) { $('#rosterP0').innerHTML = h; $('#rosterP1').innerHTML = ''; el = $('#sideLeft'); } else { const sl = [...el.querySelectorAll('.acts,.bscroll,.ueq,.chips')].map(x => x.scrollLeft); el.innerHTML = h; if (sl.some(v => v)) el.querySelectorAll('.acts,.bscroll,.ueq,.chips').forEach((x, i) => { if (sl[i]) x.scrollLeft = sl[i]; }); } /* conserva el desplazamiento horizontal al elegir */
  $$('[data-sel]', el).forEach(b => b.onclick = () => { G.ui.sel = +b.dataset.sel; if (!G.s.act) { G.ui.mode = null; } refreshAll(); });
  $$('[data-fc]', el).forEach(b => b.onclick = () => showFactionCards(teamById(G.setup.teams[+b.dataset.fc].id)));
}
function renderLog() { $('#pLog').innerHTML = G.log.slice(0, 120).map(l => `<div class="logline ${l.cls}">${H(l.t)}</div>`).join('') || '<p class="hint">Aún no hay jugadas.</p>'; }

/* ============================ DADOS ============================ */
function dieHTML(r, c, rr) { return `<span class="die ${c} ${rr ? 'rr' : ''}">${r}</span>`; }
function rollFx(d, ms) { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; const N = ms ? Math.round(ms / 60) : 6; d.querySelectorAll('.die').forEach((e, i) => { const fin = e.textContent; let n = 0; const iv = setInterval(() => { if (++n > N + i * (ms ? 3 : 1)) { clearInterval(iv); e.textContent = fin; return; } e.textContent = 1 + Math.floor(Math.random() * 6); }, 60); e.textContent = 1 + Math.floor(Math.random() * 6); }); }
function pushDice(html, ms = 4200) { const b = $('#dicebox'); const d = document.createElement('div'); d.className = 'dicecard'; d.innerHTML = html; b.appendChild(d); rollFx(d); while (b.children.length > 2) b.firstChild.remove(); setTimeout(() => d.remove(), ms); }
function showDice(ev) {
  const s = G.s; const dm = ev.res.reduce((x, r) => x + r.dmg, 0); const t0 = s.ops[ev.tg];
  const def = ev.res[0].def.map(r => ({ r, c: r === 6 ? 'c' : r >= t0.save ? 'n' : 'm' }));
  pushDice(`<div class="t" style="color:${COL[ev.p]}">${H(G.names[ev.op])} ▸ ${H(G.names[ev.tg])} · ${H(ev.w)}</div>
  <div class="dice"><small>Ataque</small>${ev.atk.map(d => dieHTML(d.r, d.c, d.rr)).join('')}${ev.acc ? `<span class="pill">+${ev.acc} precisión</span>` : ''}${ev.obsc ? '<span class="pill">ofuscado</span>' : ''}${ev.pb ? '<span class="pill">a bocajarro</span>' : ''}</div>
  <div class="dice"><small>Salvación${ev.res[0].cover ? ' (cobertura)' : ''}</small>${def.map(d => dieHTML(d.r, d.c)).join('') || '—'}</div>
  <div class="t">${dm ? '−' + dm + ' heridas' : 'Sin daño'}${ev.res.length > 1 ? ' · ' + ev.res.length + ' objetivos' : ''}</div>`);
}
function showFightDice(ev) {
  pushDice(`<div class="t" style="color:${COL[ev.p]}">⚔ ${H(G.names[ev.op])} vs ${H(G.names[ev.tg])}</div>
  <div class="dice"><small>${H(ev.w)}</small>${ev.atk.map(d => dieHTML(d.r, d.c, d.rr)).join('')}${ev.assist && ev.assist[0] ? `<span class="pill">+${ev.assist[0]} asistencia</span>` : ''}</div>
  <div class="dice"><small>${H(ev.tw || '—')}</small>${ev.def.map(d => dieHTML(d.r, d.c, d.rr)).join('') || '—'}${ev.assist && ev.assist[1] ? `<span class="pill">+${ev.assist[1]} asistencia</span>` : ''}</div>
  <div class="dice">${ev.steps.map(x => `<span class="pill">${x.kind === 'strike' ? '⚔ ' + (x.dmg ? '−' + x.dmg : '0') : '🛡 parada'}</span>`).join(' ')}</div>`);
}

/* ============================ ACCIONES HUMANAS ============================ */
function beginMode(k) {
  const s = G.s; const o = s.ops[s.act.op]; G.ui.mode = k; G.ui.pending = null;
  if (k === 'spr') { openSprint(); return; } if (k === 'turn') { openTurn(); return; }
  if (k === 'shoot' || k === 'fight' || k === 'hfight') {
    const m = new Map(); const hfs = k === 'hfight' ? new Set(E.hfightTargets(s, o).map(x => x.tg)) : null;
    for (const t of s.ops) { let best = -1; o.weapons.forEach(w => { if (k === 'shoot' ? (!w.m && E.targetable(s, o, w, t)) : (w.m && t.alive && t.p !== o.p && (hfs ? hfs.has(t.i) : E.inCZ(s, o, t)))) best = Math.max(best, k === 'shoot' ? E.expectedShoot(s, o, w, t) : E.expectedFight(s, o, w, t)); }); if (best >= 0) m.set(t.i, best); }
    G.ui.targets = m; G.ui.R = null; G.ui.cells = null;
    if (!m.size) { toast('No hay objetivos válidos'); G.ui.mode = null; }
  } else if (k === 'burrow') { G.ui.R = E.burrowReach(s, o); G.ui.cells = new Set(G.ui.R.cells); G.ui.targets = null; if (!G.ui.cells.size) { toast('No hay casillas válidas en el Túnel'); G.ui.mode = null; }
  } else if (k === 'hmv') { G.ui.R = E.reach(s, o, s.act.hv.rem, 'rep'); G.ui.cells = new Set(G.ui.R.cells); G.ui.targets = null; if (!G.ui.cells.size) { toast('No hay casillas válidas'); G.ui.mode = null; }
  } else { const jm = /^(rep|fb|chg)j$/.test(k), bm = /^(fb|chg)b$/.test(k), kb = (jm || bm) ? k.slice(0, -1) : k; s.mwJ = jm; s.blkJ = bm; try { G.ui.R = E.reach(s, o, E.moveAllow(s, o, kb), kb); } finally { s.mwJ = false; s.blkJ = false; } G.ui.cells = new Set(G.ui.R.cells); G.ui.targets = null; if (!G.ui.cells.size) { toast('No hay casillas válidas'); G.ui.mode = null; } }
  refreshAll(); if (innerWidth < 760) setTab('act');
}
function confirmMove() {
  const p = G.ui.pending, k = G.ui.mode; if (!p || !k) return;
  if (k === 'plc') { G.ui.mode = null; G.ui.pending = null; G.ui.R = null; G.ui.cells = null; dispatch({ t: 'plc', x: p.x, y: p.y }); return; }
  if (k === 'eqp') { const n = G.ui.eqpN, hz = G.ui.hz; G.ui.mode = null; G.ui.pending = null; G.ui.R = null; G.ui.cells = null; G.ui.eqpN = null; dispatch({ t: 'eqp', n, x: p.x, y: p.y, hz }); return; }
  if (k === 'fmv') { const b = G.ui.fbase; G.ui.mode = null; G.ui.pending = null; G.ui.R = null; G.ui.cells = null; G.ui.fbase = null; dispatch({ ...b, x: p.x, y: p.y, z: p.z || 0 }); return; }
  if (k === 'deploy') { const op = G.ui.dplyOp; G.ui.mode = null; G.ui.pending = null; G.ui.R = null; G.ui.cells = null; G.ui.dplyOp = null; dispatch({ t: 'dply', op, x: p.x, y: p.y, z: p.z || 0 }); return; }
  G.ui.mode = null; G.ui.pending = null; G.ui.R = null; G.ui.cells = null; dispatch(/^(rep|fb|chg)j$/.test(k) ? { t: 'mv', k: k.slice(0, -1), jmp: true, x: p.x, y: p.y, z: p.z || 0 } : { t: 'mv', k, x: p.x, y: p.y, z: p.z || 0 });
}
function chooseWeapon(tg) {
  const s = G.s, o = s.ops[s.act.op], t = s.ops[tg], k = G.ui.mode;
  const opts = o.weapons.map((w, wi) => ({ w, wi })).filter(({ w }) => k === 'shoot' ? (!w.m && E.targetable(s, o, w, t)) : (w.m));
  const box = (h) => { $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button>` + h; $('#modal').classList.remove('peek'); $('#modal').hidden = false; $('#mx').onclick = closeModal; };
  box(`<h2>${k === 'shoot' ? 'Disparar a' : 'Combatir con'} ${H(G.names[tg])}</h2><p class="hint">${t.w}/${t.W} heridas · salvación ${t.save}+ ${k === 'shoot' && E.inCover(s, o, t) ? '· en cobertura' : ''}</p><div class="wlist">${opts.map(({ w, wi }) => `<button class="wopt" data-wi="${wi}"><b>${H(w.n)}</b><span>≈ ${(k === 'shoot' ? E.expectedShoot(s, o, w, t) : E.expectedFight(s, o, w, t)).toFixed(1)} daño</span><small>A${w.atk} · impacta ${w.hit}+ · daño ${w.d}/${w.cd}${w.wr ? ' · ' + H(w.wr) : ''}</small></button>`).join('')}</div>`);
  const crOn = k === 'fight' && o.weapons && E.mwChampRule && E.mwChampRule(s, o, t); // Chaos Champion: elige la regla de arma
  if (crOn) { const bx = $('#modalBox'); bx.insertAdjacentHTML('beforeend', `<p class="hint">Chaos Champion: regla de arma para sus armas cuerpo a cuerpo en esta secuencia</p><select id="crSel">${['balanced', 'brutal', 'punishing', 'severe', 'shock'].map(r => `<option value="${r}" ${r === 'severe' ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select>`); }
  $$('.wopt').forEach(b => b.onclick = () => { const cr = crOn && $('#crSel') ? $('#crSel').value : undefined; closeModal(); const wi = +b.dataset.wi; G.ui.mode = null; G.ui.targets = null; dispatch(cr ? { t: k, tg, wi, cr } : { t: k, tg, wi }); });
}

/* ============================ MODALES ============================ */
/* Exodite MOUNTED: Esprintar / Girar */
function openSprint() {
  const s = G.s, o = s.ops[s.act.op]; const isLey = /LEYSTALKER/.test((o.kw || []).join('|')); G.ui.mode = 'spr'; G.ui.spr = G.ui.spr && G.ui.spr.op === o.i ? G.ui.spr : { op: o.i, plan: { legs: [{ pv: 0, d: 6 }], fin: 0 } };
  const m = $('#modal'); m.classList.toggle('peek', MOB());
  const rowH = (L, i) => `<div class="sprrow" data-i="${i}"><b>Tramo ${i + 1}</b> pivote antes <input type="range" min="-45" max="45" step="5" value="${L.pv}" data-f="pv"><span class="pvv">${L.pv}°</span> <select data-f="dir"><option value="1" ${L.d > 0 ? 'selected' : ''}>adelante</option><option value="-1" ${L.d < 0 ? 'selected' : ''}>atrás</option></select> <select data-f="d">${[...Array(12).keys()].map(n => `<option ${Math.abs(L.d) === n + 1 ? 'selected' : ''}>${n + 1}</option>`).join('')}</select></div>`;
  const draw1 = () => {
    const pl = G.ui.spr.plan; const f = pl.legs.reduce((a, L) => a + (L.d > 0 ? L.d : 0), 0), b = pl.legs.reduce((a, L) => a - (L.d < 0 ? L.d : 0), 0); const tot = o.edTP === s.tp ? o.edTot || 0 : 0;
    $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h3 style="margin:4px 0">Esprintar · ${H(G.names[o.i])}</h3>` + pl.legs.map(rowH).join('') +
      `<div class="sprrow">Pivote final <input type="range" min="-45" max="45" step="5" value="${pl.fin}" data-f="fin"><span class="pvv">${pl.fin}°</span></div>
       ${o.sprOpen ? '<div class="hint">Esprintar abierto: continúa con la distancia restante.</div>' : `<div class="sprrow">Modo <select id="sprMode"><option value="">Normal</option>${isLey && (o.upg || []).includes('nomad') ? '<option value="nomad">Ejecutor nómada (Disparar a mitad)</option>' : ''}${s.cp[o.p] >= 1 && !s.fpu[o.p].includes('edride') ? '<option value="ride">Maestría ecuestre (1 PC: Recoger/Colocar/misión a mitad)</option>' : ''}</select></div>`}
       <div class="hint" id="sprInfo"></div>
       <div class="row"><button class="btn" id="sprAdd">+ tramo</button><button class="btn" id="sprDel">− tramo</button><button class="btn ok" id="sprOk">Esprintar</button></div>${o.sprOpen || s.cp[o.p] < 1 || s.fpu[o.p].includes('edjump') || o.did.spr ? '' : '<div class="row"><button class="btn ghost" id="sprJump">Salto (ardid 1 PC)…</button></div>'}`;
    $('#mx').onclick = () => { G.ui.spr = null; G.ui.mode = null; closeModal(); };
    $$('#modalBox .sprrow').forEach(row => { const i = row.dataset.i; row.querySelectorAll('[data-f]').forEach(inp => inp.oninput = inp.onchange = () => {
      const fl = inp.dataset.f; if (fl === 'fin') { pl.fin = +inp.value; row.querySelector('.pvv').textContent = pl.fin + '°'; } else { const L = pl.legs[+i]; if (fl === 'pv') { L.pv = +inp.value; row.querySelector('.pvv').textContent = L.pv + '°'; } else { const dir = +row.querySelector('[data-f=dir]').value, d = +row.querySelector('[data-f=d]').value; L.d = dir * d; } } info(); }); });
    $('#sprAdd').onclick = () => { if (pl.legs.length < 8) { pl.legs.push({ pv: 0, d: 3 }); draw1(); } };
    $('#sprDel').onclick = () => { if (pl.legs.length > 1) { pl.legs.pop(); draw1(); } };
    if ($('#sprJump')) $('#sprJump').onclick = () => { G.ui.spr = null; G.ui.mode = null; closeModal(); openJump(); };
    $('#sprOk').onclick = () => { const r = E.sprRun(s, o, pl, 0.5); if (!r.ok) { toast(r.why); return; } G.ui.spr = null; G.ui.mode = null; closeModal(); const md = $('#sprMode') ? $('#sprMode').value : ''; dispatch({ t: 'spr', plan: JSON.parse(JSON.stringify(pl)), ...(md ? { open: md } : {}) }); };
    info();
  };
  const info = () => { const pl = G.ui.spr.plan, r = E.sprRun(s, o, pl, 0.5); const f = pl.legs.reduce((a, L) => a + (L.d > 0 ? L.d : 0), 0), b = pl.legs.reduce((a, L) => a - (L.d < 0 ? L.d : 0), 0), tot = o.edTP === s.tp ? o.edTot || 0 : 0;
    const el = $('#sprInfo'); if (el) el.innerHTML = `Adelante ${(o.sprF || 0) + f}/9 · atrás ${(o.sprB || 0) + b}/3 · por PI ${tot + f + b}/12 ${r.ok ? '· ' + (r.cz ? '<b>acaba en zona de control (Cargar)</b>' : 'válido') + ' · VELOCIDAD ' + ((b > 0 || f < 4) ? '3-' : f >= 7 ? '7+' : '4+') : '· <span style="color:#ff8a8a">' + H(r.why) + '</span>'}`; };
  draw1(); m.hidden = false;
}
function openJump() {
  const s = G.s, o = s.ops[s.act.op]; const m = $('#modal'); m.classList.toggle('peek', MOB()); let ang = 0, dd = 1;
  const draw1 = () => { $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h3 style="margin:4px 0">Salto · ${H(G.names[o.i])}</h3><p class="hint">Se recoloca a ≤1" en horizontal (cuenta 3", VELOCIDAD 3-). No a través de terreno de más de 2" ni sobre Vantage alto.</p>
    <div class="sprrow">Dirección <input type="range" min="0" max="355" step="5" value="${ang}" id="jAng"><span id="jAv">${ang}°</span></div><div class="sprrow">Distancia <input type="range" min="0.25" max="1" step="0.25" value="${dd}" id="jD"><span id="jDv">${dd}"</span></div><div class="row"><button class="btn ok" id="jOk">Saltar</button></div>`;
    $('#mx').onclick = () => { closeModal(); }; $('#jAng').oninput = e => { ang = +e.target.value; $('#jAv').textContent = ang + '°'; }; $('#jD').oninput = e => { dd = +e.target.value; $('#jDv').textContent = dd + '"'; };
    $('#jOk').onclick = () => { const a = ang * Math.PI / 180; closeModal(); dispatch({ t: 'spr', jump: true, x: o.x + Math.cos(a) * dd, y: o.y + Math.sin(a) * dd }); }; };
  draw1(); m.hidden = false;
}
function openTurn() {
  const s = G.s, o = s.ops[s.act.op]; G.ui.mode = 'turn'; G.ui.turn = { op: o.i, deg: 45 }; const m = $('#modal'); m.classList.toggle('peek', MOB());
  $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h3 style="margin:4px 0">Girar · ${H(G.names[o.i])}</h3><div class="sprrow">Pivote <input type="range" min="-45" max="45" step="5" value="45" id="trnR"><span id="trnV">45°</span></div><div class="row"><button class="btn ok" id="trnOk">Girar</button></div>`;
  $('#mx').onclick = () => { G.ui.turn = null; G.ui.mode = null; closeModal(); };
  $('#trnR').oninput = e => { G.ui.turn.deg = +e.target.value; $('#trnV').textContent = G.ui.turn.deg + '°'; };
  $('#trnOk').onclick = () => { const d = G.ui.turn.deg; G.ui.turn = null; G.ui.mode = null; closeModal(); dispatch({ t: 'turn', deg: d }); };
  m.hidden = false;
}
/* Aviso emergente de acciones automáticas: lista lo que el motor va a hacer por sí solo y espera al OK del jugador. */
function showExplore(pd, force) { // paso 4 · Explorar en una ventana, con las cartas Equipar / Ardid / Reposicionar (o las opciones de equipo)
  const key = 'ex:' + pd.k + ':' + pd.p; if (!force && G.exShown === key) return; G.exShown = key;
  const T = { eq: ['Equipar', 'Elige una opción de equipo adicional. No puede ser una opción que ya hayas elegido.'], ard: ['Ardid', 'Durante la primera fase de estrategia, puedes usar un ardid estratégico por 0 PM.'], rep: ['Reposicionar', 'Realiza una acción libre de Reposicionarse con un agente amigo que esté completamente dentro de tu zona de descenso. Debe terminar esa acción a 3" o menos de tu zona de descenso.'] };
  const pick = pd.k === 'explpick', tid = G.s.team[pd.p], who = G.mode === 'hot' ? `Jugador ${pd.p + 1}` : 'Tú';
  const eqTxt = v => String(v).startsWith('f_') ? ((E.FEQ[tid] || []).find(f => 'f_' + f.id === v) || {}).t : E.EQUIP_TXT[v];
  const card = x => { const t = pick ? T[x.v] : [x.l, eqTxt(x.v)]; return `<div class="tcard excard"><div class="tc-h">${pick ? 'PASO 4 · EXPLORAR' : 'EQUIPAR · OPCIÓN DE EQUIPO'}</div><div class="tc-t">${H(t[0])}</div><div class="tc-s"><p>${H(t[1] || '')}</p></div><button class="btn" data-ex="${H(String(x.v))}">Elegir ${H(t[0])}</button></div>`; };
  $('#modal').classList.remove('peek'); $('#modalBox').innerHTML = `<button class="icon x" id="mx" aria-label="Cerrar">✕</button><h2>${who}: paso 4 · Explorar</h2><p class="hint">${pick ? 'Elige en secreto una opción. Se revelan a la vez; quien tiene la iniciativa de despliegue resuelve primero. Equipar gana a Ardid, Ardid gana a Reposicionar y Reposicionar gana a Equipar; quien gana tiene la iniciativa del primer punto de inflexión.' : H(pd.title)}</p>` + stripShell(pd.opts.map(card), 'tacstrip');
  $('#modal').hidden = false; $('#mx').onclick = closeModal; stripWire($('#modalBox'), pd.opts.length, null); $$('#modalBox [data-ex]').forEach(b => b.onclick = () => { closeModal(); dispatch({ t: 'gch', v: b.dataset.ex }); });
}
function showNote(pd) {
  if (G.replaying) return;
  if (ployMode() && !pd.note.some(x => /ardid|gambito|ploy/i.test(x))) { if (G.s && G.s.pend && G.s.pend.key === pd.key) dispatch({ t: 'gch', v: 1 }); return; }
  const key = pd.key; if (G.noteKey === key && !$('#modal').hidden) return; G.noteKey = key;
  const who = G.mode === 'hot' ? `Jugador ${pd.p + 1}` : 'Aviso';
  $('#modal').classList.remove('peek'); $('#modalBox').innerHTML = `<h2>${who}: acciones automáticas</h2><p class="hint">El juego va a aplicar esto por sí solo:</p><ul class="notes">` + pd.note.map(x => `<li>${H(x)}</li>`).join('') + `</ul><div class="acts"><button class="btn" id="noteOk">OK</button></div>`;
  $('#modal').hidden = false; $('#noteOk').onclick = () => { closeModal(); G.noteKey = null; if (G.s && G.s.pend && G.s.pend.key === key) dispatch({ t: 'gch', v: 1 }); };
}
function showMissionCards() { const s = G.s; if (!s) return; const v = viewer(); let h = '<h2>Cartas de misión</h2><p class="hint">Cartas originales del pack de Operaciones Aprobadas (en inglés).</p>';
  if (s.crit >= 1 && s.crit <= 9) h += `<h3>Op. crítica · ${H(E.CRIT_NAMES[s.crit])}</h3><img class="tc-img" src="ao/crit_${s.crit}.webp" alt="Carta op. crítica ${H(E.CRIT_NAMES[s.crit])}">`; else if (s.crit) h += `<h3>Op. crítica · ${H(E.CRIT_NAMES[s.crit] || '')}</h3>`;
  if (s.aop && s.tac) for (const p of [0, 1]) { const k = s.tac[p]; if (!k) continue; const vis = s.tacRev[p] || p === v; h += `<h3>Op. táctica · Jugador ${p + 1}${s.tacRev[p] ? '' : ' (oculta)'}</h3>` + (!vis ? '<p class="hint">Oculta hasta que se revele.</p>' : TACIMG.has(k) ? `<img class="tc-img" src="ao/tac_${k}.webp" alt="Carta ${H(E.TAC[k][1])}">` : tacCardHTML(k).replace(/<button[^>]*data-tac[^>]*>.*?<\/button>/, '')); }
  h += '<button class="btn" id="mcClose">Cerrar</button>'; $('#modalBox').innerHTML = h; $('#modal').hidden = false; $('#mcClose').onclick = closeModal; }
{ const b = $('#btnCards'); if (b) b.onclick = showMissionCards; }
function closeModal() { const m = $('#modal'); m.hidden = true; m.classList.remove('peek'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function showOpCard(i) {
  if (MOB()) { G.ui.tapSel = i; G.ui.cardForce = true; G.ui.cardOpen = false; closeModal(); opFloat(G.s); return; } /* móvil: la datacard sale en el desplegable inferior */
  const o = G.s.ops[i]; const m = $('#modal'); m.classList.toggle('peek', MOB());
  $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><div class="cards one">${(o.img || []).slice(0, 1).map(u => ESM.cardOrNull(u, 'zoom', opByImg(u)) || `<img src="${IMGU(u)}" alt="${H(G.names[i])}">`).join('') || '<p class="hint">Sin imagen.</p>'}${opTokChips(o).replace('tkrow', 'tkrow over')}</div>`; m.hidden = false; $('#mx').onclick = closeModal;
}
function showFactionCards(t, tab0) {
  const names = { roster: 'Plantilla', rule: 'Regla de facción', equipment: 'Equipo', strategy: 'Ardides estratégicos', firefight: 'Ardides de combate' };
  const keys = Object.keys(t.cards || {}).filter(k => t.cards[k].length);
  let cur = keys.includes(tab0) ? tab0 : keys[0];
  const draw = () => {
    $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>${H(t.name)}</h2><div class="rtab">${keys.map(k => `<button data-k="${k}" class="${k === cur ? 'on' : ''}">${names[k] || k} (${t.cards[k].length})</button>`).join('') || '<span class="hint">Sin cartas de facción en los archivos.</span>'}</div><div class="cards">${cur ? t.cards[cur].map(u => ESM.cardOrNull(u, '') || `<img loading="lazy" src="${u}">`).join('') : ''}</div>`;
    $('#mx').onclick = closeModal; $$('.rtab button').forEach(b => b.onclick = () => { cur = b.dataset.k; draw(); });
  };
  draw(); $('#modal').hidden = false;
}

const WR_DEF = [
  [/^(accurate|precis)/i, 'Accurate x', 'Puedes retener hasta x dados de ataque como impactos normales sin tirarlos.'],
  [/^(balanced|equilibrad)/i, 'Balanced', 'Puedes repetir 1 dado de ataque.'],
  [/^(blast|ráfaga|rafaga|área|area)/i, 'Blast x"', 'Tras resolver el blanco primario, cada otro agente visible a ≤ x" de él también es blanco (se resuelve contra cada uno).'],
  [/^(ceaseless|incesante)/i, 'Ceaseless', 'Puedes repetir todos tus dados de ataque que muestren un mismo valor.'],
  [/^(devastating|devastador)/i, 'Devastating x', 'Cada impacto crítico retenido inflige x de daño al blanco al instante.'],
  [/^(heavy|pesad)/i, 'Heavy', 'Solo puede usarse si el agente no se ha movido en esta activación (salvo que se indique Reposicionarse o Correr).'],
  [/^hot/i, 'Hot', 'Tras disparar, tira 1D6: si es menor que el valor de Impactar del arma, el agente sufre daño igual al doble del resultado.'],
  [/^(lethal|letal)/i, 'Lethal x+', 'Tus impactos críticos se consiguen con x+ en lugar de 6.'],
  [/^(limited|limitad)/i, 'Limited x', 'El arma solo puede usarse x veces por batalla.'],
  [/^(piercing crits|críticos de pen|criticos de pen|penetración crít)/i, 'Piercing Crits x', 'Si retienes algún impacto crítico, el defensor retira x dados de defensa.'],
  [/^(piercing|penetración|penetracion|perforante)/i, 'Piercing x', 'El defensor retira x dados de defensa antes de tirarlos.'],
  [/^punishing/i, 'Punishing', 'Si retienes algún crítico, puedes retener también un fallo como impacto normal.'],
  [/^(rending|desgarrador)/i, 'Rending', 'Si retienes algún crítico, puedes retener un impacto normal como crítico.'],
  [/^(saturate|saturación|saturacion)/i, 'Saturate', 'El defensor no puede retener dados de cobertura.'],
  [/^seek/i, 'Seek (Light)', 'Al elegir blancos, ignora Ocultarse del enemigo cuando el único obstáculo es terreno Ligero.'],
  [/^severe/i, 'Severe', 'Si no retienes ningún crítico, puedes retener un impacto normal como crítico.'],
  [/^shock/i, 'Shock', 'Al retener un crítico, descartas además 1 dado de defensa retenido del blanco.'],
  [/^(silent|silencios)/i, 'Silent', 'Puede dispararse con la orden Ocultarse.'],
  [/^stun/i, 'Stun', 'Al retener un crítico, el blanco sufre −1 LPA hasta el final de su próxima activación.'],
  [/^torrent/i, 'Torrent x"', 'Tras el blanco primario, cada otro agente a ≤ x" del primario (y visible) también es blanco.'],
  [/^brutal/i, 'Brutal', 'El oponente solo puede bloquear con dados críticos.'],
  [/^range|^alcance/i, 'Range x"', 'Distancia máxima a la que puede dispararse el arma.']
];

async function offlineDL(btn) {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return toast('Esta versión ya lleva todo guardado, o hay que abrir el juego desde su dirección web (HTTPS)');
  const reg = await navigator.serviceWorker.ready.catch(() => null); if (!reg || !reg.active) return toast('Espera un momento y vuelve a intentarlo');
  let list; try { list = await (await fetch('files.json', { cache: 'no-store' })).json(); } catch (e) { return toast('No se encuentra la lista de archivos'); }
  const set = btn || document.createElement('button'); const orig = set.textContent;
  navigator.serviceWorker.onmessage = ev => { const d = ev.data || {}; if (d.t !== 'precache') return; set.textContent = d.end ? (d.fail ? `Terminado con ${d.fail} fallos: repite` : '✔ Todo guardado: ya puedes jugar sin conexión') : `Descargando… ${Math.round(100 * d.done / d.total)} %`; if (d.end) { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { } } };
  set.textContent = 'Descargando… 0 %'; reg.active.postMessage({ t: 'precache', urls: list });
}
function showKeywords() {
  const s = G.s, np = Math.min(2, s.np || 2); const v = viewer();
  const order = np > 1 ? [v, 1 - v] : [v];
  const rules = new Map();
  const blocks = order.map((p, idx) => {
    const T = G.setup.teams[p], t = teamById(T.id); if (!t) return '';
    const ids = (T.ops && T.ops.length ? T.ops : t.ops.map(o => o.id)).map(baseId);
    const ops = t.ops.filter(o => ids.includes(o.id));
    const kws = new Map(); const wr = new Set();
    for (const o of ops) {
      for (const k of (o.kw || [])) { if (!kws.has(k)) kws.set(k, []); kws.get(k).push(o.name); }
      for (const w of (o.w || [])) for (const r of String(w.wr || '').split(/,\s*/)) { const n = r.trim(); if (!n) continue; const d = WR_DEF.find(x => x[0].test(n)); if (d && d[1] !== 'Range x"') wr.add(d[1]); }
    }
    const kwH = [...kws.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `<div class="kwrow"><b>${H(k)}</b><span>${H([...new Set(n)].join(', '))}</span></div>`).join('') || '<p class="hint">Sin palabras clave.</p>';
    const wrH = WR_DEF.filter(d => wr.has(d[1])).map(d => `<div class="kwrow"><b>${H(d[1])}</b><span>${H(d[2])}</span></div>`).join('');
    return `<h3 style="color:${COL[p]}">${idx === 0 ? 'Tu banda' : 'Banda rival'} · ${H(t.name)}</h3><h4>Palabras clave de los agentes</h4>${kwH}${wrH ? `<h4>Reglas especiales de armas</h4>${wrH}` : ''}`;
  }).join('<hr>');
  $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>Palabras clave</h2>${blocks}`;
  $('#modal').hidden = false; $('#mx').onclick = closeModal;
}
function showRules() {
  $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>Cómo se juega (Libro básico 2024)</h2><p><button class="btn small" onclick="ktTutorial(0)">Ver el tutorial</button></p>
  <p><b>Batalla:</b> 4 puntos de inflexión. Fase de estrategia: desempate de iniciativa (el ganador decide; aquí la toma), +1 PM cada jugador (tras el primer PI, quien no tiene la iniciativa gana 2 PM), todos los agentes quedan apostados. Fase de tiroteo: se alternan activaciones empezando por la iniciativa.</p>
  <p><b>Órdenes:</b> <i>Trabarse</i> permite todas las acciones y reaccionar. <i>Ocultarse</i>: no puede Disparar (salvo armas Silenciosas) ni Cargar ni reaccionar, pero <b>no es blanco válido mientras está a cubierto</b>. Los agentes se despliegan Ocultos.</p>
  <p><b>Acciones</b> (cada una una vez por activación, hasta el LPA): Reposicionarse 1PA (Mov.), Correr 1PA (3"), Retroceder 2PA (solo en zona de control enemiga), Cargar 1PA (Mov.+2", termina en zona de control enemiga), Disparar 1PA, Combatir 1PA, Ponerse en guardia 1PA, y la acción de misión. Reposicionarse no se combina con Retroceder/Cargar; Correr no con Cargar; Retroceder y Cargar no con otros movimientos.</p>
  <p><b>Zona de control:</b> 1" y visible. No puedes Disparar estando en la zona de control enemiga, ni a un blanco con agentes tuyos en su zona. <b>Reaccionar:</b> si todos tus agentes están usados y el rival aún tiene apostados, un agente usado con Trabarse hace gratis una acción de 1PA (máx. 2" de movimiento), una vez por PI.</p>
  <p><b>Ponerse en guardia:</b> una vez por activación enemiga, tras una acción del enemigo puedes interrumpirla y que un agente en guardia Combata o Dispare gratis (a bocajarro en zona de control: Impactar −1 y sin contraataque).</p>
  <p><b>Disparo:</b> blanco válido = visible; si está Oculto y a cubierto, no lo es. Cobertura = terreno interpuesto dentro de 1" del blanco (no si el atacante está a ≤2"): una salvación normal gratis. Ofuscado (terreno Pesado interpuesto): se descarta un éxito y los críticos pasan a normales. Salvación: 3 dados; normal bloquea normal, crítico bloquea cualquiera, dos normales bloquean un crítico.</p>
  <p><b>Combate:</b> ambos tiran a la vez; cada agente asistente (en la zona del enemigo y en la de ningún otro) mejora Impactar en 1. Se alternan resolviendo dados, empezando el atacante: golpear (daño) o bloquear. Heridos (&lt; mitad): Mov. −2" (mín. 4") e Impactar +1.</p>
  <p><b>Puntos de victoria:</b> <i>Op. de asesinato</i>: 1 PV por cada nueva nota de asesinato (según agentes enemigos incapacitados) y 1 PV al final si tu nota supera la del rival. <i>Op. crítica</i> (Asegurar / Saquear / Transmisión, sorteada al inicio): desde el PI 2. Gana quien más PV tenga; si empatan, empate.</p>
  <h3>Reglas especiales de armas</h3>${WR_DEF.map(d => `<div class="kwrow"><b>${H(d[1])}</b><span>${H(d[2])}</span></div>`).join('')}<p><b>Cartas:</b> ardides, reglas de facción y habilidades únicas de cada comando siguen en «Cartas» y no se automatizan. Los PM se usan automáticamente para repetir dados (Repetición de mando).</p>`; $('#modal').hidden = false; $('#mx').onclick = closeModal;
}
function showBZ() {
  const s = G.s, B = s.bz; if (!B) return; const v = viewer(), bc = E.bzCtl(s);
  const badge = id => `<span style="background:${E.BZ[id].t === 'b' ? '#7a1f1f' : '#2b5a7a'};color:#fff;padding:1px 7px;border-radius:9px;font-size:11px">${E.BZ[id].t === 'b' ? 'SANGRE' : 'FERVOR'}</span>`;
  const J = o => H(JSON.stringify(o)).replace(/&quot;/g, '&#34;');
  const hand = B.hand[v].map(id => { const x = E.BZ[id]; let btn = '';
    if (E.BZ_OUT.includes(id)) {
      if (E.bzWin(s, v, id)) {
        if (id === 'z_apl') btn = E.bzAplOpts(s, v).map(i => `<button class="btn small" data-bzx="${J({ t: 'bz', p: v, id, ob: i })}">Usar en el marcador ${i + 1}</button>`).join('');
        else if (id === 'z_ploy') btn = E.bzPloyOpts(s, v).map(g => `<button class="btn small" data-bzx="${J({ t: 'bz', p: v, id, v: g })}">Usar: ${H(g)}</button>`).join('');
        else if (id === 'b_return') btn = B.disc[1 - v].map(c => `<button class="btn small" data-bzx="${J({ t: 'bz', p: v, id, v: c })}">Devolver: ${H(E.BZ[c].n)}</button>`).join('');
        else btn = `<button class="btn small" data-bzx="${J({ t: 'bz', p: v, id })}">Usar ahora</button>`;
      } else btn = `<span class="hint">${id === 'z_cp' ? '' : 'Se usa en una activación/contraacción de un agente amigo (no disponible ahora).'}</span>`;
    } else if (id === 'b_fstart' || id === 'z_fend') btn = `<span class="hint">Se te ofrecerá automáticamente ${id === 'b_fstart' ? 'al inicio' : 'al final'} de la fase de tiroteo.</span>`;
    else btn = `<button class="btn ghost small" data-bza="${id}">${B.arm[v].includes(id) ? '✔ Armada (pulsa para desarmar)' : 'Armar (se usa sola al darse el momento)'}</button>`;
    return `<div style="border:1px solid #3a4658;border-radius:8px;padding:8px;margin:6px 0;overflow:hidden"><img loading="lazy" alt="" src="img/bz_${id}.webp" style="width:96px;float:right;margin:0 0 4px 8px;border-radius:6px"><b>${H(x.n)}</b> ${badge(id)}<p class="hint" style="margin:4px 0">${H(x.d)}</p>${btn}</div>`; }).join('') || '<p class="hint">No tienes cartas en la mano.</p>';
  const disc = p => ['b', 'z'].map(t => { const l = B.disc[p].filter(c => E.BZ[c].t === t); return `${t === 'b' ? 'Sangre' : 'Fervor'} (${l.length})${l.length ? ': ' + l.map(c => H(E.BZ[c].n)).join(', ') : ''}`; }).join(' · ');
  const rv = B.rev && B.rev.p === v && B.rev.tp === s.tp ? `<p><b>Mano revelada del rival:</b> ${B.rev.cards.map(c => H(E.BZ[c].n)).join(', ') || '—'}</p>` : '';
  $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>Cartas de Sangre y Fervor</h2>
  <p class="hint">Mazos: Sangre ${B.deck.b.length} · Fervor ${B.deck.z.length}. Robas 1 carta en cada fase de estrategia y 1 por cada PV que anote el rival. Estatua: ${bc < 0 ? 'sin controlar' : 'la controla el Jugador ' + (bc + 1)}. Al final de la batalla, +1 PV por tener más cartas de Sangre descartadas que el rival y +1 PV por más de Fervor.</p>
  <div class="acts"><button class="btn ghost" data-bza="auto">Uso automático en secuencia: ${B.auto[v] ? 'SÍ' : 'NO (solo las armadas)'}</button></div>
  <h3>Tu mano (${B.hand[v].length})</h3>${hand}${rv}
  <h3>Descartes</h3><p class="hint">Jugador ${v + 1}: ${disc(v)}</p><p class="hint">Jugador ${2 - v}: ${disc(1 - v)} · mano rival: ${B.hand[1 - v].length}</p>`;
  $('#modal').hidden = false; $('#mx').onclick = closeModal;
  $$('[data-bza]', $('#modalBox')).forEach(b => b.onclick = () => { const id = b.dataset.bza; closeModal(); dispatch(id === 'auto' ? { t: 'bza', p: v, id: 'auto', on: !B.auto[v] } : { t: 'bza', p: v, id, on: !B.arm[v].includes(id) }); showBZ(); });
  $$('[data-bzx]', $('#modalBox')).forEach(b => b.onclick = () => { const a = JSON.parse(b.dataset.bzx); closeModal(); dispatch(a); if (G.s.bz && !G.s.pend && !G.s.over) showBZ(); });
}
function showGameMenu() {
  $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>Menú</h2><div class="acts"><button class="btn ghost" id="gmDice">Dados: ${G.manual ? 'LOS TIRO YO (introduzco el resultado)' : 'automáticos'}</button><button class="btn ghost" id="gmAuto">Auto-repetir dados: ${G.s.auto[viewer()] ? 'SÍ' : 'NO'}</button>${(() => { const v = viewer(), ids = E.FPLOY_TEAM[G.s.team[v]] || []; return ids.length ? `<button class="btn ghost" id="gmMan">Ardides de tiroteo: ${G.s.fpMan[v] ? 'MANUAL (armar)' : 'automáticos'}</button>` + (G.s.fpMan[v] ? ids.map(id => `<button class="btn ghost small" data-arm="${id}">${G.s.armed[v].includes(id) ? '✔ ' : ''}${E.FPLOY_TXT[id].split(':')[0]} (1 CP)</button>`).join('') : '') : ''; })()}${G.s.bz ? '<button class="btn ghost" id="gmBz">Cartas Sangre/Fervor</button>' : ''}<button class="btn ghost" id="gmPop">Ventanas: ${G.pop === 'ploy' ? 'SOLO ARDIDES (carta + batalla)' : 'TODAS (las de siempre)'}</button><button class="btn" id="gmSv">💾 Guardar partida</button><button class="btn" id="gmLd">📂 Cargar partida</button><button class="btn ghost" id="gmSave">Copiar partida (código)</button><button class="btn ghost" id="gmRules">Reglas</button><button class="btn ghost" id="gmKw">Palabras clave</button><button class="btn" id="gmOff">⬇ Descargar todo para jugar sin conexión</button><button class="btn ghost" id="gmMenu">Salir al menú</button></div>`;
  $('#modal').hidden = false; $('#mx').onclick = closeModal;
  if ($('#gmBz')) $('#gmBz').onclick = () => { closeModal(); showBZ(); };
  if ($('#gmMan')) $('#gmMan').onclick = () => { const v = viewer(); E.apply(G.s, { t: 'arm', p: v, id: 'man', on: !G.s.fpMan[v] }); closeModal(); toast('Ardides de tiroteo: ' + (G.s.fpMan[v] ? 'manual' : 'automático')); };
  $$('[data-arm]').forEach(b => b.onclick = () => { const v = viewer(), id = b.dataset.arm; E.apply(G.s, { t: 'arm', p: v, id, on: !G.s.armed[v].includes(id) }); closeModal(); toast(E.FPLOY_TXT[id].split(':')[0] + (G.s.armed[v].includes(id) ? ': armado' : ': desarmado')); });
  $('#gmPop').onclick = () => { G.pop = G.pop === 'ploy' ? 'full' : 'ploy'; try { localStorage.setItem('kt_pop', G.pop); } catch (e) { } closeModal(); toast(G.pop === 'ploy' ? 'Solo ventanas de ardides: la carta antes de ejecutarse y la batalla con los dados' : 'Todas las ventanas'); };
  $('#gmDice').onclick = () => { G.manual = !G.manual; try { localStorage.setItem('kt_manual', G.manual ? '1' : '0'); } catch (e) { } closeModal(); toast(G.manual ? 'Tiras tú los dados: introduce el resultado y el juego aplica los efectos' : 'Dados automáticos'); };
  $('#gmAuto').onclick = () => { const p = viewer(); G.s.auto[p] = !G.s.auto[p]; closeModal(); toast('Auto-repetir: ' + (G.s.auto[p] ? 'sí' : 'no')); };
  $('#gmSv').onclick = () => { closeModal(); saveSlot(); }; $('#gmLd').onclick = () => openLoad(true);
  $('#gmSave').onclick = async () => { const c = await pack({ setup: G.setup, acts: G.acts, mode: G.mode, me: G.me, level: G.level }); try { await navigator.clipboard.writeText(c); toast('Código copiado'); } catch (e) { $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>Código de partida</h2><textarea id="cdTx" rows="5" style="width:100%" readonly>${H(c)}</textarea>`; $('#mx').onclick = closeModal; $('#cdTx').select(); } };
  $('#gmRules').onclick = showRules; $('#gmKw').onclick = showKeywords; $('#gmOff').onclick = () => offlineDL($('#gmOff')); $('#gmMenu').onclick = () => { closeModal(); clearTimeout(tick.t); $('#game').classList.remove('active'); $('#menu').classList.add('active'); showHome(); refreshAIStat(); if (localStorage.getItem(SAVE)) location.reload(); };
}
function showEnd() {
  if (G.endShown === G.s) return; G.endShown = G.s;
  const s = G.s; $('#thinking').hidden = true;
  learnFromGame(); save();
  const w = s.winner; const nm = p => teamById(G.setup.teams[p].id).name;
  if (s.jm) $('#modalBox').innerHTML = `<div class="big-result"><h1>${s.jmWin ? 'Misión cumplida' : 'Misión fracasada'}</h1><p>${H(E.jmStatus(s).name)} · PI ${s.tp}${s.njGrade ? ' · ' + H(s.njGrade) + ' (' + s.njVP + ' PV)' : ''}</p><p class="hint">Agentes: ${E.jmStatus(s).plAlive}/${E.jmStatus(s).plTotal} · ANJ: ${E.jmStatus(s).anjAlive}/${E.jmStatus(s).anjTotal}${s.jm === 2 ? ' · Sabotajes ' + E.jmStatus(s).sab + '/' + E.jmStatus(s).objs : ''}${s.jm === 3 ? ' · Huidos ' + E.jmStatus(s).esc : ''}${s.twp && !s.ty && !s.dv ? ' · Amenaza ' + E.jmStatus(s).thr + '/15' : ''}</p>${s.nj ? (E.njNext(s) ? `<p class="hint">Campaña Nemesis: según el resultado, la siguiente misión es <b>${H(E.JM_NAMES[E.njNext(s)] || ('Misión conjunta ' + (E.njNext(s) - 60) + ' (aún no disponible)'))}</b>.</p>` : '') : ''}${s.dv ? (E.dvNext(s.jm, s.jmWin) ? `<p class="hint">Campaña Terror en Devlan: la siguiente misión es <b>${H(E.JM_NAMES[E.dvNext(s.jm, s.jmWin)])}</b>.</p>` : `<p class="hint">Fin de la campaña Terror en Devlan: <b>${H(E.dvFinal(s.jm, s.jmWin))}</b>.</p>`) : ''}${s.jm >= 21 && s.jm <= 23 ? (E.shNext(s.jm) ? `<p class="hint">Campaña Shadowhunt: la siguiente misión es <b>${H(E.JM_NAMES[E.shNext(s.jm)])}</b>.</p>` : '<p class="hint">Campaña Shadowhunt: era la última misión.</p>') : ''}${s.ty && E.tyNext(s.jm, s.jmWin) ? `<p class="hint">Campaña Typhon: ${s.jmWin ? 'con victoria' : 'con derrota'} la siguiente misión es <b>${H(E.JM_NAMES[E.tyNext(s.jm, s.jmWin)])}</b>.</p>` : s.ty ? '<p class="hint">Campaña Typhon: esta era la última misión de su rama.</p>' : ''}<div class="row center">${(s.nj && E.JM_NAMES[E.njNext(s)]) || (s.ty && E.tyNext(s.jm, s.jmWin)) || (s.dv && E.dvNext(s.jm, s.jmWin)) || (s.jm >= 21 && s.jm <= 23 && E.shNext(s.jm)) ? '<button class="btn" id="eNext">Siguiente misión</button>' : ''}<button class="btn" id="eRe">Revancha</button><button class="btn ghost" id="eMenu">Menú</button></div></div>`; else
  $('#modalBox').innerHTML = `<div class="big-result"><h1>${w < 0 ? 'Empate' : 'Victoria · ' + H(nm(w))}</h1><p>Jugador 1 <b>${s.vp[0]}</b> PV · Jugador 2 <b>${s.vp[1]}</b> PV</p><p class="hint">Bajas: J1 ${s.lost[0]} · J2 ${s.lost[1]}${G.mode === 'ai' ? ' · La IA ha aprendido de esta partida.' : ''}</p><div class="row center"><button class="btn" id="eRe">Revancha</button><button class="btn ghost" id="eMenu">Menú</button></div></div>`;
  $('#modal').hidden = false;
  if (G.camp) { const win = !!(s.jm ? s.jmWin : s.winner === 0); const inc = s.ops.filter(o => o.p === 1 && !o.alive).reduce((n, o) => n + incWeight(o.W || 0), 0); const bx = document.querySelector('#modalBox .row'); if (bx) { bx.insertAdjacentHTML('beforeend', '<button class="btn" id="eCamp">Volver a la campaña</button>'); setTimeout(() => { const b = $('#eCamp'); if (b) b.onclick = () => { try { localStorage.setItem('kt_camp_res', JSON.stringify({ win, draw: false, inc })); } catch (e) { } location.reload(); }; }, 0); } }
  if ($('#eNext')) $('#eNext').onclick = () => { const nx = s.nj ? E.njNext(s) + 60 - 60 : s.dv ? E.dvNext(s.jm, s.jmWin) : s.jm >= 21 && s.jm <= 23 ? E.shNext(s.jm) : E.tyNext(s.jm, s.jmWin); closeModal(); beginGame({ ...G.setup, seed: (Math.random() * 1e9) | 0, map: undefined, joint: { ...G.setup.joint, mission: nx, njRole: s.nj ? E.njRoleNext(s) : G.setup.joint.njRole } }, [], { mode: G.mode, me: G.me, level: G.level }); };
  $('#eRe').onclick = () => { closeModal(); beginGame({ ...G.setup, seed: (Math.random() * 1e9) | 0 }, [], { mode: G.mode, me: G.mode === 'net' ? G.me : G.me, level: G.level }); };
  $('#eMenu').onclick = () => { location.reload(); };
}
function learnFromGame() {
  if (G.learned) return; G.learned = true; const s = G.s;
  if (G.mode === 'net' || (s.np || 2) > 2) return;
  for (let p = 0; p < 2; p++) { const h = G.hist[p].filter((_, i) => i % 2 === 0); const oc = s.jm ? (p === 0 ? (s.jmWin ? 1 : 0) : (s.jmWin ? 0 : 1)) : AI.outcomeFor(s, p); if (h.length) AI.learn(AIW.w, h, oc, 0.04); AI.optLearn(p, oc, 0.05); }
  AIW.games++; saveW();
}

/* ============================ EN LÍNEA (códigos) ============================ */
async function updateNet() {
  const el = $('#pNet'); const code = await pack({ setup: G.setup, acts: G.acts });
  const mineNow = G.s.active === G.me && !G.s.over;
  if (NET.live) { el.innerHTML = `<p class="hint">Eres el <b style="color:${COL[G.me]}">Jugador ${G.me + 1}</b>. Sala <b>${H(NET.room || '')}</b> · ${NET.up ? '<b style="color:#4c4">conectado</b>' : '<b style="color:#e84">sin conexión (se reintenta solo)</b>'}. ${mineNow ? 'Es tu turno.' : 'Turno del rival.'}</p><p class="hint">Las jugadas se envían solas. Si se corta la conexión, al volver a conectar se sincronizan todas las acciones pendientes.</p><details><summary>Sincronizar con código (por si falla la conexión)</summary><textarea id="netOut" readonly>${code}</textarea><div class="row"><button class="btn ghost small" id="netCopy">Copiar</button></div><textarea id="netIn" placeholder="Pega aquí el código del rival…"></textarea><div class="row"><button class="btn small" id="netApply">Aplicar jugada</button></div></details>`; netPanelBind(code); return; }
  el.innerHTML = `<p class="hint">Eres el <b style="color:${COL[G.me]}">Jugador ${G.me + 1}</b>. ${mineNow ? 'Es tu turno.' : 'Turno del rival: pega aquí su código para ver su jugada.'}</p>
  <h3>Tu código de jugada</h3><textarea id="netOut" readonly>${code}</textarea><div class="row"><button class="btn ghost small" id="netCopy">Copiar</button></div>
  <h3>Código del rival</h3><textarea id="netIn" placeholder="Pega aquí el código que te envíe el rival…"></textarea><div class="row"><button class="btn small" id="netApply">Aplicar jugada</button></div>
  <p class="hint">Envía tu código al rival cuando termines tu activación (o tras cada acción). El código contiene toda la partida, así que siempre se sincroniza.</p>`;
  netPanelBind(code);
  if (G.lastCopied !== G.acts.length && G.s.active !== G.me && !G.s.over && G.acts.length) { G.lastCopied = G.acts.length; try { await navigator.clipboard.writeText(code); toast('Tu código se copió: envíaselo al rival'); } catch (e) { } }
}
function netPanelBind(code) {
  $('#netCopy').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Código copiado'); } catch (e) { $('#netOut').select(); } };
  $('#netApply').onclick = async () => {
    try {
      const o = await unpack($('#netIn').value); if (o.setup.seed !== G.setup.seed) return toast('Código de otra partida');
      const add = o.acts.slice(G.acts.length); if (!add.length) return toast('No hay jugadas nuevas');
      for (const a of add) dispatch(a, true); processEvents(); save(); refreshAll(); tick(); toast(add.length + ' acciones aplicadas');
    } catch (e) { toast('Código no válido'); }
  };
}

/* ============================ EN LÍNEA EN VIVO (sala de 5 letras, conexión directa WebRTC con PeerJS) ============================
   Sigue la misma secuencia que la Partida rápida (Operaciones Aprobadas): zona de descenso y operación táctica en secreto, despliegue, Explorar y operación principal dentro del motor.
   Funciona en cualquier alojamiento web estático (GitHub Pages, Netlify…); el visor del artefacto bloquea las conexiones de red, y allí queda el intercambio por códigos. */
const NET = { live: false, up: false, peer: null, conn: null, room: null, host: false, rx: false, out: null, pre: null, mine: null, setupH: null, depInit: null, rolls: null, started: false };
const NET_AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function netLib() { return new Promise((res, rej) => { if (window.Peer) return res(); const sc = document.createElement('script'); sc.src = 'peerjs.min.js'; sc.onload = () => window.Peer ? res() : rej(new Error('lib')); sc.onerror = () => rej(new Error('lib')); document.head.appendChild(sc); }); }
function netSend(m) { try { if (NET.out) NET.out(m); else if (NET.conn && NET.conn.open) NET.conn.send(m); } catch (e) { } }
function netAttach(c) {
  NET.conn = c;
  c.on('open', () => { NET.up = true; netHi(); if (G.mode === 'net') updateNet(); setStatus && G.s && setStatus(); });
  c.on('data', m => netRecv(m));
  c.on('close', () => { if (NET.conn !== c) return; NET.up = false; if (G.s && G.mode === 'net') { toast('Conexión perdida: se reintenta'); updateNet(); setStatus(); } if (!NET.host) setTimeout(netReconnect, 2500); });
  c.on('error', () => { });
}
function netReconnect() { if (NET.up || !NET.peer || NET.host || !NET.live || (NET.conn && NET.conn.open)) return; try { netAttach(NET.peer.connect('ktd-' + NET.room, { reliable: true, serialization: 'json' })); } catch (e) { setTimeout(netReconnect, 4000); } }
function netHi() { if (G.s && G.mode === 'net') netSend({ t: 'hi', n: G.acts.length, seed: G.setup.seed }); }
function netModal(h) { $('#modalBox').innerHTML = h; $('#modal').hidden = false; }
async function netHostLive(setup) {
  try { await netLib(); } catch (e) { toast('No se pudo cargar la conexión en vivo: se usan códigos'); if (setup.aop) exploreNetHost(setup); else beginGame(setup, [], { mode: 'net', me: 0, level: M.level }); return; }
  const room = Array.from({ length: 5 }, () => NET_AL[Math.floor(Math.random() * NET_AL.length)]).join('');
  Object.assign(NET, { live: true, up: false, host: true, room, setupH: setup, started: false, pre: null, mine: null, conn: null });
  const fail = () => { try { NET.peer && NET.peer.destroy(); } catch (e) { } NET.live = false; toast('La conexión en vivo no está disponible aquí: se usan códigos'); closeModal(); exploreNetHost(setup); };
  netModal(`<h2>Partida en línea</h2><p class="hint">Creando la sala…</p><div class="acts"><button class="btn ghost" id="netCx">Cancelar</button></div>`);
  $('#netCx').onclick = () => { try { NET.peer && NET.peer.destroy(); } catch (e) { } NET.live = false; closeModal(); };
  const to = setTimeout(fail, 9000);
  let pr; try { pr = new window.Peer('ktd-' + room); } catch (e) { clearTimeout(to); return fail(); }
  NET.peer = pr;
  pr.on('error', e => { if (!NET.up && !NET.started) { clearTimeout(to); fail(); } });
  pr.on('open', () => { clearTimeout(to); netModal(`<h2>Partida en línea</h2><p>Dile a tu rival que pulse «Unirme a una partida» y escriba este código de sala:</p><p style="font-size:34px;letter-spacing:6px;text-align:center"><b>${room}</b></p><p class="hint">Esperando al rival… Cuando se una, ambos seguiréis la secuencia de Operaciones Aprobadas: zona de descenso, operación táctica en secreto, despliegue, Explorar y combate.</p><div class="acts"><button class="btn ghost small" id="netCp">Copiar código</button><button class="btn ghost" id="netCx2">Cancelar</button></div>`); $('#netCp').onclick = async () => { try { await navigator.clipboard.writeText(room); toast('Código copiado'); } catch (e) { } }; $('#netCx2').onclick = () => { try { pr.destroy(); } catch (e) { } NET.live = false; closeModal(); }; });
  pr.on('connection', c => { if (NET.conn && NET.conn.open && NET.started) { try { NET.conn.close(); } catch (e) { } } netAttach(c); if (!NET.started) c.on('open', () => netHostPrep()); });
}
async function netJoinLive(room) {
  try { await netLib(); } catch (e) { toast('No se pudo cargar la conexión en vivo'); return; }
  Object.assign(NET, { live: true, up: false, host: false, room, started: false, conn: null, pre: null, mine: null });
  netModal(`<h2>Unirme a la sala ${H(room)}</h2><p class="hint">Conectando…</p><div class="acts"><button class="btn ghost" id="netCx">Cancelar</button></div>`);
  $('#netCx').onclick = () => { try { NET.peer && NET.peer.destroy(); } catch (e) { } NET.live = false; closeModal(); };
  const to = setTimeout(() => { if (!NET.up) { toast('No se pudo conectar con esa sala'); try { NET.peer.destroy(); } catch (e) { } NET.live = false; closeModal(); } }, 12000);
  let pr; try { pr = new window.Peer(); } catch (e) { clearTimeout(to); toast('Conexión en vivo no disponible'); return; }
  NET.peer = pr; pr.on('error', () => { if (!NET.up && !NET.started) { clearTimeout(to); toast('No se pudo conectar con esa sala'); NET.live = false; closeModal(); } });
  pr.on('open', () => { netAttach(pr.connect('ktd-' + room, { reliable: true, serialization: 'json' })); NET.conn.on('open', () => clearTimeout(to)); });
}
/* secuencia previa: cada jugador elige lo suyo en su dispositivo; el anfitrión lo junta y manda la configuración final */
async function netPrep(setup, depInit, seat) {
  const z = await exploreChoose(setup, [seat], depInit, true, true); const T = setup.teams[seat];
  await tacChoose(setup, seat);
  return { z: z.z, tac: T.tac || null };
}
async function netHostPrep() {
  const setup = NET.setupH, R = prepRoll(); NET.depInit = R.w; NET.rolls = R.log; NET.pre = null;
  netSend({ t: 'hello', setup, depInit: R.w, rolls: R.log });
  NET.mine = await netPrep(setup, R.w, 0); netModal(`<h2>Esperando al rival…</h2><p class="hint">Tu rival está eligiendo su zona de descenso y su operación táctica.</p>`); netHostGo();
}
async function netHostGo() {
  if (NET.started || !NET.mine || !NET.pre) return; NET.started = true;
  const setup = NET.setupH, depInit = NET.depInit, z = depInit === 0 ? NET.mine.z : NET.pre.z;
  if (NET.mine.tac) setup.teams[0].tac = NET.mine.tac; if (NET.pre.tac) setup.teams[1].tac = NET.pre.tac;
  setup.explLate = true; setup.depInit = depInit; delete setup.init; const sw = z !== depInit;
  if (sw) { setup.teams.reverse(); setup.depInit = z; }
  const me = sw ? 1 : 0; netSend({ t: 'start', setup, sw, rolls: NET.rolls, depInit });
  await netShow(setup, sw, me, depInit, NET.rolls); beginGame(setup, [], { mode: 'net', me, level: M.level });
}
async function netShow(setup, sw, me, depInit, rolls) { const info = { rolls: rolls || [], rolls1: [], tie: false, depInit: setup.depInit, dec: setup.depInit, init: setup.depInit, sw, late: true, me }; await prepSummary(setup, info); }
function netRecv(m) {
  if (!m || !m.t) return;
  if (m.t === 'hello' && !NET.host) { NET.setupH = m.setup; NET.depInit = m.depInit; netPrep(m.setup, m.depInit, 1).then(r => { NET.mine = r; netSend({ t: 'pre', z: r.z, tac: r.tac }); netModal(`<h2>Esperando al anfitrión…</h2><p class="hint">Tus elecciones están enviadas en secreto.</p>`); }); return; }
  if (m.t === 'pre' && NET.host) { NET.pre = m; netHostGo(); return; }
  if (m.t === 'start' && !NET.host) { if (NET.started) return; NET.started = true; const me = m.sw ? 0 : 1; netShow(m.setup, m.sw, me, m.depInit, m.rolls).then(() => beginGame(m.setup, [], { mode: 'net', me, level: M.level })); return; }
  if (!G.s || G.mode !== 'net') return;
  if (m.t === 'act') { if (m.n < G.acts.length) return; if (m.n > G.acts.length) { netSend({ t: 'need', n: G.acts.length }); return; } netApply([m.a]); return; }
  if (m.t === 'hi') { if (m.seed !== G.setup.seed) return; if (m.n < G.acts.length) netSend({ t: 'acts', from: m.n, list: G.acts.slice(m.n) }); else if (m.n > G.acts.length) netSend({ t: 'need', n: G.acts.length }); return; }
  if (m.t === 'need') { if (m.n < G.acts.length) netSend({ t: 'acts', from: m.n, list: G.acts.slice(m.n) }); return; }
  if (m.t === 'acts') { const add = m.list.slice(Math.max(0, G.acts.length - m.from)); if (add.length && m.from <= G.acts.length) netApply(add); return; }
}
function netApply(list) { NET.rx = true; try { for (const a of list) dispatch(a, true); } finally { NET.rx = false; } processEvents(); save(); refreshAll(); tick(); }
window.__ktNet = { NET, recv: netRecv, hi: netHi };

/* ============================ ENTRENAMIENTO ============================ */
async function trainSelf(n) {
  const bar = $('#trainBar'), fill = $('i', bar); bar.hidden = false; $('#btnTrain').disabled = true;
  for (let g = 0; g < n; g++) {
    const PL = PK(), A = PL[Math.floor(Math.random() * PL.length)], B = PL[Math.floor(Math.random() * PL.length)];
    const pick = t => t.sel ? defaultRoster(t, true) : t.ops.slice().sort(() => Math.random() - .5).slice(0, 6 + Math.floor(Math.random() * 3)).map(o => o.id); // listas legales con opciones de armas variadas
    const s = E.newGame({ seed: (Math.random() * 1e9) | 0, teams: [{ id: A.id, ops: pick(A) }, { id: B.id, ops: pick(B) }] }, DB); s.rec = false; AI.optReset(); TRAINING = true;
    const hist = [[], []]; let guard = 0;
    while (!s.over && guard++ < 1500) {
      const p = s.active; const a = AI.chooseAction(s, 'medium', AIW.w, 0.12); E.apply(s, a); if (a.t === 'end' || a.t === 'act') hist[p].push(AI.features(s, p));
      if (guard % 6 === 0) { fill.style.width = ((g + Math.min(1, guard / 400)) / n * 100) + '%'; await new Promise(r => setTimeout(r)); }
    }
    if (!s.over) s.winner = -1;
    for (let p = 0; p < 2; p++) { AI.learn(AIW.w, hist[p].filter((_, i) => i % 2 === 0), AI.outcomeFor(s, p), 0.06); AI.optLearn(p, AI.outcomeFor(s, p), 0.08); }
    TRAINING = false; AIW.games++; saveW();
  }
  fill.style.width = '100%'; setTimeout(() => { bar.hidden = true; fill.style.width = '0'; }, 800); $('#btnTrain').disabled = false; toast('Entrenamiento terminado');
}

/* ============================ CANVAS ============================ */
const cv = $('#board'), ctx = cv.getContext('2d'); let VW = 0, VH = 0, SC = 1, OX = 0, OY = 0, DPR = 1, dirty = true;
const LAND = () => matchMedia('(max-height:520px) and (orientation:landscape)').matches;
let SCB = 1, Z2 = 1, PCX = null, PCY = null; // zoom y desplazamiento del mapa 2D (Z2 = 1: mapa entero)
const vMargins = () => ({ pad: 6, mt: MOB() ? 56 : 0, mb: MOB() ? (LAND() ? 8 : 76) : 0, mr: MOB() && LAND() ? 56 : 0 });
function applyView() { const { pad, mt, mb, mr } = vMargins(); SC = SCB * Z2; const cx = (VW - mr) / 2, cy = mt + (VH - mt - mb) / 2 + 14; if (PCX == null || Z2 <= 1.001) { PCX = E.BW / 2; PCY = E.BH / 2; } const hw = (VW - pad * 2 - mr) / 2 / SC, hh = (VH - mt - mb - pad * 2 - 34) / 2 / SC; PCX = hw >= E.BW / 2 ? E.BW / 2 : Math.max(hw, Math.min(E.BW - hw, PCX)); PCY = hh >= E.BH / 2 ? E.BH / 2 : Math.max(hh, Math.min(E.BH - hh, PCY)); OX = cx - PCX * SC; OY = cy - PCY * SC; dirty = true; }
function resize() { const r = cv.parentElement.getBoundingClientRect(); if (!r.width) return; DPR = G && G.view3d ? Math.min(3, Math.max(window.devicePixelRatio || 1, HQ3D ? 2 : 1)) : Math.min(2, window.devicePixelRatio || 1); /* en 3D se usa la densidad completa del iPhone */ cv.width = r.width * DPR; cv.height = r.height * DPR; VW = r.width; VH = r.height; const { pad, mt, mb, mr } = vMargins(); SCB = Math.min((VW - pad * 2 - mr) / E.BW, (VH - mt - mb - pad * 2 - 34) / E.BH); applyView(); refreshNames(); }
function zoomAt(z, fx, fy) { const bx = (fx - OX) / SC, by = (fy - OY) / SC; Z2 = Math.max(1, Math.min(4, z)); if (Z2 <= 1.001) { Z2 = 1; PCX = null; applyView(); return; } const sc = SCB * Z2, { mt, mb, mr } = vMargins(), cx = (VW - mr) / 2, cy = mt + (VH - mt - mb) / 2 + 14; PCX = (cx - (fx - bx * sc)) / sc; PCY = (cy - (fy - by * sc)) / sc; applyView(); }
function panBy(dx, dy) { if (Z2 <= 1.001) return; PCX -= dx / SC; PCY -= dy / SC; applyView(); }
function focusFit() { const s = G.s; if (!s) return; if (Z2 > 1.001) { Z2 = 1; PCX = null; applyView(); return; } const o = s.act ? s.ops[s.act.op] : (G.ui && G.ui.sel != null ? s.ops[G.ui.sel] : null) || s.ops.find(x => x.alive && x.p === s.active); Z2 = 2.2; if (o) { PCX = o.x; PCY = o.y; } else PCX = null; applyView(); }
const shortName = n => (MOB() && !LAND()) ? String(n).replace(/ · IA$/, '').split(' ')[0] + (/ · IA$/.test(n) ? ' · IA' : '') : n;
function refreshNames() { for (const q of [0, 1]) { const e = $('#name' + q); if (!e) continue; if (e.dataset.full === undefined) continue; e.textContent = shortName(e.dataset.full); e.title = e.dataset.full; } }
new ResizeObserver(resize).observe(cv.parentElement); addEventListener('resize', resize);
const X = x => OX + x * SC, Y = y => OY + y * SC;
const toBoard = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - OX) / SC, y: (e.clientY - r.top - OY) / SC }; };
/* Barra contextual: acciones principales junto al agente activo (reutiliza los botones del panel) */
const CTX = [['rep', 'Mover'], ['shoot', 'Disparar'], ['chg', 'Cargar'], ['fight', 'Combatir'], ['spr', 'Esprintar'], ['turn', 'Girar'], ['guard', 'Guardia']];
let ctxSig = '';
function ctxBar() {
  let bar = $('#ctxbar'); if (!bar) { bar = document.createElement('div'); bar.id = 'ctxbar'; bar.hidden = true; $('#boardwrap').appendChild(bar); }
  const s = G.s, hide = () => { if (!bar.hidden) bar.hidden = true; };
  if (!s || s.over || !s.act || G.ui.mode || !$('#modal').hidden) return hide();
  const o = s.ops[s.act.op]; if (!o || !o.alive || !(isLocal(actor(s)) && !(G.mode === 'ai' && actor(s) !== G.me))) return hide();
  const src = CTX.map(([k, l]) => [k, l, document.querySelector(`#sideRight [data-act="${k}"]:not([disabled])`)]).filter(x => x[2]);
  if (!src.length) return hide();
  const sig = src.map(x => x[0]).join() + '|' + o.i; if (sig !== ctxSig) { ctxSig = sig; bar.innerHTML = src.map(([k, l]) => `<button class="btn sm" data-k="${k}">${l}</button>`).join(''); bar.onclick = e => { const b = e.target.closest('button'); if (!b) return; const t = document.querySelector(`#sideRight [data-act="${b.dataset.k}"]:not([disabled])`); if (t) t.click(); }; }
  // acciones fuera del mapa: columna fija en el margen derecho, bajo los controles del mapa (no sigue a la unidad ni tapa miniaturas)
  bar.hidden = false; const bw = $('#boardwrap'), mc = $('#mapctl'); let top = 8, lim = bw.clientHeight - 8; if (mc && mc.offsetParent) { const mr = mc.getBoundingClientRect(), br = bw.getBoundingClientRect(); if (mr.top - br.top < br.height / 2) top = Math.round(mr.bottom - br.top + 8); else lim = Math.round(mr.top - br.top - 8); }
  bar.style.transform = 'none'; bar.style.left = 'auto'; bar.style.right = '8px'; bar.style.top = top + 'px'; bar.style.maxHeight = Math.max(80, lim - top) + 'px';
}
function loop(t) { if (G.s && $('#game').classList.contains('active')) { draw(t); try { ctxBar(); } catch (e) { /* barra opcional */ } } requestAnimationFrame(loop); }
const TOKI = {}; const grBadge = n => { const k = 'GR:' + n; if (!TOKI[k]) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#5a1d14'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.strokeStyle = '#e8c36a'; x.lineWidth = 4; x.stroke(); x.fillStyle = '#fff'; x.font = 'bold 34px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, 32, 35); c.naturalWidth = c.naturalHeight = 64; c.complete = true; TOKI[k] = c; } return TOKI[k]; }; const tokImg = k => { if (k.startsWith('GR:')) return grBadge(+k.slice(3)); let im = TOKI[k]; if (!im) { im = TOKI[k] = new Image(); im.src = 'img/tok/' + k + '.webp'; } return im.complete && im.naturalWidth ? im : null; }; // fichas del mod (img/tok/)
/* Durante el paso 3 (Desplegar agentes) solo se ven en la mesa los agentes ya desplegados */
function viewState(s) { const D = s.dply; if (!D || D.done) return s; const und = new Set(D.q[0].concat(D.q[1])); if (!und.size) return s; if (viewState.k === s && viewState.n === und.size && viewState.a === s.ops) return viewState.v; const v = Object.create(s); v.ops = s.ops.map(o => und.has(o.i) && o.i !== G.ui.dplyPrev ? Object.assign(Object.create(o), { alive: false }) : o); viewState.k = s; viewState.n = und.size; viewState.a = s.ops; viewState.v = v; return v; }
function draw(t) {
  const s = viewState(G.s); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, VW, VH);
  if (G.view3d) { const useGL = placeGL($('#boardwrap'), GLR.ok); V3.resize(VW, VH); V3.draw(ctx, s, G, t, Object.assign({ COL, viewer: viewer(), showEnemy: G.showEnemy }, useGL ? glOpts(DPR) : {})); ldvOverlay(ctx, s, G.ui, (x, y, z) => V3.project(x, y, z || 0), 26); try { rulerDraw(ctx); } catch (er) { } return; }
  placeGL($('#boardwrap'), false);
  // floor
  const g = ctx.createLinearGradient(0, Y(0), 0, Y(E.BH)); g.addColorStop(0, '#1b222d'); g.addColorStop(1, '#141a23');
  ctx.fillStyle = g; ctx.fillRect(X(0), Y(0), E.BW * SC, E.BH * SC);
  if (s.zones) { s.zones.forEach((zs, p) => { ctx.fillStyle = COL[p]; ctx.globalAlpha = .12; for (const Z of zs) ctx.fillRect(X(Z[0]), Y(Z[1]), Z[2] * SC, Z[3] * SC); ctx.globalAlpha = 1; }); } else if (s.dep && s.dep.ax === 'y') { const dd = Math.max(2, s.dep.d || 3); ctx.fillStyle = 'rgba(255,122,42,.08)'; ctx.fillRect(X(0), Y(0), E.BW * SC, dd * SC); ctx.fillStyle = 'rgba(53,182,255,.08)'; ctx.fillRect(X(0), Y(E.BH - dd), E.BW * SC, dd * SC); } else { ctx.fillStyle = 'rgba(255,122,42,.08)'; ctx.fillRect(X(0), Y(0), 6 * SC, E.BH * SC); ctx.fillStyle = 'rgba(53,182,255,.08)'; ctx.fillRect(X(E.BW - 6), Y(0), 6 * SC, E.BH * SC); }
  ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= E.BW; i++) { ctx.moveTo(X(i), Y(0)); ctx.lineTo(X(i), Y(E.BH)); } for (let j = 0; j <= E.BH; j++) { ctx.moveTo(X(0), Y(j)); ctx.lineTo(X(E.BW), Y(j)); } ctx.stroke();
  ctx.strokeStyle = '#3a475c'; ctx.lineWidth = 2; ctx.strokeRect(X(0), Y(0), E.BW * SC, E.BH * SC);
  // terrain
  for (const r of s.terrain) {
    if (r.ty != null) continue; /* piezas de infestación (Typhon): se dibujan aparte como elipses */
    if (r.t === 'wall') { ctx.fillStyle = '#2d3642'; ctx.fillRect(X(r.x), Y(r.y), r.w * SC, r.h * SC); ctx.strokeStyle = '#6b7a8e'; ctx.lineWidth = 2; ctx.strokeRect(X(r.x), Y(r.y), r.w * SC, r.h * SC); ctx.save(); ctx.beginPath(); ctx.rect(X(r.x), Y(r.y), r.w * SC, r.h * SC); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; for (let k = -r.h; k < r.w + r.h; k += 0.7) { ctx.beginPath(); ctx.moveTo(X(r.x + k), Y(r.y)); ctx.lineTo(X(r.x + k - r.h), Y(r.y + r.h)); ctx.stroke(); } ctx.restore(); }
    else if (r.t === 'razor') { ctx.strokeStyle = '#d6574f'; ctx.setLineDash([2, 3]); ctx.lineWidth = 2; ctx.strokeRect(X(r.x), Y(r.y), r.w * SC, r.h * SC); ctx.setLineDash([]); }
    else { ctx.fillStyle = 'rgba(112,128,64,.55)'; ctx.fillRect(X(r.x), Y(r.y), r.w * SC, r.h * SC); ctx.strokeStyle = '#a3b26a'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(X(r.x), Y(r.y), r.w * SC, r.h * SC); ctx.setLineDash([]); }
  }
  if (s.dv === 8 && s.dvBcn) { ctx.strokeStyle = '#ffbe3c'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(X(s.dvBcn.x), Y(s.dvBcn.y), SC * 0.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#ffbe3c'; ctx.font = 'bold ' + Math.max(9, Math.round(SC * 0.5)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.dvBcn.n, X(s.dvBcn.x), Y(s.dvBcn.y)); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'; } // Devlan 8: baliza con su cuenta atrás
  if (s.ty === 5 && s.shEx && s.shEx.set && s.shEx.x > -50) { ctx.fillStyle = '#ffbe3c'; ctx.strokeStyle = '#1b222d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(s.shEx.x) + SC * 0.45, Y(s.shEx.y) - SC * 0.45, SC * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1b222d'; ctx.font = 'bold ' + Math.max(8, Math.round(SC * 0.36)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('B', X(s.shEx.x) + SC * 0.45, Y(s.shEx.y) - SC * 0.45); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'; } // Typhon 5: la bomba (junto a su portador o en el suelo)
  if (s.tyRP && (s.ty === 3 || s.ty === 6)) s.tyRP.forEach((P, i) => { ctx.fillStyle = (s.tyRD || []).includes(i + 1) ? '#d6574f' : '#4a5568'; ctx.beginPath(); ctx.arc(X(Math.max(0.4, Math.min(E.BW - 0.4, P[0]))), Y(Math.max(0.4, Math.min(E.BH - 0.4, P[1]))), SC * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(9, Math.round(SC * 0.5)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(i + 1, X(Math.max(0.4, Math.min(E.BW - 0.4, P[0]))), Y(Math.max(0.4, Math.min(E.BH - 0.4, P[1])))); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'; }); // Typhon 3: puntos de entrada de refuerzos (rojo = dado pendiente)
  if (s.tyF) s.tyF.forEach((f, fi) => { if (s.tySac && s.tySac[fi] === 0) return; const heavy = f[0] === 'O' || f[0] === 'P', qr = f[0] === 'Q' || f[0] === 'R'; ctx.save(); ctx.translate(X(f[1]), Y(f[2])); ctx.rotate(f[5] * Math.PI / 180); ctx.beginPath(); ctx.ellipse(0, 0, f[3] * SC, f[4] * SC, 0, 0, Math.PI * 2); ctx.fillStyle = heavy ? 'rgba(96,52,140,.92)' : 'rgba(138,84,190,.62)'; ctx.fill(); ctx.strokeStyle = s.tyDr && s.tyDr[fi] ? '#38d27a' : '#c9a2f2'; ctx.lineWidth = s.tyDr && s.tyDr[fi] ? 3 : 1.5; if (!heavy) ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(9, Math.round(SC * 0.55)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(qr && s.tyDr && s.tyDr[fi] ? '✓' : (s.tySac && s.tySac[fi] != null ? s.tySac[fi] : f[0]), X(f[1]), Y(f[2])); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'; });
  if (s.hf) { for (const h of s.hf) { const z = h[2]; ctx.fillStyle = z >= 4 ? 'rgba(255,190,60,.30)' : z >= 2 ? 'rgba(120,220,120,.28)' : 'rgba(120,200,255,.25)'; ctx.fillRect(X(h[0] * E.GRID - E.GRID / 2), Y(h[1] * E.GRID - E.GRID / 2), E.GRID * SC, E.GRID * SC); } } // niveles elevados (Vantage)
  // escotillas (portillos): cerradas = rayado ámbar; abiertas = verde punteado
  if (s.hatch) for (const h of s.hatch) { const r = h.r; if (!r) continue; ctx.save(); ctx.beginPath(); ctx.rect(X(r.x), Y(r.y), r.w * SC, r.h * SC); if (h.open) { ctx.fillStyle = 'rgba(56,210,122,.18)'; ctx.fill(); ctx.strokeStyle = '#38d27a'; ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.stroke(); } else { ctx.fillStyle = 'rgba(255,190,60,.22)'; ctx.fill(); ctx.clip(); ctx.strokeStyle = '#ffbe3c'; ctx.lineWidth = 1.5; for (let d = -r.h; d < r.w; d += .35) { ctx.beginPath(); ctx.moveTo(X(r.x + d), Y(r.y + r.h)); ctx.lineTo(X(r.x + d + r.h), Y(r.y)); ctx.stroke(); } } ctx.restore(); if (!h.open) { ctx.strokeStyle = '#ffbe3c'; ctx.lineWidth = 2; ctx.strokeRect(X(r.x), Y(r.y), r.w * SC, r.h * SC); } }
  // escala de terreno (Volkus): tipo, regla y altura de referencia
  if (s.vkp && (!MOB() || G.legendOn)) { const rows = [['#6b7a8e', 'Pesado 1.6–7.5″'], ['rgba(112,128,64,.9)', 'Ligero 1.0–1.4″'], ['rgba(255,190,60,.8)', 'Aventajado ≥4″'], ['rgba(120,220,120,.8)', 'Aventajado ≥2″'], ['rgba(120,200,255,.8)', 'Aventajado <2″']]; const fs0 = Math.max(8, SC * .36), lh = fs0 * 1.45, pw = Math.min(E.BW * SC * .3, 9.5 * SC); ctx.save(); ctx.font = fs0 + 'px system-ui'; ctx.globalAlpha = .88; ctx.fillStyle = 'rgba(10,14,20,.82)'; const bx = X(E.BW) - pw - 4, by = Y(0) + 4; ctx.fillRect(bx, by, pw, rows.length * lh + 8); ctx.globalAlpha = 1; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; rows.forEach((q, i) => { const yy = by + 4 + (i + .5) * lh; ctx.fillStyle = q[0]; ctx.fillRect(bx + 5, yy - fs0 * .4, fs0 * .8, fs0 * .8); ctx.fillStyle = '#e6ebf2'; ctx.fillText(q[1], bx + 10 + fs0, yy, pw - 14 - fs0); }); ctx.restore(); }
  if (s.fsteps) for (const f of s.fsteps) { ctx.fillStyle = 'rgba(120,100,70,.75)'; ctx.strokeStyle = '#2a2218'; ctx.lineWidth = 1.5; ctx.fillRect(X(f.x), Y(f.y), f.w * SC, f.h * SC); ctx.strokeRect(X(f.x), Y(f.y), f.w * SC, f.h * SC); }
  if (s.ladders) for (const l of s.ladders) { ctx.strokeStyle = COL[l.p]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(l.x) - .3 * SC, Y(l.y)); ctx.lineTo(X(l.x) + .3 * SC, Y(l.y)); ctx.moveTo(X(l.x) - .3 * SC, Y(l.y) - .4 * SC); ctx.lineTo(X(l.x) - .3 * SC, Y(l.y) + .4 * SC); ctx.moveTo(X(l.x) + .3 * SC, Y(l.y) - .4 * SC); ctx.lineTo(X(l.x) + .3 * SC, Y(l.y) + .4 * SC); ctx.stroke(); } // escaleras
  /* marcadores de misión: ahora los dibuja groundTokens con su ficha */
  if (s.bz) { const Z = s.bz, bc = E.bzCtl(s); ctx.save(); ctx.fillStyle = '#8a7a5a'; ctx.beginPath(); ctx.arc(X(Z.sx), Y(Z.sy), .55 * SC, 0, 7); ctx.fill(); ctx.strokeStyle = '#e8d9a8'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `${Math.max(10, .7 * SC)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', X(Z.sx), Y(Z.sy)); ctx.strokeStyle = bc < 0 ? '#c8d0dc' : COL[bc]; ctx.globalAlpha = .55; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(X(Z.px), Y(Z.py), E.OBJ_R * SC, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = bc < 0 ? '#c8d0dc' : COL[bc]; ctx.beginPath(); ctx.arc(X(Z.px), Y(Z.py), .3 * SC, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); } // Blood and Zeal: estatua y peana
  // objectives
  const ctl = E.objControl(s);
  s.objs.forEach((ob, i) => { const c = ctl[i] < 0 ? '#c8d0dc' : COL[ctl[i]]; ctx.strokeStyle = c; ctx.globalAlpha = .55; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(ob.x), Y(ob.y), E.OBJ_R * SC, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = c; ctx.save(); ctx.translate(X(ob.x), Y(ob.y)); ctx.rotate(Math.PI / 4); ctx.fillRect(-SC * .35, -SC * .35, SC * .7, SC * .7); ctx.restore();
    const tags = []; if (s.crit === 4 && s.orb === i) tags.push('◉ Orbe'); if (s.crit === 8 && s.data[i]) tags.push('Datos ' + s.data[i]); if (s.crit === 9 && s.inert[i]) tags.push('inerte'); if (s.crit === 7 && s.dl[i]) tags.push('descargado'); if (s.crit === 6 && s.carry[i] >= 0) tags.push('transportado');
    if (s.crit === 9 || s.crit === 5) tags.unshift('#' + (i + 1));
    if (tags.length) { ctx.font = 'bold ' + Math.max(10, SC * .5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3; const t = tags.join(' · '); ctx.strokeText(t, X(ob.x), Y(ob.y) - SC * .55); ctx.fillText(t, X(ob.x), Y(ob.y) - SC * .55); } });
  if (s.eq) for (let p = 0; p < 2; p++) { const c = s.eq[p].comms; if (c) { ctx.fillStyle = COL[p]; ctx.globalAlpha = .9; ctx.fillRect(X(c.x) - .35 * SC, Y(c.y) - .35 * SC, .7 * SC, .7 * SC); ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.font = (SC * .55) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('C', X(c.x), Y(c.y)); } }
  if (s.eq) for (let p = 0; p < 2; p++) { const e = s.eq[p]; for (const m of (e.mf || [])) { const own = viewer() === p; ctx.strokeStyle = COL[p]; ctx.lineWidth = 2; ctx.globalAlpha = m.up ? .5 : .9; ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), .5 * SC, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = COL[p]; ctx.font = (SC * .55) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.up ? (m.hy ? '✹' : '·') : (own ? (m.hy ? 'H' : '–') : '?'), X(m.x), Y(m.y) + SC * .2); } /* Minefield */ for (const m of e.mines) { ctx.fillStyle = COL[p]; ctx.globalAlpha = .85; ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), .45 * SC, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.font = (SC * .7) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✹', X(m.x), Y(m.y) + SC * .25); } if (e.ammo) { ctx.strokeStyle = COL[p]; ctx.lineWidth = 3; ctx.strokeRect(X(e.ammo.x) - .5 * SC, Y(e.ammo.y) - .5 * SC, SC, SC); ctx.fillStyle = COL[p]; ctx.font = (SC * .6) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', X(e.ammo.x), Y(e.ammo.y) + SC * .22); } if (e.ammo2) { ctx.strokeStyle = COL[p]; ctx.lineWidth = 3; ctx.strokeRect(X(e.ammo2.x) - .5 * SC, Y(e.ammo2.y) - .5 * SC, SC, SC); ctx.fillStyle = COL[p]; ctx.font = (SC * .6) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', X(e.ammo2.x), Y(e.ammo2.y) + SC * .22); } }
  for (let p = 0; p < 2; p++) { const T = s.tun && s.tun[p]; if (!T || !T.length) continue; ctx.strokeStyle = COL[p]; ctx.lineWidth = 5; ctx.setLineDash([2, 7]); ctx.beginPath(); T.forEach((m, i) => i ? ctx.lineTo(X(m.x), Y(m.y)) : ctx.moveTo(X(m.x), Y(m.y))); ctx.stroke(); ctx.setLineDash([]); T.forEach(m => { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), .5 * SC, 0, 7); ctx.fill(); ctx.stroke(); }); }
  if (E.cnLines) for (const L of E.cnLines(s)) { ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(80,255,120,.55)'; ctx.lineWidth = Math.max(3, L.w * SC); ctx.beginPath(); ctx.moveTo(X(L.x1), Y(L.y1)); ctx.lineTo(X(L.x2), Y(L.y2)); ctx.stroke(); ctx.strokeStyle = 'rgba(200,255,210,.9)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); } // Obelisk Node Matrix
  if (E.groundTokens) for (const m of E.groundTokens(s)) { const im = tokImg(m.k); if (im) { const sz = Math.max(14, 1.3 * SC); ctx.drawImage(im, X(m.x) - sz / 2, Y(m.y) - sz / 2, sz, sz); } } // Booby Trap, Trip Alarm, Caída
  for (let p = 0; p < 2; p++) for (const m of ((s.drop && s.drop[p]) || [])) { if (!s.ops.some(o => o.p === p && o.alive && o.above)) continue; ctx.strokeStyle = COL[p]; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), 2 * SC, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(X(m.x) - .5 * SC, Y(m.y)); ctx.lineTo(X(m.x) + .5 * SC, Y(m.y)); ctx.moveTo(X(m.x), Y(m.y) - .5 * SC); ctx.lineTo(X(m.x), Y(m.y) + .5 * SC); ctx.stroke(); } // marcadores de Caída (Tempestus Aquilon)
  // reach overlay
  const U = G.ui;
  if (U.R && U.cells) { ctx.fillStyle = 'rgba(56,210,122,.22)'; const h = (U.R.fine ? U.R.fine.step : E.GRID) * SC; for (const c of (U.R.fine ? U.R.fine.pts : [...U.R.cells].map(k => U.R.cellXY(k)))) { ctx.fillRect(X(c.x) - h / 2, Y(c.y) - h / 2, h, h); }
    const tgt = U.pending || U.hover; if (tgt) { const k = E.cellOf(U.R, tgt.x, tgt.y, tgt.z); if (U.cells.has(k)) { const path = U.R.path(k); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); ctx.beginPath(); path.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))); ctx.stroke(); ctx.setLineDash([]); const c = U.R.cellXY(k); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(X(c.x), Y(c.y), E.RAD * SC, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(U.R.dist[k].toFixed(1) + '"', X(c.x), Y(c.y) - E.RAD * SC - 5); } } }
  // enemy last activation overlay
  if (G.showEnemy) { const ep = (G.s.np || 2) > 2 ? -1 : 1 - viewer(); const evs = G.lastBy[ep] || []; const pulse = 0.55 + 0.25 * Math.sin(t / 300);
    for (const ev of evs) {
      if (ev.k === 'move') { ctx.strokeStyle = COL[ep]; ctx.globalAlpha = pulse; ctx.lineWidth = 3; ctx.setLineDash([2, 7]); ctx.lineCap = 'round'; ctx.beginPath(); ev.path.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(X(ev.from.x), Y(ev.from.y), E.RAD * SC, 0, 7); ctx.globalAlpha = .3; ctx.fillStyle = COL[ep]; ctx.fill(); ctx.globalAlpha = 1; }
      if (ev.k === 'shoot' || ev.k === 'fight') { const a = s.ops[ev.op], b = s.ops[ev.tg]; const hit = ev.k === 'shoot' ? ev.res.some(r => r.dmg > 0) : ev.steps.some(x => x.dmg); ctx.strokeStyle = hit ? '#ff4d5e' : '#ffb347'; ctx.globalAlpha = pulse + .2; ctx.lineWidth = 2.5; ctx.setLineDash(ev.k === 'shoot' ? [10, 6] : []); ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = hit ? '#ff4d5e' : '#ffb347'; ctx.font = `700 ${Math.max(12, SC * .8)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(ev.k === 'shoot' ? '✸' : '⚔', X(b.x), Y(b.y) - E.RAD * SC - 4); }
    }
    if (evs.length) { const first = evs.find(e => e.k === 'act'); if (first) { const o = s.ops[first.op]; ctx.strokeStyle = '#ffd24a'; ctx.globalAlpha = pulse; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(o.x), Y(o.y), E.RAD * SC + 5, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; } }
  }
  // targets
  if (U.targets) for (const [i, v] of U.targets) { const o = s.ops[i]; ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(o.x), Y(o.y), E.RAD * SC + 5 + Math.sin(t / 200) * 1.5, 0, 7); ctx.stroke(); ctx.fillStyle = '#000b'; ctx.fillRect(X(o.x) - 22, Y(o.y) + E.RAD * SC + 4, 44, 16); ctx.fillStyle = '#ff9aa4'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('≈' + v.toFixed(1), X(o.x), Y(o.y) + E.RAD * SC + 16); }
  if (s.act && U.mode === 'shoot') { const o = s.ops[s.act.op]; const w = Math.max(...o.weapons.filter(x => !x.m && x.r).map(x => x.r), 0); }
  // operatives
  const R0 = Math.max(9, E.RAD * SC);
  const arrowAt = (bx, by, fa, col, rr) => { const ang = Math.atan2(Y(by + Math.sin(fa)) - Y(by), X(bx + Math.cos(fa)) - X(bx)); ctx.save(); ctx.translate(X(bx), Y(by)); ctx.rotate(ang); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(rr + 8, 0); ctx.lineTo(rr - 2, -6); ctx.lineTo(rr - 2, 6); ctx.closePath(); ctx.fill(); ctx.restore(); };
  if (U.spr && s.act && U.spr.op === s.act.op) { const o = s.ops[U.spr.op], r = E.sprRun(s, o, U.spr.plan, 1); if (r.ok) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); ctx.beginPath(); r.path.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(X(r.x), Y(r.y), R0, 0, 7); ctx.fill(); arrowAt(r.x, r.y, r.fa, '#ffd24a', R0); } }
  if (U.turn && s.act && U.turn.op === s.act.op) { const o = s.ops[U.turn.op]; arrowAt(o.x, o.y, (o.fa || 0) + U.turn.deg * Math.PI / 180, '#ffd24a', R0 + 3); }
  for (const o of s.ops) {
    if (!o.alive) continue; const x = X(o.x), y = Y(o.y), c = COL[o.p], R0 = Math.max(9, E.bR(o) * SC);
    const act = s.act && s.act.op === o.i;
    ctx.globalAlpha = (!o.ready && !act) ? .55 : 1;
    if (U.sel === o.i || act) { ctx.strokeStyle = act ? '#ffd24a' : '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R0 + 5 + Math.sin(t / 250) * 1.2, 0, 7); ctx.stroke(); }
    const gr = ctx.createRadialGradient(x - R0 * .3, y - R0 * .3, 1, x, y, R0); gr.addColorStop(0, '#fff3'); gr.addColorStop(.25, c); gr.addColorStop(1, o.p ? '#0b4f78' : '#8f3a0a');
    ctx.fillStyle = gr; ctx.beginPath(); if (typeof o.bh === 'number') ctx.ellipse(x, y, R0, R0 * o.bh / o.br, o.fa != null ? o.fa : (o.fa0 || 0), 0, 7); else ctx.arc(x, y, R0, 0, 7); ctx.fill(); if (o.fa != null && o.kw && o.kw.includes('MOUNTED')) arrowAt(o.x, o.y, o.fa, '#fff', R0);
    ctx.lineWidth = 2.5; ctx.strokeStyle = E.injured(o) ? '#ff4d5e' : '#0b0e13'; if (o.order === 'conceal') ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(10, R0 * .95)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const idx = s.ops.filter(z => z.p === o.p).indexOf(o) + 1; ctx.fillText(idx, x, y + 1); ctx.textBaseline = 'alphabetic';
    // wounds arc
    ctx.strokeStyle = o.w / o.W > .5 ? '#38d27a' : '#ff4d5e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R0 + 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * o.w / o.W); ctx.stroke();
    if (o.stun > 0) { ctx.fillStyle = '#ffd24a'; ctx.font = '12px system-ui'; ctx.fillText('⚡', x + R0, y - R0); }
    /* fichas de operativo: solo en su carta (opTokChips) */
    if ((o.z || 0) >= 0.45) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = '700 11px system-ui'; const tz = '▲' + o.z.toFixed(0) + '"'; ctx.strokeText(tz, x - R0, y - R0); ctx.fillText(tz, x - R0, y - R0); }
    ctx.globalAlpha = 1;
  }
  ldvOverlay(ctx, s, U, (x, y) => [X(x), Y(y)], E.RAD * SC + 14);
  ctx.textAlign = 'start'; dirty = false;
}
/* Vista previa de línea de visión al mover: con una casilla elegida (o bajo el cursor), sobre cada enemigo «LdV:Ok» / «LdV:NOk» según si lo vería desde esa casilla. Se recalcula siempre desde la unidad que se está moviendo, así que cambia al activar/seleccionar otra y desaparece al cancelar o confirmar. */
function ldvOverlay(ctx, s, U, pt, up) {
  if (!U || !U.R || !U.cells || !U.mode || !s.act) return;
  const tgt = U.pending || U.hover; if (!tgt) return;
  const k = E.cellOf(U.R, tgt.x, tgt.y, tgt.z); if (!U.cells.has(k)) return;
  const me = s.ops[s.act.op]; if (!me) return; const c = U.R.cellXY(k);
  const foes = s.ops.filter(e => e.alive && e.p !== me.p && !e.ug);
  const key = [s.act.op, k, s.terrain.length, foes.map(e => e.i + ':' + e.x + ',' + e.y + ',' + (e.z || 0)).join('|')].join(';');
  if (U.ldvKey !== key) { const g = Object.assign({}, me, { x: c.x, y: c.y, z: c.z || 0 }); U.ldvKey = key; U.ldvVal = foes.map(e => [e.i, E.los(s, g, e)]); }
  ctx.save(); ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [i, ok] of U.ldvVal) { if (!ok) continue; /* solo se muestra «LdV:Ok»; sin línea de visión no se dibuja nada */ const e = s.ops[i]; const q = pt(e.x, e.y, (e.z || 0) + 1); if (!q) continue; const txt = ok ? 'LdV:Ok' : 'LdV:NOk', w = ctx.measureText(txt).width + 12, x = q[0], y = q[1] - up;
    ctx.fillStyle = 'rgba(11,14,19,.82)'; ctx.strokeStyle = ok ? '#38d27a' : '#ff4d5e'; ctx.lineWidth = 2; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 10, w, 20, 10); else ctx.rect(x - w / 2, y - 10, w, 20); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ok ? '#38d27a' : '#ff4d5e'; ctx.fillText(txt, x, y + 1); }
  ctx.restore();
}
requestAnimationFrame(loop);

const cvXY = e => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
const boardAt = e => { if (G.view3d) { const { sx, sy } = cvXY(e); return V3.unproject(sx, sy); } return toBoard(e); };
function clickAt(e) {
  const s = G.s; if (!s) return; if (G.ruler) { rulerAdd(boardAt(e)); return; } const b = boardAt(e); const U = G.ui;
  const my = isLocal(actor(s)) && !s.over && !(G.mode === 'ai' && actor(s) !== G.me);
  let hitOp;
  if (G.view3d) { const { sx, sy } = cvXY(e); const i = V3.pickOp(sx, sy); if (i != null) hitOp = { o: s.ops[i] }; if (U.focusArm) { U.focusArm = false; $('#mzFit').classList.remove('on'); if (i != null) { focusUnit3D(i); return; } } }
  else hitOp = s.ops.filter(o => o.alive).map(o => ({ o, d: Math.hypot(o.x - b.x, o.y - b.y) })).filter(z => z.d < E.bR(z.o) + 0.5).sort((a, c) => a.d - c.d)[0];
  if (my && U.mode && (U.mode === 'shoot' || U.mode === 'fight')) { if (hitOp && U.targets.has(hitOp.o.i)) return chooseWeapon(hitOp.o.i); if (!hitOp) { U.mode = null; U.targets = null; refreshAll(); } return; }
  if (my && U.mode && U.R) {
    if (U.mode === 'deploy') { const dop = s.ops[U.dplyOp], q = dop && E.dplyNear(s, dop, b.x, b.y); if (q) { const tch = e.pointerType === 'touch' || e.pointerType === 'pen'; if (tch && U.pending && Math.hypot(U.pending.x - q.x, U.pending.y - q.y) < 0.9) return confirmMove(); U.pending = { x: q.x, y: q.y, z: 0 }; if (!tch) return confirmMove(); refreshAll(); return; } } // despliegue exacto: la peana cabe donde se toque, no solo en la rejilla de 0,5"
    let k = E.cellOf(U.R, b.x, b.y);
    { // Volkus: bajo un nivel elevado también se puede estar; si la casilla tiene varios niveles alcanzables, cada toque alterna de nivel (arriba → abajo) y se confirma con el botón
      const gk = Math.round(b.y / E.GRID) * U.R.nx + Math.round(b.x / E.GRID), el = (U.R.elevAt && U.R.elevAt[gk]) || [];
      const lv = el.filter(q => U.cells.has(q)).sort((p, q) => U.R.cellXY(q).z - U.R.cellXY(p).z); if (gk >= 0 && gk < U.R.N && U.cells.has(gk)) lv.push(gk);
      if (lv.length > 1 && b.x >= 0) { let i = 0; if (U.pending) { const j = lv.findIndex(q => { const c = U.R.cellXY(q); return Math.hypot(c.x - U.pending.x, c.y - U.pending.y) < 0.05 && Math.abs((c.z || 0) - (U.pending.z || 0)) < 0.05; }); if (j >= 0) i = (j + 1) % lv.length; }
        U.pending = U.R.cellXY(lv[i]); refreshAll(); return; }
      if (lv.length === 1) k = lv[0];
    }
    if (U.cells.has(k)) { const c = U.R.cellXY(k); if (e.pointerType === 'touch' || e.pointerType === 'pen') { if (U.pending && Math.hypot(U.pending.x - c.x, U.pending.y - c.y) < 1.1) return confirmMove(); U.pending = c; refreshAll(); } else { U.pending = c; confirmMove(); } return; }
    if (!hitOp) { U.pending = null; refreshAll(); return; }
  }
  if (hitOp) { U.sel = hitOp.o.i; U.tapSel = hitOp.o.i; if (!s.act && !s.pend) U.mode = null; refreshAll(); if (!MOB()) { /* en móvil la ficha va flotando en el hueco libre del mapa */ } }
}
const ptrs = new Map(); let drag = null, g2 = null;
cv.addEventListener('pointermove', e => {
  if (!G.s) return;
  if (!G.view3d) {
    if (e.pointerType === 'touch') {
      if (!tp2.has(e.pointerId)) return; const p = tp2.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y; tp2.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (tp2.size >= 2 && pinch) { const [a, b] = [...tp2.values()]; const r = cv.getBoundingClientRect(); zoomAt(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
      else if (tdrag) { if (!tdrag.moved && Math.hypot(e.clientX - tdrag.x, e.clientY - tdrag.y) > 10) tdrag.moved = true; if (tdrag.moved) panBy(dx, dy); }
      return;
    }
    if (G.ui.R) G.ui.hover = toBoard(e); return;
  }
  if (ptrs.has(e.pointerId)) {
    const p = ptrs.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (ptrs.size === 1) { if (drag) { drag.dist += Math.abs(dx) + Math.abs(dy); if (drag.pen) { if (drag.dist > 14) drag.moved = true; } else if (drag.dist > 8) { drag.moved = true; if (G.ui.rotMode || drag.btn === 2 || e.shiftKey) { drag.adx = (drag.adx || 0) + Math.abs(dx); drag.ady = (drag.ady || 0) + Math.abs(dy); V3.rotate(-dx, dy);} else { const k = V3.dist / V3.F; V3.pan(-dx * k, dy * k / Math.max(0.35, Math.sin(V3.pitch))); } } } } // un dedo: desplazar el tablero
    else if (ptrs.size === 2) { // dos dedos: el gesto se fija al empezar (pellizco = solo zoom; arrastre conjunto = solo girar/inclinar)
      const o = [...ptrs.entries()].find(([id]) => id !== e.pointerId)[1]; const nd = Math.hypot(e.clientX - o.x, e.clientY - o.y), nm = { x: (e.clientX + o.x) / 2, y: (e.clientY + o.y) / 2 };
      if (!g2 || g2.n !== ptrs.size) g2 = { n: 2, d0: nd, m0: nm, d: nd, m: nm, mode: null };
      const ang = Math.atan2(e.clientY - o.y, e.clientX - o.x); if (g2.a == null) g2.a = ang;
      if (G.ui.rotMode) { const kk = V3.dist / V3.F; V3.pan(-(nm.x - g2.m.x) * kk, (nm.y - g2.m.y) * kk / Math.max(0.35, Math.sin(V3.pitch))); if (nd > 0 && g2.d > 0 && Math.abs(nd - g2.d) > 1.5) V3.zoom(g2.d / nd); }
      else { /* dos dedos: el gesto se fija al superar un umbral (zoom · girar · inclinar) y no se mezcla, para evitar saltos de cámara */
        let da = ang - g2.a; if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
        g2.accA = (g2.accA || 0) + da; const dZ = Math.abs(nd - g2.d0), dT = Math.abs(nm.y - g2.m0.y), dA = Math.abs(g2.accA) * Math.max(40, nd) / 2;
        { const mx = Math.max(dZ, dT, dA); /* el zoom tiene prioridad; el modo solo cambia si otro gesto domina con claridad */
          if (!g2.mode) { if (mx > 10) g2.mode = (dZ >= 10 && dA < dZ * 2 && dT < dZ * 2) ? 'zoom' : (dA >= dT ? 'rot' : 'tilt'); }
          else if (g2.mode !== 'zoom' && dZ > 36 && dZ > Math.max(dA, dT) * 1.5) g2.mode = 'zoom'; }
        if (g2.mode === 'zoom') { if (nd > 0 && g2.d > 0 && Math.abs(nd - g2.d) > 1.5) V3.zoom(g2.d / nd); }
        else if (g2.mode === 'rot') { if (Math.abs(da) > 0.004 && Math.abs(da) < 0.6) V3.rotate(da / 0.008, 0); }
        else if (g2.mode === 'tilt') { const dyy = nm.y - g2.m.y; if (Math.abs(dyy) > 0.5) V3.rotate(0, dyy); } }
      g2.d = nd; g2.m = nm; g2.a = ang;
      if (drag) drag.moved = true; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  } else if (G.ui.R && e.pointerType !== 'touch') G.ui.hover = boardAt(e);
});
const tp2 = new Map(); let tdrag = null, pinch = null;
const cvPt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
cv.addEventListener('contextmenu', e => e.preventDefault());
// evita que una pulsación larga/arrastre seleccione la pantalla entera y bloquee el juego
document.addEventListener('selectstart', e => { const t = e.target && (e.target.nodeType === 1 ? e.target : e.target.parentElement); if (!t || !t.closest('input,textarea,[contenteditable],.sel,.selectable')) e.preventDefault(); });
document.addEventListener('contextmenu', e => { const t = e.target; if (!t.closest || !t.closest('input,textarea,[contenteditable],.sel,.selectable')) e.preventDefault(); });
document.addEventListener('selectionchange', () => { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return; const sl = getSelection(); if (sl && !sl.isCollapsed) sl.removeAllRanges(); });
document.addEventListener('dragstart', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (!G.s) return; if (e.pointerType === 'touch' && G.ui.penAt && Date.now() - G.ui.penAt < 600) return; /* rechazo de palma con el Pencil */
  if (!G.view3d) {
    if (e.pointerType !== 'touch') return clickAt(e);
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId); tp2.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tp2.size === 1) tdrag = { x: e.clientX, y: e.clientY, moved: false }; else { if (tdrag) tdrag.moved = true; const [a, b] = [...tp2.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: Z2 }; }
    return;
  }
  cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (e.pointerType === 'pen') G.ui.penAt = Date.now(); if (ptrs.size === 1) drag = { dist: 0, moved: false, e, btn: e.button, pen: e.pointerType === 'pen' }; else if (drag) drag.moved = true;
});
const endPtr = e => { if (!G.view3d) { if (e.pointerType !== 'touch' || !tp2.has(e.pointerId)) return; tp2.delete(e.pointerId); if (e.type === 'pointerup' && tdrag && !tdrag.moved && tp2.size === 0 && !pinch) clickAt(e); if (tp2.size === 0) { tdrag = null; pinch = null; } return; } const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (had && drag && !drag.moved && ptrs.size === 0 && e.type === 'pointerup') clickAt(e); if (ptrs.size < 2) g2 = null; if (ptrs.size === 0) drag = null; };
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { if (!G.view3d) { e.preventDefault(); const q = cvPt(e); zoomAt(Z2 * (e.deltaY > 0 ? 0.9 : 1.1), q.x, q.y); return; } e.preventDefault(); V3.zoom(e.deltaY > 0 ? 1.08 : 0.92); }, { passive: false });
cv.addEventListener('dblclick', e => { if (G.view3d) V3.reset(); else { const q = cvPt(e); if (Z2 > 1.001) zoomAt(1, q.x, q.y); else zoomAt(2.2, q.x, q.y); } });
$('#mzIn').onclick = () => G.view3d ? V3.zoom(0.75) : zoomAt(Z2 * 1.4, VW / 2, VH / 2); $('#mzOut').onclick = () => G.view3d ? V3.zoom(1.33) : zoomAt(Z2 / 1.4, VW / 2, VH / 2); $('#mzRot').onclick = () => { G.ui.rotMode = !G.ui.rotMode; $('#mzRot').classList.toggle('on', G.ui.rotMode); toast(G.ui.rotMode ? 'Girar activado: un dedo gira e inclina · dos dedos mueven el mapa y hacen zoom. Con el botón apagado: un dedo mueve · dos dedos = pellizco zoom, girar los dedos gira y subir/bajar inclina' : 'Girar desactivado: arrastra para desplazar', 2000); };

$('#mzFit').onclick = () => G.view3d ? focus3D() : focusFit();
function focusUnit3D(i) { const o = G.s.ops[i]; if (!o || !o.alive || o.x < 0) { toast('Esa unidad no está en el tablero', 1800); return; } V3.focused = i; V3.focusOn(o.x, o.y); toast('Enfocado en ' + (o.name || 'la unidad') + ' · pulsa ⌖ otra vez para ver todo', 2200); }
function focus3D() { const s = G.s; if (!s) return; if (V3.focused != null) { V3.focused = null; V3.reset(); toast('Vista completa', 1500); return; } const i = G.ui.tapSel != null ? G.ui.tapSel : G.ui.sel; if (i != null && s.ops[i] && s.ops[i].alive && s.ops[i].x >= 0 && (G.ui.tapSel != null || G.ui.sel != null)) return focusUnit3D(i); G.ui.focusArm = !G.ui.focusArm; $('#mzFit').classList.toggle('on', !!G.ui.focusArm); if (G.ui.focusArm) toast('Toca una unidad del tablero para acercarte a ella', 2600); }
function setView(v3) { G.view3d = v3; try { localStorage.setItem('kt_view3d', v3 ? '1' : '0'); } catch (e) { } const b = $('#btnView'); if (b) { b.textContent = MOB() ? (v3 ? 'Vista 3D: cambiar a 2D' : 'Vista 2D: cambiar a 3D') : (v3 ? 'Vista 2D' : 'Vista 3D'); b.classList.toggle('on', v3); b.setAttribute('aria-pressed', v3 ? 'true' : 'false'); } $('#mapctl').hidden = false; $('#mapctl').classList.toggle('v3', !!v3); $('#mzIn').hidden = $('#mzOut').hidden = !!v3; $('#mzRot').hidden = !v3; if (v3) { V3.W = 0; resize(); } toast(v3 ? (matchMedia('(pointer:fine)').matches ? '3D · ratón: arrastrar = mover, clic derecho o Mayús = girar, rueda = zoom · teclado: WASD/flechas, Q/E girar, R/V inclinar, F enfocar, Inicio centrar · Pencil: tocar elige' : '3D: un dedo desplaza (botón ⟳ para girar), pellizco = zoom, doble toque para centrar') : 'Vista 2D', 3200); }
$('#btnView').hidden = true; /* la vista 2D se ha quitado: solo 3D */
function setTab(t) { $$('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t ? 'true' : 'false'); }); $$('.panel').forEach(p => p.classList.toggle('on', p.id === 'p' + t[0].toUpperCase() + t.slice(1))); }
$$('#tabs button').forEach(b => b.onclick = () => { setTab(b.dataset.t); if (MOB()) setSheet(true); });
const syncEnemyBtn = () => { const b = $('#btnShowEnemy'); b.classList.toggle('on', !!G.showEnemy); b.setAttribute('aria-pressed', G.showEnemy ? 'true' : 'false'); b.textContent = G.showEnemy ? '◉ Jugada rival' : '○ Jugada rival'; };
$('#btnShowEnemy').onclick = () => { G.showEnemy = !G.showEnemy; syncEnemyBtn(); }; setTimeout(syncEnemyBtn, 0);
$('#btnLegend').onclick = () => { G.legendOn = !G.legendOn; const b = $('#btnLegend'); b.classList.toggle('on', !!G.legendOn); b.setAttribute('aria-pressed', G.legendOn ? 'true' : 'false'); b.textContent = 'Leyenda de alturas: ' + (G.legendOn ? 'sí' : 'no'); dirty = true; };
const MOB = () => matchMedia('(max-width:760px),(max-height:520px)').matches;
function setOpts(on) { $('#game').classList.toggle('optsopen', !!on); $('#btnMenu').setAttribute('aria-expanded', on ? 'true' : 'false'); }
function setSheet(open) { if (!open) { V3.inset = 0; V3.insetR = 0; } $('#game').classList.toggle('sheetopen', !!open); $('#sheetGrip').setAttribute('aria-expanded', open ? 'true' : 'false'); setTimeout(() => { try { dirty = true; } catch (e) { } }, 260); }
$('#btnMenu').onclick = () => { if (MOB()) setOpts(!$('#game').classList.contains('optsopen')); else showGameMenu(); };
$('#btnGMenu').onclick = () => { setOpts(false); showGameMenu(); };
$$('#opts [data-gtab]').forEach(b => b.onclick = () => { setTab(b.dataset.gtab); setOpts(false); setSheet(true); });
$('#sheetGrip').onclick = () => setSheet(!$('#game').classList.contains('sheetopen'));
{ const gp = $('#sheetGrip'); let y0 = null, moved = false; // arrastrar el asa: tres estados (cerrada · media · completa)
  const g = () => $('#game'); const st = () => g().classList.contains('sheetfull') ? 2 : g().classList.contains('sheetopen') ? 1 : 0;
  const setSt = n => { g().classList.toggle('sheetfull', n === 2); setSheet(n >= 1); };
  gp.addEventListener('pointerdown', e => { y0 = e.clientY; moved = false; try { gp.setPointerCapture(e.pointerId); } catch (er) { } });
  gp.addEventListener('pointermove', e => { if (y0 != null && Math.abs(e.clientY - y0) > 12) moved = true; });
  gp.addEventListener('pointerup', e => { if (y0 != null && moved) { setSt(Math.max(0, Math.min(2, st() + (e.clientY < y0 ? 1 : -1)))); gp.dataset.dragged = '1'; setTimeout(() => delete gp.dataset.dragged, 50); } y0 = null; });
  gp.addEventListener('click', e => { if (gp.dataset.dragged) e.stopImmediatePropagation(); }, true); }
document.addEventListener('pointerdown', e => { const g = $('#game'); if (g.classList.contains('optsopen') && !e.target.closest('#opts') && !e.target.closest('#btnMenu')) setOpts(false); }, true);
window.addEventListener('resize', () => { if (!MOB()) { setOpts(false); } });
 $('#btnRules').onclick = showRules;
/* PC: panel derecho plegable (cajón que se despliega hacia el centro) */
{ const g = $('#game'), b = $('#pcPanelBtn'); let closed = false; try { closed = localStorage.getItem('kt_pcpanel') === '0'; } catch (e) { }
  const apply = () => { g.classList.toggle('pcclosed', closed); b.setAttribute('aria-expanded', closed ? 'false' : 'true'); try { localStorage.setItem('kt_pcpanel', closed ? '0' : '1'); } catch (e) { } };
  b.onclick = () => { closed = !closed; apply(); }; apply();
  setInterval(() => { try { g.classList.toggle('pcpend', !!(G && G.s && (G.s.pend || (G.s.gq && G.s.gq.length)))); } catch (e) { } }, 400); }
{ const g = $('#game'), b = $('#pcLeftBtn'); let closed = false; try { const v = localStorage.getItem('kt_pcleft'); closed = v === null ? innerWidth < 1200 : v === '0'; } catch (e) { }
  const apply = () => { g.classList.toggle('pclclosed', closed); b.setAttribute('aria-expanded', closed ? 'false' : 'true'); try { localStorage.setItem('kt_pcleft', closed ? '0' : '1'); } catch (e) { } };
  b.onclick = () => { closed = !closed; apply(); }; apply(); }
/* sonido, tutorial y ayuda contextual */
const ICO = { snd: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>', mute: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>' };
function syncSnd() { const b = $('#btnSnd'); if (b) { b.innerHTML = FX.isMuted() ? ICO.mute : ICO.snd; b.setAttribute('aria-pressed', FX.isMuted() ? 'true' : 'false'); b.title = FX.isMuted() ? 'Activar sonido' : 'Silenciar'; } }
$('#btnSnd').onclick = () => { FX.unlock(); FX.setMuted(!FX.isMuted()); syncSnd(); if (!FX.isMuted()) FX.play('select'); }; syncSnd();
window.addEventListener('pointerdown', () => FX.unlock(), { once: true, capture: true });
function showTutorial(n = 0) {
  $('#modalBox').innerHTML = tutorialHTML(n); $('#modal').hidden = false;
  $('#modalBox').querySelectorAll('[data-tut]').forEach(b => b.onclick = () => { const k = b.dataset.tut; FX.play('click'); if (k === 'skip' || (k === 'next' && n === TUT_N - 1)) { try { localStorage.setItem('kt.tut', '1'); } catch (e) { } closeModal(); } else showTutorial(n + (k === 'next' ? 1 : -1)); });
}
window.ktTutorial = showTutorial;
$('#status').onclick = () => { const h = ctxHelp(G); if (!h) return; $('#modalBox').innerHTML = `<button class="icon x" id="mx" aria-label="Cerrar">✕</button>${h}<div class="acts"><button class="btn ghost" id="hTut">Ver tutorial</button><button class="btn ghost" id="hRules">Reglas</button></div>`; $('#modal').hidden = false; $('#mx').onclick = closeModal; $('#hTut').onclick = () => showTutorial(0); $('#hRules').onclick = showRules; };
FX.init($('#fxcv'), $('#boardwrap'), i => { const s = G.s; if (!s || !s.ops[i]) return null; if (G.view3d) { const p = (V3.pawns || []).find(q => q.i === i); return p ? [p.sx, p.sy - 14] : null; } const o = s.ops[i]; return [X(o.x), Y(o.y) - 8]; });

addEventListener('keydown', e => { /* PC: teclado para la cámara y atajos */
  const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); if (typing || e.ctrlKey || e.metaKey || e.altKey || !G || !G.s || !$('#game').classList.contains('active')) return; if (document.querySelector('#modal:not([hidden]) .modal-box')) return;
  const k = e.key.toLowerCase(), st = e.shiftKey ? 3 : 1;
  if (G.view3d) { const kk = V3.dist / V3.F * 40 * st; let h = true;
    if (k === 'w' || k === 'arrowup') V3.pan(0, kk); else if (k === 's' || k === 'arrowdown') V3.pan(0, -kk); else if (k === 'a' || k === 'arrowleft') V3.pan(-kk, 0); else if (k === 'd' || k === 'arrowright') V3.pan(kk, 0);
    else if (k === 'q') V3.rotate(-14 * st, 0); else if (k === 'e') V3.rotate(14 * st, 0); else if (k === 'r' || k === 'pageup') V3.rotate(0, -10 * st); else if (k === 'v' || k === 'pagedown') V3.rotate(0, 10 * st);
    else if (k === '+' || k === '=') V3.zoom(0.88); else if (k === '-' || k === '_') V3.zoom(1.14); else if (k === 'home' || k === '0') { V3.focused = null; V3.reset(); } else if (k === 'f') focus3D(); else h = false; if (h) { e.preventDefault(); return; } }
  else { let h = true; const st2 = 60 * st; if (k === 'w' || k === 'arrowup') panBy(0, st2); else if (k === 's' || k === 'arrowdown') panBy(0, -st2); else if (k === 'a' || k === 'arrowleft') panBy(st2, 0); else if (k === 'd' || k === 'arrowright') panBy(-st2, 0); else if (k === '+' || k === '=') zoomAt(Z2 * 1.25, VW / 2, VH / 2); else if (k === '-' || k === '_') zoomAt(Z2 / 1.25, VW / 2, VH / 2); else if (k === 'f' || k === 'home' || k === '0') focusFit(); else h = false; if (h) { e.preventDefault(); return; } }
  if (k === 'enter') { const b = document.querySelector('#game [data-a="confirm"],#game [data-dplyok],#game [data-eqpok]'); if (b && b.offsetParent) { e.preventDefault(); b.click(); } }
  else if (k === 'tab') { const s = G.s, L = s.ops.filter(o => o.p === s.active && o.alive && o.x >= 0); if (L.length) { e.preventDefault(); const c = L.findIndex(o => o.i === G.ui.sel); G.ui.sel = L[(c + (e.shiftKey ? L.length - 1 : 1)) % L.length].i; refreshAll(); } } });
addEventListener('keydown', e => { if (e.key === 'Escape') { G.ui.mode = null; G.ui.pending = null; G.ui.targets = null; closeModal(); if (G.s) refreshAll(); } });


/* ============================ MESA LIBRE (estilo Tabletop Simulator) ============================ */
const IMGU = u => (typeof U === 'function' ? U(u) : u);
const opByImg = u => { for (const t of DB || []) for (const o of t.ops) if ((o.img || [])[0] === u) return o; return null; };
const teamOfImg = u => { const c = ESM.ES && ESM.ES.cards && ESM.ES.cards[u]; if (c && c.tm) return c.tm; for (const t of DB || []) { if (t.ops.some(o => (o.img || []).includes(u))) return t.id; for (const k in (t.cards || {})) if ((t.cards[k] || []).includes(u)) return t.id; } return null; };
/* Erratas oficiales vigentes de la banda, junto a cada carta y en la pantalla de la banda */
const errBox = () => ''; /* sección de erratas retirada */
const zoomHTML = (u, alt) => { const o = opByImg(u); return (ESM.cardOrNull(u, 'zoom', o) || (`<img src="${IMGU(u)}" alt="${H(alt || '')}" style="width:100%;max-width:440px;height:auto;border-radius:8px;cursor:default">` + (o && o.w ? ESM.opFace(o, u, 'zoom') : ''))) + errBox(teamOfImg(u)); };
const IMGB = (() => { let m = null; return u => { if (!m) { m = new Map(); for (const t of DB) for (const k in (t.backs || {})) m.set(k, [t.backs[k]]); m.set('img/ue_port1.webp', ['img/ue_port2.webp']); m.set('img/ue_util2.webp', ['img/ue_util3.webp', 'img/ue_util4.webp']); m.set('img/fq_sforbs.webp', ['img/fq_sforbs_b.webp']); } return m.get(u); }; })(); // reversos de cartas de ardid / equipo / regla (front → [reversos])
const flipWrap = (front, backs) => backs && backs.length ? `<span class="fw" data-n="0"><span class="fwf">${front}</span>${backs.map(b => `<img class="fwb" hidden loading="lazy" data-z="${b}" src="${IMGU(b)}" alt="Reverso de la carta">`).join('')}<button class="flipbtn" data-flipbtn aria-label="Girar carta" title="Girar carta">↻</button></span>` : front;
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-flipbtn]'); if (!b) return; e.stopPropagation(); e.preventDefault(); const w = b.closest('.fw'), kids = [w.querySelector(':scope > .fwf'), ...w.querySelectorAll(':scope > .fwb')]; const n = ((+w.dataset.n || 0) + 1) % kids.length; w.dataset.n = n; kids.forEach((k, i) => { k.hidden = i !== n; }); }, true);
const cimg = (u, cls, alt, o) => flipWrap(ESM.cardOrNull(u, cls, o) || `<img loading="lazy" decoding="async" class="${cls || ''}" data-z="${u}" src="${IMGU(u)}" alt="${H(alt || '')}" onload="this.classList.add('ld')">`, IMGB(u));
const TB = createTable(E, $('#tcv'), {
  change: () => { tUI(); sbcSave(); },
  gl: () => (GLR.ok && placeGL($('.tbody'), true)) ? glOpts(TB.DPR) : null,
  card: (o, name) => { $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>${H(name)}</h2><div class="cards">${(o.img || []).map(u => ESM.cardOrNull(u, 'zoom', opByImg(u)) || `<img src="${IMGU(u)}" alt="carta">`).join('') || '<p class="hint">Sin imagen.</p>'}</div>`; $('#modal').hidden = false; $('#mx').onclick = closeModal; },
  reset: () => startSandbox()
});
new ResizeObserver(() => TB.resize()).observe($('#tcv').parentElement);
function startSandbox() {
  const TT = M.teams.slice(0, 2); for (const t of TT) if (t.ops.length < 1) return toast('Elige al menos un operativo por equipo');
  const seed = (Math.random() * 1e9) | 0; const setup = { seed, teams: TT.map(t => ({ id: t.id, ops: t.ops.slice() })) }; const mp = parseInt($('#mapSel').value); if (Number.isInteger(mp)) setup.map = mp; if (SBC.on) setup.custom = SBC.data; $('#tMap').value = SBC.on ? 'custom' : $('#mapSel').value;
  const s = E.newGame(setup, DB); if (SBC.on && !s.custom) SBC.on = false;
  const names = s.ops.map(op => { const same = s.ops.filter(x => x.p === op.p && x.role === op.role); return op.role + (same.length > 1 ? ' ' + String.fromCharCode(65 + same.indexOf(op)) : ''); });
  $('#menu').classList.remove('active'); $('#game').classList.remove('active'); $('#table').classList.add('active');
  TB.resize(); TB.open(s, names); TB.start(); tUI();
  $('#tCust').hidden = !SBC.on; if (SBC.on) { $('#cW').value = E.BW; $('#cH').value = E.BH; $('#tTer').classList.add('on'); sbcSave(); }
}
// Línea de visión (libro, pág. 51 y 55): en 2D si los agentes están a la misma altura; en 3D si hay diferencia de altura (terreno Aventajado).
// Visible = línea recta sin obstrucciones desde la cabeza del agente hasta cualquier parte del blanco (se ignoran las peanas).
// Alturas oficiales (Volkus, pack de misiones, búnker/empalizada): la visibilidad sobre terreno Pesado solo se traza si el agente o el blanco está al menos 2" por encima de la base de ese terreno (altura medida desde la peana).
// No hay alturas numéricas oficiales de más terreno: se usa el mismo umbral de 2" para todo muro. Cubiertas (techos): supuesto de 0,3" de grosor.
const los3 = E.los; // la línea de visión 3D ya vive en el motor (todo el juego)
window.__los3 = los3;
function dmgUI() {
  const el = $('#tdmg'); const D = TB.dmg; const s = TB.s;
  if (!el) return; if (!D || !s) { el.hidden = true; return; }
  const at = s.ops[D.a], tg = D.tgt != null ? s.ops[D.tgt] : null, w = D.w;
  if (!at) { TB.dmg = null; TB.pick = null; el.hidden = true; return; }
  const wr = (w.wr || '').toLowerCase(), FX = { lethal: ((/lethal\s*(\d)\+/.exec(wr) || [])[1] | 0) || 6, rend: /rending/.test(wr), stun: /stun/.test(wr), hot: /\bhot\b/.test(wr), pierce: ((/piercing(?:\s+crits)?\s*(\d)/.exec(wr) || [])[1] | 0), pcrit: /piercing\s+crits/.test(wr), brutal: /brutal/.test(wr), shock: /shock/.test(wr), dev: ((/devastating\s*(\d)/.exec(wr) || [])[1] | 0), devR: ((/(\d)\s*["”″]\s*devastating/.exec(wr) || [])[1] | 0), sat: /saturate/.test(wr), blast: /blast/.test(wr) ? ((/blast\s*(\d)/.exec(wr) || [])[1] | 0 || 2) : 0, torr: /torrent/.test(wr) ? ((/torrent\s*(\d)/.exec(wr) || [])[1] | 0 || 2) : 0 };
  { const r0 = TB.result(); if (D.wait && !r0.pending && r0.vals.length) {
    if (D.wait === 'atk') { const okv = r0.vals.filter(x => x >= w.hit || x === 6); let c = okv.filter(x => x >= FX.lethal || x === 6).length, n = okv.length - c; const nt = []; if (FX.lethal < 6) nt.push('Lethal ' + FX.lethal + '+'); if (FX.rend && c > 0 && n > 0) { n--; c++; nt.push('Rending: 1 normal → crítico'); } D.n = n; D.c = c; D.c0 = c; D.stun = FX.stun && c > 0; if (D.stun) nt.push('Stun: el blanco pierde 1 PA en su próxima activación'); D.note = nt.join(' · '); }
    else if (D.wait === 'hot') { const v = r0.vals[0]; D.hot = { v, dmg: v < w.hit ? 2 * v : 0 }; }
    D.wait = null; } }
  const RD = E.RAD, dd = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) - E.bRp(p, q);
  const devN = tg && FX.dev ? (D.c0 != null ? D.c0 : D.c) * FX.dev : 0; const devNear = tg && devN && FX.devR ? s.ops.filter(e => e.alive && e !== tg && dd(e, tg) <= FX.devR && los3(s, tg, e)) : [];
  let cvr = ''; if (tg && !w.m) { try { const si = E.sight(s, at, D.isSec && D.t0 != null && s.ops[D.t0] ? s.ops[D.t0] : tg); cvr = si.obsc ? 'Ofuscado' : si.any ? (si.heavy ? 'A cubierto (terreno pesado): el defensor tiene salvación de cobertura' : 'A cubierto (terreno ligero): el defensor tiene salvación de cobertura') : 'Sin cobertura'; if (FX.sat && si.any) cvr += ' — Saturate: la ignora'; if (D.isSec) cvr += ' (secundario: mismo estado que el blanco principal, según el libro)'; } catch (er) { } }
  const tot = tg ? D.n * w.d + D.c * w.cd : 0;
  const fxl = [FX.lethal < 6 ? 'Lethal ' + FX.lethal + '+' : '', FX.rend ? 'Rending' : '', FX.stun ? 'Stun' : '', FX.pierce ? 'Piercing ' + (FX.pcrit ? 'Crits ' : '') + FX.pierce + ' (salvaciones −' + FX.pierce + ')' : '', FX.brutal ? 'Brutal' : '', FX.shock ? 'Shock' : '', FX.hot ? 'Hot' : '', FX.sat ? 'Saturate (el defensor no usa cobertura)' : '', FX.blast ? 'Blast ' + FX.blast + '"' : '', FX.torr ? 'Torrent ' + FX.torr + '"' : '', FX.dev ? (FX.devR ? FX.devR + '" ' : '') + 'Devastating ' + FX.dev : ''].filter(Boolean).join(' · ');
  el.hidden = false;
  el.innerHTML = `<div class="dh"><b style="color:${COL[at.p]}">${H(TB.names[at.i])}</b> · ${H(w.n)} (${w.d}/${w.cd}) ${D.isSec ? ' · <i>secundario ' + D.si + '/' + D.sec.length + '</i>' : ''} → ${tg ? `<b style="color:${COL[tg.p]}">${H(TB.names[tg.i])}</b> ${tg.w}/${tg.W} H` : '<i>toca un blanco enemigo</i>'}</div>` + (tg ? `<div class="dr"><span>Normales</span><button data-d="n-">−</button><b>${D.n}</b><button data-d="n+">+</button><span>Críticos</span><button data-d="c-">−</button><b>${D.c}</b><button data-d="c+">+</button></div><div class="dr"><button class="btn ghost small" data-d="roll">🎲 Tirar ataque (${Math.min(12, w.atk)})</button>${FX.hot ? '<button class="btn ghost small" data-d="hot">🎲 Hot (D6)</button>' : ''}</div>${cvr ? `<div class="dn">${H(cvr)}</div>` : ''}${fxl ? `<div class="dn">${H(fxl)}</div>` : ''}${devN ? `<div class="dn bad">Devastating: ${devN} de daño a ${H(TB.names[tg.i])}${devNear.length ? ' y a ' + devNear.map(e => H(TB.names[e.i])).join(', ') : ''} (antes de salvaciones)</div>` : ''}${D.sec && D.sec.length && !D.isSec ? `<div class="dn">Tras este blanco: ${D.sec.length} secundario(s) (${D.sec.map(i => H(TB.names[i])).join(', ')}), cada uno con su tirada</div>` : ''}${D.note ? `<div class="dn ok">${H(D.note)}</div>` : ''}${D.hot ? `<div class="dn ${D.hot.dmg ? 'bad' : 'ok'}">Hot: ${D.hot.v} ${D.hot.v < w.hit ? '&lt; ' + w.hit + ' → ' + H(TB.names[at.i]) + ' sufre ' + D.hot.dmg : '≥ ' + w.hit + ' → sin efecto'}</div>` : ''}<div class="dr"><button class="btn small" data-d="apply">Aplicar ${tot + devN} ${tot + devN === 1 ? 'herida' : 'heridas'}${D.sec && D.si < D.sec.length ? ' y siguiente' : ''}</button>${D.isSec ? '<button class="btn ghost small" data-d="skip">Omitir</button>' : ''}<button class="btn ghost small" data-d="cancel">Cancelar</button></div>` : '<div class="dr"><button class="btn ghost small" data-d="cancel">Cancelar</button></div>');
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
    const k = b.dataset.d;
    if (k === 'n-') D.n = Math.max(0, D.n - 1); else if (k === 'n+') D.n++; else if (k === 'c-') D.c = Math.max(0, D.c - 1); else if (k === 'c+') D.c++;
    else if (k === 'roll') { TB.nDice = Math.min(12, w.atk); TB.th = w.hit; $('#tN').value = TB.nDice; $('#tTh').value = TB.th; D.wait = 'atk'; D.hot = D.hot; TB.throwDice(TB.nDice); }
    else if (k === 'hot') { D.wait = 'hot'; D.hot = null; TB.throwDice(1); }
    else if (k === 'use') { const r = TB.result(); if (r.pending || !r.vals.length) { toast('Tira primero los dados'); return; } D.c = r.crit >= 0 ? r.vals.filter(x => x === 6 && x >= w.hit).length : 0; D.n = r.ok - D.c; }
    else if (k === 'cancel') { TB.dmg = null; TB.pick = null; }
    else if (k === 'skip') { nextSec(); }
    else if (k === 'apply') {
      const hurt = (op, n) => { op.w = Math.max(0, op.w - n); if (op.w <= 0) { op.alive = false; op.ap = 0; } };
      if (devN) { hurt(tg, devN); devNear.forEach(e => hurt(e, devN)); }
      hurt(tg, tot); if (D.stun && tg.alive) tg.stun = 1;
      toast(`${TB.names[tg.i]}: −${tot + devN} H${tg.alive ? '' : ' · retirada'}`);
      nextSec();
    }
    function nextSec() {
      const more = D.sec && D.si < D.sec.length;
      if (more) { D.tgt = D.sec[D.si]; D.si++; D.isSec = true; D.n = 0; D.c = 0; D.c0 = null; D.note = ''; D.stun = false; }
      else { if (D.hot && D.hot.dmg) { at.w = Math.max(0, at.w - D.hot.dmg); if (at.w <= 0) { at.alive = false; at.ap = 0; } } TB.dmg = null; TB.pick = null; }
    }
    tUI();
  });
}
function tUI() {
  const s = TB.s; if (!s) return; if (s.custom) { $('#cAdd').disabled = TB.started; $('#cDup').disabled = TB.started; $('#cHint').textContent = TB.started ? 'Partida empezada: ya no se puede añadir escenografía, pero sí quitarla (Borrar / Vaciar).' : 'Toca una pieza para seleccionarla y arrástrala. Los objetivos también se arrastran. Al realizar la primera acción ya no podrás añadir escenografía (sí quitarla).'; } const r = TB.result(); const box = $('#tres'); dmgUI();
  if (TB.dice.length) { box.hidden = false; box.innerHTML = r.pending ? 'Rodando…' : `🎲 ${r.vals.join(' · ')} &nbsp;=&nbsp; <b>${r.sum}</b><br><span class="hint">Éxitos (${TB.th}+): <b>${r.ok}</b> · Críticos (6): <b>${r.crit}</b></span>`; } else box.hidden = true;
  const sel = $('#tsel'); const o = s.ops[TB.sel];
  if (o) { if (TB.wKey !== TB.sel) { const pv = s.ops[TB.wKey]; if (pv) pv.ring = 0; TB.wKey = TB.sel; TB.wsel = 0; } const wl = o.weapons || []; const ctl = `<span class="nm" style="color:${COL[o.p]}">${H(TB.names[o.i])} · ${o.w}/${o.W} H · PA ${o.ap || 0}/${o.apl}</span><button class="btn ghost small" data-a="act:rep">Reposicionarse</button><button class="btn ghost small" data-a="act:dash">Correr</button><button class="btn ghost small" data-a="act:chg">Cargar</button><button class="btn ghost small" data-a="act:fb">Retirarse</button><button class="btn small" data-a="act:shoot">Disparar</button><button class="btn small" data-a="act:fight">Combatir</button><button class="btn ghost small" data-a="act:pick">Recoger</button><button class="btn ghost small" data-a="act:mis">Misión</button><select id="tWpn" class="wsel" title="Arma">${wl.map((w, k) => `<option value="${k}"${k === TB.wsel ? ' selected' : ''}>${w.m ? '⚔' : '➶'} ${H(w.n)} · ${w.atk}A ${w.hit}+ ${w.d}/${w.cd}</option>`).join('')}</select>`; if (MOB()) { sel.hidden = true; $('#tUnitCtl').innerHTML = ctl; $('#tAct').hidden = false; if (G.tLast !== TB.sel) { G.tLast = TB.sel; TB.card(o); } } else { sel.hidden = false; sel.innerHTML = ctl; $('#tUnitCtl').innerHTML = ''; $('#tAct').hidden = true; } }
  else if (TB.selTok) { G.tLast = null; $('#tUnitCtl').innerHTML = ''; $('#tAct').hidden = true; $('#table').classList.remove('actsopen'); sel.hidden = false; sel.innerHTML = '<span class="nm">Ficha</span><button class="btn ghost small" data-a="tok">Quitar ficha</button>'; }
  else { const pv = s.ops[TB.wKey]; if (pv) pv.ring = 0; TB.wKey = null; sel.hidden = true; G.tLast = null; $('#tUnitCtl').innerHTML = ''; $('#tAct').hidden = true; $('#table').classList.remove('actsopen'); }
  $$('#tWpn').forEach(sl => sl.onchange = () => { TB.wsel = +sl.value; });
  $$('#tsel [data-a], #tUnitCtl [data-a]').forEach(b => b.onclick = () => { const a = b.dataset.a; if (a === 'w-') TB.wound(-1); else if (a === 'w+') TB.wound(1); else if (a === 'ring') TB.cycleRing(); else if (a === 'm-' || a === 'm+') cycleMesh(s.ops[TB.sel], a === 'm+' ? 1 : -1); else if (a === 'card') { const q = s.ops[TB.sel]; q && $('#tcv') && TB.card(q); } else if (a.startsWith('act:')) TB.coreAct(a.slice(4)); else if (a === 'tok') TB.removeSel(); else TB.toggle(a); });
}
TB.coreAct = k => {
  const o = TB.s.ops[TB.sel]; if (!o) return; const kw = (o.weapons || []);
  if (TB.dmg && k !== 'shoot' && k !== 'fight') { TB.dmg = null; TB.pick = null; }
  const spend = () => { if (o.ready) { o.ready = false; o.ap = o.apl; if (o.stun) { o.ap = Math.max(0, o.apl - 1); o.stun = 0; toast('Aturdido: 1 PA menos'); } } o.ap = Math.max(0, (o.ap || 0) - 1); };
  if (k === 'rep' || k === 'dash' || k === 'chg' || k === 'fb' || k === 'pick' || k === 'mis') {
    // alcances del reglamento: Reposicionarse/Retirarse = Mover; Correr = 3"; Cargar = Mover + 2"; Recoger/Misión = a ≤1"
    o.ring = k === 'dash' ? 3 : k === 'chg' ? o.move + 2 : (k === 'pick' || k === 'mis') ? 1 : o.move; spend();
    toast(({ rep: 'Reposicionarse: hasta ' + o.move + '"', dash: 'Correr: hasta 3"', chg: 'Cargar: hasta ' + (o.move + 2) + '" y termina en combate', fb: 'Retirarse: hasta ' + o.move + '"', pick: 'Recoger: marcador a ≤1"', mis: 'Misión: a ≤1" del objetivo' })[k] + ' (aro en el tablero)');
  } else if (k === 'shoot' || k === 'fight') {
    const want = k === 'fight'; let w = kw[TB.wsel]; if (!w || !!w.m !== want) w = kw.find(x => !!x.m === want);
    if (!w) { toast(want ? 'Sin armas de combate' : 'Sin armas a distancia'); return; }
    if (!want && w.r) o.ring = w.r; else if (want) o.ring = 1; spend();
    TB.nDice = Math.min(12, w.atk); TB.th = w.hit; $('#tN').value = TB.nDice; $('#tTh').value = TB.th;
    TB.dmg = { a: o.i, w, tgt: null, n: 0, c: 0 }; const secOk = (sv, at, ww, e) => { try { return los3(sv, at, e) && E.targetable(sv, at, ww, e); } catch (er) { return los3(sv, at, e); } };
  TB.pick = t => { const D = TB.dmg, sv = TB.s, ww = D.w, wr = (ww.wr || '').toLowerCase(), at = sv.ops[D.a]; { let ok = true, why = ''; try { if (ww.m) { ok = E.inCZ(sv, at, t); why = 'El blanco no está a ≤1" con línea de visión'; } else { ok = los3(sv, at, t) && Math.hypot(at.x - t.x, at.y - t.y) - 2 * E.RAD <= (ww.r || 99); why = los3(sv, at, t) ? 'Fuera del alcance del arma (' + ww.r + '")' : 'Sin línea de visión'; if (ok) { const si = E.sight(sv, at, t); if (si.obsc) { ok = false; why = 'Blanco ofuscado por terreno pesado: no se puede disparar'; } } } } catch (er) { ok = true; } if (!ok) { toast(why); return; } } const bl = /blast/.test(wr) ? ((/blast\s*(\d)/.exec(wr) || [])[1] | 0 || 2) : 0, to = /torrent/.test(wr) ? ((/torrent\s*(\d)/.exec(wr) || [])[1] | 0 || 2) : 0, R = bl || to; D.tgt = t.i; D.t0 = t.i; D.isSec = false; D.si = 0; D.sec = !ww.m && R ? sv.ops.filter(e => e.alive && e !== at && e !== t && (bl || e.p !== at.p) && Math.hypot(e.x - t.x, e.y - t.y) - 2 * E.RAD <= R && (bl ? los3(sv, t, e) : secOk(sv, at, ww, e))).map(e => e.i) : []; TB.pick = null; tUI(); };
    toast((want ? 'Combatir' : 'Disparar') + ': toca el blanco enemigo');
  }
  $('#table').classList.remove('actsopen'); TB.change && TB.change(); tUI();
};
TB.card = q => { const m = $('#modal'); m.classList.toggle('peek', MOB()); $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><div class="cards one">${(q.img || []).slice(0, 1).map(u => ESM.cardOrNull(u, 'zoom', q) || `<img src="${IMGU(u)}" alt="${H(TB.names[q.i])}">`).join('') || '<p class="hint">Sin imagen.</p>'}</div>`; m.hidden = false; $('#mx').onclick = closeModal; };
(function initTableUI() {
  $('#tN').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}"${i === 3 ? ' selected' : ''}>${i + 1} D6</option>`).join('');
  $('#tTh').innerHTML = [2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === 4 ? ' selected' : ''}>Éxito ${n}+</option>`).join('');
  $('#tTokens').innerHTML = ['#ff7a2a', '#35b6ff', '#ff4d5e', '#ffd24a', '#cbd5e1', '#38d27a'].map((c, i) => `<button class="tk" data-c="${i}" style="background:${c}" title="Añadir ficha"></button>`).join('');
  $$('#tTokens .tk').forEach(b => b.onclick = () => TB.addToken(+b.dataset.c));
  $('#tStk').onchange = ev => { const k = ev.target.value; if (k) TB.addSticker(k); ev.target.value = ''; };
  $('#tRoll').onclick = () => { TB.nDice = +$('#tN').value; TB.throwDice(TB.nDice); };
  $('#tN').onchange = () => { TB.nDice = +$('#tN').value; };
  $('#tTh').onchange = () => { TB.th = +$('#tTh').value; tUI(); };
  $('#tClear').onclick = () => TB.clearDice();
  $('#tToolMove').onclick = () => { TB.tool = 'move'; $('#tToolMove').classList.add('on'); $('#tToolRuler').classList.remove('on'); };
  $('#tToolRuler').onclick = () => { TB.tool = 'ruler'; $('#tToolRuler').classList.add('on'); $('#tToolMove').classList.remove('on'); TB.ruler = null; toast('Regla: arrastra de un punto a otro (se pega a las miniaturas)', 2600); };
  $('#tSnap').onclick = e => { TB.snap = !TB.snap; e.currentTarget.classList.toggle('on', TB.snap); };
  $('#cApply').onclick = () => { const w = Math.max(12, Math.min(72, +$('#cW').value || 30)), h = Math.max(12, Math.min(72, +$('#cH').value || 22)); if (SBC.on && TB.s) { sbcSave(); const d = SBC.data, fx = w / d.bw, fy = h / d.bh; d.o = (d.o || []).map(o => [Math.min(w - 1, o[0] * fx), Math.min(h - 1, o[1] * fy)]); d.t = d.t.map(r => { const q = { ...r }; q.w = Math.min(q.w, w); q.h = Math.min(q.h, h); q.x = Math.max(0, Math.min(w - q.w, q.x)); q.y = Math.max(0, Math.min(h - q.h, q.y)); return q; }); d.bw = w; d.bh = h; try { localStorage.setItem('kt_custom', JSON.stringify(d)); } catch (e) {} startSandbox(); toast('Tablero de ' + w + '" × ' + h + '"', 2000); } };
  $('#cAdd').onchange = e => { if (e.target.value) TB.addTerrain(e.target.value); e.target.value = ''; };
  for (const [id, op] of [['cRot', 'rot'], ['cLp', 'lp'], ['cLm', 'lm'], ['cTp', 'tp'], ['cTm', 'tm'], ['cDup', 'dup'], ['cDel', 'del']]) $('#' + id).onclick = () => { if (!TB.selTer) return toast('Toca primero una pieza de escenografía', 1800); TB.terOp(op); };
  $('#cClr').onclick = () => { TB.clearTerrain(); };
  $('#tTer').onclick = e => { TB.terrainEdit = !TB.terrainEdit; e.currentTarget.classList.toggle('on', TB.terrainEdit); toast(TB.terrainEdit ? 'Terreno movible: arrastra muros y coberturas' : 'Terreno fijo', 2000); };
  $('#tCam').onclick = () => TB.V.reset();
  [0, 1].forEach(p => { $('#tCards' + p).onclick = () => { const t = TB.s && teamById(TB.s.setup ? TB.s.setup.teams[p].id : M.teams[p].id); if (t) showFactionCards(t); }; });
  $('#tMap').value = $('#mapSel').value; $('#tMap').onchange = () => { SBC.on = $('#tMap').value === 'custom'; if (SBC.on) { $('#mapSel').value = ''; try { localStorage.setItem('kt_map', 'custom'); } catch (e) {} startSandbox(); return; } $('#mapSel').value = $('#tMap').value; try { localStorage.setItem('kt_map', $('#tMap').value); } catch (e) {} startSandbox(); };
  $('#tReset').onclick = () => startSandbox();
  const tExit = () => { $('#table').classList.remove('optsopen'); TB.stop(); placeGL(null, false); $('#table').classList.remove('active'); $('#menu').classList.add('active'); showHome(); };
  $('#tAct').onclick = () => { $('#table').classList.remove('optsopen'); $('#table').classList.toggle('actsopen'); };
  $('#tMenu').onclick = () => { if (MOB()) { $('#table').classList.remove('actsopen'); $('#table').classList.toggle('optsopen'); } else tExit(); };
  { const b = $('#tExit'); let armed = 0; b.onclick = () => { if (armed) { armed = 0; b.textContent = 'Salir al menú'; b.classList.remove('danger'); tExit(); } else { armed = 1; b.textContent = 'Toca otra vez para salir'; b.classList.add('danger'); setTimeout(() => { armed = 0; b.textContent = 'Salir al menú'; b.classList.remove('danger'); }, 3000); } }; }
  if ($('#btnSandbox')) $('#btnSandbox').onclick = startSandbox;
  const campGo = () => { $('#menu').classList.remove('active'); $('#camp').classList.add('active'); };
  const CAMP = mountCampaign($('#camp'), { exit: () => { $('#camp').classList.remove('active'); $('#menu').classList.add('active'); showHome(); },
    battle: (C, cb) => { const t0 = M.teams[0]; if (!t0 || !t0.id) { toast('Elige primero tu kill team en el menú'); return; } const tomb = C.H.find(h => h.id === C.hex).type === 'T'; const sel = +($('#jmSel') || {}).value; const mission = tomb ? (sel >= 11 ? sel : 11 + Math.floor(Math.random() * 6)) : (sel >= 1 && sel <= 3 ? sel : 1 + Math.floor(Math.random() * 3)); const setup = { seed: (Math.random() * 1e9) | 0, teams: [{ id: t0.id, ops: t0.ops.slice(), swap: (t0.swap || []).slice(), eq: (t0.eq || []).slice() }, { id: 'anj', ops: [], eq: [] }], joint: { mission }, cond: null }; setup.cond = Camp_cond(C); try { localStorage.setItem('kt_camp_pend', '1'); } catch (e) { } $('#camp').classList.remove('active'); beginGame(setup, [], { mode: 'ai', me: 0, level: M.level }); G.camp = true; } });
  const Camp_cond = C => { const h = C.H.find(x => x.id === C.hex); return h.loc === 'BASE' ? 'TC11' : (h.type === 'S' ? 'SC' : 'TC') + (h.cond >= 11 && h.cond <= 16 ? 11 : h.cond); };
  if ($('#btnCamp')) $('#btnCamp').onclick = campGo;
  try { const pr = localStorage.getItem('kt_camp_res'); if (pr) { localStorage.removeItem('kt_camp_res'); localStorage.removeItem('kt_camp_pend'); CAMP.resume(JSON.parse(pr)); campGo(); } } catch (e) { }
})();

/* ============================ PWA ============================ */
let deferred; addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#btnInstall').hidden = false; });
$('#btnInstall').onclick = async () => { if (deferred) { deferred.prompt(); deferred = null; $('#btnInstall').hidden = true; } };
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });

/* ============================ ARRANQUE ============================ */
(async function init() {
  try { G.view3d = true; $('#btnView').hidden = true; $('#mapctl').hidden = false; $('#mapctl').classList.add('v3'); $('#mzIn').hidden = $('#mzOut').hidden = true; $('#mzRot').hidden = false; } catch (e) { }
  const r = await fetch('data.json'); DB = (await r.json()).filter(t => t.ops.length >= 4 || t.anj);
  await ESM.loadES();
  const nameFix = { 'Aeldari': 'Corsair Voidscarred', 'Hand Of The Archons': 'Hand of the Archon' }; DB.forEach(t => { t.name = nameFix[t.name] || t.name; });
  try { E.setFpPol(await (await fetch('ai_fploy.json')).json()); } catch (e) { }
  if (!loadW()) { try { const w = await (await fetch('weights.json')).json(); AIW = { w: w.w, games: 0, pre: w.games || 0 }; while (AIW.w.length < AI.DEFAULT_W.length) AIW.w.push(AI.DEFAULT_W[AIW.w.length]); } catch (e) { } }
  else { try { const w = await (await fetch('weights.json')).json(); AIW.pre = w.games || 0; } catch (e) { } }
  initMenu(); window.__tb = TB; window.__kt = { showReact, showDice, showFightDice, askDice, defaultRoster, G, E, AI, dispatch, beginGame, DB, AIW, M, view: () => ({ SC, OX, OY }), V3, setView, refreshAll };
})();
setInterval(() => { try { if (window.__pkErr && window.__pkErr.length && !window.__pkShown) { window.__pkShown = 1; toast('Imágenes: ' + window.__pkErr.slice(0, 2).join(' | ').slice(0, 160), 9000); } } catch (e) { } }, 4000);
globalThis.__KT = { G, showExplore, dispatch, V3 }; // depuración

try { const fill = (id, L) => { const el = document.getElementById(id); if (el) for (const w of L) el.insertAdjacentHTML('beforeend', '<option value="' + w.n + '">' + w.n + '</option>'); }; fill('njWr', NRANGED); fill('njWm', NMELEE); } catch (e) { }

/* ======================= Cartas de ardid y equipo · modo de ventanas · repetición de la jugada rival ======================= */
G.pop = (() => { try { return localStorage.getItem('kt_pop') === 'ploy' ? 'ploy' : 'full'; } catch (e) { return 'full'; } })(); // 'full' = ventanas de siempre; 'ploy' = solo las de ardides (carta antes de ejecutarse + batalla con dados)
G.rivalFrom = 0; G.replaying = false; G.dq = [];
const ployMode = () => G.pop === 'ploy';
const KIND_TXT = { strat: 'ARDID ESTRATÉGICO', fire: 'ARDID DE COMBATE', ueq: 'EQUIPO UNIVERSAL', feq: 'EQUIPO DE BANDA' };
function cardsOf(p) { // ardides y equipo (universal y de banda) elegido de la banda p
  const s = G.s, tid = s.team[p], out = { strat: [], fire: [], ueq: [], feq: [] };
  for (const x of (E.PLOYS[tid] || [])) out.strat.push({ k: 'strat', id: x.id, n: x.n, t: x.t });
  for (const id of (E.FPLOY_TEAM[tid] || [])) out.fire.push(fireCard(id));
  const L = (s.eq && s.eq[p] && s.eq[p].list) || [];
  for (const k of L) { if (k.startsWith('f_')) { const f = (E.FEQ[tid] || []).find(x => x.id === k.slice(2)); if (f) out.feq.push({ k: 'feq', id: f.id, n: f.n, t: f.t }); } else out.ueq.push({ k: 'ueq', id: k, n: E.EQUIP[k] || k, t: E.EQUIP_TXT[k] || '' }); }
  return out;
}
function fireCard(id) { const raw = E.FPLOY_TXT[id] || id, i = raw.indexOf(':'); return { k: 'fire', id, n: i > 0 ? raw.slice(0, i) : id, t: i > 0 ? raw.slice(i + 1).trim() : '' }; }
function stratCard(p, id, n) { const x = (E.PLOYS[G.s.team[p]] || []).find(y => y.id === id); return { k: 'strat', id, n: x ? x.n : (n || id), t: x ? x.t : '' }; }
function ployCardHTML(c, p, extra) {
  return `<div class="kcard k-${c.k}" style="--pc:${COL[p % 4]}"><div class="kc-h"><span>${H(teamById(G.s.team[p]) ? teamById(G.s.team[p]).name : '')}</span><b>${KIND_TXT[c.k]}</b></div><div class="kc-b"><h3>${H(c.n)}</h3><p>${H(c.t || 'Sin texto adicional: ver la carta de banda.')}</p></div>${extra || ''}</div>`;
}
function dboxEl() { let b = $('#deckPop'); if (!b) { b = document.createElement('div'); b.id = 'deckPop'; b.className = 'modal deckpop'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-modal', 'true'); b.hidden = true; document.body.appendChild(b); } return b; }
function closeDeck() { const b = dboxEl(); b.hidden = true; b.innerHTML = ''; document.removeEventListener('keydown', closeDeck.kd); if (closeDeck.after) { const f = closeDeck.after; closeDeck.after = null; f(); } }

/* Tira horizontal de cartas: desliza con inercia (scroll-snap), varias a la vez, contador X/Y y flechas */
function stripWire(root, n, ctrSel) {
  const st = root.querySelector('.cstrip'); if (!st) return; const ctr = ctrSel ? root.querySelector(ctrSel) : null; let raf = 0;
  const idx = () => { const r = st.getBoundingClientRect(), mid = r.left + r.width / 2; let b = 0, bd = 1e9; st.querySelectorAll('.cs-i').forEach((el, i) => { const q = el.getBoundingClientRect(), d = Math.abs(q.left + q.width / 2 - mid); if (d < bd) { bd = d; b = i; } }); return b; };
  const upd = () => { raf = 0; if (ctr) ctr.textContent = (idx() + 1) + '/' + n; };
  st.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  const step = d => { const it = st.querySelector('.cs-i'); const w = it ? it.getBoundingClientRect().width + 12 : 280; st.scrollBy({ left: d * w, behavior: 'smooth' }); };
  const L = root.querySelector('.csL'), R = root.querySelector('.csR'); if (L) L.onclick = () => step(-1); if (R) R.onclick = () => step(1);
  upd(); return { step, idx };
}
const stripShell = (items, extraCls) => `<div class="csw"><button class="dkarrow csL" aria-label="Anterior">‹</button><div class="cstrip ${extraCls || ''}">${items.map((h, i) => `<div class="cs-i" data-i="${i}">${h}</div>`).join('')}</div><button class="dkarrow csR" aria-label="Siguiente">›</button></div>`;
/* Carta original (imagen del libro) */
function imgCardHTML(c, p, extra) { return `<div class="kcimg" style="--pc:${COL[p % 4]}">${cimg(c.img, 'kcimgi', c.n || 'Carta')}${extra || ''}</div>`; }
const UE_IMG = { ammo: 'ue_ammo', razor: 'ue_razor', comms: 'ue_comms', mines: 'ue_mines', breachc: 'ue_breach', barr_light: 'ue_barr', barr_heavy: 'ue_barr', ladders: 'ue_ladders', barr_port: 'ue_port1', gren_ff: 'ue_expl', gren_fk: 'ue_expl', gren_kk: 'ue_expl', util_stun2: 'ue_util1', util_smoke2: 'ue_util1', util_smokestun: 'ue_util1' };
/* Imagen original de una opción de equipo elegida (universal o de banda) */
function eqImgOf(t, k) {
  if (k.startsWith('f_')) { const fid = k.slice(2), FC = FEQ_CARDS[t.id]; if (FC) return FC[fid] || null; const FMAP = FEQ_ORDER[t.id] || (FEQ_IDENT.includes(t.id) ? (E.FEQ[t.id] || []).map(f => f.id) : null), i = FMAP ? FMAP.indexOf(fid) : -1; return i >= 0 && (t.cards || {}).equipment ? t.cards.equipment[i] || null : null; }
  return UE_IMG[k] ? 'img/' + UE_IMG[k] + '.webp' : null;
}
/* Carrusel de cartas: carta grande delante del tablero; izquierda/derecha (botones, teclas o deslizar) para ver todas. o = { p, title, sections:[{n, cards}], act(card) → html de botones, onAct(card, key) } */
function openDeck(o) {
  const b = dboxEl(); const secs = o.sections.filter(x => x.cards.length); let si = 0;
  if (!secs.length) { toast('No hay cartas que mostrar'); return; }
  const draw = () => {
    const S = secs[si];
    b.innerHTML = `<div class="modal-box deckbox"><button class="icon x" id="dkX" aria-label="Cerrar">✕</button><h2>${H(o.title)}</h2>
      <div class="deckchips">${secs.map((x, i) => `<button class="chip ${i === si ? 'on' : ''}" data-s="${i}">${H(x.n)} (${x.cards.length})</button>`).join('')}</div>
      <div class="tacctr" id="dkCtr">1/${S.cards.length}</div>
      ${stripShell(S.cards.map(c => (c.img ? imgCardHTML(c, o.p, o.extra ? o.extra(c) : '') : ployCardHTML(c, o.p, o.extra ? o.extra(c) : '')) + (o.act ? `<div class="acts deckacts1">${o.act(c, S)}</div>` : '')))}
      <div class="acts deckacts"><button class="btn ghost" id="dkClose">${o.closeLbl || 'Cerrar'}</button></div></div>`;
    $('#dkX').onclick = $('#dkClose').onclick = closeDeck;
    b.querySelectorAll('[data-s]').forEach(x => x.onclick = () => { si = +x.dataset.s; draw(); });
    b.querySelectorAll('[data-dk]').forEach(x => x.onclick = () => { const c = S.cards[+x.closest('.cs-i').dataset.i]; if (o.onAct) o.onAct(c, x.dataset.dk); });
    draw.w = stripWire(b, S.cards.length, '#dkCtr');
  };
  closeDeck.kd = e => { if (b.hidden) return; if (e.key === 'ArrowLeft') draw.w && draw.w.step(-1); else if (e.key === 'ArrowRight') draw.w && draw.w.step(1); else if (e.key === 'Escape') closeDeck(); };
  document.addEventListener('keydown', closeDeck.kd); closeDeck.after = o.after || null;
  b.hidden = false; draw();
}
/* Botones superiores: ardides y equipo de mi banda / de la rival */
function showTeamCards(who) {
  if (!G.s) return; const v = viewer(), np = G.s.np || 2; const p = who === 'me' ? v : (v + 1) % np;
  const C = cardsOf(p);
  openDeck({ p, title: (who === 'me' ? 'Mi banda' : 'Banda rival') + ' · ' + (teamById(G.s.team[p]) ? teamById(G.s.team[p]).name : ''), sections: [{ n: 'Ardides estratégicos', cards: C.strat }, { n: 'Ardides de combate', cards: C.fire }, { n: 'Equipo universal', cards: C.ueq }, { n: 'Equipo de banda', cards: C.feq }],
    extra: c => c.k === 'strat' && G.s.gam[p].includes(c.id) ? '<div class="kc-used">Usado en esta batalla/punto de inflexión</div>' : c.k === 'fire' && (G.s.fpu[p] || []).includes(c.id) ? '<div class="kc-used">Usado</div>' : '' });
}
/* Selección de ardides de estrategia en cada fase de estrategia: carta delante del tablero, girar izquierda/derecha */
function stratDeck() {
  const s = G.s; if (!s || !s.pend || s.pend.stage !== 'gam') return; const p = s.pend.p;
  const L = E.availPloys(s, p).map(x => ({ k: 'strat', id: x.id, n: x.n, t: x.t }));
  if (!L.length) { dispatch({ t: 'gam', id: null }); return; }
  openDeck({ p, title: `Fase de estrategia · elige un ardid (${s.cp[p]} PC)`, sections: [{ n: 'Ardides disponibles', cards: L }], closeLbl: 'Cerrar (usar el panel)',
    act: c => { const cost = E.ployCost(s, p, c.id); return `<button class="btn" data-dk="use" ${s.cp[p] < cost ? 'disabled' : ''}>Usar «${H(c.n)}» (${cost} PC)</button><button class="btn ghost" data-dk="pass">Pasar</button>`; },
    onAct: (c, k) => { closeDeck.after = null; closeDeck(); dispatch({ t: 'gam', id: k === 'use' ? c.id : null }); } });
}
function maybeStratDeck() { const s = G.s; if (!s || G.replaying || !s.pend || s.pend.stage !== 'gam' || !isLocal(s.pend.p)) return; const key = 'g' + s.tp + ':' + s.pend.p + ':' + s.gam[s.pend.p].length; if (G.deckKey === key) return; G.deckKey = key; setTimeout(stratDeck, 60); }
/* Cola de ventanas de ardid (modo «solo ardides»): carta del ardid antes de ejecutarse y batalla con los dados girando */
function dqPush(it) { if (G.replaying) { G.dq.push(it); } else G.dq.push(it); if (!G.dqOpen) dqNext(); }
function dqNext() {
  const it = G.dq.shift(); const box = $('#ployPop') || (() => { const b = document.createElement('div'); b.id = 'ployPop'; b.className = 'modal autonote ployboom'; b.hidden = true; document.body.appendChild(b); return b; })();
  if (!it) { G.dqOpen = false; box.hidden = true; box.innerHTML = ''; if (!G.replaying) tick(); return; }
  G.dqOpen = true; G.postOpen = true; let auto = null;
  if (it.vid && !G.replaying) { /* jugada de la IA: se ve como un vídeo (sin OK), a la velocidad elegida */
    const ms = (it.ms || 2600) / (G.aiSpd || 1); box.className = 'ployvid'; box.hidden = false;
    box.innerHTML = `<div class="pv-box">${it.html}<div class="pv-bar"><i style="animation-duration:${ms}ms"></i></div><button class="pv-spd" id="pvSpd" aria-label="Velocidad">×${G.aiSpd}</button></div>`;
    rollFx(box, Math.min(1100, ms * .5), 26); $('#pvSpd').onclick = ev => { ev.stopPropagation(); aiSpdCycle(); }; auto = setTimeout(() => { box.hidden = true; box.className = 'modal autonote ployboom'; G.postOpen = !!G.dq.length || !!($('#autoNote') && !$('#autoNote').hidden); dqNext(); }, ms); return;
  }
  box.className = 'modal autonote ployboom';
  const done = () => { clearTimeout(auto); G.postOpen = !!G.dq.length || !!($('#autoNote') && !$('#autoNote').hidden); box.hidden = true; dqNext(); };
  box.innerHTML = `<div class="modal-box ploybox">${it.html}<div class="acts"><button class="btn" id="dqOk">${it.ok || 'OK'}</button></div></div>`; box.hidden = false;
  rollFx(box, 1100, 26); $('#dqOk').onclick = done; if (G.replaying) auto = setTimeout(done, it.ms || (it.k === 'battle' ? 3600 : 2600) * (G.rpSlow ? 2 : 1));
}
function bigDie(r, c, rr) { return `<span class="die big ${c} ${rr ? 'rr' : ''}">${r}</span>`; }
function battlePopHTML(ev) {
  const nm = i => H(G.names[i] || '?');
  if (ev.k === 'shoot') { const s = G.s, dm = ev.res.reduce((x, r) => x + r.dmg, 0), t0 = s.ops[ev.tg], def = ev.res[0].def.map(r => ({ r, c: r === 6 ? 'c' : r >= t0.save ? 'n' : 'm' }));
    return `<h2 style="color:${COL[ev.p % 4]}">${nm(ev.op)} ▸ ${nm(ev.tg)}</h2><p class="hint">${H(ev.w)}</p><div class="bdice"><small>Dados de ataque</small><div>${ev.atk.map(d => bigDie(d.r, d.c, d.rr)).join('')}</div></div><div class="bdice"><small>Dados de defensa${ev.res[0].cover ? ' (cobertura)' : ''}</small><div>${def.map(d => bigDie(d.r, d.c)).join('') || '—'}</div></div><h3>${dm ? '−' + dm + ' heridas' : 'Sin daño'}</h3>`; }
  return `<h2 style="color:${COL[ev.p % 4]}">⚔ ${nm(ev.op)} vs ${nm(ev.tg)}</h2><p class="hint">${H(ev.w)} / ${H(ev.tw || '—')}</p><div class="bdice"><small>Dados de ataque</small><div>${ev.atk.map(d => bigDie(d.r, d.c, d.rr)).join('')}</div></div><div class="bdice"><small>Dados de defensa</small><div>${ev.def.map(d => bigDie(d.r, d.c, d.rr)).join('') || '—'}</div></div><div class="bdice">${ev.steps.map(x => `<span class="pill">${x.kind === 'strike' ? '⚔ ' + (x.dmg ? '−' + x.dmg : '0') : '🛡 parada'}</span>`).join(' ')}</div>`;
}
/* llamado desde logEv(popup): en modo «solo ardides» devuelve true si ha tomado el control de la ventana del evento */
function ployEvPop(ev, idx) {
  if (!ployMode()) return false; const s = G.s;
  if ((ev.k === 'gam' || ev.k === 'fploy')) { if (!G.replaying && isLocal(ev.p) && ev.k === 'gam') return true; /* la propia ya se vio en el carrusel */
    const c = ev.k === 'gam' ? stratCard(ev.p, ev.id, ev.n) : fireCard(ev.id); dqPush({ k: 'card', vid: G.mode === 'ai' && !isLocal(ev.p), html: `<h2>${isLocal(ev.p) && !G.replaying ? 'Usas' : 'Jugador ' + (ev.p + 1) + ' usa'} el ardid</h2>` + ployCardHTML(c, ev.p), ok: 'Continuar' }); return true; }
  if ((ev.k === 'shoot' || ev.k === 'fight') && G.ployBatch) { dqPush({ k: 'battle', vid: G.mode === 'ai' && !!G.aiActing, ms: 3400, html: battlePopHTML(ev), ok: 'Continuar' }); return true; }
  return false;
}
/* Repetición de la jugada del rival a velocidad normal o a la mitad */
function buildStateAt(n) { const s = E.newGame(G.setup, DB); s.rec = true; s.ask = Array.from({ length: s.np || 2 }, (_, q) => G.mode === 'ai' ? q === +G.me : true); s.noNotes = G.mode === 'net'; for (let i = 0; i < n; i++) E.apply(s, G.acts[i]); return s; }
function replayRival(slow) {
  if (!G.s || G.replaying) return; const [from, to] = rivalSeg(), acts = G.acts.slice(from, to); if (!acts.length) { toast('El rival aún no ha hecho ninguna jugada'); return; }
  closeModal(); clearTimeout(tick.t); const keep = { s: G.s, log: G.log, lastBy: G.lastBy, evIdx: G.evIdx, ui: G.ui, postN: G.postN };
  let R; try { R = buildStateAt(from); } catch (e) { console.error(e); toast('No se pudo reproducir la jugada'); return; }
  G.replaying = true; G.busy = true; G.rpSlow = !!slow; G.s = R; G.log = []; G.lastBy = [[], []]; G.evIdx = R.ev.length; G.ui = { sel: null, mode: null, R: null, cells: null, pending: null, hover: null, targets: null };
  const bar = document.createElement('div'); bar.id = 'rpBar'; bar.className = 'rpbar'; bar.innerHTML = `<b>↻ Repetición de la jugada rival · ${slow ? '½ velocidad' : 'velocidad normal'}</b><button class="btn small" id="rpStop">Detener</button>`; document.body.appendChild(bar);
  let i = 0, stopped = false; const delay = (slow ? 2 : 1) * 1300;
  const end = () => { if (stopped) return; stopped = true; clearTimeout(end.t); G.dq = []; G.dqOpen = false; const pp = $('#ployPop'); if (pp) pp.hidden = true; bar.remove(); G.replaying = false; G.s = keep.s; G.log = keep.log; G.lastBy = keep.lastBy; G.evIdx = keep.evIdx; G.ui = keep.ui; G.postN = keep.postN; G.postOpen = false; closeModal(); refreshAll(); tick(); toast('Fin de la repetición'); };
  $('#rpStop').onclick = end;
  const step = () => { if (stopped) return; if (i >= acts.length) { end.t = setTimeout(end, delay); return; } const a = acts[i++]; try { E.apply(G.s, a); processEvents(); } catch (e) { console.error(e); end(); return; } refreshAll(); end.t = setTimeout(step, delay); };
  refreshAll(); end.t = setTimeout(step, 500);
}
function openReplay() { if (!G.s || G.replaying) return; $('#modalBox').innerHTML = `<button class="icon x" id="mx">✕</button><h2>Ver otra vez la jugada del rival</h2><p class="hint">Se reproduce, paso a paso, lo que ha hecho el rival desde tu última acción (${rivalSeg()[1] - rivalSeg()[0]} acciones).</p><div class="acts"><button class="btn" id="rpN">Velocidad normal</button><button class="btn" id="rpH">½ velocidad</button></div>`; $('#modal').hidden = false; $('#mx').onclick = closeModal; $('#rpN').onclick = () => replayRival(false); $('#rpH').onclick = () => replayRival(true); }
{ const b3 = $('#btnReplay'); if (b3) b3.onclick = openReplay; }
{ const bs = $('#aiSpdBtn'); if (bs) { bs.textContent = '×' + G.aiSpd; bs.onclick = ev => { ev.stopPropagation(); aiSpdCycle(); }; } }
/* Chips de banda (arriba a la izquierda): desplegable con lo activo esta ronda + Equipo + Ardides de esa banda */
function scoreDD(q, chip) {
  let d = $('#scoreDD'); const was = d && !d.hidden && d.dataset.q === String(q); if (d) d.remove(); if (was || !G.s) return;
  const s = G.s, C = cardsOf(q), act = [];
  for (const id of (s.gam[q] || [])) act.push(['Ardid', stratCard(q, id).n]);
  for (const id of (s.fpu[q] || [])) act.push(['Combate', fireCard(id).n]);
  const e = (s.eq && s.eq[q]) || {}; if ((e.smokes || []).length) act.push(['Equipo', 'Humo ×' + e.smokes.length]); if ((e.mines || []).length) act.push(['Equipo', 'Minas ×' + e.mines.length]); if (e.ammo) act.push(['Equipo', 'Cache de munición']);
  d = document.createElement('div'); d.id = 'scoreDD'; d.dataset.q = q; d.className = 'scoredd';
  d.innerHTML = `<h4>${H((teamById(s.team[q]) || {}).name || 'Banda')} · ${s.cp[q]} PC</h4><div class="sd-act"><b>Activo esta ronda</b>${act.length ? act.map(a => `<div class="sd-it"><i>${H(a[0])}</i>${H(a[1])}</div>`).join('') : '<div class="sd-none">Nada activo todavía</div>'}</div>
    <button class="btn ghost small" data-w="eq">Equipo (${C.ueq.length + C.feq.length})</button><button class="btn ghost small" data-w="pl">Ardides (${C.strat.length + C.fire.length})</button>`;
  document.body.appendChild(d); const r = chip.getBoundingClientRect(); d.style.top = (r.bottom + 6) + 'px'; d.style.left = Math.max(8, Math.min(innerWidth - d.offsetWidth - 8, r.left)) + 'px';
  const open = w => { d.remove(); const t = teamById(s.team[q]) || {}, cd = t.cards || {}, im = u => ({ k: 'img', img: u, n: '' });
    const eqs = ((s.eq && s.eq[q] && s.eq[q].list) || []).map(k => eqImgOf(t, k)).filter((u, i, a) => u && a.indexOf(u) === i).map(im);
    openDeck({ p: q, title: (w === 'eq' ? 'Equipo' : 'Ardides') + ' · ' + (t.name || ''), sections: w === 'eq' ? [{ n: 'Equipo elegido', cards: eqs }, { n: 'Regla de banda', cards: (cd.rule || []).map(im) }] : [{ n: 'Ardides estratégicos', cards: (cd.strategy || []).map(im) }, { n: 'Ardides de combate', cards: (cd.firefight || []).map(im) }] }); };
  d.querySelectorAll('[data-w]').forEach(b => b.onclick = () => open(b.dataset.w));
}
document.querySelectorAll('#game .topbar .score').forEach(ch => { ch.style.cursor = 'pointer'; ch.setAttribute('role', 'button'); ch.setAttribute('aria-haspopup', 'true'); ch.onclick = ev => { ev.stopPropagation(); scoreDD(ch.classList.contains('p1') ? 1 : 0, ch); }; });
document.addEventListener('pointerdown', ev => { const d = $('#scoreDD'); if (d && !d.contains(ev.target) && !ev.target.closest('.score')) d.remove(); });

function segMark(p, idx) { const L = G.segs || (G.segs = []); if (!L.length || L[L.length - 1].p !== p) L.push({ p, from: idx }); }
function rivalSeg() { const L = G.segs || [], v = viewer(); for (let i = L.length - 1; i >= 0; i--) if (L[i].p !== v) return [L[i].from, i + 1 < L.length ? L[i + 1].from : G.acts.length]; return [0, 0]; }
document.addEventListener('click', e => { if (e.target && e.target.id === 'gamDeck') stratDeck(); });

/* ===== Regla de medir: puntos sucesivos, marcas cada pulgada, longitud de cada tramo y total ===== */
G.ruler = null;
const RL = { pts: [], hov: null, R: null, hovSeg: null };
function rulerOk(b) { return b && b.x > -50 && b.x < E.BW + 6 && b.y > -6 && b.y < E.BH + 6; }
function rulerLen() { return RL.pts.reduce((a, q) => a + (q.len || 0), 0); }
const fmtIn = d => (Math.round(d * 10) / 10).toFixed(1).replace(/\.0$/, '') + '"';
function rulerBase() { const s = G.s; let o = s.ops[G.ui.tapSel != null ? G.ui.tapSel : G.ui.sel]; if (!o || !o.alive) o = s.ops.find(e => e.alive && !e.ug && e.p === viewer()) || s.ops.find(e => e.alive && !e.ug); return o; }
/* La regla mide con las reglas del movimiento: cada tramo es el camino legal más corto (muros, terreno, trepar…) calculado por el motor desde el punto anterior */
function rulerReach(pt) { const s = G.s, o = rulerBase(); if (!o) return null; const c = Object.assign({}, o, { x: pt.x, y: pt.y, z: pt.z || 0 }); try { return E.reach(s, c, 99, 'rep'); } catch (er) { return null; } }
function rulerBar() {
  let el = $('#rulerBar'); const mb = $('#mzRuler'); if (mb) { mb.classList.toggle('on', !!G.ruler); mb.setAttribute('aria-pressed', G.ruler ? 'true' : 'false'); }
  if (!G.ruler) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'rulerBar'; el.className = 'rulerbar'; el.innerHTML = '<span id="rlTxt"></span><button id="rlUndo" class="btn ghost small">↶ Quitar punto</button><button id="rlClr" class="btn ghost small">Nueva medida</button><button id="rlOff" class="btn small">Cerrar regla</button>'; $('#boardwrap').appendChild(el);
    $('#rlUndo').onclick = () => { RL.pts.pop(); RL.R = RL.pts.length ? rulerReach(RL.pts[RL.pts.length - 1]) : null; rulerBar(); }; $('#rlClr').onclick = () => { RL.pts = []; RL.R = null; rulerBar(); }; $('#rlOff').onclick = () => setRuler(false); }
  const n = RL.pts.length, segs = RL.pts.slice(1).map(q => q.len || 0);
  $('#rlTxt').textContent = n === 0 ? 'Regla de 1" · toca el origen (se mide por el camino legal de movimiento)' : n === 1 ? 'Toca el siguiente punto' : 'Total ' + fmtIn(rulerLen()) + (segs.length > 1 ? ' · tramos: ' + segs.map(fmtIn).join(' + ') : '') + ' · sigue tocando para añadir tramos';
}
function setRuler(on) { G.ruler = on ? RL : null; if (!on) { RL.pts = []; RL.hov = null; RL.R = null; } rulerBar(); }
function rulerAdd(b) {
  if (!rulerOk(b) || !G.s) return;
  if (!RL.pts.length) { const R = rulerReach(b); if (!R) { toast('No hay ningún agente con el que medir'); return; } const k = E.cellOf(R, b.x, b.y), c = R.cellXY(k); if (R.blocked[k]) { toast('Ahí no se puede colocar: terreno bloqueado'); return; } RL.pts.push({ x: c.x, y: c.y, z: c.z || 0, len: 0, path: [c] }); RL.R = rulerReach(c); rulerBar(); return; }
  const R = RL.R; if (!R) return; const k = E.cellOf(R, b.x, b.y);
  if (R.blocked[k] || !isFinite(R.dist[k])) { toast('Ahí no se puede llegar con las reglas de movimiento (muro, terreno o distancia vertical)'); return; }
  const c = R.cellXY(k); RL.pts.push({ x: c.x, y: c.y, z: c.z || 0, len: R.dist[k], path: R.path(k) }); RL.R = rulerReach(c); rulerBar();
}
function rulerSegTicks(ctx, path, pr, col) { // dibuja el camino y una marca por cada pulgada recorrida
  if (!path || path.length < 2) return 0; ctx.lineJoin = 'round'; const P = path.map(q => pr(q.x, q.y, q.z || 0)).filter(Boolean); if (P.length < 2) return 0;
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 6; ctx.beginPath(); P.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); P.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
  let acc = 0, next = 1, k = 0; for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], L = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)); if (L < 1e-6) continue; const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    while (acc + L >= next - 1e-9) { const t = next - acc, x = a.x + ux * t, y = a.y + uy * t, z = (a.z || 0) + ((b.z || 0) - (a.z || 0)) * (t / L), h = next % 5 === 0 ? 0.32 : 0.18, q1 = pr(x + uy * h, y - ux * h, z), q2 = pr(x - uy * h, y + ux * h, z); if (q1 && q2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = next % 5 === 0 ? 2.5 : 1.5; ctx.beginPath(); ctx.moveTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.stroke(); if (next % 5 === 0) { const tl = pr(x + uy * 0.75, y - ux * 0.75, z); if (tl) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#fff'; ctx.strokeText(next, tl[0], tl[1]); ctx.fillText(next, tl[0], tl[1]); } } } next++; k++; }
    acc += L; }
  return k;
}
function rulerDraw(ctx) {
  if (!G.ruler || !RL.pts.length) return; const pr = (x, y, z) => V3.project(x, y, (z || 0) + 0.05); ctx.save(); ctx.lineCap = 'round'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const segs = RL.pts.slice(1).map((q, i) => ({ path: q.path, len: q.len, col: i % 2 ? '#5ec8ff' : '#ffd24a' })); if (RL.hovSeg) segs.push({ path: RL.hovSeg.path, len: RL.hovSeg.len, col: 'rgba(255,255,255,.75)' }); let cum = 0;
  segs.forEach((sg, i) => { rulerSegTicks(ctx, sg.path, pr, sg.col); cum += sg.len; const mid = sg.path[Math.floor(sg.path.length / 2)], m = mid && pr(mid.x, mid.y - 0.9, mid.z || 0), txt = fmtIn(sg.len) + (segs.length > 1 ? '  (Σ ' + fmtIn(cum) + ')' : '');
    if (m) { const w = ctx.measureText(txt).width + 12; ctx.fillStyle = 'rgba(11,14,19,.85)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(m[0] - w / 2, m[1] - 10, w, 20, 10); else ctx.rect(m[0] - w / 2, m[1] - 10, w, 20); ctx.fill(); ctx.fillStyle = '#ffd24a'; ctx.fillText(txt, m[0], m[1] + 1); } });
  RL.pts.forEach((q, i) => { const s = pr(q.x, q.y, q.z); if (!s) return; ctx.fillStyle = i === 0 ? '#38d27a' : '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, 7); ctx.fill(); ctx.stroke(); });
  ctx.restore();
}
$('#mzRuler').onclick = () => { setRuler(!G.ruler); };
cv.addEventListener('pointermove', e => { if (!G.ruler || e.pointerType === 'touch' || !G.s || !RL.R || !RL.pts.length) return; const b = boardAt(e); if (!rulerOk(b)) { RL.hovSeg = null; return; } const k = E.cellOf(RL.R, b.x, b.y); if (RL.R.blocked[k] || !isFinite(RL.R.dist[k])) { RL.hovSeg = null; return; } RL.hovSeg = { path: RL.R.path(k), len: RL.R.dist[k] }; const t = $('#rlTxt'); if (t) t.textContent = 'Total ' + fmtIn(rulerLen() + RL.hovSeg.len) + ' · tramo en curso ' + fmtIn(RL.hovSeg.len); });
cv.addEventListener('contextmenu', e => { if (G.ruler) { RL.pts.pop(); RL.R = RL.pts.length ? rulerReach(RL.pts[RL.pts.length - 1]) : null; rulerBar(); } });

/* ===== Asistente «Agentes Némesis»: pack → misión → Némesis → comando → resumen ===== */
const NWT = { brawler: 'Batallador', marksman: 'Ojo preciso', battler: 'Peleón', guardian: 'Guardián' };
const NWTR = { armoured: 'Acorazado', closelethal: 'Letal a corto alcance', focused: 'Concentrarse en un blanco', fury: 'Furia', implacable: 'Implacable', crushing: 'Impacto aplastante', shielded: 'Blindado', tenacious: 'Tenaz', tough: 'Recio', violent: 'Muerte violenta' };
const NWAL = { aeldari: 'Aeldari', caos: 'Caos', imperium: 'Imperium', votann: 'Votann', necron: 'Necrón', ork: 'Ork', tau: "T'au", tiranido: 'Tiránido' };
const NWBEHD = { brawler: 'Va a por el cuerpo a cuerpo', marksman: 'Prefiere disparar desde lejos', battler: 'Combina disparo y combate', guardian: 'Protege los objetivos' };
const NWMISN = { 1: ['Ganancias territoriales', 'Territorial Gains', 'Controla más marcadores que el rival.'], 2: ['Golpe de flanco', 'Flanking Strike', 'Se juega al elegir Mantener (2) + Maniobrar (3).'], 3: ['Contraasalto', 'Counterassault', 'Se juega al elegir Maniobrar (3) + Avance (1).'], 4: ['Romper defensas', 'Fracture Defences', 'Se juega al elegir Avance (1) + Mantener (2).'] };
const NWSTR = [[1, 'Avance', 'Presionas hacia delante.'], [2, 'Mantener', 'Defiendes tu posición.'], [3, 'Maniobrar', 'Reservas y flanqueas.']];
const nwMis = (a, b) => { if (!a || !b) return 0; if (a === b) return 1; const k = [a, b].sort().join(''); return { 12: 4, 23: 2, 13: 3 }[k]; };
const nwMk = () => ({ name: '', al: '', size: 'M', beh: '', rw: ['Autocannon'], mw: ['Close combat weapon'], tr: [] });
const NW = { step: 0, pack: null, variant: 'joint', mode: 'ai', level: 'medium', jm: 61, role: 'rnd', st: [0, 0], npo: { size: '', al: '', beh: '', tr: '', nm: '', wr: '', wm: '' }, nem: [nwMk(), nwMk()], sz1: 'M', band: [null, null], bring: [null, null] };
const NWFLOW = { joint: ['Pack', 'Misión', 'Némesis rival', 'Tu comando', 'Resumen'], nops: ['Pack', 'Estrategias', 'Tu Némesis', 'Comandos', 'Resumen'], ambull: ['Pack', 'Tu comando', 'Resumen'], arch: ['Pack', 'Tu comando', 'Resumen'] };
const nwKinds = () => { const f = NWFLOW[NW.pack || 'joint']; return NW.pack === 'joint' ? ['pack', 'mision', 'npo', 'comando', 'resumen'] : NW.pack === 'nops' ? ['pack', 'estr', 'nem', 'comando', 'resumen'] : ['pack', 'comando', 'resumen']; };
const nwPvp = () => NW.pack === 'nops' || ((NW.pack === 'ambull' || NW.pack === 'arch') && NW.variant === 'adv');
const nwTeam = id => PK().find(x => x.id === id);
const nwOpName = (t, id) => { const b = String(id).split('#')[0], o = t.ops.find(o => o.id === b); return o ? (o.name || b) : b; };
const nwAlOf = t => { const kw = ((t && t.cards && t.cards.kw) || []).join(' ').toUpperCase(); const D = DB.find(x => t && x.id === t.id); const K = ((D && (D.kw || D.keywords)) || []).join(' ').toUpperCase() + ' ' + kw; return /AELDARI|ASURYANI|DRUKHARI/.test(K) ? 'aeldari' : /CHAOS|HERETIC|TRAITOR/.test(K) ? 'caos' : /IMPERIUM|ADEPTUS|ASTRA/.test(K) ? 'imperium' : /VOTANN|LEAGUES/.test(K) ? 'votann' : /NECRON/.test(K) ? 'necron' : /ORK/.test(K) ? 'ork' : /T.AU/.test(K) ? 'tau' : /TYRANID|TIRANIDO/.test(K) ? 'tiranido' : ''; };
function nwBuild(n) { const cfg = { name: n.name || 'Némesis', tag: '', allegiance: n.al || 'imperium', size: n.size, weapons: [...n.rw, ...n.mw], traits: n.tr.slice(), behaviour: n.beh || undefined }; return Object.assign({ cfg }, buildNemesis(cfg)); }
function nwConsHTML(i, who) {
  const n = NW.nem[i], z = NSIZE[n.size], b = nwBuild(n), used = b.op ? 0 : 0;
  const W = (L, key) => L.map(w => { const on = n[key].includes(w.n); return `<button class="nw-chip${on ? ' on' : ''}" data-act="wp" data-i="${i}" data-k="${key}" data-v="${H(w.n)}"><b>${H(w.n)}</b><small>${w.atk}A ${w.hit}+ ${w.d}/${w.cd}${w.wr ? ' · ' + H(w.wr) : ''} · cuesta ${w.sel}</small></button>`; }).join('');
  const sels = [...n.rw, ...n.mw].map(x => { const w = [...NRANGED, ...NMELEE].find(q => q.n === x); return w ? w.sel : 0; });
  const seen = new Set(), cost = [...n.rw, ...n.mw].reduce((a, x) => { const w = [...NRANGED, ...NMELEE].find(q => q.n === x); if (!w) return a; const base = w.n.replace(/ \((standard|supercharge|frag|krak)\)$/i, ''); if (seen.has(base)) return a; seen.add(base); return a + w.sel; }, 0);
  const slots = Math.max(0, z.weapons - cost) + 1;
  return `<div class="nw-card"><h3>${who}</h3>
  <div class="nw-sizes">${['S', 'M', 'L'].map(k => `<button class="nw-size${n.size === k ? ' on' : ''}" data-act="sz" data-i="${i}" data-v="${k}"><b>${k === 'S' ? 'Pequeño' : k === 'M' ? 'Mediano' : 'Grande'}</b><small>Control ${NSIZE[k].control} · Heridas ${NSIZE[k].wounds} · ${NSIZE[k].weapons} selecc. de arma</small></button>`).join('')}</div>
  <label class="nw-lab">Nombre<input class="nw-in" data-act="nm" data-i="${i}" maxlength="24" placeholder="Némesis ${i + 1}" value="${H(n.name)}"></label>
  <label class="nw-lab">Alianza (debe coincidir con la de tu comando)<select class="nw-in" data-act="al" data-i="${i}"><option value="">Según mi banda / al azar</option>${NALLEG.map(a => `<option value="${a}"${n.al === a ? ' selected' : ''}>${NWAL[a]}</option>`).join('')}</select></label>
  <label class="nw-lab">Comportamiento (cómo actúa cuando lo controla el juego)<select class="nw-in" data-act="bh" data-i="${i}"><option value="">Ninguno / al azar</option>${NBEH.map(a => `<option value="${a}"${n.beh === a ? ' selected' : ''}>${NWT[a]} · ${NWBEHD[a]}</option>`).join('')}</select></label>
  <div class="nw-lab">Armas a distancia <small>(${cost}/${z.weapons} selecciones usadas)</small></div><div class="nw-chips">${W(NRANGED, 'rw')}</div>
  <div class="nw-lab">Armas de combate</div><div class="nw-chips">${W(NMELEE, 'mw')}</div>
  <div class="nw-lab">Rasgos <small>(hasta ${slots}: 1 + selecciones de arma sin usar)</small></div><div class="nw-chips">${Object.keys(NWTR).map(k => `<button class="nw-chip${n.tr.includes(k) ? ' on' : ''}" data-act="tr" data-i="${i}" data-v="${k}"><b>${NWTR[k]}</b></button>`).join('')}</div>
  ${b.errors && b.errors.length ? `<p class="nw-err">⚠ ${b.errors.map(H).join(' · ')}</p>` : '<p class="nw-ok">✓ Némesis válido según el libro (pp. 14-20)</p>'}</div>`;
}
function nwBring(p) { const ids = (M.teams[p] && M.teams[p].ops) || []; if (!NW.bring[p]) NW.bring[p] = ids.slice(0, nselCount(ids.length, p === 0 ? NW.nem[0].size : (NW.sz1 || 'M'))).map((x, k) => k); return NW.bring[p]; }
function nwRosterHTML(p) {
  const t = nwTeam(NW.band[p]); if (!t) return '<p class="hint">Elige una banda.</p>';
  const ids = (M.teams[p] && M.teams[p].ops) || []; const size = p === 0 ? NW.nem[0].size : (NW.sz1 || 'M'); const nsel = nselCount(ids.length, size); const bring = nwBring(p);
  return `<p class="nw-note">Tu comando suele ser de <b>${ids.length}</b> operativos. Con un Némesis ${size === 'S' ? 'pequeño' : size === 'M' ? 'mediano' : 'grande'} llevas <b>${nsel}</b> (+ el Némesis). Tú eliges cuáles se quedan fuera (puede ser el líder). Marcados: <b>${bring.length}/${nsel}</b></p><div class="nw-chips">${ids.map((id, k) => `<button class="nw-chip${bring.includes(k) ? ' on' : ''}" data-act="br" data-p="${p}" data-k="${k}"><b>${H(nwOpName(t, id))}</b></button>`).join('')}</div>`;
}
function nwBandHTML(p, label) {
  const PL = PK().slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return `<label class="nw-lab">${label}<select class="nw-in" data-act="band" data-p="${p}"><option value="">${p ? 'Aleatoria' : 'Elige tu banda…'}</option>${PL.map(x => `<option value="${x.id}"${NW.band[p] === x.id ? ' selected' : ''}>${bandLbl(x)}</option>`).join('')}</select></label>`;
}
function nwStepHTML() {
  const kind = nwKinds()[NW.step];
  if (kind === 'pack') {
    const P = [['joint', 'Operaciones conjuntas', 'Tú (solo o en cooperativo) contra NPO controlados por el juego, con un Némesis rival opcional. Killzone Volkus · 4 misiones · la IA mueve a los NPO con un mazo 1-13.', 'Jugadores: 1 (o varios en equipo) + juego'], ['nops', 'Operaciones Némesis', '1 contra 1: cada jugador lleva su propio Némesis más un comando reducido. 4 misiones según las estrategias que elijáis (Avance, Mantener, Maniobrar).', 'Jugadores: 2'], ['ambull', 'El Ambull', 'Pack propio de ese Némesis: aparece como tercer bando que ataca a quien esté cerca.', 'Conjunta (1 jugador) o Adversarios (2)'], ['arch', 'El Archivista', 'Pack propio de ese Némesis: el Archivista puede volverse contra los jugadores.', 'Conjunta (1 jugador) o Adversarios (2)']];
    const sub = (NW.pack === 'ambull' || NW.pack === 'arch') ? `<div class="nw-sub"><b>Modalidad</b><div class="nw-row"><button class="nw-opt${NW.variant === 'joint' ? ' on' : ''}" data-act="var" data-v="joint">Conjunta<small>Tú contra los NPO y el Némesis</small></button><button class="nw-opt${NW.variant === 'adv' ? ' on' : ''}" data-act="var" data-v="adv">Adversarios<small>2 jugadores + Némesis como tercer bando</small></button></div></div>` : '';
    const pl = nwPvp() ? `<div class="nw-sub"><b>Cómo juegas</b><div class="nw-row"><button class="nw-opt${NW.mode === 'ai' ? ' on' : ''}" data-act="mode" data-v="ai">Contra la IA</button><button class="nw-opt${NW.mode === 'hot' ? ' on' : ''}" data-act="mode" data-v="hot">2 jugadores · este dispositivo</button></div></div>` : '';
    return `<h2>¿Qué modalidad de Agentes Némesis quieres jugar?</h2><p class="hint">Un «Némesis» es un operativo gigante (máquina de guerra o monstruo) que se suma a la partida. Elige el pack; los siguientes pasos se adaptan.</p><div class="nw-packs">${P.map(x => `<button class="nw-pack${NW.pack === x[0] ? ' on' : ''}" data-act="pack" data-v="${x[0]}"><b>${x[1]}</b><span>${x[2]}</span><em>${x[3]}</em></button>`).join('')}</div>${sub}${pl}`;
  }
  if (kind === 'mision') {
    const opts = [...$('#jmSel').options].filter(o => +o.value >= 61 && +o.value <= 64);
    const rol = NW.jm === 64 ? `<div class="nw-sub"><b>Papel de tus agentes (misión 4)</b><div class="nw-row">${[['off', 'Ofensiva'], ['def', 'Defensa'], ['rnd', 'Al azar']].map(r => `<button class="nw-opt${(NW.role === r[0] || (r[0] === 'rnd' && !['off', 'def'].includes(NW.role))) ? ' on' : ''}" data-act="role" data-v="${r[0]}">${r[1]}</button>`).join('')}</div></div>` : '';
    return `<h2>Elige la misión</h2><p class="hint">Cada misión cambia el objetivo, las reservas de NPO y la duración. Para una partida suelta, elige la que más te guste.</p><div class="nw-list">${opts.map(o => `<button class="nw-opt wide${NW.jm === +o.value ? ' on' : ''}" data-act="jm" data-v="${o.value}"><b>${H(o.text.split(' — ')[0])}</b><small>${H(o.text.split(' — ')[1] || '')}</small></button>`).join('')}</div>${rol}`;
  }
  if (kind === 'npo') {
    const n = NW.npo; const pts = { N: 'sin Némesis', S: 'pequeño', M: 'mediano', L: 'grande' };
    return `<h2>El Némesis rival (NPO)</h2><p class="hint">Los NPO tendrán un Némesis. Su tamaño decide cuántos NPO empiezan en el tablero: cuanto mayor es el Némesis, menos NPO normales. Lo que dejes sin elegir se decide al azar.</p>
    <div class="nw-sizes">${[['', 'Al azar', 'El juego lo decide'], ['N', 'Sin Némesis', 'Solo NPO normales'], ['S', 'Pequeño', ''], ['M', 'Mediano', ''], ['L', 'Grande', '']].map(x => `<button class="nw-size${n.size === x[0] ? ' on' : ''}" data-act="nsz" data-v="${x[0]}"><b>${x[1]}</b><small>${x[2] || ('Control ' + NSIZE[x[0]].control + ' · Heridas ' + NSIZE[x[0]].wounds)}</small></button>`).join('')}</div>
    <details class="nw-adv"><summary>Personalizar el Némesis rival (opcional)</summary>
    <label class="nw-lab">Alianza de los NPO<select class="nw-in" data-act="nal"><option value="">Al azar</option>${NALLEG.map(a => `<option value="${a}"${n.al === a ? ' selected' : ''}>${NWAL[a]}</option>`).join('')}</select></label>
    <label class="nw-lab">Comportamiento<select class="nw-in" data-act="nbh"><option value="">Al azar</option>${NBEH.map(a => `<option value="${a}"${n.beh === a ? ' selected' : ''}>${NWT[a]} · ${NWBEHD[a]}</option>`).join('')}</select></label>
    <label class="nw-lab">Rasgo<select class="nw-in" data-act="ntr"><option value="">Al azar</option>${Object.keys(NWTR).map(a => `<option value="${a}"${n.tr === a ? ' selected' : ''}>${NWTR[a]}</option>`).join('')}</select></label>
    <label class="nw-lab">Nombre<input class="nw-in" data-act="nnm" maxlength="24" value="${H(n.nm)}" placeholder="opcional"></label>
    <label class="nw-lab">Arma a distancia<select class="nw-in" data-act="nwr"><option value="">Al azar</option>${NRANGED.map(w => `<option${n.wr === w.n ? ' selected' : ''}>${H(w.n)}</option>`).join('')}</select></label>
    <label class="nw-lab">Arma de combate<select class="nw-in" data-act="nwm"><option value="">Al azar</option>${NMELEE.map(w => `<option${n.wm === w.n ? ' selected' : ''}>${H(w.n)}</option>`).join('')}</select></label></details>`;
  }
  if (kind === 'estr') {
    const m = nwMis(NW.st[0], NW.st[1]); const R = (i, who) => `<div class="nw-sub"><b>${who}</b><div class="nw-row">${NWSTR.map(s => `<button class="nw-opt${NW.st[i] === s[0] ? ' on' : ''}" data-act="st" data-i="${i}" data-v="${s[0]}">${s[1]}<small>${s[2]}</small></button>`).join('')}<button class="nw-opt${NW.st[i] === 0 ? ' on' : ''}" data-act="st" data-i="${i}" data-v="0">Al azar</button></div></div>`;
    return `<h2>Estrategias: deciden la misión</h2><p class="hint">En el libro cada jugador elige en secreto una estrategia y se revelan a la vez. La combinación fija la misión.</p>${R(0, 'Tu estrategia')}${R(1, nwPvp() && NW.mode === 'hot' ? 'Estrategia del jugador 2' : 'Estrategia del rival (IA)')}<div class="nw-res">${m ? `<b>Misión ${String(m).padStart(2, '0')}: ${NWMISN[m][0]}</b> <small>(${NWMISN[m][1]})</small><br><small>${NWMISN[m][2]}</small>` : '<b>Misión por determinar</b><br><small>Con «Al azar» la estrategia se sortea al empezar. Iguales → 01 · Avance+Mantener → 04 · Mantener+Maniobrar → 02 · Maniobrar+Avance → 03.</small>'}</div>`;
  }
  if (kind === 'nem') {
    return `<h2>Crea tu Némesis</h2><p class="hint">Se construye con las reglas de las páginas 14-20 del dossier: tamaño, armas (cuestan selecciones) y rasgos (las selecciones sin gastar dan rasgos extra).</p>${nwConsHTML(0, 'Tu Némesis')}${NW.mode === 'hot' ? nwConsHTML(1, 'Némesis del jugador 2') : `<div class="nw-card"><h3>Némesis del rival (IA)</h3><div class="nw-sizes">${['S', 'M', 'L'].map(k => `<button class="nw-size${NW.sz1 === k ? ' on' : ''}" data-act="sz1" data-v="${k}"><b>${k === 'S' ? 'Pequeño' : k === 'M' ? 'Mediano' : 'Grande'}</b><small>Control ${NSIZE[k].control} · Heridas ${NSIZE[k].wounds}</small></button>`).join('')}</div><p class="hint">Armas y rasgos del rival: los elige el juego.</p></div>`}`;
  }
  if (kind === 'comando') {
    const nops = NW.pack === 'nops';
    return `<h2>${nwPvp() ? 'Elige los comandos' : 'Elige tu comando'}</h2><p class="hint">${nops ? 'Con Némesis se juega con un comando reducido.' : 'Se usará la lista por defecto de la banda; puedes personalizarla después en «Personalizar comando».'}</p>${nwBandHTML(0, 'Tu banda')}${nops ? nwRosterHTML(0) : ''}${nwPvp() || NW.pack === 'nops' ? nwBandHTML(1, NW.mode === 'hot' ? 'Banda del jugador 2' : 'Banda rival (IA)') : ''}`;
  }
  const sum = nwSummary();
  return `<h2>Todo listo</h2><p class="hint">Revisa tu partida. Puedes volver atrás en cualquier momento.</p><ul class="nw-sumlist">${sum.map(r => `<li><span>${r[0]}</span><b>${r[1]}</b></li>`).join('')}</ul>`;
}
function nwSummary() {
  const R = [], t0 = nwTeam(NW.band[0]); R.push(['Pack', { joint: 'Operaciones conjuntas', nops: 'Operaciones Némesis', ambull: 'El Ambull · ' + (NW.variant === 'adv' ? 'Adversarios' : 'Conjunta'), arch: 'El Archivista · ' + (NW.variant === 'adv' ? 'Adversarios' : 'Conjunta') }[NW.pack] || '—']);
  if (NW.pack === 'joint') { const o = [...$('#jmSel').options].find(o => +o.value === NW.jm); R.push(['Misión', o ? o.text.split(' — ')[0] : '—']); const n = NW.npo; R.push(['Némesis rival', { '': 'al azar', N: 'ninguno', S: 'pequeño', M: 'mediano', L: 'grande' }[n.size] + (n.al ? ' · ' + NWAL[n.al] : '')]); }
  if (NW.pack === 'nops') { const m = nwMis(NW.st[0], NW.st[1]); R.push(['Misión', m ? String(m).padStart(2, '0') + ' ' + NWMISN[m][0] : 'según estrategias (azar)']); R.push(['Tu Némesis', (NW.nem[0].name || 'Némesis') + ' · ' + NW.nem[0].size + ' · ' + NW.nem[0].tr.map(k => NWTR[k]).join(', ')]); const br = NW.bring[0]; if (br) R.push(['Operativos que llevas', br.length + ' + Némesis']); }
  R.push(['Tu banda', t0 ? t0.name : '(elige una)']); if (nwPvp() || NW.pack === 'nops') { const t1 = nwTeam(NW.band[1]); R.push(['Rival', (t1 ? t1.name : 'banda al azar') + (NW.mode === 'hot' ? ' · 2.º jugador' : ' · IA')]); }
  return R;
}
function nwErrors() {
  const k = nwKinds()[NW.step];
  if (k === 'pack' && !NW.pack) return 'Elige un pack para continuar.';
  if (k === 'nem') { const e = nwBuild(NW.nem[0]).errors || []; if (e.length) return 'Tu Némesis no es válido: ' + e[0]; if (NW.mode === 'hot') { const e1 = nwBuild(NW.nem[1]).errors || []; if (e1.length) return 'El Némesis del jugador 2 no es válido: ' + e1[0]; } }
  if (k === 'comando') { if (!NW.band[0]) return 'Elige tu banda.'; if (NW.pack === 'nops') { const t = nwTeam(NW.band[0]), ids = (M.teams[0] && M.teams[0].ops) || [], n = nselCount(ids.length, NW.nem[0].size); if (nwBring(0).length !== n) return 'Marca exactamente ' + n + ' operativos (ahora ' + nwBring(0).length + ').'; } }
  return '';
}
function nwSetBand(p) {
  const t = nwTeam(NW.band[p]) || (p === 1 ? (PK()[Math.floor(Math.random() * PK().length)]) : null); if (!t) return;
  if (p === 1 && !NW.band[1]) NW.rndB = t.id; M.teams[p] = { id: t.id, ops: defaultRoster(t, p === 1 && NW.mode === 'ai'), swap: [], eq: [] }; NW.bring[p] = null;
  if (p === 0 && !NW.nem[0].al) NW.alAuto = nwAlOf(t);
}
function nwRender() {
  const v = $('#nemView'); const kinds = nwKinds(), flow = NWFLOW[NW.pack || 'joint'], last = NW.step === kinds.length - 1, err = nwErrors();
  v.innerHTML = `<div class="nw-top"><button class="btn ghost small" data-act="home">✕ Salir</button><div class="nw-steps">${flow.map((n, i) => `<span class="${i === NW.step ? 'on' : i < NW.step ? 'done' : ''}"><i>${i < NW.step ? '✓' : i + 1}</i><em>${n}</em></span>`).join('')}</div></div><div class="nw-body">${nwStepHTML()}</div><div class="nw-foot">${err ? `<p class="nw-err">${H(err)}</p>` : ''}<div class="nw-nav"><button class="btn ghost" data-act="prev"${NW.step === 0 ? ' disabled' : ''}>‹ Atrás</button>${last ? `<button class="btn ghost" data-act="custom">Personalizar comando…</button><button class="btn big hero" data-act="go"${err ? ' disabled' : ''}>Comenzar partida</button>` : `<button class="btn big hero" data-act="next"${err ? ' disabled' : ''}>Siguiente ›</button>`}</div></div>`;
  v.scrollTop = 0;
}
function nwShow() { M.nopExtra = null; $('#homeView').hidden = true; $('#cfgView').hidden = true; if ($('#quickView')) $('#quickView').hidden = true; $('#nemView').hidden = false; window.scrollTo(0, 0); nwRender(); }
function nwApply() { // vuelca la configuración del asistente en los controles del menú clásico (que arranca la partida)
  const clk = (sel) => { const e = $(sel); if (e) e.click(); }; const set = (id, v) => { const e = $(id); if (e) e.value = v == null ? '' : v; };
  if (NW.pack === 'joint' || ((NW.pack === 'ambull' || NW.pack === 'arch') && NW.variant === 'joint')) {
    clk('#segMode [data-v=coop]'); const jm = NW.pack === 'joint' ? NW.jm : NW.pack === 'ambull' ? 65 : 66; set('#jmSel', jm); set('#aoSel', '');
    if (NW.pack === 'joint') { set('#njRole', NW.role === 'off' || NW.role === 'def' ? NW.role : 'rnd'); const n = NW.npo; set('#njSize', n.size); set('#njAl', n.al); set('#njBeh', n.beh); set('#njTr', n.tr); set('#njNm', n.nm); set('#njWr', n.wr); set('#njWm', n.wm); }
  } else { clk('#segMode [data-v=' + NW.mode + ']'); if (NW.mode === 'ai') { clk('#segLevel [data-v=' + NW.level + ']'); clk('#segSide [data-v="0"]'); } set('#aoSel', NW.pack === 'ambull' ? 6 : NW.pack === 'arch' ? 7 : ''); }
  if (NW.pack === 'nops') {
    const so = $('#nopSel'); const key = NW.nem[0].size + '|' + (NW.mode === 'hot' ? NW.nem[1].size : NW.sz1); if (so && ![...so.options].some(o => o.value === key)) so.insertAdjacentHTML('beforeend', `<option value="${key}">${key}</option>`); set('#nopSel', key); set('#nopSt0', NW.st[0]); set('#nopSt1', NW.st[1]);
    const ex = {}; NW.nem.slice(0, NW.mode === 'hot' ? 2 : 1).forEach((n, i) => { const b = nwBuild(n); const al = n.al || (i === 0 ? NW.alAuto : '') || ''; if (al) ex['al' + i] = al; if (!b.errors || !b.errors.length) ex['cfg' + i] = Object.assign({}, b.cfg, { allegiance: al || b.cfg.allegiance, size: n.size }); }); M.nopExtra = ex;
    set('#aoSel', ''); if ($('#aopChk')) { $('#aopChk').checked = false; if ($('#aopRow')) $('#aopRow').hidden = true; }
  } else if ($('#nopSel')) set('#nopSel', '');
  if (!M.teams[0] || M.teams[0].id !== NW.band[0]) nwSetBand(0); if (NW.pack === 'nops' || nwPvp()) { if (!NW.band[1] || !M.teams[1] || M.teams[1].id !== NW.band[1]) nwSetBand(1); }
  if (NW.pack === 'nops' && NW.bring[0] && M.teams[0]) { const ids = M.teams[0].ops, inc = NW.bring[0].map(k => ids[k]), out = ids.filter((_, k) => !NW.bring[0].includes(k)); M.teams[0].ops = [...inc, ...out]; }
  if (!M.teams[0] || !M.teams[0].id) return false; if (!M.teams[1] || !M.teams[1].id) nwSetBand(1); return true;
}
function initNemWizard() {
  { const bt = $('#btnTut'); if (bt) bt.onclick = () => showTutorial(0); }
  const v = $('#nemView'); if (!v) return; const btn = $('#btnNem'); if (btn) btn.onclick = () => { NW.step = 0; nwShow(); };
  v.addEventListener('input', e => { const a = e.target.dataset.act, i = +e.target.dataset.i; if (a === 'nm') NW.nem[i].name = e.target.value; else if (a === 'nnm') NW.npo.nm = e.target.value; });
  v.addEventListener('change', e => { const a = e.target.dataset.act, i = +e.target.dataset.i, p = +e.target.dataset.p; let re = true;
    if (a === 'al') NW.nem[i].al = e.target.value; else if (a === 'bh') NW.nem[i].beh = e.target.value; else if (a === 'nal') NW.npo.al = e.target.value; else if (a === 'nbh') NW.npo.beh = e.target.value; else if (a === 'ntr') NW.npo.tr = e.target.value; else if (a === 'nwr') NW.npo.wr = e.target.value; else if (a === 'nwm') NW.npo.wm = e.target.value;
    else if (a === 'band') { NW.band[p] = e.target.value; nwSetBand(p); } else re = false; if (re) nwRender(); });
  v.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return; const a = b.dataset.act, val = b.dataset.v, i = +b.dataset.i, p = +b.dataset.p;
    if (a === 'home') { M.nopExtra = null; if ($('#nopSel')) $('#nopSel').value = ''; $('#nemView').hidden = true; showHome(); return; }
    if (a === 'prev') { NW.step = Math.max(0, NW.step - 1); return nwRender(); }
    if (a === 'next') { if (nwErrors()) return; NW.step++; return nwRender(); }
    if (a === 'go' || a === 'custom') { if (nwErrors()) return; if (!nwApply()) { toast('Elige tu banda'); return; } $('#nemView').hidden = true; $('#cfgView').hidden = false; if (a === 'custom') { M.fromQuick = true; openBand(0); } else startFromMenu(); return; }
    if (a === 'pack') { NW.pack = val; NW.step = 0; if (val === 'ambull' || val === 'arch') NW.variant = NW.variant || 'joint'; if (val === 'joint') NW.mode = 'ai'; }
    else if (a === 'var') NW.variant = val; else if (a === 'mode') NW.mode = val; else if (a === 'jm') NW.jm = +val; else if (a === 'role') NW.role = val;
    else if (a === 'nsz') NW.npo.size = val; else if (a === 'st') NW.st[i] = +val; else if (a === 'sz') { NW.nem[i].size = val; NW.bring[0] = null; if (!nwBuild(NW.nem[i]).errors.length) { } else { NW.nem[i].rw = ['Autocannon']; NW.nem[i].mw = ['Close combat weapon']; NW.nem[i].tr = []; } } else if (a === 'sz1') { NW.sz1 = val; NW.bring[1] = null; }
    else if (a === 'wp') { const k = b.dataset.k, L = NW.nem[i][k], j = L.indexOf(val); if (j >= 0) L.splice(j, 1); else L.push(val); }
    else if (a === 'tr') { const L = NW.nem[i].tr, j = L.indexOf(val); if (j >= 0) L.splice(j, 1); else L.push(val); }
    else if (a === 'br') { const k = +b.dataset.k; const ids = M.teams[p].ops, n = nselCount(ids.length, NW.nem[0].size); const L = NW.bring[p] || []; const j = L.indexOf(k); if (j >= 0) L.splice(j, 1); else if (L.length < n) L.push(k); NW.bring[p] = L; }
    nwRender(); });
}
initNemWizard();

{ const bo = document.querySelector('#btnOff'); if (bo) { if (!location.protocol.startsWith('http')) bo.hidden = true; bo.onclick = () => offlineDL(bo.querySelector('span')); } }
