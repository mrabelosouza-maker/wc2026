/*
 * form.js — Desempenho das seleções nas ELIMINATÓRIAS da Copa 2026.
 *
 * Para cada seleção: confederação + média de gols MARCADOS e SOFRIDOS por jogo na
 * campanha de qualificação. A partir disso calculamos forças de ATAQUE e DEFESA
 * NORMALIZADAS pela média da própria confederação (para comparar maçãs com maçãs,
 * já que o ambiente de gols varia entre CONMEBOL, UEFA, CAF, AFC, CONCACAF, OFC).
 *
 * O modelo (model.js) combina essas forças com o Elo para estimar os gols esperados.
 *
 * Fontes: páginas "2026 FIFA World Cup qualification (<confed>)" da Wikipédia +
 * FIFA.com. Anfitriões (MEX/CAN/USA) não disputaram eliminatórias → estimados via
 * amistosos/Nations League. Valores com confiança "est" são estimativas.
 *
 * Expõe: window.WC2026_FORM = { byCode, confAvg, GLOBAL_AVG }
 */
(function () {
  "use strict";

  // [código, confederação, gols marcados/jogo, gols sofridos/jogo, confiança]
  const E = [
    // CONMEBOL
    ["BRA", "CONMEBOL", 1.33, 0.94, "alta"],
    ["ARG", "CONMEBOL", 1.72, 0.56, "alta"],
    ["URU", "CONMEBOL", 1.22, 0.67, "alta"],
    ["COL", "CONMEBOL", 1.56, 1.00, "alta"],
    ["ECU", "CONMEBOL", 0.78, 0.28, "alta"],
    ["PAR", "CONMEBOL", 0.78, 0.56, "alta"],
    // UEFA
    ["GER", "UEFA", 2.67, 0.50, "alta"],
    ["FRA", "UEFA", 2.67, 0.67, "alta"],
    ["ESP", "UEFA", 3.50, 0.33, "alta"],
    ["POR", "UEFA", 3.33, 1.17, "alta"],
    ["NED", "UEFA", 3.38, 0.50, "alta"],
    ["AUT", "UEFA", 2.75, 0.50, "alta"],
    ["BEL", "UEFA", 3.63, 0.88, "alta"],
    ["SUI", "UEFA", 2.33, 0.33, "alta"],
    ["SCO", "UEFA", 2.17, 1.17, "alta"],
    ["CRO", "UEFA", 3.25, 0.50, "alta"],
    ["CZE", "UEFA", 2.25, 1.00, "media"],
    ["NOR", "UEFA", 4.63, 0.63, "alta"],
    ["ENG", "UEFA", 2.75, 0.20, "alta"], // sofridos pisado de 0.00
    ["BIH", "UEFA", 2.13, 0.88, "media"],
    ["TUR", "UEFA", 2.20, 1.00, "est"],
    ["SWE", "UEFA", 1.70, 1.30, "est"],
    // CAF
    ["EGY", "CAF", 2.00, 0.20, "alta"],
    ["SEN", "CAF", 2.20, 0.30, "alta"],
    ["MAR", "CAF", 2.75, 0.25, "alta"],
    ["CIV", "CAF", 2.50, 0.20, "alta"], // sofridos pisado de 0.00
    ["ALG", "CAF", 2.40, 0.80, "alta"],
    ["TUN", "CAF", 2.20, 0.20, "alta"], // sofridos pisado de 0.00
    ["CPV", "CAF", 1.60, 0.80, "alta"],
    ["RSA", "CAF", 1.50, 0.90, "alta"],
    ["GHA", "CAF", 2.30, 0.60, "alta"],
    ["COD", "CAF", 1.60, 0.90, "est"],
    // AFC
    ["IRN", "AFC", 1.90, 0.80, "alta"],
    ["UZB", "AFC", 1.40, 0.70, "alta"],
    ["KOR", "AFC", 2.00, 0.70, "alta"],
    ["JOR", "AFC", 1.60, 0.80, "alta"],
    ["JPN", "AFC", 2.30, 0.80, "alta"],
    ["AUS", "AFC", 1.80, 0.90, "alta"],
    ["QAT", "AFC", 1.70, 2.40, "alta"],
    ["KSA", "AFC", 1.70, 1.20, "alta"],
    ["IRQ", "AFC", 1.40, 1.00, "est"],
    // CONCACAF
    ["MEX", "CONCACAF", 1.50, 1.00, "est"],
    ["CAN", "CONCACAF", 1.20, 1.50, "est"],
    ["USA", "CONCACAF", 1.40, 1.10, "est"],
    ["PAN", "CONCACAF", 1.50, 0.67, "alta"],
    ["CUW", "CONCACAF", 2.17, 0.50, "alta"],
    ["HAI", "CONCACAF", 1.50, 1.00, "alta"],
    // OFC
    ["NZL", "OFC", 3.00, 0.30, "alta"], // sofridos pisado de 0.00
  ];

  const ATK_FLOOR = 0.5, DEF_FLOOR = 0.25;
  const GLOBAL_AVG = 1.3; // gols/jogo típicos de uma seleção numa Copa

  // monta byCode com pisos
  const byCode = {};
  E.forEach(function (r) {
    byCode[r[0]] = {
      conf: r[1],
      atk: Math.max(ATK_FLOOR, r[2]),
      dft: Math.max(DEF_FLOOR, r[3]),
      confianca: r[4],
    };
  });

  // médias por confederação (baseline para normalizar)
  const sums = {};
  Object.keys(byCode).forEach(function (code) {
    const t = byCode[code];
    const s = sums[t.conf] || (sums[t.conf] = { atk: 0, dft: 0, n: 0 });
    s.atk += t.atk; s.dft += t.dft; s.n++;
  });
  const confAvg = {};
  Object.keys(sums).forEach(function (c) {
    confAvg[c] = { atk: sums[c].atk / sums[c].n, dft: sums[c].dft / sums[c].n };
  });

  // forças normalizadas: sAtk>1 = ataca acima da média da sua confederação;
  // sDef<1 = defende melhor que a média (sofre menos).
  //
  // ENCOLHIMENTO (shrinkage) em direção a 1.0 + limites: as eliminatórias têm
  // forças de oposição muito diferentes entre confederações (uma defesa da CAF que
  // sofreu 0.2 gol/jogo enfrentou adversários mais fracos que uma da CONMEBOL).
  // Sem amortecer, o sinal fica ruidoso demais; por isso regredimos para a média e
  // limitamos a faixa. O Elo (peso maior no model.js) carrega a força absoluta.
  const SHRINK = 0.6;          // 0 = ignora forma, 1 = usa forma crua
  const LO = 0.65, HI = 1.55;  // limites das forças
  function shrink(x) {
    const v = 1 + SHRINK * (x - 1);
    return Math.min(HI, Math.max(LO, v));
  }
  Object.keys(byCode).forEach(function (code) {
    const t = byCode[code];
    const base = confAvg[t.conf];
    t.sAtk = shrink(t.atk / base.atk);
    t.sDef = shrink(t.dft / base.dft);
  });

  window.WC2026_FORM = { byCode: byCode, confAvg: confAvg, GLOBAL_AVG: GLOBAL_AVG };
})();
