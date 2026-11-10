// A barra de progresso da faixa: uma linha de TEXTO na coluna da statusline, nunca dentro da
// pista SVG. Conta pura, sem `$`: o modelo de uma execução de workflow que nunca recua, a leitura
// de meta.phases do script, o que cada fonte mostra (workflow, lista de tarefas, lote de
// ajudantes), a escada de formatos (G, M, S, XS) e o encaixe nas linhas da statusline. Os ganchos
// e as leituras de arquivo ficam no register.tsx. Não importa nenhum outro módulo (sem ciclo).
//
// A regra de ouro: a barra NUNCA muda a altura da faixa nem a largura da coluna de texto. O
// orçamento de largura sai da statusline como ela já é, antes da barra; o formato que não cabe
// dá lugar ao menor, e abaixo de BAR_MIN colunas a barra nem aparece.
import type { Progress, SavedRun, SavedRunAgent, StatusSpan } from '../types'

// ---------- as medidas ----------

export const BAR_MIN = 6 // menos colunas que isso: não mostra nada
export const BAR_RESERVE = 1 // uma coluna de folga (a conta de largura do emoji é estimada)
export const BAR_GAP = 2 // o respiro entre o fim da linha e o segmento da barra
export const CAP = 0.9 // a fase atual para em 90% até acabar de verdade (a barra nunca volta)
export const OK_MS = 5_000 // ✅ fica 5 s e some
export const FAIL_MS = 8_000 // ❌ fica 8 s e some
export const QUIET_MS = 30 * 60_000 // 30 min sem nenhum evento: some em silêncio
export const TASKS_DONE_MS = 5_000 // a lista toda feita: some 5 s depois
export const END_CHECK_MS = 5_000 // o arquivo final do workflow é conferido a cada 5 s
export const OVER_WAIT_MS = 10_000 // o Stop disse que acabou e o arquivo não veio: decide pelos agentes
export const META_READS = 6 // no máximo 6 leituras de meta.json por tique
export const META_TRIES = 10 // o meta.json nasce até ~5 s depois do agente: 10 tentativas, uma por tique

const ORANGE = '#D87656' // o laranja do Clawd
const VIOLET = '#a78bfa' // o violeta do ultracode
const EMPTY = '#3c3c3c' // o DARK_GRAY da statusline: o bloco vazio
const GREEN = '#00c850' // rgb(0, 200, 80): o verde da statusline
const ICON = { wf: '🧩', tasks: '📋', agents: '🤖' } as const

// ---------- largura em colunas de tela ----------

// Quantas colunas de tela um texto ocupa: emoji conta `emoji` colunas (2 por padrão; o textCols do
// register conta 1 por letra, por isso esta conta é à parte); o seletor de variação e o
// "junta-emoji" não ocupam nada.
const ZERO = /[‍︎️̀-ͯ]/u
const WIDE = /\p{Extended_Pictographic}/u
export function cols(text: string, emoji = 2): number {
  let n = 0
  for (const ch of text) n += ZERO.test(ch) ? 0 : WIDE.test(ch) ? emoji : 1
  return n
}
export const lineCols = (line: readonly StatusSpan[], emoji = 2) => cols(line.map(s => s.t).join(''), emoji)

// ---------- nomes: sem acento, minúsculo ----------

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Um texto que vem de fora (o script, o rótulo, a tarefa) vira uma linha só e curta.
const clean = (s: string, max: number) => s.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

// ---------- meta.phases do script ----------

// O motor exige que o script comece com `export const meta = { name, description, phases }`, um
// literal puro. Aqui ele é percorrido como texto (strings, comentários e chaves aninhadas), sem
// rodar nada. Aceita { title: '...' } e o texto solto ('...'). null: sem meta.phases legível.
const QUOTES = `'"\``

function skipString(s: string, i: number): number {
  const q = s[i]
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++
    else if (s[j] === q) return j + 1
  }
  return s.length
}

// Pula espaços e comentários a partir de i.
function skipSpace(s: string, i: number): number {
  for (;;) {
    while (i < s.length && /\s/.test(s[i] ?? '')) i++
    if (s.startsWith('//', i)) {
      const nl = s.indexOf('\n', i)
      i = nl < 0 ? s.length : nl + 1
    } else if (s.startsWith('/*', i)) {
      const end = s.indexOf('*/', i + 2)
      i = end < 0 ? s.length : end + 2
    } else return i
  }
}

