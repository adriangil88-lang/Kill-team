// Descargas robustas para el artefacto: cola con concurrencia limitada, reintentos con espera creciente (y parámetro anti-caché en los reintentos,
// para saltarse un 404/5xx transitorio cacheado), y caché persistente (Cache Storage) para no volver a bajar los paquetes grandes.
const MAXC = 6; let active = 0; const waitQ = [];
export const NET = { pending: 0, failed: 0, log: [] };
const slot = () => new Promise(res => { if (active < MAXC) { active++; res(); } else waitQ.push(res); });
const free = () => { const n = waitQ.shift(); if (n) n(); else active--; };
const sleep = ms => new Promise(z => setTimeout(z, ms));
let CACHE = null;
const cache = async () => { if (CACHE !== null) return CACHE; try { CACHE = (typeof caches !== 'undefined') ? await caches.open('kt-assets-v1') : false; } catch (e) { CACHE = false; } return CACHE; };
export async function kfetch(url, o = {}) { // devuelve un Response correcto (ok) o lanza el último error
  const tries = o.tries || 6, keep = o.keep !== false;
  NET.pending++;
  try {
    if (keep) { const c = await cache(); if (c) { try { const m = await c.match(url); if (m && m.ok) return m; } catch (e) { } } }
    let last = null;
    for (let t = 0; t < tries; t++) {
      await slot();
      try {
        const u = t === 0 ? url : url + (url.includes('?') ? '&' : '?') + '_r=' + t + Date.now().toString(36);
        const r = await fetch(u, { cache: t === 0 ? 'default' : 'reload', ...(o.headers ? { headers: o.headers } : {}) });
        if (r.ok) { if (keep) { const c = await cache(); if (c) { try { c.put(url, r.clone()); } catch (e) { } } } return r; }
        last = new Error('HTTP ' + r.status + ' ' + url);
      } catch (e) { last = e; } finally { free(); }
      NET.log.push(String(last && last.message || last)); if (NET.log.length > 20) NET.log.shift();
      await sleep(Math.min(8000, 500 * 2 ** t) + Math.random() * 300);
    }
    NET.failed++; throw last || new Error('fallo de red ' + url);
  } finally { NET.pending--; }
}
export const kjson = async (u, o) => (await kfetch(u, { keep: false, ...(o || {}) })).json();
export const kbuf = async (u, o) => (await kfetch(u, o)).arrayBuffer();
export const kblob = async (u, o) => (await kfetch(u, o)).blob();
