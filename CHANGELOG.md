# Changelog

Todas as mudanças importantes deste projeto ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões
seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## Não lançado

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
