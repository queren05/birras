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

  const USERS = ['jorlo', 'alvaro', 'david', 'bianca', 'noelia', 'eider', 'aitor'];
  const NOMBRES = { jorlo: 'Jorlo', alvaro: 'Álvaro', david: 'David', bianca: 'Bianca', noelia: 'Noelia', eider: 'Eider', aitor: 'Aitor' };

  const TIPOS = {
    cerveza: { pts: 1, un: 'una cerveza', nombre: 'Cerveza', plural: 'Cervezas', ico: '🍺', fichas: 10, bebida: true },
    cubata: { pts: 2, un: 'un cubata', nombre: 'Cubata', plural: 'Cubatas', ico: '🥃', fichas: 25, bebida: true },
    chupito: { pts: 0.5, un: 'un chupito', nombre: 'Chupito', plural: 'Chupitos', ico: '🥂', fichas: 15, bebida: true },
    cigarro: { pts: 0.2, un: 'un cigarro', nombre: 'Cigarro', plural: 'Cigarros', ico: '🚬', fichas: 5, bebida: false },
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
        c: { cerveza: 0, cubata: 0, chupito: 0, cigarro: 0 },
        fichas: 0, ultCerveza: ts, ultEv: 0, ultBebida: 0, ultCigarro: 0,
        combo: 0, maxCombo: 0, racha: 0, escudo: 0, castigos: 0,
      };
    }
    return { v: 1, users, happy: 0, rondas: 0, ultRonda: 0, diana: null, feed: [], upto: 0, ids: [] };
  }

  const clon = (o) => JSON.parse(JSON.stringify(o));

  /* Las fotos del estado de antes de añadir gente no traen a los nuevos. */
  function normalizar(s) {
    const vacio = estadoInicial(s.upto || 0).users;
    for (const u of USERS) if (!s.users[u]) s.users[u] = vacio[u];
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
    return msg.time >= s.upto - 120 && !s.ids.includes(msg.id);
  }

  function marcar(s, msg) {
    s.upto = Math.max(s.upto, msg.time);
    s.ids.push(msg.id);
    s.ids = s.ids.filter((_, i, a) => i >= a.length - 60);
  }

  /* Aplica un mensaje {id, time, d} y devuelve efectos para animar. */
  function aplicar(s, msg) {
    const d = msg.d, t = msg.time, ef = [];
    if (!d || !pendiente(s, msg)) return ef;
    const u = d.u, U = s.users[u];
    if (d.k === 'snap' || !U) { return ef; }
    marcar(s, msg);
    const mult = () => (t < s.happy ? 2 : 1);

    if (d.k === 'ev' && TIPOS[d.t]) {
      const T = TIPOS[d.t];
      if (d.n < 0) {
        if (U.c[d.t] > 0) {
          U.c[d.t]--; U.fichas = Math.max(0, U.fichas - T.fichas);
          feed(s, t, u, '↩️', `${NOMBRES[u]} se ha arrepentido de ${T.un}`);
        }
        return ef;
      }
      U.c[d.t]++;
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
      ef.push({ k: 'bebida', u, t: d.t, fichas: ganadas });
      feed(s, t, u, T.ico, `${NOMBRES[u]} +1 ${T.nombre.toLowerCase()}${m > 1 ? ` (x${m})` : ''} · +${ganadas}`);

      if (d.t === 'cerveza') {
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
    '{n}, una hora sin cerveza. ¿Te has hecho del Opus Dei?',
    '{n}, mi abuela bebe más que tú y lleva diez años muerta.',
    '{n}, deja el agua, que no eres un geranio.',
    '¿Esa birra se va a beber sola, {n}? BEBE.',
    '{n}, Jorlo te está mirando con asco.',
    '{n}, eres el Kas de limón de esta mesa.',
    'Vergüenza ajena, {n}. Una hora. UNA.',
    '{n}, hasta el camarero está preocupado por ti.',
    '{n}, pareces el conductor del grupo, y nadie te lo ha pedido.',
    '{n}, ¿estás tomando antibióticos o es que eres un flojo?',
    'Que alguien le dé un biberón de Mahou a {n}.',
    '{n}, la casa no paga a los que no beben. BEBE O VETE.',
    '{n}, tu hígado se está aburriendo. Dale trabajo.',
    'Pringado detectado: {n}. Motivo: sequía.',
    '{n}, esto no es un retiro espiritual, es un bar.',
    '{n}, si no bebes ahora te ponemos en la mesa de los niños.',
  ];
  const INSULTOS_FUERTES = [
    '{n}, DOS HORAS. Te vamos a denunciar por abandono de birra.',
    '{n}, a estas alturas eres un vaso de agua con patas.',
    '{n}, lleva {h} sin beber. Que alguien llame a sus padres.',
    '{n}, si fueras una cerveza serías sin alcohol. Y caliente.',
    '{n}: {h} sin probar gota. Das más pena que un Cruzcampo sin gas.',
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
    estadoInicial, normalizar, aplicar, puntos, fmtPts, reconstruir, parsear, premioSlot, tirarSlot, totalGrupo,
    secos, insulto, horasTexto, clon,
  };
});
