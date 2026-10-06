// Os desenhos do Clawd, em SVG. Tudo aqui é texto puro: nenhuma função recebe `$`.
//
// A caixa do Clawd tem 34 x 23 células (1 célula = meio pixel do Clawd), a mesma
// grade da animação oficial do laptop. De frente, ele ocupa as colunas 10 a 33 e
// as linhas 7 a 22: cabeça 7-10, braços 11-14, barriga 15-18, pernas 19-22.
// Digitando (laptop.ts), ele continua de frente: o laptop fica na frente da barriga
// (colunas 12 a 31, linhas 13 a 20) e os olhos olham para baixo, na linha 10.

export const ORANGE = '#D87656'
export const EYE = '#000000'
export const INK = '#151515'
export const LOOP = 'repeatCount="indefinite"'
const VIOLET = '#a78bfa'

export const rect = (x: number, y: number, w: number, h: number, fill: string, inner = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}">${inner}</rect>`

export const cells = (pts: [number, number][], fill: string) => pts.map(([x, y]) => rect(x, y, 1, 1, fill)).join('')

const round = (v: number) => Math.round(v * 1000) / 1000

// ---------- o corpo de frente ----------

const HEAD = rect(14, 7, 16, 4, ORANGE)
const BELLY = rect(14, 15, 16, 4, ORANGE)
const ARM_UP_RIGHT = rect(30, 5, 4, 6, ORANGE)

export const BODIES = {
  body: HEAD + rect(10, 11, 24, 4, ORANGE) + BELLY,
  // acenando: o braço direito sobe ao lado da cabeça, e balança
  waveA: HEAD + rect(10, 11, 20, 4, ORANGE) + BELLY + ARM_UP_RIGHT,
  waveB: HEAD + rect(10, 11, 20, 4, ORANGE) + BELLY + rect(30, 8, 4, 3, ORANGE) + rect(32, 4, 3, 4, ORANGE),
  // espreguiçando: braços bem esticados
  stretch: HEAD + rect(14, 11, 16, 4, ORANGE) + BELLY + rect(10, 2, 4, 9, ORANGE) + rect(30, 2, 4, 9, ORANGE),
  // segurando o guarda-chuva: o braço direito sobe e dobra por cima da cabeça até o cabo
  hold: HEAD + rect(14, 11, 16, 4, ORANGE) + rect(10, 11, 4, 4, ORANGE) + BELLY + rect(30, 4, 4, 11, ORANGE) + rect(20, 4, 14, 2, ORANGE),
}
export type Body = keyof typeof BODIES
export const BODY_KINDS = Object.keys(BODIES) as Body[]

// As pernas começam escondidas atrás da barriga, então o corpo sobe sem abrir buraco.
export const legs = (xs: number[]) => xs.map(x => rect(x, 17, 2, 6, ORANGE)).join('')

const EYE_X = [16, 26]

const BLINK =
  `<animate attributeName="height" values="2;1;2" keyTimes="0;0.95;0.985" dur="4s" calcMode="discrete" ${LOOP}/>` +
  `<animate attributeName="y" values="9;10;9" keyTimes="0;0.95;0.985" dur="4s" calcMode="discrete" ${LOOP}/>`

// Tapinha: um ">" e um "<" gordinhos, três linhas de altura (8 a 10).
const gt = (x: number) => cells([[x, 8], [x + 1, 8], [x + 1, 9], [x + 2, 9], [x, 10], [x + 1, 10]], EYE)
const lt = (x: number) => cells([[x + 1, 8], [x + 2, 8], [x, 9], [x + 1, 9], [x + 1, 10], [x + 2, 10]], EYE)

// Tonto: um aro de 3 x 3 em cada olho e um furo laranja que anda em volta dele (um olho
// gira pra cada lado). O furo é uma célula só, então o desenho fica leve.
const RING: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]]
const spinner = (x: number, dir: 1 | -1) => {
  const order = dir === 1 ? RING : [...RING].reverse()
  return (
    cells(RING.map(([dx, dy]) => [x + dx, 8 + dy] as [number, number]), EYE) +
    `<rect x="${x}" y="8" width="1" height="1" fill="${ORANGE}">` +
    `<animate attributeName="x" values="${order.map(([dx]) => x + dx).join(';')}" dur="0.64s" calcMode="discrete" ${LOOP}/>` +
    `<animate attributeName="y" values="${order.map(([, dy]) => 8 + dy).join(';')}" dur="0.64s" calcMode="discrete" ${LOOP}/></rect>`
  )
}

