import type { Activity, ClawdMood } from '../types'
import type { Body, Eyes, Fx } from './art'
import { LAPTOP_FPS, LAPTOP_SEQ } from './laptop'

// As cenas do Clawd: o que ele faz em cada humor, passo a passo, e quanto tempo cada coisa dura.
// Tudo aqui é conta pura (sem $): quem guarda a cena atual e decide o humor é o register.tsx.

export type SceneKind = ClawdMood | 'work' | 'compact' | 'ask'

// Quanto tempo cada reação dura, em segundos, e quando ele cochila.
export const PARTY_S = 5
export const OOPS_S = 4
export const SLEEP_S = 10 * 60
export const SLEEP_NIGHT_S = 3 * 60 // de madrugada ele cochila mais cedo
export const FIREWORKS_S = 7
// Chamando o Gus: se a permissão nunca se resolver (nenhum sinal chega), ele desiste depois disto.
export const ASK_S = 10 * 60

// A pausa: depois de 1 hora de trabalho seguido (sem 10 minutos de folga), ele
// se espreguiça e levanta a plaquinha; no máximo a cada 20 minutos.
export const BREAK_GAP_S = 10 * 60
export const STREAK_S = 60 * 60
export const PAUSE_S = 40
export const PAUSE_EVERY_S = 20 * 60

// As velocidades e os tempos dos passos.
const WALK_PX = 30 // px por segundo, passeando
const RUN_PX = 140 // px por segundo, correndo pro laptop
export const STEP_S = 0.18 // meio passo
const WAVE_S = 1.2

// A animação oficial: tira o laptop (0-16), digita (17-19, em laço), guarda (33-42).
const LAPTOP_INTRO = LAPTOP_SEQ.slice(0, 17)
export const LAPTOP_TYPING = LAPTOP_SEQ.slice(17, 20)
const LAPTOP_OUTRO = LAPTOP_SEQ.slice(33, 43)
const LAPTOP_SHOWS_AT = 9 / LAPTOP_FPS // quando o laptop já está à vista

// ---------- as cenas ----------

// Uma cena é uma introdução (toca uma vez) e um laço (repete), feitos de passos.
// Em cada passo ele vai de p0 a p1 (0 = começo da pista, 1 = fim).
type Motion = 'breathe' | 'snooze' | 'walk' | 'jump' | 'shake' | 'wobble' | 'still'
export type Pose = {
  laptop?: readonly number[]
  typing?: boolean
  eyes?: Eyes
  motion?: Motion
  fx?: Fx
  look?: number
  wave?: boolean
  body?: Body
  sign?: boolean
  squash?: boolean // achata e volta (o tapinha), valendo também com o laptop aberto
}
export type Step = { d: number; p0: number; p1: number; pose: Pose }
export type Spec = { kind: SceneKind; intro: Step[]; loop: Step[]; laptopAt: number; parked?: boolean }

// O que muda o visual sem mudar o tempo da cena.
export type Flags = {
  tired: boolean
  worried: boolean
  morning: boolean
  night: boolean
  tool: Activity
  rain: boolean
  ultra: boolean
}

export const stand = (p: number, d: number, pose: Pose = {}): Step => ({
  d,
  p0: p,
  p1: p,
  pose: { eyes: 'open', motion: 'breathe', ...pose },
})

const walk = (p0: number, p1: number, speed: number, travel: number): Step => ({
  d: Math.max(0.4, (Math.abs(p1 - p0) * travel) / speed),
  p0,
  p1,
  pose: { eyes: 'open', motion: 'walk', look: Math.sign(p1 - p0) },
})

export const laptop = (p: number, frames: readonly number[], typing = false): Step => ({
  d: frames.length / LAPTOP_FPS,
  p0: p,
  p1: p,
  pose: { laptop: frames, typing },
})

export const span = (steps: Step[]) => steps.reduce((sum, s) => sum + s.d, 0)

// Três paradas sorteadas pela pista, voltando sempre pro ponto de partida.
function wander(home: number, travel: number): Step[] {
  const stops: number[] = []
  let prev = home
  for (let i = 0; i < 3; i++) {
    let p = Math.random()
    for (let tries = 0; tries < 12 && Math.abs(p - prev) < 0.25; tries++) p = Math.random()
    p = Math.round(p * 100) / 100
    stops.push(p)
    prev = p
  }
  const steps: Step[] = [stand(home, 3 + Math.random() * 2)]
  let at = home
  for (const p of stops) {
    steps.push(walk(at, p, WALK_PX, travel), stand(p, 3 + Math.random() * 2.5))
    at = p
  }
  steps.push(walk(at, home, WALK_PX, travel))
  return steps
}

