/* Puente entre la app nativa (Swift + JavaScriptCore) y la misma lógica de la web (logica.js).
 * Swift le pasa los mensajes de ntfy en texto y recibe vistas ya calculadas en JSON. */
(function (G) {
  'use strict';
  const B = G.Birras;
  let S = null;

  function inicial(ms) {
    const primero = ms.find((m) => m && m.event === 'message');
    return B.reconstruir(ms, null) || B.reconstruir(ms, B.normalizar(B.estadoInicial(primero ? primero.time - 1 : Math.floor(Date.now() / 1000))));
  }
  const P = {
    cargar(json) { S = inicial(JSON.parse(json)); return !!S; },
    aplicar(json) {
      const p = B.parsear(JSON.parse(json));
      if (!p || !S) return '[]';
      if (p.d.k === 'snap') { if (p.d.s.upto > S.upto + 5) S = B.normalizar(B.clon(p.d.s)); return '[]'; }
      if (p.d.k === 'foto') return '[]';
      return JSON.stringify(B.aplicar(S, p));
    },
    snap() { return S ? JSON.stringify({ k: 'snap', s: B.paraSnap(S) }) : ''; },
    constantes() {
      return JSON.stringify({
        orden: B.ORDEN,
        tipos: B.ORDEN.map((t) => Object.assign({ id: t }, B.TIPOS[t])),
        tienda: Object.entries(B.TIENDA).map(([id, x]) => Object.assign({ id }, x)),
        simbolos: B.SIMBOLOS, slotCoste: B.SLOT_COSTE,
        rascaSimbolos: B.SIMBOLOS_RASCA, rascaCoste: B.RASCA_COSTE,
        apuestaMin: B.APUESTA_MIN, comboMax: B.COMBO_MAX, comboVentana: B.COMBO_VENTANA, horaSeca: B.HORA_SECA,
        retoEspera: B.RETO_ESPERA, admin: B.ADMIN, caballos: B.CABALLOS, carreraPaga: B.CARRERA_PAGA, porraPaga: B.PORRA_PAGA,
      });
    },
    premioSlot(json) { return JSON.stringify(B.premioSlot(JSON.parse(json))); },
    premioRasca(json) { return JSON.stringify(B.premioRasca(JSON.parse(json))); },
    tirarSlot() { return JSON.stringify(B.tirarSlot()); },
    tirarRasca() { return JSON.stringify(B.tirarRasca()); },
    ruleta(r, tipo, n) { const A = B.APUESTAS_RULETA[tipo]; return JSON.stringify({ gana: A.gana(r, n), paga: A.paga, nombre: A.nombre(n), color: B.colorRuleta(r) }); },
    dados(a, b, ap) { const A = B.APUESTAS_DADOS[ap]; return JSON.stringify({ gana: A.gana(a + b), paga: A.paga, nombre: A.nombre }); },
    bj(j, c, doble) { return JSON.stringify(B.resultadoBJ(JSON.parse(j), JSON.parse(c), !!doble)); },
    idDe(nombre) { return B.idDe(nombre); },
    insulto(u, seg, semilla) { return B.NOMBRES[u] ? B.insulto(u, seg, semilla) : ''; },

    /* Todo lo que pinta la app, calculado a la vez. */
    vista(yo, now) {
      if (!S) return JSON.stringify({ listo: false });
      const pts = (u) => B.puntos(S.users[u]);
      const secos = B.secos(S, now);
      const secoSet = new Set(secos.map((x) => x.u));
      const orden = B.USERS.slice().sort((a, b) => pts(b) - pts(a) || S.users[b].fichas - S.users[a].fichas);
      const jugadores = orden.map((u) => {
        const U = S.users[u];
        return { id: u, nombre: B.NOMBRES[u], pts: pts(u), ptsTxt: B.fmtPts(pts(u)), fichas: U.fichas, c: B.ORDEN.map((t) => U.c[t] || 0),
          ultima: U.ultCerveza, principal: B.principal(u), seco: secoSet.has(u), castigos: U.castigos || 0, combo: U.combo, maxCombo: U.maxCombo,
          racha: U.racha, escudo: U.escudo, ultBebida: U.ultBebida, primera: U.primera };
      });
      const total = B.USERS.reduce((n, u) => n + pts(u), 0);
      const semilla = Math.floor(now / 10);
      const muro = secos.length ? B.insulto(secos[semilla % secos.length].u, secos[semilla % secos.length].seg, semilla) : null;

      let mio = null;
      if (yo && S.users[yo] && B.USERS.includes(yo)) {
        const U = S.users[yo];
        const enCombo = now - U.ultBebida <= B.COMBO_VENTANA && U.combo >= 1;
        const sig = enCombo ? Math.min(U.combo + 1, B.COMBO_MAX) : 1;
        const pr = B.principal(yo), TP = B.TIPOS[pr];
        const fichasSig = TP.fichas * sig * (now < S.happy ? 2 : 1) * (U.racha ? 2 : 1);
        const pills = [];
        if (enCombo && U.combo >= 2) pills.push(`Combo x${Math.min(U.combo, B.COMBO_MAX)} · ${Math.ceil((B.COMBO_VENTANA - (now - U.ultBebida)) / 60)} min`);
        if (U.racha) pills.push(`🔥 x2 · ${U.racha}`);
        if (now < S.happy) pills.push(`Happy Hour ${Math.ceil((S.happy - now) / 60)} min`);
        if (now < U.escudo) pills.push(`🛡️ ${Math.ceil((U.escudo - now) / 60)} min`);
        const meToca = secos.find((x) => x.u === yo);
        mio = { id: yo, fichas: U.fichas, principal: pr, sigTxt: `+${String(TP.pts).replace('.', ',')} punto${TP.pts === 1 ? '' : 's'} · +${fichasSig} fichas${sig > 1 ? ` · combo x${sig}` : ''}`,
          pills, ultima: U.ultCerveza, seco: !!meToca, bronca: meToca ? B.insulto(yo, meToca.seg, semilla) : null, pos: orden.indexOf(yo) + 1,
          diana: S.diana && S.diana.u === yo && now - S.diana.t < 180 ? { por: B.NOMBRES[S.diana.por] || '', t: S.diana.t } : null };
      }

      // Récords de la noche (igual que en la web)
      const jugaron = B.USERS.filter((u) => Object.values(S.users[u].c).some(Boolean));
      const mejor = (f) => jugaron.slice().sort((a, b) => f(b) - f(a))[0];
      const horas = S.t0 ? Math.max(0.25, (now - S.t0) / 3600) : 0;
      const ritmoU = (u) => S.users[u].primera ? pts(u) / Math.max(0.5, (now - S.users[u].primera) / 3600) : 0;
      const f1 = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
      const rapido = mejor(ritmoU), combo = mejor((u) => S.users[u].maxCombo), fuma = mejor((u) => S.users[u].c.cigarro);
      const seco = jugaron.filter((u) => S.users[u].c.cerveza || S.users[u].ultEv).sort((a, b) => S.users[a].ultCerveza - S.users[b].ultCerveza)[0];
      const records = [
        { etq: 'Ritmo de la mesa', valor: horas ? f1(B.totalGrupo(S) / horas) : '—', sub: 'cervezas por hora' },
        { etq: 'Más rápido', valor: rapido && ritmoU(rapido) ? B.NOMBRES[rapido] : '—', sub: rapido && ritmoU(rapido) ? `${f1(ritmoU(rapido))} puntos por hora` : 'nadie todavía' },
        { etq: 'Mejor combo', valor: combo && S.users[combo].maxCombo > 1 ? `x${Math.min(S.users[combo].maxCombo, B.COMBO_MAX)}` : '—', sub: combo && S.users[combo].maxCombo > 1 ? B.NOMBRES[combo] : 'encadena dos en 20 min' },
        { etq: 'Rondas', valor: String(S.rondas || 0), sub: '3 o más con cerveza en 5 min' },
        { etq: 'Más fumador', valor: fuma && S.users[fuma].c.cigarro ? B.NOMBRES[fuma] : '—', sub: fuma && S.users[fuma].c.cigarro ? `${S.users[fuma].c.cigarro} ${S.users[fuma].c.cigarro === 1 ? 'cigarro' : 'cigarros'}` : 'aire limpio, de momento' },
        { etq: 'Más seco', valor: seco ? B.NOMBRES[seco] : '—', sub: seco ? `seco hace ${B.horasTexto(Math.max(0, now - S.users[seco].ultCerveza))}` : 'nadie ha bebido aún' },
      ];
      const hist = Object.keys(S.hist || {}).map(Number).sort((a, b) => a - b).map((k) => ({ t: k * 900, f: S.hist[k].concat([0, 0, 0, 0, 0]).slice(0, 5) }));
      const noches = (S.noches || []).map((n) => ({ a: n.a, b: n.b, c: n.c.concat([0, 0, 0, 0, 0]).slice(0, 5), p: n.p, pTxt: B.fmtPts(n.p), top: n.top.map((x) => ({ id: x[0], nombre: B.NOMBRES[x[0]] || x[0], ptsTxt: B.fmtPts(x[1]) })) }));
      const retos = (S.retos || []).map((r) => ({ rid: r.rid, de: r.de, a: r.a, deN: B.NOMBRES[r.de] || r.de, aN: B.NOMBRES[r.a] || r.a, cant: r.cant, t: r.t, hasta: r.hasta || 0, copa: B.principal(r.a) === 'cubata' }));
      const porras = (S.porras || []).map((p) => ({ u: p.u, a: p.a, uN: B.NOMBRES[p.u] || p.u, aN: B.NOMBRES[p.a] || p.a, cant: p.cant, t: p.t }));
      return JSON.stringify({
        listo: true, porras, now, jugadores, cervezas: B.totalGrupo(S), tot: B.ORDEN.map((t) => B.totalGrupo(S, t)), puntos: total, ptsTxt: B.fmtPts(total),
        feed: S.feed.map((f) => ({ t: f.t, ico: f.ico, txt: f.txt })), muro, mio, records, hist, noches, retos,
        t0: S.t0 || 0, rondas: S.rondas || 0, happy: S.happy || 0, sinCerveza: S.sinCerveza || [],
      });
    },
  };
  G.P = P;
})(this);
