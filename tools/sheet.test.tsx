// Gera a "sheet" de animações: cada teste põe o Clawd numa situação e imprime o SVG da pista
// entre @@SHEET nome@@ e @@END@@. Não roda com os testes normais: o tools/make-sheet.py copia
// o mod para uma pasta temporária, coloca este arquivo em hooks/, roda e recorta os SVGs.
import { mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

type Opts = { now?: number; weather?: number; context?: number; fiveHour?: number }

const NOON = 1_699_977_600_000 // 13h em São Paulo
const MORNING = 1_699_959_600_000 // 8h
const NIGHT = 1_699_938_000_000 // 2h
const COLS = 66 // sem statusline, a pista inteira tem 66 colunas (~560 px)

const run = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, o: Opts = {}) {
  const clock = mock.clock(on, { now: o.now ?? NOON })
  mock.store(on, {})
  on('session.cwd', () => ({ value: '/home/voce' }))
  on('session.root', () => ({ value: '/home/voce' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.id', () => ({ value: 'sheet' }))
  on('settings.read', () => ({ value: {} as never }))
  on('session.repo', () => ({ value: null }))
  on('session.surfaces', () => ({ value: ['desktop'] as never }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: o.context ?? 20 }, rateLimits: [] } }))
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' as const } }))
  on('tool.register', () => ({ value: { tool: 'mcp__clawd__recarregar' } }))
  on('process.run', () => ({ value: run('') })) // sem statusline: só a pista
  on('http.fetch', ($, e) => {
    const text = e.url.includes('open-meteo')
      ? JSON.stringify({ current: { temperature_2m: 22, weather_code: o.weather ?? 1, is_day: 1, precipitation: (o.weather ?? 1) >= 51 ? 1 : 0 } })
      : e.url.includes('geojs')
        ? JSON.stringify({ city: 'Exemplo', latitude: '-23.5', longitude: '-46.6' })
        : JSON.stringify({ five_hour: { utilization: o.fiveHour ?? 20 }, seven_day: { utilization: 10 } })
    return { value: { status: 200, ok: true, headers: {}, text } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('classic.SubagentStart', () => ({}))
  on('classic.Stop', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('agent.list', () => ({ value: [] }))
  on('tool.call', ($, e) => {
    if (e.tool === 'Edit') return { result: { structuredPatch: [{ lines: ['+a', '-b'] }] } as never }
    if (e.tool === 'Bash') return { result: { stdout: 'ok', stderr: '', interrupted: false, gitOperation: { commit: { sha: 'abc1234', kind: 'committed' } } } as never }
    return { result: { ok: true } as never }
  })
  return clock
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const begin = async ($: Any, clock: { settle: () => Promise<void> }) => {
  await $.session.start({ cwd: '/home/voce', surface: 'desktop', isInteractive: true })
  await clock.settle()
}

const mountBand = ($: Any, isWorking: boolean) =>
  $.ui.mount({
    plugin: 'clawd',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 12, bodyColumns: COLS, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  })

async function print(ui: Any, name: string) {
  const svg = await ui.find({ type: 'Svg' })
  console.log(`@@SHEET ${name}@@${String(svg?.props.source)}@@END@@`)
}

async function shot($: Any, name: string, isWorking: boolean) {
  const ui = await mountBand($, isWorking)
  await print(ui, name)
  await ui.unmount()
}

// trabalhando, já no laço de digitar (passa o aceno, a corrida e a tirada do laptop)
async function typing($: Any, clock: Any, name: string) {
  let ui = await mountBand($, true)
  await ui.unmount()
  await clock.advance(15_000)
  ui = await mountBand($, true)
  await print(ui, name)
  await ui.unmount()
}

const T = { timeoutMs: 300_000 }

test('idle', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  await shot($, 'idle', false)
})

test('work', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  await ($ as Any).turn.start({ text: 'oi', turnId: 't' })
  await shot($, 'work', true)
})

for (const [name, tool] of [['read', 'Read'], ['web', 'WebFetch'], ['edit', 'Edit']] as const) {
  test(name, T, async ($, on) => {
    const c = world(on)
    await begin($, c)
    await ($ as Any).turn.start({ text: 'oi', turnId: 't' })
    await ($ as Any).tool.call({ tool, file_path: '/x', url: 'https://x', old_string: 'b', new_string: 'a' })
    await c.advance(1100)
    await typing($, c, name)
  })
}

for (const [name, reason] of [['party', 'answer'], ['oops', 'error']] as const) {
  test(name, T, async ($, on) => {
    const c = world(on)
    await begin($, c)
    await ($ as Any).turn.start({ text: 'oi', turnId: 't' })
    await typing($, c, '_' + name)
    await ($ as Any).turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't', reason })
    await shot($, name, false)
  })
}

test('sleep', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  await c.advance(11 * 60_000)
  await shot($, 'sleep', false)
})

