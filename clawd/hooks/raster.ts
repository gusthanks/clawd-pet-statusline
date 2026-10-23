// A pista no terminal: o MESMO SVG animado do desktop (lane.ts), lido aqui e desenhado
// quadro a quadro em células de terminal. Tudo é conta pura (sem $): o register.tsx
// guarda o desenho lido, chama `frameAt` a cada tique e manda as células com $.ui.blit.
//
// Só entende o pedaço de SVG que os desenhos deste projeto usam: <svg>, <g>, <use>, <rect>,
// <path> (M L H V A Z), <polygon>, <ellipse> e <text>, com transform translate/scale, opacity,
// visibility e as animações <animate>/<animateTransform> (discrete, linear e spline, que aqui
// vira linear). Gradiente vira a cor mais forte dele; máscara é ignorada.
//
// A grade: 1 ponto = 1 célula do desenho (CELL px); 1 pixel do Clawd = 2 x 2 pontos; uma célula
// de terminal = 1 pixel de largura e 2 de altura, com meio bloco (▀ ▄ █): o Clawd de 34 x 23
// pontos vira 17 colunas x 6 linhas.

type Anim = {
  attr: string
  kind: string // o type do animateTransform: translate ou scale
  values: string[]
  keyTimes: number[] | null
  dur: number
  begin: number
  forever: boolean
  freeze: boolean
  discrete: boolean
  order: number
}
type Node = { tag: string; a: Record<string, string>; kids: Node[]; anims: Anim[]; text: string }
export type Doc = { root: Node; ids: Map<string, Node> }

// ---------- a leitura ----------

const ATTR = /([\w:-]+)="([^"]*)"/g

function attrsOf(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of src.matchAll(ATTR)) out[m[1]] = m[2]
  return out
}

const secs = (v: string | undefined) => {
  const n = parseFloat(v ?? '')
  return Number.isFinite(n) ? n : 0
}

function animOf(tag: string, a: Record<string, string>, order: number): Anim | null {
  const values = (a.values ?? `${a.from ?? ''};${a.to ?? ''}`).split(';').map(s => s.trim())
  const dur = secs(a.dur)
  if (!a.attributeName || dur <= 0 || values.length === 0) return null
  const kt = a.keyTimes ? a.keyTimes.split(';').map(Number) : null
  return {
    attr: a.attributeName,
    kind: tag === 'animateTransform' ? (a.type ?? 'translate') : '',
    values,
    keyTimes: kt && kt.length === values.length && kt.every(Number.isFinite) ? kt : null,
    dur,
    begin: secs(a.begin),
    forever: a.repeatCount === 'indefinite',
    freeze: a.fill === 'freeze',
    discrete: a.calcMode === 'discrete' || a.attributeName === 'visibility',
    order,
  }
}

export function parseSvg(src: string): Doc {
  const root: Node = { tag: '#root', a: {}, kids: [], anims: [], text: '' }
  const ids = new Map<string, Node>()
  const stack: Node[] = [root]
  let order = 0
  const re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g
  for (const m of src.matchAll(re)) {
    const top = stack[stack.length - 1]
    if (m[5] !== undefined) {
      top.text += m[5]
      continue
    }
    const [, close, tag, rest, self] = m
    if (close) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const a = attrsOf(rest)
    if (tag === 'animate' || tag === 'animateTransform') {
      const anim = animOf(tag, a, order++)
      if (anim) top.anims.push(anim)
      continue
    }
    const node: Node = { tag, a, kids: [], anims: [], text: '' }
    top.kids.push(node)
    if (a.id) ids.set(a.id, node)
    if (!self) stack.push(node)
  }
  return { root, ids }
}

// ---------- as animações num instante ----------

const nums = (v: string) => v.split(/[\s,]+/).filter(Boolean).map(Number)

