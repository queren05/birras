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
  let ultimoMio = null;          // última bebida apuntada desde este móvil (para deshacer)
  let broncaHasta = 0, yaAvisado = false, dianaVista = 0, megaAntes = null, dianaAbierta = false, girando = false;

  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  const ahora = () => Date.now() / 1000 + desfase;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hora = (t) => new Date(t * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const inicial = (u) => B.NOMBRES[u][0];

  /* ================= Red ================= */
  async function publicar(d) {
    d.eid = Math.random().toString(36).slice(2, 10);
    misEids.add(d.eid);
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(URL_TOPIC, { method: 'POST', body: JSON.stringify(d) });
        if (r.ok) return true;
        if (r.status === 429) { toast('Demasiadas jugadas seguidas. Espera un momento.'); return false; }
      } catch (e) { /* reintenta */ }
      await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
    }
    toast('Sin conexión: no se ha apuntado. Vuelve a darle.');
    return false;
  }

  async function cargar() {
    try {
      const r = await fetch(`${URL_TOPIC}/json?poll=1&since=all`, { cache: 'no-store' });
      const ms = (await r.text()).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
      for (const m of ms) if (m.event === 'message') {
        ultimoId = m.id;
        const p = B.parsear(m);
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
    es.onerror = () => estadoConexion(false);
    es.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.event === 'open') { desfase = m.time - Date.now() / 1000; return; }
      if (m.event !== 'message') return;
      ultimoId = m.id;
      const p = B.parsear(m);
      if (!p) return;
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
      if (mio && ahora() - ultSnap > 2 * 3600) publicar({ k: 'snap', s: S });
    };
  }

  function estadoConexion(ok) {
    const el = $('conexion');
    el.textContent = ok ? 'En directo con la mesa' : 'Sin conexión, reintentando…';
    el.className = 'conexion ' + (ok ? 'ok' : 'mal');
  }

  /* ================= Pintar ================= */
  function pintar() {
    if (!S) return;
    const now = ahora();
    const tot = (t) => B.totalGrupo(S, t);

    // Bote
    const cerv = tot('cerveza');
    const mega = $('mega');
    mega.textContent = cerv;
    if (megaAntes !== null && cerv > megaAntes) { mega.classList.remove('salta'); void mega.offsetWidth; mega.classList.add('salta'); }
    megaAntes = cerv;
    $('megaL').textContent = cerv === 1 ? 'cerveza' : 'cervezas';
    $('tCubata').textContent = tot('cubata');
    $('tChupito').textContent = tot('chupito');
    $('tCigarro').textContent = tot('cigarro');
    const aporte = (u) => Object.values(S.users[u].c).reduce((a, b) => a + b, 0);
    const todo = B.USERS.reduce((n, u) => n + aporte(u), 0);
    $('barraRep').innerHTML = todo ? B.USERS.map((u) => `<i class="c-${u}" style="width:${aporte(u) / todo * 100}%"></i>`).join('') : '';
    $('leyenda').innerHTML = B.USERS.map((u) => `<span><i class="c-${u}"></i>${B.NOMBRES[u]} ${aporte(u)}</span>`).join('');

    // Ranking
    const orden = B.USERS.slice().sort((a, b) => aporte(b) - aporte(a) || S.users[b].fichas - S.users[a].fichas);
    const secos = new Set(B.secos(S, now).map((x) => x.u));
    $('ranking').innerHTML = orden.map((u, i) => {
      const U = S.users[u], seg = Math.max(0, now - U.ultCerveza);
      return `<div class="persona glass${u === yo ? ' yo' : ''}${secos.has(u) ? ' seco' : ''}">
        <span class="av ${u}">${inicial(u)}</span>
        <div><div class="nom">${B.NOMBRES[u]}<span class="pos">${['🥇', '🥈', '🥉'][i] || ''}</span></div>
          <div class="det num"><span>🍺 ${U.c.cerveza}</span><span>🥃 ${U.c.cubata}</span><span>🥂 ${U.c.chupito}</span><span>🚬 ${U.c.cigarro}</span></div>
          <div class="hace${secos.has(u) ? ' mal' : ''}">${secos.has(u) ? 'Seco desde hace ' : 'Última cerveza hace '}${B.horasTexto(seg)} · ${U.fichas} fichas${U.castigos ? ` · 💀 ${U.castigos}` : ''}</div>
        </div>
        <div class="tot num">${aporte(u)}<small>al bote</small></div>
      </div>`;
    }).join('');

    // Jugadas
    const fila = (f) => `<div class="jugada"><span class="e">${f.ico}</span><span class="t">${esc(f.txt)}</span><span class="h">${hora(f.t)}</span></div>`;
    const vacio = '<div class="vacio">El bote está a cero. Alguien tendrá que estrenarlo.</div>';
    $('feedCorto').innerHTML = S.feed.slice(0, 4).map(fila).join('') || vacio;
    $('feedLargo').innerHTML = S.feed.map(fila).join('') || vacio;

    // Lo mío
    if (!yo || !S.users[yo]) return;
    const U = S.users[yo];
    $('yoAv').textContent = inicial(yo); $('yoAv').className = 'av ' + yo;
    $('yoNom').textContent = B.NOMBRES[yo];
    $('cambiarTxt').textContent = `Ahora eres ${B.NOMBRES[yo]}`;
    $('misFichas').textContent = U.fichas;
    const enCombo = now - U.ultBebida <= B.COMBO_VENTANA && U.combo >= 1;
    const sigMult = enCombo ? Math.min(U.combo + 1, B.COMBO_MAX) : 1;
    $('fCerveza').textContent = `+${10 * sigMult * (now < S.happy ? 2 : 1) * (U.racha ? 2 : 1)} fichas${sigMult > 1 ? ` · combo x${sigMult}` : ''}`;
    $('pills').innerHTML = [
      enCombo && U.combo >= 2 ? `<span class="pill combo">Combo x${Math.min(U.combo, B.COMBO_MAX)} · ${Math.ceil((B.COMBO_VENTANA - (now - U.ultBebida)) / 60)} min</span>` : '',
      U.racha ? `<span class="pill racha">🔥 x2 · ${U.racha}</span>` : '',
      now < S.happy ? `<span class="pill happy">Happy Hour ${Math.ceil((S.happy - now) / 60)} min</span>` : '',
      now < U.escudo ? `<span class="pill">🛡️ ${Math.ceil((U.escudo - now) / 60)} min</span>` : '',
    ].join('');
    $('palanca').disabled = U.fichas < B.SLOT_COSTE;
    $('doble').disabled = U.fichas < 20;
    $('dobleTxt').textContent = U.fichas >= 20 ? `Te juegas tus ${U.fichas} fichas. La casa gana el 53 % de las veces.` : 'Necesitas al menos 20 fichas para arruinarte.';
    $('deshacer').hidden = !ultimoMio;
    if (ultimoMio) $('deshacer').textContent = `↩︎ Deshacer ${B.TIPOS[ultimoMio].un}`;
    pintarTienda(U);
  }

  function pintarTienda(U) {
    const html = Object.entries(B.TIENDA).map(([k, P]) =>
      `<button class="pw glass pulsable" data-pw="${k}" ${U.fichas < P.coste ? 'disabled' : ''}><span class="e">${P.ico}</span><b>${P.nombre}</b><span>${P.desc}</span><span class="c">${P.coste} fichas</span></button>`).join('') +
      `<div class="dianas${dianaAbierta ? ' on' : ''}">${B.USERS.filter((u) => u !== yo).map((u) => `<button class="pulsable" data-diana="${u}"><span class="av ${u}">${inicial(u)}</span>${B.NOMBRES[u]}</button>`).join('')}</div>`;
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
        dianaVista = S.diana.t;
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
      sonar('moneda'); vibrar('medio');
      ultimoMio = b.dataset.tipo;
      publicar({ k: 'ev', u: yo, t: b.dataset.tipo, n: 1 });
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
    window.scrollTo({ top: 0 });
  }

  $('deshacer').onclick = () => {
    if (!yo || !ultimoMio || !S.users[yo].c[ultimoMio]) return;
    if (!confirm(`¿Quitar ${B.TIPOS[ultimoMio].un} del bote? Cobarde.`)) return;
    publicar({ k: 'ev', u: yo, t: ultimoMio, n: -1 });
    ultimoMio = null; pintar();
  };
  $('palanca').onclick = () => {
    if (!yo || !S || S.users[yo].fichas < B.SLOT_COSTE || girando) return;
    const r = B.tirarSlot();
    publicar({ k: 'slot', u: yo, r });
    girar(r);
  };
  $('doble').onclick = () => {
    if (!yo || !S) return;
    const f = S.users[yo].fichas;
    if (f < 20 || !confirm(`¿Te juegas tus ${f} fichas a doble o nada?`)) return;
    publicar({ k: 'doble', u: yo, gana: Math.random() < 0.47 });
  };
  $('broncaYa').onclick = () => { $('capaBronca').classList.remove('on'); ultimoMio = 'cerveza'; publicar({ k: 'ev', u: yo, t: 'cerveza', n: 1 }); sonar('moneda'); vibrar('medio'); };
  $('broncaLuego').onclick = () => { $('capaBronca').classList.remove('on'); broncaHasta = ahora() + 300; };
  $('yoBtn').onclick = pedirSilla;
  $('cambiarBtn').onclick = pedirSilla;
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

  function pedirSilla() {
    $('sillas').innerHTML = B.USERS.map((u) => {
      const U = S && S.users[u];
      const n = U ? Object.values(U.c).reduce((a, b) => a + b, 0) : 0;
      return `<button class="silla pulsable" data-silla="${u}"><span class="av ${u}">${inicial(u)}</span><b>${B.NOMBRES[u]}</b><span>${n} al bote</span></button>`;
    }).join('');
    $('capaEntrar').classList.add('on');
  }
  $('sillas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-silla]');
    if (!b) return;
    yo = b.dataset.silla; guardar('birras-yo', yo);
    $('capaEntrar').classList.remove('on');
    $('tienda').dataset.h = '';
    pintar();
    flotante(`Hola, ${B.NOMBRES[yo]}`, 'hagan juego');
    desbloquearAudio(); sonar('compra'); vibrar('medio');
  });

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
      if (e.k === 'bebida') {
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
  irA(['bote', 'casino', 'mesa'].includes(leer('birras-tab')) ? leer('birras-tab') : 'bote');
  if (!yo || !B.USERS.includes(yo)) { yo = null; pedirSilla(); }
  cargar();
  setInterval(tic, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (burbujas.length) requestAnimationFrame(burbujear);
      if (!es || es.readyState === 2) cargar();
    }
  });
})();
