import { BODIES, BODY_KINDS, EYE_KINDS, EYES, fireworksLayer, FRONT_PROP_KINDS, FRONT_PROPS, FX, FX_KINDS, helpersZone, legs, LOOP, phaseOf, PRESS, rainLayer, skyLayer, TYPING_PROP_KINDS, TYPING_PROPS, ULTRA_AURA, ultraLayer } from './art'
import type { Body, Eyes } from './art'
import { helpersLayer } from './equipe'
import type { TeamMate } from '../types'
import { LAPTOP_COLORS, LAPTOP_FPS, LAPTOP_FRAMES } from './laptop'
import { posAt, span, STEP_S } from './scenes'
import type { Flags, Spec, Step } from './scenes'

// ---------- a pista ----------

// A pista é um SVG que ocupa o espaço à direita da statusline. O app desenha o SVG
// como imagem com no máximo 100% da largura do espaço; sem viewBox, o SVG mede em
// pixels de verdade, então o Clawd anda em porcentagem da pista. Ele mesmo é
// desenhado numa caixa de 34 x 23 células (1 célula = meio pixel do Clawd), a mesma
// grade da animação oficial do laptop.
export const CELL = 2.25
export const BOX_W = 34
export const BOX_H = 23
export const LANE_W = 4000 // o app corta em 100% do espaço
export const SVG_SAFE = 125_000 // o app aceita até 131072 caracteres de SVG
export const LANE_MIN_CH = 13 // menos que isso ao lado do texto, e o Clawd vai pra linha de baixo
export const LANE_GAP_CH = 2 // o respiro entre a statusline e a pista
// A statusline tem dois formatos: o largo chega a ~90 colunas e só cabe com a pista
// ao lado a partir de ~107; abaixo disso vai o estreito (45), que sempre cabe.
const WIDE_ROOM_CH = 92
export const wideFits = (cols: number) => cols - LANE_MIN_CH - LANE_GAP_CH >= WIDE_ROOM_CH
export const PARK_PX = 150 // pista mais curta que isso: ele não passeia
export const LANE_MIN_H = 62 // a caixa tem 51,75 px: o resto é folga para o pulo e a cúpula do guarda-chuva
export const LINE_PX = 18.75 // altura de uma linha de texto da faixa
export const PAD = 14 // folga entre o texto e o começo da pista
export const CH_PX = 8.5 // largura aproximada de uma coluna da faixa (só para calcular a velocidade)

// ---------- de cenas para animação SVG ----------

type Pt = [number, string]
type Tracks = {
  dur: number
  pos: [number, number][]
  vis: Map<string, Pt[]>
  legsA: Pt[]
  legsB: Pt[]
  bob: Pt[]
  lift: Pt[]
  look: Pt[]
  squash: Pt[]
}

const JUMP = [0, -2, -4, -5, -5.5, -5, -4, -2, 0]
const JUMP_S = 0.5
// O tapinha: achata (mais largo e mais baixo), estica um pouco e acomoda. Pontos (tempo, escala).
const SQUASH: Pt[] = [[0, '1.22 0.76'], [0.08, '0.94 1.1'], [0.18, '1.05 0.96'], [0.3, '1 1']]
const SQUASH_X = 20 // o eixo do achatamento: o meio da caixa, no chão dela