export const EYES = {
  open: EYE_X.map(x => rect(x, 9, 2, 2, EYE, BLINK)).join(''),
  wide: EYE_X.map(x => rect(x, 9, 2, 2, EYE)).join(''),
  closed: EYE_X.map(x => rect(x, 10, 2, 1, EYE)).join(''),
  happy: EYE_X.map(x => rect(x - 1, 10, 1, 1, EYE) + rect(x, 9, 2, 1, EYE) + rect(x + 2, 10, 1, 1, EYE)).join(''),
  ouch: gt(16) + lt(25),
  dizzy: spinner(16, 1) + spinner(25, -1),
}
export type Eyes = keyof typeof EYES
export const EYE_KINDS = Object.keys(EYES) as Eyes[]

// ---------- enfeites que andam junto com o corpo de frente ----------

const steam = (x: number, begin: number) =>
  `<g opacity="0">${rect(x, 7, 1, 1, '#9aa0a6')}${rect(x + 1, 6, 1, 1, '#9aa0a6')}` +
  `<animate attributeName="opacity" values="0;0.9;0" dur="2s" begin="${begin}s" ${LOOP}/>` +
  `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3" dur="2s" begin="${begin}s" ${LOOP}/></g>`

const CANOPY = '#e5484d'
const CANOPY_LIGHT = '#ff8a8f'
const WOOD = '#5a3e2b'

// Guarda-chuva: uma cúpula de 2*half células centrada em cx (6 linhas) e `pole` linhas de cabo.
function umbrella(cx: number, top: number, half: number, pole: number): string {
  const w = 2 * half
  const row = (y: number, frac: number) => {
    const rw = Math.max(2, Math.round((w * frac) / 2) * 2)
    return rect(cx - rw / 2, y, rw, 1, CANOPY)
  }
  let out = rect(cx - 1, top, 2, 1, WOOD) + row(top + 1, 0.35) + row(top + 2, 0.65) + row(top + 3, 0.88) + row(top + 4, 1)
  out += rect(cx - Math.round(half * 0.5) - 1, top + 2, 2, 3, CANOPY_LIGHT) + rect(cx + Math.round(half * 0.5) - 1, top + 2, 2, 3, CANOPY_LIGHT)
  for (let x = cx - half; x < cx + half; x += 4) out += rect(x, top + 5, 2, 1, CANOPY)
  return out + rect(cx - 1, top + 5, 2, pole, WOOD)
}

export const FRONT_PROPS = {
  // preocupado: sobrancelhas com a ponta de dentro levantada
  brows: cells([[15, 8], [16, 8], [17, 7], [26, 7], [27, 8], [28, 8]], EYE),
  // bocejo de madrugada
  mouth: rect(20, 12, 4, 2, EYE),
  // cafezinho de manhã, na mão esquerda
  mug: rect(6, 10, 4, 5, '#eeeeee') + rect(7, 10, 2, 1, '#6f4e37') + rect(5, 11, 1, 2, '#cccccc') + steam(6.5, 0) + steam(7.5, 1),
  // chovendo, com a mão ocupada (acenando, espreguiçando): o guarda-chuva preso na cabeça
  umbrella: umbrella(22, -2, 12, 3),
  // chovendo, parado ou andando: ele segura o cabo (corpo "hold")
  umbrellaHeld: umbrella(22, -3, 13, 1),
  // plaquinha de pausa, na mão esquerda
  sign:
    rect(-5, 0, 17, 7, '#b08d57') +
    rect(-4.5, 0.5, 16, 6, '#f5e6c8') +
    `<text x="3.5" y="5" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="4" fill="${WOOD}">pausa?</text>` +
    rect(11, 7, 1, 5, '#8b5a2b'),
}
export type FrontProp = keyof typeof FRONT_PROPS
export const FRONT_PROP_KINDS = Object.keys(FRONT_PROPS) as FrontProp[]

// ---------- enfeites do laço de digitar (o rosto fica parado) ----------

