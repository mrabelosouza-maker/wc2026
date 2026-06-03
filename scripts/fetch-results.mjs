/*
 * fetch-results.mjs — Busca resultados ENCERRADOS da Copa 2026 e regenera
 * data/results.js no formato lido pelo dashboard.
 *
 * Sem dependências externas e SEM API key:
 *   - Fonte primária: TheSportsDB (chave pública de teste "3"), liga FIFA World Cup.
 *   - Se a fonte falhar, mantém o arquivo atual (não apaga resultados).
 *
 * Uso: node scripts/fetch-results.mjs   (Node 18+; usa fetch nativo)
 *
 * Mapeamento de nomes → códigos: as fontes usam nomes em inglês; convertemos
 * para os códigos usados em js/data/teams.js. Edite NAME_TO_CODE se algum
 * nome não casar (o script avisa os não reconhecidos).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "results.js");

// TheSportsDB: liga "FIFA World Cup" = 4429; temporada 2026.
const SPORTSDB_URL = "https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026";

// nome normalizado (sem acento, minúsculo) → código
const NAME_TO_CODE = {
  "mexico": "MEX", "south africa": "RSA", "south korea": "KOR", "korea republic": "KOR",
  "czechia": "CZE", "czech republic": "CZE",
  "canada": "CAN", "bosnia and herzegovina": "BIH", "bosnia": "BIH", "qatar": "QAT", "switzerland": "SUI",
  "brazil": "BRA", "brasil": "BRA", "morocco": "MAR", "scotland": "SCO", "haiti": "HAI",
  "united states": "USA", "usa": "USA", "paraguay": "PAR", "australia": "AUS", "turkey": "TUR", "turkiye": "TUR",
  "germany": "GER", "ivory coast": "CIV", "cote d'ivoire": "CIV", "ecuador": "ECU", "curacao": "CUW",
  "netherlands": "NED", "japan": "JPN", "tunisia": "TUN", "sweden": "SWE",
  "belgium": "BEL", "egypt": "EGY", "iran": "IRN", "ir iran": "IRN", "new zealand": "NZL",
  "spain": "ESP", "cape verde": "CPV", "cabo verde": "CPV", "saudi arabia": "KSA", "uruguay": "URU",
  "france": "FRA", "senegal": "SEN", "iraq": "IRQ", "norway": "NOR",
  "argentina": "ARG", "algeria": "ALG", "austria": "AUT", "jordan": "JOR",
  "portugal": "POR", "dr congo": "COD", "congo dr": "COD", "uzbekistan": "UZB", "colombia": "COL",
  "england": "ENG", "croatia": "CRO", "ghana": "GHA", "panama": "PAN",
};

function norm(s) {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim();
}
function code(name) { return NAME_TO_CODE[norm(name)] || null; }

function isFinished(ev) {
  const st = norm(ev.strStatus);
  const done = st === "match finished" || st === "ft" || st === "finished" || st === "aet" || st === "pen";
  const hasScore = ev.intHomeScore != null && ev.intAwayScore != null &&
    ev.intHomeScore !== "" && ev.intAwayScore !== "";
  return done && hasScore;
}

// "Group Stage" / "Round of 32" / etc. → fase do nosso modelo
function faseFrom(ev) {
  const r = norm(ev.strStage || ev.strRound || "");
  if (r.includes("round of 32")) return "R32";
  if (r.includes("round of 16") || r.includes("last 16")) return "R16";
  if (r.includes("quarter")) return "QF";
  if (r.includes("semi")) return "SF";
  if (r.includes("final") && !r.includes("semi")) return "FINAL";
  return "grupos";
}

async function fetchSportsDB() {
  const res = await fetch(SPORTSDB_URL, { headers: { "User-Agent": "wc2026-dashboard" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return data.events || [];
}

function build(events) {
  const matches = [];
  const unknown = new Set();
  for (const ev of events) {
    if (!isFinished(ev)) continue;
    const cH = code(ev.strHomeTeam), cA = code(ev.strAwayTeam);
    if (!cH) unknown.add(ev.strHomeTeam);
    if (!cA) unknown.add(ev.strAwayTeam);
    if (!cH || !cA) continue;
    matches.push({
      mandante: cH, visitante: cA,
      golsMandante: Number(ev.intHomeScore),
      golsVisitante: Number(ev.intAwayScore),
      status: "encerrado",
      dataISO: (ev.dateEvent || "").slice(0, 10),
      fase: faseFrom(ev),
      bracketId: null,
      vencedor: null,
    });
  }
  return { matches, unknown: [...unknown] };
}

function serialize(matches, source) {
  const stamp = new Date().toISOString();
  const body = matches.map(function (m) { return "    " + JSON.stringify(m); }).join(",\n");
  return (
    "/* Gerado automaticamente por scripts/fetch-results.mjs. NÃO editar à mão. */\n" +
    "window.WC2026_RESULTS = {\n" +
    "  last_update: " + JSON.stringify(stamp) + ",\n" +
    "  source: " + JSON.stringify(source) + ",\n" +
    "  matches: [\n" + body + (body ? "\n" : "") + "  ],\n" +
    "};\n"
  );
}

(async function main() {
  try {
    const events = await fetchSportsDB();
    const { matches, unknown } = build(events);
    if (unknown.length) {
      console.warn("⚠️ Nomes não reconhecidos (adicione em NAME_TO_CODE):", unknown.join(", "));
    }
    writeFileSync(OUT, serialize(matches, "TheSportsDB"), "utf8");
    console.log("✅ " + matches.length + " jogo(s) encerrado(s) gravado(s) em data/results.js");
  } catch (err) {
    console.error("❌ Falha ao buscar resultados:", err.message);
    console.error("   data/results.js mantido como está (sem sobrescrever).");
    process.exitCode = 0; // não quebra o workflow
  }
})();
