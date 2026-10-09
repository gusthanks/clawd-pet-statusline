import { atom, read, update } from 'claude-code'
import type { EngineInterface, HttpInit, HttpResponse, Register } from 'claude-code'
import type { Activity, ClawdMood, Costume, Crew, Lines, Progress, SavedRun, SavedScene, StatusSpan, TeamMate, Weather } from '../types'
import { fitMinis, helpersZone, ORANGE } from './art'
import { crewOf, PARTY_MS, teamOf } from './equipe'
import { settleCostume } from './fantasias'
import { changedLines, gitHappened, isLines, testVerdict } from './git'
import type { Ran } from './git'
import { advance, batchFill, END_CHECK_MS, endOf, endStatus, FAIL_MS, finalFileOf, finishRun, loadRuns, META_READS, META_TRIES, newRun, OK_MS, OVER_WAIT_MS, parsePhases, phaseOfLabel, phaseOfTitle, placeBar, progressOf, QUIET_MS, relaunch, runProgress, saveRun, setPhases, settled, TASKS_DONE_MS, tasksProgress, verdictOf } from './progresso'
import type { Placed, Run, TaskItem } from './progresso'
import { BOX_W, CELL, CH_PX, fitLane, LANE_GAP_CH, LANE_MIN_CH, LANE_MIN_H, LANE_W, LINE_PX, PAD, PARK_PX, wideFits } from './lane'
import { LIMITS_BACKOFF_MS, LIMITS_EVERY_MS, LIMITS_FRESH_MS, USAGE_URL, windowOf } from './limits'
import type { Window } from './limits'
import { activityFor, ALT, ASK_S, BREAK_GAP_S, buildScene, FIREWORKS_S, hatFor, parseBirthday, OOPS_S, PARTY_S, PASS_S, PAUSE_EVERY_S, PAUSE_S, posAt, SLEEP_NIGHT_S, SLEEP_S, STREAK_S } from './scenes'
import type { Birthday, Flags, SceneKind, Spec } from './scenes'
import { parseAnsi, prettyModel } from './statusline'
import { clawdSpan, parseTap, TAP_COMBO_MS, TAP_COMBO_N, TAP_KEY, TAP_LOG_MAX, tapScene } from './tapinha'
import type { Tap } from './tapinha'
import { kmBetween, parseWindowsPlace, PLACE_EVERY_MS, PLACE_MOVED_KM, PLACE_SERVICES, WEATHER_EVERY_MS, WEATHER_STALE_MS, weatherEmoji, weatherUrl, isRaining, WINDOWS_PLACE_ARGV, WINDOWS_PLACE_TIMEOUT_MS } from './weather'
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
//   fantasias.ts   as fantasias dos ajudantes e quem veste qual, pela tarefa
//   equipe.ts      a baia dos ajudantes: o mini com a fantasia, a festa de quem terminou
//   progresso.ts   a barra de progresso (texto na coluna da statusline): o que mostra e onde cabe
//   art.ts, laptop.ts  os desenhos

const mood = atom({ plugin: 'clawd', key: 'mood' } as const, 'idle' as ClawdMood)
const status = atom({ plugin: 'clawd', key: 'status' } as const, [] as StatusSpan[][])
const activity = atom({ plugin: 'clawd', key: 'activity' } as const, '' as Activity)
const weather = atom({ plugin: 'clawd', key: 'weather' } as const, null as Weather | null)
// Os ajudantes na baia, na ordem em que chegaram: a fantasia, o tom e, de quem terminou bem, quando
// a festa começou. (O atom 'helpers', só um número, ficou para trás: nada mais o lê nem grava.)
const team = atom({ plugin: 'clawd', key: 'team' } as const, [] as TeamMate[])
const fireworks = atom({ plugin: 'clawd', key: 'fireworks' } as const, false)
const ultra = atom({ plugin: 'clawd', key: 'ultra' } as const, false)
const lines = atom({ plugin: 'clawd', key: 'lines' } as const, { added: 0, removed: 0 } as Lines)
// A cena atual, guardada para um recarregamento continuar de onde parou (só o início lê).
const savedScene = atom({ plugin: 'clawd', key: 'scene' } as const, null as SavedScene | null)
// Os ajudantes rodando (id -> tipo), guardados para um recarregamento não perdê-los.
const savedRunning = atom({ plugin: 'clawd', key: 'running' } as const, {} as Record<string, string>)
// A fantasia e o tom de cada um deles, guardados junto: um recarregamento não troca a fantasia de ninguém.
const savedCrew = atom({ plugin: 'clawd', key: 'crew' } as const, {} as Crew)
// A barra de progresso que a faixa desenha (null: nenhuma). Só o tique grava, e só quando muda.
const progress = atom({ plugin: 'clawd', key: 'progress' } as const, null as Progress | null)
// As execuções de workflow em andamento, guardadas para um recarregamento continuar a mesma barra.
const savedRuns = atom({ plugin: 'clawd', key: 'runs' } as const, [] as SavedRun[])
const compacting = atom({ plugin: 'clawd', key: 'compacting' } as const, false)
// O Claude parou esperando o seu sim numa permissão: o Clawd larga o laptop e chama você.
const asking = atom({ plugin: 'clawd', key: 'asking' } as const, false)
// Uma reação rápida a um teste que rodou durante o turno: '' (nenhuma), 'pass' ou 'oops'.
const reaction = atom({ plugin: 'clawd', key: 'reaction' } as const, '' as '' | 'pass' | 'oops')
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
// O fuso: o do Open-Meteo quando chega; sem ele (CLAWD_WEATHER=off ou sem resposta), o do sistema.
let utcOffsetS: number | null = null
const offsetAt = (now: number) => utcOffsetS ?? -new Date(now).getTimezoneOffset() * 60
const hourHere = (now: number) => new Date(now + offsetAt(now) * 1000).getUTCHours()
// O aniversário (CLAWD_BIRTHDAY="DD-MM"), lido no session.start; e o chapéu do dia pela data local.
let birthday: Birthday | null = null
const hatToday = (now: number) => {
  const d = new Date(now + offsetAt(now) * 1000)
  return hatFor(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), birthday)
}

// ---------- o clima (onde ele estiver) ----------