// Os membros de primeiro nível do objeto ou lista que abre em `open` ({ ou [): [início, fim) de
// cada um. null: não fecha (script cortado).
function members(s: string, open: number): Array<[number, number]> | null {
  const out: Array<[number, number]> = []
  let depth = 0
  let start = open + 1
  for (let i = open; i < s.length; i++) {
    const c = s[i] ?? ''
    if (QUOTES.includes(c)) {
      i = skipString(s, i) - 1
      continue
    }
    if (c === '/' && (s[i + 1] === '/' || s[i + 1] === '*')) {
      i = skipSpace(s, i) - 1
      continue
    }
    if (c === '[' || c === '{' || c === '(') depth++
    else if (c === ']' || c === '}' || c === ')') {
      depth--
      if (depth === 0) {
        if (s.slice(start, i).trim()) out.push([start, i])
        return out
      }
    } else if (c === ',' && depth === 1) {
      out.push([start, i])
      start = i + 1
    }
  }
  return null
}

// O texto de uma string literal que começa em i (null se não é uma, ou se é um template com conta).
function stringAt(s: string, i: number): string | null {
  const q = s[i] ?? ''
  if (!QUOTES.includes(q)) return null
  const raw = s.slice(i + 1, skipString(s, i) - 1)
  if (q === '`' && raw.includes('${')) return null
  return raw.replace(/\\(.)/g, (_, c: string) => (c === 'n' || c === 't' ? ' ' : c))
}

