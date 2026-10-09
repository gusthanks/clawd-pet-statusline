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
      compacting: boolean
      asking: boolean
      reaction: '' | 'pass' | 'oops'
      taps: number
    }
  }
}