// Open-Meteo, sem chave;
// os dados "current" mudam a cada 15 minutos. Chuva de verão chega em "showers".
// Onde ele está agora, por esta ordem: CLAWD_LOCATION="lat,lon" (fixa, ganha de tudo); o serviço de
// localização do Windows (lê a posição aqui mesmo, nada sai da máquina); e, de reserva, a conexão de
// internet (geolocalização por IP, nível de cidade, que pode cair a uns 10 km). Conferido a cada hora e
// guardado, com a fonte ('windows', 'ip' ou 'env').
let place: Place | null = null
let placeNote = 'ainda não consultado'
let windowsFailedAt: number | null = null // o Windows negou ou falhou: só tenta de novo daqui a PLACE_EVERY_MS
let windowsRun: Promise<{ lat: number; lon: number; acc: number } | null> | null = null // uma consulta por vez

// O Windows PowerShell 5.1 (powershell.exe) pergunta ao serviço de localização. Nunca rejeita: sem
// powershell, com timeout ou negado, devolve null.
function windowsPlace($: EngineInterface) {
  if (windowsRun) return windowsRun
  const job = (async () => {
    try {
      const out = await $.process.run(WINDOWS_PLACE_ARGV, { timeoutMs: WINDOWS_PLACE_TIMEOUT_MS })
      return out.exitCode === 0 ? parseWindowsPlace(out.stdout) : null
    } catch {
      return null
    }
  })()
  windowsRun = job
  void job.then(() => {
    if (windowsRun === job) windowsRun = null
  })
  return job
}

// Lê o lugar fixo ou o guardado, sem consultar nada na internet nem no Windows.
async function loadPlace($: EngineInterface) {
  const now = await $.clock.now()
  const fixed = await $.env.get('CLAWD_LOCATION').catch(() => undefined)
  const m = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(fixed ?? '')
  if (m) {
    place = { lat: Number(m[1]), lon: Number(m[2]), city: 'CLAWD_LOCATION', at: now, source: 'env' }
    placeNote = 'fixo pela variável CLAWD_LOCATION'
    return true
  }
  if (!place) {
    const saved = (await $.store.get('place').catch(() => undefined)) as Place | undefined
    if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') place = saved
  }
  return false
}

// Troca o lugar e diz se ele mudou de verdade (outra fonte, ou mais de ~1 km). Grava no store só quando algo mudou.
async function adoptPlace($: EngineInterface, next: Place) {
  const prev = place
  place = next
  const same = prev && prev.lat === next.lat && prev.lon === next.lon && prev.city === next.city && prev.source === next.source
  if (!same) await $.store.set('place', next).catch(() => undefined)
  return !prev || (prev.source ?? 'ip') !== next.source || kmBetween(prev, next) > PLACE_MOVED_KM
}

// Está na hora de perguntar ao Windows? Só no Windows (o mesmo critério do CLAWD_NODE), e não logo depois de
// uma falha. Pergunta quando o lugar está vencido, ou quando o guardado não veio do Windows (IP ou versão antiga):
// aí é já, sem esperar a hora.
async function windowsDue($: EngineInterface) {
  if ((await $.env.get('OS').catch(() => undefined)) !== 'Windows_NT') return false
  const now = await $.clock.now()
  if (windowsFailedAt !== null && now - windowsFailedAt < PLACE_EVERY_MS) return false
  return !place || now - place.at >= PLACE_EVERY_MS || place.source !== 'windows'
}

// Devolve true se o lugar mudou de verdade e o clima precisa ser refeito na hora.
async function refreshPlace($: EngineInterface): Promise<boolean> {
  try {
    if (await loadPlace($)) return false
    const hourDue = !place || (await $.clock.now()) - place.at >= PLACE_EVERY_MS
    if (await windowsDue($)) {
      const fix = await windowsPlace($)
      if (fix) {
        windowsFailedAt = null
        const moved = await adoptPlace($, { lat: fix.lat, lon: fix.lon, city: '', at: await $.clock.now(), source: 'windows' })
        placeNote = `ok: Windows (precisão ${fix.acc} m)`
        return moved
      }
      windowsFailedAt = await $.clock.now()
    }
    if (!hourDue) return false
    for (const url of PLACE_SERVICES) {
      const res = await fetchTimed($, url)
      if (!res?.ok) continue
      const d = JSON.parse(res.text) as Record<string, unknown>
      const lat = Number(d.latitude)
      const lon = Number(d.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue
      const next: Place = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, city: String(d.city ?? ''), at: await $.clock.now(), source: 'ip' }
      const moved = await adoptPlace($, next)
      placeNote = `ok: ${next.city} (${url.split('/')[2]})${windowsFailedAt === null ? '' : ', o Windows não deu a posição'}`
      return moved
    }
    placeNote = place ? 'sem resposta: fica o último lugar conhecido' : 'sem resposta e sem lugar guardado'
  } catch (err) {
    placeNote = `erro: ${String(err).slice(0, 200)}`
  }
  return false
}

// Primeiro desenha o clima com o último lugar conhecido (a menos que o Windows vá corrigir um lugar vindo do
// IP, que pode estar a 10 km); depois confere o lugar, e se ele mudou, refaz o clima na hora.
async function refreshWeather($: EngineInterface) {
  try {
    weatherOff = isOff(await $.env.get('CLAWD_WEATHER').catch(() => undefined))
    if (weatherOff) {
      weatherNote = 'desligado por CLAWD_WEATHER'
      placeNote = weatherNote
      return
    }
    await loadPlace($)
    let drawn = false
    if (place && !(await windowsDue($))) drawn = await fetchWeather($)
    const moved = await refreshPlace($)
    if (!place) {
      weatherNote = 'sem lugar: não sei onde você está'
      return
    }
    if (moved || !drawn) await fetchWeather($)
  } catch (err) {
    weatherNote = `erro: ${String(err).slice(0, 200)}`
  }
}

