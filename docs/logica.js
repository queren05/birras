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
  const SIN_CERVEZA = new Set();
  /* Bebida que cuenta para el reloj de la vergüenza, las rondas y los logros. */
  const principal = (u) => (SIN_CERVEZA.has(u) ? 'cubata' : 'cerveza');
  function aplicarMesa(s) {
    s.sinCerveza = Array.isArray(s.sinCerveza) ? s.sinCerveza : [];
    SIN_CERVEZA.clear(); s.sinCerveza.forEach((u) => SIN_CERVEZA.add(u));
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
    cerveza: { pts: 1, un: 'una cerveza', nombre: 'Cerveza', plural: 'Cervezas', ico: '🍺', fichas: 50, bebida: true },
    cubata: { pts: 2, un: 'un cubata', nombre: 'Cubata', plural: 'Cubatas', ico: '🥃', fichas: 125, bebida: true },
    chupito: { pts: 0.5, un: 'un chupito', nombre: 'Chupito', plural: 'Chupitos', ico: '🥂', fichas: 75, bebida: true },
    cigarro: { pts: 0.2, un: 'un cigarro', nombre: 'Cigarro', plural: 'Cigarros', ico: '🚬', fichas: 25, bebida: false },
    porro: { pts: 2.5, un: 'un porro', nombre: 'Porro', plural: 'Porros', ico: '🌿', fichas: 125, bebida: false },
  };

  const COMBO_VENTANA = 20 * 60;   // bebidas a menos de 20 min encadenan combo
  const COMBO_MAX = 5;
  const RONDA_VENTANA = 5 * 60;    // 3 o más con cerveza en 5 min = RONDA
  const CLASICO_VENTANA = 5 * 60;  // birra + piti en 5 min
  const HORA_SECA = 3600;
  const RONDA_FICHAS = 250, CLASICO_FICHAS = 75;   // fichas x5 desde el 1-11-2026          // una hora sin cerveza = insultos
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
    return { v: 1, users, extra: {}, bajas: [], sinCerveza: [], happy: 0, rondas: 0, ultRonda: 0, diana: null, feed: [], upto: 0, ids: [], t0: 0, hist: {}, noches: [], retos: [], porras: [] };
  }

  const clon = (o) => JSON.parse(JSON.stringify(o));

  /* Las fotos del estado de antes de añadir gente no traen a los nuevos. */
  function normalizar(s) {
    aplicarMesa(s);
    const vacio = estadoInicial(0);
    for (const u of new Set([...USERS, ...Object.keys(s.users)])) {
      const U = s.users[u];
      if (!U) { s.users[u] = estadoInicial(s.upto || 0).users[u]; continue; }
      const base = vacio.users[u] || vacio.users[USERS[0]];   // los dados de baja no están en la mesa
      s.users[u] = Object.assign({}, base, U, { c: Object.assign({}, base.c, U.c), hc: Array.isArray(U.hc) ? U.hc : [], gan: U.gan && typeof U.gan === 'object' ? U.gan : {} });
    }
    for (const k of ['happy', 'rondas', 'ultRonda', 'upto', 't0']) if (s[k] == null) s[k] = 0;
    if (!s.hist) s.hist = {};
    if (!s.noches) s.noches = [];
    if (!s.feed) s.feed = [];
    if (!Array.isArray(s.retos)) s.retos = [];
    if (!Array.isArray(s.porras)) s.porras = [];
    s.ids = (s.ids || []).map((x) => (Array.isArray(x) ? x : [x, s.upto]));
    return s;
  }

  /* ---------- Juegos de casino ---------- */
  const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const colorRuleta = (n) => (n === 0 ? 'verde' : ROJOS.has(n) ? 'rojo' : 'negro');
  /* «paga» = ganancia neta por ficha apostada (pleno 35 a 1, docena 2 a 1, colores 1 a 1) */
  const APUESTAS_RULETA = {
    rojo: { paga: 1, gana: (r) => colorRuleta(r) === 'rojo', nombre: () => 'rojo' },
    negro: { paga: 1, gana: (r) => colorRuleta(r) === 'negro', nombre: () => 'negro' },
    par: { paga: 1, gana: (r) => r !== 0 && r % 2 === 0, nombre: () => 'par' },
    impar: { paga: 1, gana: (r) => r % 2 === 1, nombre: () => 'impar' },
    d1: { paga: 2, gana: (r) => r >= 1 && r <= 12, nombre: () => '1ª docena' },
    d2: { paga: 2, gana: (r) => r >= 13 && r <= 24, nombre: () => '2ª docena' },
    d3: { paga: 2, gana: (r) => r >= 25 && r <= 36, nombre: () => '3ª docena' },
    n: { paga: 35, gana: (r, n) => r === n, nombre: (n) => `pleno al ${n}` },
  };
  const APUESTAS_DADOS = {
    menor: { paga: 1, gana: (x) => x < 7, nombre: 'menor que 7' },
    mayor: { paga: 1, gana: (x) => x > 7, nombre: 'mayor que 7' },
    siete: { paga: 4, gana: (x) => x === 7, nombre: 'siete justo' },
  };
  const APUESTA_MIN = 5;
  /* Retos entre dos: «te reto a que te bebes otra en 10 minutos». Los dos ponen las mismas
   * fichas; si el retado bebe a tiempo se lo lleva todo, si no, el que retó. */
  const RETO_PLAZO = 10 * 60, RETO_ESPERA = 10 * 60;

  /* Blackjack: cartas 0-51 (palo = c/13, valor = c%13: 0 as, 1-8 del 2 al 9, 9-12 diez y figuras).
   * El móvil reparte y juega la mano; aquí se comprueba que la mano y la casa son válidas y se paga. */
  const valorCarta = (c) => { const r = c % 13; return r === 0 ? 11 : r >= 9 ? 10 : r + 1; };
  function totalBJ(cs) {
    let t = 0, ases = 0;
    for (const c of cs) { t += valorCarta(c); if (c % 13 === 0) ases++; }
    while (t > 21 && ases) { t -= 10; ases--; }
    return t;
  }
  /* Resultado de una mano ya jugada; null si no es válida. La casa pide hasta 17. */
  function resultadoBJ(j, c, doble) {
    const ok = (x) => Array.isArray(x) && x.every((n) => Number.isInteger(n) && n >= 0 && n < 52);
    if (!ok(j) || !ok(c) || j.length < 2 || c.length < 2 || j.length > 11 || c.length > 11) return null;
    if (new Set([...j, ...c]).size !== j.length + c.length) return null;
    if (doble && j.length !== 3) return null;
    const tj = totalBJ(j);
    for (let k = 2; k < j.length; k++) if (totalBJ(j.slice(0, k)) >= 21) return null;   // no se pide con 21 o pasado
    const natural = j.length === 2 && tj === 21 && !doble;
    if (tj > 21 || natural) { if (c.length !== 2) return null; }
    else {
      for (let k = 2; k < c.length; k++) if (totalBJ(c.slice(0, k)) >= 17) return null;
      if (totalBJ(c) < 17) return null;
    }
    const tc = totalBJ(c), casaNatural = c.length === 2 && tc === 21;
    let res;
    if (tj > 21) res = 'pasa';
    else if (natural) res = casaNatural ? 'empate' : 'blackjack';
    else if (casaNatural && c.length === 2) res = 'pierde';
    else if (tc > 21 || tj > tc) res = 'gana';
    else res = tj === tc ? 'empate' : 'pierde';
    return { res, tj, tc };
  }
  /* Crash: el multiplicador sube hasta x (punto de explosión); r = donde te retiraste (0 = no llegaste). */
  const crashValido = (x) => typeof x === 'number' && x >= 1 && x <= 1000 && Math.abs(Math.round(x * 100) - x * 100) < 1e-6;
  const CABALLOS = ['🍺', '🥃', '🥂', '🍹', '🍷'];
  const CARRERA_PAGA = 4;   // ganancia neta por ficha (5 corredores)
  const PORRA_PAGA = 3;     // «¿quién bebe la siguiente?»: ganancia neta por ficha
  const PORRA_CADUCA = 2 * 3600;
  /* Cantidad válida para apostar (entera, mínimo 5, sin pasar de lo que tienes) o 0 si no vale */
  function apostable(U, cant) {
    return Number.isInteger(cant) && cant >= APUESTA_MIN && cant <= U.fichas ? cant : 0;
  }
  const SIMBOLOS_RASCA = ['🍺', '🥃', '🍋', '💀', '💎', '🌿'];
  const PESOS_RASCA = [5, 4, 5, 2, 1, 3];
  const RASCA_COSTE = 15;
  const PREMIOS_RASCA = { '💎': 300, '🍺': 60, '🥃': 80, '🌿': 100, '🍋': 30 };
  /* Seis casillas; si tres iguales salen, premio de ese símbolo (el mejor si hay varios) */
  function premioRasca(r) {
    const cuenta = {};
    r.forEach((i) => { const x = SIMBOLOS_RASCA[i]; cuenta[x] = (cuenta[x] || 0) + 1; });
    if ((cuenta['💀'] || 0) >= 3) return { fichas: 0, castigo: true, txt: '💀💀💀 castigo: chupito', simbolo: '💀' };
    const ganadores = Object.keys(PREMIOS_RASCA).filter((x) => (cuenta[x] || 0) >= 3).sort((a, b) => PREMIOS_RASCA[b] - PREMIOS_RASCA[a]);
    if (ganadores.length) return { fichas: PREMIOS_RASCA[ganadores[0]], castigo: false, txt: `${ganadores[0].repeat(3)} +${PREMIOS_RASCA[ganadores[0]]}`, simbolo: ganadores[0] };
    return { fichas: 0, castigo: false, txt: 'nada, a la próxima', simbolo: null };
  }
  function tirarRasca(rnd = Math.random) {
    const total = PESOS_RASCA.reduce((a, b) => a + b, 0);
    return Array.from({ length: 6 }, () => { let x = rnd() * total; for (let i = 0; i < PESOS_RASCA.length; i++) if ((x -= PESOS_RASCA[i]) < 0) return i; return 0; });
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
      if (!Array.isArray(U.hc) || !U.hc.length) delete U.hc;
      if (U.gan && typeof U.gan === 'object') { for (const t of Object.keys(U.gan)) if (!Array.isArray(U.gan[t]) || !U.gan[t].length) delete U.gan[t]; }
      if (!U.gan || !Object.keys(U.gan).length) delete U.gan;
    }
    for (const f of o.feed) delete f.u;
    for (const n of o.noches || []) delete n.j;   // el detalle por jugador lo archiva el servidor
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

  /* Retos caducados: el que no se aceptó a tiempo devuelve las fichas; el aceptado y no
   * cumplido se lo lleva el que retó. Se resuelve con la hora de cualquier mensaje posterior. */
  function vencerRetos(s, t, ef) {
    if (s.porras && s.porras.length) {
      s.porras = s.porras.filter((p) => {
        if (t - p.t <= PORRA_CADUCA) return true;
        if (s.users[p.u]) s.users[p.u].fichas += p.cant;
        return false;
      });
    }
    if (!s.retos || !s.retos.length) return;
    s.retos = s.retos.filter((r) => {
      const De = s.users[r.de], A = s.users[r.a];
      if (!r.hasta && t - r.t > RETO_ESPERA) {
        if (De) De.fichas += r.cant;
        feed(s, t, r.de, '⌛', `${NOMBRES[r.a] || r.a} no contesta al reto de ${NOMBRES[r.de] || r.de}`);
        ef.push({ k: 'reto', op: 'caduca', de: r.de, a: r.a });
        return false;
      }
      if (r.hasta && t > r.hasta) {
        if (De) De.fichas += r.cant * 2;
        feed(s, t, r.de, '🤺', `${NOMBRES[r.de] || r.de} gana el reto: ${NOMBRES[r.a] || r.a} no bebió a tiempo · +${r.cant * 2}`);
        ef.push({ k: 'reto', op: 'gana', u: r.de, de: r.de, a: r.a, cant: r.cant });
        return false;
      }
      return true;
    });
  }

  /* Aplica un mensaje {id, time, d} y devuelve efectos para animar. */
  function aplicar(s, msg) {
    const d = msg.d, t = msg.time, ef = [];
    if (!d || !pendiente(s, msg)) return ef;
    if (d.k !== 'snap' && d.k !== 'foto') vencerRetos(s, t, ef);
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
          if (d.t === principal(u)) {
            // La «última cerveza» (o cubata) vuelve a ser la anterior de verdad.
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
        if (d.t === principal(u)) { if (!U.hc.length) U.baseCerveza = U.ultCerveza; U.hc.push(U.ultCerveza); U.hc = U.hc.slice(-5); }
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
      // Cada castigo es un chupito que se debe: al apuntarse un chupito se paga uno
      if (d.t === 'chupito' && U.castigos > 0) {
        U.castigos--;
        feed(s, t, u, '💀', `${NOMBRES[u]} paga un castigo${U.castigos ? ` (le quedan ${U.castigos})` : '. Limpio.'}`);
        ef.push({ k: 'castigo', op: 'paga', u, quedan: U.castigos, n: U.castigos });
      }
      if (T.bebida && s.porras.length) {
        const ganan = s.porras.filter((p) => p.a === u);
        for (const p of ganan) if (s.users[p.u]) s.users[p.u].fichas += p.cant * (PORRA_PAGA + 1);
        if (ganan.length) feed(s, t, u, '🔮', `Porra: ${ganan.map((p) => `${NOMBRES[p.u]} +${p.cant * PORRA_PAGA}`).join(', ')}`);
        const pierden = s.porras.filter((p) => p.a !== u);
        if (pierden.length) feed(s, t, u, '🔮', `Porra perdida: ${[...new Set(pierden.map((p) => NOMBRES[p.u]))].join(', ')}`);
        ef.push({ k: 'porra', op: 'resuelve', u, ganan: ganan.map((p) => ({ u: p.u, fichas: p.cant * PORRA_PAGA })), pierden: pierden.map((p) => ({ u: p.u, fichas: p.cant })) });
        s.porras = [];
      }
      if (T.bebida) {
        s.retos = s.retos.filter((r) => {
          if (r.a !== u || !r.hasta || t > r.hasta) return true;
          U.fichas += r.cant * 2;
          ef.push({ k: 'reto', op: 'gana', u, de: r.de, a: u, cant: r.cant });
          feed(s, t, u, '🤺', `${NOMBRES[u]} cumple el reto de ${NOMBRES[r.de] || r.de} · +${r.cant * 2}`);
          return false;
        });
      }
      feed(s, t, u, T.ico, `${NOMBRES[u]} +1 ${T.nombre.toLowerCase()}${m > 1 ? ` (x${m})` : ''} · +${ganadas}`);

      if (d.t === 'cerveza') {
        const tot = totalGrupo(s);
        if ([50, 69, 75, 100, 150, 200, 250, 300].includes(tot)) { ef.push({ k: 'logroGrupo', n: tot }); feed(s, t, u, '🎰', `LA MESA LLEVA ${tot} CERVEZAS`); }
      }
      if (d.t === principal(u)) {   // cerveza, o cubata para quien no bebe cerveza
        if (!U.hc.length) U.baseCerveza = U.ultCerveza;
        U.hc.push(t); U.hc = U.hc.slice(-5);
        U.ultCerveza = t; U.ultEv = t;
        if (U.c[d.t] % 10 === 0) { ef.push({ k: 'logro', u, txt: `${U.c[d.t]} ${T.plural.toUpperCase()}` }); feed(s, t, u, '🏆', `${NOMBRES[u]} llega a ${U.c[d.t]} ${T.plural.toLowerCase()}`); }
        const enRonda = USERS.filter((x) => s.users[x].ultEv && t - s.users[x].ultEv <= RONDA_VENTANA);
        if (enRonda.length >= 3 && t - s.ultRonda > RONDA_VENTANA) {
          s.ultRonda = t; s.rondas++;
          for (const x of enRonda) s.users[x].fichas += RONDA_FICHAS * mult();
          ef.push({ k: 'ronda', n: enRonda.length });
          feed(s, t, u, '🍻', `¡RONDA de ${enRonda.length}! +${RONDA_FICHAS * mult()} fichas para ${enRonda.map((x) => NOMBRES[x]).join(', ')}`);
        }
      }
      if ((d.t === 'cerveza' && t - U.ultCigarro <= CLASICO_VENTANA && U.ultCigarro) ||
          (d.t === 'cigarro' && t - U.ultCerveza <= CLASICO_VENTANA && U.c.cerveza > 0)) {
        U.fichas += CLASICO_FICHAS * mult();
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

    /* ---------- Ruleta europea (0-36) ---------- */
    if (d.k === 'ruleta' && Number.isInteger(d.r) && d.r >= 0 && d.r <= 36 && d.ap && APUESTAS_RULETA[d.ap.tipo]) {
      const cant = apostable(U, d.cant);
      if (!cant) return ef;
      const A = APUESTAS_RULETA[d.ap.tipo];
      if (d.ap.tipo === 'n' && !(Number.isInteger(d.ap.n) && d.ap.n >= 0 && d.ap.n <= 36)) return ef;
      const gana = A.gana(d.r, d.ap.n);
      const neto = gana ? cant * A.paga : -cant;
      U.fichas += neto;
      ef.push({ k: 'ruleta', u, r: d.r, gana, neto, cant, ap: d.ap });
      feed(s, t, u, '🎡', `${NOMBRES[u]} · ruleta ${d.r} ${colorRuleta(d.r) === 'rojo' ? '🔴' : colorRuleta(d.r) === 'negro' ? '⚫' : '🟢'} · ${A.nombre(d.ap.n)}: ${gana ? `+${neto}` : `−${cant}`}`);
      if (d.r === 0) { ef.push({ k: 'cero', u }); feed(s, t, u, '🟢', '¡CERO! Toda la mesa bebe un trago'); }
      return ef;
    }

    /* ---------- Dados: mayor o menor que 7 ---------- */
    if (d.k === 'dados' && Array.isArray(d.r) && d.r.length === 2 && d.r.every((x) => Number.isInteger(x) && x >= 1 && x <= 6) && APUESTAS_DADOS[d.ap]) {
      const cant = apostable(U, d.cant);
      if (!cant) return ef;
      const suma = d.r[0] + d.r[1], A = APUESTAS_DADOS[d.ap];
      const gana = A.gana(suma);
      const neto = gana ? cant * A.paga : -cant;
      U.fichas += neto;
      if (d.r[0] === 1 && d.r[1] === 1) U.castigos++;   // ojos de serpiente: castigo
      ef.push({ k: 'dados', u, r: d.r, gana, neto, cant, ap: d.ap });
      feed(s, t, u, '🎲', `${NOMBRES[u]} · dados ${d.r[0]}+${d.r[1]}=${suma} · ${A.nombre}: ${gana ? `+${neto}` : `−${cant}`}${d.r[0] === 1 && d.r[1] === 1 ? ' · 🐍 ojos de serpiente: chupito' : ''}`);
      return ef;
    }

    /* ---------- Rasca y gana ---------- */
    if (d.k === 'rasca' && Array.isArray(d.r) && d.r.length === 6 && d.r.every((i) => Number.isInteger(i) && i >= 0 && i < SIMBOLOS_RASCA.length)) {
      if (U.fichas < RASCA_COSTE) return ef;
      U.fichas -= RASCA_COSTE;
      const p = premioRasca(d.r);
      U.fichas += p.fichas;
      if (p.castigo) U.castigos++;
      ef.push({ k: 'rasca', u, r: d.r, p });
      feed(s, t, u, '🎟️', `${NOMBRES[u]} · rasca y gana: ${p.txt}`);
      return ef;
    }

    /* ---------- Blackjack ---------- */
    if (d.k === 'bj') {
      const cant = apostable(U, d.cant);
      if (!cant || (d.doble && cant * 2 > U.fichas)) return ef;
      const r = resultadoBJ(d.j, d.c, !!d.doble);
      if (!r) return ef;
      const m = d.doble ? 2 : 1;
      const neto = r.res === 'blackjack' ? Math.floor(cant * 1.5) : r.res === 'gana' ? cant * m : r.res === 'empate' ? 0 : -cant * m;
      U.fichas += neto;
      ef.push({ k: 'bj', u, neto, cant, res: r.res, tj: r.tj, tc: r.tc });
      const txt = { blackjack: '¡BLACKJACK!', gana: 'gana', empate: 'empata', pierde: 'pierde', pasa: 'se pasa' }[r.res];
      feed(s, t, u, '🃏', `${NOMBRES[u]} · blackjack ${r.tj} contra ${r.tc}: ${txt}${neto ? ` ${neto > 0 ? '+' : '−'}${Math.abs(neto)}` : ''}`);
      return ef;
    }

    /* ---------- Crash ---------- */
    if (d.k === 'crash' && crashValido(d.x) && (d.r === 0 || (crashValido(d.r) && d.r > 1))) {
      const cant = apostable(U, d.cant);
      if (!cant) return ef;
      const gana = d.r > 0 && d.r <= d.x;
      const neto = gana ? Math.floor(cant * (Math.round(d.r * 100) - 100) / 100) : -cant;
      U.fichas += neto;
      ef.push({ k: 'crash', u, neto, cant, x: d.x, r: d.r, gana });
      feed(s, t, u, '🚀', gana ? `${NOMBRES[u]} se retira en x${d.r.toFixed(2)} (explotó en x${d.x.toFixed(2)}) · +${neto}` : `${NOMBRES[u]} explota en x${d.x.toFixed(2)} · −${cant}`);
      return ef;
    }

    /* ---------- Carrera de bebidas ---------- */
    if (d.k === 'carrera' && [d.ap, d.r].every((x) => Number.isInteger(x) && x >= 0 && x < CABALLOS.length)) {
      const cant = apostable(U, d.cant);
      if (!cant) return ef;
      const gana = d.ap === d.r, neto = gana ? cant * CARRERA_PAGA : -cant;
      U.fichas += neto;
      ef.push({ k: 'carrera', u, neto, cant, gana, ap: d.ap, r: d.r });
      feed(s, t, u, '🏁', `${NOMBRES[u]} · carrera: gana ${CABALLOS[d.r]}${gana ? ` ¡acierta! +${neto}` : `, iba con ${CABALLOS[d.ap]} −${cant}`}`);
      return ef;
    }

    /* ---------- Porra: ¿quién bebe la siguiente? ---------- */
    if (d.k === 'porra' && USERS.includes(d.a) && d.a !== u) {
      const cant = apostable(U, d.cant);
      if (!cant) return ef;
      U.fichas -= cant;
      s.porras.push({ u, a: d.a, cant, t });
      feed(s, t, u, '🔮', `${NOMBRES[u]} apuesta ${cant} a que ${NOMBRES[d.a]} bebe la siguiente`);
      ef.push({ k: 'porra', op: 'apuesta', u, a: d.a, cant });
      return ef;
    }

    /* ---------- Retos entre dos ---------- */
    if (d.k === 'reto') {
      if (d.op === 'lanzar') {
        const cant = apostable(U, d.cant);
        if (!cant || !USERS.includes(d.a) || d.a === u || typeof d.rid !== 'string' || s.retos.some((r) => r.rid === d.rid)) return ef;
        if (s.retos.some((r) => r.a === d.a && r.de === u)) return ef;   // uno pendiente por pareja
        U.fichas -= cant;
        s.retos.push({ rid: d.rid.slice(0, 12), de: u, a: d.a, cant, t, hasta: 0 });
        feed(s, t, u, '🤺', `${NOMBRES[u]} reta a ${NOMBRES[d.a]}: otra en 10 min por ${cant} fichas`);
        ef.push({ k: 'reto', op: 'lanzar', u, de: u, a: d.a, cant });
        return ef;
      }
      const r = s.retos.find((x) => x.rid === d.rid);
      if (!r) return ef;
      if (d.op === 'aceptar' && r.a === u && !r.hasta) {
        if (U.fichas < r.cant) return ef;
        U.fichas -= r.cant; r.hasta = t + RETO_PLAZO;
        feed(s, t, u, '🤺', `${NOMBRES[u]} acepta el reto de ${NOMBRES[r.de]}: tiene 10 min`);
        ef.push({ k: 'reto', op: 'aceptar', u, de: r.de, a: u, cant: r.cant });
      } else if ((d.op === 'rechazar' && r.a === u && !r.hasta) || (d.op === 'cancelar' && r.de === u && !r.hasta)) {
        if (s.users[r.de]) s.users[r.de].fichas += r.cant;
        s.retos = s.retos.filter((x) => x !== r);
        feed(s, t, u, '🏳️', d.op === 'rechazar' ? `${NOMBRES[u]} se raja ante ${NOMBRES[r.de]}` : `${NOMBRES[u]} retira el reto a ${NOMBRES[r.a]}`);
        ef.push({ k: 'reto', op: d.op, u, de: r.de, a: r.a });
      }
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

    if (d.k === 'pref' && (d.por === u || d.por === ADMIN) && typeof d.sinCerveza === 'boolean') {
      const antes = s.sinCerveza.includes(u);
      if (antes !== d.sinCerveza) {
        s.sinCerveza = d.sinCerveza ? [...s.sinCerveza, u] : s.sinCerveza.filter((x) => x !== u);
        aplicarMesa(s);
        // Cambia la bebida que cuenta: el reloj arranca de cero, sin castigo
        Object.assign(U, { hc: [], baseCerveza: t, ultCerveza: t });
        feed(s, t, u, d.sinCerveza ? '🥃' : '🍺', d.sinCerveza ? `${NOMBRES[u]} no bebe cerveza: le cuentan los cubatas` : `${NOMBRES[u]} vuelve a la cerveza`);
        ef.push({ k: 'pref', u });
      }
      return ef;
    }

    if (d.k === 'noche') {   // cerrar la noche: se guarda el resumen y el bote vuelve a cero
      const tot = ORDEN.map((x) => totalGrupo(s, x));
      if (tot.some(Boolean)) {
        const top = USERS.map((x) => [x, puntos(s.users[x])]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
        // Detalle por jugador [id, puntos, fichas, cerveza, cubata, chupito, cigarro, porro, mejor combo] para el histórico
        const j = USERS.filter((x) => Object.values(s.users[x].c).some(Boolean)).map((x) => { const X = s.users[x]; return [x, puntos(X), X.fichas, ...ORDEN.map((o) => X.c[o]), X.maxCombo]; });
        s.noches.unshift({ a: s.t0 || t, b: t, c: tot, p: Math.round(USERS.reduce((n, x) => n + puntos(s.users[x]), 0) * 10) / 10, top, j });
        s.noches = s.noches.slice(0, 4);
      }
      for (const x of USERS) {
        const X = s.users[x];
        X.c = { cerveza: 0, cubata: 0, chupito: 0, cigarro: 0, porro: 0 };
        Object.assign(X, { hc: [], gan: {}, baseCerveza: 0, ultCerveza: t, ultEv: 0, primera: 0, ultBebida: 0, ultCigarro: 0, combo: 0, maxCombo: 0, castigos: 0, racha: 0, escudo: 0 });
      }
      for (const r of s.retos) { if (s.users[r.de]) s.users[r.de].fichas += r.cant; if (r.hasta && s.users[r.a]) s.users[r.a].fichas += r.cant; }
      for (const p of s.porras) if (s.users[p.u]) s.users[p.u].fichas += p.cant;
      Object.assign(s, { hist: {}, rondas: 0, ultRonda: 0, happy: 0, diana: null, t0: 0, feed: [], retos: [], porras: [] });
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
    let txt = lista[Math.abs(semilla) % lista.length].replaceAll('{n}', NOMBRES[u]).replaceAll('{h}', horasTexto(seg));
    if (principal(u) === 'cubata') {
      txt = txt.replace(/\buna cerveza\b/gi, 'un cubata').replace(/\bla cerveza\b/gi, 'el cubata').replace(/\bla birra\b/gi, 'la copa')
        .replace(/\bcervezas\b/gi, 'cubatas').replace(/\bcerveza\b/gi, 'cubata').replace(/\bbirras?\b/gi, 'copa')
        .replace(/\bcañas\b/gi, 'copas').replace(/\bbiberón de Mahou\b/gi, 'biberón de ron');
    }
    return txt;
  }

  return {
    TOPIC, TOPIC_AVISOS, NTFY, USERS, NOMBRES, TIPOS, TIENDA, SIMBOLOS, SLOT_COSTE,
    COMBO_VENTANA, COMBO_MAX, HORA_SECA, RONDA_FICHAS, CLASICO_FICHAS,
    ADMIN, idDe, principal, RETO_PLAZO, RETO_ESPERA, vencerRetos, valorCarta, totalBJ, resultadoBJ, crashValido, CABALLOS, CARRERA_PAGA, PORRA_PAGA, colorRuleta, APUESTAS_RULETA, APUESTAS_DADOS, APUESTA_MIN, SIMBOLOS_RASCA, RASCA_COSTE, PREMIOS_RASCA, premioRasca, tirarRasca, estadoInicial, normalizar, paraSnap, ORDEN, aplicar, puntos, fmtPts, reconstruir, parsear, premioSlot, tirarSlot, totalGrupo,
    secos, insulto, horasTexto, clon,
  };
});
