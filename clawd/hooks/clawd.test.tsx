import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { isTestCommand, testVerdict } from './git'
import { isRaining, parseWindowsPlace, WINDOWS_PLACE_SCRIPT } from './weather'
import { helpersZone, MINI_STEP } from './art'
import { crewOf, helpersLayer, mini, PARTY_MS, teamOf } from './equipe'
import { COSTUME_KINDS, costumeFor, settleCostume } from './fantasias'
import type { CostumeHints } from './fantasias'
import { BOX_H, BOX_W, CELL, fitLane, LANE_W, laneSvg, PAD, phased, SVG_SAFE } from './lane'
import { buildScene, stand, WALK_PX } from './scenes'
import type { Flags, SceneKind, Spec, Step } from './scenes'
import type { Costume, TeamMate } from '../types'

const band = (isWorking: boolean) => ({
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 }, view: {} },
})

const STATUSLINE_OUT =
  '📂 \x1b[1m\x1b[38;2;235;200;0mvoce\x1b[0m\n\x1b[38;2;210;90;220m🌀 Opus 5.5 (1M context)\x1b[0m \x1b[38;2;110;110;110mMEDIUM\x1b[0m'

const WEATHER_JSON = JSON.stringify({ current: { temperature_2m: 21.9, weather_code: 63, is_day: 1, precipitation: 0.4, rain: 0.1, showers: 0.3 } })
const PLACE_JSON = JSON.stringify({ city: 'Sao Paulo', latitude: '-23.55', longitude: '-46.63' })
const USAGE_JSON = JSON.stringify({
  five_hour: { utilization: 18, resets_at: '2026-10-06T16:10:00+00:00' },
  seven_day: { utilization: 11, resets_at: '2026-10-11T16:00:00+00:00' },
})

const WIN_READY = 'Ready|Granted|-23.6196|-46.7895|108'
const WIN_DENIED = 'NoData|Denied|NaN|NaN|NaN'

const run = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

type WorldOptions = { now?: number; sid?: () => string; settings?: () => Record<string, unknown>; store?: Record<string, unknown>; ownStore?: Map<string, unknown>; statusline?: string; env?: Record<string, string>; proc?: (argv: readonly string[]) => ReturnType<typeof run> }

// O teste faz o papel do motor: a sessão, a statusline, a configuração e a internet.
function world(on: On, opts: WorldOptions = {}) {
  const clock = mock.clock(on, { now: opts.now ?? 1_700_000_000_000 })
  const envs: (Record<string, string> | undefined)[] = []
  const fetches: string[] = []
  if (opts.ownStore) {
    // um store que o teste enxerga (o $ do teste não lê o store)
    const m = opts.ownStore
    for (const [k, v] of Object.entries(opts.store ?? {})) m.set(k, v)
    on('store.get', ($, e) => ({ value: m.get(e.key) }))
    on('store.set', ($, e) => {
      m.set(e.key, JSON.parse(JSON.stringify(e.value)))
      return { value: undefined }
    })
    on('store.delete', ($, e) => {
      m.delete(e.key)
      return { value: undefined }
    })
    on('store.keys', () => ({ value: [...m.keys()] }))
  } else mock.store(on, { effort: 'max', ...opts.store })
  on('env.get', ($, e) => ({ value: opts.env?.[e.name] }))
  on('session.cwd', () => ({ value: 'C:/Users/voce' }))
  on('session.root', () => ({ value: 'C:/Users/voce' }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.id', () => ({ value: opts.sid ? opts.sid() : 'teste' }))
  on('settings.read', () => ({ value: (opts.settings ? opts.settings() : {}) as never }))
  on('session.repo', () => ({ value: null }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000, percent: 7 }, rateLimits: [] } }))
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' as const } }))
  on('tool.register', () => ({ value: { tool: 'mcp__clawd__recarregar' } }))
  on('process.run', ($, e) => {
    envs.push(e.init?.env as Record<string, string> | undefined)
    if (opts.proc) return { value: opts.proc(e.argv) }
    return { value: run(opts.statusline ?? STATUSLINE_OUT) }
  })
  on('http.fetch', ($, e) => {
    fetches.push(e.url)
    return { value: { status: 200, ok: true, headers: {}, text: e.url.includes('open-meteo') ? WEATHER_JSON : e.url.includes('geojs') ? PLACE_JSON : USAGE_JSON } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  return { clock, envs, fetches }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const start = ($: any) => $.session.start({ cwd: 'C:/Users/voce', surface: 'desktop', isInteractive: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const report = async ($: any) => JSON.parse((await $.tool.call({ tool: 'mcp__clawd__recarregar' })).result as string)

test('no desktop, a faixa desenha a pista do Clawd, parado e trabalhando', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  for (const isWorking of [false, true]) {
    const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(isWorking) })
    const svg = await ui.find({ type: 'Svg' })
    expect(svg).toBeDefined()
    expect(String(svg?.props.source)).toContain('<svg')
    await ui.unmount()
  }
})

// Um relógio por teste (o mock só aceita um). 1_699_938_000_000 = 2h em São Paulo; ..._984_800_000 = 14h.
const skyAt = async ($: any, on: On, now: number, store?: Record<string, unknown>) => {
  mock.clock(on, { now })
  if (store) mock.store(on, store)
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  const src = String((await ui.find({ type: 'Svg' }))?.props.source)
  await ui.unmount()
  return src
}

test('de madrugada (0h às 5h) a pista ganha o céu, com lua e estrelas', async ($, on) => {
  const src = await skyAt($, on, 1_699_938_000_000)
  expect(src).toContain('id="sky"')
  expect(src).toContain('#fff3c4')
})

test('às 14h a pista não tem céu', async ($, on) => {
  expect(await skyAt($, on, 1_699_984_800_000)).not.toContain('id="sky"')
})

test('de madrugada com chuva: as estrelas somem e a lua fica', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = world(on, { now: 1_699_938_000_000, store: { weather: { emoji: '🌧️', temp: 22, rain: true, at: 1_699_938_000_000 } } })
  await start($)
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(5_000)
  const src = String((await ui.find({ type: 'Svg' }))?.props.source)
  await ui.unmount()
  expect(src).toContain('#8ab4f8')
  expect(src).toContain('id="sky"')
  expect(src).not.toContain('#fff3c4')
})

test('no terminal, a faixa desenha o logo em blocos', async $ => {
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'terminal', ...band(false) })
  expect(await ui.find({ type: 'Text', text: /▐▛███▜▌/ })).toBeDefined()
  await ui.unmount()
})

test('no desktop, a statusline aparece ao lado da pista, com o clima', async ($, on) => {
  world(on)
  await start($)

  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  expect(await ui.find({ type: 'Text', text: /voce/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /MEDIUM/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /22°/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /🎵/ })).toBeUndefined()
  // chovendo (código 63): a pista ganha chuva
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('#8ab4f8')
  await ui.unmount()
})

test('edições somam as linhas; commit solta fogos; ajudantes entram e saem', async ($, on) => {
  world(on)
  // o teste responde às ferramentas como o motor responderia
  on('tool.call', ($, e) => {
    if (e.tool === 'Edit') return { result: { structuredPatch: [{ lines: ['+a', '+b', '-c', ' d'] }] } as never }
    if (e.tool === 'Bash') return { result: { stdout: '[main 1a2b3c] feat', stderr: '', interrupted: false } as never }
    return { deny: 'sem essa ferramenta no teste' }
  })
  on('classic.SubagentStart', () => ({}))
  on('agent.list', () => ({ value: [] }))
  on('turn.complete', () => ({ text: '' }))
  await start($)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  await t.tool.call({ tool: 'Edit', file_path: 'C:/x.ts', old_string: 'c', new_string: 'a\nb' })
  expect((await report($)).linhas).toEqual({ added: 2, removed: 1 })

  await t.tool.call({ tool: 'Bash', command: 'git add x.ts && git commit -m "feat"' })
  expect((await report($)).fogos).toBe(true)
  // os fogos começam do começo (a 2ª explosão sai 0,55 s depois do commit), não no meio do ciclo
  const boom = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  expect(String((await boom.find({ type: 'Svg' }))?.props.source)).toContain('begin="0.55s"')
  await boom.unmount()

  await t.classic.SubagentStart({ agent_id: 'ajudante-1', agent_type: 'general-purpose' })
  expect((await report($)).ajudantes).toEqual(['ajudante-1'])
  // o fim de um ajudante é o fim do turno dele
  await t.turn.complete({ answer: 'pronto', durationMs: 5, isAborted: false, turnId: 'x', agentId: 'ajudante-1', reason: 'answer' })
  expect((await report($)).ajudantes).toEqual([])
})

test('fogos só para commit ou push de verdade; Write novo conta todas as linhas', async ($, on) => {
  world(on)
  on('tool.call', ($, e) => {
    const cmd = String((e as { command?: unknown }).command ?? '')
    if (e.tool === 'Write') return { result: { type: 'create', content: 'a\nb\nc\n', structuredPatch: [] } as never }
    if (e.tool === 'Bash' && cmd.includes('nada'))
      return { result: { stdout: 'On branch main\nnothing to commit, working tree clean\n', stderr: '', interrupted: false } as never }
    if (e.tool === 'Bash' && cmd.includes('push'))
      return { result: { stdout: '', stderr: 'Everything up-to-date\n', interrupted: false } as never }
    if (e.tool === 'Bash')
      return { result: { stdout: 'ok', stderr: '', interrupted: false, gitOperation: { commit: { sha: 'abc1234', kind: 'committed' } } } as never }
    return { deny: 'sem essa ferramenta no teste' }
  })
  on('classic.SubagentStart', () => ({}))
  on('agent.list', () => ({ value: [] }))
  on('turn.complete', () => ({ text: '' }))
  await start($)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  await t.tool.call({ tool: 'Write', file_path: 'C:/novo.ts', content: 'a\nb\nc\n' })
  expect((await report($)).linhas).toEqual({ added: 4, removed: 0 })

  // commit que falhou, seguido de "; echo" (a linha termina bem, mas nada foi commitado)
  await t.tool.call({ tool: 'Bash', command: 'git commit -m "nada" ; echo fim' })
  expect((await report($)).fogos).toBe(false)
  // push sem nada novo
  await t.tool.call({ tool: 'Bash', command: 'git push' })
  expect((await report($)).fogos).toBe(false)
  // o próprio Claude Code marcou um commit
  await t.tool.call({ tool: 'Bash', command: 'git commit -m "feat"' })
  expect((await report($)).fogos).toBe(true)
})

