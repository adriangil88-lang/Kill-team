/* Cartas en español: texto traducido de cada carta (ES.cards) y fichas de datos generadas a partir de los datos */
export let ES = null;
export const errTeam = tid => (ES && ES.err && ES.err[tid]) || null;
export async function loadES() { try { ES = await (await fetch('es.json')).json(); } catch (e) { ES = null; } return ES; }
const H = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WRMAP = [[/^Range\b/i, 'Alcance'], [/^Lethal\b/i, 'Letal'], [/^Piercing Crits\b/i, 'Críticos de penetración'], [/^Piercing\b/i, 'Penetración'], [/^Rending\b/i, 'Desgarradora'], [/^Devastating\b/i, 'Devastadora'], [/^Torrent\b/i, 'Torrente'], [/^Saturate\b/i, 'Saturación'], [/^Ceaseless\b/i, 'Incesante'], [/^Shock\b/i, 'Choque'], [/^Blast\b/i, 'Ráfaga'], [/^Silent\b/i, 'Silenciosa'], [/^Brutal\b/i, 'Brutal'], [/^Heavy \(Dash only\)/i, 'Pesada (solo Correr)'], [/^Heavy \(Reposition only\)/i, 'Pesada (solo Reposicionarse)'], [/^Heavy\b/i, 'Pesada'], [/^Stun\b/i, 'Aturdidora'], [/^Hot\b/i, 'Sobrecalentamiento'], [/^Severe\b/i, 'Severa'], [/^Limited\b/i, 'Limitada'], [/^Accurate\b/i, 'Certera'], [/^Seek Light\b/i, 'Buscadora (Ligero)'], [/^Seek\b/i, 'Buscadora'], [/^Balanced\b/i, 'Equilibrada'], [/^Punishing\b/i, 'Castigadora'], [/^Relentless\b/i, 'Implacable'], [/^PSYCHIC\b/, 'PSÍQUICA'], [/^Poison\b/i, 'Veneno'], [/^Shield\b/i, 'Escudo'], [/^Beam\b/i, 'Haz'], [/^Explosive\b/i, 'Explosiva']];
export function trWR(s) {
  if (!s) return '–';
  return String(s).split(/,\s*/).map(p => { p = p.trim(); const m = p.match(/^(\d+["”]?)\s+(.*)$/); const pre = m ? m[1] + ' ' : '', q = m ? m[2] : p; for (const [re, es] of WRMAP) if (re.test(q)) return pre + q.replace(re, es); return p; }).join(', ');
}
export const esName = n => (ES && ES.n[n]) || n;
export const esWeapon = n => (ES && ES.w[n]) || n;
export const esKW = k => (ES && ES.kw[k]) || k;
export const esTeam = id => (ES && ES.teams[id]) || id;
const KIND = { rule: 'Regla de facción', equipment: 'Equipo de facción', strategy: 'Ardid de estrategia', firefight: 'Ardid de tiroteo', roster: 'Plantilla del comando' };
function para(p) {
  p = String(p);
  if (p.startsWith('~')) return `<p class="fl">${H(p.slice(1))}</p>`;
  if (/^[•▶■]/.test(p)) return `<p class="bl">${H(p)}</p>`;
  const m = p.match(/^([A-ZÁÉÍÓÚÑ][^:.]{2,38}):\s(.*)$/);
  return m ? `<p><b>${H(m[1])}:</b> ${H(m[2])}</p>` : `<p>${H(p)}</p>`;
}
/* ¿hay carta traducida para esta imagen? */
export const hasCard = u => !!(ES && ES.cards && ES.cards[u]);
export function textCard(u, cls) {
  const c = ES.cards[u];
  if (c.multi) return Array.from({ length: c.multi }, (_, i) => textCard(u + '#' + i, cls)).join('');
  return `<div class="ecard ${cls || ''}" data-z="${H(u)}"${c.f ? ` style="--fs:${c.f}"` : ''}><div class="ec-h"><span>${H(esTeam(c.tm))}</span><b>${H(KIND[c.k] || '')}</b></div><div class="ec-b"><div class="ec-t">${H(c.t)}</div>${c.p.map(para).join('')}</div></div>`;
}
/* ficha de datos de un agente (cuando la imagen es la tarjeta estándar 640×370) */
export function opFace(o, u, cls) {
  const sw = o.w || [];
  return `<div class="ecard op ${cls || ''}" data-z="${H(u || '')}"><div class="ec-oh"><b>${H(esName(o.name))}</b><span class="st"><i>LPA</i>${o.apl}</span><span class="st"><i>MOV.</i>${o.move}"</span><span class="st"><i>SALV.</i>${o.save}+</span><span class="st"><i>HERIDAS</i>${o.wounds}</span></div>
<table><tr><th>NOMBRE</th><th>ATAQ.</th><th>IMP.</th><th>DA</th><th>REGLAS DE ARMAS</th></tr>${sw.map(w => `<tr class="${w.m ? 'm' : 'r'}" data-w="${H(w.n)}"><td>${w.m ? '⚔ ' : '◎ '}${H(esWeapon(w.n))}</td><td>${w.atk}</td><td>${w.hit}+</td><td>${w.d}/${w.cd}</td><td>${H(trWR(w.wr))}</td></tr>`).join('')}</table>
${(ES && ES.ab && ES.ab[o.id]) ? `<div class="ec-ab">${ES.ab[o.id].map(para).join('')}</div>` : ''}${(ES && ES.errop && ES.errop[o.id]) ? `<div class="ec-err"><b>Errata oficial aplicada:</b> ${ES.errop[o.id].map(H).join(' · ')}</div>` : ''}<div class="ec-kw">${(o.kw || []).map(k => H(esKW(k))).join(', ')}</div></div>`;
}
/* versión en español de una carta (o null si no existe y debe usarse la imagen original) */
export function cardOrNull(u, cls, o) {
  if (!ES) return null;
  if (hasCard(u)) return textCard(u, cls);
  if (o && ((ES.ab && ES.ab[o.id]) || (ES.sz && ES.sz[u] && ES.sz[u][0] <= 640))) return opFace(o, u, cls);
  return null;
}
