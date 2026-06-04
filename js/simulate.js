/*
 * simulate.js — Simulação de Monte Carlo do torneio inteiro.
 *
 * Respeita os jogos já encerrados (resultados fixos) e simula os restantes N vezes
 * usando o Elo ATUAL (já recalculado em standings.js) + o modelo de Poisson.
 * Agrega, por seleção: P(avançar do grupo), P(chegar a cada fase) e P(ser campeã).
 *
 * Expõe: window.WC2026_SIM.run(state, N) → { porSelecao: {code: {...}}, N }
 */
(function () {
  "use strict";

  const TEAMS = window.WC2026_TEAMS;
  const GROUPS = window.WC2026_GROUPS;
  const FIXTURES = window.WC2026_FIXTURES;
  const BRACKET = window.WC2026_BRACKET;
  const MODEL = window.WC2026_MODEL;
  const STAND = window.WC2026_STANDINGS;

  function run(state, N) {
    N = N || 4000;
    const elos = state.elos;

    // Seleções com Elo atual (uma vez só).
    const teamByCode = {};
    TEAMS.list.forEach(function (t) {
      teamByCode[t.codigo] = STAND.teamWithElo(t, elos);
    });

    // Cache de predição por par "A|B" (A como mandante).
    const predCache = {};
    function getPred(a, b) {
      const key = a.codigo + "|" + b.codigo;
      if (!predCache[key]) predCache[key] = MODEL.predict(a, b);
      return predCache[key];
    }

    // Jogos de grupo restantes (sem resultado encerrado).
    const remainingGroup = FIXTURES.filter(function (f) {
      return !state.idx.byPair[STAND.pairKey(f.mandante, f.visitante)];
    });

    // Contadores agregados.
    const acc = {};
    TEAMS.list.forEach(function (t) {
      acc[t.codigo] = { grupo: 0, r16: 0, qf: 0, sf: 0, fim: 0, campea: 0, p1: 0, p2: 0 };
    });

    for (let s = 0; s < N; s++) {
      simulateOnce(teamByCode, getPred, remainingGroup, state, acc);
    }

    const porSelecao = {};
    TEAMS.list.forEach(function (t) {
      const c = acc[t.codigo];
      porSelecao[t.codigo] = {
        team: t,
        grupo: c.grupo / N,   // avançar da fase de grupos
        primeiro: c.p1 / N,
        segundo: c.p2 / N,
        r16: c.r16 / N,       // chegar às oitavas
        qf: c.qf / N,         // chegar às quartas
        sf: c.sf / N,         // chegar às semis
        final: c.fim / N,     // chegar à final
        campea: c.campea / N, // título
      };
    });

    return { porSelecao: porSelecao, N: N };
  }

  function simulateOnce(teamByCode, getPred, remainingGroup, state, acc) {
    // 1) Classificação simulada por grupo (parte do estado real e completa).
    const rows = {}; // code -> {pts,gp,gc}
    GROUPS.letters.forEach(function (L) {
      state.groups[L].table.forEach(function (r) {
        rows[r.team.codigo] = { team: r.team, pts: r.pts, gp: r.gp, gc: r.gc };
      });
    });

    // simula jogos de grupo restantes
    remainingGroup.forEach(function (f) {
      const A = teamByCode[f.mandante], B = teamByCode[f.visitante];
      const pred = getPred(A, B);
      const sc = MODEL.sampleScore(pred.matrix, Math.random);
      const rh = rows[f.mandante], ra = rows[f.visitante];
      rh.gp += sc.h; rh.gc += sc.a; ra.gp += sc.a; ra.gc += sc.h;
      if (sc.h > sc.a) rh.pts += 3;
      else if (sc.h < sc.a) ra.pts += 3;
      else { rh.pts += 1; ra.pts += 1; }
    });

    // ordena cada grupo
    const groupRank = {}; // L -> [team,team,team,team]
    const thirdsPool = [];
    GROUPS.letters.forEach(function (L) {
      const arr = GROUPS.byLetter[L].map(function (t) { return rows[t.codigo]; });
      arr.sort(function (x, y) {
        if (y.pts !== x.pts) return y.pts - x.pts;
        const sgx = x.gp - x.gc, sgy = y.gp - y.gc;
        if (sgy !== sgx) return sgy - sgx;
        if (y.gp !== x.gp) return y.gp - x.gp;
        return Math.random() - 0.5; // desempate aleatório
      });
      groupRank[L] = arr.map(function (r) { return r.team; });
      acc[arr[0].team.codigo].p1++;
      acc[arr[1].team.codigo].p2++;
      // top 2 avançam
      acc[arr[0].team.codigo].grupo++;
      acc[arr[1].team.codigo].grupo++;
      thirdsPool.push({ team: arr[2].team, pts: arr[2].pts, sg: arr[2].gp - arr[2].gc, gp: arr[2].gp });
    });

    // 8 melhores terceiros
    thirdsPool.sort(function (a, b) {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.sg !== a.sg) return b.sg - a.sg;
      if (b.gp !== a.gp) return b.gp - a.gp;
      return Math.random() - 0.5;
    });
    const thirds = thirdsPool.slice(0, 8).map(function (t) { return t.team; });
    thirds.forEach(function (t) { acc[t.codigo].grupo++; });

    // 2) Mata-mata
    const simWinners = {};
    function slotTeam(slot) {
      if (slot.win) return groupRank[slot.win][0];
      if (slot.run) return groupRank[slot.run][1];
      if (slot.third) return thirds[slot.third - 1] || null;
      if (slot.from) return simWinners[slot.from] || null;
      return null;
    }
    function decide(a, b, getPred) {
      if (!a) return b;
      if (!b) return a;
      const tA = teamByCode[a.codigo], tB = teamByCode[b.codigo];
      const pred = getPred(tA, tB);
      const pA = MODEL.knockoutWinProb(pred.probs);
      return Math.random() < pA ? a : b;
    }

    const stageCounter = { "R32": "r16", "R16": "qf", "QF": "sf", "SF": "fim", "FINAL": "campea" };

    BRACKET.rounds.forEach(function (round) {
      round.jogos.forEach(function (j) {
        const real = state.bracketTeams[j.id] && state.bracketTeams[j.id].winner;
        const a = slotTeam(j.a), b = slotTeam(j.b);
        let w;
        if (real) {
          w = real; // resultado real já decidido
        } else {
          w = decide(a, b, getPred);
        }
        simWinners[j.id] = w;
        if (w) acc[w.codigo][stageCounter[round.chave]]++;
      });
    });
  }

  // ===================================================================
  // PROJEÇÃO DETERMINÍSTICA do chaveamento (caminho "mais provável").
  // Diferente do Monte Carlo (que é probabilístico), aqui escolhemos o
  // favorito em cada confronto para desenhar UM caminho até a final, com a
  // probabilidade de cada passo. Se forceCode for dado, força aquela seleção a
  // avançar (para mostrar o "caminho se o Brasil passar"), exibindo mesmo assim
  // a probabilidade real de cada jogo.
  // ===================================================================
  function expectedGroupOrder(state, teamByCode) {
    const groupRank = {};
    const thirdsPool = [];
    GROUPS.letters.forEach(function (L) {
      const pts = {};
      state.groups[L].table.forEach(function (r) {
        pts[r.team.codigo] = { team: r.team, pts: r.pts };
      });
      // soma pontos esperados dos jogos restantes do grupo
      FIXTURES.filter(function (f) { return f.grupo === L; }).forEach(function (f) {
        if (state.idx.byPair[STAND.pairKey(f.mandante, f.visitante)]) return; // já jogado
        const A = teamByCode[f.mandante], B = teamByCode[f.visitante];
        const p = MODEL.predict(A, B).probs;
        pts[f.mandante].pts += 3 * p.win + 1 * p.draw;
        pts[f.visitante].pts += 3 * p.loss + 1 * p.draw;
      });
      const arr = GROUPS.byLetter[L].map(function (t) { return pts[t.codigo]; });
      arr.sort(function (x, y) {
        if (y.pts !== x.pts) return y.pts - x.pts;
        return teamByCode[y.team.codigo].elo - teamByCode[x.team.codigo].elo;
      });
      groupRank[L] = arr.map(function (r) { return r.team; });
      thirdsPool.push({ team: arr[2].team, pts: arr[2].pts });
    });
    thirdsPool.sort(function (a, b) {
      if (b.pts !== a.pts) return b.pts - a.pts;
      return teamByCode[b.team.codigo].elo - teamByCode[a.team.codigo].elo;
    });
    const thirds = thirdsPool.slice(0, 8).map(function (t) { return t.team; });
    return { groupRank: groupRank, thirds: thirds };
  }

  function projectBracket(state, forceCode) {
    const teamByCode = {};
    TEAMS.list.forEach(function (t) { teamByCode[t.codigo] = STAND.teamWithElo(t, state.elos); });

    const order = expectedGroupOrder(state, teamByCode);
    const fill = {};

    function slotTeam(slot) {
      if (slot.win) return order.groupRank[slot.win][0];
      if (slot.run) return order.groupRank[slot.run][1];
      if (slot.third) return order.thirds[slot.third - 1] || null;
      if (slot.from) { const p = fill[slot.from]; return p ? p.winner : null; }
      return null;
    }

    BRACKET.rounds.forEach(function (round) {
      round.jogos.forEach(function (j) {
        const a = slotTeam(j.a), b = slotTeam(j.b);
        let winner = null, pa = 1;
        const real = state.bracketTeams[j.id] && state.bracketTeams[j.id].winner;
        if (real) {
          winner = real; pa = 1;
        } else if (a && b) {
          const pAadv = MODEL.knockoutWinProb(MODEL.predict(teamByCode[a.codigo], teamByCode[b.codigo]).probs);
          const forced = forceCode && (a.codigo === forceCode || b.codigo === forceCode);
          if (forced) {
            const forcedIsA = a.codigo === forceCode;
            winner = forcedIsA ? a : b;
            pa = forcedIsA ? pAadv : (1 - pAadv);
          } else {
            winner = pAadv >= 0.5 ? a : b;
            pa = pAadv >= 0.5 ? pAadv : (1 - pAadv);
          }
        } else {
          winner = a || b; pa = 1;
        }
        fill[j.id] = { a: a, b: b, winner: winner, pa: pa };
      });
    });

    // caminho de forceCode (se houver): rodada a rodada
    let path = null;
    if (forceCode) {
      path = [];
      let cum = 1;
      BRACKET.rounds.forEach(function (round) {
        round.jogos.forEach(function (j) {
          const m = fill[j.id];
          if (!m.a || !m.b) return;
          const isA = m.a.codigo === forceCode, isB = m.b.codigo === forceCode;
          if (!isA && !isB) return;
          const opp = isA ? m.b : m.a;
          cum *= m.pa;
          path.push({ fase: round.fase, jogoId: j.id, opp: opp, pWin: m.pa, cum: cum });
        });
      });
    }

    return {
      fill: fill,
      groupRank: order.groupRank,
      thirds: order.thirds,
      finalGame: fill["FINAL"],
      champion: fill["FINAL"] ? fill["FINAL"].winner : null,
      path: path,
    };
  }

  window.WC2026_SIM = { run: run, projectBracket: projectBracket };
})();