test('testes: passou vira "pass", erro vira "oops", outros comandos e subagentes não disparam', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = world(on)
  on('tool.call', ($, e) => {
    const cmd = String((e as { command?: unknown }).command ?? '')
    if (cmd.includes('pytest')) return { result: { stdout: '1 failed', stderr: '' } as never, isError: true }
    if (cmd.includes('cargo')) return { result: { stdout: 'test result: FAILED. 1 passed; 1 failed', stderr: '', interrupted: false } as never }
    return { result: { stdout: 'ok', stderr: '', interrupted: false } as never }
  })
  on('classic.SubagentStart', () => ({}))
  on('agent.list', () => ({ value: [] }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  await t.turn.start({ text: 'oi', turnId: 't' })

  const scene = async () => {
    const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(true) })
    await ui.unmount()
    return (await report($)).cena
  }

  await t.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect((await report($)).teste).toBe(null)
  // um subagente rodando testes não conta
  await t.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'ajudante-1' })
  expect((await report($)).teste).toBe(null)

  await t.tool.call({ tool: 'Bash', command: 'cd app && npm test' })
  expect((await report($)).teste).toBe('pass')
  expect(await scene()).toBe('pass')
  // some depois de 3 s
  await clock.advance(4_000)
  expect((await report($)).teste).toBe(null)
  expect(await scene()).toBe('work')

  // com erro: a cena do susto, mesmo no meio do turno
  await t.tool.call({ tool: 'Bash', command: 'python -m pytest -q' })
  expect((await report($)).teste).toBe('oops')
  expect(await scene()).toBe('oops')
  await clock.advance(5_000)
  // saída com falha sem isError: também é susto
  await t.tool.call({ tool: 'Bash', command: 'cargo test' })
  expect((await report($)).teste).toBe('oops')
})

test('testVerdict reconhece os rodadores de teste e só eles', async () => {
  for (const c of ['npm test', 'npm run test:unit', 'pnpm test', 'yarn test', 'bun test', 'npx vitest run', 'npx jest', 'vitest', 'jest --ci', 'pytest -q', 'python -m pytest', 'go test ./...', 'cargo test', 'dotnet test', 'mvn test', 'gradle test', 'claude plugin test ./clawd', 'claude.cmd plugin test ./clawd', 'cd x && npm test', 'git status; pytest', 'CI=1 npm test'])
    expect(isTestCommand(c), c).toBe(true)
  for (const c of ['ls', 'npm install', 'echo npm test', 'git commit -m "npm test"', 'cat tests.py', 'npm run build'])
    expect(isTestCommand(c), c).toBe(false)
  expect(testVerdict('npm test', { result: { stdout: 'Tests: 3 passed' } })).toBe('pass')
  expect(testVerdict('npm test', { isError: true })).toBe('fail')
  expect(testVerdict('npm test', { result: { stdout: 'Tests: 2 failed, 3 passed' } })).toBe('fail')
  expect(testVerdict('npm test', { result: { stdout: '0 failed, 3 passed' } })).toBe('pass')
  expect(testVerdict('npm test', { deny: 'não' })).toBe(null)
  expect(testVerdict('npm test', { result: { backgroundTaskId: 'x' } })).toBe(null)
  expect(testVerdict('ls', { isError: true })).toBe(null)
})

test('faixa estreita: o Clawd desce pra linha de baixo; faixa larga: fica ao lado do texto', async ($, on) => {
  world(on)
  await start($)
  const wide = await $.ui.mount({
    plugin: 'clawd',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  })
  expect((await wide.find({ type: 'Box' }))?.props.flexDirection).toBe('row')
  await wide.unmount()

  const narrow = await $.ui.mount({
    plugin: 'clawd',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 30, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  })
  expect((await narrow.find({ type: 'Box' }))?.props.flexDirection).toBe('column')
  expect(await narrow.find({ type: 'Svg' })).toBeDefined()
  await narrow.unmount()
})

test('compactando o contexto, o Clawd opera a prensa; depois, ela some', async ($, on) => {
  world(on)
  let during = ''
  // o teste faz o papel do motor: no meio da compactação, olha a faixa
  on('session.compact', async () => {
    const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
    during = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
    await ui.unmount()
    return { messages: [{ role: 'user', text: 'resumo da conversa', toolUses: [] }] as never }
  })
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ($ as any).session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'oi', toolUses: [] }] })
  expect(during).toContain('#6e6e6e') // a haste da prensa

  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).not.toContain('#6e6e6e')
  await ui.unmount()
})

test('ultracode: o aviso do motor acende; um workflow mantém aceso; sem workflow, apaga no fim do turno', async ($, on) => {
  world(on)
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('tool.call', ($, e) =>
    e.tool === 'Workflow' ? { result: { status: 'async_launched', taskId: 'w1' } as never } : { deny: 'sem essa ferramenta no teste' },
  )
  on('classic.Stop', () => ({}))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any

  await t.turn.start({ text: 'ultracode: revisa o mod', turnId: 't1' })
  await t.prompt.attachment({ type: 'workflow_keyword_request', text: 'ultracode', origin: { kind: 'engine' } })
  expect((await report($)).ultracode).toBe(true)

  // o turno ultracode termina, mas o workflow lançado continua
  await t.tool.call({ tool: 'Workflow', script: 'x' })
  await t.classic.Stop({ stop_hook_active: false, background_tasks: [{ id: 'w1', type: 'workflow', status: 'running', description: 'x' }] })
  await t.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  expect((await report($)).ultracode).toBe(true)

  // o turno seguinte termina e o workflow já acabou
  await t.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  await t.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  expect((await report($)).ultracode).toBe(false)
})

test('ultracode: aviso velho repetido ao retomar não acende; o botão do app (configuração) acende', async ($, on) => {
  let cfg: Record<string, unknown> = {}
  world(on, { settings: () => cfg })
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any

  // conversa retomada: o motor repete o aviso de um pedido antigo, mas o de agora não fala em ultracode
  await t.turn.start({ text: 'arruma o README', turnId: 't1' })
  await t.prompt.attachment({ type: 'workflow_keyword_request', text: 'ultracode', origin: { kind: 'engine' } })
  expect((await report($)).ultracode).toBe(false)
  await t.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  // o botão do app grava ultracode na configuração: o turno seguinte já acende
  cfg = { ultracode: true }
  await t.turn.start({ text: 'oi', turnId: 't2' })
  expect((await report($)).ultracode).toBe(true)

  // /effort ultracode off apaga, mesmo com a configuração ainda ligada
  await t.prompt.attachment({ type: 'ultra_effort_exit', text: 'off', origin: { kind: 'engine' } })
  await t.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await t.turn.start({ text: 'oi de novo', turnId: 't3' })
  expect((await report($)).ultracode).toBe(false)
})