// O valor de uma animação `t` segundos depois do começo do desenho; null quando ela não vale agora.
function sample(an: Anim, t: number): { v: string; begin: number; order: number } | null {
  const local = t - an.begin
  if (local < 0) return null
  let f: number
  if (an.forever) f = (local % an.dur) / an.dur
  else if (local >= an.dur) {
    if (!an.freeze) return null
    f = 1
  } else f = local / an.dur
  const n = an.values.length
  const out = (v: string) => ({ v, begin: an.begin, order: an.order })
  if (n === 1) return out(an.values[0])
  if (an.discrete) {
    const kt = an.keyTimes ?? an.values.map((_, i) => i / n)
    let i = 0
    while (i + 1 < n && kt[i + 1] <= f) i++
    return out(an.values[i])
  }
  const kt = an.keyTimes ?? an.values.map((_, i) => i / (n - 1))
  let i = 0
  while (i + 2 < n && kt[i + 1] <= f) i++
  const span = kt[i + 1] - kt[i]
  const k = span > 0 ? Math.min(1, Math.max(0, (f - kt[i]) / span)) : 1
  const a = nums(an.values[i])
  const b = nums(an.values[i + 1])
  if (a.some(Number.isNaN) || b.some(Number.isNaN) || a.length !== b.length) return out(an.values[k < 1 ? i : i + 1])
  return out(a.map((x, j) => x + (b[j] - x) * k).join(' '))
}

// O valor de um atributo agora: a animação que começou por último ganha (como no SVG), senão o atributo.
function attrAt(node: Node, name: string, t: number): string | undefined {
  let best: { v: string; begin: number; order: number } | null = null
  for (const an of node.anims) {
    if (an.attr !== name || an.kind) continue
    const s = sample(an, t)
    if (s && (!best || s.begin > best.begin || (s.begin === best.begin && s.order > best.order))) best = s
  }
  return best ? best.v : node.a[name]
}

// ---------- geometria ----------

type M = [number, number, number, number, number, number] // a b c d e f
const ID: M = [1, 0, 0, 1, 0, 0]
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const translate = (x: number, y: number): M => [1, 0, 0, 1, x, y]
const scale = (x: number, y: number): M => [x, 0, 0, y, 0, 0]
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

function parseTransform(src: string | undefined): M {
  let m = ID
  if (!src) return m
  for (const [, fn, args] of src.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = nums(args)
    if (fn === 'translate') m = mul(m, translate(v[0] ?? 0, v[1] ?? 0))
    else if (fn === 'scale') m = mul(m, scale(v[0] ?? 1, v[1] ?? v[0] ?? 1))
  }
  return m
}

function transformAt(node: Node, t: number): M {
  let best: { v: string; begin: number; order: number; kind: string } | null = null
  for (const an of node.anims) {
    if (!an.kind || an.attr !== 'transform') continue
    const s = sample(an, t)
    if (s && (!best || s.begin > best.begin || (s.begin === best.begin && s.order > best.order))) best = { ...s, kind: an.kind }
  }
  if (!best) return parseTransform(node.a.transform)
  const v = nums(best.v)
  return best.kind === 'scale' ? scale(v[0] ?? 1, v[1] ?? v[0] ?? 1) : translate(v[0] ?? 0, v[1] ?? 0)
}

// Um comprimento: número, ou % do lado da janela de agora.
const len = (v: string | undefined, side: number, fallback = 0) => {
  if (v === undefined || v === '') return fallback
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return fallback
  return v.trim().endsWith('%') ? (n / 100) * side : n
}

// O arco do <path> (A) em pedaços de reta, pela conversão do próprio SVG (ponta a ponta para centro).
function arc(x1: number, y1: number, rx: number, ry: number, large: boolean, sweep: boolean, x2: number, y2: number): [number, number][] {
  if (rx === 0 || ry === 0) return [[x2, y2]]
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const lam = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
  if (lam > 1) {
    rx *= Math.sqrt(lam)
    ry *= Math.sqrt(lam)
  }
  const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx
  const den = rx * rx * dy * dy + ry * ry * dx * dx
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cx = co * ((rx * dy) / ry) + (x1 + x2) / 2
  const cy = co * (-(ry * dx) / rx) + (y1 + y2) / 2
  const a0 = Math.atan2((y1 - cy) / ry, (x1 - cx) / rx)
  let da = Math.atan2((y2 - cy) / ry, (x2 - cx) / rx) - a0
  if (sweep && da < 0) da += Math.PI * 2
  if (!sweep && da > 0) da -= Math.PI * 2
  const steps = Math.max(4, Math.ceil(Math.abs(da) / (Math.PI / 12)))
  const pts: [number, number][] = []
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (da * i) / steps
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  return pts
}

