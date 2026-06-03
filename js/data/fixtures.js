/*
 * fixtures.js — Os 72 jogos da fase de grupos (round-robin de 4 times × 12 grupos).
 *
 * Para a maioria dos grupos as datas são geradas de forma aproximada dentro da
 * janela da fase de grupos (11–27/jun/2026) e DEVEM ser reconferidas na FIFA.
 * O Grupo C (BRASIL) tem cronograma EXPLÍCITO com os adversários por rodada e os
 * jogos do Brasil com data/horário/sede CONFIRMADOS por pesquisa.
 *
 * Cada jogo: { id, grupo, rodada, dataISO, hora, mandante, visitante, sede, cidade }
 *   - mandante/visitante = código da seleção (ver teams.js)
 *   - "mandante" aqui é apenas a ordem do confronto (campo neutro, salvo anfitriões)
 *
 * Expõe: window.WC2026_FIXTURES (array de jogos)
 */
(function () {
  "use strict";

  if (!window.WC2026_GROUPS) {
    throw new Error("fixtures.js requer groups.js carregado antes.");
  }

  const groups = window.WC2026_GROUPS;

  // Padrão de round-robin para 4 times (índices 0..3) em 3 rodadas.
  const ROUNDS = [
    [[0, 1], [2, 3]], // rodada 1
    [[0, 2], [3, 1]], // rodada 2
    [[3, 0], [1, 2]], // rodada 3
  ];

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function iso(day) { return "2026-06-" + pad(day); }

  // Cronograma EXPLÍCITO de grupos específicos (sobrepõe o round-robin genérico).
  // Grupo C: ordem real dos adversários do Brasil + datas/sedes confirmadas.
  const GROUP_SCHEDULES = {
    C: [
      { rodada: 1, mandante: "BRA", visitante: "MAR", dataISO: "2026-06-13", hora: "19:00", sede: "MetLife Stadium",        cidade: "East Rutherford, NJ (EUA)" },
      { rodada: 1, mandante: "SCO", visitante: "HAI", dataISO: "2026-06-14", hora: "16:00", sede: "BC Place",               cidade: "Vancouver (CAN)" },
      { rodada: 2, mandante: "BRA", visitante: "HAI", dataISO: "2026-06-19", hora: "21:30", sede: "Lincoln Financial Field", cidade: "Filadélfia, PA (EUA)" },
      { rodada: 2, mandante: "MAR", visitante: "SCO", dataISO: "2026-06-20", hora: "16:00", sede: "Lumen Field",             cidade: "Seattle, WA (EUA)" },
      { rodada: 3, mandante: "SCO", visitante: "BRA", dataISO: "2026-06-24", hora: "19:00", sede: "Hard Rock Stadium",       cidade: "Miami Gardens, FL (EUA)" },
      { rodada: 3, mandante: "HAI", visitante: "MAR", dataISO: "2026-06-24", hora: "19:00", sede: "Mercedes-Benz Stadium",   cidade: "Atlanta, GA (EUA)" },
    ],
  };

  const fixtures = [];

  groups.letters.forEach(function (L, gi) {
    // Cronograma explícito?
    if (GROUP_SCHEDULES[L]) {
      GROUP_SCHEDULES[L].forEach(function (g) {
        fixtures.push({
          id: L + "-" + g.rodada + "-" + g.mandante + "-" + g.visitante,
          grupo: L, rodada: g.rodada, dataISO: g.dataISO, hora: g.hora || "",
          mandante: g.mandante, visitante: g.visitante,
          sede: g.sede || "", cidade: g.cidade || "",
        });
      });
      return;
    }

    // Round-robin genérico com datas aproximadas por rodada.
    const teams = groups.byLetter[L]; // 4 times
    const dayMD = [
      11 + Math.floor(gi / 2),  // rodada 1: 11–16
      17 + Math.floor(gi / 2),  // rodada 2: 17–22
      23 + Math.floor(gi / 2),  // rodada 3: 23–28 (aprox.)
    ];

    ROUNDS.forEach(function (round, r) {
      round.forEach(function (pair) {
        const home = teams[pair[0]];
        const away = teams[pair[1]];
        fixtures.push({
          id: L + "-" + (r + 1) + "-" + home.codigo + "-" + away.codigo,
          grupo: L, rodada: r + 1, dataISO: iso(dayMD[r]), hora: "",
          mandante: home.codigo, visitante: away.codigo, sede: "", cidade: "",
        });
      });
    });
  });

  // Ordena por data, depois por grupo/rodada
  fixtures.sort(function (a, b) {
    if (a.dataISO !== b.dataISO) return a.dataISO < b.dataISO ? -1 : 1;
    if (a.grupo !== b.grupo) return a.grupo < b.grupo ? -1 : 1;
    return a.rodada - b.rodada;
  });

  window.WC2026_FIXTURES = fixtures;
})();