test('conversa nova: o app se conecta depois do início, e as leituras da faixa começam quando ele chega', async ($, on) => {
  const { clock } = world(on)
  on('session.surfaces', () => ({ value: [] }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any

  // como o app de desktop começa: sem superfície no session.start
  await t.session.start({ cwd: 'C:/Users/voce', surface: null, isInteractive: false })
  await clock.settle()
  expect((await report($)).limites).toBe('ainda não consultado')
  expect((await report($)).faixa_lendo).toBe(false)

  await t.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.settle()
  expect((await report($)).faixa_lendo).toBe(true)
  expect(String((await report($)).limites)).toMatch(/^ok/)
})

test('a statusline recebe a largura que sobra ao lado da pista, e refaz quando a janela cruza o limite', async ($, on) => {
  const { clock, envs } = world(on)
  await start($)
  const mount = (cols: number) =>
    $.ui.mount({
      plugin: 'clawd',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: cols, scroll: { offset: 0, bodyRows: 12 }, view: {} },
    })

  let ui = await mount(140)
  await clock.advance(1100) // o tique de 1 s refaz a statusline
  expect(envs[envs.length - 1]?.CLAUDE_STATUSLINE_COLS).toBe('125') // 140 - 13 da pista - 2 de respiro
  await ui.unmount()

  ui = await mount(80)
  await clock.advance(1100)
  expect(envs[envs.length - 1]?.CLAUDE_STATUSLINE_COLS).toBe('45') // o formato largo não cabe ao lado
  await ui.unmount()
})

test('retomar outra conversa no mesmo processo traz as linhas dela', async ($, on) => {
  let sid = 'a'
  world(on, { sid: () => sid })
  on('tool.call', ($, e) =>
    e.tool === 'Edit' ? { result: { structuredPatch: [{ lines: ['+a', '+b', '-c'] }] } as never } : { deny: 'sem essa ferramenta no teste' },
  )
  on('classic.SessionStart', () => ({}))
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any

  await t.tool.call({ tool: 'Edit', file_path: 'C:/x.ts', old_string: 'c', new_string: 'a\nb' })
  expect((await report($)).linhas).toEqual({ added: 2, removed: 1 })

  sid = 'b'
  await t.classic.SessionStart({ source: 'resume' })
  expect((await report($)).linhas).toEqual({ added: 0, removed: 0 })

  sid = 'a'
  await t.classic.SessionStart({ source: 'resume' })
  expect((await report($)).linhas).toEqual({ added: 2, removed: 1 })
})

test('limites: a vez de consultar é dividida entre as conversas; a espera marcada por outra vale aqui', { timeoutMs: 60_000 }, async ($, on) => {
  const NOW = 1_700_000_000_000
  // outra conversa levou um 429 e marcou: ninguém consulta nos próximos 10 minutos
  const { clock, fetches } = world(on, { store: { limitsGate: { nextAt: NOW + 10 * 60_000, strikes: 1 } } })
  const usage = () => fetches.filter(u => u.includes('/api/oauth/usage')).length
  await start($)
  await clock.settle()
  expect(usage()).toBe(0)

  // passada a espera, o relógio de 2 min consulta uma vez só
  await clock.advance(11 * 60_000)
  expect(usage()).toBe(1)
  expect(String((await report($)).limites)).toMatch(/^ok/)
})

// ---------- o tapinha ----------

// O mod mostra um tapinha: o clique cai numa área invisível, e o mod confere se pegou o Clawd.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mountBand = ($: any, isWorking: boolean) => $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(isWorking) })

const down = (x: number, y = 1) => ({ type: 'down' as const, x, y, button: 'left' as const })

test('tapinha: a pista ganha uma área de clique que não desenha nada visível; no terminal não existe', async ($, on) => {
  world(on)
  await start($)
  const ui = await mountBand($, false)
  expect(await ui.find({ type: 'Client', key: 'tap' })).toBeDefined()
  // o módulo da área desenha só uma caixa vazia (com um espaço): nada que se veja. Ela tem 4 linhas
  // porque o app só dá à região a altura do que o módulo desenha (no mínimo uma linha, no topo)
  const drawn = await ui.drawn({ in: 'tap' })
  expect(drawn).toMatchObject({ type: 'Box', props: { height: 4 } })
  expect(await ui.find({ type: 'Text', in: 'tap' })).toBeDefined()
  expect(await ui.find({ type: 'Button', in: 'tap' })).toBeUndefined()
  expect(await ui.find({ type: 'Svg', in: 'tap' })).toBeUndefined()
  // a área fica presa dentro da pista (overflow escondido): nunca vaza sobre a caixa de mensagem
  const boxes = await ui.findAll({ type: 'Box' })
  expect(boxes.some((b: { props: Record<string, unknown> }) => b.props.position === 'absolute' && b.props.overflow === 'hidden')).toBe(true)
  await ui.unmount()

  const terminal = await $.ui.mount({ plugin: 'clawd', surface: 'terminal', ...band(false) })
  expect(await terminal.find({ type: 'Text', text: /▐▛███▜▌/ })).toBeDefined()
  await terminal.unmount()
})

test('tapinha: clicar no Clawd (laptop aberto, no canto) o faz reagir; clicar longe dele não faz nada', async ($, on) => {
  const { clock } = world(on)
  await start($)
  const ui = await mountBand($, true)
  await clock.advance(15_000) // passa o aceno, a corrida e a tirada do laptop: ele digita no fim da pista
  await ui.resize({ columns: 60, rows: 3 })

  // ao ganhar tamanho a área avisa o mod (diagnóstico): quanto mede
  let r = await report($)
  expect(r.toques).toHaveLength(1)
  expect(r.toques[0]).toMatchObject({ type: 'boot', cols: 60, rows: 3 })

  // longe dele: a pista tem 60 colunas e o Clawd está nas últimas ~10
  await ui.pointer(down(5))
  r = await report($)
  expect(r.toques).toHaveLength(2)
  expect(r.toques[1]).toMatchObject({ type: 'down', x: 5, cols: 60, hit: false })
  expect(r.reacao).toBeNull()

  // em cima dele: estrela de impacto, achatando; e ele continua digitando (a cena segue "work")
  await ui.pointer(down(56))
  r = await report($)
  expect(r.toques[2]).toMatchObject({ type: 'down', x: 56, hit: true })
  expect(r.reacao).toBe('pow')
  expect(r.cena).toBe('work')
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(source).toContain('<polygon') // a estrela do tapinha
  expect(source).toContain('type="scale"') // o achatamento
  await ui.unmount()
})

async function tapAndLook($: any, on: On, env: Record<string, string>) {
  const m = new Map<string, unknown>()
  const { clock } = world(on, { ownStore: m, env })
  await start($)
  const ui = await mountBand($, true)
  await clock.advance(15_000)
  await ui.resize({ columns: 60, rows: 3 })
  await ui.pointer(down(5))
  const toques = (await report($)).toques.length // em memória, sempre
  await ui.unmount()
  return { m, toques }
}

test('tapinha: sem CLAWD_DEBUG o registro dos cliques fica só em memória', async ($, on) => {
  const { m, toques } = await tapAndLook($, on, {})
  expect(toques).toBeGreaterThan(0)
  expect(m.has('tapLog')).toBe(false)
  expect(m.has('renderLog')).toBe(false)
})

test('tapinha: com CLAWD_DEBUG o registro dos cliques vai para o store', async ($, on) => {
  const { m, toques } = await tapAndLook($, on, { CLAWD_DEBUG: '1' })
  expect(toques).toBeGreaterThan(0)
  expect(m.has('tapLog')).toBe(true)
  expect(m.has('renderLog')).toBe(false)
})

test('tapinha: só o botão esquerdo conta, e um recado malformado não derruba nada', async ($, on) => {
  world(on)
  await start($)
  const ui = await mountBand($, false)
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'right' })
  await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left' })
  await ui.pointer({ type: 'move', x: 3, y: 0 })
  await ui.post({ x: 'a', y: null })
  await ui.post('oi')
  expect((await report($)).toques).toHaveLength(0)
  // o mouse entrar na área só fica anotado: nenhuma reação
  await ui.pointer({ type: 'enter', x: 0, y: 0 })
  let r = await report($)
  expect(r.toques).toHaveLength(1)
  expect(r.toques[0]).toMatchObject({ type: 'enter' })
  expect(r.reacao).toBeNull()
  // o clique certo ainda funciona depois do lixo
  await ui.pointer(down(3))
  r = await report($)
  expect(r.toques).toHaveLength(2)
  expect(r.toques[1]).toMatchObject({ type: 'down', x: 3 })
  expect(r.reacao).toBe('pow')
  await ui.unmount()
})

test('tapinha: quatro seguidos em 3 segundos o deixam tonto (olhos girando, estrelinhas)', async ($, on) => {
  const { clock } = world(on)
  await start($)
  const ui = await mountBand($, false)
  // a área ainda não foi medida (0 colunas): qualquer clique na pista vale
  for (let i = 0; i < 3; i++) {
    await ui.pointer(down(2))
    expect((await report($)).reacao).toBe('pow')
    await clock.advance(400)
  }
  await ui.pointer(down(2))
  expect((await report($)).reacao).toBe('stars')
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(source).toContain('dur="0.64s"') // o furo do aro girando em cada olho
  // depois do tonto o contador zera: o próximo tapinha é só um tapinha
  await clock.advance(5_000)
  await ui.pointer(down(2))
  expect((await report($)).reacao).toBe('pow')
  await ui.unmount()
})

test('tapinha: acorda o Clawd que dorme, e ele não volta a cochilar logo em seguida', async ($, on) => {
  const { clock } = world(on)
  await start($)
  await clock.advance(11 * 60_000) // 10 minutos sem nada: ele cochila
  const ui = await mountBand($, false)
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Clawd dormindo')

  await ui.pointer(down(2))
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Clawd passeando')
  expect((await report($)).cena).toBe('idle')
  await clock.advance(3_000)
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Clawd passeando')
  await ui.unmount()
})

test('a conversa abre com a última statusline guardada desta pasta, sem esperar o node', async ($, on) => {
  const { clock } = world(on, {
    store: { 'statusCache:C:/Users/voce': [[{ t: '📂 ' }, { t: 'guardada', c: '#ebc800', b: true }]] },
    statusline: '', // o node ainda não respondeu nada
  })
  await start($)
  await clock.settle()
  const ui = await mountBand($, false)
  expect(await ui.find({ type: 'Text', text: /guardada/ })).toBeDefined()
  await ui.unmount()
})

test('limpeza do store: conversa velha sai, a atual e a recente ficam, e órfã sem registro sai', async ($, on) => {
  const DAY = 24 * 3600 * 1000
  const now = 1_700_000_000_000
  const store = new Map<string, unknown>()
  world(on, {
    ownStore: store,
    sid: () => 'atual',
    store: {
      sessions: { velha: now - 8 * DAY, recente: now - 2 * DAY, atual: now - 30 * DAY },
      'effort:velha': 'low', 'lines:velha': { added: 1, removed: 0 },
      'effort:recente': 'high', 'lines:recente': { added: 2, removed: 1 },
      'effort:atual': 'max', 'lines:atual': { added: 3, removed: 3 },
      'effort:orfa': 'low', 'lines:orfa': { added: 9, removed: 9 },
      place: { city: 'x' },
    },
  })
  await start($)
  const kept = [...store.keys()].filter(k => /^(effort|lines):/.test(k)).sort()
  expect(kept).toEqual(['effort:atual', 'effort:recente', 'lines:atual', 'lines:recente'])
  expect(store.get('place')).toEqual({ city: 'x' }) // o que não é de conversa fica
  const sessions = store.get('sessions') as Record<string, number>
  expect(Object.keys(sessions).sort()).toEqual(['atual', 'recente'])
  expect(sessions.atual).toBe(now) // a atual foi marcada como vista agora
  expect(sessions.recente).toBe(now - 2 * DAY)
})

// A ordem de procura do node: CLAWD_NODE, "node" no PATH, o "where node" (só no Windows, uma vez) e os caminhos de Mac/Linux.
test('o node: CLAWD_NODE primeiro; se falha, o "node" do PATH; sem where fora do Windows', async ($, on) => {
  const calls: string[] = []
  const { clock } = world(on, {
    env: { CLAWD_NODE: 'C:/meu/node.exe' },
    proc: (argv) => {
      calls.push(argv[0])
      if (argv[0] === 'C:/meu/node.exe') throw new Error('sem esse')
      return run(STATUSLINE_OUT)
    },
  })
  await start($)
  await clock.settle()
  expect(calls.slice(0, 2)).toEqual(['C:/meu/node.exe', 'node'])
  expect(calls).not.toContain('where')
})

test('o node: tudo falha fora do Windows, sobram os caminhos de Mac/Linux, sem where', async ($, on) => {
  const calls: string[] = []
  const { clock } = world(on, {
    proc: (argv) => {
      calls.push(argv[0])
      if (argv[0] !== '/opt/homebrew/bin/node') throw new Error('sem esse')
      return run(STATUSLINE_OUT)
    },
  })
  await start($)
  await clock.settle()
  expect(calls.slice(0, 3)).toEqual(['node', '/usr/local/bin/node', '/opt/homebrew/bin/node'])
  expect(calls).not.toContain('where')
})

test('o node no Windows: PATH falha, o "where node" roda uma vez e o resultado fica guardado', async ($, on) => {
  const calls: string[] = []
  const { clock } = world(on, {
    env: { OS: 'Windows_NT' },
    proc: (argv) => {
      if (argv[0] === 'powershell.exe') return run(WIN_DENIED) // a localização do Windows não entra na ordem do node
      calls.push(argv[0])
      if (argv[0] === 'where') return run('C:\\nvm4w\\nodejs\\node.exe\r\nD:\\outro\\node.exe\r\n')
      if (argv[0] !== 'C:/nvm4w/nodejs/node.exe') throw new Error('sem esse')
      return run(STATUSLINE_OUT)
    },
  })
  await start($)
  await clock.settle()
  expect(calls.slice(0, 3)).toEqual(['node', 'where', 'C:/nvm4w/nodejs/node.exe'])
  const ui = await mountBand($, false)
  await clock.advance(21_000) // a statusline refaz de tempos em tempos
  await ui.unmount()
  expect(calls.filter((c) => c === 'where')).toHaveLength(1)
  expect(calls.filter((c) => c === 'C:/nvm4w/nodejs/node.exe').length).toBeGreaterThan(1)
})