function pathPolys(d: string): [number, number][][] {
  const polys: [number, number][][] = []
  let cur: [number, number][] = []
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? []
  let i = 0
  let cmd = ''
  const num = () => Number(toks[i++])
  const flush = () => {
    if (cur.length > 2) polys.push(cur)
    cur = []
  }
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase()
    switch (cmd.toUpperCase()) {
      case 'M': {
        flush()
        x = num() + (rel ? x : 0)
        y = num() + (rel ? y : 0)
        sx = x
        sy = y
        cur.push([x, y])
        cmd = rel ? 'l' : 'L' // pares seguintes são retas
        break
      }
      case 'L':
        x = num() + (rel ? x : 0)
        y = num() + (rel ? y : 0)
        cur.push([x, y])
        break
      case 'H':
        x = num() + (rel ? x : 0)
        cur.push([x, y])
        break
      case 'V':
        y = num() + (rel ? y : 0)
        cur.push([x, y])
        break
      case 'A': {
        const rx = num()
        const ry = num()
        num() // rotação: os desenhos daqui não usam
        const large = num() !== 0
        const sweep = num() !== 0
        const nx = num() + (rel ? x : 0)
        const ny = num() + (rel ? y : 0)
        cur.push(...arc(x, y, rx, ry, large, sweep, nx, ny))
        x = nx
        y = ny
        break
      }
      case 'Z':
        flush()
        x = sx
        y = sy
        break
      default:
        i++ // comando que não entendemos: pula
    }
  }
  flush()
  return polys
}

// ---------- a tela de pontos ----------

export type Grid = { w: number; h: number; unit: number }
type Canvas = Grid & { color: Int32Array; layer: Int32Array; texts: TextMark[]; layers: number }
type TextMark = { x: number; y: number; size: number; anchor: string; text: string; color: number }

const NONE = -1

function hex(v: string | undefined): number | null {
  if (!v) return null
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]
  return parseInt(h, 16)
}

const mix = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * k + ((b >> s) & 255) * (1 - k))
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// A cor de um fill: #rgb, #rrggbb ou url(#gradiente) (a parada mais forte dele).
function paintOf(doc: Doc, fill: string | undefined): { color: number; alpha: number } | null {
  if (fill === undefined) return { color: 0, alpha: 1 }
  const u = /^url\(#([^)]+)\)$/.exec(fill.trim())
  if (u) {
    const g = doc.ids.get(u[1])
    let best: { color: number; alpha: number } | null = null
    for (const s of g?.kids ?? []) {
      const c = hex(s.a['stop-color'])
      const a = s.a['stop-opacity'] === undefined ? 1 : Number(s.a['stop-opacity'])
      if (c !== null && (!best || a > best.alpha)) best = { color: c, alpha: a }
    }
    return best
  }
  const c = hex(fill)
  return c === null ? null : { color: c, alpha: 1 }
}

function plot(cv: Canvas, i: number, color: number, alpha: number) {
  const under = cv.color[i]
  if (under === NONE) {
    if (alpha < 0.5) return // transparente demais sobre o fundo do terminal: não aparece
    cv.color[i] = color
  } else cv.color[i] = alpha >= 0.999 ? color : mix(color, under, alpha)
  cv.layer[i] = cv.layers
}

// Pinta os pontos cujo centro cai dentro dos polígonos (par-ímpar), em px do desenho.
function fillPolys(cv: Canvas, polys: [number, number][][], color: number, alpha: number) {
  if (alpha <= 0) return
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of polys)
    for (const [x, y] of p) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  const u = cv.unit
  const gx0 = Math.max(0, Math.floor(x0 / u - 0.5))
  const gx1 = Math.min(cv.w - 1, Math.ceil(x1 / u - 0.5))
  const gy0 = Math.max(0, Math.floor(y0 / u - 0.5))
  const gy1 = Math.min(cv.h - 1, Math.ceil(y1 / u - 0.5))
  if (gx0 > gx1 || gy0 > gy1) return
  cv.layers++
  for (let gy = gy0; gy <= gy1; gy++) {
    const py = (gy + 0.5) * u
    // os cruzamentos desta linha com as bordas, como num preenchimento por varredura
    const xs: number[] = []
    for (const p of polys)
      for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
        const [ax, ay] = p[j]
        const [bx, by] = p[k]
        if (ay > py !== by > py) xs.push(ax + ((py - ay) * (bx - ax)) / (by - ay))
      }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(gx0, Math.ceil(xs[k] / u - 0.5))
      const to = Math.min(gx1, Math.ceil(xs[k + 1] / u - 0.5) - 1)
      for (let gx = from; gx <= to; gx++) plot(cv, gy * cv.w + gx, color, alpha)
    }
  }
}

