# Como o dashboard estima as probabilidades e os placares

Este documento explica, passo a passo, a metodologia estatística usada para prever
os jogos da Copa 2026 — das probabilidades de vitória/empate/derrota ao placar mais
provável, à simulação do torneio e ao caminho do mata-mata. Tudo roda em JavaScript
puro no navegador (`js/model.js`, `js/simulate.js`), sem backend.

> TL;DR: cada confronto vira **dois números de gols esperados** (λ da casa e λ do
> visitante). Esses λ alimentam uma **distribuição de Poisson** (com um ajuste fino)
> que produz a probabilidade de **cada placar**. Somando os placares chega-se a
> vitória/empate/derrota. Repetindo isso milhares de vezes simula-se o torneio.

---

## 1. Os ingredientes de força

Cada seleção é descrita por fontes de informação complementares:

| Fonte | O que captura | Onde fica |
|---|---|---|
| **Elo** | Força **global** e atualizada (compara seleções de confederações diferentes). | `js/data/teams.js` (semente) + recalculado em `js/standings.js` |
| **Ranking FIFA** | Segunda opinião de força (correlata ao Elo). | `js/data/extras.js` |
| **Valor de mercado** | **Talento** do elenco (Transfermarkt, €M) — qualidade que resultados recentes podem não mostrar. | `js/data/extras.js` |
| **Forma recente** | **Momento** (pontos por jogo nos últimos ~10 jogos). | `js/data/extras.js` |
| **Forma das eliminatórias** | **Estilo**: o quanto a seleção ataca e defende (gols marcados/sofridos na qualificação). | `js/data/form.js` |

Essas fontes alimentam **duas dimensões** do modelo:

- **Força geral** → o **Índice de Força** (seção 1a), usado na supremacia (quem ganha).
- **Estilo ataque×defesa** → as forças `sAtk`/`sDef` das eliminatórias (seção 2b),
  usadas para repartir os gols esperados.

### 1a. Índice de Força (Elo + FIFA + valor + forma)

O Elo sabe "quem é mais forte" a partir de resultados, mas pode demorar a refletir o
**talento** de um elenco ou o **momento** recente. Por isso construímos um **Índice
de Força** (`js/ratings.js`): partimos do **Elo atual** e somamos um **ajuste
limitado** vindo dos outros sinais.

```
Para cada sinal s (FIFA, log(valor de mercado), forma): z_s = (valor − média) / desvio
ajuste = ESCALA · ( 0.25·z_FIFA + 0.45·z_valor + 0.30·z_forma )     (limitado a ±70 Elo)
Índice de Força = Elo_atual + ajuste
   (ESCALA = 40; z padronizados entre as 48 seleções)
```

- O **Elo pesa como espinha dorsal** e continua **adaptativo** (muda a cada jogo); os
  outros três sinais são estáticos e entram como um empurrão bounded (±70).
- Valor de mercado tem o maior peso entre os adicionais (talento "puro"); a forma
  capta o momento; o FIFA entra leve por ser parecido com o Elo.
- É o **Índice de Força** (não o Elo cru) que vira a "supremacia" no passo 2a.

---

## 2. Passo 1 — Gols esperados (λ)

Para um confronto A × B calculamos λ_A e λ_B (gols esperados de cada lado) por **dois
caminhos** e depois combinamos.

### 2a. Caminho do Elo (supremacia)

A diferença de Elo vira uma **supremacia** (diferença de gols esperada), repartida em
torno de uma média:

```
diff = EloA_efetivo − EloB_efetivo
sup  = limita(diff / 250, entre −2.2 e +2.2)
λ_elo_A = BASE + sup/2
λ_elo_B = BASE − sup/2          (BASE = 1.35)
```

- `EloA_efetivo` é o **Índice de Força** (seção 1a) mais um **bônus de mando** (+65)
  só para as **anfitriãs** (EUA, México, Canadá), já que os demais jogos são neutros.
- Cada ~250 pontos de Elo equivalem a ~1 gol de supremacia; o limite de ±2.2 evita
  previsões absurdas em confrontos muito desiguais.

### 2b. Caminho das eliminatórias (ataque × defesa)