// Pergunta o tempo ao Open-Meteo para o lugar de agora. Devolve true se chegou uma leitura boa.
async function fetchWeather($: EngineInterface): Promise<boolean> {
  try {
    if (!place) return false
    const res = await fetchTimed($, weatherUrl(place))
    if (!res) {
      weatherNote = 'sem resposta em 10 s'
      return false
    }
    if (!res.ok) {
      weatherNote = `HTTP ${res.status}: ${res.text.slice(0, 200)}`
      return false
    }
    const body = JSON.parse(res.text) as { current?: Record<string, unknown>; utc_offset_seconds?: unknown }
    if (typeof body.utc_offset_seconds === 'number') utcOffsetS = body.utc_offset_seconds
    const cur = body.current
    if (!cur) {
      weatherNote = `sem "current": ${res.text.slice(0, 200)}`
      return false
    }
    const code = Number(cur.weather_code)
    const temp = Number(cur.temperature_2m)
    if (!Number.isFinite(code) || !Number.isFinite(temp)) {
      weatherNote = `números estranhos: ${JSON.stringify(cur).slice(0, 200)}`
      return false
    }
    // precipitação = chuva + pancadas dos últimos 15 minutos
    const rain = isRaining(code, Number(cur.precipitation ?? 0))
    const next: Weather = { emoji: weatherEmoji(code, cur.is_day === 1), temp: Math.round(temp), rain, at: await $.clock.now() }
    const prev = await read($, weather)
    const same = prev && prev.emoji === next.emoji && prev.temp === next.temp && prev.rain === next.rain
    if (!same || next.at - prev.at > WEATHER_STALE_MS / 2) await update($, weather, () => next)
    weatherNote = `ok: código ${code}, ${temp}°, chuva ${rain}`
    return true
  } catch (err) {
    weatherNote = `erro: ${String(err).slice(0, 200)}`
    return false
  }
}

// ---------- os ajudantes ----------

// Os ajudantes rodando agora (id -> tipo) e os que acabaram de terminar, para a
// lista do motor não ressuscitar um que ela ainda chama de "running" por um instante.
const running = new Map<string, string>()
const ended = new Set<string>()
const HELPERS_SYNC_MS = 2000

// O que se sabe de cada ajudante, só em memória: o rótulo e o tipo (do agent.spawn ou da lista do
// motor), o número dele no workflow, a primeira ferramenta, e a fantasia e o tom já decididos. A
// ordem do Map é a ordem de chegada, que é a ordem na baia. Sai quando o ajudante sai.
type Mate = { label?: string; type?: string; index?: number; firstTool?: string; costume?: Costume; tone?: number; order: number; seenAt?: number }
const crew = new Map<string, Mate>()
let arrivals = 0
// Quem terminou bem e comemora na baia antes de sair: id -> quando a festa começou (null: ainda
// não apareceu; o tique que a grava marca o começo, para ela aparecer inteira).
const leaving = new Map<string, number | null>()
// As gravações da equipe acontecem só no tique de 1 s e no sync de 2 s (e no início): os eventos
// só marcam "sujo". Cada atom só é gravado quando a assinatura dele muda, no máximo ~1x/s. A
// exceção é 'running' no fim de um ajudante (ver turn.complete): o desenho não o lê.
let teamDirty = false
let teamSig: string | null = null
let runningSig: string | null = null
let crewSig: string | null = null
let teamWroteAt = -Infinity
let flushing = false
const TEAM_WRITE_MS = 900
const ORPHAN_MS = 60_000 // anotado pelo agent.spawn e nunca visto rodando: esquece

// O registro de um ajudante (criado na primeira vez, na ordem de chegada).
function meet(id: string): Mate {
  let m = crew.get(id)
  if (!m) crew.set(id, (m = { order: ++arrivals }))
  return m
}

// Esquece um ajudante que saiu (quem ainda comemora fica até a festa acabar).
function forget(id: string) {
  if (leaving.has(id)) return
  crew.delete(id)
  lastSeen.delete(id)
}

// A fantasia e o tom de um ajudante: a fantasia, uma vez decidida, nunca troca (ver settleCostume);
// o tom vem do número dele no workflow ou, sem número, da ordem de chegada.
function dress(m: Mate): { costume: Costume; tone: number } {
  m.costume = settleCostume(m.costume, { label: m.label, type: m.type, firstTool: m.firstTool })
  m.tone ??= (m.index ?? m.order) % 3
  return { costume: m.costume, tone: m.tone }
}

// ---------- a barra de progresso ----------

// Uma linha de texto na coluna da statusline (progresso.ts), nunca dentro da pista. As fontes, em
// ordem: um workflow (🧩), a lista de tarefas (📋) e o lote de ajudantes da ferramenta Agent (🤖).
// Tudo em memória: os ganchos só anotam (o agent.spawn nem usa o $), e o tique lê os arquivos,
// decide a fonte e grava o atom 'progress' só quando ele muda, no máximo ~1x/s.
const runs = new Map<string, Run>() // runId -> a execução
const agentRun = new Map<string, string>() // agentId -> runId
const tasks = new Map<string, TaskItem>() // a lista de tarefas do agente principal, por id
let taskSeq = 0 // a ordem em que as tarefas entram em andamento (o rótulo é a mais recente)
let tasksTouched = false
let tasksAt = -Infinity // o último evento de tarefa
let tasksDoneAt: number | null = null // quando a lista ficou toda feita
// O lote: quem começou desde que a baia estava vazia, e quem já terminou. Os de workflow e os
// teammates ficam de fora na hora de contar (a execução deles pode ser conhecida só depois).
const batch = { ids: new Set<string>(), done: new Set<string>(), fill: 0 }
const teammates = new Set<string>()
let lastCap = -1 // quantos minis a última faixa tinha lugar para mostrar (0: a pista não tem baia)
let progressNow: Progress | null = null // a última barra decidida (para o diagnóstico)
let progressSig: string | null = null
let runsSig: string | null = null
let progressWroteAt = -Infinity
let progressBusy = false
const PROGRESS_WRITE_MS = 900
// O encaixe que a última faixa desenhou (só para o diagnóstico).
let lastBand: Record<string, unknown> | null = null

function runOf(runId: string): Run {
  let run = runs.get(runId)
  if (!run) runs.set(runId, (run = newRun(runId)))
  return run
}

const slash = (v: unknown) => (typeof v === 'string' ? v.replace(/\\/g, '/') : '')
const textOf = (v: unknown) => (typeof v === 'string' ? v : '')

