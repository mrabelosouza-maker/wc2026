/*
 * standings.js — Apuração adaptativa a partir dos resultados.
 *
 * A partir de window.WC2026_RESULTS (jogos encerrados), calcula:
 *   - classificação de cada grupo (pts, saldo, gols);
 *   - 1º / 2º / 3º de cada grupo e o ranking dos 8 melhores terceiros;
 *   - Elo "atual" de cada seleção (replay do Elo-semente sobre os jogos encerrados);
 *   - preenchimento do chaveamento (slots → seleções reais) conforme as fases terminam.
 *
 * Critérios de desempate (simplificado): pontos → saldo de gols → gols pró.
 * (A FIFA usa ainda confronto direto e fair-play; reconciliar se necessário.)
 *
 * Expõe: window.WC2026_STANDINGS.compute(results) → estado completo.
 */
(function () {
  "use strict";

  const TEAMS = window.WC2026_TEAMS;
  const GROUPS = window.WC2026_GROUPS;
  const FIXTURES = window.WC2026_FIXTURES;
  const BRACKET = window.WC2026_BRACKET;
  const MODEL = window.WC2026_MODEL;

  function pairKey(a, b) {
    return a < b ? a + "|" + b : b + "|" + a;
  }

  // Indexa resultados encerrados por par de seleções e por bracketId.
  function indexResults(results) {
    const byPair = {};   // "AAA|BBB" -> { gols: {AAA: x, BBB: y}, raw }
    const byBracket = {}; // bracketId -> raw
    const finished = [];  // lista cronológica
    (results.matches || []).forEach(function (m) {
      if (m.status !== "encerrado") return;
      const gm = Number(m.golsMandante);
      const gv = Number(m.golsVisitante);
      if (isNaN(gm) || isNaN(gv)) return;
      const rec = {
        mandante: m.mandante, visitante: m.visitante,
        gm: gm, gv: gv, dataISO: m.dataISO || "",
        fase: m.fase || "grupos", bracketId: m.bracketId || null,
        vencedor: m.vencedor || null, // p/ desempate em pênaltis no mata-mata
      };
      const key = pairKey(m.mandante, m.visitante);
      const gols = {};
      gols[m.mandante] = gm;
      gols[m.visitante] = gv;
      byPair[key] = { gols: gols, raw: rec };
      if (rec.bracketId) byBracket[rec.bracketId] = rec;
      finished.push(rec);
    });
    finished.sort(function (a, b) {
      return (a.dataISO || "") < (b.dataISO || "") ? -1 : 1;
    });
    return { byPair: byPair, byBracket: byBracket, finished: finished };
  }

  // Replay de Elo: parte do Elo-semente e reaplica todos os jogos encerrados.
  function replayElo(finished) {
    const elos = {};
    TEAMS.list.forEach(function (t) { elos[t.codigo] = t.elo; });
    finished.forEach(function (r) {
      if (elos[r.mandante] == null || elos[r.visitante] == null) return;
      const K = r.fase === "grupos" ? 40 : 50; // mata-mata pesa mais
      const up = MODEL.updateElo(elos[r.mandante], elos[r.visitante], r.gm, r.gv, K);
      elos[r.mandante] = up.eloA;
      elos[r.visitante] = up.eloB;
    });
    return elos;
  }

  function emptyRow(team) {
    return { team: team, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pts: 0 };
  }

  function rankRows(rows) {
    return rows.slice().sort(function (x, y) {
      if (y.pts !== x.pts) return y.pts - x.pts;
      if (y.sg !== x.sg) return y.sg - x.sg;
      if (y.gp !== x.gp) return y.gp - x.gp;
      return x.team.nome < y.team.nome ? -1 : 1;
    });
  }

  function computeGroups(idx) {
    const out = {};
    GROUPS.letters.forEach(function (L) {
      const rows = {};
      GROUPS.byLetter[L].forEach(function (t) { rows[t.codigo] = emptyRow(t); });
      let played = 0;

      FIXTURES.filter(function (f) { return f.grupo === L; }).forEach(function (f) {
        const res = idx.byPair[pairKey(f.mandante, f.visitante)];
        if (!res) return;
        const gh = res.gols[f.mandante];
        const ga = res.gols[f.visitante];
        const rh = rows[f.mandante], ra = rows[f.visitante];
        if (!rh || !ra) return;
        played++;
        rh.j++; ra.j++;
        rh.gp += gh; rh.gc += ga; ra.gp += ga; ra.gc += gh;
        if (gh > ga) { rh.v++; ra.d++; rh.pts += 3; }
        else if (gh < ga) { ra.v++; rh.d++; ra.pts += 3; }
        else { rh.e++; ra.e++; rh.pts += 1; ra.pts += 1; }
      });

      Object.values(rows).forEach(function (r) { r.sg = r.gp - r.gc; });
      out[L] = {
        table: rankRows(Object.values(rows)),
        played: played,
        complete: played === 6, // 6 jogos por grupo
      };
    });
    return out;
  }

  // Ranking dos 8 melhores terceiros (entre os grupos cuja fase terminou).
  function computeThirds(groups) {
    const thirds = [];
    GROUPS.letters.forEach(function (L) {
      const g = groups[L];
      if (g.complete && g.table[2]) {
        const r = g.table[2];
        thirds.push({ grupo: L, row: r });
      }
    });
    thirds.sort(function (a, b) {
      if (b.row.pts !== a.row.pts) return b.row.pts - a.row.pts;
      if (b.row.sg !== a.row.sg) return b.row.sg - a.row.sg;
      if (b.row.gp !== a.row.gp) return b.row.gp - a.row.gp;
      return a.row.team.nome < b.row.team.nome ? -1 : 1;
    });
    return thirds.slice(0, 8).map(function (t) { return t.row.team; });
  }

  // Resolve o chaveamento: para cada confronto, define seleção A/B e vencedor.
  function resolveBracket(groups, thirds, idx) {
    const bt = {}; // matchId -> { a, b, winner }

    function slotTeam(slot) {
      if (slot.win) {
        const g = groups[slot.win];
        return g.complete ? g.table[0].team : null;
      }
      if (slot.run) {
        const g = groups[slot.run];
        return g.complete ? g.table[1].team : null;
      }
      if (slot.third) {
        return thirds[slot.third - 1] || null;
      }
      if (slot.from) {
        const prev = bt[slot.from];
        return prev ? prev.winner : null;
      }
      return null;
    }

    // processa rodadas em ordem (R32 → Final) p/ que "from" enxergue vencedores
    BRACKET.rounds.forEach(function (round) {
      round.jogos.forEach(function (j) {
        const a = slotTeam(j.a);
        const b = slotTeam(j.b);
        let winner = null;
        const res = idx.byBracket[j.id];
        if (res) {
          if (res.vencedor) winner = TEAMS.get(res.vencedor);
          else if (res.gm > res.gv) winner = TEAMS.get(res.mandante);
          else if (res.gv > res.gm) winner = TEAMS.get(res.visitante);
        }
        bt[j.id] = { a: a, b: b, winner: winner, res: res || null };
      });
    });
    return bt;
  }

  function compute(results) {
    results = results || { matches: [] };
    const idx = indexResults(results);
    const elos = replayElo(idx.finished);
    const groups = computeGroups(idx);
    const thirds = computeThirds(groups);
    const bracketTeams = resolveBracket(groups, thirds, idx);
    return {
      idx: idx,
      elos: elos,
      groups: groups,
      thirds: thirds,
      bracketTeams: bracketTeams,
      lastUpdate: results.last_update || null,
      source: results.source || null,
    };
  }

  // Devolve um clone de seleção com o Elo atual (p/ alimentar o modelo).
  function teamWithElo(team, elos) {
    if (!team) return null;
    const e = elos[team.codigo];
    if (e == null) return team;
    return Object.assign({}, team, { elo: e });
  }

  window.WC2026_STANDINGS = {
    compute: compute,
    teamWithElo: teamWithElo,
    pairKey: pairKey,
  };
})();
