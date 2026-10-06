import { atom, read, update } from 'claude-code'
import type { EngineInterface, HttpInit, HttpResponse, Register } from 'claude-code'

import type { Activity, ClawdMood, Lines, SavedScene, StatusSpan, Weather } from '../types'
import {
  BODIES,
  BODY_KINDS,
  EYES,
  EYE_KINDS,
  FRONT_PROPS,
  FRONT_PROP_KINDS,
  FX,
  FX_KINDS,
  LOOP,
  ORANGE,
  TYPING_PROPS,
  TYPING_PROP_KINDS,
  PRESS,
  ULTRA_AURA,
  fireworksLayer,
  helpersLayer,
  helpersZone,
  fitMinis,
  legs,
  rainLayer,
  ultraLayer,
} from './art'
import type { Body, Eyes, Fx } from './art'
import { LAPTOP_COLORS, LAPTOP_FPS, LAPTOP_FRAMES, LAPTOP_SEQ } from './laptop'

// A faixa logo acima da caixa de mensagem (AbovePrompt): a statusline do usuário à
// esquerda e, no espaço que sobra à direita, a pista do Clawd. Ele anda, digita no
// laptop, comemora e reage aos números, sem passar por cima do texto.

const mood = atom({ plugin: 'clawd', key: 'mood' } as const, 'idle' as ClawdMood)
const status = atom({ plugin: 'clawd', key: 'status' } as const, [] as StatusSpan[][])
const activity = atom({ plugin: 'clawd', key: 'activity' } as const, '' as Activity)
const weather = atom({ plugin: 'clawd', key: 'weather' } as const, null as Weather | null)
const helpers = atom({ plugin: 'clawd', key: 'helpers' } as const, 0)
const fireworks = atom({ plugin: 'clawd', key: 'fireworks' } as const, false)
const ultra = atom({ plugin: 'clawd', key: 'ultra' } as const, false)
const lines = atom({ plugin: 'clawd', key: 'lines' } as const, { added: 0, removed: 0 } as Lines)
// A cena atual, guardada para um recarregamento continuar de onde parou (só o início lê).
const savedScene = atom({ plugin: 'clawd', key: 'scene' } as const, null as SavedScene | null)
// Os ajudantes rodando (id -> tipo), guardados para um recarregamento não perdê-los.
const savedRunning = atom({ plugin: 'clawd', key: 'running' } as const, {} as Record<string, string>)
const compacting = atom({ plugin: 'clawd', key: 'compacting' } as const, false)
// Quantos tapinhas acertaram o Clawd. O valor não importa: a faixa lê o número só para se redesenhar na hora.
const taps = atom({ plugin: 'clawd', key: 'taps' } as const, 0)

type SceneKind = ClawdMood | 'work' | 'compact'

// Quanto tempo cada reação dura, em segundos, e quando ele cochila.
const PARTY_S = 5
const OOPS_S = 4
const SLEEP_S = 10 * 60
const SLEEP_NIGHT_S = 3 * 60 // de madrugada ele cochila mais cedo
const FIREWORKS_S = 7

// O tapinha (um clique nele): a reação dura isto; vários cliques seguidos o deixam tonto.
const OUCH_S = 0.8
const DIZZY_S = 2
const TAP_COMBO_N = 4 // quatro tapinhas...
const TAP_COMBO_MS = 3000 // ...em 3 segundos
const TAP_KEY = 'tap' // o endereço da área de clique (hooks/tap.tsx)
const TAP_LOG_MAX = 30

// A pausa: depois de 1 hora de trabalho seguido (sem 10 minutos de folga), ele
// se espreguiça e levanta a plaquinha; no máximo a cada 20 minutos.
const BREAK_GAP_S = 10 * 60
const STREAK_S = 60 * 60
const PAUSE_S = 40
const PAUSE_EVERY_S = 20 * 60

// ---------- a statusline ----------

// A statusline: por padrão ~/.claude/statusline-rgb.js (o instalador copia a do projeto pra lá);
// a variável CLAWD_STATUSLINE aponta outro script. Roda direto com o node, sem embrulho nenhum.
const NODES = ['node', 'C:/nvm4w/nodejs/node.exe', '/usr/local/bin/node', '/opt/homebrew/bin/node']
let statuslinePath = ''

async function statuslineScript($: EngineInterface): Promise<string> {
  if (statuslinePath) return statuslinePath
  const custom = await $.env.get('CLAWD_STATUSLINE').catch(() => undefined)
  if (custom) return (statuslinePath = custom)
  const home = (await $.env.get('USERPROFILE').catch(() => undefined)) || (await $.env.get('HOME').catch(() => undefined)) || '~'
  return (statuslinePath = `${home.replace(/\\/g, '/')}/.claude/statusline-rgb.js`)
}
const STATUS_EVERY_MS = 20_000

// Os limites ao vivo, do mesmo lugar que o /usage do Claude Code lê.
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const LIMITS_EVERY_MS = 2 * 60_000
const LIMITS_FRESH_MS = 6 * 60_000
const LIMITS_BACKOFF_MS = [5, 10, 20].map(m => m * 60_000) // depois de "muitas consultas" (429), espera mais

// Quando ele reage aos números: sua com o contexto cheio, se preocupa com o limite de 5h.
const TIRED_AT = 80
const WORRIED_AT = 90

const BASIC = ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5']
const BRIGHT = ['#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff']

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('')

function xterm(n: number): string {
  if (n < 8) return BASIC[n]
  if (n < 16) return BRIGHT[n - 8]
  if (n < 232) {
    const i = n - 16
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    return hex(level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6))
  }
  const g = 8 + (n - 232) * 10
  return hex(g, g, g)
}