Das eliminatórias tiramos, por seleção, **gols marcados/jogo** e **sofridos/jogo**.
Como o "ambiente de gols" varia entre confederações, **normalizamos pela média da
própria confederação** e aplicamos **encolhimento** (regressão à média) + limites:

```
sAtk = encolhe( (marcados/jogo) / média_da_confederação )   ∈ [0.65, 1.55]
sDef = encolhe( (sofridos/jogo) / média_da_confederação )   ∈ [0.65, 1.55]
   onde encolhe(x) = 1 + 0.6·(x − 1)
```

- `sAtk > 1` → ataca acima da média dos seus pares; `sDef < 1` → defende melhor
  (sofre menos).
- O **encolhimento** existe porque uma defesa que sofreu 0,2 gol/jogo na CAF
  enfrentou adversários mais fracos que uma da CONMEBOL — sem amortecer, o sinal
  fica ruidoso. Por isso a força absoluta fica por conta do Elo.

Os gols esperados pela forma:

```
λ_form_A = G · sAtk_A · sDef_B
λ_form_B = G · sAtk_B · sDef_A          (G = 1.30)
```

### 2c. Combinação (blend)

```
λ_A = 0.70 · λ_elo_A + 0.30 · λ_form_A
λ_B = 0.70 · λ_elo_B + 0.30 · λ_form_B
```

O Elo pesa mais (70%) porque é a medida de força mais confiável entre confederações;
as eliminatórias entram com 30% para dar nuance de estilo. Os parâmetros
(`ELO_WEIGHT`, `BASE`, `G`, encolhimento) estão centralizados em `model.js`/`form.js`.

**Exemplo real — Brasil × Marrocos:**
Elo dá λ 1.67 / 1.03 (Brasil favorito); a forma dá 0.93 / 1.91 (Marrocos teve
defesa elite e o Brasil foi irregular nas eliminatórias). O blend resulta em
**λ ≈ 1.45 / 1.30** → Brasil favorito moderado.

---

## 3. Passo 2 — Da taxa de gols ao placar (Poisson)

Com λ definido, o número de gols de cada time segue uma **distribuição de Poisson**:

```
P(k gols) = (λ^k · e^(−λ)) / k!
```

Assumindo (quase) independência entre os dois lados, a probabilidade de um **placar
exato** h×a é o produto:

```
P(h, a) = P(h | λ_A) · P(a | λ_B)
```

Calculamos isso para todos os placares de 0×0 até 8×8, formando uma **matriz de
probabilidades** (`scoreMatrix` em `model.js`).

### Ajuste Dixon-Coles

O Poisson puro subestima levemente placares baixos correlacionados (0×0, 1×1). O
ajuste **Dixon-Coles** multiplica esses quatro placares por um fator τ (com ρ = −0.05)
para corrigir, e depois **renormalizamos** a matriz para somar 1.

---

## 4. Passo 3 — Vitória/empate/derrota e placar mais provável

A partir da matriz:

- **1X2:** somam-se as probabilidades dos placares onde h>a (vitória), h=a (empate)
  e h<a (derrota). É a barra colorida de cada cartão de jogo.
