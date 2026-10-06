import type { StatusSpan } from '../types'

// ---------- a statusline: as cores do terminal (ANSI) e o nome do modelo ----------

// Rodar a statusline e guardar as linhas fica no register.tsx (usa o $); aqui é só tradução.

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
export function parseAnsi(text: string): StatusSpan[][] {
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
export function prettyModel(raw: string, window: number): string {
  if (/\s/.test(raw.trim())) return raw.trim()
  const m = /^(?:claude-)?(opus|sonnet|haiku|fable)(?:-(\d+))?(?:-(\d{1,2}))?(?:-\d+)?(\[1m\])?$/i.exec(raw.trim())
  if (!m) return raw
  const name = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  const version = m[2] ? ` ${m[2]}${m[3] ? `.${m[3]}` : ''}` : ''
  const big = m[4] || window >= 1_000_000 ? ' (1M context)' : ''
  return `${name}${version}${big}`
}