// Traduz a saída colorida do terminal (ANSI) em pedaços com cor, linha a linha.
function parseAnsi(text: string): StatusSpan[][] {
  const clean = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  const out: StatusSpan[][] = []

  for (const raw of clean.split(/\r?\n/)) {
    const spans: StatusSpan[] = []
    let color: string | undefined
    let bold = false
    let dim = false
    let last = 0

    const push = (t: string) => {
      const plain = t.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
      if (!plain) return
      const prev = spans[spans.length - 1]
      if (prev && prev.c === color && !!prev.b === bold && !!prev.d === dim) {
        prev.t += plain
        return
      }
      const span: StatusSpan = { t: plain }
      if (color) span.c = color
      if (bold) span.b = true
      if (dim) span.d = true
      spans.push(span)
    }

    const sgr = /\x1b\[([0-9;]*)m/g
    for (let m = sgr.exec(raw); m; m = sgr.exec(raw)) {
      push(raw.slice(last, m.index))
      last = sgr.lastIndex
      const codes = m[1] === '' ? [0] : m[1].split(';').map(Number)
      for (let i = 0; i < codes.length; i++) {
        const k = codes[i]
        if (k === 0) {
          color = undefined
          bold = false
          dim = false
        } else if (k === 1) bold = true
        else if (k === 2) dim = true
        else if (k === 22) bold = dim = false
        else if (k === 39) color = undefined
        else if (k >= 30 && k <= 37) color = BASIC[k - 30]
        else if (k >= 90 && k <= 97) color = BRIGHT[k - 90]
        else if (k === 38 && codes[i + 1] === 2) {
          color = hex(codes[i + 2], codes[i + 3], codes[i + 4])
          i += 4
        } else if (k === 38 && codes[i + 1] === 5) {
          color = xterm(codes[i + 2])
          i += 2
        } else if (k === 48) i += codes[i + 1] === 2 ? 4 : 2 // fundo: a faixa já tem o dela
      }
    }
    push(raw.slice(last))

    if (spans.some(s => s.t.trim() !== '')) out.push(spans)
  }
  return out
}

// O nome do modelo como a statusline do terminal mostra: "Opus 5.5 (1M context)".
function prettyModel(raw: string, window: number): string {
  if (/\s/.test(raw.trim())) return raw.trim()
  const m = /^(?:claude-)?(opus|sonnet|haiku|fable)(?:-(\d+))?(?:-(\d{1,2}))?(?:-\d+)?(\[1m\])?$/i.exec(raw.trim())
  if (!m) return raw
  const name = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  const version = m[2] ? ` ${m[2]}${m[3] ? `.${m[3]}` : ''}` : ''
  const big = m[4] || window >= 1_000_000 ? ' (1M context)' : ''
  return `${name}${version}${big}`
}

type Window = { used_percentage: number; resets_at?: number }

// Lê uma janela de limite em qualquer um dos formatos conhecidos.
function windowOf(x: unknown): Window | undefined {
  if (!x || typeof x !== 'object') return undefined
  const o = x as Record<string, unknown>
  const pct = typeof o.utilization === 'number' ? o.utilization : typeof o.used_percentage === 'number' ? o.used_percentage : undefined
  if (pct === undefined) return undefined
  const r = o.resets_at ?? o.resetsAt
  const resets = typeof r === 'string' ? Date.parse(r) / 1000 : typeof r === 'number' ? (r > 1e12 ? r / 1000 : r) : NaN
  return Number.isFinite(resets) ? { used_percentage: pct, resets_at: resets } : { used_percentage: pct }
}

// Variáveis do módulo: um recarregamento começa de novo, e tudo bem.
let effort: string | undefined
let sessionKey = ''
let lastCols = 0
let refreshing = false
let refreshAgain = false
let statusDirty = false
let lastStatusKey = ''
let bandPollersOn = false // as leituras da faixa (statusline, limites, clima) já começaram
let live: { five_hour?: Window; seven_day?: Window; at: number } | null = null
let limitsNote = 'ainda não consultado'
let limitsNextAt = 0
let limitsStrikes = 0
let weatherNote = 'ainda não consultado'
let tired = false
let worried = false

// O fetch do mod não tem tempo-limite próprio: uma corrida com o relógio faz esse papel.
const FETCH_TIMEOUT_MS = 10_000

async function fetchTimed($: EngineInterface, url: string, init?: HttpInit): Promise<HttpResponse | null> {
  let fire: () => void = () => undefined
  const timeout = new Promise<null>(resolve => {
    fire = () => resolve(null)
  })
  const timer = $.clock.after(FETCH_TIMEOUT_MS, () => fire())
  try {
    return await Promise.race([$.http.fetch(url, init), timeout])
  } finally {
    timer.cancel()
  }
}

async function refreshLimits($: EngineInterface) {
  try {
    const now = await $.clock.now()
    // A leitura e a vez de consultar são da conta, não da conversa: as conversas abertas
    // dividem as duas pelo armazenamento do mod, e o "castigo" de um 429 vale para todas.
    const saved = (await $.store.get('limits').catch(() => undefined)) as typeof live | undefined
    if (saved && typeof saved.at === 'number' && saved.at > (live?.at ?? 0) && now - saved.at < LIMITS_FRESH_MS) live = saved
    const gate = (await $.store.get('limitsGate').catch(() => undefined)) as { nextAt?: unknown; strikes?: unknown } | undefined
    if (typeof gate?.nextAt === 'number' && gate.nextAt > limitsNextAt) limitsNextAt = gate.nextAt
    if (typeof gate?.strikes === 'number') limitsStrikes = gate.strikes
    if (now < limitsNextAt || (live && now - live.at < LIMITS_EVERY_MS - 5_000)) return
    limitsNextAt = now + LIMITS_EVERY_MS - 5_000
    await $.store.set('limitsGate', { nextAt: limitsNextAt, strikes: limitsStrikes }).catch(() => undefined) // esta conversa pegou a vez
    const auth = await $.session.authorize()
    if (!auth) {
      limitsNote = 'sem login da Anthropic nesta sessão'
      return
    }
    const res = await fetchTimed($, USAGE_URL, { headers: { 'anthropic-beta': 'oauth-2025-04-20' }, auth: auth.handle })
    if (!res) {
      limitsNote = 'sem resposta em 10 s'
      return
    }
    if (!res.ok) {
      if (res.status === 429) {
        const retry = Number(res.headers['retry-after'])
        const retryMs = Number.isFinite(retry) && retry > 0 ? retry * 1000 : 0
        limitsNextAt = now + Math.max(retryMs, LIMITS_BACKOFF_MS[Math.min(limitsStrikes, LIMITS_BACKOFF_MS.length - 1)])
        limitsStrikes++
        await $.store.set('limitsGate', { nextAt: limitsNextAt, strikes: limitsStrikes }).catch(() => undefined)
      }
      limitsNote = `HTTP ${res.status}: ${res.text.slice(0, 200)}`
      return
    }
    limitsStrikes = 0
    await $.store.set('limitsGate', { nextAt: limitsNextAt, strikes: 0 }).catch(() => undefined)
    const body = JSON.parse(res.text) as Record<string, unknown>
    live = { five_hour: windowOf(body.five_hour), seven_day: windowOf(body.seven_day), at: now }
    await $.store.set('limits', live).catch(() => undefined)
    limitsNote = `ok: ${res.text.slice(0, 200)}`
  } catch (err) {
    limitsNote = `erro: ${String(err).slice(0, 300)}`
  }
}

async function statusInput($: EngineInterface) {
  const [cwd, root, model, usage, id, repo, now, changed] = await Promise.all([
    $.session.cwd(),
    $.session.root(),
    $.session.model(),
    $.session.usage(),
    $.session.id(),
    $.session.repo().catch(() => null),
    $.clock.now(),
    read($, lines),
  ])

  const fromSession = (kind: string): Window | undefined => {
    const w = usage.rateLimits.find(r => r.kind === kind)
    if (!w) return undefined
    const resets = w.resetsAt ? Date.parse(w.resetsAt) / 1000 : NaN
    return Number.isFinite(resets) ? { used_percentage: w.percentUsed, resets_at: resets } : { used_percentage: w.percentUsed }
  }
  // O número ao vivo da conta vence o da última resposta desta conversa.
  const fresh = live && now - live.at < LIMITS_FRESH_MS ? live : null
  const fiveHour = fresh?.five_hour ?? fromSession('five_hour')
  const sevenDay = fresh?.seven_day ?? fromSession('seven_day')

  tired = (usage.context.percent ?? 0) >= TIRED_AT
  worried = (fiveHour?.used_percentage ?? 0) >= WORRIED_AT

  return {
    session_id: id,
    cwd,
    model: { id: model, display_name: prettyModel(model, usage.context.window) },
    workspace: { current_dir: cwd, project_dir: root, ...(repo?.name ? { repo: { name: repo.name } } : {}) },
    ...(effort ? { effort: { level: effort } } : {}),
    context_window: {
      used_percentage: usage.context.percent ?? 0,
      context_window_size: usage.context.window,
      total_input_tokens: usage.context.tokens,
    },
    rate_limits: { five_hour: fiveHour, seven_day: sevenDay },
    // as linhas mexidas aparecem ao lado da pasta ("+12 -3")
    cost: { total_cost_usd: usage.cost?.usd ?? 0, total_lines_added: changed.added, total_lines_removed: changed.removed },
  }
}

// Roda a statusline e guarda as linhas; um pedido no meio de outro vira mais uma volta.
async function refreshStatus($: EngineInterface) {
  if (refreshing) {
    refreshAgain = true
    return
  }
  refreshing = true
  try {
    do {
      refreshAgain = false
      const stdin = JSON.stringify(await statusInput($))
      // a largura que sobra ao lado da pista; o arquivo statusline-narrow, se existir, ainda manda
      const room = lastCols - LANE_MIN_CH - LANE_GAP_CH
      const env: Record<string, string> = { CLAUDE_STATUSLINE_COLS: wideFits(lastCols) ? String(room) : '45' }
      const script = await statuslineScript($)
      for (const node of NODES) {
        try {
          const out = await $.process.run([node, script], { stdin, env, timeoutMs: 8000 })
          if (out.exitCode === 0 && out.stdout.trim() !== '') {
            const parsed = parseAnsi(out.stdout)
            const key = JSON.stringify(parsed)
            if (key !== lastStatusKey) {
              lastStatusKey = key
              await update($, status, () => parsed)
            }
          }
          break
        } catch {
          // sem esse node, tenta o próximo caminho
        }
      }
    } while (refreshAgain)
  } catch {
    // a statusline é enfeite: um erro aqui nunca derruba a faixa
  } finally {
    refreshing = false
  }
}

async function refreshAll($: EngineInterface) {
  await refreshLimits($)
  await refreshStatus($)
}

// O "esforço" (MEDIUM, MAX...) chega nos eventos do turno, como a statusline do terminal o recebe.
async function noteEffort($: EngineInterface, level: string | undefined) {
  if (level === effort) return
  effort = level
  // guardado por conversa: retomar a conversa já começa com ele, e uma nova não herda o de outra
  if (sessionKey) await $.store.set(`effort:${sessionKey}`, level ?? null).catch(() => undefined)
  statusDirty = true
}

// A hora do lugar onde ele está: o fuso vem junto com a previsão do tempo (UTC-3 até lá).
let utcOffsetS = -3 * 3600
const hourHere = (now: number) => new Date(now + utcOffsetS * 1000).getUTCHours()

// ---------- o clima (onde ele estiver) ----------

// Open-Meteo, sem chave;
// os dados "current" mudam a cada 15 minutos. Chuva de verão chega em "showers".
// Onde ele está agora: pela conexão de internet (geolocalização por IP, nível de cidade),
// conferido a cada hora e guardado. A variável CLAWD_LOCATION="lat,lon" fixa um lugar.
type Place = { lat: number; lon: number; city: string; at: number }
const PLACE_EVERY_MS = 60 * 60_000
const PLACE_SERVICES = ['https://get.geojs.io/v1/ip/geo.json', 'https://ipwho.is/']
let place: Place | null = null
let placeNote = 'ainda não consultado'

async function refreshPlace($: EngineInterface) {
  try {
    const now = await $.clock.now()
    const fixed = await $.env.get('CLAWD_LOCATION').catch(() => undefined)
    const m = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(fixed ?? '')
    if (m) {
      place = { lat: Number(m[1]), lon: Number(m[2]), city: 'CLAWD_LOCATION', at: now }
      placeNote = 'fixo pela variável CLAWD_LOCATION'
      return
    }
    if (!place) {
      const saved = (await $.store.get('place').catch(() => undefined)) as Place | undefined
      if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') place = saved
    }
    if (place && now - place.at < PLACE_EVERY_MS) return
    for (const url of PLACE_SERVICES) {
      const res = await fetchTimed($, url)
      if (!res?.ok) continue
      const d = JSON.parse(res.text) as Record<string, unknown>
      const lat = Number(d.latitude)
      const lon = Number(d.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue
      place = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, city: String(d.city ?? ''), at: now }
      await $.store.set('place', place).catch(() => undefined)
      placeNote = `ok: ${place.city} (${url.split('/')[2]})`
      return
    }
    placeNote = place ? 'sem resposta: fica o último lugar conhecido' : 'sem resposta e sem lugar guardado'
  } catch (err) {
    placeNote = `erro: ${String(err).slice(0, 200)}`
  }
}

const weatherUrl = (p: Place) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code,is_day,precipitation,rain,showers&timezone=auto`
const WEATHER_EVERY_MS = 15 * 60_000
const WEATHER_STALE_MS = 60 * 60_000 // leitura mais velha que isso não abre guarda-chuva

// Códigos WMO do tempo para um emoji, de dia e de noite.
function weatherEmoji(code: number, day: boolean): string {
  if (code === 0) return day ? '☀️' : '🌙'
  if (code === 1) return day ? '🌤️' : '🌙'
  if (code === 2) return day ? '⛅' : '☁️'
  if (code === 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 57) return '🌦️'
  if (code >= 61 && code <= 67) return '🌧️'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '🌨️'
  if (code >= 80 && code <= 82) return '🌦️'
  if (code >= 95) return '⛈️'
  return day ? '🌤️' : '🌙'
}

const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 97, 99])

async function refreshWeather($: EngineInterface) {
  try {
    await refreshPlace($)
    if (!place) {
      weatherNote = 'sem lugar: não sei onde você está'
      return
    }
    const res = await fetchTimed($, weatherUrl(place))
    if (!res) {
      weatherNote = 'sem resposta em 10 s'
      return
    }
    if (!res.ok) {
      weatherNote = `HTTP ${res.status}: ${res.text.slice(0, 200)}`
      return
    }
    const body = JSON.parse(res.text) as { current?: Record<string, unknown>; utc_offset_seconds?: unknown }
    if (typeof body.utc_offset_seconds === 'number') utcOffsetS = body.utc_offset_seconds
    const cur = body.current
    if (!cur) {
      weatherNote = `sem "current": ${res.text.slice(0, 200)}`
      return
    }
    const code = Number(cur.weather_code)
    const temp = Number(cur.temperature_2m)
    if (!Number.isFinite(code) || !Number.isFinite(temp)) {
      weatherNote = `números estranhos: ${JSON.stringify(cur).slice(0, 200)}`
      return
    }
    // precipitação = chuva + pancadas dos últimos 15 minutos
    const rain = WET.has(code) || Number(cur.precipitation ?? 0) > 0
    const next: Weather = { emoji: weatherEmoji(code, cur.is_day === 1), temp: Math.round(temp), rain, at: await $.clock.now() }
    const prev = await read($, weather)
    const same = prev && prev.emoji === next.emoji && prev.temp === next.temp && prev.rain === next.rain
    if (!same || next.at - prev.at > WEATHER_STALE_MS / 2) await update($, weather, () => next)
    weatherNote = `ok: código ${code}, ${temp}°, chuva ${rain}`
  } catch (err) {
    weatherNote = `erro: ${String(err).slice(0, 200)}`
  }
}

// ---------- linhas mexidas, commits e ajudantes ----------

// A regra do terminal (claude.exe, a mesma que alimenta cost.total_lines_added):
// só Edit e Write contam, inclusive os dos ajudantes; recusados, com erro ou
// "staged" não contam. Cada linha do trecho que começa com + ou - conta uma.
// Um Write que cria o arquivo conta todas as linhas (quebras + 1).
function fromPatch(patch: unknown): Lines {
  let added = 0
  let removed = 0
  for (const hunk of Array.isArray(patch) ? (patch as { lines?: unknown }[]) : []) {
    for (const line of Array.isArray(hunk.lines) ? hunk.lines : []) {
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) added++
      else if (line.startsWith('-')) removed++
    }
  }
  return { added, removed }
}

type Ran = { deny?: string; isError?: boolean; text?: string; result?: unknown }

function changedLines(tool: string, ran: Ran): Lines | null {
  if (ran.deny !== undefined || ran.isError) return null
  const r = (ran.result ?? {}) as { staged?: boolean; type?: string; content?: unknown; structuredPatch?: unknown }
  if (r.staged === true) return null
  if (tool === 'Write' && r.type === 'create') return { added: typeof r.content === 'string' && r.content ? r.content.split('\n').length : 0, removed: 0 }
  return fromPatch(r.structuredPatch)
}

// Commit e push: o próprio Claude Code marca no resultado do Bash/PowerShell
// (result.gitOperation) quando um aconteceu de verdade. Reservas para o que ele
// perde: um commit que imprimiu antes de a linha falhar, e o commit quieto (-q).
const COMMIT_LINE = /^\[(?:([\w./-]+)|detached HEAD)(?: \(root-commit\))? ([0-9a-f]{4,})\]/m
const PUSH_LINE = /^\s*[+\-*!= ]?\s*(?:\[new branch\]|[0-9a-f]+\.\.+[0-9a-f]+)\s+\S+\s*->\s*(\S+)/m
const gitSub = (sub: string) =>
  new RegExp(String.raw`(?:^|[\s;&|(])git(?:\.exe)?(?:\s+-[cC]\s+(?:"[^"]*"|'[^']*'|\S+)|\s+--[^\s=]+=\S+)*\s+${sub}\b`)
const GIT_COMMIT = gitSub('commit')
const GIT_PUSH = gitSub('push')
const argsOf = (re: RegExp, cmd: string) => (cmd.split(re)[1] ?? '').split(/[&|;\n]/)[0] ?? ''
const QUIET = /(?:^|\s)(?:-q|--quiet)(?=\s|$)/
const COMMIT_DRY = /(?:^|\s)--dry-run(?=\s|$)/ // no commit, -n quer dizer --no-verify
const PUSH_DRY = /(?:^|\s)(?:-n|--dry-run)(?=\s|$)/ // no push, -n é --dry-run
const NOTHING = /nothing to commit|no changes added to commit|nothing added to commit/

function gitHappened(command: unknown, ran: Ran): boolean {
  if (typeof command !== 'string' || ran.deny !== undefined) return false
  const commitArgs = argsOf(GIT_COMMIT, command)
  const pushArgs = argsOf(GIT_PUSH, command)
  const wantsCommit = GIT_COMMIT.test(command) && !COMMIT_DRY.test(commitArgs)
  const wantsPush = GIT_PUSH.test(command) && !PUSH_DRY.test(pushArgs)
  if (!wantsCommit && !wantsPush) return false
  if (ran.isError) {
    const text = ran.text ?? String(ran.result ?? '')
    return (wantsCommit && COMMIT_LINE.test(text)) || (wantsPush && PUSH_LINE.test(text))
  }
  const r = (ran.result ?? {}) as { gitOperation?: { commit?: unknown; push?: unknown }; stdout?: string; stderr?: string; backgroundTaskId?: string }
  if (r.backgroundTaskId) return false // ainda rodando em segundo plano: não dá pra saber
  if (r.gitOperation?.commit || r.gitOperation?.push) return true
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  if ((wantsCommit && COMMIT_LINE.test(out)) || (wantsPush && PUSH_LINE.test(out))) return true
  return wantsCommit && QUIET.test(commitArgs) && !NOTHING.test(out)
}

// Os ajudantes rodando agora (id -> tipo) e os que acabaram de terminar, para a
// lista do motor não ressuscitar um que ela ainda chama de "running" por um instante.
const running = new Map<string, string>()
const ended = new Set<string>()
const HELPERS_SYNC_MS = 2000

// ---------- a pista ----------

// A pista é um SVG que ocupa o espaço à direita da statusline. O app desenha o SVG
// como imagem com no máximo 100% da largura do espaço; sem viewBox, o SVG mede em
// pixels de verdade, então o Clawd anda em porcentagem da pista. Ele mesmo é
// desenhado numa caixa de 34 x 23 células (1 célula = meio pixel do Clawd), a mesma
// grade da animação oficial do laptop.
const CELL = 2.25
const BOX_W = 34
const BOX_H = 23
const LANE_W = 4000 // o app corta em 100% do espaço
const SVG_SAFE = 125_000 // o app aceita até 131072 caracteres de SVG
const LANE_MIN_CH = 13 // menos que isso ao lado do texto, e o Clawd vai pra linha de baixo
const LANE_GAP_CH = 2 // o respiro entre a statusline e a pista
// A statusline tem dois formatos: o largo chega a ~90 colunas e só cabe com a pista
// ao lado a partir de ~107; abaixo disso vai o estreito (45), que sempre cabe.
const WIDE_ROOM_CH = 92
const wideFits = (cols: number) => cols - LANE_MIN_CH - LANE_GAP_CH >= WIDE_ROOM_CH
const PARK_PX = 150 // pista mais curta que isso: ele não passeia
const LANE_MIN_H = 62 // a caixa tem 51,75 px: o resto é folga para o pulo e a cúpula do guarda-chuva
const LINE_PX = 18.75 // altura de uma linha de texto da faixa
const PAD = 14 // folga entre o texto e o começo da pista
const CH_PX = 8.5 // largura aproximada de uma coluna da faixa (só para calcular a velocidade)
const WALK_PX = 30 // px por segundo, passeando
const RUN_PX = 140 // px por segundo, correndo pro laptop
const STEP_S = 0.18 // meio passo
const WAVE_S = 1.2
// O clique: a área invisível cobre a pista inteira; o corpo dele começa na célula 8 da caixa
// (à esquerda ficam a caneca e a plaquinha) e o acerto ganha 2 colunas de folga de cada lado
// (a largura exata da coluna do app pode variar um pouco da CH_PX, que é aproximada).
const TAP_FROM = 8
const TAP_REACH = 2

// A animação oficial: tira o laptop (0-16), digita (17-19, em laço), guarda (33-42).
const LAPTOP_INTRO = LAPTOP_SEQ.slice(0, 17)
const LAPTOP_TYPING = LAPTOP_SEQ.slice(17, 20)
const LAPTOP_OUTRO = LAPTOP_SEQ.slice(33, 43)
const LAPTOP_SHOWS_AT = 9 / LAPTOP_FPS // quando o laptop já está à vista

// ---------- as cenas ----------

// Uma cena é uma introdução (toca uma vez) e um laço (repete), feitos de passos.
// Em cada passo ele vai de p0 a p1 (0 = começo da pista, 1 = fim).
type Motion = 'breathe' | 'snooze' | 'walk' | 'jump' | 'shake' | 'wobble' | 'still'
type Pose = {
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
type Step = { d: number; p0: number; p1: number; pose: Pose }
type Spec = { kind: SceneKind; intro: Step[]; loop: Step[]; laptopAt: number; parked?: boolean }

// O que muda o visual sem mudar o tempo da cena.
type Flags = {
  tired: boolean
  worried: boolean
  morning: boolean
  night: boolean
  tool: Activity
  rain: boolean
  ultra: boolean
}

const stand = (p: number, d: number, pose: Pose = {}): Step => ({
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

const laptop = (p: number, frames: readonly number[], typing = false): Step => ({
  d: frames.length / LAPTOP_FPS,
  p0: p,
  p1: p,
  pose: { laptop: frames, typing },
})

const span = (steps: Step[]) => steps.reduce((sum, s) => sum + s.d, 0)

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

function buildScene(kind: SceneKind, from: number, laptopOpen: boolean, travel: number, parked: boolean): Spec {
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
function posAt(spec: Spec, t: number): number {
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
        (k === 'bang' && flags.worried && !flags.rain && !pose.wave && pose.body !== 'stretch' && spec.kind !== 'sleep')
      vis(`fx:${k}`, t0, on)
    }
    for (const k of TYPING_PROP_KINDS) {
      const on =
        !!pose.typing &&
        ((k === 'glasses' && flags.tool === 'read') ||
          (k === 'magnifier' && flags.tool === 'web') ||
          (k === 'hammer' && flags.tool === 'edit') ||
          (k === 'browsT' && flags.worried) ||
          (k === 'umbrellaT' && flags.rain))
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

// fireworks: segundos desde o commit (os fogos começam do zero), ou null sem fogos
type Lane = { helpers: number; cap: number; fireworks: number | null; shift: { dx: number; ago: number } | null }

// As animações miúdas dos desenhos (piscar, chuva, aura, fumaça, mini-Clawds) recebem a
// fase do relógio: um redesenho cria uma imagem nova, e sem isso todas voltariam ao começo.
function phased(art: string, wall: number): string {
  const phase = wall % 3600
  return art.replace(/<(animate|animateTransform)\b([^>]*?)(\/?)>/g, (_m, tag: string, attrs: string, slash: string) => {
    const b = /\sbegin="(-?[\d.]+)s"/.exec(attrs)
    const begin = round((b ? Number(b[1]) : 0) - phase)
    return `<${tag}${b ? attrs.replace(b[0], ` begin="${begin}s"`) : `${attrs} begin="${begin}s"`}${slash}>`
  })
}

function laneSvg(spec: Spec, elapsed: number, flags: Flags, height: number, lane: Lane, wall: number): string {
  const I = compile(spec, spec.intro, flags)
  const L = compile(spec, spec.loop, flags)
  const used = (key: string) => [I.vis.get(key), L.vis.get(key)].some(pts => pts?.some(p => p[1] === 'visible'))

  const vis = (key: string) =>
    both('animate', 'visibility', discrete(I.vis.get(key) ?? [[0, 'hidden']], I.dur), discrete(L.vis.get(key) ?? [[0, 'hidden']], L.dur), I.dur, L.dur, elapsed, 'discrete')
  const move = (pick: (t: Tracks) => Pt[]) =>
    both('animateTransform', 'transform', discrete(pick(I), I.dur), discrete(pick(L), L.dur), I.dur, L.dur, elapsed, 'discrete')
  const glide = (attr: string, tag: 'animate' | 'animateTransform', fmt: (p: number) => string) =>
    both(tag, attr, linear(I.pos, I.dur, fmt), linear(L.pos, L.dur, fmt), I.dur, L.dur, elapsed, 'linear')
  const layer = (key: string, art: string) => (used(key) ? `<g visibility="hidden">${vis(key)}${art}</g>` : '')

  const frameIds = [...new Set([...spec.intro, ...spec.loop].flatMap(s => s.pose.laptop ?? []))]
  const laptopFrames = frameIds
    .map(id => layer(`frame:${id}`, LAPTOP_FRAMES[id].map((d, c) => (d ? `<path fill="${LAPTOP_COLORS[c]}" d="${d}"/>` : '')).join('')))
    .join('')

  const front = used('front')
    ? `<g visibility="hidden">${vis('front')}<g>${move(t => t.lift)}` +
      `<g>${move(t => t.legsA)}${legs([14, 24])}</g><g>${move(t => t.legsB)}${legs([18, 28])}</g>` +
      `<g>${move(t => t.bob)}` +
      BODY_KINDS.map(k => layer(`body:${k}`, BODIES[k])).join('') +
      FRONT_PROP_KINDS.map(k => layer(`prop:${k}`, phased(FRONT_PROPS[k], wall))).join('') +
      `<g>${move(t => t.look)}${EYE_KINDS.map(k => layer(`eyes:${k}`, phased(EYES[k], wall))).join('')}</g>` +
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

  // A "trilha" começa PAD px depois do texto; a compensação faz o Clawd ir de PAD
  // até o fim da pista, sem passar do começo nem do fim. Com ajudantes, o fim
  // recua a largura da baia deles: o Clawd nunca entra nela.
  // +1: o braço do aceno e o balanço da dança passam um pouco da caixa
  const comp = BOX_W + 1 + helpersZone(lane.helpers, lane.cap) + PAD / CELL
  // quando a baia dos ajudantes muda de tamanho, ele desliza até o lugar novo em vez de pular
  const slide = lane.shift
    ? `<animateTransform attributeName="transform" type="translate" values="${round(lane.shift.dx)} 0;0 0" dur="0.6s" begin="${round(-lane.shift.ago)}s" fill="freeze"/>`
    : ''
  const top = round(height - BOX_H * CELL)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" shape-rendering="crispEdges">` +
    (flags.ultra ? phased(ultraLayer(height), wall) : '') +
    (flags.rain ? phased(rainLayer(height), wall) : '') +
    phased(helpersLayer(lane.helpers, lane.cap, BOX_W, BOX_H, CELL, height), wall) +
    `<svg x="${PAD}" y="0" width="100%" height="100%" overflow="visible">` +
    `<svg x="0" y="${top}" width="${BOX_W * CELL}" height="${BOX_H * CELL}" viewBox="0 0 ${BOX_W} ${BOX_H}" overflow="visible">` +
    glide('x', 'animate', p => `${round(p * 100)}%`) +
    `<g>${glide('transform', 'animateTransform', p => `${round(-p * comp)} 0`)}<g>${slide}` +
    aura +
    (squashed ? `<g transform="translate(${SQUASH_X} ${BOX_H})"><g>${squashAnim}<g transform="translate(${-SQUASH_X} ${-BOX_H})">` : '') +
    laptopFrames +
    front +
    typing +
    (squashed ? `</g></g></g>` : '') +
    fx +
    `</g></g></svg></svg>` +
    (lane.fireworks !== null ? phased(fireworksLayer(height), lane.fireworks) : '') +
    `</svg>`
  )
}

// A cena atual. Quando o humor muda, a cena nova começa de onde ele estava.
let scene: { startedAt: number; spec: Spec } | null = null
let sceneDirty = false

function sceneFor(kind: SceneKind, now: number, travel: number, parked: boolean) {
  if (scene && scene.spec.kind === kind && !!scene.spec.parked === parked) return scene
  const elapsed = scene ? (now - scene.startedAt) / 1000 : 0
  const from = scene ? posAt(scene.spec, elapsed) : 1
  const laptopOpen = scene?.spec.kind === 'work' && elapsed >= scene.spec.laptopAt
  scene = { startedAt: now, spec: buildScene(kind, from, laptopOpen, travel, parked) }
  sceneDirty = true // o próximo tique guarda (quem desenha não pode gravar estado)
  return scene
}

const ALT: Record<SceneKind, string> = {
  idle: 'Clawd passeando',
  work: 'Clawd digitando no laptop',
  party: 'Clawd comemorando',
  oops: 'Clawd assustado com um erro',
  sleep: 'Clawd dormindo',
  pause: 'Clawd sugerindo uma pausa',
  compact: 'Clawd compactando o contexto',
}

function activityFor(tool: string): Activity {
  if (/^(Read|Glob|Grep|LS|NotebookRead)$/.test(tool)) return 'read'
  if (/^(WebSearch|WebFetch)$/.test(tool) || /Browser|chrome/i.test(tool)) return 'web'
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'edit'
  return ''
}


// Logo do Claude Code em blocos, para o terminal (que não desenha SVG e já tem statusline).
const TERMINAL_ART = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  ']

// ---------- o tapinha ----------

// O clique chega de uma área invisível por cima da pista (hooks/tap.tsx). A faixa não pode
// ter caixa nem botão: o app só deixa clicar em botão (que vira caixa) ou numa região dessas.

// A pista que a última renderização desenhou: o que `buildScene` precisa para continuar a cena.
let lastLane: { travel: number; parked: boolean } | null = null
let tapTimes: number[] = [] // os tapinhas recentes, para o "tonto"
let lastTapAt = -Infinity // depois de um tapinha ele fica acordado um tempo
// Diagnóstico: os últimos cliques que chegaram (e se acertaram), guardados em $.store.
const tapLog: Record<string, unknown>[] = []

// type: "down" é o clique de verdade; "boot" (a área ganhou tamanho) e "enter" (o mouse entrou)
// só servem de diagnóstico: ficam no registro e mais nada.
type Tap = { type: string; x: number; y: number; cols: number; rows: number }

// O recado vem de código: confere antes de usar.
function parseTap(data: unknown): Tap | null {
  if (!data || typeof data !== 'object') return null
  const { type, x, y, cols, rows } = data as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number' || typeof cols !== 'number' || typeof rows !== 'number') return null
  if (![x, y, cols, rows].every(Number.isFinite)) return null
  return { type: type === 'boot' || type === 'enter' ? type : 'down', x, y, cols, rows }
}

// Onde o corpo dele está na pista, em colunas a partir da esquerda (de ... até), para comparar com o
// clique. É a conta do desenho: a caixa começa PAD px depois do texto e anda p * (largura - PAD - caixa).
function clawdSpan(p: number, cols: number, zone: number): [number, number] {
  const left = PAD / CH_PX + p * (cols - ((BOX_W + 1 + zone) * CELL + PAD) / CH_PX)
  return [left + (TAP_FROM * CELL) / CH_PX - TAP_REACH, left + (BOX_W * CELL) / CH_PX + TAP_REACH]
}

// Quadros de digitação repetidos, para ele continuar digitando enquanto reage.
const typingFrames = (n: number) => Array.from({ length: n }, (_, i) => LAPTOP_TYPING[i % LAPTOP_TYPING.length] ?? 0)

// A cena logo depois de um tapinha: a de agora, continuada de onde ele está, com a reação na
// frente. Com o laptop aberto ele segue digitando (só o efeito aparece); dormindo, o tapinha o acorda.
function tapScene(prev: { startedAt: number; spec: Spec }, now: number, travel: number, parked: boolean, dizzy: boolean) {
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

// Um clique chegou da área invisível: se pegou o Clawd, ele reage.
async function onTap($: EngineInterface, tap: Tap) {
  const now = await $.clock.now()
  const keep = async () => {
    if (tapLog.length > TAP_LOG_MAX) tapLog.splice(0, tapLog.length - TAP_LOG_MAX)
    await $.store.set('tapLog', tapLog).catch(() => undefined)
  }
  // o aviso de que a área existe e quanto mede (e o de que o mouse entrou): só anotados
  if (tap.type !== 'down') {
    tapLog.push({ at: now, type: tap.type, cols: tap.cols, rows: tap.rows })
    await keep()
    return
  }
  const cur = scene
  const lane = lastLane
  if (!cur || !lane) {
    tapLog.push({ at: now, type: 'down', x: tap.x, y: tap.y, cols: tap.cols, rows: tap.rows, ignorado: 'sem cena ainda' })
    await keep()
    return
  }
  const p = posAt(cur.spec, (now - cur.startedAt) / 1000)
  const [from, to] = clawdSpan(p, tap.cols, laneZone)
  // sem a largura da área (ainda não medida), qualquer clique na pista vale
  const hit = tap.cols <= 0 || (tap.x + 0.5 >= from && tap.x + 0.5 <= to)
  const r1 = (v: number) => Math.round(v * 10) / 10
  tapLog.push({ at: now, type: 'down', x: tap.x, y: tap.y, cols: tap.cols, rows: tap.rows, p: Math.round(p * 1000) / 1000, from: r1(from), to: r1(to), hit, kind: cur.spec.kind })
  await keep()
  if (!hit) return

  lastTapAt = now
  tapTimes = [...tapTimes.filter(t => now - t < TAP_COMBO_MS), now]
  const dizzy = tapTimes.length >= TAP_COMBO_N
  if (dizzy) tapTimes = []
  const wakes = cur.spec.kind === 'sleep'
  scene = tapScene(cur, now, lane.travel, lane.parked, dizzy)
  sceneDirty = true
  // acordar já redesenha a faixa (o humor é lido nela); nos outros casos o contador manda redesenhar
  if (wakes) await setMood($, 'idle')
  else await update($, taps, n => n + 1)
}

// ---------- o comportamento ----------

// Tudo em milissegundos do relógio de verdade ($.clock.now()): com o notebook em
// repouso, nenhum tique roda, e contar tiques faria uma hora de tampa fechada valer 1 s.
let current: ClawdMood = 'idle'
let untilAt = 0
let lastActiveAt = 0
let working = false
let doing: Activity = ''
let nowHour = 12
let streakStartAt = -1
let lastPauseAt = -Infinity
let fireworksUntilAt = -1
let ultraSession = false // o ultracode ligado para a conversa inteira
let ultraTurn = false
let ultraOn = false
let ultraWorkflow = false // um workflow rodando em segundo plano
let ultraGrace = false // um turno ultracode acabou, mas os ajudantes dele ainda trabalham
let wantActivity: Activity = '' // o acessório pedido; o tique grava no máximo um por segundo
let promptText = '' // o pedido do turno, para conferir o aviso de ultracode
let standingSeen: boolean | null = null // a última leitura de "ultracode" na configuração
let laneZone = 0
let zoneShift: { dx: number; at: number } | null = null
const lastSeen = new Map<string, number>()
const HELPER_QUIET_MS = 15 * 60_000 // ajudante sem sinal de vida por 15 min: sai da baia

const ultraWanted = () => ultraTurn || ultraSession || ultraWorkflow || (ultraGrace && running.size > 0)

// A atividade da conversa (os turnos e as ferramentas do agente principal; os ajudantes
// não contam) forma a sequência de trabalho; 10 minutos de folga a zeram.
function markActivity(now: number) {
  if (streakStartAt < 0 || now - lastActiveAt >= BREAK_GAP_S * 1000) streakStartAt = now
  lastActiveAt = now
}

async function setMood($: EngineInterface, next: ClawdMood, seconds = 0) {
  current = next
  untilAt = (await $.clock.now()) + seconds * 1000
  await update($, mood, () => next)
}

async function setActivity($: EngineInterface, next: Activity) {
  if (next === doing) return
  doing = next
  await update($, activity, () => next)
}

async function setUltra($: EngineInterface, on: boolean) {
  if (on === ultraOn) return
  ultraOn = on
  await update($, ultra, () => on)
}

let helpersShown = 0

async function setHelpers($: EngineInterface) {
  const n = running.size
  if (n === helpersShown) return
  helpersShown = n
  await update($, helpers, () => n)
  const keep = Object.fromEntries(running)
  await update($, savedRunning, () => keep)
  // o ultracode continua aceso enquanto houver ajudantes de um turno ultracode
  if (n === 0) ultraGrace = false
  await setUltra($, ultraWanted())
}

// A lista do motor é a verdade para os ajudantes da ferramenta Agent (e os que um
// plugin cria); os de um workflow nunca aparecem nela e vivem só pelos eventos.
async function syncHelpers($: EngineInterface) {
  try {
    const now = await $.clock.now()
    for (const id of [...running.keys()]) {
      if (now - (lastSeen.get(id) ?? now) > HELPER_QUIET_MS) {
        running.delete(id)
        lastSeen.delete(id)
      }
    }
    for (const a of await $.agent.list()) {
      if (a.type === 'teammate') continue
      const live = a.status === 'running' || a.status === 'pending'
      if (live && !ended.has(a.id)) {
        running.set(a.id, a.type)
        if (!lastSeen.has(a.id)) lastSeen.set(a.id, now)
      }
      if (!live) {
        running.delete(a.id)
        ended.delete(a.id)
      }
    }
  } catch {
    // sem a lista, ficam só os eventos
  }
  await setHelpers($)
}

async function celebrate($: EngineInterface) {
  fireworksUntilAt = (await $.clock.now()) + FIREWORKS_S * 1000
  await update($, fireworks, () => true)
}

async function addLines($: EngineInterface, delta: Lines) {
  if (!delta.added && !delta.removed) return
  await update($, lines, prev => ({ added: prev.added + delta.added, removed: prev.removed + delta.removed }))
  // guardado por conversa: retomar a conversa (outro processo) continua a contagem
  if (sessionKey) {
    const total = await read($, lines)
    await $.store.set(`lines:${sessionKey}`, total).catch(() => undefined)
  }
  statusDirty = true
}

const isLines = (v: unknown): v is Lines =>
  !!v && typeof (v as Lines).added === 'number' && typeof (v as Lines).removed === 'number'

// Um passo do relógio, uma vez por segundo.
async function stepClock($: EngineInterface) {
  const now = await $.clock.now()
  const sleepAfter = (nowHour < 5 ? SLEEP_NIGHT_S : SLEEP_S) * 1000
  if (now - lastActiveAt >= BREAK_GAP_S * 1000) streakStartAt = -1 // ele fez uma pausa de verdade
  if ((current === 'party' || current === 'oops' || current === 'pause') && now >= untilAt) {
    await setMood($, 'idle')
  } else if (current === 'idle' && !working) {
    const longStreak = streakStartAt >= 0 && now - streakStartAt >= STREAK_S * 1000
    if (longStreak && now - lastPauseAt >= PAUSE_EVERY_S * 1000) {
      lastPauseAt = now
      await setMood($, 'pause', PAUSE_S)
    } else if (now - Math.max(lastActiveAt, lastTapAt) >= sleepAfter) await setMood($, 'sleep')
  }
  if (fireworksUntilAt >= 0 && now >= fireworksUntilAt) {
    fireworksUntilAt = -1
    await update($, fireworks, () => false)
  }
  if (sceneDirty && scene) {
    sceneDirty = false
    const keep: SavedScene = { startedAt: scene.startedAt, spec: scene.spec }
    await update($, savedScene, () => keep)
  }
  if (statusDirty && !refreshing && bandPollersOn) {
    statusDirty = false
    void refreshStatus($)
  }
  // o acessório (lupa, óculos, martelo) só do agente principal, gravado no máximo uma vez por segundo
  if (working && wantActivity !== doing) await setActivity($, wantActivity)
}

// Os relógios (humor, ajudantes, statusline, limites, clima) só servem para desenhar a
// faixa, e ela só existe no desktop: no terminal e nos "claude -p" o mod fica parado.
// Numa conversa nova o app se conecta DEPOIS do session.start, por isso a chegada
// dele (session.attach) também liga; num recarregamento ele já está lá.
function startBandPollers($: EngineInterface) {
  if (bandPollersOn) return
  bandPollersOn = true
  $.clock.every(1000, () => {
    void stepClock($).catch(() => undefined)
  })
  $.clock.every(HELPERS_SYNC_MS, () => {
    void syncHelpers($)
  })
  void syncHelpers($).catch(() => undefined)
  $.clock.every(STATUS_EVERY_MS, () => {
    void refreshStatus($)
  })
  $.clock.every(LIMITS_EVERY_MS, () => {
    void refreshAll($)
  })
  $.clock.every(WEATHER_EVERY_MS, () => {
    void refreshWeather($)
  })
  // a primeira leitura sem segurar o início da conversa
  void Promise.all([refreshAll($), refreshWeather($)]).catch(() => undefined)
}

// O ultracode ligado pela configuração (o botão do app grava "ultracode" nela). Só a
// mudança conta: o /effort ultracode off apaga mesmo com a configuração ainda ligada.
async function readStanding($: EngineInterface) {
  try {
    const on = ((await $.settings.read()) as Record<string, unknown>).ultracode === true
    if (on === standingSeen) return
    standingSeen = on
    ultraSession = on
    await setUltra($, ultraWanted())
  } catch {
    // sem a configuração, ficam os avisos do motor
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    current = 'idle'
    lastActiveAt = await $.clock.now()
    doing = ''
    lastStatusKey = ''
    bandPollersOn = false
    tapTimes = []
    lastTapAt = -Infinity
    lastLane = null
    tapLog.length = 0
    promptText = ''
    standingSeen = null
    // um recarregamento continua a cena de onde parou, em vez de mandar o Clawd pro canto
    try {
      const saved = await read($, savedScene)
      if (saved && saved.spec) {
        const spec = saved.spec as Spec
        scene = { startedAt: saved.startedAt, spec: { ...spec, laptopAt: typeof spec.laptopAt === 'number' ? spec.laptopAt : Infinity } }
      }
    } catch {
      scene = null
    }
    running.clear()
    ended.clear()
    try {
      const startedAt = await $.clock.now()
      for (const [id, type] of Object.entries(await read($, savedRunning))) {
        running.set(id, type)
        lastSeen.set(id, startedAt)
      }
    } catch {
      // sem ajudantes guardados
    }
    helpersShown = -1
    wantActivity = ''
    await update($, mood, () => 'idle' as ClawdMood)
    await update($, activity, () => '' as Activity) // um recarregamento não deixa acessório velho
    await update($, fireworks, () => false)
    await update($, compacting, () => false)
    // a aura herda o estado de antes do recarregamento; o próximo fim de turno (classic.Stop)
    // confirma pelo que está mesmo rodando em segundo plano
    ultraOn = await read($, ultra)
    ultraWorkflow = ultraOn
    await setHelpers($)
    await readStanding($)
    try {
      sessionKey = await $.session.id()
      const saved = await $.store.get(`effort:${sessionKey}`)
      if (typeof saved === 'string') effort = saved
      const savedLines = await $.store.get(`lines:${sessionKey}`)
      const nowLines = await read($, lines)
      if (isLines(savedLines) && !nowLines.added && !nowLines.removed && (savedLines.added || savedLines.removed)) {
        await update($, lines, () => savedLines)
      }
    } catch {
      // sem memória guardada, o esforço chega no fim do primeiro turno
    }

    // num recarregamento o app já está conectado; numa conversa nova, o session.attach abaixo liga
    const surfaces = await $.session.surfaces().catch(() => [] as readonly string[])
    if (e.surface === 'desktop' || surfaces.includes('desktop')) startBandPollers($)

    return next(e)
  })

  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    startBandPollers($)
    return next(e)
  })

  // O diagnóstico por dentro. A ferramenta não é registrada (o modelo não a vê);
  // só os testes a chamam. Para depurar, registre de novo com $.tool.register.
  on('tool.call', { tool: 'mcp__clawd__recarregar' }, async $ => {
    await Promise.all([refreshStatus($), refreshWeather($)])
    const now = await $.clock.now()
    const report = {
      limites: limitsNote,
      esforco: effort ?? null,
      colunas: lastCols,
      hora_local: hourHere(now),
      lugar: place,
      lugar_nota: placeNote,
      cansado: tired,
      preocupado: worried,
      ferramenta: doing,
      cena: scene?.spec.kind ?? null,
      reacao: scene?.spec.intro[0]?.pose.fx ?? null,
      toques: tapLog.slice(),
      clima: await read($, weather),
      clima_nota: weatherNote,
      ajudantes: [...running.keys()],
      linhas: await read($, lines),
      fogos: await read($, fireworks),
      ultracode: await read($, ultra),
      sequencia_min: streakStartAt >= 0 ? Math.round((now - streakStartAt) / 60_000) : null,
      ultracode_motivos: { turno: ultraTurn, conversa: ultraSession, workflow: ultraWorkflow, sobra: ultraGrace, configuracao: standingSeen },
      faixa_lendo: bandPollersOn,
      statusline: (await read($, status)).map(l => l.map(s => s.t).join('')),
    }
    return { result: JSON.stringify(report, null, 1) }
  })

  on('tool.call', async ($, e, next) => {
    if (!e.agentId) {
      markActivity(await $.clock.now())
      wantActivity = activityFor(e.tool)
    } else lastSeen.set(e.agentId, await $.clock.now())
    const result = await next(e)
    try {
      const ran = result as unknown as Ran
      // um workflow lançado: o modo equipe (ultracode) acende até ele terminar
      if (e.tool === 'Workflow' && !e.agentId && ran.deny === undefined && !ran.isError) {
        ultraWorkflow = true
        await setUltra($, true)
      }
      if (e.tool === 'Edit' || e.tool === 'Write') {
        const delta = changedLines(e.tool, ran)
        if (delta) await addLines($, delta)
      }
      if ((e.tool === 'Bash' || e.tool === 'PowerShell') && gitHappened((e as unknown as { command?: unknown }).command, ran)) {
        await celebrate($)
      }
    } catch {
      // contar linhas e soltar fogos é enfeite: nunca atrapalha a ferramenta
    }
    return result
  })

  // O turno principal começa de verdade (uma mensagem digitada durante outro turno espera
  // a vez, e só aí conta). Subagentes não disparam turn.start.
  on('turn.start', async ($, e, next) => {
    working = true
    if (e.text) promptText = e.text
    markActivity(await $.clock.now())
    if (current !== 'idle') await setMood($, 'idle')
    await readStanding($)
    return next(e)
  })

  // O texto do pedido chega aqui primeiro (o aviso de ultracode vem depois, com o turno).
  on('prompt.submit', async ($, e, next) => {
    promptText = e.text
    return next(e)
  })

  // O próprio motor avisa que um pedido é ultracode (a mesma regra que ele usa para a palavra)
  // e quando o ultracode é ligado ou desligado para a conversa inteira.
  on('prompt.attachment', { type: 'workflow_keyword_request' }, async ($, e, next) => {
    // ao retomar a conversa o motor repete os avisos antigos: só vale se o pedido de agora fala nele
    if (!e.agentId && /ultracode/i.test(promptText)) {
      ultraTurn = true
      await setUltra($, true)
    }
    return next(e)
  })
  on('prompt.attachment', { type: 'ultra_effort_enter' }, async ($, e, next) => {
    if (!e.agentId) {
      ultraSession = true
      await setUltra($, true)
    }
    return next(e)
  })
  on('prompt.attachment', { type: 'ultra_effort_exit' }, async ($, e, next) => {
    if (!e.agentId) {
      ultraSession = false
      await setUltra($, ultraWanted())
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      // o fim de um ajudante: o motor avisa uma vez por execução, terminada, cancelada ou com erro
      running.delete(e.agentId)
      ended.add(e.agentId)
      await setHelpers($)
      return next(e)
    }
    working = false
    markActivity(await $.clock.now())
    if (ultraTurn) ultraGrace = true
    ultraTurn = false
    await setUltra($, ultraWanted())
    wantActivity = ''
    await setActivity($, '')
    if (e.reason === 'answer') await setMood($, 'party', PARTY_S)
    else if (e.reason === 'aborted') await setMood($, 'idle')
    else await setMood($, 'oops', OOPS_S)
    return next(e)
  })

  // Ajudantes: entra quando começa (inclusive os de workflow); sai no fim do turno dele, acima.
  // O motor espera este gancho antes do ajudante começar, então ele é curto de propósito.
  on('classic.SubagentStart', async ($, e, next) => {
    ended.delete(e.agent_id)
    running.set(e.agent_id, e.agent_type)
    lastSeen.set(e.agent_id, await $.clock.now())
    await setHelpers($)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') {
      if (sessionKey) await $.store.delete(`lines:${sessionKey}`).catch(() => undefined)
      sessionKey = await $.session.id().catch(() => sessionKey)
      await update($, lines, () => ({ added: 0, removed: 0 }))
      statusDirty = true
    }
    if (e.source === 'resume') {
      // o /resume troca de conversa sem reiniciar o mod: as linhas e o esforço passam a ser os dela
      const id = await $.session.id().catch(() => sessionKey)
      if (id && id !== sessionKey) {
        sessionKey = id
        const savedLines = await $.store.get(`lines:${id}`).catch(() => undefined)
        await update($, lines, () => (isLines(savedLines) ? savedLines : { added: 0, removed: 0 }))
        const savedEffort = await $.store.get(`effort:${id}`).catch(() => undefined)
        effort = typeof savedEffort === 'string' ? savedEffort : undefined
        statusDirty = true
      }
    }
    return next(e)
  })

  // O fim de cada turno principal traz o esforço e o que segue rodando em segundo plano.
  on('classic.Stop', async ($, e, next) => {
    if (!e.agent_id) {
      await noteEffort($, e.effort?.level)
      ultraWorkflow = (e.background_tasks ?? []).some(t => t.type === 'workflow')
      await setUltra($, ultraWanted())
    }
    return next(e)
  })

  // Compactação do contexto: enquanto ela roda, o Clawd opera a prensa.
  on('session.compact', async ($, e, next) => {
    if (e.agentId || e.trigger === 'precompute') return next(e)
    await update($, compacting, () => true)
    try {
      return await next(e)
    } finally {
      await update($, compacting, () => false)
      statusDirty = true
      if (!working) await setMood($, 'party', 3)
    }
  })

  // Contexto e limites mudaram: atualiza a statusline.
  on('session.measure', async ($, e, next) => {
    statusDirty = true
    return next(e)
  })

  // Um clique na área invisível sobre a pista: se pegou o Clawd, ele leva o tapinha.
  on('ui.message', async ($, e, next) => {
    if (e.element !== TAP_KEY) return next(e)
    const tap = parseTap(e.data)
    if (tap) await onTap($, tap).catch(() => undefined)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const stored = await read($, mood)
    const squeezing = await read($, compacting)
    const kind: SceneKind = squeezing ? 'compact' : e.props.isWorking ? 'work' : stored

    if (e.surface !== 'desktop') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {TERMINAL_ART.map(row => (
            <Text color={ORANGE}>{row}</Text>
          ))}
        </Box>
      )
    }

    // a janela mudou de largura e a statusline troca de formato: o próximo tique já refaz
    if (wideFits(e.props.bodyColumns) !== wideFits(lastCols)) statusDirty = true
    lastCols = e.props.bodyColumns
    const now = await $.clock.now()
    nowHour = hourHere(now)
    const base = await read($, status)
    const tool = await read($, activity)
    const sky = await read($, weather)
    const team = await read($, helpers)
    const boom = await read($, fireworks)
    const isUltra = await read($, ultra)
    await read($, taps) // cada tapinha que acerta o Clawd redesenha a faixa na hora

    // A statusline dele, mais o clima ao lado da pasta.
    const rows: StatusSpan[][] = base.map(l => [...l])
    const skyNow = sky && now - sky.at < WEATHER_STALE_MS ? sky : null // leitura velha não aparece
    if (skyNow && rows.length) rows[0] = [...rows[0], { t: '  ' }, { t: `${skyNow.emoji} ${Math.round(skyNow.temp)}°` }]

    // A pista é o que sobra à direita da statusline. Se não sobra o bastante (a faixa
    // fica estreita com o painel do navegador aberto), o Clawd ganha uma linha só dele,
    // embaixo; e numa pista curta ele fica estacionado no canto, sem passear.
    const textCols = rows.reduce((most, l) => Math.max(most, [...l.map(s => s.t).join('')].length + 2), 0)
    const sideBySide = rows.length === 0 || e.props.bodyColumns - textCols - LANE_GAP_CH >= LANE_MIN_CH
    const laneEst = Math.max(0, (sideBySide ? e.props.bodyColumns - textCols - LANE_GAP_CH : e.props.bodyColumns) * CH_PX)
    // Os mini-Clawds só ganham baia se ainda sobrar uns 60 px pro Clawd andar.
    const cap = fitMinis((laneEst - PAD - 60) / CELL - BOX_W)
    const travel = laneEst - PAD - (BOX_W + helpersZone(team, cap)) * CELL
    const parked = travel < PARK_PX
    const height = sideBySide ? Math.max(LANE_MIN_H, Math.round(rows.length * LINE_PX)) : LANE_MIN_H

    // a pista nunca passa de LANE_W: com isso o SVG fica sempre abaixo do limite do app
    const sceneTravel = Math.min(Math.max(80, travel), LANE_W - PAD - BOX_W * CELL)
    const sc = sceneFor(kind, now, sceneTravel, parked)
    lastLane = { travel: sceneTravel, parked } // o tapinha continua a cena a partir daqui
    const zone = helpersZone(team, cap)
    if (zone !== laneZone) {
      zoneShift = { dx: posAt(sc.spec, (now - sc.startedAt) / 1000) * (zone - laneZone), at: now }
      laneZone = zone
    }
    const shift = zoneShift && now - zoneShift.at < 600 ? { dx: zoneShift.dx, ago: (now - zoneShift.at) / 1000 } : null
    const flags: Flags = {
      tired,
      worried,
      morning: nowHour >= 6 && nowHour < 11,
      night: nowHour < 5,
      tool,
      rain: !!skyNow?.rain,
      ultra: isUltra,
    }
    const elapsed = (now - sc.startedAt) / 1000
    const boomAgo = !boom ? null : fireworksUntilAt >= 0 ? Math.max(0, (now - fireworksUntilAt) / 1000 + FIREWORKS_S) : now / 1000
    let laneArt = laneSvg(sc.spec, elapsed, flags, height, { helpers: team, cap, fireworks: boomAgo, shift }, now / 1000)
    // o app recusa SVG acima de 131072 caracteres: nesse caso extremo, sem fogos
    if (laneArt.length > SVG_SAFE) laneArt = laneSvg(sc.spec, elapsed, flags, height, { helpers: team, cap, fireworks: null, shift }, now / 1000)

    const { Box, Text, Svg, Client } = $.ui.resolve(e)
    const text = rows.length
      ? [
          <Box flexDirection="column" flexShrink={0}>
            {rows.map(spans => (
              <Text wrap="truncate">
                {spans.map(s => (
                  <Text {...(s.c ? { color: s.c } : {})} {...(s.b ? { bold: true } : {})} {...(s.d ? { dimColor: true } : {})}>
                    {s.t}
                  </Text>
                ))}
              </Text>
            ))}
          </Box>,
        ]
      : []
    return (
      <Box flexDirection={sideBySide ? 'row' : 'column'} alignItems={sideBySide ? 'flex-end' : 'stretch'}>
        {text}
        <Box flexDirection="column" flexGrow={1} minWidth={sideBySide ? LANE_MIN_CH : 0} marginLeft={sideBySide && rows.length ? LANE_GAP_CH : 0}>
          <Svg source={laneArt} alt={ALT[kind]} width={LANE_W} height={height} />
          {/* a área de clique: invisível, por cima da pista; presa dentro dela (overflow), pra nunca vazar
              sobre a caixa de mensagem */}
          <Box position="absolute" top={0} left={0} right={0} bottom={0} overflow="hidden">
            <Client key={TAP_KEY} module="./tap.tsx" width="100%" height="100%" />
          </Box>
        </Box>
      </Box>
    )
  })
}