test('night', T, async ($, on) => {
  const c = world(on, { now: NIGHT })
  await begin($, c)
  await shot($, 'night', false)
})

test('morning', T, async ($, on) => {
  const c = world(on, { now: MORNING })
  await begin($, c)
  await shot($, 'morning', false)
})

test('tired', T, async ($, on) => {
  const c = world(on, { context: 85 })
  await begin($, c)
  await shot($, 'tired', false)
})

test('worried', T, async ($, on) => {
  const c = world(on, { fiveHour: 95 })
  await begin($, c)
  await shot($, 'worried', false)
})

test('rain', T, async ($, on) => {
  const c = world(on, { weather: 63 })
  await begin($, c)
  await shot($, 'rain', false)
})

test('rain-work', T, async ($, on) => {
  const c = world(on, { weather: 63 })
  await begin($, c)
  await ($ as Any).turn.start({ text: 'oi', turnId: 't' })
  await typing($, c, 'rain-work')
})

test('helpers', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  for (const id of ['a1', 'a2', 'a3']) await ($ as Any).classic.SubagentStart({ agent_id: id, agent_type: 'general-purpose' })
  let ui = await mountBand($, false) // a baia abre e ele desliza para o lado
  await ui.unmount()
  await c.advance(1500)
  ui = await mountBand($, false)
  await print(ui, 'helpers')
  await ui.unmount()
})

test('fireworks', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  await ($ as Any).tool.call({ tool: 'Bash', command: 'git commit -m "feat"' })
  await shot($, 'fireworks', false)
})

test('ultracode', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  await ($ as Any).turn.start({ text: 'ultracode: revisa tudo', turnId: 't' })
  await ($ as Any).prompt.attachment({ type: 'workflow_keyword_request', text: 'ultracode', origin: { kind: 'engine' } })
  await typing($, c, 'ultracode')
})

test('compact', T, async ($, on) => {
  const c = world(on)
  on('session.compact', async () => {
    await shot($, 'compact', false)
    return { messages: [{ role: 'user', text: 'resumo', toolUses: [] }] as never }
  })
  await begin($, c)
  await ($ as Any).session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'oi', toolUses: [] }] })
})

test('pause', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  // uma hora de trabalho seguido (uma ferramenta a cada 5 minutos) e ele sugere uma pausa
  for (let i = 0; i < 12; i++) {
    await ($ as Any).tool.call({ tool: 'Read', file_path: '/x' })
    await c.advance(5 * 60_000)
  }
  await c.advance(2_000)
  await shot($, 'pause', false)
})

const down = (x: number) => ({ type: 'down' as const, x, y: 1, button: 'left' as const })

test('tap', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  const ui = await mountBand($, false)
  await ui.pointer(down(2))
  await print(ui, 'tap')
  await ui.unmount()
})

test('dizzy', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  const ui = await mountBand($, false)
  for (let i = 0; i < 4; i++) {
    await ui.pointer(down(2))
    await c.advance(300)
  }
  await print(ui, 'dizzy')
  await ui.unmount()
})

test('ask', T, async ($, on) => {
  const c = world(on)
  await begin($, c)
  await ($ as Any).turn.start({ text: 'oi', turnId: 't' })
  await typing($, c, '_ask-antes') // trabalhando, no laço de digitar
  // o Claude para esperando a permissão: ele guarda o laptop, vira de frente e acena com o balão "?"
  await ($ as Any).classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } })
  let ui = await mountBand($, true)
  await ui.unmount()
  await c.advance(3_000)
  ui = await mountBand($, true)
  await print(ui, 'ask')
  await ui.unmount()
})
