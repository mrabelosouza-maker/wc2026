/*
 * bracket.js — Template do mata-mata (Round of 32 → Oitavas → Quartas → Semis → Final).
 *
 * Cada confronto é descrito por POSIÇÃO, não por seleção: "vencedor do grupo X",
 * "2º colocado do grupo Y" ou "um dos 8 melhores 3º colocados". Conforme a fase
 * de grupos termina, standings.js preenche as seleções reais.
 *
 * ⚠️ ESTRUTURA APROXIMADA: a planilha oficial da FIFA (Annex C) define 495 cenários
 *    para alocar os 8 melhores terceiros aos vencedores de grupo conforme QUAIS
 *    grupos fornecem terceiros. Aqui usamos um template auto-consistente (sem
 *    confrontos do mesmo grupo no R32; 8 jogos 1º×3º, 4 jogos 1º×2º, 4 jogos 2º×2º)
 *    e os terceiros são alocados por ordem de ranking. Reconcilie com a FIFA.
 *
 * Tipos de "slot":
 *   { win: "A" }   → 1º colocado do grupo A
 *   { run: "A" }   → 2º colocado do grupo A
 *   { third: n }   → n-ésimo melhor 3º colocado (1..8)
 *   { from: "id" } → vencedor do confronto "id"
 *
 * Expõe: window.WC2026_BRACKET = { rounds: [...], byId: {...} }
 */
(function () {
  "use strict";

  // ---- Round of 32 (16 jogos) ----
  // 8 jogos: vencedor de grupo × melhor terceiro
  // 4 jogos: vencedor de grupo × segundo colocado
  // 4 jogos: segundo × segundo
  const R32 = [
    { id: "R32-01", a: { win: "A" }, b: { third: 1 } },
    { id: "R32-02", a: { win: "B" }, b: { third: 2 } },
    { id: "R32-03", a: { win: "C" }, b: { third: 3 } }, // caminho provável do Brasil (1ºC)
    { id: "R32-04", a: { win: "D" }, b: { third: 4 } },
    { id: "R32-05", a: { win: "E" }, b: { third: 5 } },
    { id: "R32-06", a: { win: "F" }, b: { third: 6 } },
    { id: "R32-07", a: { win: "G" }, b: { third: 7 } },
    { id: "R32-08", a: { win: "H" }, b: { third: 8 } },
    { id: "R32-09", a: { win: "I" }, b: { run: "A" } },
    { id: "R32-10", a: { win: "J" }, b: { run: "B" } },
    { id: "R32-11", a: { win: "K" }, b: { run: "D" } },
    { id: "R32-12", a: { win: "L" }, b: { run: "E" } },
    { id: "R32-13", a: { run: "C" }, b: { run: "F" } },
    { id: "R32-14", a: { run: "G" }, b: { run: "H" } },
    { id: "R32-15", a: { run: "I" }, b: { run: "J" } },
    { id: "R32-16", a: { run: "K" }, b: { run: "L" } },
  ];

  // ---- Oitavas (Round of 16) — 8 jogos ----
  const R16 = [
    { id: "R16-1", a: { from: "R32-01" }, b: { from: "R32-02" } },
    { id: "R16-2", a: { from: "R32-03" }, b: { from: "R32-04" } },
    { id: "R16-3", a: { from: "R32-05" }, b: { from: "R32-06" } },
    { id: "R16-4", a: { from: "R32-07" }, b: { from: "R32-08" } },
    { id: "R16-5", a: { from: "R32-09" }, b: { from: "R32-10" } },
    { id: "R16-6", a: { from: "R32-11" }, b: { from: "R32-12" } },
    { id: "R16-7", a: { from: "R32-13" }, b: { from: "R32-14" } },
    { id: "R16-8", a: { from: "R32-15" }, b: { from: "R32-16" } },
  ];

  // ---- Quartas — 4 jogos ----
  const QF = [
    { id: "QF-1", a: { from: "R16-1" }, b: { from: "R16-2" } },
    { id: "QF-2", a: { from: "R16-3" }, b: { from: "R16-4" } },
    { id: "QF-3", a: { from: "R16-5" }, b: { from: "R16-6" } },
    { id: "QF-4", a: { from: "R16-7" }, b: { from: "R16-8" } },
  ];

  // ---- Semis — 2 jogos ----
  const SF = [
    { id: "SF-1", a: { from: "QF-1" }, b: { from: "QF-2" } },
    { id: "SF-2", a: { from: "QF-3" }, b: { from: "QF-4" } },
  ];

  // ---- Final ----
  const FINAL = [
    { id: "FINAL", a: { from: "SF-1" }, b: { from: "SF-2" } },
  ];

  const rounds = [
    { fase: "Round of 32", chave: "R32", datas: "28/jun – 1/jul", jogos: R32 },
    { fase: "Oitavas",     chave: "R16", datas: "2 – 5/jul",      jogos: R16 },
    { fase: "Quartas",     chave: "QF",  datas: "6 – 9/jul",      jogos: QF },
    { fase: "Semifinais",  chave: "SF",  datas: "10 – 11/jul",    jogos: SF },
    { fase: "Final",       chave: "FINAL", datas: "19/jul",       jogos: FINAL },
  ];

  const byId = {};
  rounds.forEach(function (r) {
    r.jogos.forEach(function (j) { byId[j.id] = j; });
  });

  // Rótulo legível de um slot (antes de definidas as seleções).
  function slotLabel(slot) {
    if (slot.win) return "Vencedor " + slot.win;
    if (slot.run) return "2º " + slot.run;
    if (slot.third) return slot.third + "º melhor 3º";
    if (slot.from) return "Vencedor " + slot.from;
    return "?";
  }

  window.WC2026_BRACKET = {
    rounds: rounds,
    byId: byId,
    slotLabel: slotLabel,
  };
})();