- **Placar mais provável:** a célula de maior probabilidade da matriz (ex.: "1×1
  (12%)").

> Por isso o placar mais provável às vezes é "1×1" mesmo com um favorito claro: nenhum
> placar individual é dominante, mas a **soma** dos placares de vitória pode ser alta.

---

## 5. Mata-mata: probabilidade de avançar

Num jogo eliminatório não há empate no fim. Convertendo o 1X2 em "quem avança":

```
p_avança_A = P(vitória A) + P(empate) · [0.5 + (viés do favorito)]
```

ou seja, o empate é resolvido como prorrogação/pênaltis, com uma leve vantagem para o
time mais forte (função `knockoutWinProb`).

---

## 6. Simulação do torneio (Monte Carlo)

Para as probabilidades de **avançar de fase** e **ser campeã** (`simulate.js`):

1. Parte-se da classificação atual e do Elo atual (já com os jogos encerrados).
2. **Sorteia-se** o placar de cada jogo restante da fase de grupos a partir da sua
   matriz de Poisson; somam-se os pontos e monta-se a classificação simulada
   (1º/2º/3º + os 8 melhores terceiros).
3. Preenche-se o chaveamento e **sorteia-se** o vencedor de cada confronto do
   mata-mata via `knockoutWinProb`.
4. Repete-se **milhares de vezes** (padrão: 3000). A fração de vezes que cada seleção
   chega a cada fase é a probabilidade exibida na tabela.

Quanto mais simulações, mais estável o número (e mais lento). Jogos já encerrados são
**fixos** em todas as simulações.

---

## 7. Projeção do caminho até a final

Diferente do Monte Carlo (médias sobre todos os cenários), a **projeção**
(`projectBracket`) desenha **um** caminho: em cada confronto avança o **favorito** do
modelo. Estimamos a classificação dos grupos por **pontos esperados** (somando
3·P(vitória)+1·P(empate) dos jogos restantes), montamos o bracket e seguimos os
favoritos até o título — exibindo a probabilidade de cada passo.

Para o **caminho do Brasil**, forçamos o Brasil a avançar (para mostrar quem
enfrentaria em cada fase) e exibimos, mesmo assim, a probabilidade **real** de vencer
cada jogo e a chance **acumulada** (produto) de chegar até ali.

---

## 8. Atualização adaptativa (durante a Copa)

A cada jogo encerrado, o Elo das duas seleções é atualizado:

```
Elo_novo = Elo_antigo + K · multiplicador · (resultado − esperado)
esperado = 1 / (1 + 10^((Elo_oponente − Elo_time)/400))
```

- `K = 40` na fase de grupos e `50` no mata-mata (jogos mais importantes pesam mais).
- `multiplicador` cresce com a **margem de gols** (1.5 para 2 gols, 1.75 para 3+).

O sistema **reprocessa todos os jogos encerrados em ordem** (replay) para obter o Elo
atual, que então re-alimenta todas as previsões e simulações. Assim, a cada rodada o
modelo "aprende" com o que aconteceu.

---

## 9. Limitações (honestidade intelectual)

- **Não modela** lesões, suspensões, escalações, viagens, fuso, motivação ou clima.
- O **Elo-semente** e os **dados de eliminatórias** vêm de pesquisa pública e podem
  conter imprecisões — estão centralizados em `js/data/*.js` para correção fácil.
- A normalização por confederação assume confederações "equivalentes" após
  normalizar, o que é uma simplificação (mitigada pelo peso maior do Elo).
- Independência entre os gols dos dois times é uma aproximação (parcialmente
  corrigida pelo Dixon-Coles).
- Acurácia esperada de modelos Poisson+Elo para 1X2 fica em torno de **55–60%** —
  bom, mas longe de adivinhação perfeita. **São estimativas, não garantias.**

---

## 10. Onde ajustar cada parâmetro

| Quero mudar… | Arquivo / parâmetro |
|---|---|
| Pesos do Índice de Força (FIFA/valor/forma) | `ratings.js` → `W` |
| Intensidade/limite do ajuste do Índice | `ratings.js` → `SCALE` (40) / `CLAMP` (±70) |
| Dados FIFA / valor de mercado / forma | `js/data/extras.js` |
| Peso Elo vs eliminatórias | `model.js` → `ELO_WEIGHT` (0.70) |
| Sensibilidade do Elo a gols | `model.js` → `eloToLambdas` (`diff/250`, cap ±2.2) |
| Média de gols / Dixon-Coles | `model.js` → `BASE_GOALS`, `GOALS_BASE`, `DIXON_COLES_RHO` |
| Bônus de mando dos anfitriões | `model.js` → `HOME_BONUS_ELO` (65) |
| Amortecimento da forma | `form.js` → `SHRINK` (0.6) e limites `LO/HI` |
| Força/golss de uma seleção | `teams.js` (Elo) e `form.js` (gols nas eliminatórias) |
| Nº de simulações Monte Carlo | `app.js` → `SIM_N` (3000) |
| Importância dos jogos (Elo) | `standings.js` → `K` (40 grupos / 50 mata-mata) |
