/* Sincronización con el servidor de casa. El servidor es la fuente de verdad:
 * al abrir se descarga el diario del jugador y cada cambio se sube al momento.
 * Sin cobertura, los cambios esperan en el buzón (IndexedDB) y salen solos. */
import * as db from './db.js';

export const API = 'https://servidor.tail9fb7ef.ts.net';
let enviando = false, ultimoError = null, oyentes = [];
export const alCambiar = (fn) => oyentes.push(fn);
const avisar = () => oyentes.forEach((f) => f(estadoSync()));
let pendientes = 0;
export const estadoSync = () => ({ pendientes, error: ultimoError, enLinea: navigator.onLine });

async function pedir(ruta, opciones = {}, intentos = 1) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try { return await fetch(API + ruta, { ...opciones, signal: ctl.signal, cache: 'no-store' }); }
  finally { clearTimeout(t); }
}

/* Descarga el diario del jugador y le aplica encima lo que aún no ha subido. */
export async function cargar(u) {
  const cola = await db.colaTodas().catch(() => []);
  pendientes = cola.length;
  let remoto;
  try {
    const r = await pedir(`/api/diario?u=${encodeURIComponent(u)}`);
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
    remoto = await r.json();
    ultimoError = null;
  } catch (e) {
    ultimoError = 'sin-servidor'; avisar();
    remoto = null;
  }
  const mapa = { cervezas: new Map(), porProbar: new Map() };
  if (remoto) {
    for (const c of remoto.cervezas) mapa.cervezas.set(c.id, c);
    for (const p of remoto.porProbar) mapa.porProbar.set(p.id, p);
  }
  for (const op of cola) {
    if (op.u !== u || !mapa[op.tabla]) continue;
    if (op.tipo === 'put') mapa[op.tabla].set(op.datos.id, op.datos);
    if (op.tipo === 'del') mapa[op.tabla].delete(op.id);
  }
  avisar();
  vaciarCola();
  return { cervezas: [...mapa.cervezas.values()], porProbar: [...mapa.porProbar.values()], conectado: !!remoto };
}

export async function poner(tabla, datos) { await db.colaPoner({ tipo: 'put', tabla, u: datos.u, datos }); pendientes++; avisar(); vaciarCola(); }
export async function quitar(tabla, id, u) { await db.colaPoner({ tipo: 'del', tabla, id, u }); pendientes++; avisar(); vaciarCola(); }
export async function subirFoto(id, blob, u) { await db.colaPoner({ tipo: 'foto', id, u, blob }); pendientes++; avisar(); vaciarCola(); }

/* Fotos aún no subidas (para enseñarlas mientras tanto). */
export async function fotoPendiente(id) {
  const cola = await db.colaTodas().catch(() => []);
  const op = cola.reverse().find((o) => o.tipo === 'foto' && o.id === id);
  return op ? op.blob : null;
}

export async function vaciarCola() {
  if (enviando) return;
  enviando = true;
  try {
    let cola = await db.colaTodas();
    for (const op of cola) {
      let r;
      try {
        if (op.tipo === 'put') r = await pedir(`/api/${op.tabla === 'cervezas' ? 'cervezas' : 'porprobar'}/${op.datos.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op.datos) });
        else if (op.tipo === 'del') r = await pedir(`/api/${op.tabla === 'cervezas' ? 'cervezas' : 'porprobar'}/${op.id}?u=${encodeURIComponent(op.u)}`, { method: 'DELETE' });
        else if (op.tipo === 'foto') r = await pedir(`/api/fotos/${op.id}?u=${encodeURIComponent(op.u)}`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: op.blob });
      } catch (e) { ultimoError = 'sin-servidor'; break; }
      // 2xx: hecho. 4xx (dato inválido, versión más nueva en el servidor…): no se reintenta nunca.
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) {
        if (!r.ok) console.warn('Cambio rechazado por el servidor', r.status, op);
        await db.colaQuitar(op.n); pendientes = Math.max(0, pendientes - 1); ultimoError = null; avisar();
        continue;
      }
      ultimoError = 'sin-servidor'; break;
    }
    pendientes = (await db.colaTodas()).length;
  } finally {
    enviando = false; avisar();
    if (pendientes) setTimeout(vaciarCola, ultimoError ? 15000 : 1000);
  }
}
addEventListener('online', () => vaciarCola());

/* Migración: lo que la versión 1.0.7 guardó solo en el móvil se sube al servidor y se borra del móvil. */
export async function migrarLocal(u) {
  let cervezas = [], porProbar = [];
  try { [cervezas, porProbar] = await Promise.all([db.todas('cervezas'), db.todas('porProbar')]); } catch (e) { return 0; }
  if (!cervezas.length && !porProbar.length) return 0;
  for (const c of cervezas) {
    const datos = { ...c, u };
    if (c.tieneFoto) { const b = await db.fotoLeer(c.id).catch(() => null); if (b) await db.colaPoner({ tipo: 'foto', id: c.id, u, blob: b }); else datos.tieneFoto = false; }
    await db.colaPoner({ tipo: 'put', tabla: 'cervezas', u, datos });
  }
  for (const p of porProbar) await db.colaPoner({ tipo: 'put', tabla: 'porProbar', u, datos: { ...p, u } });
  await Promise.all([db.vaciar('cervezas'), db.vaciar('porProbar'), db.vaciar('fotos')]);
  return cervezas.length + porProbar.length;
}