// O Workflow do agente principal rodou e lançou uma execução local: a barra começa. Uma retomada
// (resumeFromRunId) reaproveita o runId e continua a mesma barra. O remote_launched (e o
// remote_agent) não tem agentes locais: fica de fora.
function noteWorkflow(input: Record<string, unknown>, result: unknown, now: number) {
  const r = (result ?? {}) as Record<string, unknown>
  if (r.status !== 'async_launched' || r.taskType !== 'local_workflow') return
  const runId = textOf(r.runId)
  if (!runId) return
  const run = runOf(runId)
  run.launched++
  run.launchAt = now
  if (run.launched === 1 || run.startedAt < 0) run.startedAt = now
  run.taskId = textOf(r.taskId) || run.taskId
  run.name = textOf(r.workflowName).slice(0, 60) || run.name
  run.dir = slash(r.transcriptDir) || run.dir
  run.script = slash(r.scriptPath) || run.script
  // retomada (o mesmo runId de novo, ou um que a memória já esqueceu): a fase continua de onde
  // estava, o preenchimento dela recomeça com os agentes de agora, e o arquivo final que já existe
  // é o da execução anterior
  if (run.launched > 1 || textOf(input.resumeFromRunId)) relaunch(run)
  run.end = ''
  run.endAt = -1
  run.hidden = false
  run.overAt = -1
  run.tries = 0
  run.checkAt = now + END_CHECK_MS
  run.lastAt = now
  // as fases: o script veio no pedido? Senão o tique lê o scriptPath (uma vez)
  if (!run.known) {
    const phases = parsePhases(input.script)
    if (phases) setPhases(run, phases)
  }
}

// Um agente de workflow nasceu (agent.spawn). Sem $: só memória. A fase sai do rótulo se as fases
// já são conhecidas; senão (ou se não casar) o tique tenta de novo e, de reserva, lê o meta.json.
function noteRunAgent(runId: string, id: string, label: string) {
  const run = runOf(runId)
  agentRun.set(id, runId)
  if (!run.agents.has(id)) run.agents.set(id, { label, phase: phaseOfLabel(label, run.phases), done: false, ok: false, metaTried: false })
  run.touched = true
}

// O fim de um agente de workflow ('answer' = terminou bem). true: mudou alguma execução.
function endRunAgent(id: string, ok: boolean): boolean {
  const run = runs.get(agentRun.get(id) ?? '')
  const a = run?.agents.get(id)
  if (!run || !a || a.done) return false
  a.done = true
  a.ok = ok
  run.touched = true
  return true
}

// A lista de tarefas do motor é da conversa: um /clear (ou um /resume de outra) começa outra.
function forgetTasks() {
  tasks.clear()
  taskSeq = 0
  tasksTouched = false
  tasksAt = -Infinity
  tasksDoneAt = null
}

// A lista de tarefas do agente principal: TaskCreate e TaskUpdate (o activeForm e o status) e o
// TodoWrite, que troca a lista inteira. O TaskCreated e o TaskCompleted (ganchos clássicos)
// também anotam; as duas vias usam o mesmo id, então nada conta duas vezes.
function taskOf(id: string, subject: string): TaskItem {
  let t = tasks.get(id)
  if (!t) tasks.set(id, (t = { subject, status: 'pending', active: '', since: 0 }))
  else if (subject && !t.subject) t.subject = subject
  return t
}

function noteTasks(tool: string, input: Record<string, unknown>, result: unknown) {
  const r = (result ?? {}) as Record<string, unknown>
  if (tool === 'TaskCreate') {
    const task = (r.task ?? {}) as Record<string, unknown>
    const id = textOf(task.id)
    if (!id) return
    const t = taskOf(id, textOf(task.subject) || textOf(input.subject))
    if (textOf(input.activeForm)) t.active = textOf(input.activeForm)
  } else if (tool === 'TaskUpdate') {
    if (r.success === false) return
    const id = textOf(input.taskId) || textOf(r.taskId)
    const t = tasks.get(id)
    if (!t) return
    const to = textOf((r.statusChange as { to?: unknown } | undefined)?.to) || textOf(input.status)
    if (to === 'deleted') tasks.delete(id)
    else {
      if (textOf(input.activeForm)) t.active = textOf(input.activeForm)
      if (textOf(input.subject)) t.subject = textOf(input.subject)
      if (to === 'in_progress') {
        t.status = 'in_progress'
        t.since = ++taskSeq
      } else if (to === 'completed' || to === 'pending') t.status = to
    }
  } else if (tool === 'TodoWrite') {
    const list = Array.isArray(r.newTodos) ? r.newTodos : Array.isArray(input.todos) ? input.todos : null
    if (!list) return
    tasks.clear()
    list.forEach((raw: unknown, i: number) => {
      const o = (raw ?? {}) as Record<string, unknown>
      const status = o.status === 'completed' || o.status === 'in_progress' ? o.status : 'pending'
      tasks.set(`todo:${i}`, { subject: textOf(o.content), status, active: textOf(o.activeForm), since: status === 'in_progress' ? ++taskSeq : 0 })
    })
  } else return
  tasksTouched = true
}

// O mtime do arquivo final agora: -1 se ele não existe; null se não deu para saber (confere de novo).
async function mtimeOf($: EngineInterface, file: string): Promise<number | null> {
  const has = await $.fs.exists(file).catch(() => null)
  if (has === null) return null
  if (!has) return -1
  const st = await $.fs.stat(file).catch(() => null)
  return st ? st.mtimeMs : null
}

// O status do arquivo final da execução ('' enquanto ele não existe). Numa retomada o arquivo da
// execução anterior já está lá (o runId é o mesmo): só vale um com outro mtime que o anotado no
// começo do lançamento (comparar com o relógio falha quando o da máquina volta para trás). Existe
// mas não dá para ler (sendo gravado, ou grande demais): mais duas tentativas e decide pelos agentes.
async function finalStatus($: EngineInterface, run: Run): Promise<'' | 'ok' | 'fail'> {
  const file = finalFileOf(run)
  if (!file || run.seen === null || !(await $.fs.exists(file).catch(() => false))) return ''
  const st = await $.fs.stat(file).catch(() => null)
  // sem o mtime, só vale se não havia arquivo nenhum no começo do lançamento
  if (st ? st.mtimeMs === run.seen : run.seen >= 0) return ''
  const status = endStatus(await $.fs.read(file).catch(() => ''))
  if (status) return endOf(run, status)
  return ++run.tries >= 3 ? verdictOf(run) : ''
}

// Terminou: a barra enche (ou congela) e o Clawd reage pelo canal de reação, que vence o 'work'
// do turno que o aviso de fim abre.
async function endRun($: EngineInterface, run: Run, end: 'ok' | 'fail', now: number) {
  finishRun(run, end, now)
  await react($, end === 'ok' ? 'pass' : 'oops')
}