const box = (m: M, x: number, y: number, w: number, h: number): [number, number][] => [apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h)]

type Ctx = { m: M; vw: number; vh: number; opacity: number; visible: boolean; fill: string | undefined }

function draw(doc: Doc, cv: Canvas, node: Node, ctx: Ctx, t: number) {
  const tag = node.tag
  if (tag === 'defs' || tag === 'mask' || tag === 'linearGradient' || tag === 'radialGradient' || tag === 'stop') return
  const vis = attrAt(node, 'visibility', t)
  const visible = vis === 'hidden' ? false : vis === 'visible' ? true : ctx.visible
  const op = attrAt(node, 'opacity', t)
  const opacity = ctx.opacity * (op === undefined ? 1 : Math.max(0, Math.min(1, Number(op))))
  if (opacity <= 0.02) return // invisível por inteiro, filhos também (opacity não é herdada para cima)
  const fill = node.a.fill ?? ctx.fill
  let m = mul(ctx.m, transformAt(node, t))
  let vw = ctx.vw
  let vh = ctx.vh
  if (tag === 'svg') {
    const x = len(attrAt(node, 'x', t), vw)
    const y = len(attrAt(node, 'y', t), vh)
    const w = len(node.a.width, vw, vw)
    const h = len(node.a.height, vh, vh)
    m = mul(m, translate(x, y))
    const vb = node.a.viewBox ? nums(node.a.viewBox) : null
    if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      const s = Math.min(w / vb[2], h / vb[3])
      m = mul(m, mul(scale(s, s), translate(-vb[0], -vb[1])))
      vw = vb[2]
      vh = vb[3]
    } else {
      vw = w
      vh = h
    }
  }
  const here: Ctx = { m, vw, vh, opacity, visible, fill }
  if (tag === 'use') {
    const ref = doc.ids.get((node.a.href ?? node.a['xlink:href'] ?? '').replace(/^#/, ''))
    if (!ref) return
    const at = mul(m, translate(len(attrAt(node, 'x', t), vw), len(attrAt(node, 'y', t), vh)))
    draw(doc, cv, { ...ref, tag: ref.tag === 'symbol' ? 'g' : ref.tag }, { ...here, m: at }, t)
    return
  }
  if (visible && fill !== 'none') {
    const paint = tag === 'rect' || tag === 'path' || tag === 'polygon' || tag === 'ellipse' || tag === 'text' ? paintOf(doc, fill) : null
    const fo = node.a['fill-opacity'] === undefined ? 1 : Number(node.a['fill-opacity'])
    const alpha = (paint?.alpha ?? 0) * opacity * fo
    if (paint && tag === 'rect') {
      const w = len(attrAt(node, 'width', t), vw)
      const h = len(attrAt(node, 'height', t), vh)
      if (w > 0 && h > 0) fillPolys(cv, [box(m, len(attrAt(node, 'x', t), vw), len(attrAt(node, 'y', t), vh), w, h)], paint.color, alpha)
    } else if (paint && tag === 'path') {
      fillPolys(cv, pathPolys(node.a.d ?? '').map(p => p.map(([x, y]) => apply(m, x, y))), paint.color, alpha)
    } else if (paint && tag === 'polygon') {
      const v = nums(node.a.points ?? '')
      const p: [number, number][] = []
      for (let k = 0; k + 1 < v.length; k += 2) p.push(apply(m, v[k], v[k + 1]))
      if (p.length > 2) fillPolys(cv, [p], paint.color, alpha)
    } else if (paint && tag === 'ellipse') {
      const cx = len(node.a.cx, vw)
      const cy = len(node.a.cy, vh)
      const rx = len(node.a.rx, vw)
      const ry = len(node.a.ry, vh)
      const p: [number, number][] = []
      for (let k = 0; k < 24; k++) p.push(apply(m, cx + rx * Math.cos((k / 24) * Math.PI * 2), cy + ry * Math.sin((k / 24) * Math.PI * 2)))
      fillPolys(cv, [p], paint.color, alpha)
    } else if (paint && tag === 'text' && alpha >= 0.35) {
      const [x, y] = apply(m, len(attrAt(node, 'x', t), vw), len(attrAt(node, 'y', t), vh))
      const size = parseFloat(node.a['font-size'] ?? '4') * Math.abs(m[3])
      const text = node.text.trim()
      if (text) cv.texts.push({ x, y, size, anchor: node.a['text-anchor'] ?? 'start', text, color: paint.color })
    }
  }
  for (const kid of node.kids) draw(doc, cv, kid, here, t)
}

// ---------- de pontos para células ----------

const DEFAULT = 0x01000000

// A cor de um pixel (2 x 2 pontos): a camada mais de cima que cobre pelo menos 2 deles; senão,
// qualquer ponto pintado (um confete de 1 ponto vira um pixel inteiro, em vez de sumir).
// Um traço fino (só a metade de cima ou a de baixo, como o olho fechado) sobre outra cor sai
// misturado com ela: senão o olho fechado ficaria igual ao aberto.
function pixel(cv: Canvas, gx: number, gy: number): number {
  const at = (k: number) => {
    const x = gx + (k & 1)
    const y = gy + (k >> 1)
    return x < cv.w && y < cv.h ? y * cv.w + x : -1
  }
  let best = NONE
  let bestLayer = -1
  let bestMask = 0
  let lone = NONE
  let loneLayer = -1
  for (let k = 0; k < 4; k++) {
    const i = at(k)
    if (i < 0) continue
    const c = cv.color[i]
    if (c === NONE) continue
    let mask = 0
    for (let q = 0; q < 4; q++) {
      const j = at(q)
      if (j >= 0 && cv.color[j] === c) mask |= 1 << q
    }
    const layer = cv.layer[i]
    if ((mask & (mask - 1)) !== 0 && layer > bestLayer) {
      best = c
      bestLayer = layer
      bestMask = mask
    }
    if (layer > loneLayer) {
      lone = c
      loneLayer = layer
    }
  }
  if (best === NONE) return lone
  if (bestMask === 0b0011 || bestMask === 0b1100) {
    const rest = cv.color[at(bestMask === 0b0011 ? 2 : 0)]
    if (rest !== NONE && rest === cv.color[at(bestMask === 0b0011 ? 3 : 1)]) return mix(best, rest, 0.5)
  }
  return best
}

// Quantos pixels saem "misturados" (pontos de cores diferentes) com a grade deslocada assim.
function blur(cv: Canvas, ox: number, oy: number, cols: number, prows: number): number {
  let n = 0
  for (let py = 0; py < prows; py++)
    for (let px = 0; px < cols; px++) {
      const gx = 2 * px + ox
      const gy = 2 * py + oy
      const a = cv.color[gy * cv.w + gx]
      if (cv.color[gy * cv.w + gx + 1] !== a || cv.color[(gy + 1) * cv.w + gx] !== a || cv.color[(gy + 1) * cv.w + gx + 1] !== a) n++
    }
  return n
}

function encode(words: Uint32Array): string {
  const bytes = new Uint8Array(words.buffer, words.byteOffset, words.byteLength)
  const toB64 = (bytes as unknown as { toBase64?: () => string }).toBase64
  if (typeof toB64 === 'function') return toB64.call(bytes)
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + (i + 1 < bytes.length ? abc[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? abc[n & 63] : '=')
  }
  return out
}

// Uma célula pode levar o caractere de um <text> (o "z" do sono, o "?" do balão, o "pausa?").
const printable = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  return cp >= 0x20 && cp <= 0xffff && cp !== 0x7f && !(cp >= 0x300 && cp < 0x370)
}