// ---------- o lugar: o Windows primeiro, o IP de reserva ----------

const isPowershell = (argv: readonly string[]) => argv[0] === 'powershell.exe'
const isPlaceFetch = (u: string) => u.includes('geojs') || u.includes('ipwho')
const weatherFetches = (fetches: string[]) => fetches.filter((u) => u.includes('open-meteo'))
// o motor do teste: o powershell responde "answer" e o resto (a statusline) a saída de sempre
const winProc = (answer: string, calls: string[][] = []) => (argv: readonly string[]) => {
  if (isPowershell(argv)) {
    calls.push([...argv])
    return run(answer)
  }
  return run(STATUSLINE_OUT)
}

test('lugar: a saída do PowerShell só vale com Ready, Granted e números de verdade', () => {
  expect(parseWindowsPlace(WIN_READY)).toEqual({ lat: -23.62, lon: -46.79, acc: 108 })
  expect(parseWindowsPlace(WIN_READY + '\r\n')).toEqual({ lat: -23.62, lon: -46.79, acc: 108 })
  expect(parseWindowsPlace(WIN_DENIED)).toBeNull()
  expect(parseWindowsPlace('Ready|Denied|-23.6|-46.7|10')).toBeNull()
  expect(parseWindowsPlace('Initializing|Granted|NaN|NaN|NaN')).toBeNull()
  expect(parseWindowsPlace('Ready|Granted|-23,6196|-46,7895|108')).toBeNull() // vírgula decimal: o script não deixa chegar assim
  expect(parseWindowsPlace('Ready|Granted|0|0|0')).toBeNull()
  expect(parseWindowsPlace('Ready|Granted|123|-46|5')).toBeNull()
  expect(parseWindowsPlace('')).toBeNull()
  expect(WINDOWS_PLACE_SCRIPT).not.toContain('\n')
  expect(WINDOWS_PLACE_SCRIPT).toContain('InvariantCulture')
})

test('lugar no Windows: com Ready e Granted o lugar vem do Windows, arredondado, sem tocar nos serviços de IP', { timeoutMs: 60000 }, async ($, on) => {
  const calls: string[][] = []
  const { clock, fetches } = world(on, { env: { OS: 'Windows_NT' }, proc: winProc(WIN_READY, calls) })
  await start($)
  await clock.settle()
  const r = await report($)
  expect(r.lugar.lat).toBe(-23.62)
  expect(r.lugar.lon).toBe(-46.79)
  expect(r.lugar.source).toBe('windows')
  expect(fetches.some(isPlaceFetch)).toBe(false)
  const w = weatherFetches(fetches)
  expect(w.length).toBeGreaterThan(0)
  expect(w.every((u) => u.includes('latitude=-23.62&longitude=-46.79'))).toBe(true)
  expect(calls[0].slice(0, 4)).toEqual(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command'])
  expect(calls[0]).not.toContain('-ExecutionPolicy')
})

test('lugar no Windows: negado cai no IP e só tenta o Windows de novo na próxima hora', { timeoutMs: 60000 }, async ($, on) => {
  const calls: string[][] = []
  const { clock, fetches } = world(on, { env: { OS: 'Windows_NT' }, proc: winProc(WIN_DENIED, calls) })
  await start($)
  await clock.settle()
  const r = await report($)
  expect(r.lugar.source).toBe('ip')
  expect(r.lugar.lat).toBe(-23.55)
  expect(fetches.some((u) => u.includes('geojs'))).toBe(true)
  expect(calls).toHaveLength(1)
  await clock.advance(20 * 60_000) // passam as leituras do clima, mas não a hora
  expect(calls).toHaveLength(1)
  await clock.advance(50 * 60_000) // agora passou mais de uma hora da falha
  expect(calls.length).toBeGreaterThan(1)
})

test('lugar no Windows: powershell que falha ou estoura o tempo não trava nada e cai no IP', { timeoutMs: 60000 }, async ($, on) => {
  const { clock, fetches } = world(on, {
    env: { OS: 'Windows_NT' },
    proc: (argv) => {
      if (isPowershell(argv)) throw new Error('powershell sumiu')
      return run(STATUSLINE_OUT)
    },
  })
  await start($)
  await clock.settle()
  const r = await report($)
  expect(r.lugar.source).toBe('ip')
  expect(fetches.some((u) => u.includes('geojs'))).toBe(true)
  expect(weatherFetches(fetches).length).toBeGreaterThan(0)
})

test('lugar fora do Windows: nem roda o powershell, vai direto ao IP', { timeoutMs: 60000 }, async ($, on) => {
  const calls: string[][] = []
  const { clock, fetches } = world(on, { proc: winProc(WIN_READY, calls) })
  await start($)
  await clock.settle()
  const r = await report($)
  expect(calls).toHaveLength(0)
  expect(r.lugar.source).toBe('ip')
  expect(fetches.some((u) => u.includes('geojs'))).toBe(true)
})

test('lugar: CLAWD_LOCATION fixa ganha do Windows e do IP', { timeoutMs: 60000 }, async ($, on) => {
  const calls: string[][] = []
  const { clock, fetches } = world(on, { env: { OS: 'Windows_NT', CLAWD_LOCATION: '-22.9,-43.2' }, proc: winProc(WIN_READY, calls) })
  await start($)
  await clock.settle()
  const r = await report($)
  expect(r.lugar.source).toBe('env')
  expect(r.lugar.lat).toBe(-22.9)
  expect(calls).toHaveLength(0)
  expect(fetches.some(isPlaceFetch)).toBe(false)
})

test('lugar: CLAWD_WEATHER=off no Windows não roda o powershell nem pede nada', { timeoutMs: 60000 }, async ($, on) => {
  const calls: string[][] = []
  const { clock, fetches } = world(on, { env: { OS: 'Windows_NT', CLAWD_WEATHER: 'off' }, proc: winProc(WIN_READY, calls) })
  await start($)
  await clock.settle()
  await clock.advance(5 * 60_000)
  const r = await report($)
  expect(calls).toHaveLength(0)
  expect(r.lugar).toBeNull()
  expect(fetches.some((u) => isPlaceFetch(u) || u.includes('open-meteo'))).toBe(false)
})

for (const [nome, antigo] of [
  ["guardado pelo IP (source 'ip')", { lat: -23.55, lon: -46.63, city: 'Sao Paulo', source: 'ip' }],
  ['guardado por uma versão antiga (sem source)', { lat: -23.55, lon: -46.63, city: 'Sao Paulo' }],
] as const) {
  test(`lugar: ${nome} no Windows tenta o Windows na hora, sem esperar a hora, e corrige o clima`, { timeoutMs: 60000 }, async ($, on) => {
    const NOW = 1_700_000_000_000
    const calls: string[][] = []
    const store = new Map<string, unknown>()
    const { clock, fetches } = world(on, { now: NOW, ownStore: store, store: { place: { ...antigo, at: NOW - 60_000 } }, env: { OS: 'Windows_NT' }, proc: winProc(WIN_READY, calls) })
    await start($)
    await clock.settle()
    expect(calls).toHaveLength(1) // o guardado tem 1 minuto, mas veio do IP
    expect(fetches.some(isPlaceFetch)).toBe(false)
    const saved = store.get('place') as Record<string, unknown>
    expect(saved.source).toBe('windows')
    expect(saved.lat).toBe(-23.62)
    const w = weatherFetches(fetches)
    expect(w.length).toBeGreaterThan(0)
    expect(w.every((u) => u.includes('latitude=-23.62'))).toBe(true) // o clima do centro nem chega a ser pedido
  })
}

test('lugar: guardado do Windows ainda novo não pergunta de novo', { timeoutMs: 60000 }, async ($, on) => {
  const NOW = 1_700_000_000_000
  const calls: string[][] = []
  const { clock, fetches } = world(on, { now: NOW, store: { place: { lat: -23.62, lon: -46.79, city: '', at: NOW - 60_000, source: 'windows' } }, env: { OS: 'Windows_NT' }, proc: winProc(WIN_READY, calls) })
  await start($)
  await clock.settle()
  expect(calls).toHaveLength(0)
  expect(weatherFetches(fetches).length).toBeGreaterThan(0)
})

test('lugar: guardado do Windows vencido pergunta de novo e já pede o clima do lugar novo, sem esperar os 15 minutos', { timeoutMs: 60000 }, async ($, on) => {
  const NOW = 1_700_000_000_000
  const calls: string[][] = []
  const { clock, fetches } = world(on, { now: NOW, store: { place: { lat: -23.55, lon: -46.63, city: '', at: NOW - 2 * 60 * 60_000, source: 'windows' } }, env: { OS: 'Windows_NT' }, proc: winProc(WIN_READY, calls) })
  await start($)
  await clock.settle()
  expect(calls).toHaveLength(1)
  const w = weatherFetches(fetches)
  expect(w).toHaveLength(1)
  expect(w[0]).toContain('latitude=-23.62&longitude=-46.79')
})

test('lugar: o IP muda a posição em mais de 1 km, o clima é refeito na hora com o lugar novo', { timeoutMs: 60000 }, async ($, on) => {
  const NOW = 1_700_000_000_000
  const { clock, fetches } = world(on, { now: NOW, store: { place: { lat: -22, lon: -47, city: 'Outra', at: NOW - 2 * 60 * 60_000, source: 'ip' } } })
  await start($)
  await clock.settle()
  const w = weatherFetches(fetches)
  expect(w).toHaveLength(2) // o lugar guardado primeiro, o novo logo depois
  expect(w[0]).toContain('latitude=-22&')
  expect(w[1]).toContain('latitude=-23.55&')
})

// Os botões de desligar a internet: com "off" (ou 0, false) não sai nenhuma requisição.
for (const off of ['off', 'OFF', '0', 'false']) {
  test(`CLAWD_WEATHER=${off} e CLAWD_LIMITS=${off}: nenhuma requisição, sem clima e sem preocupação`, { timeoutMs: 60000 }, async ($, on) => {
    const { clock, fetches } = world(on, {
      env: { CLAWD_WEATHER: off, CLAWD_LIMITS: off },
      store: { weather: { emoji: '🌧️', temp: 22, rain: true, at: 1_700_000_000_000 } },
    })
    await start($)
    const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
    await clock.advance(5 * 60_000)
    expect(await ui.find({ type: 'Text', text: /22°/ })).toBeUndefined()
    expect(String((await ui.find({ type: 'Svg' }))?.props.source)).not.toContain('#8ab4f8')
    expect(fetches).toEqual([])
    const r = await report($)
    expect(r.clima).toBeNull()
    expect(r.preocupado).toBe(false)
    expect(fetches).toEqual([])
    await ui.unmount()
  })
}

test('só CLAWD_WEATHER=off: os limites ainda são consultados, o clima não', { timeoutMs: 60000 }, async ($, on) => {
  const { clock, fetches } = world(on, { env: { CLAWD_WEATHER: 'off' } })
  await start($)
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(60_000)
  await report($)
  expect(fetches.some(u => u.includes('anthropic'))).toBe(true)
  expect(fetches.some(u => u.includes('open-meteo') || u.includes('geojs') || u.includes('ipwho'))).toBe(false)
  await ui.unmount()
})

test('só CLAWD_LIMITS=off: o clima ainda é consultado, os limites não', { timeoutMs: 60000 }, async ($, on) => {
  const { clock, fetches } = world(on, { env: { CLAWD_LIMITS: 'off' } })
  await start($)
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(60_000)
  await report($)
  expect(fetches.some(u => u.includes('open-meteo'))).toBe(true)
  expect(fetches.some(u => u.includes('anthropic'))).toBe(false)
  await ui.unmount()
})

// ---------- chamando você: o Claude espera o seu sim numa permissão ----------

const ASK = { tool_name: 'Bash', tool_input: { command: 'ls' } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const alt = async (ui: any) => String((await ui.find({ type: 'Svg' }))?.props.alt)

// o teste faz o papel do motor: os ganchos de baixo respondem como ele responderia
function askWorld(on: On) {
  const w = world(on)
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('classic.PermissionDenied', () => ({}))
  on('classic.Stop', () => ({}))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } as never }))
  return w
}

