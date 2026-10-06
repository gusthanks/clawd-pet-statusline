# clawd-pet-statusline

O **Clawd**, o caranguejinho laranja do Claude Code, morando animado na faixa logo acima da
caixa de mensagem do app, ao lado de uma **statusline** que se atualiza sozinha (pasta,
modelo, contexto, limites de uso e o clima de onde você está).

Ele reage ao que está acontecendo: pega o laptop quando você manda mensagem, põe óculos
quando o Claude lê arquivos, sua quando o contexto enche, abre o guarda-chuva quando chove
na sua cidade, solta fogos no `git commit`... A lista completa está na [sheet](#a-sheet-o-que-cada-animação-quer-dizer).

> Projeto de fã, **não oficial**, sem ligação com a Anthropic. "Claude", "Claude Code" e o
> Clawd são da Anthropic. Os desenhos em pixel e a animação do laptop deste repositório
> foram feitos para ele.

*[English below](#english)*

---

## A sheet: o que cada animação quer dizer

As imagens abaixo são geradas direto do código (`tools/make-sheet.py`), então são exatamente
o que aparece no app.

### O dia a dia

| | O que você vê | Quando acontece |
|---|---|---|
| <img src="docs/sheet/idle.svg" width="420"> | **Passeando** | Nada acontecendo: ele anda pela pista e olha em volta. |
| <img src="docs/sheet/work.svg" width="420"> | **Chegou mensagem** | Você enviou uma mensagem: ele acena, corre pro canto, pega o laptop e abre. |
| <img src="docs/sheet/party.svg" width="420"> | **Comemorando** | A resposta terminou bem: guarda o laptop e pula com confete. |
| <img src="docs/sheet/oops.svg" width="420"> | **Susto** | O turno terminou com erro. |
| <img src="docs/sheet/sleep.svg" width="420"> | **Dormindo** | 10 minutos sem nada (3 de madrugada). Um tapinha acorda. |

### Trabalhando (o acessório mostra o que o Claude está fazendo)

| | O que você vê | Quando acontece |
|---|---|---|
| <img src="docs/sheet/read.svg" width="420"> | **Óculos** | Lendo arquivos (Read, Grep, Glob). |
| <img src="docs/sheet/web.svg" width="420"> | **Lupa** | Pesquisando na web (WebSearch, WebFetch, navegador). |
| <img src="docs/sheet/edit.svg" width="420"> | **Martelinho** | Editando arquivos (Edit, Write). |
| <img src="docs/sheet/helpers.svg" width="420"> | **Mini-Clawds** | Um por subagente rodando, cada um no seu laptop (até 6; depois aparece "+N"). |
| <img src="docs/sheet/ultracode.svg" width="420"> | **Aura roxa + faixa de luz** | Modo ultracode, ou um workflow rodando em segundo plano. |
| <img src="docs/sheet/compact.svg" width="420"> | **Prensa** | O Claude está compactando o contexto da conversa. |
| <img src="docs/sheet/fireworks.svg" width="420"> | **Fogos** | Logo depois de um `git commit` ou `git push` que deu certo. |

### Avisos (ele lê a statusline)

| | O que você vê | Quando acontece |
|---|---|---|
| <img src="docs/sheet/tired.svg" width="420"> | **Suando** | O contexto passou de 80%. |
| <img src="docs/sheet/worried.svg" width="420"> | **Preocupado** (sobrancelhas + balão "!") | O limite de 5 horas passou de 90%. |
| <img src="docs/sheet/pause.svg" width="420"> | **"pausa?"** | Uma hora de trabalho sem parar: ele se espreguiça e sugere uma pausa. |

### Hora e clima

| | O que você vê | Quando acontece |
|---|---|---|
| <img src="docs/sheet/morning.svg" width="420"> | **Cafezinho** | Das 6h às 11h, parado. |
| <img src="docs/sheet/night.svg" width="420"> | **Madrugada** | Das 0h às 5h: boceja e dorme mais cedo. |
| <img src="docs/sheet/rain.svg" width="420"> | **Guarda-chuva na mão** | Está chovendo onde você está (a pista ganha chuva). |
| <img src="docs/sheet/rain-work.svg" width="420"> | **Guarda-chuva grande** | Chovendo e trabalhando: cobre ele e o laptop. |

### Brincando com ele

| | O que você vê | Quando acontece |
|---|---|---|
| <img src="docs/sheet/tap.svg" width="420"> | **Tapinha** | Clique nele: ele achata e solta uma estrela. |
| <img src="docs/sheet/dizzy.svg" width="420"> | **Tonto** | Quatro tapinhas em 3 segundos: olhos girando e estrelinhas. |

---

## A statusline

Na mesma faixa, à esquerda do Clawd:

- 📂 a pasta da conversa, com as linhas mexidas (`+12 -3`) e o clima de agora (☁️ 22°);
- 🌀 o modelo, o esforço (MEDIUM, HIGH, MAX...) e quanto do contexto já foi usado;
- ⏳ e 📅 os limites de uso de 5 horas e de 7 dias, com o tempo até renovar.

Ela se atualiza sozinha: a cada 20 segundos, e na hora em que algo muda. Os limites vêm
direto da sua conta, como no painel de uso do app.

---

## Instalação

**Você precisa de:** o app do Claude Code (aba Code, no desktop) numa versão com mods
(testado na 2.1.288) e o [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
git clone https://github.com/gusthanks/clawd-pet-statusline.git
cd clawd-pet-statusline
node install.mjs
```

Depois, **abra uma conversa nova** no app. As conversas que já estavam abertas continuam como estavam.

O instalador:
1. copia a pasta `clawd/` para `~/.claude/mods/clawd` (uma versão anterior vira `.bak-<data>`);
2. copia a statusline para `~/.claude/statusline-rgb.js`, se você ainda não tiver uma lá;
3. guarda uma cópia do seu `~/.claude/settings.json` e acrescenta uma linha:

```json
"env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:/Users/voce/.claude/mods/clawd" }
```

**Para desligar:** `node install.mjs --uninstall` (tira só essa linha; os arquivos ficam).

**Para atualizar:** `git pull` e `node install.mjs` de novo.

### Ajustes opcionais (variáveis no `env` do settings.json)

| Variável | Para quê |
|---|---|
| `CLAWD_LOCATION` | Fixa o lugar do clima, por exemplo `"-23.55,-46.63"`. Sem ela, o lugar sai da sua conexão de internet. |
| `CLAWD_STATUSLINE` | Usa outro script de statusline no lugar de `~/.claude/statusline-rgb.js`. |

Se a faixa estiver estreita, a statusline usa o formato compacto. Para forçar o compacto
sempre, crie o arquivo vazio `~/.claude/statusline-narrow`.

---

## Privacidade: com quem o mod conversa

| Serviço | O que vai | Para quê | Com que frequência |
|---|---|---|---|
| [get.geojs.io](https://www.geojs.io) (reserva: [ipwho.is](https://ipwho.is)) | o seu IP (vai sozinho em qualquer acesso) | descobrir a cidade, para o clima | 1 vez por hora |
| [Open-Meteo](https://open-meteo.com) | a latitude e longitude arredondadas | o clima e o fuso horário | a cada 15 min |
| api.anthropic.com | o seu próprio login do Claude | os limites de uso da statusline | a cada 2 min |

Nada sai da sua máquina além disso, e nada é guardado fora dela. Com `CLAWD_LOCATION`, a
consulta de IP não acontece.

---

## No terminal

O mod também carrega no `claude` do terminal, mas lá só aparece o logo laranja em blocos
acima do prompt, porque o terminal não desenha as animações. Nos comandos automáticos
(`claude -p`) ele fica parado e não gasta nada.

---

## Para quem quer mexer

```
clawd/                  o mod (plugin de function hooks)
  hooks/register.tsx    o comportamento: cenas, statusline, clima, limites, ajudantes...
  hooks/art.ts          os desenhos em SVG (corpo, olhos, acessórios, efeitos)
  hooks/laptop.ts       os quadros do laptop (gerado por tools/laptop.py)
  hooks/tap.tsx         a área invisível que recebe o tapinha
  hooks/clawd.test.tsx  os testes
statusline/             a statusline (Node, sem dependências)
tools/laptop.py         desenha o laptop e gera laptop.ts (--preview gera um PNG)
tools/make-sheet.py     gera as animações de docs/sheet/
```

```bash
cd clawd/..                         # a pasta que contém clawd/
claude plugin validate ./clawd      # confere o mod
claude plugin test ./clawd          # roda os testes
python tools/make-sheet.py          # refaz a sheet
```

Licença: [MIT](LICENSE).

---

## English

**clawd-pet-statusline** puts an animated Clawd (the Claude Code crab) in the band right above
the message box of the Claude Code desktop app, next to a self-updating statusline: folder
and lines changed, model, effort, context, 5-hour and 7-day usage limits, and the weather
where you are.

He reacts to what's going on. He grabs the laptop when you send a message and wears glasses
while Claude reads files. He picks up a magnifier for web searches and a hammer while editing.
He sweats when the context is above 80%, gets worried when the 5-hour limit is above 90%, and
holds an umbrella when it rains in your city. You also get fireworks on `git commit` or
`git push`, mini-Clawds for running subagents, a purple aura in ultracode, a press while the
context is compacting, and a "pausa?" (break?) sign after an hour of non-stop work. Click him
for a tap, or tap four times to make him dizzy. The table above shows every animation.

**Install:** you need the Claude Code desktop app with mod support (tested on 2.1.288) and
Node.js 18+. Run `git clone` with the URL above, then `node install.mjs`, then open a **new**
conversation. The installer copies the mod to `~/.claude/mods/clawd`, adds it to
`env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (it backs that file up first), and
installs the statusline if you don't have one. To turn it off, run `node install.mjs --uninstall`.

**Privacy:**
- Your approximate city comes from your IP (geojs.io, with ipwho.is as backup), once an hour.
  Set `CLAWD_LOCATION="lat,lon"` to skip this.
- The weather comes from Open-Meteo every 15 minutes.
- Usage limits come from your own Claude login every 2 minutes.

Nothing else leaves your machine.

Unofficial fan project, not affiliated with Anthropic. Code under the MIT license.
