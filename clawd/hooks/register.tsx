import { atom, read, update } from 'claude-code'
import type { EngineInterface, HttpInit, HttpResponse, Register } from 'claude-code'
import type { Activity, ClawdMood, Lines, SavedScene, StatusSpan, Weather } from '../types'
import { fitMinis, helpersZone, ORANGE } from './art'
import { changedLines, gitHappened, isLines } from './git'
import type { Ran } from './git'
import { BOX_W, CELL, CH_PX, LANE_GAP_CH, LANE_MIN_CH, LANE_MIN_H, LANE_W, laneSvg, LINE_PX, PAD, PARK_PX, SVG_SAFE, wideFits } from './lane'
import { LIMITS_BACKOFF_MS, LIMITS_EVERY_MS, LIMITS_FRESH_MS, USAGE_URL, windowOf } from './limits'
import type { Window } from './limits'
import { activityFor, ALT, ASK_S, BREAK_GAP_S, buildScene, FIREWORKS_S, hatFor, parseBirthday, OOPS_S, PARTY_S, PAUSE_EVERY_S, PAUSE_S, posAt, SLEEP_NIGHT_S, SLEEP_S, STREAK_S } from './scenes'
import type { Birthday, Flags, SceneKind, Spec } from './scenes'
import { parseAnsi, prettyModel } from './statusline'
import { clawdSpan, parseTap, TAP_COMBO_MS, TAP_COMBO_N, TAP_KEY, TAP_LOG_MAX, tapScene } from './tapinha'
import type { Tap } from './tapinha'
import { PLACE_EVERY_MS, PLACE_SERVICES, WEATHER_EVERY_MS, WEATHER_STALE_MS, weatherEmoji, weatherUrl, WET } from './weather'
import type { Place } from './weather'

// A faixa logo acima da caixa de mensagem (AbovePrompt): a statusline do usuário à
// esquerda e, no espaço que sobra à direita, a pista do Clawd. Ele anda, digita no
// laptop, comemora e reage aos números, sem passar por cima do texto.
//
// Este é o módulo que o hooks.json lista: os valores guardados (atoms), os ganchos (on) e
// tudo o que usa o $. Toda função que recebe o $ precisa morar AQUI: o motor só segue o $
// para dentro de funções declaradas no mesmo arquivo, nunca através de um import (o
// validador recusa). Os outros módulos são conta pura, sem $:
//   scenes.ts      as cenas: o que ele faz em cada humor, passo a passo, e quanto dura
//   lane.ts        o SVG da pista: as medidas, as trilhas de animação e o desenho final
//   statusline.ts  a saída colorida do terminal (ANSI) em pedaços com cor; o nome do modelo
//   limits.ts      o endereço e o ritmo da consulta dos limites; a leitura da resposta
//   weather.ts     os endereços do clima e do lugar; o código do tempo em emoji
//   git.ts         as linhas mexidas (Edit/Write) e a detecção de commit e push
//   tapinha.ts     o recado do clique, onde ele acerta o Clawd e a cena da reação
//   art.ts, laptop.ts  os desenhos

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
// O Claude parou esperando o seu sim numa permissão: o Clawd larga o laptop e chama você.
const asking = atom({ plugin: 'clawd', key: 'asking' } as const, false)
// Quantos tapinhas acertaram o Clawd. O valor não importa: a faixa lê o número só para se redesenhar na hora.
const taps = atom({ plugin: 'clawd', key: 'taps' } as const, 0)

// ---------- a statusline ----------

// A statusline: por padrão ~/.claude/statusline-rgb.js (o instalador copia a do projeto pra lá);
// a variável CLAWD_STATUSLINE aponta outro script. Roda direto com o node, sem embrulho nenhum.
// Onde procurar o node, nesta ordem: CLAWD_NODE (caminho do executável), "node" no PATH, no Windows o que
// o "where node" achar (o app pode não ter o nvm no PATH) e, por fim, os caminhos comuns do Mac/Linux.
const UNIX_NODES = ['/usr/local/bin/node', '/opt/homebrew/bin/node']
let statuslinePath = ''
let whereNode: string[] | undefined // o "where node" roda uma vez só e fica guardado

