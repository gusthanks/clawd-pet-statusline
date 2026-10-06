import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

const run = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

type WorldOptions = { sid?: () => string; settings?: () => Record<string, unknown>; store?: Record<string, unknown>; ownStore?: Map<string, unknown>; statusline?: string; env?: Record<string, string>; proc?: (argv: readonly string[]) => ReturnType<typeof run> }

// O teste faz o papel do motor: a sessão, a statusline, a configuração e a internet.
function world(on: On, opts: WorldOptions = {}) {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
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

// Os botões de desligar a internet: com "off" (ou 0, false) não sai nenhuma requisição.
for (const off of ['off', 'OFF', '0', 'false']) {
  test(`CLAWD_WEATHER=${off} e CLAWD_LIMITS=${off}: nenhuma requisição, sem clima e sem preocupação`, { timeout: 60000 }, async ($, on) => {
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

test('só CLAWD_WEATHER=off: os limites ainda são consultados, o clima não', { timeout: 60000 }, async ($, on) => {
  const { clock, fetches } = world(on, { env: { CLAWD_WEATHER: 'off' } })
  await start($)
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(60_000)
  await report($)
  expect(fetches.some(u => u.includes('anthropic'))).toBe(true)
  expect(fetches.some(u => u.includes('open-meteo') || u.includes('geojs') || u.includes('ipwho'))).toBe(false)
  await ui.unmount()
})

test('só CLAWD_LIMITS=off: o clima ainda é consultado, os limites não', { timeout: 60000 }, async ($, on) => {
  const { clock, fetches } = world(on, { env: { CLAWD_LIMITS: 'off' } })
  await start($)
  const ui = await $.ui.mount({ plugin: 'clawd', surface: 'desktop', ...band(false) })
  await clock.advance(60_000)
  await report($)
  expect(fetches.some(u => u.includes('open-meteo'))).toBe(true)
  expect(fetches.some(u => u.includes('anthropic'))).toBe(false)
  await ui.unmount()
})