const hammerUp = rect(4, 10, 4, 2, '#9a9a9a') + rect(6, 12, 1, 6, '#8b5a2b')
const hammerDown = rect(2, 15, 4, 2, '#9a9a9a') + cells([[6, 16], [7, 17], [8, 18]], '#8b5a2b') + cells([[1, 18], [2, 19]], '#ffd166')

export const TYPING_PROPS = {
  // lendo arquivo: óculos redondos em volta dos olhos (que olham pra tela, na linha 10)
  glasses:
    rect(15, 9, 4, 1, INK) + rect(15, 11, 4, 1, INK) + rect(14, 10, 1, 1, INK) + rect(19, 10, 1, 1, INK) +
    rect(25, 9, 4, 1, INK) + rect(25, 11, 4, 1, INK) + rect(24, 10, 1, 1, INK) + rect(29, 10, 1, 1, INK) +
    rect(20, 10, 4, 1, INK),
  // pesquisando na web: lupa na mão esquerda, varrendo
  magnifier:
    `<g><rect x="3" y="7" width="4" height="4" fill="#bfe6ff" fill-opacity="0.55"/>` +
    rect(3, 6, 4, 1, '#d9d9d9') + rect(3, 11, 4, 1, '#d9d9d9') + rect(2, 7, 1, 4, '#d9d9d9') + rect(7, 7, 1, 4, '#d9d9d9') +
    cells([[8, 12], [9, 13]], '#8b5a2b') +
    `<animateTransform attributeName="transform" type="translate" values="0 0;-1 0;-1 -1;0 -1" dur="1.6s" calcMode="discrete" ${LOOP}/></g>`,
  // editando: martelinho batendo no teclado
  hammer:
    `<g>${hammerUp}<animate attributeName="opacity" values="1;0" dur="0.5s" calcMode="discrete" ${LOOP}/></g>` +
    `<g opacity="0">${hammerDown}<animate attributeName="opacity" values="0;1" dur="0.5s" calcMode="discrete" ${LOOP}/></g>`,
  // preocupado, digitando
  browsT: cells([[15, 9], [16, 9], [17, 8], [26, 8], [27, 9], [28, 9]], EYE),
  // chovendo, digitando
  // trabalhando: guarda-chuva grande preso na cabeça, cobrindo ele e o laptop
  umbrellaT: umbrella(22, -2, 13, 3),
}
export type TypingProp = keyof typeof TYPING_PROPS
export const TYPING_PROP_KINDS = Object.keys(TYPING_PROPS) as TypingProp[]

// ---------- enfeites da caixa toda ----------

const floaty = (glyph: string, x: number, y: number, size: number, begin: number, fill = '#8b95a5', dur = 3) =>
  `<text x="${x}" y="${y}" font-family="monospace" font-weight="bold" font-size="${size}" fill="${fill}" opacity="0">${glyph}` +
  `<animate attributeName="opacity" values="0;1;0" dur="${dur}s" begin="${begin}s" ${LOOP}/>` +
  `<animateTransform attributeName="transform" type="translate" values="0 0;3 -7" dur="${dur}s" begin="${begin}s" ${LOOP}/>` +
  `</text>`

const CONFETTI = ['#ffd166', '#06d6a0', '#118ab2', '#ef476f', ORANGE, '#c77dff']

// Uma estrela de pontas (o "POW" de história em quadrinhos), centrada em (0, 0).
const burst = (outer: number, inner: number, fill: string, points = 8) =>
  `<polygon fill="${fill}" points="${Array.from({ length: points * 2 }, (_, i) => {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? inner : outer
    return `${round(Math.cos(a) * r)},${round(Math.sin(a) * r)}`
  }).join(' ')}"/>`

// Uma estrelinha de 5 células, que roda em elipse acima da cabeça (8 posições por volta).
const orbit = (i: number) => {
  const at = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8 + i / 3) * Math.PI * 2
    return `${round(22 + Math.cos(a) * 8)} ${round(3 + Math.sin(a) * 2.5)}`
  })
  return (
    `<g>${cells([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]], '#ffd166')}` +
    `<animateTransform attributeName="transform" type="translate" values="${at.join(';')}" dur="1s" calcMode="discrete" ${LOOP}/></g>`
  )
}

