/*
 * model.js — Motor estatístico (funções puras, sem backend).
 *
 * Pilares:
 *   1. Elo de seleções → probabilidade e gols esperados (λ).
 *   2. Distribuição de Poisson para gols, com correção Dixon-Coles em placares baixos.
 *   3. Atualização de Elo após cada jogo (lógica adaptativa).
 *
 * Expõe: window.WC2026_MODEL
 */
(function () {
  "use strict";

  const HOME_BONUS_ELO = 65;   // bônus de Elo p/ seleção anfitriã jogando "em casa"
  const DIXON_COLES_RHO = -0.05;
  const MAX_GOALS = 8;         // teto da matriz de placares
  const BASE_GOALS = 1.35;     // média de gols por time num confronto equilibrado

  // -------- Poisson --------
  function factorial(n) {
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  }

  function poisson(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
  }

  // -------- Elo → gols esperados (λ) --------
  // Modelo de SUPREMACIA aditiva: o total de gols esperado fica ~constante e a
  // diferença de Elo define a "supremacia" (diferença de gols esperada), repartida
  // entre os dois lados. Calibrado para não ficar exageradamente confiante.
  function eloToLambdas(eloA, eloB) {
    const diff = eloA - eloB;
    let sup = diff / 250;                        // supremacia (diferença de gols)
    sup = Math.max(-2.2, Math.min(2.2, sup));    // limita a vantagem máxima
    let la = BASE_GOALS + sup / 2;               // total ~2*BASE_GOALS, repartido
    let lb = BASE_GOALS - sup / 2;
    la = Math.min(4.5, Math.max(0.15, la));
    lb = Math.min(4.5, Math.max(0.15, lb));
    return { la: la, lb: lb };
  }

  // Elo efetivo considerando mando (apenas anfitriões ganham bônus).
  function effectiveElo(team) {
    if (!team) return 1500;
    return team.elo + (team.anfitria ? HOME_BONUS_ELO : 0);
  }

  // -------- Matriz de placares (Poisson + Dixon-Coles) --------
  function scoreMatrix(la, lb) {
    const m = [];
    let total = 0;
    for (let h = 0; h <= MAX_GOALS; h++) {
      m[h] = [];
      for (let a = 0; a <= MAX_GOALS; a++) {
        let p = poisson(h, la) * poisson(a, lb);
        // correção Dixon-Coles para placares baixos
        if (h <= 1 && a <= 1) {
          let tau = 1;
          if (h === 0 && a === 0) tau = 1 - la * lb * DIXON_COLES_RHO;
          else if (h === 0 && a === 1) tau = 1 + la * DIXON_COLES_RHO;
          else if (h === 1 && a === 0) tau = 1 + lb * DIXON_COLES_RHO;
          else if (h === 1 && a === 1) tau = 1 - DIXON_COLES_RHO;
          p *= tau;
        }
        m[h][a] = p;
        total += p;
      }
    }
    // normaliza
    if (total > 0) {
      for (let h = 0; h <= MAX_GOALS; h++)
        for (let a = 0; a <= MAX_GOALS; a++) m[h][a] /= total;
    }
    return m;
  }

  // -------- 1X2 a partir da matriz --------
  function oneXtwo(matrix) {
    let win = 0, draw = 0, loss = 0;
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        const p = matrix[h][a];
        if (h > a) win += p;
        else if (h === a) draw += p;
        else loss += p;
      }
    }
    return { win: win, draw: draw, loss: loss };
  }

  // -------- Placar mais provável --------
  function mostLikelyScore(matrix) {
    let best = { h: 0, a: 0, p: -1 };
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        if (matrix[h][a] > best.p) best = { h: h, a: a, p: matrix[h][a] };
      }
    }
    return best;
  }

  // -------- Predição completa de um confronto --------
  // teamA / teamB são objetos de WC2026_TEAMS (ou null). neutral=true zera o mando.
  function predict(teamA, teamB, opts) {
    opts = opts || {};
    const eloA = opts.neutral ? (teamA ? teamA.elo : 1500) : effectiveElo(teamA);
    const eloB = opts.neutral ? (teamB ? teamB.elo : 1500) : effectiveElo(teamB);
    const L = eloToLambdas(eloA, eloB);
    const matrix = scoreMatrix(L.la, L.lb);
    return {
      lambdas: L,
      matrix: matrix,
      probs: oneXtwo(matrix),
      placar: mostLikelyScore(matrix),
    };
  }

  // -------- Atualização de Elo (adaptativo) --------
  // result: 1 = A venceu, 0.5 = empate, 0 = B venceu. K alto p/ Copa.
  function updateElo(eloA, eloB, golsA, golsB, K) {
    K = K || 40;
    const result = golsA > golsB ? 1 : (golsA === golsB ? 0.5 : 0);
    const expA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    // multiplicador por saldo de gols (margem de vitória)
    const gd = Math.abs(golsA - golsB);
    let mult = 1;
    if (gd === 2) mult = 1.5;
    else if (gd === 3) mult = 1.75;
    else if (gd >= 4) mult = 1.75 + (gd - 3) / 8;
    const delta = K * mult * (result - expA);
    return { eloA: eloA + delta, eloB: eloB - delta };
  }

  // -------- Amostragem de um placar (para Monte Carlo) --------
  // rng: função 0..1. Retorna {h,a} amostrado da matriz.
  function sampleScore(matrix, rng) {
    let r = rng();
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        r -= matrix[h][a];
        if (r <= 0) return { h: h, a: a };
      }
    }
    return { h: 0, a: 0 };
  }

  // Prob. de A vencer um mata-mata (90' + prorrogação → pênaltis ~50/50 no limite).
  function knockoutWinProb(probs) {
    // distribui o empate: metade resolve no Elo (proporcional), metade nos pênaltis
    const decisive = probs.win + probs.loss;
    const pPlayWin = decisive > 0 ? probs.win / decisive : 0.5;
    // empate vira pênaltis levemente puxado p/ favorito
    return probs.win + probs.draw * (0.5 + (pPlayWin - 0.5) * 0.6);
  }

  window.WC2026_MODEL = {
    HOME_BONUS_ELO: HOME_BONUS_ELO,
    poisson: poisson,
    eloToLambdas: eloToLambdas,
    effectiveElo: effectiveElo,
    scoreMatrix: scoreMatrix,
    oneXtwo: oneXtwo,
    mostLikelyScore: mostLikelyScore,
    predict: predict,
    updateElo: updateElo,
    sampleScore: sampleScore,
    knockoutWinProb: knockoutWinProb,
  };
})();
