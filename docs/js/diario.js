/* Diario de cervezas: registro, historial con filtros, favoritas y «quiero probar».
 * Todo se guarda en el móvil (IndexedDB) y funciona sin conexión. */
import * as db from './db.js';
import * as sync from './sync.js';
import { ESTILOS, CERVEZAS, PAISES, FAMILIA, bandera, validar } from './catalogo.js';

const A = () => window.BirrasApp;           // puente con el resto de la app (toast, vibrar, bote…)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const estado = {
  cervezas: [], porProbar: [], vista: 'probadas',
  filtros: { q: '', estilo: '', pais: '', nota: 0, fecha: 'todo', fav: false, orden: 'recientes' },
  limite: 40, editando: null, form: null, deProbar: null,
};
const urls = new Map();   // id -> objectURL de la foto (caché)

/* ================= Carga ================= */
export async function iniciar() {
  montarFiltros();
  enlazar();
  sync.alCambiar(pintarSync);
  document.addEventListener('birras:yo', recargar);   // al cambiar de jugador, su diario
  addEventListener('online', recargar);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recargar(); });
  await recargar();
}

/* El diario se descarga del servidor de casa cada vez (no se guarda en el móvil). */
let cargando = null;
async function recargar() {
  const u = A().yo();
  if (!u) { estado.cervezas = []; estado.porProbar = []; pintar(); return; }
  if (cargando) return cargando;
  cargando = (async () => {
    try {
      const subidas = await sync.migrarLocal(u);
      if (subidas) A().toast(`☁️ Subiendo al servidor ${subidas} cervezas que estaban solo en este móvil.`);
      const r = await sync.cargar(u);
      estado.cervezas = r.cervezas; estado.porProbar = r.porProbar; estado.conectado = r.conectado;
    } catch (e) {
      estado.conectado = false;
    }
    pintar();
  })();
  try { await cargando; } finally { cargando = null; }
}
function pintarSync(st) {
  const el = $('dSync'); if (!el) return;
  if (st.error && st.pendientes) el.textContent = `⏳ ${st.pendientes} cambio${st.pendientes > 1 ? 's' : ''} esperando conexión con el servidor`;
  else if (st.error) el.textContent = '⚠️ Sin conexión con el servidor. Lo que apuntes se subirá cuando vuelva.';
  else if (st.pendientes) el.textContent = `☁️ Subiendo ${st.pendientes} cambio${st.pendientes > 1 ? 's' : ''}…`;
  else el.textContent = '☁️ Guardado en el servidor';
  el.className = 'd-sync' + (st.error ? ' mal' : '');
}

