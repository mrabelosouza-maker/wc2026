/*
 * teams.js — As 48 seleções da Copa do Mundo FIFA 2026.
 * Fonte única de verdade: grupo, código (ISO-ish), bandeira (emoji) e Elo-semente.
 *
 * Os valores de Elo são aproximados (referência: eloratings.net, fim de 2025) e
 * servem apenas como ponto de partida do modelo — a lógica adaptativa recalcula
 * o Elo a cada jogo encerrado. Edite aqui livremente para corrigir/atualizar.
 *
 * ⚠️ Grupos e seleções vêm de pesquisa web e DEVEM ser reconferidos na fonte
 *    oficial da FIFA antes de confiar plenamente.
 *
 * Expõe: window.WC2026_TEAMS
 */
(function () {
  "use strict";

  // grupo, nome, código, bandeira (emoji), elo
  const T = [
    // Grupo A
    ["A", "México",            "MEX", "🇲🇽", 1880],
    ["A", "África do Sul",     "RSA", "🇿🇦", 1715],
    ["A", "Coreia do Sul",     "KOR", "🇰🇷", 1785],
    ["A", "Chéquia",           "CZE", "🇨🇿", 1815],

    // Grupo B
    ["B", "Canadá",            "CAN", "🇨🇦", 1810],
    ["B", "Bósnia e Herz.",    "BIH", "🇧🇦", 1700],
    ["B", "Catar",             "QAT", "🇶🇦", 1650],
    ["B", "Suíça",             "SUI", "🇨🇭", 1880],

    // Grupo C — BRASIL
    ["C", "Brasil",            "BRA", "🇧🇷", 2020],
    ["C", "Marrocos",          "MAR", "🇲🇦", 1860],
    ["C", "Escócia",           "SCO", "🇬🇧", 1775],
    ["C", "Haiti",             "HAI", "🇭🇹", 1500],

    // Grupo D
    ["D", "Estados Unidos",    "USA", "🇺🇸", 1830],
    ["D", "Paraguai",          "PAR", "🇵🇾", 1730],
    ["D", "Austrália",         "AUS", "🇦🇺", 1720],
    ["D", "Turquia",           "TUR", "🇹🇷", 1820],

    // Grupo E
    ["E", "Alemanha",          "GER", "🇩🇪", 1930],
    ["E", "Costa do Marfim",   "CIV", "🇨🇮", 1700],
    ["E", "Equador",           "ECU", "🇪🇨", 1850],
    ["E", "Curaçao",           "CUW", "🇨🇼", 1545],

    // Grupo F
    ["F", "Holanda",           "NED", "🇳🇱", 1955],
    ["F", "Japão",             "JPN", "🇯🇵", 1850],
    ["F", "Tunísia",           "TUN", "🇹🇳", 1690],
    ["F", "Suécia",            "SWE", "🇸🇪", 1780],

    // Grupo G
    ["G", "Bélgica",           "BEL", "🇧🇪", 1925],
    ["G", "Egito",             "EGY", "🇪🇬", 1700],
    ["G", "Irã",               "IRN", "🇮🇷", 1780],
    ["G", "Nova Zelândia",     "NZL", "🇳🇿", 1500],

    // Grupo H
    ["H", "Espanha",           "ESP", "🇪🇸", 2050],
    ["H", "Cabo Verde",        "CPV", "🇨🇻", 1600],
    ["H", "Arábia Saudita",    "KSA", "🇸🇦", 1650],
    ["H", "Uruguai",           "URU", "🇺🇾", 1900],

    // Grupo I
    ["I", "França",            "FRA", "🇫🇷", 2010],
    ["I", "Senegal",           "SEN", "🇸🇳", 1850],
    ["I", "Iraque",            "IRQ", "🇮🇶", 1600],
    ["I", "Noruega",           "NOR", "🇳🇴", 1830],

    // Grupo J
    ["J", "Argentina",         "ARG", "🇦🇷", 2100],
    ["J", "Argélia",           "ALG", "🇩🇿", 1780],
    ["J", "Áustria",           "AUT", "🇦🇹", 1820],
    ["J", "Jordânia",          "JOR", "🇯🇴", 1600],

    // Grupo K
    ["K", "Portugal",          "POR", "🇵🇹", 2000],
    ["K", "Congo RD",          "COD", "🇨🇩", 1680],
    ["K", "Uzbequistão",       "UZB", "🇺🇿", 1650],
    ["K", "Colômbia",          "COL", "🇨🇴", 1880],

    // Grupo L
    ["L", "Inglaterra",        "ENG", "🏴", 2000],
    ["L", "Croácia",           "CRO", "🇭🇷", 1900],
    ["L", "Gana",              "GHA", "🇬🇭", 1680],
    ["L", "Panamá",            "PAN", "🇵🇦", 1650],
  ];

  // Seleções anfitriãs (vantagem leve de mando quando jogam "em casa").
  const HOSTS = new Set(["USA", "MEX", "CAN"]);

  const teams = T.map(function (row) {
    return {
      grupo:    row[0],
      nome:     row[1],
      codigo:   row[2],
      bandeira: row[3],
      elo:      row[4],
      anfitria: HOSTS.has(row[2]),
      destaque: row[2] === "BRA", // Brasil em destaque
    };
  });

  // Índices úteis
  const byCode = {};
  const byName = {};
  teams.forEach(function (t) {
    byCode[t.codigo] = t;
    byName[t.nome] = t;
  });

  window.WC2026_TEAMS = {
    list: teams,
    byCode: byCode,
    byName: byName,
    hosts: HOSTS,
    get: function (key) {
      return byCode[key] || byName[key] || null;
    },
  };
})();
