export type ClawdMood = 'idle' | 'party' | 'oops' | 'sleep' | 'pause'

// O que ele está fazendo no laptop, pelo tipo da última ferramenta: lendo, na web, editando.
export type Activity = '' | 'read' | 'web' | 'edit'

// Um pedaço de uma linha da statusline: o texto e o estilo que o terminal daria.
export type StatusSpan = { t: string; c?: string; b?: boolean; d?: boolean }

// O tempo agora, onde a pessoa estiver.
export type Weather = { emoji: string; temp: number; rain: boolean; at: number }

// A cena do Clawd guardada para um recarregamento continuar de onde parou.
export type SavedScene = { startedAt: number; spec: unknown }

// Linhas que eu acrescentei e tirei nesta conversa.
export type Lines = { added: number; removed: number }

// A fantasia de um ajudante (mini-Clawd), pela tarefa dele; '' é o mini sem fantasia.
export type Costume = '' | 'piloto' | 'pirata' | 'detetive' | 'astronauta' | 'engenheiro' | 'pintor' | 'chef' | 'juiz'

// Um ajudante na baia: quem é, a fantasia, o tom (0, 1 ou 2, pelo número dele) e, se terminou
// bem, quando a festa começou (ele comemora um instante e sai).
export type TeamMate = { id: string; costume: Costume; tone: number; doneAt?: number }

// A fantasia e o tom de cada ajudante rodando, guardados para um recarregamento não trocá-los.
export type Crew = Record<string, { costume: Costume; tone: number }>

// A barra de progresso (atom 'progress'): o que a faixa desenha, já decidido no tique.
//   k      a fonte: 'wf' (um workflow, 🧩), 'tasks' (a lista de tarefas, 📋) ou 'agents' (o lote de ajudantes, 🤖)
//   name   o nome do workflow, ou o activeForm da tarefa em andamento ('' sem nome)
//   phases os títulos das fases do workflow ([] sem fases conhecidas: a barra fica contínua)
//   at     o índice da fase atual, que só anda para a frente
//   fill   quanto da fase atual (ou da barra inteira, sem fases) está cheio, de 0 a 1
//   fills  quanto de CADA fase está cheio (fases sobrepostas: uma anterior só enche de vez quando
//          nenhum agente dela roda mais); ausente num valor guardado por versão antiga
//   done   quantos terminaram (o número com ✓; na lista de tarefas, as feitas)
//   all    o total da lista de tarefas (só em 'tasks'; nas outras é 0 e não aparece)
//   end    '' rodando, 'ok' terminou bem, 'fail' falhou ou foi parado
//   more   quantas outras execuções de workflow rodam ao mesmo tempo (o "+1")
export type Progress = {
  k: 'wf' | 'tasks' | 'agents'
  name: string
  phases: string[]
  at: number
  fill: number
  fills?: number[]
  done: number
  all: number
  end: '' | 'ok' | 'fail'
  more: number
}

// Um agente de um workflow: o rótulo, a fase (o índice; -1 ainda não se sabe) e se terminou (bem ou
// não). old: é de um lançamento anterior do mesmo runId (numa retomada não conta no preenchimento).
export type SavedRunAgent = { label: string; phase: number; done: boolean; ok: boolean; old?: boolean }

// Uma execução de workflow em andamento, guardada para um recarregamento continuar a mesma barra.
export type SavedRun = {
  runId: string
  taskId: string
  name: string
  phases: string[]
  known: boolean
  dir: string
  script: string
  at: number
  fill: number
  fills?: number[]
  done: number
  startedAt: number
  lastAt: number
  launchAt: number
  launched: number
  // o mtime do arquivo final quando o lançamento de agora começou (-1: não existia; null: falta conferir)
  seen?: number | null
  agents: Record<string, SavedRunAgent>
}

declare module 'claude-code' {
  interface PluginState {
    clawd: {
      mood: ClawdMood
      status: StatusSpan[][]
      activity: Activity
      weather: Weather | null
      team: TeamMate[]
      crew: Crew
      fireworks: boolean
      ultra: boolean
      lines: Lines
      scene: SavedScene | null
      running: Record<string, string>
      progress: Progress | null
      runs: SavedRun[]
      compacting: boolean
      asking: boolean
      reaction: '' | 'pass' | 'oops'
      taps: number
    }
  }
}