test('chamando: o pedido de permissão abre a cena ask; a ferramenta seguinte a fecha e ele volta a trabalhar', async ($, on) => {
  const { clock } = askWorld(on)
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  await t.turn.start({ text: 'oi', turnId: 't1' })
  const ui = await mountBand($, true)
  await clock.advance(15_000) // ele já digita no laptop
  expect(await alt(ui)).toContain('digitando')

  await t.classic.PermissionRequest(ASK)
  expect((await report($)).chamando).toBe(true)
  expect(await alt(ui)).toContain('chamando')
  expect((await report($)).cena).toBe('ask')
  // laptop guardado, de frente, braço acenando e o balão "?"
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(source).toContain('#e5484d')
  await clock.advance(2_000)
  expect(await alt(ui)).toContain('chamando')

  // você disse sim: a ferramenta roda e acaba
  await t.tool.call({ tool: 'Bash', command: 'ls' })
  expect((await report($)).chamando).toBe(false)
  expect(await alt(ui)).toContain('digitando')
  await ui.unmount()
})

test('chamando: só o agente principal chama; ajudante e o aviso de outro tipo não', async ($, on) => {
  askWorld(on)
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  await t.classic.PermissionRequest({ ...ASK, agent_id: 'ajudante-1', agent_type: 'general-purpose' })
  expect((await report($)).chamando).toBe(false)
  await t.classic.Notification({ message: 'x', notification_type: 'permission_prompt', agent_id: 'ajudante-1' })
  expect((await report($)).chamando).toBe(false)
  await t.classic.Notification({ message: 'x', notification_type: 'idle_prompt' })
  expect((await report($)).chamando).toBe(false)
  // uma ferramenta do ajudante acabando também não fecha o chamado do principal
  await t.classic.PermissionRequest(ASK)
  expect((await report($)).chamando).toBe(true)
  await t.tool.call({ tool: 'Bash', command: 'ls', agentId: 'ajudante-1' })
  expect((await report($)).chamando).toBe(true)
})

test('chamando: sem resposta nenhuma, expira em 10 minutos e volta ao normal', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = askWorld(on)
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  await t.classic.PermissionRequest(ASK)
  await clock.advance(9 * 60_000)
  expect((await report($)).chamando).toBe(true)
  await clock.advance(61_000)
  expect((await report($)).chamando).toBe(false)
  const ui = await mountBand($, false)
  expect(await alt(ui)).not.toContain('chamando')
  await ui.unmount()
})

test('chamando: prompt novo, fim do turno, negação automática e Stop também encerram', async ($, on) => {
  askWorld(on)
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  const ends: [string, () => Promise<unknown>][] = [
    ['prompt.submit', () => t.prompt.submit({ text: 'oi' })],
    ['turn.complete', () => t.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't', reason: 'aborted' })],
    ['PermissionDenied', () => t.classic.PermissionDenied({ tool_name: 'Bash', tool_input: {}, tool_use_id: 'u', reason: 'x' })],
    ['Stop', () => t.classic.Stop({ stop_hook_active: false })],
  ]
  for (const [name, end] of ends) {
    await t.classic.PermissionRequest(ASK)
    expect((await report($)).chamando, name + ': abriu').toBe(true)
    await end()
    expect((await report($)).chamando, name + ': fechou').toBe(false)
  }
})

test('chamando: o aviso permission_prompt serve de reserva, mas não reabre depois de um pedido resolvido', async ($, on) => {
  const { clock } = askWorld(on)
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  // sem PermissionRequest: o aviso abre; qualquer ferramenta principal que acabe fecha
  await t.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  expect((await report($)).chamando).toBe(true)
  await t.tool.call({ tool: 'Read', file_path: 'x' })
  expect((await report($)).chamando).toBe(false)

  // com o pedido chegando antes, o aviso (atrasado) do mesmo pedido não o reabre
  await clock.advance(60_000)
  await t.classic.PermissionRequest(ASK)
  await t.classic.Notification({ message: 'x', notification_type: 'permission_prompt' })
  await t.tool.call({ tool: 'Bash', command: 'ls' })
  await t.classic.Notification({ message: 'x', notification_type: 'permission_prompt' })
  expect((await report($)).chamando).toBe(false)
})

test('chamando: um gancho que decide sozinho (decision) não deixa ele chamando ninguém', async ($, on) => {
  world(on)
  on('classic.PermissionRequest', () => ({ decision: { behavior: 'allow' as const } }))
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ($ as any).classic.PermissionRequest(ASK)
  expect((await report($)).chamando).toBe(false)
})

test('chamando: o tapinha mostra a reação e ele volta a chamar', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = askWorld(on)
  await start($)
  const ui = await mountBand($, true)
  await clock.advance(15_000)
  await ui.resize({ columns: 60, rows: 3 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ($ as any).classic.PermissionRequest(ASK)
  expect(await alt(ui)).toContain('chamando') // a faixa se redesenhou
  expect((await report($)).cena).toBe('ask')

  await ui.pointer(down(56))
  let r = await report($)
  expect(r.reacao).toBe('pow')
  expect(r.cena).toBe('ask')
  expect(r.chamando).toBe(true)

  await clock.advance(1_500) // a reação acabou: ele continua chamando
  r = await report($)
  expect(r.cena).toBe('ask')
  expect(r.chamando).toBe(true)
  expect(await alt(ui)).toContain('chamando')
  await ui.unmount()
})

// ---------- chapéu de data: gorro de Natal, chapéu de festa e aniversário ----------

const SANTA_RED = '#d32f2f' // só o gorro usa
const PARTY_VIOLET = '#a78bfa' // só o chapéu de festa usa (sem o ultracode)
const UMBRELLA_RED = '#e5484d'

// 12h no horário local (UTC-3, o padrão sem previsão do tempo) do dia pedido
const noonOn = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 15)

async function hatOn($: any, on: On, when: number, opts: WorldOptions = {}, working = false) {
  const { clock } = world(on, { now: when, env: { CLAWD_WEATHER: 'off', ...opts.env }, store: opts.store })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await start($)
  if (working) await $.turn.start({ text: 'oi', turnId: 't' })
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(working) })
  await clock.advance(working ? 15_000 : 5_000) // trabalhando: passa o aceno e a corrida, e chega no laptop
  const src = String((await ui.find({ type: 'Svg' }))?.props.source)
  await ui.unmount()
  return src
}

test('chapéu: 24 e 25/12 o Clawd usa o gorro de Natal', { timeoutMs: 60000 }, async ($, on) => {
  const src = await hatOn($, on, noonOn(2026, 12, 25))
  expect(src).toContain(SANTA_RED)
  expect(src).not.toContain(PARTY_VIOLET)
})

test('chapéu: 01/01 o Clawd usa o chapéu de festa, com confete', { timeoutMs: 60000 }, async ($, on) => {
  const src = await hatOn($, on, noonOn(2027, 1, 1))
  expect(src).toContain(PARTY_VIOLET)
  expect(src).not.toContain(SANTA_RED)
})

test('chapéu: 31/12 também é chapéu de festa', { timeoutMs: 60000 }, async ($, on) => {
  expect(await hatOn($, on, noonOn(2026, 12, 31))).toContain(PARTY_VIOLET)
})

test('chapéu: CLAWD_BIRTHDAY no dia vira chapéu de festa', { timeoutMs: 60000 }, async ($, on) => {
  expect(await hatOn($, on, noonOn(2026, 10, 6), { env: { CLAWD_BIRTHDAY: '06-10' } })).toContain(PARTY_VIOLET)
})

test('chapéu: CLAWD_BIRTHDAY em outro dia, ou inválido, não põe chapéu', { timeoutMs: 60000 }, async ($, on) => {
  const src = await hatOn($, on, noonOn(2026, 10, 6), { env: { CLAWD_BIRTHDAY: '07-10' } })
  expect(src).not.toContain(PARTY_VIOLET)
  expect(src).not.toContain(SANTA_RED)
})

test('chapéu: CLAWD_BIRTHDAY inválido é ignorado', { timeoutMs: 60000 }, async ($, on) => {
  expect(await hatOn($, on, noonOn(2026, 10, 6), { env: { CLAWD_BIRTHDAY: '31-02' } })).not.toContain(PARTY_VIOLET)
})

test('chapéu: aniversário em 25/12 vale o chapéu de festa, não o gorro', { timeoutMs: 60000 }, async ($, on) => {
  const src = await hatOn($, on, noonOn(2026, 12, 25), { env: { CLAWD_BIRTHDAY: '25-12' } })
  expect(src).toContain(PARTY_VIOLET)
  expect(src).not.toContain(SANTA_RED)
})

test('chapéu: dia comum, nada na cabeça', { timeoutMs: 60000 }, async ($, on) => {
  const src = await hatOn($, on, noonOn(2026, 10, 6))
  expect(src).not.toContain(SANTA_RED)
  expect(src).not.toContain(PARTY_VIOLET)
})

