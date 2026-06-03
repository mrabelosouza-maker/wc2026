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

  window.WC2026_SIM = { run: run };
})();
