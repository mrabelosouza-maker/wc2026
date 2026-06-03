# 🏆 Dashboard da Copa do Mundo 2026

Dashboard estático (HTML/CSS/JS puro, sem backend) sobre a Copa do Mundo FIFA 2026
(EUA · Canadá · México, 11/jun – 19/jul/2026). Roda localmente com duplo-clique e
está pronto para o GitHub Pages.

## ✨ O que faz

1. **📅 Calendário** — os 72 jogos da fase de grupos + o chaveamento do mata-mata
   descrito por posição ("Vencedor do Grupo X" vs "2º do Grupo Y"), preenchido
   automaticamente conforme os grupos terminam. **Jogos do Brasil em destaque.**
2. **📊 Previsões** — modelo estatístico (Elo → Poisson com correção Dixon-Coles)
   que estima, por jogo, vitória/empate/derrota e o placar mais provável; **mais**
   uma simulação de **Monte Carlo** do torneio inteiro (chance de avançar de fase e
   de ser campeã).
3. **🔄 Lógica adaptativa** — lê os resultados encerrados, recalcula o Elo de cada
   seleção a cada jogo, atualiza a classificação, preenche o chaveamento e re-roda
   as previsões.

## ▶️ Rodar localmente

**Opção 1 (mais simples):** dê duplo-clique em `index.html`. Tudo funciona via
`file://` porque os dados são carregados como `<script>` (variáveis globais), não
via `fetch()`.

**Opção 2 (igual ao GitHub Pages, habilita a auto-atualização sem F5):**

```bash
python -m http.server 8000
# abra http://localhost:8000
```

## 📁 Estrutura

```
index.html              # shell com as abas
css/styles.css          # tema/layout
js/data/                # dados (fonte de verdade, fácil de corrigir)
  teams.js              #   48 seleções + grupo + Elo-semente
  groups.js             #   grupos A–L (derivados de teams.js)
  fixtures.js           #   72 jogos da fase de grupos
  bracket.js            #   template do mata-mata (R32 → Final)
js/model.js             # Poisson + Elo + Dixon-Coles
js/standings.js         # classificação + melhores 3º + replay de Elo
js/simulate.js          # Monte Carlo do torneio
js/app.js               # render + abas + loop adaptativo
data/results.js         # resultados encerrados (gerado pelo Action)
scripts/fetch-results.mjs       # busca resultados (Node, sem API key)
.github/workflows/update-results.yml  # cron que regenera data/results.js
```

## 🔄 Auto-atualização (quando a Copa começar)

Um **GitHub Action** roda a cada 15 min, executa `scripts/fetch-results.mjs`
(que busca jogos encerrados no **TheSportsDB** — fonte pública, **sem API key**) e
regrava `data/results.js`. O dashboard, servido pelo GitHub Pages, faz *polling*
desse arquivo e se atualiza sozinho.

Testar o fetch localmente (Node 18+):

```bash
node scripts/fetch-results.mjs
```

Se algum nome de seleção não casar, o script avisa no console — basta adicionar o
alias em `NAME_TO_CODE` dentro de `scripts/fetch-results.mjs`.

## 🧪 Testar a lógica adaptativa à mão

Edite `data/results.js` e adicione um jogo encerrado, por exemplo:

```js
window.WC2026_RESULTS = {
  last_update: "2026-06-13T22:00:00Z",
  source: "manual (teste)",
  matches: [
    { mandante: "BRA", visitante: "MAR", golsMandante: 2, golsVisitante: 0,
      status: "encerrado", dataISO: "2026-06-13", fase: "grupos", bracketId: null, vencedor: null },
  ],
};
```

Recarregue a página e observe: a classificação do Grupo C muda, o Elo do Brasil
sobe (mudando as previsões dos próximos jogos) e o Monte Carlo recalcula. Quando
os 3 jogos de um grupo terminam, o chaveamento preenche os classificados.

Para jogos de **mata-mata**, informe `fase` (`"R32"`, `"R16"`, `"QF"`, `"SF"`,
`"FINAL"`), o `bracketId` (ex.: `"R32-03"`, ver `js/data/bracket.js`) e, em caso de
pênaltis, o `vencedor` (código da seleção).

## 🚀 Publicar no GitHub Pages

1. Crie um repositório e suba estes arquivos.
2. Em **Settings → Pages**, selecione a branch (`main`) e a pasta raiz (`/`).
3. Em **Settings → Actions → General**, garanta permissão de escrita para o
   workflow (Read and write permissions).
4. O Action passa a atualizar `data/results.js` sozinho. Sem segredos/API key.

## ⚠️ Avisos

- **Dados de grupos, calendário e Elo** vêm de pesquisa web e **devem ser
  reconferidos na fonte oficial da FIFA**. Tudo está centralizado em `js/data/*.js`
  para correção trivial.
- A **alocação dos 8 melhores terceiros** no R32 segue uma regra combinatória da
  FIFA (Annex C); aqui usamos um template auto-consistente e ranqueamos os terceiros
  por desempenho — reconcilie com o bracket oficial se precisar de exatidão.
- As **previsões são estimativas estatísticas**, não garantias.