// As leituras de arquivo da barra, todas aqui no tique (nunca num gancho): as fases do script (uma
// leitura), a fase dos agentes cujo rótulo não casou (meta.json, no máximo META_READS por tique,
// sem varrer pasta) e o arquivo final (a cada END_CHECK_MS, ou logo depois do Stop).
async function readRuns($: EngineInterface, now: number) {
  let metaLeft = META_READS
  for (const run of runs.values()) {
    if (!run.launched || run.end) continue
    if (!run.known) setPhases(run, run.script ? parsePhases(await $.fs.read(run.script).catch(() => null)) : null)
    if (run.phases.length) {
      for (const [id, a] of run.agents) {
        if (a.phase >= 0) continue
        a.phase = phaseOfLabel(a.label, run.phases)
        if (a.phase >= 0 || a.metaTried || !run.dir || metaLeft <= 0) continue
        metaLeft--
        try {
          const meta = JSON.parse(await $.fs.read(`${run.dir}/agent-${id}.meta.json`)) as { workflowPhase?: unknown }
          a.phase = phaseOfTitle(meta.workflowPhase, run.phases)
          a.metaTried = true // leu: casando ou não, não lê de novo
        } catch {
          // o arquivo nasce até ~5 s depois do agente (ou está pela metade): tenta de novo no
          // próximo tique, até META_TRIES vezes; depois o agente fica sem fase
          a.metaTries = (a.metaTries ?? 0) + 1
          if (a.metaTries >= META_TRIES) a.metaTried = true
        }
      }
    }
    // numa retomada, o mtime do arquivo final da execução anterior, antes de qualquer conferência
    if (run.seen === null && run.dir) run.seen = await mtimeOf($, finalFileOf(run))
    if (now >= run.checkAt) {
      run.checkAt = now + END_CHECK_MS
      const end = run.dir ? await finalStatus($, run) : ''
      if (end) await endRun($, run, end, now)
      // a reserva do Stop: sem o arquivo, decide pelos agentes, mas só com todos eles terminados
      // (um agente ainda rodando prova que a execução não acabou) e ao menos um conhecido
      else if (run.overAt >= 0 && now - run.overAt >= OVER_WAIT_MS && settled(run)) {
        await endRun($, run, verdictOf(run), now)
      }
    }
  }
}

// Os ajudantes da ferramenta Agent no lote de agora (sem os de workflow nem os teammates).
const batchIds = () => [...batch.ids].filter(id => !agentRun.has(id) && !teammates.has(id))

// A barra de agora, pela ordem das fontes. Duas execuções ao mesmo tempo: a mais recente, com "+1";
// mas o ✅/❌ de uma passa à frente na vez dele (5 ou 8 s), para o fim de cada uma aparecer junto
// com a reação do Clawd.
function pickProgress(): Progress | null {
  const live = [...runs.values()].filter(r => r.launched > 0 && !r.hidden)
  if (live.length) {
    const ending = live.filter(r => r.end)
    const top = (ending.length ? ending : live).reduce((a, b) => (b.startedAt > a.startedAt ? b : a))
    return runProgress(top, live.filter(r => r !== top && !r.end).length)
  }
  if (tasks.size >= 2) return tasksProgress([...tasks.values()])
  const ids = batchIds()
  // o lote só aparece com 2 ou mais; com 1 só quando a pista não tem baia (o único sinal da equipe)
  if (ids.length >= 2 || (ids.length === 1 && lastCap === 0)) {
    return { k: 'agents', name: '', phases: [], at: 0, fill: batch.fill, done: ids.filter(id => batch.done.has(id)).length, all: 0, end: '', more: 0 }
  }
  return null
}

// Grava a cópia das execuções em andamento (o atom 'runs') só quando ela muda. A hora do último
// evento vai arredondada ao minuto: a cópia não é regravada a cada ferramenta. O desenho não lê
// 'runs': gravar aqui não pisca a faixa.
async function flushRuns($: EngineInterface) {
  const keep = [...runs.values()].filter(r => r.launched > 0 && !r.end).map(r => ({ ...saveRun(r), lastAt: Math.floor(r.lastAt / 60_000) * 60_000 }))
  const keepSig = JSON.stringify(keep)
  if (keepSig === runsSig) return
  runsSig = keepSig
  await update($, savedRuns, () => keep)
}

// Grava a barra (e a cópia das execuções) só quando a assinatura muda, e não mais que ~1x/s.
async function flushProgress($: EngineInterface, now: number) {
  const next = pickProgress()
  progressNow = next
  const sig = JSON.stringify(next)
  if (sig !== progressSig && now - progressWroteAt >= PROGRESS_WRITE_MS) {
    progressSig = sig
    progressWroteAt = now
    await update($, progress, () => next)
  }
  await flushRuns($)
}

// O tique da barra: lê o que falta, refaz as contas (nunca recuando), tira o que expirou e grava.
// Um de cada vez: as leituras de arquivo podem passar de 1 s.
async function stepProgress($: EngineInterface, now: number) {
  if (progressBusy) return
  progressBusy = true
  try {
    await readRuns($, now)
    for (const [runId, run] of runs) {
      if (run.touched) {
        run.touched = false
        run.lastAt = now
        if (run.startedAt < 0) run.startedAt = now
      }
      advance(run)
      if (run.end && !run.hidden && now - run.endAt >= (run.end === 'ok' ? OK_MS : FAIL_MS)) run.hidden = true
      // 30 min sem nenhum evento: some em silêncio (a terminada fica esse tempo para uma retomada)
      if (now - (run.end ? run.endAt : run.lastAt) >= QUIET_MS) {
        runs.delete(runId)
        for (const id of run.agents.keys()) agentRun.delete(id)
      }
    }
    // a lista de tarefas: some 5 s depois de toda feita, ou depois de 30 min sem evento de tarefa
    if (tasksTouched) {
      tasksTouched = false
      tasksAt = now
    }
    const open = [...tasks.values()].some(t => t.status !== 'completed')
    if (!tasks.size || open) tasksDoneAt = null
    else if (tasksDoneAt === null) tasksDoneAt = now
    if ((tasksDoneAt !== null && now - tasksDoneAt >= TASKS_DONE_MS) || now - tasksAt >= QUIET_MS) {
      tasks.clear()
      tasksDoneAt = null
    }
    // o lote vai da baia vazia até a baia esvaziar de novo
    if (running.size === 0 && leaving.size === 0) {
      batch.ids.clear()
      batch.done.clear()
      batch.fill = 0
    } else {
      const ids = batchIds()
      batch.fill = batchFill(batch.fill, ids.length, ids.filter(id => batch.done.has(id)).length)
    }
    await flushProgress($, now)
  } finally {
    progressBusy = false
  }
}

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
let reactionUntilAt = -1
let reactionNow: '' | 'pass' | 'oops' = ''
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

