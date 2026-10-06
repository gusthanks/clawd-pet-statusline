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

declare module 'claude-code' {
  interface PluginState {
    clawd: {
      mood: ClawdMood
      status: StatusSpan[][]
      activity: Activity
      weather: Weather | null
      helpers: number
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