// O desenho `t` segundos depois de lido, em `cols` x `rows` células de terminal (RasterProps.cells).
// `unit` é o tamanho de um ponto em px do desenho (CELL); a janela do desenho mede cols*2 x rows*4 pontos.
export function frameAt(doc: Doc, t: number, cols: number, rows: number, unit: number): string {
  const prows = rows * 2
  const w = cols * 2 + 1 // um ponto a mais em cada lado: a grade dos pixels pode andar meio pixel
  const h = prows * 2 + 1
  const cv: Canvas = { w, h, unit, color: new Int32Array(w * h).fill(NONE), layer: new Int32Array(w * h), texts: [], layers: 0 }
  draw(doc, cv, doc.root, { m: ID, vw: cols * 2 * unit, vh: prows * 2 * unit, opacity: 1, visible: true, fill: undefined }, t)
  // a grade dos pixels vai junto com o desenho que mais aparece (o Clawd andando cai em meio pixel)
  let ox = 0
  let oy = 0
  let least = Infinity
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const b = blur(cv, x, y, cols, prows)
    if (b < least) {
      least = b
      ox = x
      oy = y
    }
  }
  const px = new Int32Array(cols * prows)
  for (let y = 0; y < prows; y++) for (let x = 0; x < cols; x++) px[y * cols + x] = pixel(cv, 2 * x + ox, 2 * y + oy)
  const words = new Uint32Array(cols * rows * 3)
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const top = px[2 * r * cols + c]
      const bot = px[(2 * r + 1) * cols + c]
      const i = (r * cols + c) * 3
      if (top === NONE && bot === NONE) words.set([0x20, DEFAULT, DEFAULT], i)
      else if (bot === NONE) words.set([0x2580, top, DEFAULT], i) // ▀
      else if (top === NONE) words.set([0x2584, bot, DEFAULT], i) // ▄
      else if (top === bot) words.set([0x2588, top, DEFAULT], i) // █
      else words.set([0x2580, top, bot], i)
    }
  // os textos por cima, cada letra numa célula (a cor de fundo é a do que estava ali)
  const colPx = 2 * unit
  const rowPx = 4 * unit
  for (const tx of cv.texts) {
    const chars = [...tx.text]
    const start = tx.anchor === 'middle' ? tx.x / colPx - chars.length / 2 : tx.anchor === 'end' ? tx.x / colPx - chars.length : tx.x / colPx
    const r = Math.floor((tx.y - tx.size * 0.35) / rowPx)
    if (r < 0 || r >= rows) continue
    chars.forEach((ch, k) => {
      const c = Math.round(start + k)
      if (c < 0 || c >= cols || !printable(ch)) return
      const i = (r * cols + c) * 3
      const under = px[2 * r * cols + c] !== NONE ? px[2 * r * cols + c] : px[(2 * r + 1) * cols + c]
      words.set([ch.codePointAt(0)!, tx.color, under === NONE ? DEFAULT : under], i)
    })
  }
  return encode(words)
}