export const FX = {
  // tapinha: a estrela estoura acima do canto da cabeça, longe dos olhos, e some (toca uma vez
  // só, congelando no fim). No pico ela mede ~6 células de raio e não passa do topo da pista.
  pow:
    `<g transform="translate(10 4)"><g>` +
    `<animateTransform attributeName="transform" type="scale" values="0.2;1.25;1;0.9" keyTimes="0;0.25;0.55;1" dur="0.7s" fill="freeze"/>` +
    `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.65;1" dur="0.7s" fill="freeze"/>` +
    burst(5, 2.3, '#ffd166') +
    burst(2.8, 1.2, '#ffffff') +
    `</g></g>`,
  // tonto: três estrelinhas rodando
  stars: [0, 1, 2].map(orbit).join(''),
  zzz: [0, 1, 2].map(i => floaty(i === 2 ? 'Z' : 'z', 20 + i * 2.5, 6, 3 + i, i)).join(''),
  sweat:
    `<g>${rect(11.5, 6, 1.5, 2, '#7cc4ff') + rect(11.75, 5, 1, 1, '#7cc4ff')}` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 5" dur="1.2s" ${LOOP}/>` +
    `<animate attributeName="opacity" values="1;0" dur="1.2s" ${LOOP}/></g>`,
  // preocupado: um balãozinho de exclamação piscando
  bang:
    `<g>${rect(29, 0, 5, 6, '#ffffff') + rect(31, 1, 1, 2, '#e5484d') + rect(31, 4, 1, 1, '#e5484d')}` +
    `<animate attributeName="opacity" values="1;0.35;1" dur="1s" ${LOOP}/></g>`,
  confetti: Array.from({ length: 14 }, (_, i) => {
    const x = -14 + i * 5
    const dur = 1.3 + (i % 4) * 0.25
    return (
      `<rect x="${x}" y="-2" width="1.5" height="1.5" fill="${CONFETTI[i % CONFETTI.length]}">` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${(i % 3) - 1} 27" dur="${dur}s" begin="${(i % 5) * 0.18}s" ${LOOP}/>` +
      `</rect>`
    )
  }).join(''),
}
export type Fx = keyof typeof FX

const SHEET = '#f2f2f2'
const SHEET_LINE = '#b8b8b8'
const STEEL = '#9a9a9a'
const STEEL_DARK = '#6e6e6e'
const PRESS_S = 1.2
const PRESS_TIMES = '0;0.3;0.5;0.7' // sobe, desce, esmaga, volta um pouco

const sheets = (gap: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const y = round(22 - i * gap)
    return rect(-14, y, 13, round(Math.max(0.5, gap - 0.35)), SHEET) + rect(-12.5, round(y + 0.2), 8, 0.3, SHEET_LINE)
  }).join('')

// uma das três alturas da pilha, aparecendo só na sua parte do ciclo
const pile = (gap: number, values: string) =>
  `<g opacity="${values.split(';')[0]}">${sheets(gap)}` +
  `<animate attributeName="opacity" values="${values}" keyTimes="${PRESS_TIMES}" dur="${PRESS_S}s" calcMode="discrete" ${LOOP}/></g>`

const dust = cells([[-15.5, 21], [0.5, 21], [-15, 19.5], [0, 19.5]], '#c9c9c9')

export const PRESS =
  pile(1.6, '1;1;0;0') + // alta
  pile(0.75, '0;0;1;0') + // esmagada
  pile(1.15, '0;0;0;1') + // voltando
  // a chapa e a haste
  `<g>${rect(-8.25, -3, 1.5, 9, STEEL_DARK) + rect(-15, 6, 15, 2, STEEL) + rect(-15, 7.5, 15, 0.5, STEEL_DARK)}` +
  `<animateTransform attributeName="transform" type="translate" values="0 0;0 4;0 10.3;0 6" keyTimes="${PRESS_TIMES}" dur="${PRESS_S}s" calcMode="discrete" ${LOOP}/></g>` +
  // poeirinha na hora do aperto
  `<g opacity="0">${dust}<animate attributeName="opacity" values="0;0;1;0" keyTimes="${PRESS_TIMES}" dur="${PRESS_S}s" calcMode="discrete" ${LOOP}/></g>` +
  // a alavanca na mão esquerda: em pé, e deitada na hora do aperto
  `<g>${rect(7.5, 7, 1, 7, '#8b5a2b') + rect(7, 6, 2, 1.5, '#e5484d')}` +
  `<animate attributeName="opacity" values="1;1;0;1" keyTimes="${PRESS_TIMES}" dur="${PRESS_S}s" calcMode="discrete" ${LOOP}/></g>` +
  `<g opacity="0">${rect(3, 13, 6, 1, '#8b5a2b') + rect(2, 12.5, 1.5, 2, '#e5484d')}` +
  `<animate attributeName="opacity" values="0;0;1;0" keyTimes="${PRESS_TIMES}" dur="${PRESS_S}s" calcMode="discrete" ${LOOP}/></g>`