function compile(spec: Spec, part: Step[], flags: Flags): Tracks {
  const tr: Tracks = {
    dur: span(part),
    pos: [],
    vis: new Map(),
    legsA: [[0, '0 0']],
    legsB: [[0, '0 0']],
    bob: [[0, '0 0']],
    lift: [[0, '0 0']],
    look: [[0, '0 0']],
    squash: [[0, '1 1']],
  }
  const vis = (key: string, t: number, on: boolean) => {
    let pts = tr.vis.get(key)
    if (!pts) tr.vis.set(key, (pts = [[0, 'hidden']]))
    pts.push([t, on ? 'visible' : 'hidden'])
  }
  const showBody = (t: number, body: Body) => {
    for (const k of BODY_KINDS) vis(`body:${k}`, t, k === body)
  }

  let shown: number | null = null
  const showFrame = (t: number, id: number | null) => {
    if (shown === id) return
    if (shown !== null) vis(`frame:${shown}`, t, false)
    if (id !== null) vis(`frame:${id}`, t, true)
    shown = id
  }

  let t0 = 0
  for (const s of part) {
    const t1 = t0 + s.d
    tr.pos.push([t0, s.p0], [t1, s.p1])
    const pose = s.pose
    const front = !pose.laptop
    const motion = pose.motion ?? 'still'

    // enfeites que valem para qualquer pose
    vis('under:aura', t0, flags.ultra)
    vis('fx:press', t0, pose.fx === 'press')
    for (const k of FX_KINDS) {
      const on =
        k === pose.fx ||
        (k === 'sweat' && flags.tired) ||
        (k === 'bang' && flags.worried && !flags.rain && !pose.wave && pose.body !== 'stretch' && pose.fx !== 'check' && spec.kind !== 'sleep')
      vis(`fx:${k}`, t0, on)
    }
    for (const k of TYPING_PROP_KINDS) {
      const on =
        (!!pose.typing &&
          ((k === 'glasses' && flags.tool === 'read') ||
            (k === 'magnifier' && flags.tool === 'web') ||
            (k === 'hammer' && flags.tool === 'edit') ||
            (k === 'browsT' && flags.worried) ||
            (k === 'umbrellaT' && flags.rain))) ||
        // o chapéu de data vai com o laptop aberto (a cabeça não se mexe); com chuva, o guarda-chuva ganha
        (!!pose.laptop && !flags.rain && ((k === 'santaT' && flags.hat === 'santa') || (k === 'partyT' && flags.hat === 'party')))
      vis(`typing:${k}`, t0, on)
    }

    // o tapinha: achata e volta, em qualquer pose (até com o laptop aberto)
    if (pose.squash) for (const [dt, v] of SQUASH) tr.squash.push([t0 + dt, v])
    else tr.squash.push([t0, '1 1'])

    if (!front) {
      // em SVG, um filho "visible" aparece mesmo dentro de um grupo escondido: por isso
      // cada camada da pose de frente é escondida junto, senão ela fica por cima do laptop
      vis('front', t0, false)
      for (const k of BODY_KINDS) vis(`body:${k}`, t0, false)
      for (const k of EYE_KINDS) vis(`eyes:${k}`, t0, false)
      for (const k of FRONT_PROP_KINDS) vis(`prop:${k}`, t0, false)
      pose.laptop!.forEach((id, i) => showFrame(t0 + i / LAPTOP_FPS, id))
      t0 = t1
      continue
    }

    showFrame(t0, null)
    vis('front', t0, true)
    const eyes: Eyes = pose.eyes ?? 'open'
    for (const k of EYE_KINDS) vis(`eyes:${k}`, t0, k === eyes)
    vis('prop:brows', t0, flags.worried)
    vis('prop:mug', t0, flags.morning && spec.kind === 'idle')
    // chovendo: o guarda-chuva fica preso na cabeça (no pulo de alegria ele some)
    vis('prop:umbrella', t0, flags.rain && motion !== 'jump')
    vis('prop:sign', t0, !!pose.sign)
    // o chapéu de data: com chuva ele some (o guarda-chuva ganha); no pulo de alegria ele fica
    vis('prop:santa', t0, flags.hat === 'santa' && !flags.rain)
    vis('prop:party', t0, flags.hat === 'party' && !flags.rain)
    for (const k of ['legsA', 'legsB', 'bob', 'lift'] as const) tr[k].push([t0, '0 0'])

    // o corpo: acenando, ou parado numa pose
    if (pose.wave) {
      for (let k = 0, t = t0; t < t1 - 0.01; k++, t += 0.2) showBody(t, k % 2 === 0 ? 'waveA' : 'waveB')
    } else showBody(t0, pose.body ?? 'body')

    if (pose.look !== undefined) tr.look.push([t0, `${pose.look} 0`])
    else if (motion === 'breathe' && s.d >= 2.5) {
      // parado, ele espia em volta
      tr.look.push([t0, '0 0'], [t0 + s.d * 0.35, '1 0'], [t0 + s.d * 0.5, '0 0'], [t0 + s.d * 0.7, '-1 0'], [t0 + s.d * 0.85, '0 0'])
    } else tr.look.push([t0, '0 0'])

    // de madrugada, parado, ele boceja
    if (flags.night && motion === 'breathe' && s.d >= 3) {
      const a = t0 + s.d * 0.4
      const b = t0 + s.d * 0.65
      vis(`eyes:${eyes}`, a, false)
      vis('eyes:closed', a, true)
      vis('prop:mouth', a, true)
      vis('eyes:closed', b, eyes === 'closed')
      vis(`eyes:${eyes}`, b, true)
      vis('prop:mouth', b, false)
    } else vis('prop:mouth', t0, false)

    if (motion === 'walk') {
      for (let k = 0, t = t0; t < t1 - 0.01; k++, t += STEP_S) {
        tr.legsA.push([t, k % 2 === 0 ? '0 -1' : '0 0'])
        tr.legsB.push([t, k % 2 === 0 ? '0 0' : '0 -1'])
        tr.bob.push([t, k % 2 === 0 ? '0 -1' : '0 0'])
      }
    } else if (motion === 'breathe' || motion === 'snooze') {
      const half = motion === 'snooze' ? 1.5 : 1
      for (let k = 0, t = t0; t < t1 - 0.01; k++, t += half) tr.bob.push([t, k % 2 === 0 ? '0 0' : '0 -1'])
    } else if (motion === 'jump') {
      for (let t = t0; t < t1 - 0.01; t += JUMP_S) {
        JUMP.forEach((dy, i) => tr.lift.push([t + (i * JUMP_S) / JUMP.length, `0 ${dy}`]))
      }
    } else if (motion === 'shake') {
      for (let k = 0, t = t0; t < Math.min(t1, t0 + 0.6) - 0.01; k++, t += 0.05) tr.lift.push([t, k % 2 === 0 ? '-0.5 0' : '0.5 0'])
      tr.lift.push([Math.min(t1, t0 + 0.6), '0 0'])
    } else if (motion === 'wobble') {
      // tonto: balança de um lado pro outro o passo inteiro
      for (let k = 0, t = t0; t < t1 - 0.01; k++, t += 0.12) tr.lift.push([t, k % 2 === 0 ? '-1 0' : '1 0'])
      tr.lift.push([t1, '0 0'])
    }
    t0 = t1
  }
  return tr
}