export function buildScene(kind: SceneKind, from: number, laptopOpen: boolean, travel: number, parked: boolean): Spec {
  const spec = buildSceneSteps(kind, from, laptopOpen, travel, parked)
  return parked ? { ...spec, parked } : spec
}

function buildSceneSteps(kind: SceneKind, from: number, laptopOpen: boolean, travel: number, parked: boolean): Spec {
  const outro = laptopOpen ? [laptop(from, LAPTOP_OUTRO)] : []
  switch (kind) {
    case 'work': {
      // ele acena pra você, corre pro fim da pista e abre o laptop
      const hello = stand(from, WAVE_S, { eyes: 'happy', wave: true, motion: 'still', look: 0 })
      const run = from < 0.98 ? [walk(from, 1, RUN_PX, travel)] : []
      return {
        kind,
        intro: [hello, ...run, laptop(1, LAPTOP_INTRO)],
        loop: [laptop(1, LAPTOP_TYPING, true)],
        laptopAt: WAVE_S + span(run) + LAPTOP_SHOWS_AT,
      }
    }
    case 'party':
      return { kind, intro: outro, loop: [stand(from, 1, { eyes: 'happy', motion: 'jump', fx: 'confetti', look: 0 })], laptopAt: Infinity }
    case 'oops':
      return {
        kind,
        intro: outro,
        loop: [stand(from, 1.2, { eyes: 'wide', motion: 'shake', fx: 'sweat', look: 0 }), stand(from, 1.6, { eyes: 'wide', motion: 'still', fx: 'sweat', look: 0 })],
        laptopAt: Infinity,
      }
    case 'sleep':
      return { kind, intro: [], loop: [stand(from, 6, { eyes: 'closed', motion: 'snooze', fx: 'zzz', look: 0 })], laptopAt: Infinity }
    case 'compact': {
      // compactando o contexto: corre pro canto e opera a prensa
      const run = from < 0.98 ? [walk(from, 1, RUN_PX, travel)] : []
      return { kind, intro: [...outro, ...run], loop: [stand(1, 1.2, { fx: 'press', look: -1, motion: 'still' })], laptopAt: Infinity }
    }
    case 'ask':
      // o claude parou esperando o seu sim: guarda o laptop, vira de frente e acena sem parar, com o balão "?"
      return { kind, intro: outro, loop: [stand(from, 1.2, { eyes: 'wide', motion: 'still', wave: true, fx: 'ask', look: 0 })], laptopAt: Infinity }
    case 'pause':
      // espreguiça e levanta a plaquinha "pausa?"
      return {
        kind,
        intro: [...outro, stand(from, 2.4, { body: 'stretch', eyes: 'closed', motion: 'still', look: 0 })],
        loop: [stand(from, 8, { sign: true, look: 0 })],
        laptopAt: Infinity,
      }
    default: {
      // pista curta: ele volta pro canto e fica ali (espia, pisca, dança), sem passear
      if (parked) {
        const back = from < 0.98 ? [walk(from, 1, WALK_PX, travel)] : []
        return { kind, intro: [...outro, ...back], loop: [stand(1, 6)], laptopAt: Infinity }
      }
      return { kind, intro: outro, loop: wander(from, travel), laptopAt: Infinity }
    }
  }
}

// Onde ele está, `t` segundos depois do começo da cena.
export function posAt(spec: Spec, t: number): number {
  const introDur = span(spec.intro)
  const loopDur = span(spec.loop)
  let steps = spec.intro
  let at = t
  if (t >= introDur && loopDur > 0) {
    steps = spec.loop
    at = (t - introDur) % loopDur
  }
  for (const s of steps) {
    if (at <= s.d) return s.p0 + (s.p1 - s.p0) * (s.d > 0 ? at / s.d : 1)
    at -= s.d
  }
  const end = steps[steps.length - 1]
  return end ? end.p1 : 1
}

export const ALT: Record<SceneKind, string> = {
  idle: 'Clawd passeando',
  work: 'Clawd digitando no laptop',
  party: 'Clawd comemorando',
  oops: 'Clawd assustado com um erro',
  sleep: 'Clawd dormindo',
  pause: 'Clawd sugerindo uma pausa',
  compact: 'Clawd compactando o contexto',
  ask: 'Clawd chamando você: o Claude espera sua permissão',
}

// O acessório que ele usa digitando, pela ferramenta que o agente principal está usando.
export function activityFor(tool: string): Activity {
  if (/^(Read|Glob|Grep|LS|NotebookRead)$/.test(tool)) return 'read'
  if (/^(WebSearch|WebFetch)$/.test(tool) || /Browser|chrome/i.test(tool)) return 'web'
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'edit'
  return ''
}