export const FX_KINDS = Object.keys(FX) as Fx[]

// ---------- o ultracode: aura atrás do Clawd (fica sob ele) ----------

export const ULTRA_AURA =
  `<defs><radialGradient id="clawd-aura"><stop offset="0" stop-color="${VIOLET}" stop-opacity="0.75"/>` +
  `<stop offset="0.55" stop-color="${ORANGE}" stop-opacity="0.28"/><stop offset="1" stop-color="${VIOLET}" stop-opacity="0"/></radialGradient></defs>` +
  `<ellipse cx="20" cy="14" rx="19" ry="12" fill="url(#clawd-aura)" opacity="0.6">` +
  `<animate attributeName="opacity" values="0.45;0.95;0.45" dur="1.4s" ${LOOP}/></ellipse>` +
  Array.from({ length: 8 }, (_, i) => {
    const x = 8 + ((i * 7) % 26)
    return (
      `<rect x="${x}" y="20" width="1" height="1" fill="${i % 2 ? VIOLET : '#ffb38a'}" opacity="0">` +
      `<animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="${round(i * 0.21)}s" ${LOOP}/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${(i % 3) - 1} -18" dur="1.6s" begin="${round(i * 0.21)}s" ${LOOP}/></rect>`
    )
  }).join('')

// ---------- camadas da pista inteira (em px, com x em %) ----------

// Chuva caindo pela pista toda.
export function rainLayer(height: number): string {
  return Array.from({ length: 22 }, (_, i) => {
    const x = round(2 + i * 4.5)
    const dur = round(0.75 + (i % 3) * 0.12)
    return (
      `<rect x="${x}%" y="-8" width="1.2" height="6" fill="#8ab4f8" opacity="0.55">` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;-3 ${height + 12}" dur="${dur}s" begin="${round(-((i * 0.37) % dur))}s" ${LOOP}/></rect>`
    )
  }).join('')
}

const SPARK = ['#ffd166', '#ef476f', '#06d6a0', '#7cc4ff', '#c4b5fd', '#ffb38a']

// Fogos de artifício estourando em pontos da pista.
export function fireworksLayer(height: number): string {
  const bursts: [number, number, number][] = [
    [16, 0.36, 0],
    [41, 0.3, 0.55],
    [64, 0.42, 1.1],
    [86, 0.32, 0.3],
  ]
  return bursts
    .map(([x, y, begin], b) => {
      const sparks = Array.from({ length: 10 }, (_, k) => {
        const a = (k / 10) * Math.PI * 2
        const r = 13 + (k % 2) * 4
        const dx = round(Math.cos(a) * r)
        const dy = round(Math.sin(a) * r)
        return (
          `<rect x="-1" y="-1" width="2" height="2" fill="${SPARK[(k + b) % SPARK.length]}" opacity="0">` +
          `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.55;1" dur="1.6s" begin="${begin}s" ${LOOP}/>` +
          `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy}" keyTimes="0;1" calcMode="spline" keySplines="0.2 0.8 0.4 1" dur="1.6s" begin="${begin}s" ${LOOP}/></rect>`
        )
      }).join('')
      const flash =
        `<rect x="-1.5" y="-1.5" width="3" height="3" fill="#ffffff" opacity="0">` +
        `<animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.08;0.3;1" dur="1.6s" begin="${begin}s" ${LOOP}/></rect>`
      return `<svg x="${x}%" y="${round(height * y)}" overflow="visible">${flash}${sparks}</svg>`
    })
    .join('')
}

