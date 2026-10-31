/* Lógica del Casino Birras. La usan la página (navegador) y el guardián del
 * servidor (node), así que todo tiene que ser determinista: el estado sale de
 * aplicar los mensajes de ntfy en orden, con la hora del servidor de ntfy. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Birras = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TOPIC = 'birras-de6849b089e68e5f';
  const TOPIC_AVISOS = 'birras-avisos-f974dc3317';
  const NTFY = 'https://ntfy.sh';

  /* Jugadores: los de partida más los que se añadan desde la app (solo el administrador).
   * USERS y NOMBRES se actualizan EN SITIO al cambiar la lista, así todo el código que
   * los usa ve siempre la mesa actual. Los dados de baja conservan sus datos por si vuelven. */
  const BASE = [['jorlo', 'Jorlo'], ['alvaro', 'Álvaro'], ['david', 'David'], ['bianca', 'Bianca'], ['noelia', 'Noelia'], ['eider', 'Eider'], ['aitor', 'Aitor']];
  const ADMIN = 'david';
  const USERS = BASE.map((x) => x[0]);
  const NOMBRES = Object.fromEntries(BASE);
  const ID_JUGADOR = /^[a-z0-9]{2,16}$/;
  function aplicarMesa(s) {
    s.extra = s.extra && typeof s.extra === 'object' ? s.extra : {};
    s.bajas = Array.isArray(s.bajas) ? s.bajas : [];
    const lista = [...BASE.map((x) => x[0]), ...Object.keys(s.extra).filter((k) => !BASE.some((b) => b[0] === k))].filter((u) => !s.bajas.includes(u));
    USERS.length = 0; USERS.push(...lista);
    for (const k of Object.keys(NOMBRES)) delete NOMBRES[k];
    Object.assign(NOMBRES, Object.fromEntries(BASE), s.extra);
  }
  /* «Álvaro Pérez» -> «alvaroperez» */
  const idDe = (nombre) => String(nombre).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 16);

  const TIPOS = {
    cerveza: { pts: 1, un: 'una cerveza', nombre: 'Cerveza', plural: 'Cervezas', ico: '🍺', fichas: 10, bebida: true },
    cubata: { pts: 2, un: 'un cubata', nombre: 'Cubata', plural: 'Cubatas', ico: '🥃', fichas: 25, bebida: true },
    chupito: { pts: 0.5, un: 'un chupito', nombre: 'Chupito', plural: 'Chupitos', ico: '🥂', fichas: 15, bebida: true },
    cigarro: { pts: 0.2, un: 'un cigarro', nombre: 'Cigarro', plural: 'Cigarros', ico: '🚬', fichas: 5, bebida: false },
    porro: { pts: 2.5, un: 'un porro', nombre: 'Porro', plural: 'Porros', ico: '🌿', fichas: 25, bebida: false },
  };

  const COMBO_VENTANA = 20 * 60;   // bebidas a menos de 20 min encadenan combo
  const COMBO_MAX = 5;
  const RONDA_VENTANA = 5 * 60;    // 3 o más con cerveza en 5 min = RONDA
  const CLASICO_VENTANA = 5 * 60;  // birra + piti en 5 min
  const HORA_SECA = 3600;          // una hora sin cerveza = insultos
  const NOCHE_ACTIVA = 6 * 3600;   // fuera de la noche no se insulta a nadie

  const SLOT_COSTE = 25;
  const SIMBOLOS = ['🍺', '🥃', '🍋', '🍒', '💀', '7️⃣', '🚬'];
  const PESOS = [4, 3, 3, 3, 2, 1, 2];

  const TIENDA = {
    happy: { nombre: 'Happy Hour', ico: '⏰', coste: 150, desc: 'Fichas x2 para toda la mesa durante 15 minutos.' },
    racha: { nombre: 'Racha caliente', ico: '🔥', coste: 80, desc: 'Tus 3 próximas bebidas pagan el doble.' },
    escudo: { nombre: 'Escudo de borracho', ico: '🛡️', coste: 100, desc: 'Una hora sin que te insulten. Cobarde.' },
    diana: { nombre: 'Diana', ico: '🎯', coste: 60, desc: 'Señala a alguien: le salta en la pantalla que beba YA.' },
  };

  function estadoInicial(ts) {
    const users = {};
    for (const u of USERS) {
      users[u] = {
        c: { cerveza: 0, cubata: 0, chupito: 0, cigarro: 0, porro: 0 },
        fichas: 0, ultCerveza: ts, ultEv: 0, primera: 0, ultBebida: 0, hc: [], gan: {}, baseCerveza: 0, ultCigarro: 0,
        combo: 0, maxCombo: 0, racha: 0, escudo: 0, castigos: 0,
      };
    }
    return { v: 1, users, extra: {}, bajas: [], happy: 0, rondas: 0, ultRonda: 0, diana: null, feed: [], upto: 0, ids: [], t0: 0, hist: {}, noches: [] };
  }

  const clon = (o) => JSON.parse(JSON.stringify(o));

  /* Las fotos del estado de antes de añadir gente no traen a los nuevos. */
  function normalizar(s) {
    aplicarMesa(s);
    const vacio = estadoInicial(0);
    for (const u of USERS) {
      const U = s.users[u];
      if (!U) { s.users[u] = estadoInicial(s.upto || 0).users[u]; continue; }
      s.users[u] = Object.assign({}, vacio.users[u], U, { c: Object.assign({}, vacio.users[u].c, U.c), hc: Array.isArray(U.hc) ? U.hc : [], gan: U.gan && typeof U.gan === 'object' ? U.gan : {} });
    }
    for (const k of ['happy', 'rondas', 'ultRonda', 'upto', 't0']) if (s[k] == null) s[k] = 0;
    if (!s.hist) s.hist = {};
    if (!s.noches) s.noches = [];
    if (!s.feed) s.feed = [];
    s.ids = (s.ids || []).map((x) => (Array.isArray(x) ? x : [x, s.upto]));
    return s;
  }

  function premioSlot(r) {
    const s = r.map((i) => SIMBOLOS[i]);
    const [a, b, c] = s;
    if (a === b && b === c) {
      if (a === '7️⃣') return { fichas: 500, racha: 0, castigo: false, txt: 'JACKPOT +500', gordo: true };
      if (a === '🍺') return { fichas: 200, racha: 3, castigo: false, txt: 'TRIPLE BIRRA +200 y racha', gordo: true };
      if (a === '💀') return { fichas: 0, racha: 0, castigo: true, txt: 'TRIPLE CALAVERA: FONDO de lo que tengas', gordo: true };
      return { fichas: 120, racha: 0, castigo: false, txt: `TRIPLE ${a} +120`, gordo: true };
    }
    const calaveras = s.filter((x) => x === '💀').length;
    if (calaveras === 2) return { fichas: 0, racha: 0, castigo: true, txt: 'Doble calavera: chupito de castigo', gordo: false };
    if (a === b || b === c || a === c) return { fichas: 40, racha: 0, castigo: false, txt: 'Pareja +40', gordo: false };
    return { fichas: 0, racha: 0, castigo: false, txt: 'La casa gana', gordo: false };
  }

  function tirarSlot(rnd = Math.random) {
    const total = PESOS.reduce((a, b) => a + b, 0);
    const uno = () => {
      let x = rnd() * total;
      for (let i = 0; i < PESOS.length; i++) { if ((x -= PESOS[i]) < 0) return i; }
      return 0;
    };
    return [uno(), uno(), uno()];
  }

  function feed(s, time, u, ico, txt) {
    s.feed.unshift({ t: time, u, ico, txt });
    if (s.feed.length > 15) s.feed.length = 15;
  }

  /* Puntos de borrachera: cerveza 1, cubata 2, chupito 0,5, cigarro 0,2. */
  function puntos(U) {
    return Math.round(Object.keys(TIPOS).reduce((n, t) => n + U.c[t] * TIPOS[t].pts, 0) * 10) / 10;
  }
  const fmtPts = (n) => (Math.round(n * 10) / 10).toLocaleString('es-ES', { maximumFractionDigits: 1 });

  function totalGrupo(s, tipo = 'cerveza') {
    return USERS.reduce((n, u) => n + s.users[u].c[tipo], 0);
  }

  /* ¿Hay que aplicar este mensaje sobre este estado? (evita contar dos veces
   * lo que ya incluye una foto del estado) */
  function pendiente(s, msg) {
    if (msg.time > s.upto) return true;
    return msg.time >= s.upto - 120 && !s.ids.some((x) => x[0] === msg.id);
  }

  function marcar(s, msg) {
    s.upto = Math.max(s.upto, msg.time);
    s.ids.push([msg.id, msg.time]);
    s.ids = s.ids.filter((x) => x[1] >= s.upto - 120);
  }

  /* Histograma por cuartos de hora para el gráfico de la noche: [cerveza, cubata, chupito, cigarro]. */
  const ORDEN = ['cerveza', 'cubata', 'chupito', 'cigarro', 'porro'];
  function histo(s, t, tipo, n) {
    const k = String(Math.floor(t / 900));
    const fila = s.hist[k] || (s.hist[k] = [0, 0, 0, 0, 0]);
    while (fila.length < ORDEN.length) fila.push(0);   // filas antiguas (sin porros)
    const i = ORDEN.indexOf(tipo);
    if (n > 0) fila[i]++;
    else {   // quitar: del cuarto de hora más reciente que tenga de ese tipo
      const ks = Object.keys(s.hist).sort((a, b) => b - a);
      const kk = ks.find((x) => s.hist[x][i] > 0);
      if (kk) s.hist[kk][i]--;
    }
    const ks = Object.keys(s.hist).sort((a, b) => a - b);
    while (ks.length > 48) delete s.hist[ks.shift()];
  }

  /* Foto compacta para ntfy (máximo 4 KB por mensaje): sin campos a cero y con la
   * lista de jugadas recortada hasta que quepa. normalizar() lo rellena al leer. */
  function paraSnap(s) {
    const o = clon(s);
    for (const u of Object.keys(o.users)) {
      const U = o.users[u];
      for (const t of Object.keys(U.c)) if (!U.c[t]) delete U.c[t];
      for (const k of Object.keys(U)) if (U[k] === 0) delete U[k];
      if (!U.hc.length) delete U.hc;
      for (const t of Object.keys(U.gan)) if (!U.gan[t].length) delete U.gan[t];
      if (!Object.keys(U.gan).length) delete U.gan;
    }
    for (const f of o.feed) delete f.u;
    o.feed = o.feed.slice(0, 12);
    while (JSON.stringify({ k: 'snap', s: o }).length > 3600 && o.feed.length) o.feed.pop();
    while (JSON.stringify({ k: 'snap', s: o }).length > 3600 && Object.keys(o.hist).length) delete o.hist[Object.keys(o.hist).sort((a, b) => a - b)[0]];
    return o;
  }

  /* Recuerda las fichas que dio cada una de las últimas consumiciones, para devolverlas al quitarla. */
  function apilar(U, tipo, n) {
    const l = U.gan[tipo] || (U.gan[tipo] = []);
    l.push(n); if (l.length > 5) l.shift();
  }

  /* Aplica un mensaje {id, time, d} y devuelve efectos para animar. */
  function aplicar(s, msg) {
    const d = msg.d, t = msg.time, ef = [];
    if (!d || !pendiente(s, msg)) return ef;
    const u = d.u, U = s.users[u];
    if (d.k === 'snap' || d.k === 'foto' || !U) { return ef; }
    if (!USERS.includes(u)) return ef;   // un jugador dado de baja ya no puede apuntar nada
    marcar(s, msg);
    const mult = () => (t < s.happy ? 2 : 1);

    if (d.k === 'ev' && TIPOS[d.t]) {
      const T = TIPOS[d.t];
      const quien = NOMBRES[d.por] || NOMBRES[u];
      const aOtro = d.por && d.por !== u ? ` a ${NOMBRES[u]}` : '';
      if (d.n < 0) {
        if (U.c[d.t] > 0) {
          U.c[d.t]--; histo(s, t, d.t, -1);
          // Se quitan las fichas que dio esa consumición (con su combo), no solo las básicas.
          const g = U.gan[d.t] && U.gan[d.t].length ? U.gan[d.t].pop() : T.fichas;
          U.fichas = Math.max(0, U.fichas - g);
          if (d.t === 'cerveza') {
            // La «última cerveza» vuelve a ser la anterior de verdad.
            if (U.hc.length) U.hc.pop();
            U.ultCerveza = U.hc.length ? U.hc[U.hc.length - 1] : (U.baseCerveza || U.ultCerveza);
            U.ultEv = U.hc.length ? U.hc[U.hc.length - 1] : 0;
          }
          if (T.bebida && U.combo > 0) U.combo--;
          feed(s, t, u, '➖', d.deshacer ? `${quien} deshace: −1 ${T.nombre.toLowerCase()}${aOtro}` : `${quien} quita ${T.un}${aOtro}`);
          ef.push({ k: 'quita', u, t: d.t });
        }
        return ef;
      }
      if (d.fix) {   // corrección o deshacer: suma sin combos ni fichas extra y sin cambiar la hora de la última
        U.c[d.t]++; U.fichas += T.fichas; histo(s, t, d.t, 1);
        apilar(U, d.t, T.fichas);
        if (d.t === 'cerveza') { if (!U.hc.length) U.baseCerveza = U.ultCerveza; U.hc.push(U.ultCerveza); U.hc = U.hc.slice(-5); }
        s.t0 = s.t0 || t; U.primera = U.primera || t;
        feed(s, t, u, '✏️', d.deshacer ? `${quien} deshace: +1 ${T.nombre.toLowerCase()}${aOtro}` : `${quien} corrige: +1 ${T.nombre.toLowerCase()}${aOtro}`);
        ef.push({ k: 'corrige', u, t: d.t });
        return ef;
      }
      U.c[d.t]++;
      histo(s, t, d.t, 1);
      s.t0 = s.t0 || t; U.primera = U.primera || t;
      let m = mult();
      if (T.bebida) {
        U.combo = t - U.ultBebida <= COMBO_VENTANA ? U.combo + 1 : 1;
        U.maxCombo = Math.max(U.maxCombo, U.combo);
        U.ultBebida = t;
        m *= Math.min(U.combo, COMBO_MAX);
        if (U.racha > 0) { m *= 2; U.racha--; ef.push({ k: 'racha', u }); }
        if (U.combo >= 2) ef.push({ k: 'combo', u, n: U.combo });
      }
      const ganadas = T.fichas * m;
      U.fichas += ganadas;
      apilar(U, d.t, ganadas);
      ef.push({ k: 'bebida', u, t: d.t, fichas: ganadas });
      feed(s, t, u, T.ico, `${NOMBRES[u]} +1 ${T.nombre.toLowerCase()}${m > 1 ? ` (x${m})` : ''} · +${ganadas}`);

      if (d.t === 'cerveza') {
        if (!U.hc.length) U.baseCerveza = U.ultCerveza;
        U.hc.push(t); U.hc = U.hc.slice(-5);
        U.ultCerveza = t; U.ultEv = t;
        if (U.c.cerveza % 10 === 0) { ef.push({ k: 'logro', u, txt: `${U.c.cerveza} CERVEZAS` }); feed(s, t, u, '🏆', `${NOMBRES[u]} llega a ${U.c.cerveza} cervezas`); }
        const tot = totalGrupo(s);
        if ([50, 69, 75, 100, 150, 200, 250, 300].includes(tot)) { ef.push({ k: 'logroGrupo', n: tot }); feed(s, t, u, '🎰', `LA MESA LLEVA ${tot} CERVEZAS`); }
        const enRonda = USERS.filter((x) => s.users[x].ultEv && t - s.users[x].ultEv <= RONDA_VENTANA);
        if (enRonda.length >= 3 && t - s.ultRonda > RONDA_VENTANA) {
          s.ultRonda = t; s.rondas++;
          for (const x of enRonda) s.users[x].fichas += 50 * mult();
          ef.push({ k: 'ronda', n: enRonda.length });
          feed(s, t, u, '🍻', `¡RONDA de ${enRonda.length}! +${50 * mult()} fichas para ${enRonda.map((x) => NOMBRES[x]).join(', ')}`);
        }
      }
      if ((d.t === 'cerveza' && t - U.ultCigarro <= CLASICO_VENTANA && U.ultCigarro) ||
          (d.t === 'cigarro' && t - U.ultCerveza <= CLASICO_VENTANA && U.c.cerveza > 0)) {
        U.fichas += 15 * mult();
        ef.push({ k: 'clasico', u });
      }
      if (d.t === 'cigarro') U.ultCigarro = t;
      return ef;
    }

    if (d.k === 'slot' && Array.isArray(d.r) && d.r.length === 3 && d.r.every((i) => i >= 0 && i < SIMBOLOS.length)) {
      if (U.fichas < SLOT_COSTE) return ef;
      U.fichas -= SLOT_COSTE;
      const p = premioSlot(d.r);
      U.fichas += p.fichas * mult();
      U.racha += p.racha;
      if (p.castigo) U.castigos++;
      ef.push({ k: 'slot', u, r: d.r, p });
      feed(s, t, u, '🎰', `${NOMBRES[u]}: ${d.r.map((i) => SIMBOLOS[i]).join('')} ${p.txt}`);
      return ef;
    }

    if (d.k === 'doble' && U.fichas >= 20) {
      const antes = U.fichas;
      U.fichas = d.gana ? antes * 2 : 0;
      ef.push({ k: 'doble', u, gana: !!d.gana, antes });
      feed(s, t, u, d.gana ? '💰' : '💸', d.gana ? `${NOMBRES[u]} dobla: ${antes} → ${antes * 2}` : `${NOMBRES[u]} lo pierde TODO (${antes} fichas)`);
      return ef;
    }

    if (d.k === 'ajuste' && d.por === 'servidor' && d.campos && typeof d.campos === 'object') {
      for (const [k, v] of Object.entries(d.campos)) if (['ultCerveza', 'ultEv', 'fichas'].includes(k) && Number.isFinite(v)) U[k] = v;
      return ef;
    }

    if (d.k === 'jugador' && d.por === ADMIN) {
      if (d.op === 'alta') {
        const nombre = String(d.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 24);
        const id = idDe(nombre);
        if (!nombre || !ID_JUGADOR.test(id)) return ef;
        if (!BASE.some((b) => b[0] === id)) s.extra[id] = nombre;
        s.bajas = s.bajas.filter((x) => x !== id);
        aplicarMesa(s); normalizar(s);
        feed(s, t, ADMIN, '🪑', `${nombre} se sienta en la mesa`);
        ef.push({ k: 'jugador', op: 'alta', id });
      } else if (d.op === 'baja' && USERS.includes(d.id) && d.id !== ADMIN) {
        const nombre = NOMBRES[d.id];
        s.bajas.push(d.id);
        aplicarMesa(s);
        feed(s, t, ADMIN, '👋', `${nombre} se levanta de la mesa`);
        ef.push({ k: 'jugador', op: 'baja', id: d.id });
      }
      return ef;
    }

    if (d.k === 'noche') {   // cerrar la noche: se guarda el resumen y el bote vuelve a cero
      const tot = ORDEN.map((x) => totalGrupo(s, x));
      if (tot.some(Boolean)) {
        const top = USERS.map((x) => [x, puntos(s.users[x])]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
        s.noches.unshift({ a: s.t0 || t, b: t, c: tot, p: Math.round(USERS.reduce((n, x) => n + puntos(s.users[x]), 0) * 10) / 10, top });
        s.noches = s.noches.slice(0, 4);
      }
      for (const x of USERS) {
        const X = s.users[x];
        X.c = { cerveza: 0, cubata: 0, chupito: 0, cigarro: 0, porro: 0 };
        Object.assign(X, { hc: [], gan: {}, baseCerveza: 0, ultCerveza: t, ultEv: 0, primera: 0, ultBebida: 0, ultCigarro: 0, combo: 0, maxCombo: 0, castigos: 0, racha: 0, escudo: 0 });
      }
      Object.assign(s, { hist: {}, rondas: 0, ultRonda: 0, happy: 0, diana: null, t0: 0, feed: [] });
      feed(s, t, u, '🌅', `${NOMBRES[u]} cierra la noche. Bote a cero.`);
      ef.push({ k: 'noche', u });
      return ef;
    }

    if (d.k === 'pw' && TIENDA[d.p] && U.fichas >= TIENDA[d.p].coste) {
      const P = TIENDA[d.p];
      if (d.p === 'diana' && (!s.users[d.obj] || d.obj === u)) return ef;
      U.fichas -= P.coste;
      if (d.p === 'happy') s.happy = Math.max(s.happy, t) + 900;
      if (d.p === 'racha') U.racha += 3;
      if (d.p === 'escudo') U.escudo = Math.max(U.escudo, t) + 3600;
      if (d.p === 'diana') { s.users[d.obj].castigos++; s.diana = { u: d.obj, por: u, t }; }
      ef.push({ k: 'pw', u, p: d.p, obj: d.obj });
      feed(s, t, u, P.ico, d.p === 'diana' ? `${NOMBRES[u]} apunta a ${NOMBRES[d.obj]}: ¡BEBE YA!` : `${NOMBRES[u]} activa ${P.nombre}`);
      return ef;
    }
    return ef;
  }

  /* Reconstruye el estado a partir de los mensajes de ntfy (en orden). */
  function reconstruir(mensajes, base) {
    const ms = mensajes.map(parsear).filter(Boolean);
    let s = base ? clon(base) : null;
    let iSnap = -1;
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].d.k === 'snap') { iSnap = i; break; }
    if (iSnap >= 0) {
      const snap = ms[iSnap].d.s;
      if (!s || snap.upto >= s.upto) s = clon(snap);
    }
    if (!s) return null;
    normalizar(s);
    for (const m of ms) if (m.d.k !== 'snap') aplicar(s, m);
    return s;
  }

  function parsear(m) {
    if (!m || m.event !== 'message' || typeof m.message !== 'string') return null;
    try {
      const d = JSON.parse(m.message);
      if (!d || typeof d.k !== 'string') return null;
      if (d.k === 'snap' && !(d.s && d.s.users && ['jorlo', 'alvaro', 'david'].every((u) => d.s.users[u]))) return null;
      return { id: m.id, time: m.time, d };
    } catch (e) { return null; }
  }

  const INSULTOS = [
    '{n}, una hora sin cerveza. Gilipollas de manual.',
    '{n}, bebe ya, pedazo de mierda, que nos estás amargando la noche.',
    '¿Qué pasa, {n}? ¿Te has meado encima o es que eres así de flojo?',
    '{n}, cabrón, la birra no se bebe con la mirada.',
    '{n}, me cago en tus muertos. BEBE.',
    'Llevas una hora seco, {n}. Das más asco que un baño de gasolinera.',
    '{n}, capullo, hasta tu abuela tumba más cañas que tú.',
    '{n}, eres el típico mierdas que pide agua y luego quiere pagar a partes iguales.',
    '{n}, bebe o lárgate a casa a ver la tele con tu madre.',
    'Atención: {n} lleva una hora haciendo el ridículo. Vergüenza, hijo de la gran puta.',
    '{n}, si vas a estar seco, vete a un velatorio, que allí al menos pegas.',
    '{n}, menudo pringado. La cerveza se calienta y tú ahí, rascándote los huevos.',
    '{n}, tienes el hígado de vacaciones y la dignidad en el suelo. BEBE.',
    '{n}, eres una decepción para tus padres y para esta mesa.',
    'Que alguien le meta un embudo a {n}, que el muy capullo no espabila.',
    '{n}, a este ritmo te van a echar del grupo de WhatsApp, cagón.',
    '{n}, deja el móvil y bebe, so cansino de los cojones.',
  ];
  const INSULTOS_FUERTES = [
    '{n}, {h} sin beber. Eres un puto lastre, tío.',
    '{n}: {h} seco. Hasta un cactus tiene más vida social que tú.',
    '{n}, {h} sin cerveza. Te estás ganando que te paguemos un taxi y no volvamos a quedar contigo.',
    '{n}, {h}. A estas alturas eres un mueble con patas, cabrón.',
    '{n}, {h} sin tocar una birra. Me das vergüenza ajena y propia, gilipollas.',
    '{h} lleva {n} sin beber. Que alguien llame a sus padres y les pida perdón por haberlo criado.',
    '{n}, {h} seco. Eres el mayor fracaso de esta noche, y mira que la noche va de culo.',
  ];

  function horasTexto(seg) {
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  /* Quién se merece insultos ahora mismo. */
  function secos(s, now) {
    const actividad = Math.max(...USERS.map((u) => Math.max(s.users[u].ultCerveza, s.users[u].ultBebida, s.users[u].ultCigarro)));
    if (now - actividad > NOCHE_ACTIVA) return [];
    return USERS.filter((u) => (s.users[u].ultEv || s.users[u].ultBebida || s.users[u].ultCigarro) && now - s.users[u].ultCerveza > HORA_SECA && now >= s.users[u].escudo)
      .map((u) => ({ u, seg: now - s.users[u].ultCerveza }));
  }

  function insulto(u, seg, semilla) {
    const lista = seg > 2 * HORA_SECA ? INSULTOS_FUERTES.concat(INSULTOS) : INSULTOS;
    return lista[Math.abs(semilla) % lista.length].replaceAll('{n}', NOMBRES[u]).replaceAll('{h}', horasTexto(seg));
  }

  return {
    TOPIC, TOPIC_AVISOS, NTFY, USERS, NOMBRES, TIPOS, TIENDA, SIMBOLOS, SLOT_COSTE,
    COMBO_VENTANA, COMBO_MAX, HORA_SECA,
    ADMIN, idDe, estadoInicial, normalizar, paraSnap, ORDEN, aplicar, puntos, fmtPts, reconstruir, parsear, premioSlot, tirarSlot, totalGrupo,
    secos, insulto, horasTexto, clon,
  };
});
