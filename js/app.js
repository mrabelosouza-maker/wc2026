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

  // ---------- render: projeção do mata-mata (caminho até a final) ----------
  function renderProjection() {
    // Projeção dos favoritos (campeão/final) e caminho forçado do Brasil.
    const fav = SIM.projectBracket(state, null);
    const bra = SIM.projectBracket(state, "BRA");

    // Resumo: final e campeão projetados.
    const fg = fav.finalGame || {};
    let resumo = "<div class='proj-cards'>";
    resumo += "<div class='proj-card'><div class='proj-k'>Final provável</div>" +
      "<div class='proj-v'>" + (fg.a ? tlabel(fg.a) : "?") + " <span class='x'>×</span> " +
      (fg.b ? tlabel(fg.b) : "?") + "</div></div>";
    resumo += "<div class='proj-card champ'><div class='proj-k'>🏆 Campeão projetado</div>" +
      "<div class='proj-v'>" + (fav.champion ? tlabel(fav.champion) : "?") + "</div></div>";
    resumo += "</div>";
    $("#projecao-resumo").innerHTML = resumo;

    // Chaveamento projetado COMPLETO (todos os confrontos).
    renderProjectionBracket(fav.fill);

    // Caminho do Brasil.
    let html = "<div class='caminho-titulo'>🇧🇷 Caminho do Brasil até a final</div>";
    if (!bra.path || !bra.path.length) {
      html += "<p class='hint'>Caminho indisponível.</p>";
    } else {
      html += "<div class='caminho-trilha'>";
      bra.path.forEach(function (step) {
        const provavel = step.pWin >= 0.5;
        html += "<div class='caminho-passo " + (provavel ? "" : "risco") + "'>" +
          "<div class='cp-fase'>" + step.fase + "</div>" +
          "<div class='cp-opp'>vs " + tlabel(step.opp) + "</div>" +
          "<div class='cp-prob'>vitória <b>" + pct0(step.pWin) + "</b></div>" +
          "<div class='cp-cum'>chega aqui: " + pct(step.cum) + "</div>" +
          "</div>";
      });
      html += "</div>";
      const last = bra.path[bra.path.length - 1];
      html += "<p class='hint'>Probabilidade de o Brasil <b>chegar à final</b> por este caminho: <b>" +
        pct(last.cum) + "</b>. (Estimativa do caminho favorito; o Monte Carlo acima dá a média sobre todos os cenários.)</p>";
    }
    $("#brasil-caminho").innerHTML = html;
  }

  // desenha o bracket projetado inteiro a partir do fill da projeção
  function renderProjectionBracket(fill) {
    const wrap = $("#projecao-bracket");
    if (!wrap) return;
    wrap.innerHTML = "";
    BRACKET.rounds.forEach(function (round) {
      const col = el("div", "bracket-col");
      col.appendChild(el("h4", null, round.fase));
      col.appendChild(el("div", "datas", round.datas));
      round.jogos.forEach(function (j) {
        const m = fill[j.id] || {};
        const wCode = m.winner ? m.winner.codigo : null;
        const sa = m.a ? { label: tlabel(m.a), cls: isBrasil(m.a.codigo) ? "brasil" : "", code: m.a.codigo }
                       : { label: BRACKET.slotLabel(j.a), cls: "placeholder" };
        const sb = m.b ? { label: tlabel(m.b), cls: isBrasil(m.b.codigo) ? "brasil" : "", code: m.b.codigo }
                       : { label: BRACKET.slotLabel(j.b), cls: "placeholder" };
        const aWin = wCode && sa.code === wCode;
        const bWin = wCode && sb.code === wCode;
        const prob = m.pa != null ? "<span class='bm-prob'>" + pct0(m.pa) + "</span>" : "";
        const box = el("div", "bracket-match");
        box.innerHTML =
          "<div class='bracket-side " + sa.cls + (aWin ? " winner" : "") + "'>" +
            "<span>" + sa.label + "</span>" + (aWin ? prob : "") + "</div>" +
          "<div class='mid'></div>" +
          "<div class='bracket-side " + sb.cls + (bWin ? " winner" : "") + "'>" +
            "<span>" + sb.label + "</span>" + (bWin ? prob : "") + "</div>";
        col.appendChild(box);
      });
      wrap.appendChild(col);
    });
  }

  // ================= ABA ESTATÍSTICAS =================
  const CONF_COLOR = {
    CONMEBOL: "#1f9d55", UEFA: "#2563eb", CAF: "#d97706",
    AFC: "#dc2626", CONCACAF: "#7c3aed", OFC: "#0891b2",
  };
  let statsSort = { key: "power", dir: -1 };
  let statsConf = "", statsGroup = "", statsMetric = "power";

  const METRICS = {
    power: { label: "Índice de Força",   get: function (r) { return r.power; }, better: "high", fmt: function (v) { return Math.round(v); } },
    elo:  { label: "Elo",                get: function (r) { return r.elo; },  better: "high", fmt: function (v) { return Math.round(v); } },
    fifa: { label: "Ranking FIFA (pts)", get: function (r) { return r.fifa; }, better: "high", fmt: function (v) { return Math.round(v); } },
    mv:   { label: "Valor de mercado",   get: function (r) { return r.mv; },   better: "high", fmt: function (v) { return "€" + Math.round(v) + "M"; } },
    form: { label: "Forma (pts/jogo)",   get: function (r) { return r.form; }, better: "high", fmt: function (v) { return v.toFixed(2); } },
    gm:   { label: "Gols marcados/jogo", get: function (r) { return r.gm; },   better: "high", fmt: function (v) { return v.toFixed(2); } },
    gs:   { label: "Gols sofridos/jogo", get: function (r) { return r.gs; },   better: "low",  fmt: function (v) { return v.toFixed(2); } },
    sAtk: { label: "Força ataque",       get: function (r) { return r.sAtk; }, better: "high", fmt: function (v) { return v.toFixed(2); } },
    sDef: { label: "Força defesa",       get: function (r) { return r.sDef; }, better: "low",  fmt: function (v) { return v.toFixed(2); } },
  };

  function statsRows() {
    const FORM = window.WC2026_FORM || { byCode: {} };
    const RAT = window.WC2026_RATINGS || { byCode: {} };
    return TEAMS.list.map(function (t) {
      const f = FORM.byCode[t.codigo] || {};
      const rr = RAT.byCode[t.codigo] || {};
      const elo = (state && state.elos[t.codigo] != null) ? state.elos[t.codigo] : t.elo;
      return {
        team: t, codigo: t.codigo, nome: t.nome, bandeira: t.bandeira, grupo: t.grupo,
        conf: f.conf || "—",
        elo: elo,
        power: elo + (rr.offset || 0),
        fifa: rr.fifaPts != null ? rr.fifaPts : 0,
        mv: rr.mv != null ? rr.mv : 0,
        form: rr.formPpg != null ? rr.formPpg : 0,
        gm: f.atk != null ? f.atk : 0,
        gs: f.dft != null ? f.dft : 0,
        sAtk: f.sAtk != null ? f.sAtk : 1,
        sDef: f.sDef != null ? f.sDef : 1,
      };
    });
  }

  function statsFiltered() {
    return statsRows().filter(function (r) {
      if (statsConf && r.conf !== statsConf) return false;
      if (statsGroup && r.grupo !== statsGroup) return false;
      return true;
    });
  }

  function populateStatsControls() {
    const confs = {};
    statsRows().forEach(function (r) { if (r.conf !== "—") confs[r.conf] = true; });
    const selC = $("#filtro-conf");
    Object.keys(confs).sort().forEach(function (c) {
      const o = document.createElement("option"); o.value = c; o.textContent = c; selC.appendChild(o);
    });
    const selG = $("#filtro-grupo");
    GROUPS.letters.forEach(function (L) {
      const o = document.createElement("option"); o.value = L; o.textContent = "Grupo " + L; selG.appendChild(o);
    });
  }

  function renderBarChart(rows) {
    const m = METRICS[statsMetric];
    const list = rows.slice().sort(function (a, b) {
      const d = m.get(b) - m.get(a);
      return m.better === "low" ? -d : d; // melhor no topo
    });
    const vals = list.map(m.get);
    const max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    const span = (max - min) || 1;
    let html = "";
    list.forEach(function (r) {
      const v = m.get(r);
      const w = 8 + 92 * ((v - min) / span); // 8%..100%
      const cor = CONF_COLOR[r.conf] || "#888";
      html += "<div class='bar-row" + (isBrasil(r.codigo) ? " brasil" : "") + "'>" +
        "<div class='bar-label'>" + r.bandeira + " " + r.nome + "</div>" +
        "<div class='bar-track'><div class='bar-fill' style='width:" + w + "%;background:" + cor + "'></div></div>" +
        "<div class='bar-val'>" + m.fmt(v) + "</div>" +
        "</div>";
    });
    $("#grafico-barras").innerHTML = html || "<p class='hint'>Sem seleções no filtro.</p>";
  }

  function renderScatter(rows) {
    const W = 580, H = 380, ml = 52, mr = 16, mt = 16, mb = 44;
    const gx = rows.map(function (r) { return r.gm; });
    const gy = rows.map(function (r) { return r.gs; });
    const xmin = 0, xmax = Math.max(3, Math.ceil(Math.max.apply(null, gx) + 0.5));
    const ymin = 0, ymax = Math.max(2, Math.ceil(Math.max.apply(null, gy) + 0.3));
    function X(v) { return ml + (v - xmin) / (xmax - xmin) * (W - ml - mr); }
    function Y(v) { return mt + (1 - (v - ymin) / (ymax - ymin)) * (H - mt - mb); }

    let s = "<svg viewBox='0 0 " + W + " " + H + "' class='scatter-svg' preserveAspectRatio='xMidYMid meet'>";
    // grades + eixos
    for (let gxv = 1; gxv <= xmax; gxv++) {
      s += "<line x1='" + X(gxv) + "' y1='" + mt + "' x2='" + X(gxv) + "' y2='" + (H - mb) + "' class='grid'/>";
      s += "<text x='" + X(gxv) + "' y='" + (H - mb + 16) + "' class='axis-txt' text-anchor='middle'>" + gxv + "</text>";
    }
    for (let gyv = 1; gyv <= ymax; gyv++) {
      s += "<line x1='" + ml + "' y1='" + Y(gyv) + "' x2='" + (W - mr) + "' y2='" + Y(gyv) + "' class='grid'/>";
      s += "<text x='" + (ml - 8) + "' y='" + (Y(gyv) + 4) + "' class='axis-txt' text-anchor='end'>" + gyv + "</text>";
    }
    s += "<text x='" + ((ml + W - mr) / 2) + "' y='" + (H - 6) + "' class='axis-lbl' text-anchor='middle'>Gols marcados / jogo →</text>";
    s += "<text x='14' y='" + ((mt + H - mb) / 2) + "' class='axis-lbl' text-anchor='middle' transform='rotate(-90 14 " + ((mt + H - mb) / 2) + ")'>← Gols sofridos / jogo</text>";

    rows.forEach(function (r) {
      const cx = X(r.gm), cy = Y(r.gs);
      const cor = CONF_COLOR[r.conf] || "#888";
      const bra = isBrasil(r.codigo);
      s += "<circle cx='" + cx.toFixed(1) + "' cy='" + cy.toFixed(1) + "' r='" + (bra ? 8 : 5) + "' " +
        "fill='" + (bra ? "#ffce00" : cor) + "' stroke='" + (bra ? "#009c3b" : "#fff") + "' stroke-width='" + (bra ? 2.5 : 1) + "'>" +
        "<title>" + r.nome + " — marca " + r.gm.toFixed(2) + ", sofre " + r.gs.toFixed(2) + " (" + r.conf + ")</title></circle>";
      if (bra) s += "<text x='" + (cx + 11) + "' y='" + (cy + 4) + "' class='pt-lbl'>Brasil</text>";
    });
    s += "</svg>";
    $("#grafico-scatter").innerHTML = s;

    // legenda de confederações
    let leg = "";
    Object.keys(CONF_COLOR).forEach(function (c) {
      leg += "<span class='leg-item'><span class='leg-dot' style='background:" + CONF_COLOR[c] + "'></span>" + c + "</span>";
    });
    $("#scatter-legenda").innerHTML = leg;
  }

  function renderStatsTable(rows) {
    const cols = [
      { key: "nome", label: "Seleção", txt: true },
      { key: "grupo", label: "Grupo" },
      { key: "conf", label: "Conf.", txt: true },
      { key: "power", label: "Índice" },
      { key: "elo", label: "Elo" },
      { key: "fifa", label: "FIFA" },
      { key: "mv", label: "€M" },
      { key: "form", label: "Forma" },
      { key: "gm", label: "GM/j" },
      { key: "gs", label: "GS/j" },
      { key: "sAtk", label: "sAtk" },
      { key: "sDef", label: "sDef" },
    ];
    const sorted = rows.slice().sort(function (a, b) {
      let x = a[statsSort.key], y = b[statsSort.key];
      if (typeof x === "string") { return statsSort.dir * (x < y ? -1 : x > y ? 1 : 0); }
      return statsSort.dir * (x - y);
    });
    let html = "<table class='stats-table'><thead><tr>";
    cols.forEach(function (c) {
      const arrow = statsSort.key === c.key ? (statsSort.dir < 0 ? " ▾" : " ▴") : "";
      html += "<th data-key='" + c.key + "' class='" + (c.txt ? "tleft" : "") + "'>" + c.label + arrow + "</th>";
    });
    html += "</tr></thead><tbody>";
    sorted.forEach(function (r) {
      html += "<tr class='" + (isBrasil(r.codigo) ? "brasil" : "") + "'>" +
        "<td class='tleft'>" + r.bandeira + " " + r.nome + "</td>" +
        "<td>" + r.grupo + "</td>" +
        "<td class='tleft'>" + r.conf + "</td>" +
        "<td><b>" + Math.round(r.power) + "</b></td>" +
        "<td>" + Math.round(r.elo) + "</td>" +
        "<td>" + Math.round(r.fifa) + "</td>" +
        "<td>" + Math.round(r.mv) + "</td>" +
        "<td>" + r.form.toFixed(2) + "</td>" +
        "<td>" + r.gm.toFixed(2) + "</td>" +
        "<td>" + r.gs.toFixed(2) + "</td>" +
        "<td>" + r.sAtk.toFixed(2) + "</td>" +
        "<td>" + r.sDef.toFixed(2) + "</td>" +
        "</tr>";
    });
    html += "</tbody></table>";
    const wrap = $("#tabela-stats");
    wrap.innerHTML = html;
    wrap.querySelectorAll("th[data-key]").forEach(function (th) {
      th.addEventListener("click", function () {
        const k = th.dataset.key;
        if (statsSort.key === k) statsSort.dir *= -1;
        else statsSort = { key: k, dir: (k === "nome" || k === "conf" || k === "grupo") ? 1 : -1 };
        renderStats();
      });
    });
  }

  function renderStats() {
    const rows = statsFiltered();
    renderBarChart(rows);
    renderScatter(rows);
    renderStatsTable(rows);
  }

  function setupStatsControls() {
    populateStatsControls();
    $("#filtro-conf").addEventListener("change", function (e) { statsConf = e.target.value; renderStats(); });
    $("#filtro-grupo").addEventListener("change", function (e) { statsGroup = e.target.value; renderStats(); });
    $("#metric-bar").addEventListener("change", function (e) { statsMetric = e.target.value; renderBarChart(statsFiltered()); });
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
    renderProjection();
    renderPredictions();
    renderStats();
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
    setupStatsControls();
    rebuild(true);
    setupPolling();
    $("#rerun-sim").addEventListener("click", function () { runSim(); });
  });
})();