// Grava a baia (atom 'team'), os ajudantes rodando ('running') e as fantasias deles ('crew'), cada
// um só quando a assinatura muda. Quem comemorou o bastante sai aqui. `force`: o início da conversa,
// que grava na hora (um recarregamento não deixa a baia velha à mostra).
async function flushTeam($: EngineInterface, force = false) {
  if (flushing && !force) return // o tique e o sync no mesmo instante: um grava, o outro fica para o próximo
  const mine = !flushing
  flushing = true
  try {
    const now = await $.clock.now()
    if (!force && !teamDirty && leaving.size === 0) return
    if (!force && now - teamWroteAt < TEAM_WRITE_MS) return // gravou há pouco: o próximo tique grava
    await writeTeam($, now)
  } finally {
    if (mine) flushing = false
  }
}

async function writeTeam($: EngineInterface, now: number) {
  teamDirty = false
  for (const [id, at] of leaving) {
    if (at === null) leaving.set(id, now) // a festa começa agora, quando ela aparece
    else if (now - at >= PARTY_MS) {
      leaving.delete(id)
      forget(id)
    }
  }
  for (const id of running.keys()) meet(id)
  const mates: TeamMate[] = []
  for (const [id, m] of crew) {
    const doneAt = leaving.get(id) ?? undefined
    if (!running.has(id) && doneAt === undefined) continue
    const look = dress(m)
    mates.push(doneAt === undefined ? { id, ...look } : { id, ...look, doneAt })
  }
  let wrote = false
  const sig = JSON.stringify(mates)
  if (sig !== teamSig) {
    teamSig = sig
    wrote = true
    await update($, team, () => mates)
  }
  const keep = Object.fromEntries(running)
  const keepSig = JSON.stringify(keep)
  if (keepSig !== runningSig) {
    runningSig = keepSig
    wrote = true
    await update($, savedRunning, () => keep)
  }
  const worn: Crew = {}
  for (const m of mates) if (running.has(m.id)) worn[m.id] = { costume: m.costume, tone: m.tone }
  const wornSig = JSON.stringify(worn)
  if (wornSig !== crewSig) {
    crewSig = wornSig
    wrote = true
    await update($, savedCrew, () => worn)
  }
  if (wrote) teamWroteAt = now
  // o ultracode continua aceso enquanto houver ajudantes de um turno ultracode
  if (running.size === 0) ultraGrace = false
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
        forget(id)
        teamDirty = true
      }
    }
    for (const a of await $.agent.list()) {
      if (a.type === 'teammate' || a.teammateId) continue // teammate com papel tem o papel no type
      const live = a.status === 'running' || a.status === 'pending'
      if (live && !ended.has(a.id)) {
        if (!running.has(a.id)) teamDirty = true
        running.set(a.id, a.type)
        if (!lastSeen.has(a.id)) lastSeen.set(a.id, now)
        // quem não passou pelo agent.spawn (um recarregamento, um skill em fork): o rótulo vem daqui
        const m = meet(a.id)
        m.type ??= a.type
        if (m.label === undefined && a.description) {
          m.label = a.description
          teamDirty = true
        }
      }
      if (!live) {
        if (running.delete(a.id)) teamDirty = true
        ended.delete(a.id)
        forget(a.id)
      }
    }
    // anotados pelo agent.spawn e nunca vistos rodando (ou que sumiram sem aviso): esquece
    for (const [id, m] of crew) {
      if (running.has(id) || leaving.has(id)) continue
      m.seenAt ??= now
      if (now - m.seenAt > ORPHAN_MS) crew.delete(id)
    }
  } catch {
    // sem a lista, ficam só os eventos
  }
  await flushTeam($)
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

// Uma reação rápida: 'pass' (a garra sobe com o ✓) ou 'oops' (o susto). Vem de um teste que rodou
// no agente principal e do fim de um workflow (ou de quem mais precisar). Vence o 'work' na escolha
// da cena (ui.render), o que importa no fim do workflow: o aviso dele abre um turno novo. Só grava
// se mudou.
async function react($: EngineInterface, next: 'pass' | 'oops') {
  reactionUntilAt = (await $.clock.now()) + (next === 'pass' ? PASS_S : OOPS_S) * 1000
  if (reactionNow === next) return
  reactionNow = next
  await update($, reaction, () => next)
}