const round = (v: number) => Math.round(v * 100000) / 100000

// Pontos (tempo, valor) para values/keyTimes de um passo a passo (discrete).
function discrete(points: Pt[], dur: number): { values: string; keyTimes: string } | null {
  if (dur <= 0) return null
  const out: Pt[] = []
  for (const [t, v] of points) {
    const k = round(t / dur)
    if (k >= 1) continue
    if (out.length && out[out.length - 1][0] === k) {
      out[out.length - 1] = [k, v]
      continue
    }
    out.push([k, v])
  }
  if (!out.length) return null
  if (out[0][0] !== 0) out.unshift([0, out[0][1]])
  const merged = out.filter((p, i) => i === 0 || p[1] !== out[i - 1][1])
  return { values: merged.map(p => p[1]).join(';'), keyTimes: merged.map(p => p[0]).join(';') }
}

// Pontos (tempo, posição) para um movimento contínuo (linear).
function linear(points: [number, number][], dur: number, fmt: (p: number) => string): { values: string; keyTimes: string } | null {
  if (dur <= 0 || !points.length) return null
  const out: [number, number][] = []
  for (const [t, p] of points) {
    const k = Math.min(1, round(t / dur))
    if (out.length && out[out.length - 1][0] === k) {
      out[out.length - 1] = [k, p]
      continue
    }
    out.push([k, p])
  }
  if (out[0][0] !== 0) out.unshift([0, out[0][1]])
  if (out[out.length - 1][0] !== 1) out.push([1, out[out.length - 1][1]])
  return { values: out.map(p => fmt(p[1])).join(';'), keyTimes: out.map(p => p[0]).join(';') }
}