async function windowsNodes($: EngineInterface): Promise<string[]> {
  if (whereNode) return whereNode
  const windows = (await $.env.get('OS').catch(() => undefined)) === 'Windows_NT'
  if (!windows) return []
  let found: string[] = []
  try {
    const out = await $.process.run(['where', 'node'], { timeoutMs: 4000 })
    if (out.exitCode === 0) found = out.stdout.split(/\r?\n/).map((l) => l.trim().replace(/\\/g, '/')).filter((l) => l !== '')
  } catch {
    // sem "where": segue sem esses caminhos
  }
  return (whereNode = found)
}

// Cada etapa só é consultada se a anterior não rodou; assim o "where" só custa quando o "node" do PATH falha.
const nodeStages = ($: EngineInterface): Array<() => Promise<string[]>> => [
  async () => {
    const custom = await $.env.get('CLAWD_NODE').catch(() => undefined)
    return custom ? [custom] : []
  },
  async () => ['node'],
  () => windowsNodes($),
  async () => UNIX_NODES,
]

async function statuslineScript($: EngineInterface): Promise<string> {
  if (statuslinePath) return statuslinePath
  const custom = await $.env.get('CLAWD_STATUSLINE').catch(() => undefined)
  if (custom) return (statuslinePath = custom)
  const home = (await $.env.get('USERPROFILE').catch(() => undefined)) || (await $.env.get('HOME').catch(() => undefined)) || '~'
  return (statuslinePath = `${home.replace(/\\/g, '/')}/.claude/statusline-rgb.js`)
}
const STATUS_EVERY_MS = 20_000

// Quando ele reage aos números: sua com o contexto cheio, se preocupa com o limite de 5h.
const TIRED_AT = 80
const WORRIED_AT = 90

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
// Os botões de desligar as chamadas à internet (CLAWD_WEATHER / CLAWD_LIMITS = off, 0 ou false).
// Lidos de novo a cada consulta; os desenhos usam o último valor lido.
let weatherOff = false
let limitsOff = false

const isOff = (v: string | undefined) => ['off', '0', 'false'].includes(String(v ?? '').trim().toLowerCase())

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
    limitsOff = isOff(await $.env.get('CLAWD_LIMITS').catch(() => undefined))
    if (limitsOff) {
      live = null
      limitsNote = 'desligado por CLAWD_LIMITS'
      return
    }
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
  const fresh = !limitsOff && live && now - live.at < LIMITS_FRESH_MS ? live : null
  const fiveHour = fresh?.five_hour ?? fromSession('five_hour')
  const sevenDay = fresh?.seven_day ?? fromSession('seven_day')

  tired = (usage.context.percent ?? 0) >= TIRED_AT
  worried = !limitsOff && (fiveHour?.used_percentage ?? 0) >= WORRIED_AT

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
      let ran = false
      for (const stage of nodeStages($)) {
        if (ran) break
        for (const node of await stage()) {
          try {
            const out = await $.process.run([node, script], { stdin, env, timeoutMs: 8000 })
            if (out.exitCode === 0 && out.stdout.trim() !== '') {
              const parsed = parseAnsi(out.stdout)
              const key = JSON.stringify(parsed)
              if (key !== lastStatusKey) {
                lastStatusKey = key
                await update($, status, () => parsed)
                // guardada por pasta: a próxima conversa aqui já abre com ela, sem esperar o node
                const cwd = await $.session.cwd().catch(() => '')
                if (cwd) await $.store.set(`statusCache:${cwd}`, parsed).catch(() => undefined)
              }
            }
            ran = true
            break
          } catch {
            // sem esse node, tenta o próximo caminho
          }
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

// Limpeza do $.store: cada conversa deixa "effort:<id>" e "lines:<id>" para sempre. A chave
// "sessions" guarda o último instante em que cada conversa foi vista; as de mais de 7 dias
// (e as órfãs, sem registro, que sobraram de antes disso existir) são apagadas.
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000
const SESSION_TOUCH_MS = 3600 * 1000 // regravar "visto" no máximo de hora em hora: gravação à toa faz a faixa piscar

async function readSessions($: EngineInterface): Promise<Record<string, number>> {
  const raw = await $.store.get('sessions').catch(() => undefined)
  const out: Record<string, number> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [id, at] of Object.entries(raw as Record<string, unknown>)) if (typeof at === 'number') out[id] = at
  }
  return out
}