test('chapéu: trabalhando no laptop o chapéu continua na cabeça', { timeoutMs: 60000 }, async ($, on) => {
  expect(await hatOn($, on, noonOn(2026, 12, 25), {}, true)).toContain(SANTA_RED)
})

test('chapéu: chovendo, o guarda-chuva vence e o chapéu some', { timeoutMs: 60000 }, async ($, on) => {
  // aqui o clima fica ligado: o mock responde com chuva
  const { clock } = world(on, { now: noonOn(2026, 12, 25) })
  await start($)
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(5_000)
  const src = String((await ui.find({ type: 'Svg' }))?.props.source)
  await ui.unmount()
  expect(src).toContain(UMBRELLA_RED)
  expect(src).not.toContain(SANTA_RED)
})

// ---------- ajudantes na chuva: cada mini-Clawd ganha o seu guarda-chuva ----------

async function helpersLane($: any, on: On, opts: WorldOptions, count: number) {
  const { clock } = world(on, opts)
  on('classic.SubagentStart', () => ({}))
  on('agent.list', () => ({ value: [] }))
  await start($)
  for (let i = 1; i <= count; i++) await $.classic.SubagentStart({ agent_id: `ajudante-${i}`, agent_type: 'general-purpose' })
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(3_000)
  const src = String((await ui.find({ type: 'Svg' }))?.props.source)
  await ui.unmount()
  return src
}

test('ajudantes na chuva: cada mini-Clawd usa um guarda-chuva pequeno', { timeoutMs: 60000 }, async ($, on) => {
  const src = await helpersLane($, on, {}, 2) // o clima do teste é chuva (código 63)
  expect(src.match(/class="mini-umbrella"/g)).toHaveLength(2)
  expect(src).toContain(UMBRELLA_RED)
})

test('ajudantes sem chuva: nenhum guarda-chuva nos minis', { timeoutMs: 60000 }, async ($, on) => {
  const src = await helpersLane($, on, { env: { CLAWD_WEATHER: 'off' } }, 2)
  expect(src).not.toContain('mini-umbrella')
  expect(src).not.toContain(UMBRELLA_RED)
})

test('chuva: garoa só abre o guarda-chuva com precipitação de verdade', async () => {
  expect(isRaining(55, 0.3)).toBe(false) // a leitura do centro de São Paulo em 06/10/2026, com o céu seco em Taboão
  expect(isRaining(55, 0.5)).toBe(true)
  expect(isRaining(61, 0)).toBe(true) // chuva fraca conta mesmo sem medida
  expect(isRaining(80, 0)).toBe(true) // pancada
  expect(isRaining(3, 0.2)).toBe(false) // nublado com um traço de precipitação não é chuva
  expect(isRaining(0, 0)).toBe(false)
})

// ---------- as fantasias dos ajudantes ----------

test('fantasias: os rótulos de verdade vestem a fantasia da tarefa', () => {
  const cases: [CostumeHints, Costume][] = [
    [{ label: 'mapear: faixa' }, 'detetive'],
    [{ label: 'desenhar: trilho' }, 'pintor'],
    [{ label: 'julgar: tecnica' }, 'juiz'],
    [{ label: 'implementar: testes' }, 'engenheiro'], // o verbo vem antes de "testes"
    [{ label: 'cético: verificação' }, 'pirata'], // o pirata é testado antes do piloto
    [{ label: 'verificar: limites' }, 'piloto'],
    [{ label: 'refutar: x' }, 'pirata'],
    [{ label: 'escrever: readme' }, 'chef'],
    [{ label: 'planejar: etapas' }, 'astronauta'],
    [{ label: 'faixa', type: 'Explore' }, 'detetive'], // sem rótulo útil, o tipo diz
    [{ label: 'faixa', type: 'Plan' }, 'astronauta'],
    [{ label: 'tarefa 7', type: 'general-purpose', firstTool: 'Read' }, 'detetive'], // nada casou: a 1ª ferramenta
    [{ label: 'tarefa 7', type: 'general-purpose', firstTool: 'WebFetch' }, 'detetive'],
    [{ label: 'tarefa 7', type: 'general-purpose', firstTool: 'NotebookEdit' }, 'engenheiro'],
    [{ label: 'corrigir cores' }, 'engenheiro'], // "cor" só casa inteira: "cores" não é pintura
    [{ label: 'trocar a cor do botão' }, 'pintor'],
    [{ label: 'gerar o artefato' }, ''], // "arte" não pega "artefato"
    [{ label: 'Review the diff' }, 'piloto'], // sem ':', a primeira palavra é o verbo
    [{ label: 'Fix failing tests' }, 'engenheiro'], // pelo texto todo seria piloto ("tests")
    [{ label: 'tarefa 7', type: 'general-purpose', firstTool: 'Bash' }, ''],
    [{}, ''],
  ]
  for (const [hints, want] of cases) expect(costumeFor(hints), JSON.stringify(hints)).toBe(want)
})

test('fantasias: rótulos reais dos workflows (o que o agente fazia de verdade, lido no prompt dele)', () => {
  const W = 'workflow-subagent'
  const cases: [CostumeHints, Costume][] = [
    [{ label: 'rota:auth', type: W }, 'engenheiro'], // implementa a rota de API
    [{ label: 'medir:backup', type: W }, 'detetive'], // mede o tamanho em disco, como o scan:
    [{ label: 'scan:toplevel', type: W }, 'detetive'],
    [{ label: 'comparar:1', type: W }, 'piloto'], // confere o bloco publicado contra a ficha
    [{ label: 'compartilhar: link', type: W }, ''], // "compara" não pega "compartilhar"
    [{ label: 'seo:onpage_seo', type: W, firstTool: 'WebFetch' }, 'detetive'], // "seo" é o assunto: é auditoria
    [{ label: 'critique:filesystem-safety', type: W }, 'pirata'],
    [{ label: 'critique:rollback-and-verification', type: W }, 'pirata'],
    [{ label: 'Run kanban pytest suites', type: 'general-purpose' }, 'piloto'],
    [{ label: 'Write LEIA-ME for touched areas', type: 'general-purpose', firstTool: 'Read' }, 'chef'],
    [{ label: 'Copy de anúncios Borracha Líquida', type: 'marketing-copywriter' }, 'chef'], // pelo nome do tipo
    [{ label: 'Forense de instalação do gstack', type: 'Explore' }, 'detetive'], // o tipo Explore vence o substantivo
    [{ label: 'Estrutura da Will Tintas para avaliar encaixe do gstack', type: 'Explore' }, 'detetive'],
    [{ label: 'Audit misplaced brand assets', type: 'Explore' }, 'piloto'], // o verbo continua na frente
    [{ label: 'sintese-guia', type: W }, 'chef'],
    [{ label: '4 correções na calculadora Shopify', type: 'general-purpose' }, 'engenheiro'],
    [{ label: 'ocultos:varredura-total', type: W }, 'detetive'],
    [{ label: 'inventario-do-setup', type: W }, 'detetive'],
    [{ label: 'documento-mente', type: W }, ''], // "documento" é o assunto (é um revisor), não "documentar"
    [{ label: 'documento-vs-codigo', type: W }, ''],
    [{ label: 'documentar: api', type: W }, 'chef'],
    [{ label: 'check:links', type: W }, 'piloto'],
    [{ label: 'Checklist de lançamento Meta Ads + Shopify', type: 'executive-assistant', firstTool: 'Read' }, 'chef'], // escreve o checklist
  ]
  for (const [hints, want] of cases) expect(costumeFor(hints), JSON.stringify(hints)).toBe(want)
})

test('fantasias: uma vez decidida, nunca troca; o vazio vira fantasia quando a pista chega', () => {
  expect(settleCostume('piloto', { label: 'implementar: x', firstTool: 'Edit' })).toBe('piloto')
  expect(settleCostume(undefined, { label: 'tarefa 7' })).toBe('')
  expect(settleCostume('', { label: 'tarefa 7', firstTool: 'Grep' })).toBe('detetive')
})

// Um SVG em árvore (só o que os desenhos usam: tags, atributos e filhos).
type SvgNode = { tag: string; attrs: Record<string, string>; kids: SvgNode[] }
function parseSvg(src: string): SvgNode {
  const root: SvgNode = { tag: 'root', attrs: {}, kids: [] }
  const stack: SvgNode[] = [root]
  for (const m of src.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    if (m[1]) {
      stack.pop()
      continue
    }
    const attrs: Record<string, string> = {}
    for (const a of (m[3] ?? '').matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1] ?? ''] = a[2] ?? ''
    const node: SvgNode = { tag: m[2] ?? '', attrs, kids: [] }
    stack[stack.length - 1]?.kids.push(node)
    if (!m[4]) stack.push(node)
  }
  return root
}

// Os deslocamentos possíveis de um nó: o transform fixo dele e cada valor das animações de translate.
function offsets(n: SvgNode): [number, number][] {
  const fixed = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(n.attrs.transform ?? '')
  const out: [number, number][] = [fixed ? [Number(fixed[1]), Number(fixed[2])] : [0, 0]]
  for (const k of n.kids) {
    if (k.tag !== 'animateTransform' || k.attrs.type !== 'translate') continue
    for (const v of (k.attrs.values ?? '').split(';')) {
      const [dx = '0', dy = '0'] = v.trim().split(/[ ,]+/)
      out.push([Number(dx), Number(dy)])
    }
  }
  return out
}

// Cada retângulo (ou célula de um <path>) com a caixa mais larga que ele pode ocupar, somando os
// deslocamentos de quem o contém. x1/y1 são a borda direita/de baixo (coluna L+13 = borda L+14).
function reach(root: SvgNode, skip: (n: SvgNode) => boolean) {
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = []
  const walk = (n: SvgNode, dx0: number, dx1: number, dy0: number, dy1: number) => {
    if (skip(n)) return
    const off = offsets(n)
    const ax0 = dx0 + Math.min(...off.map(o => o[0]))
    const ax1 = dx1 + Math.max(...off.map(o => o[0]))
    const ay0 = dy0 + Math.min(...off.map(o => o[1]))
    const ay1 = dy1 + Math.max(...off.map(o => o[1]))
    if (n.tag === 'rect') {
      const x = Number(n.attrs.x ?? 0)
      const y = Number(n.attrs.y ?? 0)
      boxes.push({ x0: x + ax0, x1: x + Number(n.attrs.width ?? 0) + ax1, y0: y + ay0, y1: y + Number(n.attrs.height ?? 0) + ay1 })
    }
    // células juntas num <path> (o dots() das fantasias e o compact() da baia): "Mx yhWvH..." cada uma
    if (n.tag === 'path')
      for (const c of (n.attrs.d ?? '').matchAll(/M(-?[\d.]+) (-?[\d.]+)h([\d.]+)v([\d.]+)/g)) {
        const x = Number(c[1])
        const y = Number(c[2])
        boxes.push({ x0: x + ax0, x1: x + Number(c[3]) + ax1, y0: y + ay0, y1: y + Number(c[4]) + ay1 })
      }
    for (const k of n.kids) walk(k, ax0, ax1, ay0, ay1)
  }
  walk(root, 0, 0, 0, 0)
  return boxes
}

