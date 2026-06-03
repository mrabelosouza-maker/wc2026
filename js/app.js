/*
 * app.js — Orquestração da UI: abas, render e loop adaptativo.
 *
 * Fluxo: carrega dados (globais) → standings.compute() → render →
 *        Monte Carlo → render. Em http(s), faz polling de data/results.js
 *        para atualizar sozinho conforme a Copa avança.
 */
(function () {
  "use strict";

  const TEAMS = window.WC2026_TEAMS;
  const GROUPS = window.WC2026_GROUPS;
  const FIXTURES = window.WC2026_FIXTURES;
  const BRACKET = window.WC2026_BRACKET;
  const STAND = window.WC2026_STANDINGS;
  const MODEL = window.WC2026_MODEL;
  const SIM = window.WC2026_SIM;

  const SIM_N = 3000;
  const POLL_MS = 60000;

  let state = null;
  let lastSim = null;

  // ---------- helpers ----------
  const $ = function (sel) { return document.querySelector(sel); };
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function pct(x) { return (x * 100).toFixed(1) + "%"; }
  function pct0(x) { return Math.round(x * 100) + "%"; }
  function isBrasil(code) { return code === "BRA"; }
  function tlabel(team) { return team ? team.bandeira + " " + team.nome : "?"; }

  function fmtData(iso, hora) {
    if (!iso) return "";
    const p = iso.split("-");
    const d = p[2] + "/" + p[1];
    return hora ? d + " " + hora : d;
  }

  // ---------- abas ----------
  function setupTabs() {
    document.querySelectorAll(".tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (b) { b.classList.remove("active"); });
        document.querySelectorAll(".tabpanel").forEach(function (p) { p.classList.remove("active"); });
        btn.classList.add("active");
        $("#tab-" + btn.dataset.tab).classList.add("active");
      });
    });
  }

  // ---------- render: grupos ----------
  function renderGroups() {
    const grid = $("#grupos-grid");
    grid.innerHTML = "";
    GROUPS.letters.forEach(function (L) {
      const g = state.groups[L];
      const card = el("div", "grupo-card");
      card.appendChild(el("h3", null, "Grupo " + L + (g.complete ? " ✓" : "")));
      const t = el("table", "grupo-table");
      t.innerHTML =
        "<tr><th class='pos'></th><th style='text-align:left'>Seleção</th>" +
        "<th>J</th><th>SG</th><th>Pts</th></tr>";
      g.table.forEach(function (r, i) {
        const tr = el("tr", i === 0 ? "q1" : (i === 1 ? "q2" : (i === 2 ? "q3" : "")));
        if (isBrasil(r.team.codigo)) tr.classList.add("row-brasil");
        tr.innerHTML =
          "<td class='pos'>" + (i + 1) + "</td>" +
          "<td class='team-name'><span class='flag'>" + r.team.bandeira + "</span>" + r.team.nome + "</td>" +
          "<td>" + r.j + "</td>" +
          "<td>" + (r.sg > 0 ? "+" + r.sg : r.sg) + "</td>" +
          "<td><b>" + r.pts + "</b></td>";
        t.appendChild(tr);
      });
      card.appendChild(t);
      grid.appendChild(card);
    });
  }

  // ---------- render: calendário ----------
  function renderCalendar() {
    const wrap = $("#calendario-lista");
    wrap.innerHTML = "";
    // agrupa por data
    const porDia = {};
    FIXTURES.forEach(function (f) {
      (porDia[f.dataISO] = porDia[f.dataISO] || []).push(f);
    });
    Object.keys(porDia).sort().forEach(function (dia) {
      const bloco = el("div", "dia-bloco");
      bloco.appendChild(el("div", "dia-head", "📅 " + fmtData(dia)));
      porDia[dia].forEach(function (f) {
        const home = TEAMS.byCode[f.mandante];
        const away = TEAMS.byCode[f.visitante];
        const res = state.idx.byPair[STAND.pairKey(f.mandante, f.visitante)];
        const placar = res
          ? res.gols[f.mandante] + " × " + res.gols[f.visitante]
          : (f.hora || "—");
        const brasil = isBrasil(f.mandante) || isBrasil(f.visitante);
        const j = el("div", "jogo" + (brasil ? " is-brasil" : ""));
        j.innerHTML =
          "<div class='home'>" + tlabel(home) + "</div>" +
          "<div class='placar'>" + placar + "</div>" +
          "<div class='away'>" + tlabel(away) +
            "<span class='badge-grupo'>G" + f.grupo + " · R" + f.rodada + "</span></div>" +
          "<div class='meta'>" + (f.sede ? f.sede + "<br>" + f.cidade : "") + "</div>";
        bloco.appendChild(j);
      });
      wrap.appendChild(bloco);
    });
  }

  // ---------- render: bracket ----------
  function bracketSide(slot, teamObj) {
    if (teamObj) {
      const cls = isBrasil(teamObj.codigo) ? "brasil" : "";
      return { label: tlabel(teamObj), cls: cls, team: teamObj };
    }
    return { label: BRACKET.slotLabel(slot), cls: "placeholder", team: null };
  }

  function renderBracket() {
    const wrap = $("#bracket");
    wrap.innerHTML = "";
    BRACKET.rounds.forEach(function (round) {
      const col = el("div", "bracket-col");
      col.appendChild(el("h4", null, round.fase));
      col.appendChild(el("div", "datas", round.datas));
      round.jogos.forEach(function (j) {
        const bt = state.bracketTeams[j.id] || {};
        const sa = bracketSide(j.a, bt.a);
        const sb = bracketSide(j.b, bt.b);
        const winCode = bt.winner ? bt.winner.codigo : null;
        const m = el("div", "bracket-match");
        const aWin = winCode && bt.a && bt.a.codigo === winCode;
        const bWin = winCode && bt.b && bt.b.codigo === winCode;
        m.innerHTML =
          "<div class='bracket-side " + sa.cls + (aWin ? " winner" : "") + "'>" +
            "<span>" + sa.label + "</span></div>" +
          "<div class='mid'></div>" +
          "<div class='bracket-side " + sb.cls + (bWin ? " winner" : "") + "'>" +
            "<span>" + sb.label + "</span></div>";
        col.appendChild(m);
      });
      wrap.appendChild(col);
    });
  }

  // ---------- render: previsões por jogo ----------
  function predForMatch(codeA, codeB) {
    const a = STAND.teamWithElo(TEAMS.byCode[codeA], state.elos);
    const b = STAND.teamWithElo(TEAMS.byCode[codeB], state.elos);
    return MODEL.predict(a, b);
  }

  function prevCard(codeA, codeB, dataLabel, contextLabel, res) {
    const home = TEAMS.byCode[codeA], away = TEAMS.byCode[codeB];
    const pred = predForMatch(codeA, codeB);
    const p = pred.probs;
    const brasil = isBrasil(codeA) || isBrasil(codeB);
    const card = el("div", "prev-card" + (brasil ? " is-brasil" : ""));

    let html =
      "<div class='prev-head'><span>" + contextLabel + "</span>" +
        "<span class='data'>" + dataLabel + "</span></div>" +
      "<div class='prev-teams'><span>" + tlabel(home) + "</span>" +
        "<span>" + tlabel(away) + "</span></div>" +
      "<div class='prob-bar'>" +
        "<div class='pw' style='width:" + (p.win * 100) + "%'>" + pct0(p.win) + "</div>" +
        "<div class='pd' style='width:" + (p.draw * 100) + "%'>" + pct0(p.draw) + "</div>" +
        "<div class='pl' style='width:" + (p.loss * 100) + "%'>" + pct0(p.loss) + "</div>" +
      "</div>" +
      "<div class='prob-legend'><span>Vitória " + home.codigo + "</span>" +
        "<span>Empate</span><span>Vitória " + away.codigo + "</span></div>" +
      "<div class='prev-placar'>Placar mais provável: <b>" +
        pred.placar.h + " × " + pred.placar.a + "</b> (" + pct(pred.placar.p) + ")</div>";

    if (res) {
      const gA = res.gols[codeA], gB = res.gols[codeB];
      const realOut = gA > gB ? "win" : (gA === gB ? "draw" : "loss");
      const predOut = p.win >= p.draw && p.win >= p.loss ? "win"
        : (p.draw >= p.loss ? "draw" : "loss");
      const acerto = realOut === predOut;
      html += "<div class='prev-real'>Resultado: <b>" + gA + " × " + gB + "</b> — modelo " +
        "<span class='" + (acerto ? "acerto'>acertou ✓" : "erro'>errou ✗") + "</span></div>";
    }
    card.innerHTML = html;
    return card;
  }

  function renderPredictions() {
    const wrap = $("#previsoes-lista");
    wrap.innerHTML = "";

    // jogos de grupo (ordenados por data)
    FIXTURES.forEach(function (f) {
      const res = state.idx.byPair[STAND.pairKey(f.mandante, f.visitante)];
      wrap.appendChild(prevCard(
        f.mandante, f.visitante,
        fmtData(f.dataISO, f.hora),
        "Grupo " + f.grupo + " · R" + f.rodada,
        res
      ));
    });

    // mata-mata já definido (ambos os lados conhecidos)
    BRACKET.rounds.forEach(function (round) {
      round.jogos.forEach(function (j) {
        const bt = state.bracketTeams[j.id];
        if (bt && bt.a && bt.b) {
          // normaliza o resultado do mata-mata para o formato { gols: {code:n} }
          let res = null;
          if (bt.res) {
            const gols = {};
            gols[bt.res.mandante] = bt.res.gm;
            gols[bt.res.visitante] = bt.res.gv;
            res = { gols: gols };
          }
          wrap.appendChild(prevCard(
            bt.a.codigo, bt.b.codigo, round.datas, round.fase + " · " + j.id, res
          ));
        }
      });
    });
  }

  // ---------- render: Monte Carlo ----------
  function renderMonteCarlo() {
    if (!lastSim) return;
    $("#mc-n").textContent = lastSim.N.toLocaleString("pt-BR");
    const rows = Object.values(lastSim.porSelecao).sort(function (a, b) {
      return b.campea - a.campea || b.final - a.final || b.grupo - a.grupo;
    });
    const maxC = rows.length ? rows[0].campea || 1 : 1;

    let html =
      "<table class='mc'><tr>" +
      "<th class='tname' style='text-align:left'>Seleção</th>" +
      "<th>Avança</th><th>Oitavas</th><th>Quartas</th><th>Semis</th><th>Final</th><th>🏆 Campeã</th>" +
      "</tr>";
    rows.forEach(function (r) {
      const t = r.team;
      const w = maxC > 0 ? (r.campea / maxC) * 100 : 0;
      html += "<tr class='" + (isBrasil(t.codigo) ? "brasil" : "") + "'>" +
        "<td class='tname'><span class='flag'>" + t.bandeira + "</span>" + t.nome + "</td>" +
        "<td>" + pct0(r.grupo) + "</td>" +
        "<td>" + pct0(r.r16) + "</td>" +
        "<td>" + pct0(r.qf) + "</td>" +
        "<td>" + pct0(r.sf) + "</td>" +
        "<td>" + pct0(r.final) + "</td>" +
        "<td class='barcell'><div class='barfill' style='width:" + w + "%'></div>" +
          "<span>" + pct(r.campea) + "</span></td>" +
        "</tr>";
    });
    html += "</table>";
    $("#mc-tabela").innerHTML = html;
  }

  function runSim() {
    $("#mc-tabela").innerHTML = "<p class='hint'>Simulando " +
      SIM_N.toLocaleString("pt-BR") + " torneios…</p>";
    // adia para não travar o paint
    setTimeout(function () {
      lastSim = SIM.run(state, SIM_N);
      renderMonteCarlo();
    }, 30);
  }

  // ---------- footer ----------
  function updateFooter() {
    const n = state.idx.finished.length;
    const upd = state.lastUpdate ? "Atualizado: " + state.lastUpdate : "Aguardando início da Copa";
    const src = state.source ? " · Fonte: " + state.source : "";
    $("#status-update").textContent = "⚽ " + n + " jogo(s) encerrado(s) · " + upd + src;
  }

  // ---------- ciclo principal ----------
  function rebuild(rerunSim) {
    state = STAND.compute(window.WC2026_RESULTS || { matches: [] });
    renderGroups();
    renderCalendar();
    renderBracket();
    renderPredictions();
    updateFooter();
    if (rerunSim) runSim();
    else renderMonteCarlo();
  }

  // recarrega data/results.js (apenas em http/https)
  function reloadResults() {
    return new Promise(function (resolve) {
      const s = document.createElement("script");
      s.src = "data/results.js?t=" + Date.now();
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.body.appendChild(s);
    });
  }

  function setupPolling() {
    if (!/^https?:$/.test(location.protocol)) return; // file:// não suporta
    let lastUpd = state.lastUpdate;
    setInterval(function () {
      reloadResults().then(function () {
        const r = window.WC2026_RESULTS || {};
        if (r.last_update !== lastUpd) {
          lastUpd = r.last_update;
          rebuild(true); // mudou → recalcula tudo, inclusive Monte Carlo
        }
      });
    }, POLL_MS);
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", function () {
    setupTabs();
    rebuild(true);
    setupPolling();
    $("#rerun-sim").addEventListener("click", function () { runSim(); });
  });
})();
