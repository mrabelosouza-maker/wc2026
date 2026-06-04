/*
 * ratings.js — Índice de Força: combina sinais estáticos (Ranking FIFA, valor de
 * mercado e forma recente) num AJUSTE ao Elo, em pontos de Elo.
 *
 * Cada sinal é padronizado (z-score) entre as 48 seleções e ponderado. O resultado
 * é um "offset" limitado que SOMA ao Elo atual (que continua sendo recalculado a
 * cada jogo). Assim:
 *   - O Elo segue como espinha dorsal e permanece ADAPTATIVO durante a Copa.
 *   - Valor de mercado adiciona "talento de elenco" (que o Elo pode subestimar).
 *   - Forma recente adiciona "momento" (que o Elo demora a refletir).
 *   - Ranking FIFA entra como segunda opinião (peso menor, pois é correlato ao Elo).
 *
 * Índice de Força exibido = Elo_atual + offset.
 *
 * Expõe: window.WC2026_RATINGS = { byCode, weights, scale, clamp }
 */
(function () {
  "use strict";

  const TEAMS = window.WC2026_TEAMS;
  const EXTRAS = window.WC2026_EXTRAS || { byCode: {} };

  // pesos relativos dos sinais (somam 1)
  const W = { fifa: 0.25, mv: 0.45, form: 0.30 };
  const SCALE = 40;   // pontos de Elo por unidade de z combinado
  const CLAMP = 70;   // limite do ajuste (± Elo)

  // defaults p/ seleção sem dado
  const DEF = { fifaPts: 1500, mv: 50, formPpg: 1.8 };

  function get(code, key) {
    const e = EXTRAS.byCode[code];
    return e && e[key] != null ? e[key] : DEF[key];
  }
  function mvLog(v) { return Math.log(v + 1); }

  const codes = TEAMS.list.map(function (t) { return t.codigo; });

  function moments(values) {
    const m = values.reduce(function (s, x) { return s + x; }, 0) / values.length;
    const v = values.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / values.length;
    return { m: m, sd: Math.sqrt(v) || 1 };
  }

  const sF = moments(codes.map(function (c) { return get(c, "fifaPts"); }));
  const sM = moments(codes.map(function (c) { return mvLog(get(c, "mv")); }));
  const sP = moments(codes.map(function (c) { return get(c, "formPpg"); }));

  const byCode = {};
  codes.forEach(function (c) {
    const zF = (get(c, "fifaPts") - sF.m) / sF.sd;
    const zM = (mvLog(get(c, "mv")) - sM.m) / sM.sd;
    const zP = (get(c, "formPpg") - sP.m) / sP.sd;
    let off = SCALE * (W.fifa * zF + W.mv * zM + W.form * zP);
    off = Math.max(-CLAMP, Math.min(CLAMP, off));
    byCode[c] = {
      offset: off,
      zFifa: zF, zMv: zM, zForm: zP,
      fifaPts: get(c, "fifaPts"), mv: get(c, "mv"), formPpg: get(c, "formPpg"),
    };
  });

  window.WC2026_RATINGS = { byCode: byCode, weights: W, scale: SCALE, clamp: CLAMP };
})();