const ALL_COSTUMES = ['', ...COSTUME_KINDS] as Costume[]

test('fantasias: na baia cada uma fica no lugar dela (x de L a L+13, nada acima da linha 9), contando as animações', () => {
  for (const costume of ALL_COSTUMES)
    for (const tone of [0, 1, 2])
      for (const i of [0, 5])
        for (const rain of [false, true]) {
          const L = -MINI_STEP * (i + 1)
          const where = `${costume || 'sem fantasia'}, tom ${tone}, lugar ${i}${rain ? ', chovendo' : ''}`
          // o guarda-chuva pequeno já existia e tem a ponta na linha 8: fica de fora da conta
          const boxes = reach(parseSvg(mini(L, i, { costume, tone }, rain)), n => n.attrs.class === 'mini-umbrella')
          expect(boxes.length, where).toBeGreaterThan(0)
          for (const b of boxes) {
            // as colunas L..L+13 são dele: o vizinho começa em L+14 (a borda direita da coluna L+13)
            expect(b.x0, where).toBeGreaterThanOrEqual(L)
            expect(b.x1, where).toBeLessThanOrEqual(L + 14)
            expect(b.y0, where).toBeGreaterThanOrEqual(9)
          }
        }
})

test('festa: a garra sobe ao lado da cabeça, sem o objeto, e o chapéu voa sem sair da baia', () => {
  for (const costume of ALL_COSTUMES)
    for (const ago of [0, 0.5, 1.2, 3]) {
      const L = -MINI_STEP * 3
      const svg = mini(L, 2, { costume, tone: 0 }, false, { ago, begin: -ago })
      const where = `${costume || 'sem fantasia'} aos ${ago} s`
      for (const b of reach(parseSvg(svg), () => false)) {
        expect(b.x0, where).toBeGreaterThanOrEqual(L)
        expect(b.x1, where).toBeLessThanOrEqual(L + 14) // até a coluna L+13, como trabalhando
        expect(b.y0, where).toBeGreaterThanOrEqual(5) // o chapéu sobe 3 linhas enquanto some
      }
      // a festa toca uma vez só, e nada digita
      expect(svg, where).not.toContain('indefinite')
      expect(svg, where).toContain('fill="freeze"')
    }
  // o objeto fica de fora: a frigideira do chef (#7a7f88) só aparece trabalhando
  expect(mini(-14, 0, { costume: 'chef', tone: 0 }, false)).toContain('#7a7f88')
  expect(mini(-14, 0, { costume: 'chef', tone: 0 }, false, { ago: 0.2, begin: -0.2 })).not.toContain('#7a7f88')
  // depois do voo o chapéu nem é desenhado (o primeiro quadro de uma imagem nova já vem sem ele)
  expect(mini(-14, 0, { costume: 'chef', tone: 0 }, false, { ago: 0.2, begin: -0.2 })).toContain('#eeeae0')
  expect(mini(-14, 0, { costume: 'chef', tone: 0 }, false, { ago: 1.2, begin: -1.2 })).not.toContain('#eeeae0')
})

const WALL = 1_700_000_123.456 // o relógio em segundos, como a faixa passa
const teamOfSize = (n: number, partyAgo: number | null = null): TeamMate[] =>
  Array.from({ length: n }, (_, k) => ({
    id: `ajudante-${k}`,
    costume: ALL_COSTUMES[(k + 1) % ALL_COSTUMES.length] ?? '',
    tone: k % 3,
    ...(k === 1 && partyAgo !== null ? { doneAt: (WALL - partyAgo) * 1000 } : {}),
  }))

test('baia: toda animação tem begin (≤ 0 depois da fase), a festa conta do começo dela, nada em % e o "+N" na linha 7', () => {
  for (const rain of [false, true]) {
    const team = teamOfSize(8, 0.3)
    const raw = helpersLayer(team, 6, BOX_W, BOX_H, CELL, 62, rain, WALL)
    const layer = phased(raw, WALL)
    const anims = layer.match(/<animate(Transform)?\b[^>]*>/g) ?? []
    expect(anims.length).toBeGreaterThan(0)
    expect((raw.match(/<animate(Transform)?\b[^>]*>/g) ?? []).every(a => a.includes('begin="'))).toBe(true)
    for (const a of anims) {
      const b = /\sbegin="(-?[\d.]+)s"/.exec(a)
      expect(b?.[1], a).toBeDefined()
      expect(Number(b?.[1]), a).toBeLessThanOrEqual(0)
      // a festa de quem terminou há 0,3 s está em 0,3 s, depois da fase do relógio
      if (a.includes('fill="freeze"')) expect(Math.abs(Number(b?.[1]) + 0.3), a).toBeLessThan(0.001)
    }
    expect(anims.some(a => a.includes('fill="freeze"'))).toBe(true)
    // só a moldura da baia se prende ao canto por %; nada dentro dela
    expect(layer.slice(layer.indexOf('>') + 1)).not.toContain('%')
    expect(layer).toContain('y="7" text-anchor="middle"')
    expect(layer).toContain('>+2</text>')
  }
})

// O passeio mais longo que o sorteio pode dar (o mesmo que wander, em scenes.ts, monta, sem sorteio:
// o Math.random do teste não se troca): sai do canto, vai ao começo da pista, volta, vai de novo e
// volta, com as paradas mais longas. É ele que deixa o SVG grande numa pista larga.
function farthestWander(travel: number): Spec {
  const walkTo = (p0: number, p1: number): Step => ({
    d: Math.max(0.4, (Math.abs(p1 - p0) * travel) / WALK_PX),
    p0,
    p1,
    pose: { eyes: 'open', motion: 'walk', look: Math.sign(p1 - p0) },
  })
  const loop = [stand(1, 5), walkTo(1, 0), stand(0, 5.5), walkTo(0, 1), stand(1, 5.5), walkTo(1, 0), stand(0, 5.5), walkTo(0, 1)]
  return { ...buildScene('idle', 1, true, travel, false), loop }
}

test('pior caso: seis fantasias, festa, chuva, noite, ultracode e fogos ficam abaixo do limite do app', () => {
  const crowd = teamOfSize(9, 0.4) // seis na baia (um em festa) e "+3"
  const lane = (team: TeamMate[]) => ({ team, cap: 6, fireworks: 0.5, shift: { dx: 14, ago: 0.2 }, reach: 3000 })
  // o passeio que a faixa dá com a baia cheia numa pista desta largura (como o ui.render calcula)
  const travelAt = (px: number) => px - PAD - (BOX_W + helpersZone(6)) * CELL
  for (const rain of [true, false]) {
    const flags: Flags = { tired: true, worried: true, morning: false, night: true, tool: 'edit', rain, ultra: true, hat: 'party' }
    // as cenas que não passeiam, na pista mais larga que existe
    for (const kind of ['work', 'party', 'oops', 'pass', 'sleep', 'compact', 'ask', 'pause'] as SceneKind[])
      for (const elapsed of [0, 3, 40]) {
        const svg = laneSvg(buildScene(kind, 0, true, LANE_W - PAD - BOX_W * CELL, false), elapsed, flags, 200, lane(crowd), WALL)
        expect(svg.length, kind).toBeLessThan(SVG_SAFE)
      }
    // o passeio mais longo numa pista de monitor QHD inteiro (2560 px): tudo ligado e ainda abaixo
    for (const elapsed of [0, 40, 200]) expect(laneSvg(farthestWander(travelAt(2560)), elapsed, flags, 200, lane(crowd), WALL).length).toBeLessThan(SVG_SAFE)
    // numa pista de 4000 px o passeio sozinho já passa de SVG_SAFE (é do Clawd grande, não da baia):
    // a reserva tira os fogos e depois as fantasias, e o SVG fica dentro do que o app aceita
    for (const elapsed of [0, 40, 200]) {
      const spec = farthestWander(travelAt(LANE_W))
      const fit = fitLane(spec, elapsed, flags, 200, lane(crowd), WALL)
      const plain = laneSvg(spec, elapsed, flags, 200, { ...lane(crowd.map(m => ({ ...m, costume: '' as const }))), fireworks: null }, WALL)
      expect(fit.length).toBeLessThanOrEqual(131_072) // o app recusa acima disso
      expect(fit.length).toBeLessThanOrEqual(plain.length) // nunca maior que com os minis sem fantasia
    }
  }
})

test('equipe: o que vem guardado é conferido (lixo vira baia vazia, campos estranhos viram o padrão)', () => {
  expect(teamOf(3)).toEqual([])
  expect(teamOf('x')).toEqual([])
  expect(teamOf([null, 4, { id: 7 }, { id: 'a', costume: 'bruxa', tone: 4.5 }, { id: 'b', costume: 'juiz', tone: 5, doneAt: 9 }])).toEqual([
    { id: 'a', costume: '', tone: 0 },
    { id: 'b', costume: 'juiz', tone: 2, doneAt: 9 },
  ])
  expect(crewOf('estragado')).toEqual({})
  expect(crewOf([1, 2])).toEqual({})
  expect(crewOf({ a: { costume: 'bruxa', tone: 1 }, b: { costume: 'juiz', tone: 4 }, c: { costume: 'chef' }, d: 7 })).toEqual({
    a: { costume: '', tone: 1 },
    b: { costume: 'juiz', tone: 1 },
  })
})

// O motor dos ajudantes no teste: o agent.spawn responde com um id novo; o resto só passa.
function crewWorld(on: On, opts: WorldOptions = {}) {
  const w = world(on, opts)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `ajudante-${++n}` }))
  on('classic.SubagentStart', () => ({}))
  on('agent.list', () => ({ value: [] }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } as never }))
  return w
}

const SPAWN = { tool_use_id: 'toolu_1', prompt: 'faça', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false }

// Um ajudante nasce (agent.spawn) e começa (SubagentStart), como o motor faz.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hire($: any, description: string, subagentType = 'general-purpose', agentIndex?: number): Promise<string> {
  const r = await $.agent.spawn({ ...SPAWN, description, subagentType, ...(agentIndex ? { workflow: { runId: 'wf_1', agentIndex } } : {}) })
  await $.classic.SubagentStart({ agent_id: r.agentId, agent_type: subagentType })
  return String(r.agentId)
}

