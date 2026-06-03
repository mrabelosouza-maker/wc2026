/*
 * results.js — Resultados dos jogos JÁ ENCERRADOS da Copa 2026.
 *
 * ⚙️  Este arquivo é REESCRITO automaticamente pelo GitHub Action
 *     (.github/workflows/update-results.yml → scripts/fetch-results.mjs).
 *     Até a Copa começar, ele fica vazio. Você também pode editá-lo à mão
 *     para TESTAR a lógica adaptativa (veja o exemplo comentado abaixo).
 *
 * Formato de cada jogo:
 *   {
 *     mandante: "BRA", visitante: "MAR",   // códigos (ver js/data/teams.js)
 *     golsMandante: 2, golsVisitante: 0,
 *     status: "encerrado",
 *     dataISO: "2026-06-13",
 *     fase: "grupos",                        // "grupos" | "R32" | "R16" | "QF" | "SF" | "FINAL"
 *     bracketId: null,                       // p/ mata-mata: id do confronto (ex.: "R32-03")
 *     vencedor: null                         // p/ pênaltis no mata-mata: código do vencedor
 *   }
 *
 * Expõe: window.WC2026_RESULTS
 */
window.WC2026_RESULTS = {
  last_update: null,
  source: "nenhuma (aguardando início da Copa)",
  matches: [
    // ── EXEMPLO p/ testar a lógica adaptativa (descomente e recarregue a página): ──
    // { mandante: "BRA", visitante: "MAR", golsMandante: 2, golsVisitante: 0,
    //   status: "encerrado", dataISO: "2026-06-13", fase: "grupos", bracketId: null, vencedor: null },
  ],
};
