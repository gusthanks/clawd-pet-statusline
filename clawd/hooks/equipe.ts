// A baia dos ajudantes: um mini-Clawd por ajudante rodando, cada um com a fantasia da tarefa
// dele (fantasias.ts), digitando num laptop no canto direito da pista. Conta pura, sem `$`.
// Importa art.ts e fantasias.ts; lane.ts importa daqui (sem ciclo).
//
// O mini (1 célula = 1 pixel dele), em células da baia, com L = a coluna esquerda dele:
//   cabeça   linhas 15-16, olhos em (L+3,16) e (L+8,16)
//   braços   linhas 17-18, digitando (sobem 0,6 a cada 0,32 s)
//   barriga e pernas linhas 19-22, atrás do laptop
// A fantasia põe o chapéu por cima da cabeça e o objeto na garra direita, que sobe ao lado dela.
import { cells, EYE, LOOP, MAX_MINIS, MINI_STEP, ORANGE, phaseOf, rect, umbrella } from './art'
import { COSTUMES, isCostume } from './fantasias'
import type { Crew, TeamMate } from '../types'

const round = (v: number) => Math.round(v * 100000) / 100000

// Quanto um ajudante que terminou bem fica na baia comemorando antes de sair.
export const PARTY_MS = 1600
// O chapéu voa e some nesse tempo (o resto da festa ele fica de garra levantada, sem chapéu).
const HAT_S = 0.8
const HAT_UP = 3 // quantas linhas o chapéu sobe enquanto some

const TOP = 15
const LAPTOP = '#8b8b8b'
const LAPTOP_DOT = '#c8c8c8'

// O passo de uma animação discreta de n valores iguais no instante t (em s), parada no último
// depois do fim (fill="freeze"). Vai como valor fixo do elemento: o app recria a imagem a cada
// redesenho e pode mostrar um quadro antes de as animações começarem; com isso esse quadro já é
// o certo, sem o chapéu voltar à cabeça por um instante.
const stepAt = (values: string[], dur: number, t: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor((t / dur) * values.length)))] ?? values[0] ?? ''

// Uma animação de uma vez só (a festa), congelando no fim. `begin` já vem calculado (ver helpersLayer).
const once = (tag: 'animate' | 'animateTransform', attr: string, values: string[], dur: number, begin: number) =>
  `<${tag} attributeName="${attr}"${tag === 'animateTransform' ? ' type="translate"' : ''} values="${values.join(';')}" dur="${dur}s" begin="${begin}s" calcMode="discrete" fill="freeze"/>`

// Chovendo, cada mini-Clawd ganha um guarda-chuva pequeno, do mesmo estilo do grande: preso na
// cabeça, sem braço, cobrindo ele e o laptop (12 células de largura, 2 de folga para o vizinho).
// A ponta fica na linha 8, o cabo desce até a cabeça (linha 15).
const miniUmbrella = (L: number) => `<g class="mini-umbrella">${umbrella(L + 6, 8, 6, 2)}</g>`

// A festa de um ajudante: `ago` = segundos desde que ela começou; `begin` = o começo das animações
// já acertado para dar -ago depois que lane.ts aplicar a fase do relógio.
export type Party = { ago: number; begin: number }

// Um mini-Clawd sentado atrás do laptop. Trabalhando: digita, com a fantasia (chapéu, objeto na
// garra levantada, rosto). Comemorando (`party`): para de digitar, a garra sobe ao lado da cabeça
// (nunca por cima), os olhinhos viram "^ ^", o chapéu sobe e some, e o objeto fica de fora.
// i = a posição na baia, que defasa as animações de loop (b = -i * 0,11 s, como os braços).
export function mini(L: number, i: number, mate: Pick<TeamMate, 'costume' | 'tone'>, rain: boolean, party: Party | null = null): string {
  const b = round(-i * 0.11)
  const art = mate.costume ? COSTUMES[mate.costume] : undefined
  const tone = mate.tone
  const head = rect(L + 2, TOP, 8, 2, ORANGE)
  const lower =
    rect(L + 2, TOP + 4, 8, 2, ORANGE) +
    [2, 4, 7, 9].map(x => rect(L + x, TOP + 6, 1, 2, ORANGE)).join('') +
    // o laptop visto de trás, na frente da barriga
    rect(L + 1, TOP + 4, 10, 4, LAPTOP) +
    rect(L + 5.5, TOP + 5.5, 1, 1, LAPTOP_DOT)
  const umb = rain ? miniUmbrella(L) : ''
  const face = art?.face?.(L) ?? ''
  // chovendo, o guarda-chuva cobre a cabeça e o chapéu fica guardado
  const hat = art && !rain ? art.hat(L, tone) : ''

  if (party) {
    const t = party.ago
    // a garra levantada ao lado da cabeça dá dois pulinhos e fica lá em cima
    const pump = ['0 -1', '0 0', '0 -1', '0 0', '0 -1']
    const claw =
      `<g transform="translate(${stepAt(pump, PARTY_MS / 1000, t)})">${rect(L + 10, TOP, 2, 2, ORANGE)}` +
      once('animateTransform', 'transform', pump, PARTY_MS / 1000, party.begin) +
      `</g>`
    const happy = cells([[L + 2, TOP + 1], [L + 3, TOP], [L + 4, TOP + 1], [L + 7, TOP + 1], [L + 8, TOP], [L + 9, TOP + 1]], EYE)
    // o chapéu sobe e some; depois do voo ele nem é desenhado
    const rise = Array.from({ length: HAT_UP + 1 }, (_, k) => `0 ${-k}`)
    const fade = ['1', '1', '0.5', '0']
    const flying =
      hat && t < HAT_S
        ? `<g transform="translate(${stepAt(rise, HAT_S, t)})" opacity="${stepAt(fade, HAT_S, t)}">${hat}` +
          once('animateTransform', 'transform', rise, HAT_S, party.begin) +
          once('animate', 'opacity', fade, HAT_S, party.begin) +
          `</g>`
        : ''
    return head + happy + rect(L, TOP + 2, 10, 2, ORANGE) + claw + lower + umb + face + flying
  }

  // digitando: com objeto na mão, a garra direita sobe e os braços que digitam encolhem
  const raise = !!art?.raise
  const arms =
    `<g>${rect(L, TOP + 2, raise ? 10 : 12, 2, ORANGE)}` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -0.6" dur="0.32s" begin="${b}s" calcMode="discrete" ${LOOP}/></g>`
  const eyes = cells([[L + 3, TOP + 1], [L + 8, TOP + 1]], EYE)
  return head + eyes + arms + (raise ? rect(L + 10, TOP, 2, 2, ORANGE) : '') + lower + hat + umb + face + (art?.prop?.(L, b, tone) ?? '')
}

