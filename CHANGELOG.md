# Changelog

Todas as mudanças importantes deste projeto ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões
seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## Não lançado

Nada ainda.

## 0.2.0 - 2026-10-06

### Adicionado

- Guarda-chuva menos afobado: garoa (códigos 51–57) só conta como chuva com 0,5 mm ou mais de precipitação, e um traço de precipitação sem código de chuva não abre nada. O lugar continua vindo do IP (costuma ser o centro da cidade); para o seu endereço exato, use `CLAWD_LOCATION`.
- Na chuva, cada mini-Clawd (um por subagente) ganha um guarda-chuva pequeno, do mesmo estilo do grande: preso na cabeça, cobrindo ele e o laptopzinho. O "+N" sobe para cima da ponta do guarda-chuva. A cena `rain-work` da sheet agora mostra o Clawd grande trabalhando na chuva com dois mini-Clawds de guarda-chuva.
- Madrugada com lua minguante e estrelas piscando na pista (somem quando chove).
- Chapéus de data: gorro de Natal em 24 e 25/12 e chapéu de festa em 31/12, 1/1 e no seu aniversário, definido por `CLAWD_BIRTHDAY="DD-MM"`.
- Reação a comandos de teste (agente principal): passou, ele levanta a garra com "✓" por 3 segundos; falhou, leva um susto.
- O código foi dividido em módulos menores (`art.ts`, `lane.ts`, `scenes.ts`, `tap.tsx` e outros).
- O Clawd chama você quando o Claude para esperando o seu "sim" numa permissão: guarda o laptop, vira de frente, acena e mostra um balão "?" até a permissão se resolver (a ferramenta seguinte termina, você manda outro pedido ou o turno acaba) ou até passarem 10 minutos. Só vale para o agente principal; um tapinha mostra a reação normal e ele volta a chamar. Limite conhecido: o app não avisa quando você responde, então depois do "sim" ele segue chamando até a ferramenta aprovada terminar. Usa `classic.PermissionRequest` (e `classic.Notification` com `permission_prompt` de reserva) e só observa: nunca muda a decisão.
- `CLAWD_WEATHER=off` e `CLAWD_LIMITS=off` (também `0` e `false`): desligam, cada uma, as chamadas à internet do clima (IP e Open-Meteo) e dos limites (api.anthropic.com). Com `off` não sai nenhuma requisição.
- `CLAWD_NODE`: caminho do Node que roda a statusline. A procura agora é CLAWD_NODE, `node` do PATH, `where node` (só no Windows, uma vez) e os caminhos de Mac/Linux; o caminho fixo da máquina do autor saiu do código.
- `CLAWD_DEBUG`: com ela definida, o registro dos cliques é gravado no store (sem ela, fica só em memória). O registro de tamanhos da faixa (`renderLog`) foi removido.
- A hora e a data locais (madrugada, cafezinho, chapéus, aniversário) usam o fuso do sistema quando o Open-Meteo não responde ou `CLAWD_WEATHER=off` (antes ficavam fixas em UTC-3).
- Limpeza automática da memória do mod: o esforço e as linhas de conversas não vistas há mais de 7 dias (e as órfãs de versões antigas) são apagados ao começar uma conversa.

## 0.1.0

Primeira versão pública.

### Adicionado

- O Clawd animado na faixa acima da caixa de mensagem do app desktop do Claude Code, ao lado
  de uma statusline.
- Reações ao que o Claude está fazendo: laptop quando chega mensagem, óculos ao ler arquivos,
  lupa na pesquisa web, martelinho ao editar, mini-Clawds para subagentes, aura roxa no
  ultracode, prensa ao compactar o contexto e fogos depois de `git commit` ou `git push`.
- Avisos pela statusline: suor quando o contexto passa de 80%, preocupação quando o limite de
  5 horas passa de 90% e o sinal "pausa?" depois de uma hora de trabalho sem parar.
- Hora e clima: cafezinho de manhã, madrugada com sono, guarda-chuva (na cabeça e grande, com
  o laptop) quando chove onde você está.
- Brincadeiras: tapinha com clique e Clawd tonto depois de quatro tapinhas em 3 segundos.
- A statusline com pasta, linhas mexidas, clima, modelo, esforço, contexto e limites de uso de
  5 horas e 7 dias, atualizada a cada 20 segundos e na hora em que algo muda.
- Instalador `install.mjs` (instala, atualiza e desliga com `--uninstall`).
- Ajustes opcionais pelo `env` do settings.json: `CLAWD_LOCATION` e `CLAWD_STATUSLINE`.
- A sheet com todas as animações em `docs/sheet/`, gerada por `tools/make-sheet.py`.
- README em inglês e português, com a tabela de privacidade.
