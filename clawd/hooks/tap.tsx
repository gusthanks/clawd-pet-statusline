import type { ClientModule } from 'claude-code'

// A área de clique do Clawd (o "tapinha"). Não desenha nada que se veja: o app só deixa clicar
// em botão (que vira caixa) ou numa região destas, então é ela que cobre a pista.
//
// O app dá à região só a altura do que o módulo desenha (no mínimo uma linha, no topo): por isso
// ela desenha uma caixa vazia de 4 linhas. A caixa encolhe até a altura da pista (a região pai
// manda), e assim o clique vale em qualquer ponto dela, não só numa faixa fina em cima.
//
// O clique vira um recado para o mod (ui.message): o tipo, onde caiu e quantas colunas a área
// tem; é o mod que sabe onde o Clawd está e decide se o clique o pegou. Os tipos "boot" (a área
// ganhou tamanho) e "enter" (o mouse entrou) só servem de diagnóstico: o mod os anota e mais nada.
const Tap: ClientModule = (_props, surface) => {
  const here = (type: string, x: number, y: number) => ({ type, x, y, cols: surface.columns, rows: surface.rows })
  surface.onPointer(e => {
    if (e.type === 'enter') surface.post(here('enter', 0, 0))
    else if (e.type === 'down' && (e.button === undefined || e.button === 'left')) surface.post(here('down', e.x, e.y))
  })
  // a primeira vez que a área tem tamanho, avisa o mod (prova que o módulo roda no app e quanto mede)
  if (surface.state === undefined && surface.columns > 0) {
    surface.setState(true)
    surface.post(here('boot', 0, 0))
  }
  const { Box, Text } = surface.elements
  return (
    <Box height={4}>
      <Text> </Text>
    </Box>
  )
}

export default Tap