// As duas animações de um elemento: a introdução (uma vez, congelando no fim) e o
// laço (para sempre). O começo é puxado para trás pelo tempo que a cena já rodou,
// então um redesenho continua de onde estava em vez de recomeçar.
function both(
  tag: 'animate' | 'animateTransform',
  attr: string,
  intro: { values: string; keyTimes: string } | null,
  loop: { values: string; keyTimes: string } | null,
  introDur: number,
  loopDur: number,
  elapsed: number,
  calc: 'discrete' | 'linear',
  kind: 'translate' | 'scale' = 'translate',
): string {
  const type = tag === 'animateTransform' ? ` type="${kind}"` : ''
  const one = (a: { values: string; keyTimes: string }, dur: number, begin: number, repeat: string) =>
    `<${tag} attributeName="${attr}"${type} values="${a.values}" keyTimes="${a.keyTimes}" dur="${round(dur)}s" begin="${round(begin)}s" calcMode="${calc}" ${repeat}/>`
  return (
    (intro && introDur > 0 ? one(intro, introDur, -elapsed, 'fill="freeze"') : '') +
    (loop && loopDur > 0 ? one(loop, loopDur, introDur - elapsed, LOOP) : '')
  )
}

// team: os ajudantes na baia, na ordem em que chegaram (cada um com a fantasia dele)
// fireworks: segundos desde o commit (os fogos começam do zero), ou null sem fogos
// reach: quantos px ele anda da ponta direita até a ponta esquerda (estimativa conservadora)
export type Lane = { team: readonly TeamMate[]; cap: number; fireworks: number | null; shift: { dx: number; ago: number } | null; reach: number }

// As animações miúdas dos desenhos (piscar, chuva, aura, fumaça, mini-Clawds) recebem a
// fase do relógio: um redesenho cria uma imagem nova, e sem isso todas voltariam ao começo.
export function phased(art: string, wall: number): string {
  const phase = phaseOf(wall)
  return art.replace(/<(animate|animateTransform)\b([^>]*?)(\/?)>/g, (_m, tag: string, attrs: string, slash: string) => {
    const b = /\sbegin="(-?[\d.]+)s"/.exec(attrs)
    const begin = round((b ? Number(b[1]) : 0) - phase)
    return `<${tag}${b ? attrs.replace(b[0], ` begin="${begin}s"`) : `${attrs} begin="${begin}s"`}${slash}>`
  })
}