// A baia dentro da pista inteira (o único <svg> preso a 100%), ou '' sem ajudantes.
const bayOf = (src: string) => {
  const i = src.indexOf('<svg x="100%"')
  return i < 0 ? '' : src.slice(i, src.indexOf('</svg>', i) + 6)
}

test('equipe: seis ajudantes começando no mesmo segundo viram uma gravação só', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = crewWorld(on, { env: { CLAWD_WEATHER: 'off' } })
  let writes = 0
  on('state.set', ($, e, next) => {
    if ((e as { key?: unknown }).key === 'team') writes++
    return next(e)
  })
  await start($)
  writes = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (let i = 1; i <= 6; i++) await ($ as any).classic.SubagentStart({ agent_id: `ajudante-${i}`, agent_type: 'general-purpose' })
  expect(writes).toBe(0) // os eventos só marcam; quem grava é o tique
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(5_000)
  expect(writes).toBe(1)
  const bay = bayOf(String((await ui.find({ type: 'Svg' }))?.props.source))
  expect(bay.match(/#c8c8c8/g)).toHaveLength(6) // seis laptops
  await ui.unmount()
})

test('fantasia: decidida uma vez e nunca troca; sem pista, a 1ª ferramenta decide; o recarregamento mantém', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = crewWorld(on, { env: { CLAWD_WEATHER: 'off' } })
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  const a = await hire($, 'verificar: limites', 'general-purpose', 4)
  const b = await hire($, 'tarefa 7', 'general-purpose', 6)
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(1_000)
  const look = async () => ((await report($)).equipe as { id: string; fantasia: string; tom: number }[]).map(m => [m.id, m.fantasia, m.tom])
  expect(await look()).toEqual([[a, 'piloto', 1], [b, '', 0]]) // o tom vem do número no workflow
  // pistas de outra fantasia não trocam a do piloto; o vazio vira detetive na 1ª ferramenta e para aí
  await t.tool.call({ tool: 'NotebookEdit', notebook_path: 'C:/x.ipynb', new_source: 'x', agentId: a })
  await t.tool.call({ tool: 'Grep', pattern: 'x', agentId: b })
  await t.tool.call({ tool: 'NotebookEdit', notebook_path: 'C:/x.ipynb', new_source: 'x', agentId: b })
  await clock.advance(1_000)
  expect(await look()).toEqual([[a, 'piloto', 1], [b, 'detetive', 0]])
  const bay = bayOf(String((await ui.find({ type: 'Svg' }))?.props.source))
  expect(bay).toContain('#8e929a') // o mastro da bandeira do piloto
  expect(bay).toContain('#6e4322') // a pala do boné do detetive
  await ui.unmount()
  // um recarregamento (o rótulo se perde) mantém as fantasias e os tons pelo atom 'crew'
  await start($)
  expect(await look()).toEqual([[a, 'piloto', 1], [b, 'detetive', 0]])
})

test('festa: quem termina bem comemora na baia e depois sai; com erro, sai na hora, sem festa', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = crewWorld(on, { env: { CLAWD_WEATHER: 'off' } })
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  const chef = await hire($, 'escrever: readme')
  const juiz = await hire($, 'julgar: tecnica')
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  const bay = async () => bayOf(String((await ui.find({ type: 'Svg' }))?.props.source))
  await clock.advance(1_000)
  expect(await bay()).toContain('#7a7f88') // a frigideira do chef, trabalhando
  expect(await bay()).toContain('#b07a45') // o martelo do juiz (o barrete muda de violeta com o tom)
  expect(await bay()).not.toContain('fill="freeze"')

  await t.turn.complete({ answer: 'pronto', durationMs: 5, isAborted: false, turnId: 'x', agentId: chef, reason: 'answer' })
  await t.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 'y', agentId: juiz, reason: 'error' })
  expect((await report($)).ajudantes).toEqual([])
  expect((await report($)).equipe).toEqual([{ id: chef, fantasia: 'chef', tom: 1, rotulo: 'escrever: readme', festa: true }])
  await clock.advance(1_000)
  const party = await bay()
  expect(party).toContain('fill="freeze"') // a festa toca uma vez só
  expect(party).toContain('#eeeae0') // a touca voando
  expect(party).not.toContain('#7a7f88') // sem o objeto
  expect(party).not.toContain('#b07a45') // o juiz saiu na hora
  expect(party.match(/#c8c8c8/g)).toHaveLength(1)
  // a festa começa do começo quando aparece
  for (const a of party.match(/<animate[^>]*fill="freeze"[^>]*>/g) ?? []) expect(Math.abs(Number(/begin="(-?[\d.]+)s"/.exec(a)?.[1]))).toBeLessThan(0.001)

  await clock.advance(1_000) // 1 s de festa: ainda na baia
  expect(await bay()).toContain('fill="freeze"')
  await clock.advance(PARTY_MS) // passou da festa: sai no tique seguinte
  expect(await bay()).toBe('')
  expect((await report($)).equipe).toEqual([])
  await ui.unmount()
})

test('equipe: um "helpers" numérico velho guardado não quebra nada (ninguém mais o lê)', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = crewWorld(on, { env: { CLAWD_WEATHER: 'off' } })
  // o que a versão antiga deixou guardado: o número de ajudantes
  const reads: string[] = []
  on('state.get', ($, e, next) => {
    const key = String((e as { key?: unknown }).key)
    reads.push(key)
    return key === 'helpers' ? { value: 4 as never, version: 1 } : next(e)
  })
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await start($)
  await clock.advance(1_000)
  expect(bayOf(String((await ui.find({ type: 'Svg' }))?.props.source))).toBe('') // o "4" não vira mini nenhum
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ($ as any).classic.SubagentStart({ agent_id: 'ajudante-1', agent_type: 'general-purpose' })
  await clock.advance(1_000)
  expect(bayOf(String((await ui.find({ type: 'Svg' }))?.props.source)).match(/#c8c8c8/g)).toHaveLength(1)
  expect(reads).not.toContain('helpers')
  await ui.unmount()
})

test('fantasia: o ToolSearch (só carrega ferramentas) não conta como a 1ª ferramenta', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = crewWorld(on, { env: { CLAWD_WEATHER: 'off' } })
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  const b = await hire($, 'tarefa 7', 'general-purpose', 6)
  await clock.advance(1_000)
  await t.tool.call({ tool: 'ToolSearch', query: 'select:StructuredOutput', max_results: 1, agentId: b })
  await t.tool.call({ tool: 'Read', file_path: 'C:/x.txt', agentId: b })
  await clock.advance(1_000)
  expect(((await report($)).equipe as { id: string; fantasia: string }[]).map(m => [m.id, m.fantasia])).toEqual([[b, 'detetive']])
})

test('equipe: recarregar logo depois do fim de ajudantes de workflow (antes do tique) não os ressuscita', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = crewWorld(on, { env: { CLAWD_WEATHER: 'off' } }) // os de workflow nunca aparecem na lista do motor
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  let ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await t.classic.SubagentStart({ agent_id: 'w1', agent_type: 'general-purpose' })
  await t.classic.SubagentStart({ agent_id: 'w2', agent_type: 'general-purpose' })
  await clock.advance(1_000)
  expect((await report($)).ajudantes).toEqual(['w1', 'w2'])
  await t.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 'x', agentId: 'w1', reason: 'error' })
  await t.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 'y', agentId: 'w2', reason: 'answer' })
  await ui.unmount()
  await start($) // o processo dos ganchos renasce (ou o mod recarrega) antes do próximo tique
  ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(5_000)
  expect((await report($)).ajudantes).toEqual([])
  expect(bayOf(String((await ui.find({ type: 'Svg' }))?.props.source))).toBe('')
  await ui.unmount()
})

test('ultracode: a sobra acaba com o último ajudante do turno ultracode, e só existe se ficou ajudante', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = crewWorld(on, { env: { CLAWD_WEATHER: 'off' } })
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await start($)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = $ as any
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  const fim = (agentId: string) => t.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 'h', agentId, reason: 'answer' })
  const ultracodeTurn = async (turnId: string) => {
    await t.turn.start({ text: 'ultracode: revisa o mod', turnId })
    await t.prompt.attachment({ type: 'workflow_keyword_request', text: 'ultracode', origin: { kind: 'engine' } })
  }
  // o turno ultracode termina com um ajudante trabalhando: a aura fica enquanto ele trabalha
  await ultracodeTurn('t1')
  await t.classic.SubagentStart({ agent_id: 'h1', agent_type: 'general-purpose' })
  await t.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(1_000)
  expect((await report($)).ultracode).toBe(true)
  // ele acaba e, no mesmo segundo (antes do tique), um turno comum chama outro ajudante: apaga
  await fim('h1')
  await t.turn.start({ text: 'oi', turnId: 't2' })
  await t.classic.SubagentStart({ agent_id: 'h2', agent_type: 'general-purpose' })
  await clock.advance(10_000)
  expect((await report($)).ultracode).toBe(false)
  await fim('h2')
  await t.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.advance(5_000)
  // um turno ultracode cujo ajudante acabou antes dele: nada sobra para o turno comum seguinte
  await ultracodeTurn('t3')
  await t.classic.SubagentStart({ agent_id: 'h3', agent_type: 'general-purpose' })
  await clock.advance(1_000)
  await fim('h3')
  await clock.advance(5_000)
  await t.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't3', reason: 'answer' })
  await clock.advance(5_000)
  await t.turn.start({ text: 'oi', turnId: 't4' })
  await t.classic.SubagentStart({ agent_id: 'h4', agent_type: 'general-purpose' })
  await clock.advance(5_000)
  const r = await report($)
  expect([r.ultracode, r.ultracode_motivos.sobra]).toEqual([false, false])
  await ui.unmount()
})

test('equipe: teammate com papel na lista do motor não entra na baia (só os ajudantes)', { timeoutMs: 60000 }, async ($, on) => {
  const { clock } = world(on, { env: { CLAWD_WEATHER: 'off' } })
  const rows = [
    { id: 'tm-1', teammateId: 'revisor@time', name: 'revisor', type: 'revisor', status: 'running', description: 'verificar: tudo' },
    { id: 'ag-1', type: 'general-purpose', status: 'running', description: 'verificar: limites' },
  ]
  on('agent.list', () => ({ value: rows as never }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } as never }))
  await start($)
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(3_000)
  expect(((await report($)).equipe as { id: string; fantasia: string }[]).map(m => [m.id, m.fantasia])).toEqual([['ag-1', 'piloto']])
  await ui.unmount()
})