// Onde começa o valor da chave `key` no objeto que abre em `open` (-1: não tem).
function valueOf(s: string, open: number, key: string): number {
  for (const [a, b] of members(s, open) ?? []) {
    const i = skipSpace(s, a)
    const m = /^(?:(['"])([\w$]+)\1|([\w$]+))\s*:/.exec(s.slice(i, b))
    if (m && (m[2] ?? m[3]) === key) return skipSpace(s, i + m[0].length)
  }
  return -1
}

export function parsePhases(script: unknown): string[] | null {
  if (typeof script !== 'string') return null
  const meta = /export\s+const\s+meta\s*=\s*\{/.exec(script)
  if (!meta) return null
  const open = meta.index + meta[0].length - 1
  const at = valueOf(script, open, 'phases')
  if (at < 0 || script[at] !== '[') return null
  const list = members(script, at)
  if (!list) return null
  const out: string[] = []
  for (const [a] of list) {
    const i = skipSpace(script, a)
    let title: string | null = null
    if (script[i] === '{') {
      const t = valueOf(script, i, 'title')
      title = t < 0 ? null : stringAt(script, t)
    } else title = stringAt(script, i)
    if (title === null) return null // uma fase sem título legível: melhor sem fases que fases tortas
    out.push(clean(title, 40))
  }
  return out
}

// ---------- a fase de um agente ----------

// Pelo título (o workflowPhase do meta.json): igual, sem acento e sem caixa.
export function phaseOfTitle(title: unknown, phases: readonly string[]): number {
  if (typeof title !== 'string' || !title.trim()) return -1
  return phases.map(norm).indexOf(norm(title))
}

// Pelo rótulo: o texto antes de ':' ou a 1ª palavra ('mapear: faixa' -> Mapear, 'corrigir e
// testar' -> Corrigir). Primeiro o título inteiro; depois a 1ª palavra do título ('Revisão final').
export function phaseOfLabel(label: string | undefined, phases: readonly string[]): number {
  if (!label || !phases.length) return -1
  const n = norm(label)
  const colon = n.indexOf(':')
  const tries = [colon > 0 ? n.slice(0, colon).trim() : '', n.split(/[\s:,.;-]+/)[0] ?? ''].filter(Boolean)
  const keys = phases.map(norm)
  for (const t of tries) {
    const i = keys.indexOf(t)
    if (i >= 0) return i
  }
  for (const t of tries) {
    const i = keys.findIndex(k => k.split(' ')[0] === t)
    if (i >= 0) return i
  }
  return -1
}

// ---------- uma execução de workflow ----------

// metaTried: o meta.json já foi lido (ou desistiu dele); metaTries: as leituras que falharam.
export type RunAgent = SavedRunAgent & { metaTried: boolean; metaTries?: number }

export type Run = {
  runId: string
  taskId: string
  name: string
  phases: string[]
  known: boolean // as fases já foram procuradas (no script do pedido ou no arquivo dele)
  dir: string // transcriptDir, com '/'
  script: string // scriptPath, com '/'
  launched: number // quantas vezes o resultado do Workflow chegou (0: só agentes vistos; 2+: retomada)
  launchAt: number
  // o mtime do arquivo final quando este lançamento começou (-1: não existia; null: ainda não
  // conferido). Só vale um arquivo final com outro mtime: o relógio da máquina pode voltar para trás
  seen: number | null
  agents: Map<string, RunAgent>
  at: number
  fill: number
  fills: number[] // quanto de cada fase está cheio; cada uma só sobe
  done: number
  end: '' | 'ok' | 'fail'
  endAt: number
  hidden: boolean // o ✅/❌ já saiu da faixa (a execução fica na memória para uma retomada)
  startedAt: number
  lastAt: number
  touched: boolean // um evento chegou: o próximo tique marca a hora (os ganchos não leem o relógio)
  overAt: number // o Stop do agente principal disse que acabou (-1: não)
  checkAt: number // a próxima conferência do arquivo final
  tries: number // leituras do arquivo final que não deram um status
}

export function newRun(runId: string): Run {
  return {
    runId,
    taskId: '',
    name: '',
    phases: [],
    known: false,
    dir: '',
    script: '',
    launched: 0,
    launchAt: -1,
    seen: -1,
    agents: new Map(),
    at: 0,
    fill: 0,
    fills: [],
    done: 0,
    end: '',
    endAt: -1,
    hidden: false,
    startedAt: -1,
    lastAt: -1,
    touched: true,
    overAt: -1,
    checkAt: 0,
    tries: 0,
  }
}

// As fases ficaram conhecidas. A barra troca de contínua para por fases uma vez só, no começo.
export function setPhases(run: Run, phases: string[] | null) {
  run.known = true
  if (!phases || !phases.length || run.phases.length) return
  run.phases = phases
  run.fill = 0
  run.fills = phases.map(() => 0)
  run.at = 0
}

// Quanto de um grupo de agentes está pronto: só conta quem terminou BEM (um abortado ou com erro
// não fez o trabalho), e o total leva +1 de folga por quem ainda pode vir (o total de verdade não
// se sabe): uma fase de um agente por vez enche aos poucos, em vez de bater no teto com o 1º.
const readyOf = (list: readonly RunAgent[]) => Math.min(CAP, list.filter(a => a.done && a.ok).length / (list.length + 1))

// Recalcula a fase atual e o preenchimento de cada fase, sem nunca recuar. A fase atual (o nome
// mostrado) é a mais adiantada entre os agentes que já começaram. Cada fase enche pelos agentes
// dela (readyOf), com piso no valor anterior e teto de 90%; uma fase anterior à atual só enche de
// vez quando nenhum agente dela roda mais. Isso importa nos workflows em esteira (pipeline), em que
// as fases rodam sobrepostas: a 2ª começa enquanto a 1ª ainda trabalha, e a 1ª não pode parecer
// pronta. Numa retomada só contam os agentes do lançamento de agora (os de antes ficam `old`).
export function advance(run: Run) {
  const list = [...run.agents.values()]
  run.done = Math.max(run.done, list.filter(a => a.done && a.ok).length)
  const P = run.phases.length
  if (run.end === 'ok') {
    run.fill = 1
    run.fills = run.phases.map(() => 1)
    return
  }
  if (run.end) return // falhou: a barra fica congelada onde estava
  const cur = list.filter(a => !a.old)
  if (!P) {
    if (cur.length) run.fill = Math.max(run.fill, readyOf(cur))
    return
  }
  let top = run.at
  for (const a of list) if (a.phase > top && a.phase < P) top = a.phase
  run.at = top
  run.fills = run.phases.map((_, i) => {
    const prev = run.fills[i] ?? 0
    const here = cur.filter(a => a.phase === i)
    if (i < run.at && !here.some(a => !a.done)) return 1 // ficou para trás e ninguém dela roda mais
    return here.length ? Math.max(prev, readyOf(here)) : prev
  })
  run.fill = run.fills[run.at] ?? 0
}

// O mesmo runId foi lançado de novo (retomada): a fase continua onde estava, mas o preenchimento
// dela recomeça e só conta quem nasce agora (os de antes já tinham terminado). O arquivo final
// que já existe é o da execução anterior: o tique anota o mtime dele antes de conferir.
export function relaunch(run: Run) {
  for (const a of run.agents.values()) if (a.done) a.old = true
  run.fill = 0
  run.fills = run.fills.map((f, i) => (i < run.at ? f : 0))
  run.seen = null
}

// Terminou: 'ok' enche tudo; 'fail' congela.
export function finishRun(run: Run, end: 'ok' | 'fail', now: number) {
  run.end = end
  run.endAt = now
  run.overAt = -1
  if (end === 'ok') {
    run.fill = 1
    run.fills = run.phases.map(() => 1)
  }
}

// Os agentes do lançamento de agora.
const nowAgents = (run: Run) => [...run.agents.values()].filter(a => !a.old)

// Sem o arquivo final para dizer: terminou bem se todo agente deste lançamento terminou bem. Sem
// nenhum agente conhecido não há prova de nada: 'fail'.
export function verdictOf(run: Run): 'ok' | 'fail' {
  const list = nowAgents(run)
  return list.length && list.every(a => a.done && a.ok) ? 'ok' : 'fail'
}

// A reserva do Stop só decide com todos os agentes deste lançamento terminados (um ainda rodando
// prova que a execução não acabou) e com ao menos um conhecido (sem agente, não há prova de fim).
export function settled(run: Run): boolean {
  const list = nowAgents(run)
  return list.length > 0 && list.every(a => a.done)
}

// O status do arquivo final vira o fim: 'completed' é ✅, a não ser que todo agente tenha falhado
// (o motor diz 'completed' mesmo quando todos bateram no limite e nada saiu); outro status é ❌.
export const endOf = (run: Run, status: string): 'ok' | 'fail' =>
  status === 'completed' && (!run.agents.size || [...run.agents.values()].some(a => a.ok)) ? 'ok' : 'fail'

// A pasta da sessão: o transcriptDir é <sessão>/subagents/workflows/<runId>.
export function sessionDirOf(dir: string): string {
  const d = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  const i = d.lastIndexOf('/subagents/')
  if (i > 0) return d.slice(0, i)
  return d.split('/').slice(0, -3).join('/')
}

// O arquivo que o motor grava SÓ no fim da execução, com o status dela.
export const finalFileOf = (run: Run) => (run.dir ? `${sessionDirOf(run.dir)}/workflows/${run.runId}.json` : '')

// O status do arquivo final ('completed' = terminou bem); '' se não deu para ler.
export function endStatus(text: unknown): string {
  try {
    const j = JSON.parse(String(text)) as { status?: unknown }
    return typeof j.status === 'string' ? j.status : ''
  } catch {
    return ''
  }
}

export function runProgress(run: Run, more: number): Progress {
  const P = run.phases.length
  return {
    k: 'wf',
    name: run.name,
    phases: run.phases.slice(),
    at: P ? Math.min(Math.max(0, run.at), P - 1) : 0,
    fill: run.fill,
    ...(P ? { fills: run.phases.map((_, i) => run.fills[i] ?? 0) } : {}),
    done: run.done,
    all: 0,
    end: run.end,
    more,
  }
}

// ---------- guardar e reconstruir (recarregamento) ----------

export function saveRun(run: Run): SavedRun {
  const agents: Record<string, SavedRunAgent> = {}
  for (const [id, a] of run.agents) agents[id] = { label: a.label, phase: a.phase, done: a.done, ok: a.ok, ...(a.old ? { old: true } : {}) }
  return {
    runId: run.runId,
    taskId: run.taskId,
    name: run.name,
    phases: run.phases.slice(),
    known: run.known,
    dir: run.dir,
    script: run.script,
    at: run.at,
    fill: run.fill,
    fills: run.fills.slice(),
    done: run.done,
    startedAt: run.startedAt,
    lastAt: run.lastAt,
    launchAt: run.launchAt,
    launched: run.launched,
    seen: run.seen,
    agents,
  }
}

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown, lo: number, hi: number, dflt = lo) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt)

// O que vem guardado no atom 'runs', conferido: lixo vira lista vazia, campo estranho vira o padrão.
export function loadRuns(raw: unknown): Run[] {
  if (!Array.isArray(raw)) return []
  const out: Run[] = []
  for (const r of raw as unknown[]) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const runId = str(o.runId, 80)
    if (!runId) continue
    const run = newRun(runId)
    run.taskId = str(o.taskId, 80)
    run.name = clean(str(o.name), 60)
    run.phases = Array.isArray(o.phases) ? o.phases.filter((p): p is string => typeof p === 'string').map(p => clean(p, 40)).slice(0, 12) : []
    run.known = o.known === true
    run.dir = str(o.dir, 1000)
    run.script = str(o.script, 1000)
    run.at = Math.floor(num(o.at, 0, Math.max(0, run.phases.length - 1)))
    run.fill = num(o.fill, 0, CAP)
    // sem 'fills' (versão antiga): as anteriores à atual cheias, a atual com o 'fill' guardado
    const fills = Array.isArray(o.fills) ? o.fills : []
    run.fills = run.phases.map((_, i) => (i < fills.length ? num(fills[i], 0, 1) : i < run.at ? 1 : i === run.at ? run.fill : 0))
    run.done = Math.floor(num(o.done, 0, 1e6))
    run.startedAt = num(o.startedAt, -1, 1e15, -1)
    run.lastAt = num(o.lastAt, -1, 1e15, -1)
    run.launchAt = num(o.launchAt, -1, 1e15, -1)
    run.launched = Math.max(1, Math.floor(num(o.launched, 0, 1e6)))
    // sem o mtime guardado: numa retomada o tique confere de novo; no 1º lançamento não existia
    run.seen = typeof o.seen === 'number' && Number.isFinite(o.seen) ? Math.max(-1, o.seen) : o.seen === null || run.launched > 1 ? null : -1
    run.touched = false
    if (o.agents && typeof o.agents === 'object' && !Array.isArray(o.agents)) {
      for (const [id, a] of Object.entries(o.agents as Record<string, unknown>)) {
        if (!a || typeof a !== 'object') continue
        const x = a as Record<string, unknown>
        run.agents.set(id, {
          label: str(x.label, 200),
          phase: Math.floor(num(x.phase, -1, run.phases.length - 1, -1)),
          done: x.done === true,
          ok: x.ok === true,
          ...(x.old === true ? { old: true } : {}),
          metaTried: false,
        })
      }
    }
    out.push(run)
  }
  return out
}

// ---------- a lista de tarefas e o lote de ajudantes ----------

export type TaskItem = { subject: string; status: 'pending' | 'in_progress' | 'completed'; active: string; since: number }

// '📋 <activeForm da tarefa em andamento> ██████░░░░ 3/5' (o total é o da lista, que o modelo planejou).
export function tasksProgress(items: readonly TaskItem[]): Progress {
  const done = items.filter(t => t.status === 'completed').length
  let label = ''
  let since = -1
  for (const t of items) {
    if (t.status === 'in_progress' && t.since > since) {
      since = t.since
      label = t.active || t.subject
    }
  }
  return { k: 'tasks', name: clean(label, 60), phases: [], at: 0, fill: items.length ? done / items.length : 0, done, all: items.length, end: '', more: 0 }
}

// O lote de ajudantes: terminados/iniciados, sem nunca recuar; todos terminados enche.
export function batchFill(prev: number, started: number, finished: number): number {
  if (!started) return prev
  return Math.max(prev, finished >= started ? 1 : Math.min(CAP, finished / started))
}

// ---------- o que vem guardado no atom 'progress' ----------

// Conferido como o teamOf faz: uma versão velha (ou estragada) não derruba a faixa.
export function progressOf(raw: unknown): Progress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const k = r.k === 'wf' || r.k === 'tasks' || r.k === 'agents' ? r.k : null
  if (!k) return null
  const phases = Array.isArray(r.phases) ? r.phases.filter((p): p is string => typeof p === 'string').map(p => clean(p, 40)).slice(0, 12) : []
  const fills = Array.isArray(r.fills) && phases.length ? phases.map((_, i) => num((r.fills as unknown[])[i], 0, 1)) : null
  return {
    k,
    name: clean(str(r.name), 60),
    phases,
    at: Math.floor(num(r.at, 0, Math.max(0, phases.length - 1))),
    fill: num(r.fill, 0, 1),
    ...(fills ? { fills } : {}),
    done: Math.floor(num(r.done, 0, 1e6)),
    all: Math.floor(num(r.all, 0, 1e6)),
    end: r.end === 'ok' || r.end === 'fail' ? r.end : '',
    more: Math.floor(num(r.more, 0, 99)),
  }
}