async function clearReaction($: EngineInterface) {
  reactionUntilAt = -1
  if (reactionNow === '') return
  reactionNow = ''
  await update($, reaction, () => '' as const)
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
  if (reactionUntilAt >= 0 && now >= reactionUntilAt) await clearReaction($)
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
  // a baia dos ajudantes: quem chegou, quem saiu, quem comemora
  await flushTeam($)
  // a barra de progresso: as leituras de arquivo, as contas e a gravação, no máximo ~1x/s
  await stepProgress($, now)
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
    crew.clear()
    leaving.clear()
    arrivals = 0
    try {
      const startedAt = await $.clock.now()
      // a fantasia e o tom de cada um voltam junto (um 'crew' estragado vale como vazio)
      const worn = crewOf(await read($, savedCrew))
      for (const [id, type] of Object.entries(await read($, savedRunning))) {
        running.set(id, type)
        lastSeen.set(id, startedAt)
        const m = meet(id)
        m.type = type
        const w = worn[id]
        if (w?.costume) m.costume = w.costume
        if (w) m.tone = w.tone
      }
    } catch {
      // sem ajudantes guardados
    }
    teamSig = runningSig = crewSig = null
    wantActivity = ''
    await update($, mood, () => 'idle' as ClawdMood)
    await update($, activity, () => '' as Activity) // um recarregamento não deixa acessório velho
    await update($, fireworks, () => false)
    reactionUntilAt = -1
    reactionNow = ''
    await update($, reaction, () => '' as const)
    await update($, compacting, () => false)
    askedAt = -1
    askTool = ''
    lastRequestAt = -Infinity
    await update($, asking, () => false)
    // a aura herda o estado de antes do recarregamento; o próximo fim de turno (classic.Stop)
    // confirma pelo que está mesmo rodando em segundo plano
    ultraOn = await read($, ultra)
    ultraWorkflow = ultraOn
    await flushTeam($, true)
    // a barra: as execuções em andamento voltam do atom 'runs' (um guardado estragado vale como
    // nenhum); a lista de tarefas e o lote recomeçam (o lote, com quem ainda roda)
    runs.clear()
    agentRun.clear()
    forgetTasks()
    batch.ids.clear()
    batch.done.clear()
    batch.fill = 0
    teammates.clear()
    progressSig = runsSig = null
    progressWroteAt = -Infinity
    progressBusy = false
    lastBand = null
    // o que já está guardado é o ponto de partida: o tique só grava o que sair diferente (um
    // recarregamento sem nada mudado não grava nada; uma barra velha sai no 1º tique)
    try {
      const saved = await read($, savedRuns)
      runsSig = JSON.stringify(saved) ?? null
      for (const run of loadRuns(saved)) {
        runs.set(run.runId, run)
        for (const id of run.agents.keys()) agentRun.set(id, run.runId)
      }
    } catch {
      // sem execução guardada
    }
    try {
      const shown = await read($, progress)
      progressSig = JSON.stringify(shown) ?? null
      progressNow = progressOf(shown)
    } catch {
      // sem barra guardada
    }
    for (const id of running.keys()) if (!agentRun.has(id)) batch.ids.add(id)
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
      // o session.start não tem agentId: é sempre o agente principal
      await touchSession($)
      await pruneSessions($)
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
      equipe: [...crew]
        .filter(([id]) => running.has(id) || leaving.has(id))
        .map(([id, m]) => ({ id, fantasia: dress(m).costume, tom: dress(m).tone, rotulo: m.label ?? null, ...(leaving.has(id) ? { festa: true } : {}) })),
      linhas: await read($, lines),
      fogos: await read($, fireworks),
      teste: reactionNow || null,
      ultracode: await read($, ultra),
      sequencia_min: streakStartAt >= 0 ? Math.round((now - streakStartAt) / 60_000) : null,
      ultracode_motivos: { turno: ultraTurn, conversa: ultraSession, workflow: ultraWorkflow, sobra: ultraGrace, configuracao: standingSeen },
      faixa_lendo: bandPollersOn,
      progresso: {
        barra: progressNow,
        encaixe: lastBand,
        execucoes: [...runs.values()].map(r => ({
          id: r.runId,
          nome: r.name,
          fases: r.phases,
          fase: r.at,
          cheio: Math.round(r.fill * 100) / 100,
          agentes: r.agents.size,
          terminados: r.done,
          fim: r.end || null,
          lancada: r.launched > 0,
        })),
        tarefas: { total: tasks.size, feitas: [...tasks.values()].filter(t => t.status === 'completed').length },
        lote: { iniciados: batchIds().length, terminados: batchIds().filter(id => batch.done.has(id)).length },
      },
      statusline: (await read($, status)).map(l => l.map(s => s.t).join('')),
    }
    return { result: JSON.stringify(report, null, 1) }
  })

  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    if (!e.agentId) {
      markActivity(startedAt)
      wantActivity = activityFor(e.tool)
    } else {
      lastSeen.set(e.agentId, startedAt)
      // uma ferramenta de um agente de workflow é um sinal de vida da execução (o corte de 30 min)
      const run = runs.get(agentRun.get(e.agentId) ?? '')
      if (run) run.touched = true
      // a primeira ferramenta de um ajudante é pista da fantasia (se o rótulo não disse nada); o
      // ToolSearch só carrega ferramentas e não diz a tarefa: vale a que vem depois dele
      const m = running.has(e.agentId) ? meet(e.agentId) : crew.get(e.agentId)
      if (m && m.firstTool === undefined && e.tool !== 'ToolSearch') {
        m.firstTool = e.tool
        teamDirty = true
      }
    }
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
        // a barra de progresso começa (só a execução local; o tique lê o resto)
        noteWorkflow(e as unknown as Record<string, unknown>, ran.result, startedAt)
      }
      // a lista de tarefas do agente principal
      if (!e.agentId && ran.deny === undefined && !ran.isError && (e.tool === 'TaskCreate' || e.tool === 'TaskUpdate' || e.tool === 'TodoWrite')) {
        noteTasks(e.tool, e as unknown as Record<string, unknown>, ran.result)
      }
      if (e.tool === 'Edit' || e.tool === 'Write') {
        const delta = changedLines(e.tool, ran)
        if (delta) await addLines($, delta)
      }
      if ((e.tool === 'Bash' || e.tool === 'PowerShell') && gitHappened((e as unknown as { command?: unknown }).command, ran)) {
        await celebrate($)
      }
      if (!e.agentId && (e.tool === 'Bash' || e.tool === 'PowerShell')) {
        const verdict = testVerdict((e as unknown as { command?: unknown }).command, ran)
        if (verdict) await react($, verdict === 'pass' ? 'pass' : 'oops')
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
      // o fim de um ajudante: o motor avisa uma vez por execução, terminada, cancelada ou com erro.
      // Terminou bem: comemora um instante na baia e só então sai. Senão, sai na hora, sem festa.
      // Aqui só se marca e o tique grava a baia; só a cópia de quem roda é gravada aqui mesmo.
      const id = e.agentId
      const wasHere = running.delete(id)
      ended.add(id)
      // a barra: o agente terminou (bem só com 'answer'); o tique refaz as contas. A cópia das
      // execuções é gravada já, como a de quem roda abaixo: um recarregamento antes do tique
      // perderia esse fim (o turn.complete não se repete). O desenho não lê 'runs': não pisca.
      if (endRunAgent(id, e.reason === 'answer')) await flushRuns($).catch(() => undefined)
      if (batch.ids.has(id)) batch.done.add(id)
      if (running.size === 0) ultraGrace = false // o último do turno ultracode: a sobra acaba agora
      if (wasHere && e.reason === 'answer' && bandPollersOn) leaving.set(id, null)
      else forget(id)
      teamDirty = true
      // a cópia de quem roda é gravada já (um recarregamento antes do tique ressuscitaria quem
      // acabou, e um de workflow só sairia em 15 min). O desenho não lê 'running': não pisca.
      const keep = Object.fromEntries(running)
      const keepSig = JSON.stringify(keep)
      if (wasHere && keepSig !== runningSig) {
        runningSig = keepSig
        await update($, savedRunning, () => keep).catch(() => undefined)
      }
      return next(e)
    }
    working = false
    await clearReaction($).catch(() => undefined) // o fim do turno tem a sua própria reação
    await stopAsking($).catch(() => undefined)
    markActivity(await $.clock.now())
    if (ultraTurn && running.size > 0) ultraGrace = true // só se ficou ajudante trabalhando
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
  // O motor espera este gancho antes do ajudante começar, então ele é curto de propósito: só
  // marca "sujo", e o tique grava (seis começando no mesmo segundo viram uma gravação só).
  on('classic.SubagentStart', async ($, e, next) => {
    ended.delete(e.agent_id)
    leaving.delete(e.agent_id)
    running.set(e.agent_id, e.agent_type)
    lastSeen.set(e.agent_id, await $.clock.now())
    meet(e.agent_id).type ??= e.agent_type
    teamDirty = true
    batch.ids.add(e.agent_id) // o lote da barra (os de workflow saem da conta no tique)
    return next(e)
  })

  // O rótulo, o tipo e o número de cada ajudante, para a fantasia. SÓ OLHA: deixa o ajudante
  // nascer, anota em memória e devolve a resposta intocada. Nenhum $ e nenhuma gravação aqui.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    try {
      if (r.agentId && !e.isTeammate) {
        const m = meet(r.agentId)
        m.label = e.description
        m.type = e.subagentType
        if (e.workflow) m.index = e.workflow.agentIndex
        teamDirty = true
        // a barra: o agente entra na execução dele (a fase sai do rótulo; o meta.json, só no tique)
        if (e.workflow?.runId) noteRunAgent(e.workflow.runId, r.agentId, e.description)
      }
      if (r.agentId && e.isTeammate) teammates.add(r.agentId)
    } catch {
      // a fantasia é enfeite: nunca atrapalha o ajudante
    }
    return r
  }).catch(($, e, next) => next(e))

  // A lista de tarefas, pelos ganchos clássicos (só do agente principal). Os dois SÓ OLHAM: anotam
  // em memória e devolvem a resposta intocada (os dois podem ser bloqueados; quem decide é outro).
  on('classic.TaskCreated', async ($, e, next) => {
    const r = await next(e)
    try {
      // só conta se ninguém abaixo bloqueou a criação (aí o motor apaga a tarefa e a ferramenta falha)
      if (!e.agent_id && e.task_id && !r.block) {
        taskOf(e.task_id, e.task_subject ?? '')
        tasksTouched = true
      }
    } catch {
      // a barra é enfeite
    }
    return r
  })

  on('classic.TaskCompleted', async ($, e, next) => {
    const r = await next(e)
    try {
      // só conta como feita se ninguém abaixo bloqueou a conclusão
      if (!e.agent_id && e.task_id && !r.block) {
        taskOf(e.task_id, e.task_subject ?? '').status = 'completed'
        tasksTouched = true
      }
    } catch {
      // idem
    }
    return r
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
      forgetTasks() // a lista de tarefas do motor recomeça (do "1"); o tique tira a velha da faixa
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
        forgetTasks() // a lista de tarefas é a da outra conversa
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
      const bg = e.background_tasks ?? []
      ultraWorkflow = bg.some(t => t.type === 'workflow')
      await setUltra($, ultraWanted())
      // a barra: uma execução que sumiu da lista acabou; o tique confere o arquivo final já e, se
      // ele não vier, decide pelos agentes
      const now = await $.clock.now()
      for (const run of runs.values()) {
        if (!run.launched || run.end) continue
        const alive = bg.some(t => t.type === 'workflow' && ((!!run.taskId && t.id === run.taskId) || (!!t.name && t.name === run.name)))
        if (alive) run.overAt = -1
        else if (run.overAt < 0) {
          run.overAt = now
          run.checkAt = 0
        }
      }
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
    const reacting = await read($, reaction)
    const kind: SceneKind = calling ? 'ask' : squeezing ? 'compact' : reacting ? reacting : e.props.isWorking ? 'work' : stored

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
    const mates = teamOf(await read($, team))
    const boom = await read($, fireworks)
    const isUltra = await read($, ultra)
    const prog = progressOf(await read($, progress)) // um valor velho ou estragado vira "sem barra"
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
    const travel = laneEst - PAD - (BOX_W + helpersZone(mates.length, cap)) * CELL
    const parked = travel < PARK_PX
    const height = sideBySide ? Math.max(LANE_MIN_H, Math.round(rows.length * LINE_PX)) : LANE_MIN_H
    // A barra de progresso entra DEPOIS das medidas acima: nenhuma delas muda com ela. Cabendo mais
    // uma linha sem a faixa crescer (a statusline larga, de 2 linhas), ela é a 1ª linha (a coluna
    // encosta embaixo, as linhas de hoje não se mexem); senão, um segmento no fim de uma linha que
    // já existe. O que não cabe na largura de hoje fica de fora; na faixa empilhada a coluna tem a
    // largura da faixa (e corta cada linha ali), então o segmento nunca passa dela.
    const ownLine = sideBySide && rows.length > 0 && (rows.length + 1) * LINE_PX <= LANE_MIN_H
    const placed: Placed = placeBar(rows, prog, ownLine, sideBySide ? Infinity : e.props.bodyColumns)
    lastCap = cap
    lastBand = { onde: placed.where || null, formato: placed.format || null, colunas_texto: textCols, lado_a_lado: sideBySide, altura: height, pista_px: Math.round(laneEst), baia: cap }

    // a pista nunca passa de LANE_W: com isso o SVG fica sempre abaixo do limite do app
    const sceneTravel = Math.min(Math.max(80, travel), LANE_W - PAD - BOX_W * CELL)
    const sc = sceneFor(kind, now, sceneTravel, parked)
    // quanto ele anda, em px: pela largura medida da pista (se já houver) e com 10% de folga, para
    // ele nunca passar da beira esquerda mesmo se a coluna for mais estreita que CH_PX
    const laneW = laneCols > 0 ? laneCols * CH_PX : laneEst
    const reach = Math.max(0, 0.9 * (laneW - PAD - (BOX_W + 1 + helpersZone(mates.length, cap)) * CELL))
    lastLane = { travel: sceneTravel, parked, reach } // o tapinha continua a cena a partir daqui
    const zone = helpersZone(mates.length, cap)
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
    // o app recusa SVG acima de 131072 caracteres: nos casos extremos, sem fogos (e, se preciso, sem fantasias)
    const laneArt = fitLane(sc.spec, elapsed, flags, height, { team: mates, cap, fireworks: boomAgo, shift, reach }, now / 1000)

    const { Box, Text, Svg, Client } = $.ui.resolve(e)
    const text = rows.length
      ? [
          <Box flexDirection="column" flexShrink={0}>
            {placed.rows.map(spans => (
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
