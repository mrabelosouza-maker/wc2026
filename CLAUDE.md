# CLAUDE.md

Orientações para o Claude Code trabalhar neste repositório.

## O que é

Dashboard **estático** (HTML/CSS/JS puro, **sem backend e sem build step**) sobre a
Copa do Mundo FIFA 2026. Roda offline via `file://` (duplo-clique no `index.html`) e
também no GitHub Pages. Idioma da UI: **PT-BR**.

Três funcionalidades:
1. **Calendário** — 72 jogos de grupos + chaveamento do mata-mata por posição
   ("Vencedor do Grupo X" vs "2º do Grupo Y"). Jogos do **Brasil em destaque**.
2. **Previsões** — modelo Elo → Poisson + Dixon-Coles (1X2 + placar provável) e
   simulação de **Monte Carlo** do torneio (P de avançar/ser campeã).
3. **Lógica adaptativa** — lê resultados encerrados, recalcula Elo a cada jogo,
   preenche o bracket e re-roda as previsões.

## Decisão de arquitetura mais importante

**Os dados são carregados como arquivos `.js` que setam variáveis globais
(`window.WC2026_*`) via `<script>`, NUNCA via `fetch()` de JSON.** Motivo: `fetch()`
de arquivo local é bloqueado por CORS no `file://`. Mantenha esse padrão — qualquer
novo dado deve ser exposto como global em um `.js`, não como `.json` lido por fetch.
(A única exceção é o *polling* de `data/results.js`, que recarrega o próprio `.js`
via tag `<script>` com cache-busting, e só em `http(s)`.)

## Fluxo de dados (ordem de carga = ordem no index.html)

```
teams.js → form.js → extras.js → groups.js → fixtures.js → bracket.js → results.js  (dados, globais)
        ↓
ratings.js (Índice de Força) → model.js (Elo+forma) → standings.js (apura + replay Elo) → simulate.js (MC + projeção)
        ↓
app.js: STAND.compute(WC2026_RESULTS) → render 3 abas → SIM.run()/projectBracket() → render
        ↓
polling (http only): recarrega results.js a cada 60s; se last_update mudou, rebuild()
```

## Arquivos

| Arquivo | Papel | Global exposto |
|---|---|---|
| `js/data/teams.js` | **Fonte de verdade**: 48 seleções, grupo, código, bandeira, Elo-semente | `WC2026_TEAMS` |
| `js/data/form.js` | Gols marcados/sofridos nas **eliminatórias** → forças sAtk/sDef normalizadas por confederação (com encolhimento) | `WC2026_FORM` |
| `js/data/extras.js` | Sinais estáticos: **Ranking FIFA, valor de mercado (€M), forma recente (ppg)** | `WC2026_EXTRAS` |
| `js/ratings.js` | **Índice de Força** = Elo + ajuste (z-scores de FIFA/valor/forma, limitado ±70) | `WC2026_RATINGS` |
| `js/data/groups.js` | Deriva grupos A–L de teams.js | `WC2026_GROUPS` |
| `js/data/fixtures.js` | 72 jogos de grupo; Grupo C (Brasil) tem cronograma explícito/confirmado | `WC2026_FIXTURES` |
| `js/data/bracket.js` | Template R32→Final por slots (`{win/run/third/from}`) | `WC2026_BRACKET` |
| `data/results.js` | Resultados encerrados; **gerado pelo Action** (não editar à mão em prod) | `WC2026_RESULTS` |
| `js/model.js` | Poisson, Dixon-Coles, **blend Índice de Força + forma** (`predict`), `effectiveElo` usa `power`, updateElo, sampleScore, knockoutWinProb | `WC2026_MODEL` |
| `js/standings.js` | Classificação, 8 melhores 3º, replay de Elo, resolução do bracket; `teamWithElo` anexa Elo atual **+ sAtk/sDef + power/offset/extras** | `WC2026_STANDINGS` |
| `js/simulate.js` | Monte Carlo (~3000 sims) → P por fase/título; **`projectBracket`** → caminho favorito/do Brasil | `WC2026_SIM` |
| `js/app.js` | 3 abas (Calendário/Previsões/Estatísticas), render, footer, polling. Inclui chaveamento projetado completo + caminho do Brasil; aba Estatísticas com ranking de barras, scatter SVG ataque×defesa e tabela ordenável (sem libs externas) | — |
| `css/styles.css` | Tema **claro/clean** (variáveis CSS no `:root`) | — |
| `scripts/fetch-results.mjs` | Node, sem deps, sem API key: TheSportsDB → regrava results.js | — |
| `.github/workflows/update-results.yml` | Cron 15 min: roda o script e commita results.js | — |

