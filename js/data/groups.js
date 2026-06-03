/*
 * groups.js — Os 12 grupos (A–L) da Copa 2026, derivados de window.WC2026_TEAMS.
 * Mantém a ordem de "cabeças de chave" conforme a lista em teams.js.
 *
 * Expõe: window.WC2026_GROUPS = {
 *   letters: ["A".."L"],
 *   byLetter: { A: [team, team, team, team], ... }
 * }
 */
(function () {
  "use strict";

  if (!window.WC2026_TEAMS) {
    throw new Error("groups.js requer teams.js carregado antes.");
  }

  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const byLetter = {};
  letters.forEach(function (L) { byLetter[L] = []; });

  window.WC2026_TEAMS.list.forEach(function (t) {
    if (byLetter[t.grupo]) byLetter[t.grupo].push(t);
  });

  window.WC2026_GROUPS = {
    letters: letters,
    byLetter: byLetter,
  };
})();