// Retângulos parados vizinhos da mesma cor viram um <path> só: o desenho é o mesmo (mesmas células,
// na mesma ordem), e o texto encolhe bastante. A baia cheia de fantasias divide o limite de tamanho
// do app (SVG_SAFE) com o passeio do Clawd, que numa pista muito larga já chega perto dele.
// Só junta o formato exato que rect() escreve sem nada dentro: retângulo animado, com
// transparência ou com a cor herdada do grupo fica como está.
const STILL_RECT = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"><\/rect>/g
const STILL_RUN = /(?:<rect x="-?[\d.]+" y="-?[\d.]+" width="[\d.]+" height="[\d.]+" fill="[^"]+"><\/rect>)+/g

export function compact(svg: string): string {
  return svg.replace(STILL_RUN, run => {
    let out = ''
    let fill = ''
    let d = ''
    for (const [, x, y, w, h, f] of run.matchAll(STILL_RECT)) {
      if (f !== fill) {
        if (d) out += `<path fill="${fill}" d="${d}"/>`
        fill = f ?? ''
        d = ''
      }
      d += `M${x} ${y}h${w}v${h}h-${w}z`
    }
    return d ? out + `<path fill="${fill}" d="${d}"/>` : out
  })
}

// O que vem guardado no atom 'team', conferido: uma versão velha (ou estragada) não derruba a faixa.
export function teamOf(raw: unknown): TeamMate[] {
  if (!Array.isArray(raw)) return []
  const out: TeamMate[] = []
  for (const m of raw as unknown[]) {
    if (!m || typeof m !== 'object') continue
    const { id, costume, tone, doneAt } = m as Record<string, unknown>
    if (typeof id !== 'string') continue
    out.push({
      id,
      costume: isCostume(costume) ? costume : '',
      tone: typeof tone === 'number' && Number.isInteger(tone) ? ((tone % 3) + 3) % 3 : 0,
      ...(typeof doneAt === 'number' && Number.isFinite(doneAt) ? { doneAt } : {}),
    })
  }
  return out
}

// O que vem guardado no atom 'crew' (a fantasia e o tom de quem roda), conferido do mesmo jeito:
// fantasia desconhecida vira '' e entrada sem tom inteiro fica de fora (o tom é refeito).
export function crewOf(raw: unknown): Crew {
  const out: Crew = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const { costume, tone } = v as Record<string, unknown>
    if (typeof tone !== 'number' || !Number.isInteger(tone)) continue
    out[id] = { costume: isCostume(costume) ? costume : '', tone: ((tone % 3) + 3) % 3 }
  }
  return out
}

// Até seis mini-Clawds (ou os que couberem na pista), do canto direito para a esquerda, na ordem
// em que chegaram; passando disso, um "+N" em cima do último, sempre na linha 7 (acima das
// fantasias e da ponta do guarda-chuva). Posições em células, a partir do canto direito.
// wall = o relógio em segundos (o mesmo que lane.ts passa a phased): a festa conta de quando
// começou (doneAt), e o begin dela já desconta a fase que phased vai tirar, para dar -ago no fim.
export function helpersLayer(
  team: readonly TeamMate[],
  cap: number,
  boxW: number,
  boxH: number,
  cell: number,
  height: number,
  rain = false,
  wall = 0,
): string {
  const shown = Math.min(team.length, cap, MAX_MINIS)
  if (shown <= 0) return ''
  const phase = phaseOf(wall)
  const leftOf = (i: number) => -MINI_STEP * (i + 1)
  const minis = team
    .slice(0, shown)
    .map((m, i) => {
      const ago = m.doneAt === undefined ? null : Math.max(0, wall - m.doneAt / 1000)
      return mini(leftOf(i), i, m, rain, ago === null ? null : { ago, begin: round(phase - ago) })
    })
    .join('')
  const extra =
    team.length > shown
      ? `<text x="${leftOf(shown - 1) + 6}" y="7" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="4" fill="#c4b5fd">+${team.length - shown}</text>`
      : ''
  return `<svg x="100%" y="${round(height - boxH * cell)}" width="${boxW * cell}" height="${boxH * cell}" viewBox="0 0 ${boxW} ${boxH}" overflow="visible">${compact(minis)}${extra}</svg>`
}