// Marca a conversa atual como vista agora, só quando o registro mudou de verdade.
async function touchSession($: EngineInterface) {
  if (!sessionKey) return
  const now = await $.clock.now()
  const seen = await readSessions($)
  const before = seen[sessionKey]
  if (typeof before === 'number' && now - before < SESSION_TOUCH_MS) return
  seen[sessionKey] = now
  await $.store.set('sessions', seen).catch(() => undefined)
}

// Apaga o que é de conversa velha ou órfã. A conversa atual nunca sai.
async function pruneSessions($: EngineInterface) {
  if (!sessionKey) return
  try {
    const now = await $.clock.now()
    const seen = await readSessions($)
    const stale = (id: string) => {
      if (id === sessionKey) return false
      const at = seen[id]
      return typeof at !== 'number' || now - at > SESSION_TTL_MS
    }
    const gone = new Set<string>()
    for (const key of await $.store.keys()) {
      const m = /^(effort|lines):(.+)$/.exec(key)
      if (!m || !stale(m[2])) continue
      gone.add(m[2])
      await $.store.delete(key).catch(() => undefined)
    }
    for (const id of Object.keys(seen)) if (stale(id)) gone.add(id)
    if (!gone.size) return
    for (const id of gone) delete seen[id]
    await $.store.set('sessions', seen).catch(() => undefined)
  } catch {
    // sem a limpeza desta vez; fica para a próxima conversa
  }
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
// O aniversário (CLAWD_BIRTHDAY="DD-MM"), lido no session.start; e o chapéu do dia pela data local.
let birthday: Birthday | null = null
const hatToday = (now: number) => {
  const d = new Date(now + utcOffsetS * 1000)
  return hatFor(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), birthday)
}

// ---------- o clima (onde ele estiver) ----------

// Open-Meteo, sem chave;
// os dados "current" mudam a cada 15 minutos. Chuva de verão chega em "showers".
// Onde ele está agora: pela conexão de internet (geolocalização por IP, nível de cidade),
// conferido a cada hora e guardado. A variável CLAWD_LOCATION="lat,lon" fixa um lugar.
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

