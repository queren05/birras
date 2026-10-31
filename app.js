(() => {
  'use strict';
  const B = window.Birras;
  const $ = (id) => document.getElementById(id);
  const URL_TOPIC = `${B.NTFY}/${B.TOPIC}`;

  let S = null;            // estado actual
  let yo = leer('birras-yo');
  let sonido = leer('birras-sonido') !== 'no';
  let desfase = 0;         // hora del servidor de ntfy - hora del móvil
  let ultSnap = 0;         // hora del último snapshot visto
  let ultimoId = null;
  let es = null;
  const misEids = new Set();
  let broncaHasta = 0;     // "déjame 5 minutos"
  let yaAvisado = false;
  let dianaVista = 0;

  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  const ahora = () => Date.now() / 1000 + desfase;

  /* ---------------- Red ---------------- */
  async function publicar(d) {
    d.eid = Math.random().toString(36).slice(2, 10);
    misEids.add(d.eid);
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(URL_TOPIC, { method: 'POST', body: JSON.stringify(d) });
        if (r.ok) return true;
        if (r.status === 429) { toast('⚠️ Demasiadas jugadas seguidas, espera un poco.'); return false; }
      } catch (e) { /* reintenta */ }
      await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
    }
    toast('⚠️ Sin conexión: no se ha apuntado. Vuelve a darle.');
    return false;
  }

  async function cargar() {
    try {
      const r = await fetch(`${URL_TOPIC}/json?poll=1&since=all`);
      const txt = await r.text();
      const ms = txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
      for (const m of ms) {
        if (m.event === 'message') {
          ultimoId = m.id;
          const p = B.parsear(m);
          if (p && p.d.k === 'snap') ultSnap = Math.max(ultSnap, m.time);
        }
      }
      const nuevo = B.reconstruir(ms, null);
      if (nuevo) S = nuevo;
      else if (!S) S = null;
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
        if (!S || p.d.s.upto > S.upto + 5) { S = B.clon(p.d.s); pintar(); }
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
    el.textContent = ok ? '● En directo con la mesa' : '● Sin conexión, reintentando…';
    el.classList.toggle('mal', !ok);
  }

  /* ---------------- Pintar ---------------- */
  function pintar() {
    if (!S) { $('subbote').textContent = 'Abriendo el casino…'; return; }
    const tot = B.totalGrupo(S);
    $('odometro').innerHTML = String(tot).padStart(3, '0').split('').map((c) => `<span>${c}</span>`).join('');
    const sub = ['cubata', 'chupito', 'cigarro'].map((t) => { const n = B.totalGrupo(S, t); return `<b>${n}</b> ${(n === 1 ? B.TIPOS[t].nombre : B.TIPOS[t].plural).toLowerCase()}`; });
    $('subbote').innerHTML = sub.join(' · ');

    const orden = B.USERS.slice().sort((a, b) => S.users[b].c.cerveza - S.users[a].c.cerveza || S.users[b].fichas - S.users[a].fichas);
    const now = ahora();
    const secos = new Set(B.secos(S, now).map((x) => x.u));
    $('ranking').innerHTML = orden.map((u, i) => {
      const U = S.users[u], seg = now - U.ultCerveza;
      return `<div class="fila${u === yo ? ' yo' : ''}${secos.has(u) ? ' seco' : ''}">
        <div class="puesto">${['👑', '2', '3'][i]}</div>
        <div class="quien"><b>${B.NOMBRES[u]}</b>
          <div class="det num"><span>🥃 ${U.c.cubata}</span><span>🥂 ${U.c.chupito}</span><span>🚬 ${U.c.cigarro}</span><span>💰 ${U.fichas}</span>${U.castigos ? `<span>💀 ${U.castigos}</span>` : ''}</div>
          <div class="hace${secos.has(u) ? ' mal' : ''}">${secos.has(u) ? '⚠️ SECO desde hace ' : 'Última birra hace '}${B.horasTexto(Math.max(0, seg))}</div>
        </div>
        <div class="tot num">${U.c.cerveza}<small>birras</small></div>
      </div>`;
    }).join('');
    $('rondas').textContent = S.rondas ? `${S.rondas} ronda${S.rondas > 1 ? 's' : ''} completa${S.rondas > 1 ? 's' : ''}` : '';

    $('feed').innerHTML = S.feed.map((f) => `<li><span>${f.ico}</span><span>${esc(f.txt)}</span><span class="h">${hora(f.t)}</span></li>`).join('') || '<li>Aún no ha pasado nada. Qué triste.</li>';

    if (!yo || !S.users[yo]) return;
    const U = S.users[yo];
    $('yoChip').textContent = `${B.NOMBRES[yo]} · cambiar`;
    $('mesaTitulo').textContent = `La mesa de ${B.NOMBRES[yo]}`;
    $('mesaPuesto').textContent = `${orden.indexOf(yo) + 1}º de 3`;
    $('misFichas').textContent = U.fichas;
    $('nCerveza').textContent = U.c.cerveza;
    $('nCubata').textContent = U.c.cubata;
    $('nChupito').textContent = U.c.chupito;
    $('nCigarro').textContent = U.c.cigarro;
    const enCombo = now - U.ultBebida <= B.COMBO_VENTANA && U.combo >= 2;
    $('pills').innerHTML = [
      enCombo ? `<span class="pill combo">COMBO x${Math.min(U.combo, B.COMBO_MAX)} · ${Math.ceil((B.COMBO_VENTANA - (now - U.ultBebida)) / 60)} min</span>` : '',
      U.racha ? `<span class="pill fuego">🔥 Racha ×2 (${U.racha})</span>` : '',
      now < S.happy ? `<span class="pill happy">⏰ HAPPY HOUR ${Math.ceil((S.happy - now) / 60)} min</span>` : '',
      now < U.escudo ? `<span class="pill">🛡️ ${Math.ceil((U.escudo - now) / 60)} min</span>` : '',
    ].join('');
    $('palanca').disabled = U.fichas < B.SLOT_COSTE;
    $('doble').disabled = U.fichas < 20;
    $('doble').textContent = U.fichas >= 20 ? `DOBLE O NADA · te juegas ${U.fichas} fichas` : 'DOBLE O NADA · necesitas 20 fichas';
    pintarTienda(U);
  }

  function pintarTienda(U) {
    const html = Object.entries(B.TIENDA).map(([k, P]) =>
      `<button class="pw" data-pw="${k}" ${U.fichas < P.coste ? 'disabled' : ''}><span class="t">${P.ico} ${P.nombre}</span><span class="d">${P.desc}</span><span class="c">${P.coste} fichas</span></button>`).join('') +
      `<div class="dianas${dianaAbierta ? ' on' : ''}" id="dianas">${B.USERS.filter((u) => u !== yo).map((u) => `<button data-diana="${u}">🎯 ${B.NOMBRES[u]}</button>`).join('')}</div>`;
    if ($('tienda').dataset.h !== html) { $('tienda').innerHTML = html; $('tienda').dataset.h = html; }
  }
  let dianaAbierta = false;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hora = (t) => new Date(t * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  /* ---------------- Reloj de la vergüenza ---------------- */
  function tic() {
    if (!S) return;
    const now = ahora();
    const secos = B.secos(S, now);
    const semilla = Math.floor(now / 12);
    if (secos.length) {
      $('teletipo').classList.add('on');
      const txt = secos.map((x, i) => B.insulto(x.u, x.seg, semilla + i * 7)).join('   ✦   ');
      if ($('teletipoTxt').textContent !== txt) $('teletipoTxt').textContent = txt;
    } else $('teletipo').classList.remove('on');

    if (yo && S.users[yo]) {
      const U = S.users[yo], seg = Math.max(0, now - U.ultCerveza);
      $('relojTxt').textContent = seg > B.HORA_SECA ? `Llevas ${B.horasTexto(seg)} sin cerveza. Inaceptable.` : `Última cerveza hace ${B.horasTexto(seg)} · insultos en ${B.horasTexto(B.HORA_SECA - seg)}`;
      $('relojBarra').style.width = Math.min(100, seg / B.HORA_SECA * 100) + '%';
      const meToca = secos.find((x) => x.u === yo);
      if (meToca && now > broncaHasta) {
        $('broncaFrase').textContent = B.insulto(yo, meToca.seg, semilla);
        if (!$('capaBronca').classList.contains('on')) {
          $('capaBronca').classList.add('on'); sonar('bronca'); vibrar([300, 100, 300, 100, 600]);
          if (!yaAvisado) { notificar('🍺 BEBE', B.insulto(yo, meToca.seg, semilla)); yaAvisado = true; }
        }
      } else if (!meToca) { $('capaBronca').classList.remove('on'); yaAvisado = false; }
      if (S.diana && S.diana.u === yo && S.diana.t > dianaVista && now - S.diana.t < 180) {
        dianaVista = S.diana.t;
        $('broncaT').textContent = '🎯 BEBE';
        $('broncaFrase').textContent = `${B.NOMBRES[S.diana.por]} te ha puesto en la diana. Bebe YA, ${B.NOMBRES[yo]}.`;
        $('capaBronca').classList.add('on'); sonar('bronca'); vibrar([500, 200, 500]);
        notificar('🎯 Te han apuntado', `${B.NOMBRES[S.diana.por]} dice que bebas YA.`);
      }
    }
    if (Math.floor(now) % 15 === 0) pintar();
  }

  /* ---------------- Acciones ---------------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    desbloquearAudio();
    if (b.dataset.tipo) {
      if (!yo) return pedirSilla();
      b.classList.remove('temblor'); void b.offsetWidth; b.classList.add('temblor');
      sonar('moneda'); vibrar(30);
      publicar({ k: 'ev', u: yo, t: b.dataset.tipo, n: 1 });
    } else if (b.dataset.quitar) {
      if (!yo) return;
      const t = b.dataset.quitar;
      if (S.users[yo].c[t] > 0 && confirm(`¿Quitar ${B.TIPOS[t].un}? Cobarde.`)) publicar({ k: 'ev', u: yo, t, n: -1 });
    } else if (b.dataset.pw) {
      if (!yo) return pedirSilla();
      const p = b.dataset.pw;
      if (p === 'diana') { dianaAbierta = !dianaAbierta; $('tienda').dataset.h = ''; pintar(); return; }
      publicar({ k: 'pw', u: yo, p }); sonar('compra');
    } else if (b.dataset.diana) {
      dianaAbierta = false; publicar({ k: 'pw', u: yo, p: 'diana', obj: b.dataset.diana }); sonar('compra');
    }
  });

  $('palanca').onclick = () => {
    if (!yo || !S || S.users[yo].fichas < B.SLOT_COSTE || girando) return;
    const r = B.tirarSlot();
    publicar({ k: 'slot', u: yo, r });
    girar(r);
  };
  $('doble').onclick = () => {
    if (!yo || !S) return;
    const f = S.users[yo].fichas;
    if (f < 20 || !confirm(`¿Te juegas tus ${f} fichas a doble o nada? La casa tiene un 53 % de ganar.`)) return;
    publicar({ k: 'doble', u: yo, gana: Math.random() < 0.47 });
  };
  $('broncaYa').onclick = () => { $('capaBronca').classList.remove('on'); $('broncaT').textContent = 'BEBE'; publicar({ k: 'ev', u: yo, t: 'cerveza', n: 1 }); sonar('moneda'); };
  $('broncaLuego').onclick = () => { $('capaBronca').classList.remove('on'); $('broncaT').textContent = 'BEBE'; broncaHasta = ahora() + 300; };
  $('yoChip').onclick = pedirSilla;
  $('sonidoBtn').onclick = () => { sonido = !sonido; guardar('birras-sonido', sonido ? 'si' : 'no'); $('sonidoBtn').textContent = `Sonido: ${sonido ? 'sí' : 'no'}`; };
  $('sonidoBtn').textContent = `Sonido: ${sonido ? 'sí' : 'no'}`;
  $('avisosBtn').onclick = async () => {
    if (!('Notification' in window)) return toast('Este navegador no deja mandar avisos.');
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? '✅ Avisos activados (con la web abierta).' : 'Avisos rechazados. Tú sabrás.');
  };
  const aLink = $('avisosLink');
  aLink.href = `${B.NTFY}/${B.TOPIC_AVISOS}`; aLink.textContent = B.TOPIC_AVISOS;

  function pedirSilla() {
    $('sillas').innerHTML = B.USERS.map((u) => {
      const U = S && S.users[u];
      return `<button class="silla" data-silla="${u}"><span>${{ jorlo: '👑', alvaro: '🃏', david: '🎲' }[u]}</span><span>${B.NOMBRES[u]}</span><small>${U ? U.c.cerveza + ' 🍺' : ''}</small></button>`;
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
    flotante(`HOLA ${B.NOMBRES[yo].toUpperCase()}`, 'hagan juego');
    desbloquearAudio(); sonar('compra');
  });

  /* ---------------- Tragaperras ---------------- */
  let girando = false;
  const ALTO = 86;
  function prepararRodillos() {
    for (let i = 0; i < 3; i++) {
      const c = $('r' + i);
      c.innerHTML = Array.from({ length: 30 }, (_, k) => `<div>${B.SIMBOLOS[(k + i * 2) % B.SIMBOLOS.length]}</div>`).join('');
    }
  }
  function girar(r) {
    girando = true;
    $('slotRes').textContent = 'Rodando…';
    sonar('palanca');
    r.forEach((idx, i) => {
      const c = $('r' + i);
      const tiras = Array.from({ length: 24 + i * 6 }, () => B.SIMBOLOS[Math.floor(Math.random() * B.SIMBOLOS.length)]);
      tiras.push(B.SIMBOLOS[idx]);
      c.innerHTML = tiras.map((s) => `<div>${s}</div>`).join('');
      c.style.transition = 'none'; c.style.transform = 'translateY(0)';
      void c.offsetWidth;
      c.style.transition = `transform ${1.2 + i * 0.45}s cubic-bezier(.15,.7,.25,1.04)`;
      c.style.transform = `translateY(-${(tiras.length - 1) * ALTO}px)`;
    });
    setTimeout(() => {
      girando = false;
      const p = B.premioSlot(r);
      $('slotRes').textContent = p.txt;
      if (p.gordo && !p.castigo) { confeti(160, ['🍺', '🪙', '7️⃣', '💰']); sonar('jackpot'); flotante(p.txt.split(' ')[0], p.txt.split(' ').slice(1).join(' ')); }
      else if (p.castigo) { sonar('bronca'); flotante('💀 CASTIGO', p.txt); temblar(); }
      else if (p.fichas) { sonar('combo'); confeti(30, ['🪙']); }
      else sonar('pierde');
    }, 2300);
  }

  /* ---------------- Animaciones ---------------- */
  function animar(efectos, mio) {
    for (const e of efectos) {
      const quien = B.NOMBRES[e.u] || '';
      if (e.k === 'bebida') {
        if (mio) { flotante(`+${e.fichas}`, `${B.TIPOS[e.t].ico} fichas`); confeti(e.t === 'cigarro' ? 10 : 24, [B.TIPOS[e.t].ico, '🪙']); destello(); }
        else { toast(`${B.TIPOS[e.t].ico} ${quien} se ha pedido ${B.TIPOS[e.t].un}`); sonar('moneda'); }
      } else if (e.k === 'combo') {
        if (mio) setTimeout(() => { flotante(`COMBO x${Math.min(e.n, B.COMBO_MAX)}`, e.n >= 5 ? '¡IMPARABLE!' : 'sigue, sigue'); sonar('combo'); }, 500);
        else if (e.n >= 3) toast(`🔥 ${quien} va en COMBO x${Math.min(e.n, B.COMBO_MAX)}`);
      } else if (e.k === 'racha' && mio) {
        setTimeout(() => flotante('🔥 x2', 'racha caliente'), 900);
      } else if (e.k === 'clasico') {
        if (mio) setTimeout(() => flotante('COMBO CLÁSICO', 'birra + piti · +15'), 1100); else toast(`🍺🚬 ${quien} hace el combo clásico`);
      } else if (e.k === 'ronda') {
        flotante('¡RONDA!', '+50 fichas para todos'); confeti(200, ['🍻', '🍺', '🪙']); sonar('jackpot'); vibrar([100, 50, 100, 50, 300]);
      } else if (e.k === 'logro') {
        setTimeout(() => { flotante('🏆 ' + e.txt, quien); confeti(120, ['🏆', '🍺']); sonar('jackpot'); }, 700);
      } else if (e.k === 'logroGrupo') {
        setTimeout(() => { flotante(`${e.n} BIRRAS`, 'la mesa está on fire'); confeti(250, ['🍺', '🔥', '🪙']); sonar('jackpot'); }, 1000);
      } else if (e.k === 'slot' && !mio) {
        if (e.p.gordo) toast(`🎰 ${quien}: ${e.r.map((i) => B.SIMBOLOS[i]).join('')} ${e.p.txt}`);
      } else if (e.k === 'doble') {
        if (mio) {
          if (e.gana) { flotante('¡DOBLADO!', `${e.antes} → ${e.antes * 2}`); confeti(200, ['💰', '🪙']); sonar('jackpot'); }
          else { flotante('💸 ARRUINADO', `adiós ${e.antes} fichas`); sonar('pierde'); temblar(); }
        } else toast(e.gana ? `💰 ${quien} ha doblado ${e.antes} fichas` : `💸 ${quien} lo ha perdido todo`);
      } else if (e.k === 'pw') {
        const P = B.TIENDA[e.p];
        if (e.p === 'happy') { flotante('⏰ HAPPY HOUR', 'x2 fichas 15 min'); confeti(120, ['⏰', '🍺']); sonar('jackpot'); }
        else if (e.p === 'diana') { toast(`🎯 ${quien} apunta a ${B.NOMBRES[e.obj]}`); temblar(); }
        else if (mio) flotante(P.ico, P.nombre);
        else toast(`${P.ico} ${quien} activa ${P.nombre}`);
      }
    }
  }

  function flotante(t, sub) {
    const d = document.createElement('div');
    d.className = 'flotante';
    d.innerHTML = `${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }
  function toast(t) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = t;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3700);
  }
  function destello() { const d = document.createElement('div'); d.className = 'destello'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }
  function temblar() { const a = $('app'); a.classList.remove('temblor'); void a.offsetWidth; a.classList.add('temblor'); }
  function vibrar(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* nada */ } }
  function notificar(t, b) {
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(t, { body: b }); } catch (e) { /* nada */ }
  }

  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lienzo = $('lienzo'), ctx = lienzo.getContext('2d');
  let parts = [], animando = false;
  function ajustar() { lienzo.width = innerWidth * devicePixelRatio; lienzo.height = innerHeight * devicePixelRatio; }
  addEventListener('resize', ajustar); ajustar();
  function confeti(n, emojis) {
    if (reducido) n = Math.min(n, 12);
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < n; i++) {
      parts.push({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .45, vx: (Math.random() - .5) * 14, vy: -Math.random() * 16 - 4,
        r: Math.random() * 6, vr: (Math.random() - .5) * .3, s: 18 + Math.random() * 22, e: emojis[i % emojis.length], v: 0 });
    }
    if (!animando) { animando = true; requestAnimationFrame(paso); }
  }
  function paso() {
    const dpr = devicePixelRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.y < innerHeight + 60 && p.v < 260);
    for (const p of parts) {
      p.vy += .45; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.r += p.vr; p.v++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.font = `${p.s}px serif`; ctx.fillText(p.e, -p.s / 2, p.s / 2); ctx.restore();
    }
    if (parts.length) requestAnimationFrame(paso); else { animando = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /* ---------------- Sonido (sintetizado, sin ficheros) ---------------- */
  let ac = null;
  function desbloquearAudio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* nada */ } } if (ac && ac.state === 'suspended') ac.resume(); }
  function nota(f, t0, dur, tipo = 'square', vol = .08) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, ac.currentTime + t0);
    g.gain.setValueAtTime(vol, ac.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t0 + dur);
    o.connect(g).connect(ac.destination); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + .02);
  }
  function sonar(k) {
    if (!sonido || !ac) return;
    if (k === 'moneda') { nota(988, 0, .08); nota(1319, .07, .25); }
    else if (k === 'combo') [523, 659, 784, 1047].forEach((f, i) => nota(f, i * .07, .18));
    else if (k === 'jackpot') [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => nota(f, i * .09, .3, 'triangle', .12));
    else if (k === 'compra') { nota(660, 0, .1, 'triangle'); nota(880, .1, .2, 'triangle'); }
    else if (k === 'palanca') for (let i = 0; i < 14; i++) nota(300 + (i % 2) * 80, i * .1, .05, 'square', .04);
    else if (k === 'pierde') [392, 370, 349, 262].forEach((f, i) => nota(f, i * .18, .25, 'sawtooth', .06));
    else if (k === 'bronca') for (let i = 0; i < 4; i++) nota(i % 2 ? 220 : 180, i * .22, .2, 'sawtooth', .12);
  }

  /* ---------------- Arranque ---------------- */
  prepararRodillos();
  if (!yo || !B.USERS.includes(yo)) { yo = null; pedirSilla(); }
  cargar();
  setInterval(tic, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!es || es.readyState === 2)) cargar();
  });
})();