export function laneSvg(spec: Spec, elapsed: number, flags: Flags, height: number, lane: Lane, wall: number): string {
  const I = compile(spec, spec.intro, flags)
  const L = compile(spec, spec.loop, flags)
  const used = (key: string) => [I.vis.get(key), L.vis.get(key)].some(pts => pts?.some(p => p[1] === 'visible'))

  const vis = (key: string) =>
    both('animate', 'visibility', discrete(I.vis.get(key) ?? [[0, 'hidden']], I.dur), discrete(L.vis.get(key) ?? [[0, 'hidden']], L.dur), I.dur, L.dur, elapsed, 'discrete')
  const move = (pick: (t: Tracks) => Pt[]) =>
    both('animateTransform', 'transform', discrete(pick(I), I.dur), discrete(pick(L), L.dur), I.dur, L.dur, elapsed, 'discrete')
  const glide = (attr: string, tag: 'animate' | 'animateTransform', fmt: (p: number) => string) =>
    both(tag, attr, linear(I.pos, I.dur, fmt), linear(L.pos, L.dur, fmt), I.dur, L.dur, elapsed, 'linear')
  // O valor de cada trilha agora (no instante `elapsed`). Ele vai também como valor fixo do
  // elemento: o app recria a imagem a cada redesenho e pode mostrar um quadro antes de as
  // animações começarem; com isso esse quadro já é o certo (sem piscar vazio, sem cortar).
  const nowOf = (pts: (t: Tracks) => Pt[] | undefined, fallback: string) => {
    const inIntro = elapsed < I.dur || L.dur <= 0
    const t = inIntro ? elapsed : (elapsed - I.dur) % L.dur
    let v = fallback
    for (const [at, val] of pts(inIntro ? I : L) ?? []) if (at <= t + 1e-6) v = val
    return v
  }
  const visNow = (key: string) => nowOf(t => t.vis.get(key), 'hidden')
  const moveNow = (pick: (t: Tracks) => Pt[]) => nowOf(pick, '0 0')
  const layer = (key: string, art: string) => (used(key) ? `<g visibility="${visNow(key)}">${vis(key)}${art}</g>` : '')

  const frameIds = [...new Set([...spec.intro, ...spec.loop].flatMap(s => s.pose.laptop ?? []))]
  const laptopFrames = frameIds
    .map(id => layer(`frame:${id}`, LAPTOP_FRAMES[id].map((d, c) => (d ? `<path fill="${LAPTOP_COLORS[c]}" d="${d}"/>` : '')).join('')))
    .join('')

  const front = used('front')
    ? `<g visibility="${visNow('front')}">${vis('front')}<g transform="translate(${moveNow(t => t.lift)})">${move(t => t.lift)}` +
      `<g transform="translate(${moveNow(t => t.legsA)})">${move(t => t.legsA)}${legs([14, 24])}</g>` +
      `<g transform="translate(${moveNow(t => t.legsB)})">${move(t => t.legsB)}${legs([18, 28])}</g>` +
      `<g transform="translate(${moveNow(t => t.bob)})">${move(t => t.bob)}` +
      BODY_KINDS.map(k => layer(`body:${k}`, BODIES[k])).join('') +
      FRONT_PROP_KINDS.map(k => layer(`prop:${k}`, phased(FRONT_PROPS[k], wall))).join('') +
      `<g transform="translate(${moveNow(t => t.look)})">${move(t => t.look)}${EYE_KINDS.map(k => layer(`eyes:${k}`, phased(EYES[k], wall))).join('')}</g>` +
      `</g></g></g>`
    : ''

  const typing = TYPING_PROP_KINDS.map(k => layer(`typing:${k}`, phased(TYPING_PROPS[k], wall))).join('')
  // o confete cai do alto quando a festa começa, e a estrela do tapinha estoura quando ele leva o
  // tapinha: os dois contam do começo da cena; o resto segue o relógio
  const fx =
    FX_KINDS.map(k => layer(`fx:${k}`, phased(FX[k], k === 'confetti' || k === 'pow' ? elapsed : wall))).join('') + layer('fx:press', phased(PRESS, wall))
  // o achatamento do tapinha envolve o Clawd inteiro (corpo, laptop e acessórios), pelo chão da caixa
  const squashed = [...spec.intro, ...spec.loop].some(s => s.pose.squash)
  const squashAnim = squashed
    ? both('animateTransform', 'transform', discrete(I.squash, I.dur), discrete(L.squash, L.dur), I.dur, L.dur, elapsed, 'discrete', 'scale')
    : ''
  const aura = layer('under:aura', phased(ULTRA_AURA, wall))

  // O Clawd anda em % da imagem inteira (como a chuva), mais uma volta em células: ele vai de
  // PAD px depois do texto até o fim da pista, sem passar do começo nem do fim. Sem <svg>
  // de trilha no meio: na troca de imagem o app às vezes mede esse <svg> interno com largura
  // zero por um quadro, e o Clawd aparecia cortado na beira esquerda. Com ajudantes, o fim
  // recua a largura da baia deles: o Clawd nunca entra nela.
  // +1: o braço do aceno e o balanço da dança passam um pouco da caixa
  // o canto direito da caixa encosta no fim da pista (ou na baia dos ajudantes); p = 0 fica reach px à esquerda
  const right = BOX_W + 1 + helpersZone(lane.team.length, lane.cap)
  const reachC = lane.reach / CELL
  const at = (p: number) => `${round(-right - (1 - p) * reachC)} 0`
  // quando a baia dos ajudantes muda de tamanho, ele desliza até o lugar novo em vez de pular
  const slide = lane.shift
    ? `<animateTransform attributeName="transform" type="translate" values="${round(lane.shift.dx)} 0;0 0" dur="0.6s" begin="${round(-lane.shift.ago)}s" fill="freeze"/>`
    : ''
  const top = round(height - BOX_H * CELL)
  const p0 = posAt(spec, elapsed)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" shape-rendering="crispEdges">` +
    (flags.ultra ? phased(ultraLayer(height), wall) : '') +
    (flags.night ? phased(skyLayer(flags.rain), wall) : '') +
    (flags.rain ? phased(rainLayer(height), wall) : '') +
    // a festa de quem terminou conta do relógio também: o begin dela já desconta esta fase
    phased(helpersLayer(lane.team, lane.cap, BOX_W, BOX_H, CELL, height, flags.rain, wall), wall) +
    // a imagem já nasce com o Clawd onde ele está agora: se o app mostrar um quadro antes de as
    // animações começarem (ele recria a imagem a cada redesenho, como no tapinha), as duas partes
    // da posição (a % da pista e a volta em células) continuam juntas e ele não aparece cortado
    // o desenho do Clawd fica guardado em <defs> (em células) e aparece por um <use>, que anda em %
    // da imagem como a chuva: um <svg> interno, no quadro em que o app troca a imagem, às vezes
    // perde a posição e o Clawd aparecia cortado no começo da pista
    `<defs><g id="clawd-sprite"><g transform="scale(${CELL})">` +
    `<g transform="translate(${at(p0)})">${glide('transform', 'animateTransform', at)}<g>${slide}` +
    aura +
    (squashed ? `<g transform="translate(${SQUASH_X} ${BOX_H})"><g transform="scale(${nowOf(t => t.squash, '1 1')})">${squashAnim}<g transform="translate(${-SQUASH_X} ${-BOX_H})">` : '') +
    laptopFrames +
    front +
    typing +
    (squashed ? `</g></g></g>` : '') +
    fx +
    `</g></g></g></g></defs>` +
    // preso no canto direito por uma % FIXA (como a chuva): % animada sai zero no primeiro quadro de
    // cada imagem nova, e era isso que jogava o Clawd cortado no começo da pista
    `<use href="#clawd-sprite" x="100%" y="${top}"/>` +
    (lane.fireworks !== null ? phased(fireworksLayer(height), lane.fireworks) : '') +
    `</svg>`
  )
}

// O SVG que vai para o app, que recusa acima de 131072 caracteres. Passando de SVG_SAFE, a pista
// sai sem os fogos; se ainda passar, os ajudantes ficam sem fantasia (continuam lá, e a festa
// também). Quem chega perto do limite é o passeio do Clawd numa pista muito larga (~4000 px):
// numa pista assim ele sozinho já passa de SVG_SAFE.
export function fitLane(spec: Spec, elapsed: number, flags: Flags, height: number, lane: Lane, wall: number): string {
  let art = laneSvg(spec, elapsed, flags, height, lane, wall)
  if (art.length > SVG_SAFE && lane.fireworks !== null) art = laneSvg(spec, elapsed, flags, height, { ...lane, fireworks: null }, wall)
  if (art.length > SVG_SAFE && lane.team.some(m => m.costume)) {
    const plain = lane.team.map(m => ({ ...m, costume: '' as const }))
    art = laneSvg(spec, elapsed, flags, height, { ...lane, fireworks: null, team: plain }, wall)
  }
  return art
}
