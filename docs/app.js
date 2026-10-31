(() => {
  'use strict';
  const B = window.Birras;
  const $ = (id) => document.getElementById(id);
  const URL_TOPIC = `${B.NTFY}/${B.TOPIC}`;
  const CAP = window.Capacitor && window.Capacitor.Plugins;   // dentro de la app de iPhone

  let S = null;
  let yo = leer('birras-yo');
  let sonido = leer('birras-sonido') !== 'no';
  let desfase = 0, ultSnap = 0, ultimoId = null, es = null;
  const misEids = new Set();
  // Pila de deshacer de este móvil: cada entrada es lo que se publicó ({u, t, n}).
  let pila = []; try { pila = JSON.parse(leer('birras-pila') || '[]'); } catch (e) { pila = []; }
  let modo = 'sumar', fixU = null;
  const guardarPila = () => { pila = pila.slice(-30); guardar('birras-pila', JSON.stringify(pila)); };
  let broncaHasta = 0, yaAvisado = false, dianaVista = +(leer('birras-diana') || 0), megaAntes = null, dianaAbierta = false, girando = false;

  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  const ahora = () => Date.now() / 1000 + desfase;
  const ARRANQUE = Date.now() / 1000;   // nada anterior a abrir la app merece un aviso
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hora = (t) => new Date(t * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const inicial = (u) => B.NOMBRES[u][0];

  /* ================= Fotos de perfil =================
   * Miniatura JPEG de 96 px en el propio canal (cabe en un mensaje). El servidor
   * de casa las guarda y las vuelve a publicar para que no caduquen a las 12 h. */
  let fotos = {}; try { fotos = JSON.parse(leer('birras-fotos') || '{}'); } catch (e) { fotos = {}; }
  const fotoValida = (x) => typeof x === 'string' && x.startsWith('data:image/jpeg;base64,') && x.length < 3900;
  const COLORES_NUEVOS = [['#ffd84a', '#d98a00'], ['#7af0c8', '#0f8f6c'], ['#ff8fd2', '#b0247a'], ['#9fd0ff', '#2a6fd6'], ['#ffb38a', '#c94a1c'], ['#c8a6ff', '#6a3fd1']];
  const FIJOS = ['jorlo', 'alvaro', 'david', 'bianca', 'noelia', 'eider', 'aitor'];
  function colorDe(u) {
    if (FIJOS.includes(u)) return null;
    let h = 0; for (const ch of u) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORES_NUEVOS[h % COLORES_NUEVOS.length];
  }
  function av(u, extra = '') {
    const f = fotos[u], col = colorDe(u);
    if (f) return `<span class="av ${u} con-foto ${extra}" style="background-image:url('${f}')"></span>`;
    return `<span class="av ${u} ${extra}"${col ? ` style="background:linear-gradient(145deg,${col[0]},${col[1]})"` : ''}>${inicial(u)}</span>`;
  }
  const colorBarra = (u) => (colorDe(u) ? ` style="background:${colorDe(u)[1]}"` : '');
  function recibirFoto(d) {
    if (!B.USERS.includes(d.u)) return false;
    const antes = fotos[d.u] || null;
    if (d.img === null) delete fotos[d.u]; else if (fotoValida(d.img)) fotos[d.u] = d.img; else return false;
    if ((fotos[d.u] || null) === antes) return false;   // repetida (reconexión o copia del servidor): nada que avisar
    guardar('birras-fotos', JSON.stringify(fotos));
    return true;
  }
  async function hacerMiniatura(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
      const lado = Math.min(img.naturalWidth, img.naturalHeight);
      for (const [px, q] of [[96, .72], [88, .6], [80, .5], [64, .45]]) {
        const c = document.createElement('canvas'); c.width = c.height = px;
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, px, px);
        const d = c.toDataURL('image/jpeg', q);
        if (fotoValida(d)) return d;
      }
      return null;
    } finally { URL.revokeObjectURL(url); }
  }
  /* Versión grande (hasta 1080 px) en el servidor de casa, para el visor. */
  const API = 'https://servidor.tail9fb7ef.ts.net';
  async function subirFotoGrande(file, u) {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
      const k = Math.min(1, 1080 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
      await fetch(`${API}/api/perfil/${u}`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    } catch (e) { /* sin servidor: el visor enseñará la miniatura */ }
  }
  function verFoto(u) {
    if (!fotos[u]) return;
    $('visorImg').src = fotos[u];               // la miniatura sale al instante…
    $('visorNom').textContent = B.NOMBRES[u] || '';
    $('capaVisor').classList.add('on'); vibrar('suave');
    const grande = new Image();                  // …y se cambia por la grande en cuanto llega
    grande.onload = () => { if ($('capaVisor').classList.contains('on')) $('visorImg').src = grande.src; };
    grande.src = `${API}/api/perfil/${u}?v=${fotos[u].length}${fotos[u].slice(-12).replace(/[^A-Za-z0-9]/g, '')}`;
  }
  $('capaVisor').addEventListener('click', () => $('capaVisor').classList.remove('on'));
  // Tocar cualquier foto de perfil la amplía (menos el botón de arriba, que abre tu perfil)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('.av.con-foto');
    if (!a || a.closest('#yoBtn')) return;
    const u = [...a.classList].find((c) => B.USERS.includes(c) || fotos[c]);
    if (!u) return;
    e.stopPropagation(); e.preventDefault();
    verFoto(u);
  }, true);
  let fotoPara = null;
  function elegirFoto(u) { fotoPara = u; $('fotoInput').value = ''; $('fotoInput').click(); }

  /* ================= Red ================= */
  /* Envío con cola: si no hay cobertura, la jugada se guarda en el móvil y se
   * manda sola en cuanto vuelve la conexión (no se pierde nada). */
  let cola = []; try { cola = JSON.parse(leer('birras-cola') || '[]'); } catch (e) { cola = []; }
  let enviando = false;
  const guardarCola = () => guardar('birras-cola', JSON.stringify(cola));
  function publicar(d) {
    d.eid = d.eid || Math.random().toString(36).slice(2, 10);
    misEids.add(d.eid);
    if (d.k !== 'snap') { cola.push(d); guardarCola(); }
    else enviarUno(d);
    vaciarCola();
    return true;
  }
  async function enviarUno(d) {
    try {
      const r = await fetch(URL_TOPIC, { method: 'POST', body: JSON.stringify(d) });
      return r.ok ? 'ok' : r.status === 429 ? 'lento' : r.status >= 500 ? 'red' : 'malo';
    } catch (e) { return 'red'; }
  }
  async function vaciarCola() {
    if (enviando) return;
    enviando = true;
    try {
      while (cola.length) {
        const r = await enviarUno(cola[0]);
        if (r === 'ok' || r === 'malo') { cola.shift(); guardarCola(); continue; }
        if (r === 'lento') toast('Vais muy rápido: se manda en unos segundos.');
        pintarCola();
        setTimeout(vaciarCola, r === 'lento' ? 6000 : 4000);
        return;
      }
    } finally { enviando = false; pintarCola(); }
  }
  function pintarCola() {
    const n = cola.length;
    const el = $('pillCola');
    if (el) el.remove();
    if (n) $('pills').insertAdjacentHTML('afterbegin', `<span class="pill pendientes" id="pillCola">⏳ ${n} sin enviar</span>`);
  }
  addEventListener('online', vaciarCola);
  setInterval(() => { if (cola.length) vaciarCola(); }, 8000);

  /* Diálogo propio (el confirm() del sistema sale como «localhost» en la app). */
  function preguntar(titulo, texto, si = 'Aceptar', peligro = false) {
    return new Promise((ok) => {
      $('dlgT').textContent = titulo; $('dlgTxt').textContent = texto;
      $('dlgSi').textContent = si; $('dlgSi').classList.toggle('peligro', peligro);
      $('capaDialogo').classList.add('on'); vibrar('suave');
      const fin = (v) => { $('capaDialogo').classList.remove('on'); $('dlgSi').onclick = $('dlgNo').onclick = null; ok(v); };
      $('dlgSi').onclick = () => fin(true); $('dlgNo').onclick = () => fin(false);
    });
  }

  async function cargar() {
    try {
      const r = await fetch(`${URL_TOPIC}/json?poll=1&since=all`, { cache: 'no-store' });
      const ms = (await r.text()).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
      for (const m of ms) if (m.event === 'message') {
        ultimoId = m.id;
        const p = B.parsear(m);
        if (p && p.d.k === 'foto') recibirFoto(p.d);
        if (p && p.d.k === 'snap') ultSnap = Math.max(ultSnap, m.time);
      }
      S = B.reconstruir(ms, null) || B.estadoInicial(Math.floor(Date.now() / 1000));
      pintar();
      conectar();
    } catch (e) {
      estadoConexion(false);
      setTimeout(cargar, 4000);
    }
  }

  function conectar() {
    if (es) es.close();
    es = new EventSource(`${URL_TOPIC}/sse?since=${ultimoId || 'none'}`);
    es.onopen = () => estadoConexion(true);
    es.onerror = () => {
      estadoConexion(false);
      es.close();
      clearTimeout(conectar.t);
      conectar.t = setTimeout(conectar, 3000);
    };
    es.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.event === 'open') { desfase = m.time - Date.now() / 1000; return; }
      if (m.event !== 'message') return;
      ultimoId = m.id;
      const p = B.parsear(m);
      if (!p) return;
      if (p.d.k === 'foto') {
        if (recibirFoto(p.d)) {
          $('tienda').dataset.h = ''; pintar();
          if (!misEids.has(p.d.eid) && p.d.por !== 'servidor' && p.d.img && m.time > ARRANQUE + desfase - 5) toast(`📷  ${B.NOMBRES[p.d.u]} estrena foto`);
        }
        return;
      }
      if (p.d.k === 'snap') {
        ultSnap = Math.max(ultSnap, m.time);
        if (!S || p.d.s.upto > S.upto + 5) { S = B.normalizar(B.clon(p.d.s)); pintar(); }
        return;
      }
      if (!S) return;
      const efectos = B.aplicar(S, p);
      const mio = misEids.has(p.d.eid);
      if (efectos.length) animar(efectos, mio);
      pintar();
      if (mio && ahora() - ultSnap > 2 * 3600) publicar({ k: 'snap', s: B.paraSnap(S) });
    };
  }

  function estadoConexion(ok) {
    const el = $('conexion');
    el.textContent = ok ? 'En directo con la mesa' : 'Sin conexión, reintentando…';
    el.className = 'conexion ' + (ok ? 'ok' : 'mal');
    $('puntoCon').className = 'punto-con ' + (ok ? 'ok' : 'mal');
  }

  /* ================= Pintar ================= */
  function pintar() {
    if (!S) return;
    $('capaCarga').classList.add('fuera');
    pintarNoche();
    const now = ahora();
    const tot = (t) => B.totalGrupo(S, t);

    // Bote
    const cerv = tot('cerveza');
    const mega = $('mega');
    mega.textContent = cerv;
    if (megaAntes !== null && cerv > megaAntes) { mega.classList.remove('salta'); void mega.offsetWidth; mega.classList.add('salta'); }
    megaAntes = cerv;
    $('megaL').textContent = cerv === 1 ? 'cerveza' : 'cervezas';
    const ptsDe = (u) => B.puntos(S.users[u]);
    $('ptsBote').textContent = B.fmtPts(B.USERS.reduce((n, u) => n + ptsDe(u), 0));
    $('tCubata').textContent = tot('cubata');
    $('tChupito').textContent = tot('chupito');
    $('tCigarro').textContent = tot('cigarro');
    const aporte = (u) => ptsDe(u);
    const todo = B.USERS.reduce((n, u) => n + aporte(u), 0);
    $('barraRep').innerHTML = todo ? B.USERS.map((u) => `<i class="c-${u}" style="width:${aporte(u) / todo * 100}%${colorDe(u) ? ';background:' + colorDe(u)[1] : ''}"></i>`).join('') : '';
    $('leyenda').innerHTML = B.USERS.filter((u) => aporte(u) > 0).map((u) => `<span><i class="c-${u}"${colorBarra(u)}></i>${B.NOMBRES[u]} ${B.fmtPts(aporte(u))}</span>`).join('') || '<span>Nadie ha puntuado todavía</span>';

    // Ranking
    const orden = B.USERS.slice().sort((a, b) => aporte(b) - aporte(a) || S.users[b].fichas - S.users[a].fichas);
    const lider = Math.max(1, ...B.USERS.map(aporte));
    $('marcador').innerHTML = orden.map((u, i) => {
      const U = S.users[u], p = aporte(u);
      const seg = ORDEN_VIS.map((t) => U.c[t] ? `<i class="t-${t}" style="width:${U.c[t] * B.TIPOS[t].pts / lider * 100}%"></i>` : '').join('');
      const ic = Object.keys(B.TIPOS).filter((t) => U.c[t]).map((t) => `${B.TIPOS[t].ico} ${U.c[t]}`).join('  ') || 'sin estrenar';
      return `<div class="jug${u === yo ? ' yo' : ''}${p ? '' : ' cero'}">${av(u)}
        <div class="info"><div class="linea"><b>${B.NOMBRES[u]}</b>${i === 0 && p ? '<span class="corona">👑</span>' : ''}<span class="ic">${ic}</span></div><div class="barra">${seg}</div></div>
        <div class="pts num">${B.fmtPts(p)}<small>puntos</small></div></div>`;
    }).join('');
    const secos = new Set(B.secos(S, now).map((x) => x.u));
    $('ranking').innerHTML = orden.map((u, i) => {
      const U = S.users[u], seg = Math.max(0, now - U.ultCerveza);
      return `<div class="persona glass${u === yo ? ' yo' : ''}${secos.has(u) ? ' seco' : ''}" data-persona="${u}" role="button" tabindex="0" aria-label="Corregir a ${B.NOMBRES[u]}">
        ${av(u)}
        <div><div class="nom">${B.NOMBRES[u]}<span class="pos">${['🥇', '🥈', '🥉'][i] || ''}</span></div>
          <div class="det num"><span>🍺 ${U.c.cerveza}</span><span>🥃 ${U.c.cubata}</span><span>🥂 ${U.c.chupito}</span><span>🚬 ${U.c.cigarro}</span></div>
          <div class="hace${secos.has(u) ? ' mal' : ''}">${secos.has(u) ? 'Seco desde hace ' : 'Última cerveza hace '}${B.horasTexto(seg)} · ${U.fichas} fichas${U.castigos ? ` · 💀 ${U.castigos}` : ''}</div>
          <div class="editar">Toca para corregir</div>
        </div>
        <div class="tot num">${B.fmtPts(aporte(u))}<small>puntos</small></div>
      </div>`;
    }).join('');

    // Jugadas
    const fila = (f) => `<div class="jugada"><span class="e">${f.ico}</span><span class="t">${esc(f.txt)}</span><span class="h">${hora(f.t)}</span></div>`;
    const vacio = '<div class="vacio">El bote está a cero. Alguien tendrá que estrenarlo.</div>';
    $('feedCorto').innerHTML = S.feed.slice(0, 4).map(fila).join('') || vacio;
    $('feedLargo').innerHTML = S.feed.map(fila).join('') || vacio;

    // Lo mío
    if (yo && !B.USERS.includes(yo)) { yo = null; guardar('birras-yo', ''); pedirSilla(); toast('Tu jugador ya no está en la mesa. Elige otro.'); }
    if (!yo || !S.users[yo]) return;
    const U = S.users[yo];
    $('yoAv').outerHTML = av(yo).replace('<span ', '<span id="yoAv" ');
    $('yoNom').textContent = B.NOMBRES[yo];
    $('cambiarTxt').textContent = `Ahora eres ${B.NOMBRES[yo]}`;
    $('misFichas').textContent = U.fichas;
    const enCombo = now - U.ultBebida <= B.COMBO_VENTANA && U.combo >= 1;
    const sigMult = enCombo ? Math.min(U.combo + 1, B.COMBO_MAX) : 1;
    $('fCerveza').textContent = `+1 punto · +${10 * sigMult * (now < S.happy ? 2 : 1) * (U.racha ? 2 : 1)} fichas${sigMult > 1 ? ` · combo x${sigMult}` : ''}`;
    $('pills').innerHTML = [
      enCombo && U.combo >= 2 ? `<span class="pill combo">Combo x${Math.min(U.combo, B.COMBO_MAX)} · ${Math.ceil((B.COMBO_VENTANA - (now - U.ultBebida)) / 60)} min</span>` : '',
      U.racha ? `<span class="pill racha">🔥 x2 · ${U.racha}</span>` : '',
      now < S.happy ? `<span class="pill happy">Happy Hour ${Math.ceil((S.happy - now) / 60)} min</span>` : '',
      now < U.escudo ? `<span class="pill">🛡️ ${Math.ceil((U.escudo - now) / 60)} min</span>` : '',
    ].join('');
    $('palanca').disabled = U.fichas < B.SLOT_COSTE;
    $('doble').disabled = U.fichas < 20;
    $('dobleTxt').textContent = U.fichas >= 20 ? `Te juegas tus ${U.fichas} fichas. La casa gana el 53 % de las veces.` : 'Necesitas al menos 20 fichas para arruinarte.';
    const ult = pila[pila.length - 1];
    $('deshacer').hidden = !ult;
    if (ult) $('deshacer').textContent = `↩︎ Deshacer: ${ult.n > 0 ? '+1' : '−1'} ${B.TIPOS[ult.t].nombre.toLowerCase()}${ult.u !== yo ? ` de ${B.NOMBRES[ult.u]}` : ''}${pila.length > 1 ? ` · quedan ${pila.length}` : ''}`;
    if ($('capaFix').classList.contains('on')) pintarFix();
    pintarTienda(U);
    pintarCola();
    if ($('capaPerfil').classList.contains('on')) pintarPerfil();
  }

  /* ================= La noche: gráfico, récords, historial ================= */
  const ORDEN_VIS = ['cerveza', 'chupito', 'cubata', 'cigarro'];   // orden de apilado validado
  const COLOR = { cerveza: '#bb820e', chupito: '#9a5ce0', cubata: '#c2462e', cigarro: '#2a9f99' };
  const dur = (seg) => B.horasTexto(Math.max(0, seg));
  function pintarNoche() {
    const now = ahora();
    const pts = (u) => B.puntos(S.users[u]);
    const jugaron = B.USERS.filter((u) => Object.values(S.users[u].c).some(Boolean));
    $('nocheSub').textContent = S.t0 ? `Empezó a las ${hora(S.t0)} · lleva ${dur(now - S.t0)} · ${jugaron.length} en la mesa` : 'Todavía no ha empezado. La primera la paga la casa (mentira).';
    $('leyGraf').innerHTML = ORDEN_VIS.map((t) => `<span><i class="t-${t}"></i>${B.TIPOS[t].plural}</span>`).join('');
    pintarGrafico(now);

    const mejor = (f, filtro = jugaron) => filtro.slice().sort((a, b) => f(b) - f(a))[0];
    const horas = S.t0 ? Math.max(0.25, (now - S.t0) / 3600) : 0;
    const ritmoU = (u) => S.users[u].primera ? pts(u) / Math.max(0.5, (now - S.users[u].primera) / 3600) : 0;
    const rapido = mejor(ritmoU), combo = mejor((u) => S.users[u].maxCombo), fuma = mejor((u) => S.users[u].c.cigarro);
    const secos = jugaron.filter((u) => S.users[u].c.cerveza || S.users[u].ultEv);
    const seco = secos.slice().sort((a, b) => S.users[a].ultCerveza - S.users[b].ultCerveza)[0];
    const fmt1 = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
    const tarjeta = (etq, valor, sub) => `<div class="record glass"><span class="etq">${etq}</span><b>${valor}</b><span>${sub}</span></div>`;
    $('records').innerHTML = [
      tarjeta('Ritmo de la mesa', horas ? fmt1(B.totalGrupo(S) / horas) : '—', 'cervezas por hora'),
      tarjeta('Más rápido', rapido && ritmoU(rapido) ? B.NOMBRES[rapido] : '—', rapido && ritmoU(rapido) ? `${fmt1(ritmoU(rapido))} puntos por hora` : 'nadie todavía'),
      tarjeta('Mejor combo', combo && S.users[combo].maxCombo > 1 ? `x${Math.min(S.users[combo].maxCombo, B.COMBO_MAX)}` : '—', combo && S.users[combo].maxCombo > 1 ? B.NOMBRES[combo] : 'encadena dos en 20 min'),
      tarjeta('Rondas', S.rondas || 0, '3 o más con cerveza en 5 min'),
      tarjeta('Más fumador', fuma && S.users[fuma].c.cigarro ? B.NOMBRES[fuma] : '—', fuma && S.users[fuma].c.cigarro ? `${S.users[fuma].c.cigarro} cigarros` : 'aire limpio, de momento'),
      tarjeta('Más seco', seco ? B.NOMBRES[seco] : '—', seco ? `sin cerveza hace ${dur(now - S.users[seco].ultCerveza)}` : 'nadie ha bebido aún'),
    ].join('');

    const fecha = (t) => new Date(t * 1000).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    $('noches').innerHTML = (S.noches || []).map((n) => `<div class="noche-fila">
        <div class="top">${fecha(n.a)}<span>${hora(n.a)}–${hora(n.b)} · ${dur(n.b - n.a)}</span></div>
        <div class="det">🍺 ${n.c[0]} · 🥃 ${n.c[1]} · 🥂 ${n.c[2]} · 🚬 ${n.c[3]} · ${B.fmtPts(n.p)} puntos</div>
        <div class="det">${n.top.map((x, i) => `${['🥇', '🥈', '🥉'][i]} ${B.NOMBRES[x[0]]} ${B.fmtPts(x[1])}`).join('  ')}</div></div>`).join('') || '<div class="vacio">Cuando cerréis una noche, su resumen quedará aquí.</div>';
  }

  let grafSel = null;
  function pintarGrafico(now) {
    const ks = Object.keys(S.hist || {}).map(Number);
    if (!ks.length) { $('graf').innerHTML = '<div class="graf-vacio">El gráfico aparece con la primera consumición.</div>'; $('tip').hidden = true; return; }
    const ini = Math.min(...ks), fin = Math.max(Math.floor(now / 900), Math.max(...ks));
    const desde = Math.max(ini, fin - 31);
    const cubos = []; for (let k = desde; k <= fin; k++) cubos.push(k);
    const fila = (k) => S.hist[k] || [0, 0, 0, 0];
    const idx = (t) => B.ORDEN.indexOf(t);
    const max = Math.max(1, ...cubos.map((k) => fila(k).reduce((a, b) => a + b, 0)));
    const paso = max <= 4 ? 1 : max <= 10 ? 2 : 5, tope = Math.ceil(max / paso) * paso;
    const W = $('graf').clientWidth || 340, H = 190, iz = 22, ab = 20, ar = 6;
    const aw = (W - iz) / cubos.length, bw = Math.max(3, Math.min(22, aw - 3));
    const y = (v) => H - ab - (v / tope) * (H - ab - ar);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Consumiciones cada 15 minutos">`;
    for (let v = 0; v <= tope; v += paso) svg += `<line class="rejilla" x1="${iz}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="eje" x="${iz - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`;
    cubos.forEach((k, i) => {
      const x = iz + i * aw + (aw - bw) / 2;
      let base = 0;
      const tramos = ORDEN_VIS.map((t) => [t, fila(k)[idx(t)]]).filter((x) => x[1] > 0);
      tramos.forEach(([t, n], j) => {
        const y0 = y(base), y1 = y(base + n), alto = Math.max(1, y0 - y1 - (j ? 2 : 0));
        const ultimo = j === tramos.length - 1, r = ultimo ? Math.min(4, bw / 2, alto) : 0;
        const yt = y1, yb = y0 - (j ? 2 : 0);
        svg += r ? `<path d="M${x},${yb} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${yb} Z" fill="${COLOR[t]}"/>`
          : `<rect x="${x}" y="${yt}" width="${bw}" height="${Math.max(0, yb - yt)}" fill="${COLOR[t]}"/>`;
        base += n;
      });
      if (i % Math.ceil(cubos.length / 6) === 0 || i === cubos.length - 1) svg += `<text class="eje" x="${x + bw / 2}" y="${H - 5}" text-anchor="middle">${hora(k * 900)}</text>`;
      svg += `<rect class="zona${grafSel === k ? ' on' : ''}" data-k="${k}" x="${iz + i * aw}" y="0" width="${aw}" height="${H - ab}"/>`;
    });
    $('graf').innerHTML = svg + '</svg>';
    if (grafSel !== null) mostrarTip(grafSel);
  }
  function mostrarTip(k) {
    const z = document.querySelector(`.zona[data-k="${k}"]`);
    if (!z) { $('tip').hidden = true; return; }
    const f = S.hist[k] || [0, 0, 0, 0];
    $('tip').innerHTML = `<b>${hora(k * 900)}–${hora(k * 900 + 900)}</b>` + ORDEN_VIS.map((t) => `<div><i class="t-${t}"></i>${B.TIPOS[t].plural}: ${f[B.ORDEN.indexOf(t)]}</div>`).join('');
    const g = $('graf').getBoundingClientRect(), r = z.getBoundingClientRect(), caja = $('graf').parentNode.getBoundingClientRect();
    $('tip').hidden = false;
    const tw = $('tip').offsetWidth;
    let left = r.left - caja.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(caja.width - tw - 8, left));
    $('tip').style.left = left + 'px'; $('tip').style.top = (g.top - caja.top + 4) + 'px';
  }
  $('graf').addEventListener('pointerdown', (e) => {
    const z = e.target.closest('.zona');
    grafSel = z && +z.dataset.k !== grafSel ? +z.dataset.k : null;
    document.querySelectorAll('.zona').forEach((x) => x.classList.toggle('on', +x.dataset.k === grafSel));
    if (grafSel === null) $('tip').hidden = true; else { mostrarTip(grafSel); vibrar('suave'); }
  });
  $('version').textContent = `Casino Birras · ${window.BIRRAS_VERSION === 'web' ? 'web' : 'app ' + window.BIRRAS_VERSION}`;

  function pintarTienda(U) {
    const html = Object.entries(B.TIENDA).map(([k, P]) =>
      `<button class="pw glass pulsable" data-pw="${k}" ${U.fichas < P.coste ? 'disabled' : ''}><span class="e">${P.ico}</span><b>${P.nombre}</b><span>${P.desc}</span><span class="c">${P.coste} fichas</span></button>`).join('') +
      `<div class="dianas${dianaAbierta ? ' on' : ''}">${B.USERS.filter((u) => u !== yo).map((u) => `<button class="pulsable" data-diana="${u}">${av(u)}${B.NOMBRES[u]}</button>`).join('')}</div>`;
    if ($('tienda').dataset.h !== html) { $('tienda').innerHTML = html; $('tienda').dataset.h = html; }
  }

  /* ================= Reloj de la vergüenza ================= */
  function tic() {
    if (!S) return;
    const now = ahora();
    const secos = B.secos(S, now);
    const semilla = Math.floor(now / 10);
    $('verguenza').classList.toggle('on', secos.length > 0);
    if (secos.length) {
      const x = secos[semilla % secos.length];
      const txt = B.insulto(x.u, x.seg, semilla);
      if ($('verguenzaTxt').textContent !== txt) $('verguenzaTxt').textContent = txt;
    }
    if (yo && S.users[yo]) {
      const U = S.users[yo], seg = Math.max(0, now - U.ultCerveza);
      const mal = seg > B.HORA_SECA;
      $('reloj').classList.toggle('mal', mal);
      $('relojTxt').textContent = mal ? `Llevas ${B.horasTexto(seg)} sin cerveza. Inaceptable.` : `Tu última cerveza: hace ${B.horasTexto(seg)} · insultos en ${B.horasTexto(B.HORA_SECA - seg)}`;
      $('relojBarra').style.width = Math.min(100, seg / B.HORA_SECA * 100) + '%';
      const meToca = secos.find((x) => x.u === yo);
      if (meToca && now > broncaHasta) {
        if (!$('capaBronca').classList.contains('on')) {
          $('broncaT').textContent = 'BEBE';
          $('broncaFrase').textContent = B.insulto(yo, meToca.seg, semilla);
          $('capaBronca').classList.add('on'); sonar('bronca'); vibrar('fuerte');
          if (!yaAvisado) { notificar('🍺 BEBE', B.insulto(yo, meToca.seg, semilla)); yaAvisado = true; }
        }
      } else if (!meToca && $('broncaT').textContent === 'BEBE') { $('capaBronca').classList.remove('on'); yaAvisado = false; }
      if (S.diana && S.diana.u === yo && S.diana.t > dianaVista && now - S.diana.t < 180) {
        dianaVista = S.diana.t; guardar('birras-diana', String(dianaVista));
        $('broncaT').textContent = '🎯';
        $('broncaFrase').textContent = `${B.NOMBRES[S.diana.por]} te ha puesto en la diana. Bebe YA, ${B.NOMBRES[yo]}.`;
        $('capaBronca').classList.add('on'); sonar('bronca'); vibrar('fuerte');
        notificar('🎯 Te han apuntado', `${B.NOMBRES[S.diana.por]} dice que bebas YA.`);
      }
    }
    if (Math.floor(now) % 15 === 0) pintar();
  }

  /* ================= Acciones ================= */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    desbloquearAudio();
    if (b.dataset.tipo) {
      if (!yo) return pedirSilla();
      onda(b, e);
      if (modo === 'quitar') {
        if (!S.users[yo].c[b.dataset.tipo]) return toast(`No tienes ${B.TIPOS[b.dataset.tipo].plural.toLowerCase()} que quitar.`);
        vibrar('medio'); sonar('pierde');
        apuntar(yo, b.dataset.tipo, -1);
      } else {
        sonar('moneda'); vibrar('medio');
        apuntar(yo, b.dataset.tipo, 1);
      }
    } else if (b.dataset.foto) {
      elegirFoto(b.dataset.foto);
    } else if (b.dataset.quitarfoto) {
      const u = b.dataset.quitarfoto;
      preguntar('¿Quitar la foto?', `${B.NOMBRES[u]} volverá a salir con su inicial.`, 'Quitar', true).then((si) => { if (si) publicar({ k: 'foto', u, img: null, por: yo }); });
    } else if (b.dataset.modo) {
      modo = b.dataset.modo;
      document.querySelectorAll('.modo-b').forEach((x) => x.classList.toggle('on', x === b));
      $('bebidas').classList.toggle('quitar', modo === 'quitar');
      document.querySelectorAll('.beber .mas').forEach((x) => { x.textContent = modo === 'quitar' ? '−' : '+'; });
      vibrar('suave');
    } else if (b.dataset.fix) {
      const [t, n] = b.dataset.fix.split(':');
      if (+n < 0 && !S.users[fixU].c[t]) return;
      vibrar('suave'); sonar(+n > 0 ? 'moneda' : 'pierde');
      apuntar(fixU, t, +n, true);
    } else if (b.dataset.tab) {
      irA(b.dataset.tab); vibrar('suave');
    } else if (b.dataset.pw) {
      if (!yo) return pedirSilla();
      if (b.dataset.pw === 'diana') { dianaAbierta = !dianaAbierta; $('tienda').dataset.h = ''; pintar(); return; }
      publicar({ k: 'pw', u: yo, p: b.dataset.pw }); sonar('compra'); vibrar('medio');
    } else if (b.dataset.diana) {
      dianaAbierta = false; publicar({ k: 'pw', u: yo, p: 'diana', obj: b.dataset.diana }); sonar('compra'); vibrar('medio');
    }
  });

  function irA(v) {
    document.querySelectorAll('.vista').forEach((s) => s.classList.toggle('on', s.dataset.vista === v));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === v));
    guardar('birras-tab', v);
    document.body.dataset.vista = v;
    if (v === 'noche' && S) requestAnimationFrame(pintarNoche);
    window.scrollTo({ top: 0 });
  }

  /* Apunta y guarda en la pila para poder deshacer. */
  function apuntar(u, t, n, fix) {
    const d = { k: 'ev', u, t, n, por: yo };
    if (fix && n > 0) d.fix = true;
    pila.push({ u, t, n }); guardarPila();
    publicar(d); pintar();
  }
  function deshacer() {
    const ult = pila.pop(); guardarPila();
    if (!ult) return;
    if (ult.n > 0 && !S.users[ult.u].c[ult.t]) { toast('Eso ya estaba quitado.'); pintar(); return; }
    publicar({ k: 'ev', u: ult.u, t: ult.t, n: -ult.n, por: yo, fix: true, deshacer: true });
    vibrar('medio'); sonar('compra'); pintar();
  }
  $('deshacer').onclick = deshacer;

  /* Corregir a cualquiera desde la Mesa */
  $('ranking').addEventListener('click', (e) => {
    const c = e.target.closest('[data-persona]');
    if (!c || !S) return;
    fixU = c.dataset.persona; pintarFix(); $('capaFix').classList.add('on'); vibrar('suave');
  });
  function pintarFix() {
    if (!fixU || !S) return;
    $('fixT').textContent = `Corregir a ${B.NOMBRES[fixU]}`;
    $('fixFilas').innerHTML = Object.keys(B.TIPOS).map((t) => `<div class="fix-fila"><span class="e">${B.TIPOS[t].ico}</span><b>${B.TIPOS[t].plural}</b>
      <button class="menos pulsable" data-fix="${t}:-1" aria-label="Quitar ${B.TIPOS[t].un}">−</button><span class="n num">${S.users[fixU].c[t]}</span><button class="pulsable" data-fix="${t}:1" aria-label="Añadir ${B.TIPOS[t].un}">+</button></div>`).join('') +
      `<div class="foto-acc"><button class="pulsable" data-foto="${fixU}">📷 ${fotos[fixU] ? 'Cambiar foto' : 'Poner foto'}</button>${fotos[fixU] ? `<button class="pulsable" data-quitarfoto="${fixU}">Quitar foto</button>` : ''}</div>` +
      (pila.length ? `<button class="deshacer pulsable" id="fixDeshacer" style="justify-self:center">↩︎ Deshacer lo último</button>` : '');
    const fd = $('fixDeshacer'); if (fd) fd.onclick = deshacer;
  }
  $('fotoInput').addEventListener('change', async () => {
    const f = $('fotoInput').files[0];
    if (!f || !fotoPara) return;
    const u = fotoPara; fotoPara = null;
    toast('📷  Preparando la foto…');
    let img = null;
    try { img = await hacerMiniatura(f); } catch (e) { img = null; }
    if (!img) return toast('No se ha podido leer esa imagen. Prueba con otra.');
    recibirFoto({ u, img }); pintar(); if ($('capaFix').classList.contains('on')) pintarFix();
    publicar({ k: 'foto', u, img, por: yo });
    subirFotoGrande(f, u);
    flotante('📷', `nueva foto de ${B.NOMBRES[u]}`); sonar('compra'); vibrar('medio');
  });
  $('miFotoBtn').onclick = () => { if (!yo) return pedirSilla(); elegirFoto(yo); };
  $('fixOk').onclick = () => { $('capaFix').classList.remove('on'); fixU = null; };
  $('palanca').onclick = () => {
    if (!yo || !S || S.users[yo].fichas < B.SLOT_COSTE || girando) return;
    const r = B.tirarSlot();
    publicar({ k: 'slot', u: yo, r });
    girar(r);
  };
  $('doble').onclick = () => {
    if (!yo || !S) return;
    const f = S.users[yo].fichas;
    if (f < 20) return;
    preguntar('Doble o nada', `Te juegas tus ${f} fichas. Si ganas, ${f * 2}. Si pierdes, cero.`, 'Me la juego', true)
      .then((si) => { if (si) publicar({ k: 'doble', u: yo, gana: Math.random() < 0.47 }); });
  };
  $('broncaYa').onclick = () => { $('capaBronca').classList.remove('on'); apuntar(yo, 'cerveza', 1); sonar('moneda'); vibrar('medio'); };
  $('broncaLuego').onclick = () => { $('capaBronca').classList.remove('on'); broncaHasta = ahora() + 300; };
  $('yoBtn').onclick = () => (yo ? abrirPerfil() : pedirSilla());
  $('cambiarBtn').onclick = async () => {
    if (yo && !await preguntar('¿Cambiar de jugador?', `Ahora eres ${B.NOMBRES[yo]}. Si cambias, todo lo que apuntes desde este móvil contará para otra persona.`, 'Cambiar', true)) return;
    pedirSilla(true);
  };

  /* ================= Perfil personal ================= */
  function abrirPerfil() { pintarPerfil(); $('capaPerfil').classList.add('on'); vibrar('suave'); }
  $('perCerrar').onclick = () => $('capaPerfil').classList.remove('on');
  $('capaPerfil').addEventListener('click', (e) => { if (e.target === $('capaPerfil')) $('capaPerfil').classList.remove('on'); });
  function pintarPerfil() {
    if (!yo) return;
    const U = S ? S.users[yo] : null;
    $('perAv').innerHTML = av(yo, 'enorme');
    $('perNom').textContent = B.NOMBRES[yo];
    const st = (v, l) => `<div class="glass"><b class="num">${v}</b><span>${l}</span></div>`;
    if (U) {
      const orden = B.USERS.slice().sort((a, b) => B.puntos(S.users[b]) - B.puntos(S.users[a]));
      $('perSub').textContent = `${orden.indexOf(yo) + 1}º de ${B.USERS.length} esta noche · ${U.fichas} fichas`;
      $('perNoche').innerHTML = st(B.fmtPts(B.puntos(U)), 'puntos') + st(U.c.cerveza, 'cervezas') + st(U.c.cubata, 'cubatas') + st(U.c.chupito, 'chupitos') + st(U.c.cigarro, 'cigarros') +
        st(U.maxCombo > 1 ? 'x' + Math.min(U.maxCombo, B.COMBO_MAX) : '—', 'mejor combo') + st(U.castigos || 0, 'castigos 💀') + st(B.horasTexto(Math.max(0, ahora() - U.ultCerveza)), 'desde la última');
    } else { $('perSub').textContent = 'Conectando con la mesa…'; $('perNoche').innerHTML = ''; }
    $('sonidoVal').textContent = sonido ? 'Sí' : 'No';
    const admin = yo === B.ADMIN;
    $('perJugadores').hidden = !admin;
    if (admin) $('jugLista').innerHTML = B.USERS.map((u) => `<div class="jug-fila">${av(u)}<b>${esc(B.NOMBRES[u])}</b>${u === B.ADMIN ? '<span class="sub">administrador</span>' : `<button class="pulsable jug-quitar" data-baja="${u}">Quitar</button>`}</div>`).join('');
  }
  $('jugLista').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-baja]'); if (!b || yo !== B.ADMIN) return;
    const u = b.dataset.baja;
    if (!await preguntar(`¿Quitar a ${B.NOMBRES[u]}?`, 'Desaparece de la mesa, del bote y de la clasificación. Sus datos se guardan: si la vuelves a añadir con el mismo nombre, recupera lo suyo.', 'Quitar', true)) return;
    publicar({ k: 'jugador', op: 'baja', id: u, u: B.ADMIN, por: B.ADMIN });
  });
  $('jugAnadir').addEventListener('click', async () => {
    if (yo !== B.ADMIN) return;
    const nombre = $('jugNombre').value.replace(/\s+/g, ' ').trim();
    const id = B.idDe(nombre);
    if (!nombre || id.length < 2) return toast('Escribe un nombre de al menos 2 letras.');
    if (B.USERS.includes(id)) return toast(`${B.NOMBRES[id]} ya está en la mesa.`);
    publicar({ k: 'jugador', op: 'alta', nombre, u: B.ADMIN, por: B.ADMIN });
    $('jugNombre').value = '';
    vibrar('medio'); sonar('compra');
  });
  $('sonidoFila').onclick = () => { sonido = !sonido; guardar('birras-sonido', sonido ? 'si' : 'no'); iconoSonido(); pintarPerfil(); };
  const iconoSonido = () => { $('sonidoBtn').innerHTML = sonido
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'; };
  iconoSonido();
  $('sonidoBtn').onclick = () => { sonido = !sonido; guardar('birras-sonido', sonido ? 'si' : 'no'); iconoSonido(); };

  const hayNotis = 'Notification' in window;
  const pintarAvisos = () => { $('avisosVal').textContent = !hayNotis ? 'Usa la de abajo' : Notification.permission === 'granted' ? 'Activados' : 'Activar'; };
  pintarAvisos();
  $('avisosBtn').onclick = async () => {
    if (!hayNotis) return toast('Aquí no se puede: usa la app ntfy (la opción de abajo).');
    await Notification.requestPermission(); pintarAvisos();
  };
  $('ntfyLink').href = `${B.NTFY}/${B.TOPIC_AVISOS}`;
  $('ntfyTxt').textContent = `App ntfy → suscríbete a ${B.TOPIC_AVISOS}`;

  function pedirSilla(cancelable = false) {
    $('sillaCancelar').hidden = !cancelable;
    $('sillas').innerHTML = B.USERS.map((u) => {
      const U = S && S.users[u];
      const n = U ? B.fmtPts(B.puntos(U)) : 0;
      return `<button class="silla pulsable" data-silla="${u}">${av(u)}<b>${B.NOMBRES[u]}</b><span>${n} puntos</span></button>`;
    }).join('');
    $('capaEntrar').classList.add('on');
  }
  $('sillaCancelar').onclick = () => $('capaEntrar').classList.remove('on');
  $('sillas').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-silla]');
    if (!b) return;
    if (yo && b.dataset.silla !== yo && !await preguntar(`¿Seguro que eres ${B.NOMBRES[b.dataset.silla]}?`, 'Lo que apuntes desde este móvil contará para esa persona.', 'Sí, soy yo', true)) return;
    yo = b.dataset.silla; guardar('birras-yo', yo);
    document.dispatchEvent(new CustomEvent('birras:yo'));
    $('capaEntrar').classList.remove('on');
    $('tienda').dataset.h = '';
    pintar();
    flotante(`Hola, ${B.NOMBRES[yo]}`, 'hagan juego');
    desbloquearAudio(); sonar('compra'); vibrar('medio');
  });

  /* ================= Temas (cada móvil el suyo) ================= */
  const TEMAS = [
    ['birra', 'Birra', 'linear-gradient(135deg,#ffb21a,#ff3d81)'], ['neon', 'Neón', 'linear-gradient(135deg,#ff00d4,#00e5ff)'],
    ['oceano', 'Océano', 'linear-gradient(135deg,#00c2ff,#3a5bff)'], ['toxico', 'Tóxico', 'linear-gradient(135deg,#b6ff00,#00b3ff)'],
    ['fresa', 'Fresa', 'linear-gradient(135deg,#ffb3c7,#ff2e5e)'], ['noche', 'Noche', 'linear-gradient(135deg,#30305a,#08080f)'],
    ['claro', 'Claro', 'linear-gradient(135deg,#fff7e8,#ffd27a)'], ['auto', 'Automático (claro de día, oscuro de noche según el móvil)', 'linear-gradient(135deg,#fff7e8 50%,#16050c 50%)'],
  ];
  const oscuroSistema = matchMedia('(prefers-color-scheme: dark)');
  oscuroSistema.addEventListener && oscuroSistema.addEventListener('change', () => { if (leer('birras-tema') === 'auto') ponerTema('auto'); });
  function ponerTema(t) {
    const real = t === 'auto' ? (oscuroSistema.matches ? 'birra' : 'claro') : t;
    if (real === 'birra') delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = real;
    guardar('birras-tema', t);
    const T = TEMAS.find((x) => x[0] === t);
    $('temaTxt').textContent = `${T[1]} · solo cambia en tu móvil`;
    $('temas').innerHTML = TEMAS.map(([k, n, g]) => `<button class="tema pulsable${k === t ? ' on' : ''}" data-tema="${k}" style="background:${g}" aria-label="Tema ${n}"></button>`).join('');
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--noche-t').trim();
  }
  $('temas').addEventListener('click', (e) => { const b = e.target.closest('[data-tema]'); if (b) { ponerTema(b.dataset.tema); vibrar('suave'); sonar('compra'); } });
  ponerTema(TEMAS.some((x) => x[0] === leer('birras-tema')) ? leer('birras-tema') : 'birra');

  /* ================= Tragaperras ================= */
  const ALTO = 92;
  for (let i = 0; i < 3; i++) $('r' + i).innerHTML = `<div>${B.SIMBOLOS[(i * 2) % B.SIMBOLOS.length]}</div>`;
  function girar(r) {
    girando = true;
    $('slotRes').textContent = 'Rodando…';
    sonar('palanca'); vibrar('suave');
    r.forEach((idx, i) => {
      const c = $('r' + i);
      const tiras = Array.from({ length: 24 + i * 6 }, () => B.SIMBOLOS[Math.floor(Math.random() * B.SIMBOLOS.length)]);
      tiras.push(B.SIMBOLOS[idx]);
      c.innerHTML = tiras.map((s) => `<div>${s}</div>`).join('');
      c.style.transition = 'none'; c.style.transform = 'translateY(0)';
      void c.offsetWidth;
      c.style.transition = `transform ${1.2 + i * 0.45}s cubic-bezier(.15,.7,.25,1.04)`;
      c.style.transform = `translateY(-${(tiras.length - 1) * ALTO}px)`;
      setTimeout(() => vibrar('suave'), (1.2 + i * 0.45) * 1000);
    });
    setTimeout(() => {
      girando = false;
      const p = B.premioSlot(r);
      $('slotRes').textContent = p.txt;
      if (p.gordo && !p.castigo) { confeti(160, ['🍺', '🪙', '7️⃣', '💰']); sonar('jackpot'); vibrar('fuerte'); flotante(p.txt.split(' ')[0], p.txt.split(' ').slice(1).join(' ')); }
      else if (p.castigo) { sonar('bronca'); vibrar('fuerte'); flotante('💀', p.txt); temblar(); }
      else if (p.fichas) { sonar('combo'); confeti(30, ['🪙']); }
      else sonar('pierde');
    }, 2300);
  }

  /* ================= Animaciones ================= */
  function animar(efectos, mio) {
    for (const e of efectos) {
      const quien = B.NOMBRES[e.u] || '';
      if (e.k === 'jugador') {
        toast(e.op === 'alta' ? `🪑  ${B.NOMBRES[e.id]} se sienta en la mesa` : '👋  Un jugador se ha levantado de la mesa');
        $('tienda').dataset.h = '';
      } else if (e.k === 'noche') {
        flotante('🌅 Noche cerrada', 'bote a cero'); confeti(80, ['🌅', '🍺']); sonar('jackpot'); pila = []; guardarPila();
      } else if (e.k === 'quita' || e.k === 'corrige') {
        if (!mio) toast(`✏️  ${e.k === 'quita' ? '−1' : '+1'} ${B.TIPOS[e.t].nombre.toLowerCase()} a ${quien}`);
      } else if (e.k === 'bebida') {
        if (mio) { flotante(`+${e.fichas}`, `${B.TIPOS[e.t].ico} al bote`); confeti(e.t === 'cigarro' ? 10 : 26, [B.TIPOS[e.t].ico, '🪙']); destello(); }
        else { toast(`${B.TIPOS[e.t].ico}  ${quien} ha sumado ${B.TIPOS[e.t].un} al bote`); sonar('moneda'); vibrar('suave'); }
      } else if (e.k === 'combo') {
        if (mio) setTimeout(() => { flotante(`Combo x${Math.min(e.n, B.COMBO_MAX)}`, e.n >= 5 ? '¡imparable!' : 'sigue, sigue'); sonar('combo'); vibrar('medio'); }, 550);
        else if (e.n >= 3) toast(`🔥  ${quien} va en combo x${Math.min(e.n, B.COMBO_MAX)}`);
      } else if (e.k === 'racha' && mio) {
        setTimeout(() => flotante('🔥 x2', 'racha caliente'), 950);
      } else if (e.k === 'clasico') {
        if (mio) setTimeout(() => flotante('Combo clásico', 'birra + piti · +15'), 1150); else toast(`🍺🚬  ${quien} hace el combo clásico`);
      } else if (e.k === 'ronda') {
        flotante('¡Ronda!', `${e.n} a la vez · +50 fichas`); confeti(200, ['🍻', '🍺', '🪙']); sonar('jackpot'); vibrar('fuerte');
      } else if (e.k === 'logro') {
        setTimeout(() => { flotante('🏆 ' + e.txt.toLowerCase(), quien); confeti(120, ['🏆', '🍺']); sonar('jackpot'); }, 700);
      } else if (e.k === 'logroGrupo') {
        setTimeout(() => { flotante(`${e.n} birras`, 'el bote está on fire'); confeti(250, ['🍺', '🔥', '🪙']); sonar('jackpot'); vibrar('fuerte'); }, 1000);
      } else if (e.k === 'slot' && !mio) {
        if (e.p.gordo) toast(`🎰  ${quien}: ${e.r.map((i) => B.SIMBOLOS[i]).join('')} ${e.p.txt}`);
      } else if (e.k === 'doble') {
        if (mio) {
          if (e.gana) { flotante('¡Doblado!', `${e.antes} → ${e.antes * 2}`); confeti(200, ['💰', '🪙']); sonar('jackpot'); vibrar('fuerte'); }
          else { flotante('💸 Arruinado', `adiós ${e.antes} fichas`); sonar('pierde'); temblar(); vibrar('fuerte'); }
        } else toast(e.gana ? `💰  ${quien} ha doblado ${e.antes} fichas` : `💸  ${quien} lo ha perdido todo`);
      } else if (e.k === 'pw') {
        const P = B.TIENDA[e.p];
        if (e.p === 'happy') { flotante('Happy Hour', 'fichas x2 · 15 min'); confeti(120, ['⏰', '🍺']); sonar('jackpot'); }
        else if (e.p === 'diana') { toast(`🎯  ${quien} apunta a ${B.NOMBRES[e.obj]}`); temblar(); }
        else if (mio) flotante(P.ico, P.nombre);
        else toast(`${P.ico}  ${quien} activa ${P.nombre}`);
      }
    }
  }

  function flotante(t, sub) {
    const d = document.createElement('div');
    d.className = 'flotante';
    d.innerHTML = `${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1800);
  }
  function toast(t) {
    const d = document.createElement('div');
    d.className = 'toast glass'; d.textContent = t;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3700);
  }
  function onda(b, e) {
    const r = b.getBoundingClientRect(), o = document.createElement('span');
    const s = Math.max(r.width, r.height) / 2;
    o.className = 'onda';
    o.style.cssText = `width:${s}px;height:${s}px;left:${(e.clientX || r.left + r.width / 2) - r.left - s / 2}px;top:${(e.clientY || r.top + r.height / 2) - r.top - s / 2}px`;
    b.appendChild(o); setTimeout(() => o.remove(), 650);
  }
  function destello() { const d = document.createElement('div'); d.className = 'destello'; document.body.appendChild(d); setTimeout(() => d.remove(), 750); }
  function temblar() { const a = $('app'); a.classList.remove('temblor'); void a.offsetWidth; a.classList.add('temblor'); }
  function vibrar(tipo) {
    try {
      if (CAP && CAP.Haptics) {
        if (tipo === 'fuerte') CAP.Haptics.notification({ type: 'WARNING' });
        else CAP.Haptics.impact({ style: tipo === 'suave' ? 'LIGHT' : 'MEDIUM' });
      } else if (navigator.vibrate) navigator.vibrate(tipo === 'fuerte' ? [200, 80, 200, 80, 400] : tipo === 'medio' ? 35 : 12);
    } catch (e) { /* nada */ }
  }
  function notificar(t, b) {
    try { if (hayNotis && Notification.permission === 'granted') new Notification(t, { body: b }); } catch (e) { /* nada */ }
  }

  /* Confeti de emojis */
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lienzo = $('lienzo'), ctx = lienzo.getContext('2d');
  let parts = [], animando = false;
  function ajustar(c) { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; }
  function confeti(n, emojis) {
    if (reducido) n = Math.min(n, 12);
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < n; i++) {
      parts.push({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .42, vx: (Math.random() - .5) * 14, vy: -Math.random() * 16 - 4,
        r: Math.random() * 6, vr: (Math.random() - .5) * .3, s: 18 + Math.random() * 22, e: emojis[i % emojis.length], v: 0 });
    }
    if (!animando) { animando = true; requestAnimationFrame(paso); }
  }
  function paso() {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.y < innerHeight + 60 && p.v < 260);
    for (const p of parts) {
      p.vy += .45; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.r += p.vr; p.v++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.font = `${p.s}px serif`; ctx.fillText(p.e, -p.s / 2, p.s / 2); ctx.restore();
    }
    if (parts.length) requestAnimationFrame(paso); else { animando = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /* Burbujas de fondo (como el gas de una caña) */
  const bc = $('burbujas'), bx = bc.getContext('2d');
  const burbujas = Array.from({ length: reducido ? 0 : 36 }, () => nueva(true));
  function nueva(ini) { return { x: Math.random(), y: ini ? Math.random() : 1.05, r: 1.5 + Math.random() * 4.5, v: .0006 + Math.random() * .0016, w: Math.random() * 6.28 }; }
  function burbujear() {
    const W = innerWidth, H = innerHeight;
    bx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    bx.clearRect(0, 0, W, H);
    for (const b of burbujas) {
      b.y -= b.v; b.w += .03;
      if (b.y < -0.05) Object.assign(b, nueva(false));
      const x = b.x * W + Math.sin(b.w) * 6, y = b.y * H;
      bx.beginPath(); bx.arc(x, y, b.r, 0, 6.29);
      bx.fillStyle = 'rgba(255,240,210,.10)'; bx.fill();
      bx.strokeStyle = 'rgba(255,250,235,.45)'; bx.lineWidth = .8; bx.stroke();
      bx.beginPath(); bx.arc(x - b.r * .35, y - b.r * .35, b.r * .3, 0, 6.29); bx.fillStyle = 'rgba(255,255,255,.7)'; bx.fill();
    }
    if (!document.hidden) requestAnimationFrame(burbujear);
  }
  const redimensionar = () => { ajustar(lienzo); ajustar(bc); };
  addEventListener('resize', redimensionar); redimensionar();
  if (burbujas.length) requestAnimationFrame(burbujear);

  /* ================= Sonido sintetizado ================= */
  let ac = null;
  function desbloquearAudio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* nada */ } } if (ac && ac.state === 'suspended') ac.resume(); }
  function nota(f, t0, dur, tipo = 'sine', vol = .1) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, ac.currentTime + t0);
    g.gain.setValueAtTime(0, ac.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol, ac.currentTime + t0 + .01);
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t0 + dur);
    o.connect(g).connect(ac.destination); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + .02);
  }
  function sonar(k) {
    if (!sonido || !ac) return;
    if (k === 'moneda') { nota(1175, 0, .09, 'triangle', .12); nota(1568, .07, .3, 'triangle', .12); }
    else if (k === 'combo') [659, 784, 988, 1319].forEach((f, i) => nota(f, i * .07, .22, 'triangle'));
    else if (k === 'jackpot') [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => nota(f, i * .09, .35, 'triangle', .14));
    else if (k === 'compra') { nota(784, 0, .12, 'sine', .14); nota(1175, .1, .25, 'sine', .14); }
    else if (k === 'palanca') for (let i = 0; i < 14; i++) nota(420 + (i % 2) * 90, i * .1, .05, 'square', .035);
    else if (k === 'pierde') [392, 370, 349, 262].forEach((f, i) => nota(f, i * .18, .28, 'sawtooth', .06));
    else if (k === 'bronca') for (let i = 0; i < 4; i++) nota(i % 2 ? 220 : 175, i * .22, .2, 'sawtooth', .12);
  }

  /* ================= Arranque ================= */
  /* Puente para los módulos nuevos (diario): lo que necesitan del resto de la app. */
  window.BirrasApp = {
    toast, preguntar, vibrar, sonar, flotante, confeti, irA,
    yo: () => yo,
    boteActivo: () => !!(S && B.USERS.some((u) => ahora() - Math.max(S.users[u].ultEv || 0, S.users[u].ultBebida || 0) < 6 * 3600)),
    sumarAlBote: () => { if (!yo) return; apuntar(yo, 'cerveza', 1); sonar('moneda'); vibrar('medio'); },
  };

  /* ================= Pantalla principal personalizable =================
   * Cada bloque del Bote es un módulo: se puede subir, bajar (o arrastrar) y ocultar.
   * El orden se guarda en este móvil (cada uno se lo monta a su gusto). */
  const vistaBote = document.querySelector('[data-vista="bote"]');
  const MODULOS = [...vistaBote.querySelectorAll('.modulo')].map((m) => m.dataset.modulo);
  let prefs = { orden: MODULOS.slice(), ocultos: [] };
  try { const g = JSON.parse(leer('birras-modulos') || 'null'); if (g && Array.isArray(g.orden)) prefs = { orden: g.orden, ocultos: g.ocultos || [] }; } catch (e) { /* por defecto */ }
  const guardarPrefs = () => guardar('birras-modulos', JSON.stringify(prefs));
  function aplicarModulos() {
    const orden = [...prefs.orden.filter((m) => MODULOS.includes(m)), ...MODULOS.filter((m) => !prefs.orden.includes(m))];
    prefs.orden = orden;
    const fin = $('personalizar');
    for (const id of orden) {
      const el = vistaBote.querySelector(`[data-modulo="${id}"]`);
      vistaBote.insertBefore(el, fin);
      el.classList.toggle('oculto', prefs.ocultos.includes(id));
      const barra = el.querySelector('.mod-barra');
      if (barra) barra.querySelector('.mod-ojo').textContent = prefs.ocultos.includes(id) ? 'Mostrar' : 'Ocultar';
    }
  }
  function editarModulos(on) {
    vistaBote.classList.toggle('editando', on);
    $('personalizar').textContent = on ? '✓ Listo' : '✥ Personalizar esta pantalla';
    vistaBote.querySelectorAll('.mod-barra').forEach((b) => b.remove());
    $('restablecer') && $('restablecer').remove();
    if (on) {
      vistaBote.querySelectorAll('.modulo').forEach((el) => {
        el.insertAdjacentHTML('afterbegin', `<div class="mod-barra"><span class="mod-asa" aria-hidden="true">⠿</span><b>${el.dataset.nombre}</b>
          <button class="mod-b" data-mod="subir" aria-label="Subir">↑</button><button class="mod-b" data-mod="bajar" aria-label="Bajar">↓</button><button class="mod-b mod-ojo" data-mod="ojo"></button></div>`);
      });
      $('personalizar').insertAdjacentHTML('afterend', '<button class="txt-btn" id="restablecer" style="justify-self:center">Volver al orden original</button>');
      $('restablecer').onclick = () => { prefs = { orden: MODULOS.slice(), ocultos: [] }; guardarPrefs(); aplicarModulos(); vibrar('medio'); };
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    aplicarModulos();
  }
  $('personalizar').onclick = () => { editarModulos(!vistaBote.classList.contains('editando')); vibrar('medio'); };
  vistaBote.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mod]');
    if (!b) { if (vistaBote.classList.contains('editando') && e.target.closest('.modulo')) { e.preventDefault(); e.stopPropagation(); } return; }
    e.stopPropagation();
    const id = b.closest('.modulo').dataset.modulo, i = prefs.orden.indexOf(id);
    if (b.dataset.mod === 'subir' && i > 0) [prefs.orden[i - 1], prefs.orden[i]] = [prefs.orden[i], prefs.orden[i - 1]];
    else if (b.dataset.mod === 'bajar' && i < prefs.orden.length - 1) [prefs.orden[i + 1], prefs.orden[i]] = [prefs.orden[i], prefs.orden[i + 1]];
    else if (b.dataset.mod === 'ojo') prefs.ocultos = prefs.ocultos.includes(id) ? prefs.ocultos.filter((x) => x !== id) : [...prefs.ocultos, id];
    guardarPrefs(); aplicarModulos(); vibrar('suave');
    b.closest('.modulo').animate([{ transform: 'scale(.97)' }, { transform: 'none' }], { duration: 250, easing: 'ease-out' });
  }, true);
  // Arrastrar desde el asa ⠿
  let arrastre = null;
  vistaBote.addEventListener('pointerdown', (e) => {
    const asa = e.target.closest('.mod-asa'); if (!asa) return;
    const el = asa.closest('.modulo');
    arrastre = { el, y: e.clientY }; el.classList.add('arrastrando'); asa.setPointerCapture(e.pointerId); e.preventDefault();
  });
  vistaBote.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    const { el } = arrastre;
    el.style.transform = `translateY(${e.clientY - arrastre.y}px)`;
    const hermanos = [...vistaBote.querySelectorAll('.modulo')].filter((x) => x !== el);
    for (const h of hermanos) {
      const r = h.getBoundingClientRect(), medio = r.top + r.height / 2;
      const antes = el.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_PRECEDING;
      if (antes && e.clientY < medio) { const r0 = el.getBoundingClientRect().top; vistaBote.insertBefore(el, h); arrastre.y += el.getBoundingClientRect().top - r0; el.style.transform = `translateY(${e.clientY - arrastre.y}px)`; vibrar('suave'); break; }
      if (!antes && e.clientY > medio) { const r0 = el.getBoundingClientRect().top; vistaBote.insertBefore(el, h.nextSibling); arrastre.y += el.getBoundingClientRect().top - r0; el.style.transform = `translateY(${e.clientY - arrastre.y}px)`; vibrar('suave'); break; }
    }
  });
  const soltar = () => {
    if (!arrastre) return;
    arrastre.el.style.transform = ''; arrastre.el.classList.remove('arrastrando'); arrastre = null;
    prefs.orden = [...vistaBote.querySelectorAll('.modulo')].map((m) => m.dataset.modulo); guardarPrefs();
  };
  vistaBote.addEventListener('pointerup', soltar); vistaBote.addEventListener('pointercancel', soltar);
  aplicarModulos();

  irA(['bote', 'casino', 'noche', 'mesa'].includes(leer('birras-tab')) ? leer('birras-tab') : 'bote');
  if (!yo || !B.USERS.includes(yo)) { yo = null; pedirSilla(); }
  cargar();
  setTimeout(() => $('capaCarga').classList.add('fuera'), 2500);   // el diario no depende de la red
  setInterval(tic, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (burbujas.length) requestAnimationFrame(burbujear);
      if (!es || es.readyState === 2) cargar();
    }
  });
})();
