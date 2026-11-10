import { LAPTOP_FPS } from './laptop'
import { BOX_W, CELL, CH_PX } from './lane'
import { buildScene, laptop, LAPTOP_TYPING, posAt, stand } from './scenes'
import type { Pose, SceneKind, Spec, Step } from './scenes'

// ---------- o tapinha: o recado do clique, onde ele acerta e a cena da reação ----------

// Receber o clique e guardar o registro fica no register.tsx (usa o $); aqui é conta pura.

// O tapinha (um clique nele): a reação dura isto; vários cliques seguidos o deixam tonto.
const OUCH_S = 0.8
const DIZZY_S = 2
export const TAP_COMBO_N = 4 // quatro tapinhas...
export const TAP_COMBO_MS = 3000 // ...em 3 segundos
export const TAP_KEY = 'tap' // o endereço da área de clique (hooks/tap.tsx)
export const TAP_LOG_MAX = 30

// O clique: a área invisível cobre a pista inteira; o corpo dele começa na célula 8 da caixa
// (à esquerda ficam a caneca e a plaquinha) e o acerto ganha 2 colunas de folga de cada lado
// (a largura exata da coluna do app pode variar um pouco da CH_PX, que é aproximada).
const TAP_FROM = 8
const TAP_REACH = 2

// type: "down" é o clique de verdade; "boot" (a área ganhou tamanho) e "enter" (o mouse entrou)
// só servem de diagnóstico: ficam no registro e mais nada.
export type Tap = { type: string; x: number; y: number; cols: number; rows: number }

// O recado vem de código: confere antes de usar.
export function parseTap(data: unknown): Tap | null {
  if (!data || typeof data !== 'object') return null
  const { type, x, y, cols, rows } = data as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number' || typeof cols !== 'number' || typeof rows !== 'number') return null
  if (![x, y, cols, rows].every(Number.isFinite)) return null
  return { type: type === 'boot' || type === 'enter' ? type : 'down', x, y, cols, rows }
}

// Onde o corpo dele está na pista, em colunas a partir da esquerda (de ... até), para comparar com o
// clique. É a conta do desenho: a caixa começa PAD px depois do texto e anda p * (largura - PAD - caixa).
export function clawdSpan(p: number, cols: number, zone: number, reach: number): [number, number] {
  const left = cols - ((BOX_W + 1 + zone) * CELL + (1 - p) * reach) / CH_PX
  return [left + (TAP_FROM * CELL) / CH_PX - TAP_REACH, left + (BOX_W * CELL) / CH_PX + TAP_REACH]
}

// Quadros de digitação repetidos, para ele continuar digitando enquanto reage.
const typingFrames = (n: number) => Array.from({ length: n }, (_, i) => LAPTOP_TYPING[i % LAPTOP_TYPING.length] ?? 0)

// A cena logo depois de um tapinha: a de agora, continuada de onde ele está, com a reação na
// frente. Com o laptop aberto ele segue digitando (só o efeito aparece); dormindo, o tapinha o acorda.
export function tapScene(prev: { startedAt: number; spec: Spec }, now: number, travel: number, parked: boolean, dizzy: boolean) {
  const from = posAt(prev.spec, (now - prev.startedAt) / 1000)
  const effect: Pose = dizzy ? { fx: 'stars' } : { fx: 'pow', squash: true }
  if (prev.spec.kind === 'work' && (now - prev.startedAt) / 1000 >= prev.spec.laptopAt) {
    const frames = typingFrames(Math.round((dizzy ? DIZZY_S : OUCH_S) * LAPTOP_FPS))
    const hit: Step = { ...laptop(from, frames, true), pose: { laptop: frames, typing: true, ...effect } }
    return { startedAt: now, spec: { kind: 'work' as SceneKind, intro: [hit], loop: [laptop(from, LAPTOP_TYPING, true)], laptopAt: 0 } }
  }
  const kind: SceneKind = prev.spec.kind === 'sleep' ? 'idle' : prev.spec.kind
  const base = buildScene(kind, from, false, travel, parked)
  const react = dizzy
    ? stand(from, DIZZY_S, { eyes: 'dizzy', motion: 'wobble', look: 0, ...effect })
    : stand(from, OUCH_S, { eyes: 'ouch', motion: 'still', look: 0, ...effect })
  // a plaquinha de pausa já está de pé: sem espreguiçar de novo
  const intro = kind === 'pause' ? [react] : [react, ...base.intro]
  return { startedAt: now, spec: { ...base, intro, laptopAt: base.laptopAt + react.d } }
}