/* ================= Utilidades de presentación ================= */
export function estrellas(nota, tam = '') {
  const n = Number(nota) || 0;
  return `<span class="estrellas ${tam}" aria-label="${n ? `${n} de 5` : 'Sin nota'}">${[1, 2, 3, 4, 5].map((i) => {
    const p = Math.max(0, Math.min(1, n - i + 1)) * 100;
    return `<span class="est"><span class="lleno" style="width:${p}%">★</span>★</span>`;
  }).join('')}</span>`;
}
const fmtNota = (n) => (n == null ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }));
const fmtAbv = (n) => (n == null ? '' : `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);
const fmtFecha = (ms) => {
  const d = new Date(ms), hoy = new Date();
  const dias = Math.floor((new Date(hoy.toDateString()) - new Date(d.toDateString())) / 864e5);
  const h = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (dias === 0) return `Hoy, ${h}`;
  if (dias === 1) return `Ayer, ${h}`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: d.getFullYear() === hoy.getFullYear() ? undefined : 'numeric' });
};
/* Color de marcador para fichas sin foto: cada estilo su tono. */
const TONOS = { Lager: '#d9a21b', IPA: '#d9731b', Ale: '#c4561f', Negra: '#3b2418', Trigo: '#e8c35a', Belga: '#b8862b', 'Ácida': '#d94f6b', Fuerte: '#7a2f1b', Ligera: '#9fc24a', Otra: '#8a6a4a' };
const tono = (estilo) => TONOS[FAMILIA[estilo] || 'Otra'];

async function urlFoto(id) {
  if (urls.has(id)) return urls.get(id);
  // Si la foto aún no ha subido se enseña la del buzón; si no, la del servidor.
  const blob = await sync.fotoPendiente(id);
  const u = blob ? URL.createObjectURL(blob) : `${sync.API}/api/fotos/${id}`;
  urls.set(id, u);
  return u;
}
function olvidarFoto(id) { const u = urls.get(id); if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); urls.delete(id); }

/* Foto: se reduce a 1080 px y JPEG 0,8 (≈150 KB) para no llenar el móvil. */
async function comprimir(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('imagen')); i.src = url; });
    const max = 1080, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8));
  } finally { URL.revokeObjectURL(url); }
}

/* ================= Filtros ================= */
function montarFiltros() {
  $('dEstilo').innerHTML = '<option value="">Todos los estilos</option>' + ESTILOS.map((e) => `<option>${esc(e)}</option>`).join('');
  $('listaPaises').innerHTML = Object.keys(PAISES).map((p) => `<option value="${esc(p)}">`).join('');
  $('listaEstilos').innerHTML = ESTILOS.map((e) => `<option value="${esc(e)}">`).join('');
}
function paisesUsados() {
  const s = new Set(estado.cervezas.map((c) => c.pais).filter(Boolean));
  $('dPais').innerHTML = '<option value="">Todos los países</option>' + [...s].sort().map((p) => `<option value="${esc(p)}"${p === estado.filtros.pais ? ' selected' : ''}>${bandera(p)} ${esc(p)}</option>`).join('');
}
function filtradas() {
  const f = estado.filtros, q = norm(f.q);
  const ahora = Date.now(), d0 = new Date(new Date().toDateString()).getTime();
  const desde = { hoy: d0, semana: ahora - 7 * 864e5, mes: ahora - 30 * 864e5, ano: ahora - 365 * 864e5, todo: 0 }[f.fecha];
  let l = estado.cervezas.filter((c) =>
    (!q || norm(`${c.nombre} ${c.marca} ${c.estilo} ${c.pais} ${c.comentario}`).includes(q)) &&
    (!f.estilo || c.estilo === f.estilo) && (!f.pais || c.pais === f.pais) &&
    (!f.nota || (c.nota || 0) >= f.nota) && (!f.fav || c.favorita) && c.fecha >= desde);
  const ord = { recientes: (a, b) => b.fecha - a.fecha, nota: (a, b) => (b.nota || 0) - (a.nota || 0) || b.fecha - a.fecha, nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es') }[f.orden];
  return l.sort(ord);
}

/* ================= Pintar ================= */
export function pintar() {
  paisesUsados();
  const total = estado.cervezas.length;
  const distintas = new Set(estado.cervezas.map((c) => norm(c.nombre))).size;
  const paises = new Set(estado.cervezas.map((c) => c.pais).filter(Boolean)).size;
  $('dResumen').innerHTML = `<div><b class="num">${total}</b><span>registradas</span></div><div><b class="num">${distintas}</b><span>distintas</span></div><div><b class="num">${paises}</b><span>países</span></div><div><b class="num">${estado.cervezas.filter((c) => c.favorita).length}</b><span>favoritas</span></div>`;
  document.querySelectorAll('[data-dvista]').forEach((b) => b.classList.toggle('on', b.dataset.dvista === estado.vista));
  $('dProbadas').hidden = estado.vista !== 'probadas';
  $('dPorProbar').hidden = estado.vista !== 'porprobar';
  $('dPpN').textContent = estado.porProbar.length ? ` · ${estado.porProbar.length}` : '';
  if (estado.vista === 'probadas') pintarProbadas(); else pintarPorProbar();
}

function pintarProbadas() {
  // «Otra igual»: las últimas distintas, para repetir en un toque
  const vistas = new Set(), recientes = [];
  for (const c of [...estado.cervezas].sort((a, b) => b.fecha - a.fecha)) {
    const k = norm(c.nombre); if (vistas.has(k)) continue; vistas.add(k); recientes.push(c); if (recientes.length === 8) break;
  }
  $('dRepetir').hidden = !recientes.length;
  $('dRepetirLista').innerHTML = recientes.map((c) => `<button class="rep pulsable" data-repetir="${c.id}"><span class="rep-img" data-foto="${c.tieneFoto ? c.id : ''}" style="--tono:${tono(c.estilo)}">${c.tieneFoto ? '' : '🍺'}</span><span class="rep-n">${esc(c.nombre)}</span></button>`).join('');

  const l = filtradas();
  const f = estado.filtros;
  const activos = [f.q, f.estilo, f.pais, f.nota, f.fav, f.fecha !== 'todo'].filter(Boolean).length;
  $('dFiltrosN').textContent = activos ? activos : '';
  $('dLimpiar').hidden = !activos;
  if (!estado.cervezas.length) {
    $('dLista').innerHTML = `<div class="vacio-grande glass"><div class="e">🍺</div><b>Tu diario está vacío</b><span>Pulsa el botón + para apuntar tu primera cerveza. Son tres toques.</span></div>`;
  } else if (!l.length) {
    $('dLista').innerHTML = `<div class="vacio-grande glass"><div class="e">🔍</div><b>Ninguna cerveza con esos filtros</b><span>Prueba a quitar alguno.</span></div>`;
  } else {
    $('dLista').innerHTML = l.slice(0, estado.limite).map(tarjeta).join('') +
      (l.length > estado.limite ? `<button class="mas-btn pulsable" id="dMas">Ver ${Math.min(40, l.length - estado.limite)} más de ${l.length - estado.limite}</button>` : '');
  }
  cargarFotos();
}

function tarjeta(c) {
  const meta = [c.marca, c.estilo, fmtAbv(c.abv)].filter(Boolean).map(esc).join(' · ');
  return `<article class="ficha glass pulsable" data-ver="${c.id}">
    <div class="ficha-img" data-foto="${c.tieneFoto ? c.id : ''}" style="--tono:${tono(c.estilo)}">${c.tieneFoto ? '' : '<span>🍺</span>'}</div>
    <div class="ficha-txt">
      <div class="ficha-n">${esc(c.nombre)}</div>
      <div class="ficha-m">${meta || '&nbsp;'}</div>
      <div class="ficha-p">${estrellas(c.nota, 'peq')}<span class="ficha-f">${c.pais ? bandera(c.pais) + ' ' : ''}${fmtFecha(c.fecha)}</span></div>
    </div>
    <button class="corazon${c.favorita ? ' on' : ''}" data-fav="${c.id}" aria-label="${c.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}">${c.favorita ? '♥' : '♡'}</button>
  </article>`;
}

function pintarPorProbar() {
  const l = [...estado.porProbar].sort((a, b) => b.creado - a.creado);
  $('dPpLista').innerHTML = l.length ? l.map((p) => `<div class="pp glass">
      <div class="pp-txt"><b>${esc(p.nombre)}</b><span>${[p.marca, p.estilo, p.pais && bandera(p.pais) + ' ' + p.pais].filter(Boolean).map(esc).join(' · ') || 'Sin detalles'}</span>${p.nota ? `<small>${esc(p.nota)}</small>` : ''}</div>
      <div class="pp-acc"><button class="pulsable pp-ya" data-probada="${p.id}">Ya la he probado</button><button class="pulsable pp-x" data-quitarpp="${p.id}" aria-label="Quitar de la lista">✕</button></div>
    </div>`).join('') : `<div class="vacio-grande glass"><div class="e">📝</div><b>Nada pendiente</b><span>Apunta aquí las cervezas que quieras probar y táchalas cuando caigan.</span></div>`;
}

async function cargarFotos() {
  for (const el of document.querySelectorAll('[data-foto]:not([data-foto=""]):not(.cargada)')) {
    const u = await urlFoto(el.dataset.foto);
    if (u) { el.style.backgroundImage = `url("${u}")`; el.classList.add('cargada'); }
  }
}

/* ================= Hoja de añadir / editar ================= */
function abrirForm(base = {}, editando = null) {
  estado.editando = editando;
  estado.form = { foto: null, quitarFoto: false, nota: base.nota ?? null };
  $('fTitulo').textContent = editando ? 'Editar cerveza' : 'Nueva cerveza';
  $('fGuardar').textContent = editando ? 'Guardar cambios' : 'Guardar';
  $('fNombre').value = base.nombre || '';
  $('fMarca').value = base.marca || '';
  $('fEstilo').value = base.estilo || '';
  $('fAbv').value = base.abv ?? '';
  $('fPais').value = base.pais || '';
  $('fComentario').value = base.comentario || '';
  const fecha = new Date(base.fecha && editando ? base.fecha : Date.now());
  $('fFecha').value = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  $('fBote').checked = !editando && !!(A().yo() && A().boteActivo());
  $('fBoteFila').hidden = !!editando || !A().yo();
  $('fMasDetalles').open = !!editando || !!(base.marca || base.abv != null || base.pais);
  document.querySelectorAll('.f-err').forEach((e) => { e.textContent = ''; });
  $('fSugerencias').innerHTML = ''; $('fSugerencias').hidden = true;
  pintarNotaForm();
  pintarChipsEstilo();
  const fondo = $('fFoto');
  fondo.style.backgroundImage = ''; fondo.classList.remove('con');
  if (editando && base.tieneFoto) urlFoto(editando).then((u) => { if (u) { fondo.style.backgroundImage = `url("${u}")`; fondo.classList.add('con'); } });
  $('fQuitarFoto').hidden = !(editando && base.tieneFoto);
  $('capaForm').classList.add('on');
  if (!base.nombre) setTimeout(() => $('fNombre').focus(), 350);
}
function cerrarForm() { $('capaForm').classList.remove('on'); estado.deProbar = null; }

function pintarNotaForm() {
  const n = estado.form.nota;
  $('fNota').innerHTML = [1, 2, 3, 4, 5].map((i) => {
    const p = n == null ? 0 : Math.max(0, Math.min(1, n - i + 1)) * 100;
    return `<button type="button" class="est-btn" data-estrella="${i}" aria-label="${i} estrellas"><span class="est grande"><span class="lleno" style="width:${p}%">★</span>★</span></button>`;
  }).join('') + `<span class="nota-num">${n == null ? 'Toca para puntuar' : fmtNota(n)}</span>`;
}
function pintarChipsEstilo() {
  // Primero los estilos que más usas
  const cuenta = {};
  for (const c of estado.cervezas) if (c.estilo) cuenta[c.estilo] = (cuenta[c.estilo] || 0) + 1;
  const top = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
  const lista = [...new Set([...top, 'Lager', 'IPA', 'Especial', 'Stout', 'Trigo (Weissbier)', 'APA', 'Tostada / Ámbar', 'Sin alcohol'])].slice(0, 9);
  const actual = $('fEstilo').value;
  if (actual && !lista.includes(actual)) lista.unshift(actual);
  $('fEstilos').innerHTML = lista.map((e) => `<button type="button" class="chip-e${e === actual ? ' on' : ''}" data-estilo="${esc(e)}">${esc(e)}</button>`).join('');
}

function sugerencias(q) {
  const nq = norm(q).trim();
  if (nq.length < 2) { $('fSugerencias').hidden = true; return; }
  const mias = new Map();
  for (const c of [...estado.cervezas].sort((a, b) => b.fecha - a.fecha)) if (!mias.has(norm(c.nombre))) mias.set(norm(c.nombre), { ...c, mia: true });
  const cand = [...mias.values(), ...CERVEZAS.filter((c) => !mias.has(norm(c.nombre)))]
    .filter((c) => norm(`${c.nombre} ${c.marca}`).includes(nq)).slice(0, 6);
  $('fSugerencias').innerHTML = cand.map((c, i) => `<button type="button" class="sug" data-sug="${i}"><b>${esc(c.nombre)}</b><span>${[c.estilo, fmtAbv(c.abv), c.pais && bandera(c.pais)].filter(Boolean).map(esc).join(' · ')}${c.mia ? ' · <em>ya la has probado</em>' : ''}</span></button>`).join('');
  $('fSugerencias').hidden = !cand.length;
  $('fSugerencias')._cand = cand;
}
function aplicarSugerencia(c) {
  $('fNombre').value = c.nombre; $('fMarca').value = c.marca || ''; $('fEstilo').value = c.estilo || '';
  $('fAbv').value = c.abv ?? ''; $('fPais').value = c.pais || '';
  $('fSugerencias').hidden = true;
  pintarChipsEstilo();
  A().vibrar('suave');
}

async function guardarForm() {
  const r = validar({
    nombre: $('fNombre').value, marca: $('fMarca').value, estilo: $('fEstilo').value, abv: $('fAbv').value,
    pais: $('fPais').value, comentario: $('fComentario').value, nota: estado.form.nota,
  });
  document.querySelectorAll('.f-err').forEach((e) => { e.textContent = ''; });
  if (!r.ok) {
    for (const [k, msg] of Object.entries(r.errores)) { const el = $('fErr-' + k); if (el) el.textContent = msg; }
    if (r.errores.abv) $('fMasDetalles').open = true;
    A().vibrar('fuerte');
    return;
  }
  const fechaIn = new Date($('fFecha').value).getTime();
  const ahora = Date.now();
  const fecha = Number.isFinite(fechaIn) ? Math.min(fechaIn, ahora + 6e4) : ahora;
  const previo = estado.editando ? estado.cervezas.find((c) => c.id === estado.editando) : null;
  const id = previo ? previo.id : db.nuevoId();
  if (!A().yo()) { A().toast('Elige primero quién eres.'); return; }
  const ficha = { ...(previo || {}), ...r.datos, id, fecha, editado: ahora, creado: previo ? previo.creado : ahora, favorita: previo ? !!previo.favorita : false, u: A().yo() };
  $('fGuardar').disabled = true;
  try {
    if (estado.form.foto) { await sync.subirFoto(id, estado.form.foto, ficha.u); olvidarFoto(id); ficha.tieneFoto = true; }
    else if (estado.form.quitarFoto) { olvidarFoto(id); ficha.tieneFoto = false; }
    await sync.poner('cervezas', ficha);
    if (estado.deProbar) { await sync.quitar('porProbar', estado.deProbar, ficha.u); estado.porProbar = estado.porProbar.filter((p) => p.id !== estado.deProbar); }
  } catch (e) {
    $('fGuardar').disabled = false;
    A().toast('No se ha podido guardar. Vuelve a intentarlo.');
    return;
  }
  $('fGuardar').disabled = false;
  if (previo) Object.assign(previo, ficha); else estado.cervezas.push(ficha);
  const sumar = !previo && $('fBote').checked;
  cerrarForm();
  pintar();
  if (sumar) A().sumarAlBote();
  else { A().vibrar('medio'); A().sonar('moneda'); }
  A().flotante(previo ? 'Guardado' : '🍺 Apuntada', previo ? '' : `${ficha.nombre}${sumar ? ' · +1 al bote' : ''}`);
  if (!previo) avisoResponsable();
  document.dispatchEvent(new CustomEvent('diario:cambio'));
}

/* Consumo responsable: avisa (sin sermones) cuando el día se va de las manos. */
function avisoResponsable() {
  const d0 = new Date(new Date().toDateString()).getTime();
  const hoy = estado.cervezas.filter((c) => c.fecha >= d0 && (c.abv == null || c.abv > 0.5)).length;
  if (hoy === 4 || hoy === 7 || hoy >= 10) setTimeout(() => A().toast(`💧 Llevas ${hoy} hoy. Intercala agua y, si bebes, no conduzcas.`), 1800);
}

/* ================= Detalle ================= */
async function verDetalle(id) {
  const c = estado.cervezas.find((x) => x.id === id);
  if (!c) return;
  const veces = estado.cervezas.filter((x) => norm(x.nombre) === norm(c.nombre));
  const media = veces.filter((x) => x.nota).reduce((a, x, _, arr) => a + x.nota / arr.length, 0);
  const u = c.tieneFoto ? await urlFoto(id) : null;
  $('detCuerpo').innerHTML = `
    <div class="det-img" style="--tono:${tono(c.estilo)};${u ? `background-image:url('${u}')` : ''}">${u ? '' : '<span>🍺</span>'}</div>
    <div class="det-cab"><h2>${esc(c.nombre)}</h2><button class="corazon grande${c.favorita ? ' on' : ''}" data-fav="${c.id}" aria-label="Favorita">${c.favorita ? '♥' : '♡'}</button></div>
    <div class="det-nota">${estrellas(c.nota)}<b>${fmtNota(c.nota)}</b></div>
    <div class="det-datos">
      ${[['Marca', c.marca], ['Estilo', c.estilo], ['Graduación', fmtAbv(c.abv)], ['País', c.pais && `${bandera(c.pais)} ${c.pais}`], ['Fecha', new Date(c.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })]]
        .filter((x) => x[1]).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}
    </div>
    ${c.comentario ? `<p class="det-com">“${esc(c.comentario)}”</p>` : ''}
    ${veces.length > 1 ? `<p class="det-veces">La has tomado ${veces.length} veces${media ? ` · nota media ${fmtNota(Math.round(media * 10) / 10)}` : ''}</p>` : ''}
    <div class="det-acc">
      <button class="pulsable prim" data-repetir="${c.id}">🍺 Otra igual</button>
      <button class="pulsable" data-editar="${c.id}">✏️ Editar</button>
      <button class="pulsable peligro" data-borrar="${c.id}">🗑 Borrar</button>
    </div>`;
  $('capaDetalle').classList.add('on');
}

/* ================= Acciones ================= */
async function alternarFav(id) {
  const c = estado.cervezas.find((x) => x.id === id);
  if (!c) return;
  c.favorita = !c.favorita;
  c.editado = Date.now();
  try { await sync.poner('cervezas', c); } catch (e) { c.favorita = !c.favorita; return A().toast('No se ha podido guardar.'); }
  A().vibrar('suave');
  pintar();
  if ($('capaDetalle').classList.contains('on')) verDetalle(id);
}
async function borrarFicha(id) {
  const c = estado.cervezas.find((x) => x.id === id);
  if (!c || !await A().preguntar('¿Borrar esta cerveza?', `${c.nombre} desaparecerá de tu diario. No se puede deshacer.`, 'Borrar', true)) return;
  try { await sync.quitar('cervezas', id, c.u || A().yo()); } catch (e) { return A().toast('No se ha podido borrar.'); }
  olvidarFoto(id);
  estado.cervezas = estado.cervezas.filter((x) => x.id !== id);
  $('capaDetalle').classList.remove('on');
  pintar();
  document.dispatchEvent(new CustomEvent('diario:cambio'));
}
function repetir(id) {
  const c = estado.cervezas.find((x) => x.id === id);
  if (!c) return;
  $('capaDetalle').classList.remove('on');
  abrirForm({ nombre: c.nombre, marca: c.marca, estilo: c.estilo, abv: c.abv, pais: c.pais, nota: c.nota });
}

async function guardarPorProbar() {
  const r = validar({ nombre: $('ppNombre').value, marca: $('ppMarca').value, estilo: $('ppEstilo').value, pais: $('ppPais').value });
  $('ppErr').textContent = r.ok ? '' : r.errores.nombre;
  if (!r.ok) return A().vibrar('fuerte');
  if (!A().yo()) return A().toast('Elige primero quién eres.');
  const p = { id: db.nuevoId(), u: A().yo(), nombre: r.datos.nombre, marca: r.datos.marca, estilo: r.datos.estilo, pais: r.datos.pais, nota: $('ppNota').value.trim().slice(0, 140), creado: Date.now(), editado: Date.now() };
  try { await sync.poner('porProbar', p); } catch (e) { return A().toast('No se ha podido guardar.'); }
  estado.porProbar.push(p);
  $('capaPP').classList.remove('on');
  A().vibrar('medio'); A().toast(`📝 ${p.nombre} apuntada para probar`);
  pintar();
}

function enlazar() {
  const vista = $('vistaDiario');
  vista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav],[data-repetir],[data-ver],[data-dvista],[data-probada],[data-quitarpp],#dMas,#dLimpiar,#dPpAnadir,[data-rapido]');
    if (!b) return;
    if (b.dataset.fav) { e.stopPropagation(); return alternarFav(b.dataset.fav); }
    if (b.dataset.repetir) return repetir(b.dataset.repetir);
    if (b.dataset.ver) return verDetalle(b.dataset.ver);
    if (b.dataset.dvista) { estado.vista = b.dataset.dvista; A().vibrar('suave'); return pintar(); }
    if (b.dataset.rapido) { estado.filtros.fecha = b.dataset.rapido; $('dFecha').value = b.dataset.rapido; return pintar(); }
    if (b.dataset.probada) {
      const p = estado.porProbar.find((x) => x.id === b.dataset.probada);
      if (p) { abrirForm({ nombre: p.nombre, marca: p.marca, estilo: p.estilo, pais: p.pais }); estado.deProbar = p.id; }
      return;
    }
    if (b.dataset.quitarpp) {
      sync.quitar('porProbar', b.dataset.quitarpp, A().yo()).then(() => { estado.porProbar = estado.porProbar.filter((x) => x.id !== b.dataset.quitarpp); pintar(); });
      return;
    }
    if (b.id === 'dMas') { estado.limite += 40; return pintar(); }
    if (b.id === 'dLimpiar') {
      Object.assign(estado.filtros, { q: '', estilo: '', pais: '', nota: 0, fecha: 'todo', fav: false });
      $('dBuscar').value = ''; $('dEstilo').value = ''; $('dNota').value = '0'; $('dFecha').value = 'todo'; $('dFav').checked = false;
      return pintar();
    }
    if (b.id === 'dPpAnadir') {
      ['ppNombre', 'ppMarca', 'ppEstilo', 'ppPais', 'ppNota'].forEach((k) => { $(k).value = ''; });
      $('ppErr').textContent = '';
      $('capaPP').classList.add('on'); setTimeout(() => $('ppNombre').focus(), 350);
    }
  });
  let t;
  $('dBuscar').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { estado.filtros.q = $('dBuscar').value; estado.limite = 40; pintar(); }, 150); });
  $('dEstilo').addEventListener('change', () => { estado.filtros.estilo = $('dEstilo').value; pintar(); });
  $('dPais').addEventListener('change', () => { estado.filtros.pais = $('dPais').value; pintar(); });
  $('dNota').addEventListener('change', () => { estado.filtros.nota = Number($('dNota').value); pintar(); });
  $('dFecha').addEventListener('change', () => { estado.filtros.fecha = $('dFecha').value; pintar(); });
  $('dOrden').addEventListener('change', () => { estado.filtros.orden = $('dOrden').value; pintar(); });
  $('dFav').addEventListener('change', () => { estado.filtros.fav = $('dFav').checked; pintar(); });
  $('dFiltrosBtn').addEventListener('click', () => { $('dFiltros').classList.toggle('on'); A().vibrar('suave'); });

  // Botón + flotante
  $('fab').addEventListener('click', () => { A().vibrar('medio'); estado.vista === 'porprobar' ? $('dPpAnadir').click() : abrirForm(); });

  // Formulario
  $('fNombre').addEventListener('input', () => sugerencias($('fNombre').value));
  $('fSugerencias').addEventListener('click', (e) => { const b = e.target.closest('[data-sug]'); if (b) aplicarSugerencia($('fSugerencias')._cand[+b.dataset.sug]); });
  $('fNota').addEventListener('click', (e) => {
    const b = e.target.closest('[data-estrella]'); if (!b) return;
    const i = +b.dataset.estrella, n = estado.form.nota;
    estado.form.nota = n === i ? i - 0.5 : i;   // tocar otra vez la misma estrella = media
    pintarNotaForm(); A().vibrar('suave');
  });
  $('fEstilos').addEventListener('click', (e) => { const b = e.target.closest('[data-estilo]'); if (!b) return; $('fEstilo').value = $('fEstilo').value === b.dataset.estilo ? '' : b.dataset.estilo; pintarChipsEstilo(); A().vibrar('suave'); });
  $('fEstilo').addEventListener('change', pintarChipsEstilo);
  $('fFoto').addEventListener('click', () => { $('fFotoInput').value = ''; $('fFotoInput').click(); });
  $('fFotoInput').addEventListener('change', async () => {
    const f = $('fFotoInput').files[0]; if (!f) return;
    try {
      const blob = await comprimir(f);
      estado.form.foto = blob; estado.form.quitarFoto = false;
      const u = URL.createObjectURL(blob);
      $('fFoto').style.backgroundImage = `url("${u}")`; $('fFoto').classList.add('con'); $('fQuitarFoto').hidden = false;
      A().vibrar('suave');
    } catch (e) { A().toast('No se ha podido leer esa foto. Prueba con otra.'); }
  });
  $('fQuitarFoto').addEventListener('click', () => { estado.form.foto = null; estado.form.quitarFoto = true; $('fFoto').style.backgroundImage = ''; $('fFoto').classList.remove('con'); $('fQuitarFoto').hidden = true; });
  $('fGuardar').addEventListener('click', guardarForm);
  $('fCancelar').addEventListener('click', cerrarForm);
  $('fAProbar').addEventListener('click', async () => {
    const r = validar({ nombre: $('fNombre').value, marca: $('fMarca').value, estilo: $('fEstilo').value, pais: $('fPais').value });
    if (!r.ok) { $('fErr-nombre').textContent = r.errores.nombre; return; }
    if (!A().yo()) return A().toast('Elige primero quién eres.');
    const p = { id: db.nuevoId(), u: A().yo(), nombre: r.datos.nombre, marca: r.datos.marca, estilo: r.datos.estilo, pais: r.datos.pais, nota: '', creado: Date.now(), editado: Date.now() };
    await sync.poner('porProbar', p); estado.porProbar.push(p);
    cerrarForm(); A().toast(`📝 ${p.nombre} a «Quiero probar»`); pintar();
  });

  // Detalle
  $('capaDetalle').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav],[data-repetir],[data-editar],[data-borrar],#detCerrar');
    if (!b) { if (e.target === $('capaDetalle')) $('capaDetalle').classList.remove('on'); return; }
    if (b.id === 'detCerrar') return $('capaDetalle').classList.remove('on');
    if (b.dataset.fav) return alternarFav(b.dataset.fav);
    if (b.dataset.repetir) return repetir(b.dataset.repetir);
    if (b.dataset.borrar) return borrarFicha(b.dataset.borrar);
    if (b.dataset.editar) { const c = estado.cervezas.find((x) => x.id === b.dataset.editar); $('capaDetalle').classList.remove('on'); abrirForm(c, c.id); }
  });

  // Quiero probar
  $('ppGuardar').addEventListener('click', guardarPorProbar);
  $('ppCancelar').addEventListener('click', () => $('capaPP').classList.remove('on'));
}

export const datos = () => estado;

/* Resumen para la hoja de perfil. */
export function resumen() {
  const l = estado.cervezas;
  const notas = l.filter((c) => c.nota);
  const cuenta = {};
  for (const c of l) if (c.estilo) cuenta[c.estilo] = (cuenta[c.estilo] || 0) + 1;
  return {
    total: l.length, distintas: new Set(l.map((c) => norm(c.nombre))).size,
    paises: new Set(l.map((c) => c.pais).filter(Boolean)).size, favoritas: l.filter((c) => c.favorita).length,
    media: notas.length ? Math.round(notas.reduce((a, c) => a + c.nota, 0) / notas.length * 10) / 10 : null,
    estilo: Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0] || null,
  };
}