// Ultracode: uma faixa de luz correndo pela borda de baixo e um brilho suave no fundo.
// Os dois nascem transparentes na beira esquerda e ganham força em 56 px, sem "parede"
// encostada no texto da statusline.
export function ultraLayer(height: number): string {
  return (
    `<defs>` +
    `<linearGradient id="clawd-ultra-fade" gradientUnits="userSpaceOnUse" x1="0" x2="56" y1="0" y2="0">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="1"/></linearGradient>` +
    `<mask id="clawd-ultra-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">` +
    `<rect x="0" y="0" width="100%" height="100%" fill="url(#clawd-ultra-fade)"/></mask>` +
    `<linearGradient id="clawd-ultra-bar" x1="0" x2="0.2" y1="0" y2="0" spreadMethod="repeat">` +
    `<stop offset="0" stop-color="${ORANGE}"/><stop offset="0.5" stop-color="${VIOLET}"/><stop offset="1" stop-color="${ORANGE}"/>` +
    `<animateTransform attributeName="gradientTransform" type="translate" values="0 0;0.2 0" dur="1.2s" ${LOOP}/></linearGradient>` +
    `<linearGradient id="clawd-ultra-glow" x1="0" x2="0" y1="0" y2="1">` +
    `<stop offset="0" stop-color="${VIOLET}" stop-opacity="0"/><stop offset="1" stop-color="${VIOLET}" stop-opacity="0.22"/></linearGradient>` +
    `</defs>` +
    `<g mask="url(#clawd-ultra-mask)">` +
    `<rect x="0" y="0" width="100%" height="${height}" fill="url(#clawd-ultra-glow)">` +
    `<animate attributeName="opacity" values="0.6;1;0.6" dur="2s" ${LOOP}/></rect>` +
    `<rect x="0" y="${height - 2}" width="100%" height="2" fill="url(#clawd-ultra-bar)"/>` +
    `</g>`
  )
}

// ---------- os ajudantes: mini-Clawds digitando numa "baia" no canto direito ----------

// Cada mini-Clawd tem 12 células de largura e fica a 14 do vizinho. A baia inteira
// fica à direita do Clawd principal, que nunca entra nela (ver helpersZone).
const MINI_STEP = 14
const MAX_MINIS = 6

// Quantos mini-Clawds cabem em tantas células (no máximo seis).
export const fitMinis = (cellsFree: number) => Math.max(0, Math.min(MAX_MINIS, Math.floor((cellsFree - 3) / MINI_STEP)))

// Quantas células a baia ocupa a partir do canto direito, com folga de 3 para o Clawd.
export const helpersZone = (count: number, cap = MAX_MINIS) => {
  const n = Math.min(count, cap, MAX_MINIS)
  return n > 0 ? n * MINI_STEP + 3 : 0
}

// Um mini-Clawd (1 célula = 1 pixel dele) sentado atrás de um laptop, digitando.
function mini(left: number, i: number): string {
  const top = 15
  const arms =
    `<g>${rect(left, top + 2, 12, 2, ORANGE)}` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -0.6" dur="0.32s" begin="${round(-i * 0.11)}s" calcMode="discrete" ${LOOP}/></g>`
  return (
    rect(left + 2, top, 8, 2, ORANGE) +
    cells([[left + 3, top + 1], [left + 8, top + 1]], EYE) +
    arms +
    rect(left + 2, top + 4, 8, 2, ORANGE) +
    [2, 4, 7, 9].map(x => rect(left + x, top + 6, 1, 2, ORANGE)).join('') +
    // o laptop visto de trás, na frente da barriga
    rect(left + 1, top + 4, 10, 4, '#8b8b8b') +
    rect(left + 5.5, top + 5.5, 1, 1, '#c8c8c8')
  )
}

// Até seis mini-Clawds (ou os que couberem na pista), do canto direito para a esquerda;
// passando disso, um "+N" em cima do último. Posições em células, a partir do canto direito.
export function helpersLayer(count: number, cap: number, boxW: number, boxH: number, cell: number, height: number): string {
  const shown = Math.min(count, cap, MAX_MINIS)
  if (shown <= 0) return ''
  const leftOf = (i: number) => -MINI_STEP * (i + 1)
  const minis = Array.from({ length: shown }, (_, i) => mini(leftOf(i), i)).join('')
  const extra =
    count > shown
      ? `<text x="${leftOf(shown - 1) + 6}" y="13" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="4" fill="#c4b5fd">+${count - shown}</text>`
      : ''
  return `<svg x="100%" y="${round(height - boxH * cell)}" width="${boxW * cell}" height="${boxH * cell}" viewBox="0 0 ${boxW} ${boxH}" overflow="visible">${minis}${extra}</svg>`
}