async function refreshWeather($: EngineInterface) {
  try {
    weatherOff = isOff(await $.env.get('CLAWD_WEATHER').catch(() => undefined))
    if (weatherOff) {
      weatherNote = 'desligado por CLAWD_WEATHER'
      placeNote = weatherNote
      return
    }
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

// ---------- os ajudantes ----------

// Os ajudantes rodando agora (id -> tipo) e os que acabaram de terminar, para a
// lista do motor não ressuscitar um que ela ainda chama de "running" por um instante.
const running = new Map<string, string>()
const ended = new Set<string>()
const HELPERS_SYNC_MS = 2000

// ---------- a cena atual ----------

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

// Logo do Claude Code em blocos, para o terminal (que não desenha SVG e já tem statusline).
const TERMINAL_ART = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  ']

// ---------- o tapinha ----------

// O clique chega de uma área invisível por cima da pista (hooks/tap.tsx). A faixa não pode
// ter caixa nem botão: o app só deixa clicar em botão (que vira caixa) ou numa região dessas.

// A pista que a última renderização desenhou: o que `buildScene` precisa para continuar a cena.
let lastLane: { travel: number; parked: boolean; reach: number } | null = null
let laneCols = 0 // colunas da pista, medidas pela área de clique (exatas)
let tapTimes: number[] = [] // os tapinhas recentes, para o "tonto"
let lastTapAt = -Infinity // depois de um tapinha ele fica acordado um tempo
// Diagnóstico: os últimos cliques que chegaram (e se acertaram). Ficam em memória; só vão
// para o $.store se a variável CLAWD_DEBUG estiver definida (lida no session.start).
let debugOn = false
const tapLog: Record<string, unknown>[] = []

// Um clique chegou da área invisível: se pegou o Clawd, ele reage.
async function onTap($: EngineInterface, tap: Tap) {
  const now = await $.clock.now()
  const keep = async () => {
    if (tapLog.length > TAP_LOG_MAX) tapLog.splice(0, tapLog.length - TAP_LOG_MAX)
    if (debugOn) await $.store.set('tapLog', tapLog).catch(() => undefined) // só com CLAWD_DEBUG
  }
  // o aviso de que a área existe e quanto mede (e o de que o mouse entrou): só anotados
  if (tap.type !== 'down') {
    tapLog.push({ at: now, type: tap.type, cols: tap.cols, rows: tap.rows })
    if (tap.cols > 0) laneCols = tap.cols
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
  if (tap.cols > 0) laneCols = tap.cols
  const p = posAt(cur.spec, (now - cur.startedAt) / 1000)
  const [from, to] = clawdSpan(p, tap.cols, laneZone, lane.reach)
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
let askedAt = -1 // quando o pedido de permissão chegou (-1: nenhum esperando)
let askTool = '' // a ferramenta que pediu ('' quando só o aviso chegou e não se sabe qual)
let lastRequestAt = -Infinity // o último PermissionRequest, para o aviso de reserva não repetir
const NOTIFY_AFTER_MS = 30_000
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

// O Claude está esperando a sua permissão: o Clawd chama você. Só o agente principal chama.
async function startAsking($: EngineInterface, tool: string) {
  const now = await $.clock.now()
  markActivity(now)
  askTool = tool
  if (askedAt >= 0) {
    askedAt = now // outro pedido enquanto o anterior esperava: só renova o prazo, sem gravar à toa
    return
  }
  askedAt = now
  await update($, asking, () => true)
}

async function stopAsking($: EngineInterface) {
  if (askedAt < 0) return
  askedAt = -1
  askTool = ''
  await update($, asking, () => false)
}

// Uma ferramenta do agente principal terminou: se era a que esperava (ou começou depois do pedido,
// ou não se sabe qual esperava), a permissão se resolveu.
async function toolFinished($: EngineInterface, tool: string, startedAt: number) {
  if (askedAt < 0) return
  if (askTool === '' || tool === askTool || startedAt >= askedAt) await stopAsking($)
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
  if (askedAt >= 0 && now - askedAt >= ASK_S * 1000) await stopAsking($) // ninguém respondeu: volta ao normal
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
// A conversa abre com a última statusline desta pasta enquanto a leitura nova não chega.
async function seedStatus($: EngineInterface) {
  try {
    if ((await read($, status)).length) return
    const cwd = await $.session.cwd()
    const cached = await $.store.get(`statusCache:${cwd}`)
    if (Array.isArray(cached) && cached.length && (await read($, status)).length === 0) await update($, status, () => cached as StatusSpan[][])
  } catch {
    // sem cópia guardada: espera a primeira leitura
  }
}

function startBandPollers($: EngineInterface) {
  if (bandPollersOn) return
  bandPollersOn = true
  void seedStatus($)
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
    debugOn = !!(await $.env.get('CLAWD_DEBUG').catch(() => undefined))
    weatherOff = isOff(await $.env.get('CLAWD_WEATHER').catch(() => undefined))
    limitsOff = isOff(await $.env.get('CLAWD_LIMITS').catch(() => undefined))
    birthday = parseBirthday(await $.env.get('CLAWD_BIRTHDAY').catch(() => undefined))
    await $.store.delete('renderLog').catch(() => undefined) // sobra de uma depuração antiga
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
    askedAt = -1
    askTool = ''
    lastRequestAt = -Infinity
    await update($, asking, () => false)
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
      if (!e.agentId) {
        await touchSession($)
        await pruneSessions($)
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
    await touchSession($)
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
      chamando: askedAt >= 0,
      reacao: scene?.spec.intro[0]?.pose.fx ?? null,
      toques: tapLog.slice(),
      clima: weatherOff ? null : await read($, weather),
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
    const startedAt = await $.clock.now()
    if (!e.agentId) {
      markActivity(startedAt)
      wantActivity = activityFor(e.tool)
    } else lastSeen.set(e.agentId, startedAt)
    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e) // a espera pela permissão acontece aqui dentro
    } finally {
      // a ferramenta acabou (rodou, foi negada ou deu erro): se o Clawd estava chamando você, a espera acabou
      if (!e.agentId) await toolFinished($, e.tool, startedAt).catch(() => undefined)
    }
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
    await stopAsking($).catch(() => undefined)
    if (e.text) promptText = e.text
    markActivity(await $.clock.now())
    if (current !== 'idle') await setMood($, 'idle')
    await readStanding($)
    return next(e)
  })

  // O texto do pedido chega aqui primeiro (o aviso de ultracode vem depois, com o turno).
  on('prompt.submit', async ($, e, next) => {
    promptText = e.text
    await stopAsking($).catch(() => undefined)
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
    await stopAsking($).catch(() => undefined)
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

  // O Claude parou esperando o seu sim: o Clawd chama você. O pedido (PermissionRequest) é o sinal
  // principal; o aviso "permission_prompt" (Notification) só vale de reserva, se o pedido não chegou.
  // Os dois só do agente principal, e nenhum muda a decisão: o gancho só olha e passa adiante.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (e.agent_id) return next(e)
    try {
      lastRequestAt = await $.clock.now()
      await startAsking($, e.tool_name)
    } catch {
      // chamar é enfeite: nunca atrapalha a permissão
    }
    const answer = await next(e)
    // um gancho já decidiu sem perguntar a você: não há ninguém esperando
    if ((answer as { decision?: unknown }).decision !== undefined) await stopAsking($).catch(() => undefined)
    return answer
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' && !e.agent_id) {
      try {
        const now = await $.clock.now()
        if (askedAt < 0 && now - lastRequestAt > NOTIFY_AFTER_MS) await startAsking($, '')
      } catch {
        // idem
      }
    }
    return next(e)
  })

  // Uma negação automática: ninguém espera mais por essa.
  on('classic.PermissionDenied', async ($, e, next) => {
    if (!e.agent_id) await stopAsking($).catch(() => undefined)
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
      await stopAsking($).catch(() => undefined)
      await noteEffort($, e.effort?.level)
      await touchSession($)
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
    const calling = await read($, asking)
    const kind: SceneKind = calling ? 'ask' : squeezing ? 'compact' : e.props.isWorking ? 'work' : stored

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
    const skyNow = !weatherOff && sky && now - sky.at < WEATHER_STALE_MS ? sky : null // leitura velha não aparece
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
    // quanto ele anda, em px: pela largura medida da pista (se já houver) e com 10% de folga, para
    // ele nunca passar da beira esquerda mesmo se a coluna for mais estreita que CH_PX
    const laneW = laneCols > 0 ? laneCols * CH_PX : laneEst
    const reach = Math.max(0, 0.9 * (laneW - PAD - (BOX_W + 1 + helpersZone(team, cap)) * CELL))
    lastLane = { travel: sceneTravel, parked, reach } // o tapinha continua a cena a partir daqui
    const zone = helpersZone(team, cap)
    if (zone !== laneZone) {
      // preso pela direita: a baia crescer empurra ele inteiro para a esquerda; ele desliza até lá
      zoneShift = { dx: zone - laneZone, at: now }
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
      hat: hatToday(now),
    }
    const elapsed = (now - sc.startedAt) / 1000
    const boomAgo = !boom ? null : fireworksUntilAt >= 0 ? Math.max(0, (now - fireworksUntilAt) / 1000 + FIREWORKS_S) : now / 1000
    let laneArt = laneSvg(sc.spec, elapsed, flags, height, { helpers: team, cap, fireworks: boomAgo, shift, reach }, now / 1000)
    // o app recusa SVG acima de 131072 caracteres: nesse caso extremo, sem fogos
    if (laneArt.length > SVG_SAFE) laneArt = laneSvg(sc.spec, elapsed, flags, height, { helpers: team, cap, fireworks: null, shift, reach }, now / 1000)

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
