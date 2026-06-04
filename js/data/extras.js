/*
 * extras.js — Sinais ADICIONAIS de força, públicos e estáticos (sem API):
 *   - fifaPts: pontos do Ranking FIFA/Coca-Cola (≈ jun/2026).
 *   - mv:      valor de mercado do elenco em milhões de € (Transfermarkt, aprox.).
 *   - formPpg: forma recente — pontos por jogo nos últimos ~10 jogos (V=3, E=1, D=0).
 *
 * Esses sinais são combinados em js/ratings.js num "Índice de Força" que ajusta o
 * Elo (espinha dorsal do modelo). Valores de seleções menores são estimativas —
 * edite à vontade; estão centralizados aqui.
 *
 * Fontes: FIFA World Ranking (inside.fifa.com), Transfermarkt, ESPN/Sofascore.
 *
 * Expõe: window.WC2026_EXTRAS = { byCode }
 */
(function () {
  "use strict";

  // [código, pontos FIFA, valor de mercado (€M), forma (pts/jogo)]
  const X = [
    ["MEX", 1681, 195, 2.35], ["RSA", 1445, 72, 1.85], ["KOR", 1589, 142, 2.20], ["CZE", 1501, 190, 2.00],
    ["CAN", 1556, 203, 2.10], ["BIH", 1415, 149, 1.95], ["QAT", 1450, 20, 1.75], ["SUI", 1649, 334, 2.30],
    ["BRA", 1761, 912, 1.70], ["MAR", 1756, 488, 2.45], ["SCO", 1498, 175, 2.00], ["HAI", 1320, 30, 1.55],
    ["USA", 1673, 444, 2.35], ["PAR", 1503, 157, 1.90], ["AUS", 1581, 41, 1.90], ["TUR", 1599, 494, 2.25],
    ["GER", 1730, 998, 2.65], ["CIV", 1533, 531, 2.10], ["ECU", 1595, 376, 2.25], ["CUW", 1330, 26, 1.55],
    ["NED", 1758, 837, 2.67], ["JPN", 1660, 285, 2.45], ["TUN", 1483, 54, 1.95], ["SWE", 1515, 200, 2.00],
    ["BEL", 1735, 543, 2.55], ["EGY", 1563, 165, 2.15], ["IRN", 1490, 45, 1.95], ["NZL", 1300, 35, 1.55],
    ["ESP", 1876, 1260, 2.75], ["CPV", 1380, 22, 1.65], ["KSA", 1410, 15, 1.65], ["URU", 1673, 406, 2.35],
    ["FRA", 1877, 1530, 2.80], ["SEN", 1630, 473, 2.20], ["IRQ", 1430, 21, 1.75], ["NOR", 1551, 601, 2.30],
    ["ARG", 1875, 819, 2.80], ["ALG", 1564, 258, 2.15], ["AUT", 1593, 260, 2.25], ["JOR", 1390, 20, 1.65],
    ["POR", 1764, 1020, 2.65], ["COD", 1478, 49, 1.90], ["UZB", 1465, 65, 1.90], ["COL", 1690, 210, 2.20],
    ["ENG", 1826, 1310, 2.10], ["CRO", 1717, 326, 2.30], ["GHA", 1400, 242, 1.75], ["PAN", 1541, 42, 1.85],
  ];

  const byCode = {};
  X.forEach(function (r) {
    byCode[r[0]] = { fifaPts: r[1], mv: r[2], formPpg: r[3] };
  });

  window.WC2026_EXTRAS = { byCode: byCode };
})();