## Convenções

- **Seleções são referenciadas por código** (ex.: `BRA`, `MAR`) — ver `teams.js`.
  Use `WC2026_TEAMS.byCode[...]` / `.get(...)`.
- JS em **ES5/ES2015 vanilla**, IIFE por arquivo com `"use strict"`. Sem framework,
  sem bundler, sem dependências npm no runtime do site.
- Brasil destacado em toda a UI via checagem `codigo === "BRA"`.
- Funções do modelo são **puras**; nada de estado global mutável fora dos `window.WC2026_*`.
- Cores e espaçamentos saem das **variáveis CSS** em `css/styles.css :root` — alterar
  tema = mexer só ali.

## Formato de um resultado (results.js / fetch script)

```js
{ mandante: "BRA", visitante: "MAR", golsMandante: 2, golsVisitante: 0,
  status: "encerrado", dataISO: "2026-06-13",
  fase: "grupos",        // "grupos"|"R32"|"R16"|"QF"|"SF"|"FINAL"
  bracketId: null,       // mata-mata: id do confronto (ex.: "R32-03")
  vencedor: null }       // mata-mata: código do vencedor nos pênaltis
```

## Rodar / testar / deploy

- **Abrir local:** duplo-clique em `index.html` (ou `python -m http.server` para
  testar o polling como no Pages).
- **Validar sintaxe JS:** `node --check <arquivo>`.
- **Smoke test da lógica (sem navegador):** criar um harness CommonJS que faz
  `globalThis.window = {}` e `eval()` dos arquivos na ordem de carga, depois chama
  `WC2026_STANDINGS.compute(...)` e `WC2026_SIM.run(...)`. Conferir:
  somatório de P(campeã) ≈ 1.0; soma 1X2 ≈ 1.0 por jogo; favoritos coerentes.
- **Testar adaptação:** adicionar resultados em `data/results.js` e recarregar.
- **Buscar resultados de verdade:** `node scripts/fetch-results.mjs` (Node 18+).
- **Deploy:** GitHub Pages "Deploy from a branch" (`main`/root) + Actions com
  permissão de escrita. `.nojekyll` já incluído.

## Cuidados / dívidas conhecidas

- **Dados de grupos, calendário e Elo vêm de pesquisa web** e devem ser reconferidos
  na fonte oficial da FIFA. Centralizados em `js/data/*.js` para correção fácil.
- **Alocação dos 8 melhores terceiros** no R32: a regra real da FIFA (Annex C) é
  combinatória; aqui o `bracket.js` usa um template auto-consistente e os terceiros
  são ranqueados por desempenho. Reconciliar se precisar de exatidão oficial.
- **Calibração do modelo:** `predict` combina Elo (peso `ELO_WEIGHT=0.70`) com a forma
  das eliminatórias. O Elo usa supremacia aditiva (`diff/250`, cap ±2.2); a forma usa
  ataque×defesa normalizados por confederação, com **encolhimento** (`form.js` SHRINK).
  Metodologia completa em **`docs/MODELO.md`** — atualize esse doc se mudar o modelo.
- O `fetch-results.mjs` mapeia nomes (em inglês) → códigos via `NAME_TO_CODE`; se um
  nome não casar, o script avisa no console — adicionar o alias lá.

## Não confundir

- `README.md` = manual para humanos; **não** afeta o funcionamento.
- `CLAUDE.md` (este arquivo) = contexto para o assistente.
- Nenhum dos dois é lido pelo dashboard em runtime.