// ---------- a escada de formatos ----------

export type BarFormat = 'G' | 'M' | 'S' | 'XS'
type Cand = { format: BarFormat; spans: StatusSpan[] }

// O degradê dos blocos cheios, do laranja do Clawd (t = 0) ao violeta (t = 1), pela posição do bloco.
export function shade(t: number): string {
  const a = [0xd8, 0x76, 0x56]
  const b = [0xa7, 0x8b, 0xfa]
  return '#' + a.map((v, k) => Math.round(v + ((b[k] ?? v) - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join('')
}

// Pedaços vizinhos com o mesmo estilo viram um só.
function merge(spans: StatusSpan[]): StatusSpan[] {
  const out: StatusSpan[] = []
  for (const s of spans) {
    const prev = out[out.length - 1]
    if (prev && prev.c === s.c && !!prev.b === !!s.b && !!prev.d === !!s.d) prev.t += s.t
    else out.push({ ...s })
  }
  return out
}

// Os blocos: um trecho por fase (todos com `per` blocos), separados por um espaço; `filled` diz
// quantos de cada trecho estão cheios. Sem fases, é um trecho só.
function blocks(filled: readonly number[], per: number): StatusSpan[] {
  const total = filled.length * per
  const out: StatusSpan[] = []
  let i = 0
  filled.forEach((f, s) => {
    if (s) out.push({ t: ' ' })
    for (let k = 0; k < per; k++, i++) out.push(k < f ? { t: '█', c: shade(total > 1 ? i / (total - 1) : 0) } : { t: '█', c: EMPTY })
  })
  return out
}

const filledOf = (fill: number, n: number) => Math.min(n, Math.floor(fill * n + 1e-9))

// Do mais rico ao mais pobre. G só na linha própria. Nunca uma palavra como "fase" ou
// "ajudantes", e nunca um total que cresce (o workflow mostra só os terminados, que só crescem).
function ladder(p: Progress, own: boolean): Cand[] {
  const icon: StatusSpan[] = [{ t: p.end === 'ok' ? '✅' : p.end === 'fail' ? '❌' : ICON[p.k] }]
  const more: StatusSpan[] = p.more > 0 ? [{ t: `+${p.more}`, c: VIOLET }] : []
  const out: Cand[] = []
  const add = (format: BarFormat, ...parts: StatusSpan[][]) => {
    const spans: StatusSpan[] = [...icon]
    for (const part of [...parts, more]) if (part.length) spans.push({ t: ' ' }, ...part)
    out.push({ format, spans: merge(spans) })
  }
  const okName: StatusSpan[] | null = p.end === 'ok' && p.name ? [{ t: p.name, c: GREEN, b: true }] : null
  const P = p.phases.length

  if (p.k === 'wf' && P) {
    const at = Math.min(Math.max(0, p.at), P - 1)
    const phase: StatusSpan = { t: p.phases[at] ?? '', c: ORANGE, b: true }
    // cada fase com o seu preenchimento (fases sobrepostas); um valor guardado por versão antiga,
    // sem 'fills', desenha como antes: as anteriores cheias, a atual pelo 'fill'
    const fillAt = (i: number) => (p.fills ? (p.fills[i] ?? 0) : i < at ? 1 : i === at ? p.fill : 0)
    const bars = (per: number) => blocks(p.phases.map((_, i) => (p.end === 'ok' ? per : filledOf(fillAt(i), per))), per)
    const big = okName ?? (p.name ? [{ t: p.name, d: true }, { t: ' · ', d: true }, phase] : null)
    const mid = okName ?? [phase]
    if (own && big) for (const per of [5, 4, 3]) add('G', big, bars(per))
    for (const per of [5, 4, 3]) add('M', mid, bars(per))
    add('S', bars(2))
    add('XS', [{ t: `${p.end === 'ok' ? P : at + 1}/${P}`, c: VIOLET }])
    return out
  }

  // sem fases: uma barra contínua e o número (terminados ✓; na lista de tarefas, feitas/total)
  const count: StatusSpan[] = [{ t: p.k === 'tasks' ? `${p.done}/${p.all}` : `${p.done}✓`, c: VIOLET }]
  const bar = (w: number) => blocks([p.end === 'ok' ? w : filledOf(p.fill, w)], w)
  const big = p.k === 'wf' && p.name ? (okName ?? [{ t: p.name, d: true }]) : null
  const mid = p.k === 'tasks' && p.name ? [{ t: p.name, c: ORANGE, b: true }] : okName
  if (own && big) for (const w of [10, 8, 6]) add('G', big, bar(w), count)
  if (mid) for (const w of [10, 8, 6]) add('M', mid, bar(w), count)
  for (const w of [10, 8, 6]) add('M', bar(w), count)
  add('S', bar(4), count)
  add('XS', count)
  return out
}

export type Bar = { format: BarFormat; spans: StatusSpan[]; width: number }

// O formato mais rico que cabe em `budget` colunas (null: nada cabe, ou menos de BAR_MIN).
export function barFor(p: Progress, budget: number, own: boolean): Bar | null {
  if (budget < BAR_MIN) return null
  for (const c of ladder(p, own)) {
    const width = lineCols(c.spans)
    if (width <= budget) return { ...c, width }
  }
  return null
}

// ---------- o encaixe na statusline ----------

export type Placed = { rows: StatusSpan[][]; where: '' | 'linha' | 'segmento'; format: BarFormat | '' }

// Qual linha recebe o segmento: a do 🌿 (branch) se houver, senão a do 📂 (a 1ª), senão a mais curta.
export function pickLine(rows: readonly (readonly StatusSpan[])[]): number {
  const texts = rows.map(l => l.map(s => s.t).join(''))
  const branch = texts.findIndex(t => t.includes('🌿'))
  if (branch >= 0) return branch
  const folder = texts.findIndex(t => t.includes('📂'))
  if (folder >= 0) return folder
  let best = 0
  texts.forEach((t, i) => {
    if (cols(t) < cols(texts[best] ?? '')) best = i
  })
  return best
}

// Põe a barra nas linhas da statusline sem mudar a largura da coluna: `ownLine` (a faixa tem
// espaço para mais uma linha sem crescer) faz dela a 1ª linha; senão ela vira um segmento no fim
// de uma linha que já existe. O orçamento é a linha mais larga (em colunas de tela) menos o que a
// linha escolhida já usa, menos o respiro e a reserva.
// O app pode desenhar um emoji com 1 a 2 colunas. Por isso a linha mais larga é medida com o
// emoji no mínimo (1) e a linha escolhida e a barra com ele no máximo (2): seja qual for a largura
// de verdade, a barra nunca deixa a coluna de texto mais larga do que já é.
// `room`: as colunas que a coluna de texto tem de verdade. Na faixa empilhada ela tem a largura
// da faixa e cada linha é cortada ali; a linha mais larga pode passar disso (cortada), então o
// orçamento nunca passa de `room`.
export function placeBar(rows: StatusSpan[][], p: Progress | null, ownLine: boolean, room = Infinity): Placed {
  const none: Placed = { rows, where: '', format: '' }
  if (!p || !rows.length) return none
  const widest = Math.min(Math.max(...rows.map(l => lineCols(l, 1))), room)
  if (ownLine) {
    const bar = barFor(p, widest - BAR_RESERVE, true)
    return bar ? { rows: [bar.spans, ...rows], where: 'linha', format: bar.format } : none
  }
  const idx = pickLine(rows)
  const line = rows[idx] ?? []
  const bar = barFor(p, widest - lineCols(line) - BAR_GAP - BAR_RESERVE, false)
  if (!bar) return none
  return { rows: rows.map((l, i) => (i === idx ? [...l, { t: ' '.repeat(BAR_GAP) }, ...bar.spans] : l)), where: 'segmento', format: bar.format }
}
