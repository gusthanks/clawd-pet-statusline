// Renders the terminal lane OUTSIDE Claude Code: reads the lane SVGs in docs/sheet (the same
// ones the desktop draws), runs them through raster.ts exactly like the terminal band does,
// and paints the resulting cells into a PNG (each cell = 8 x 16 px, top and bottom halves),
// so a change to the terminal drawing can be checked without reloading the installed mod.
//
//   node tools/term-preview.ts [scene ...] [--t 0,1.5,3] [--rows 7] [--out /tmp/term]
//
// Needs Node with type stripping (22.6+) and ImageMagick (`magick`) for the PNG.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSvg, frameAt } from '../clawd/hooks/raster.ts'

const here = dirname(fileURLToPath(import.meta.url))
const sheet = join(here, '..', 'docs', 'sheet')
const CELL = 2.25 // lane.ts CELL
const DEFAULT = 0x01000000
const BG = 0x1f1f28
const CW = 8
const CH = 16

const args = process.argv.slice(2)
const opt = (name: string, def: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : def
}
const times = opt('--t', '0,1.5,3').split(',').map(Number)
const rows = Number(opt('--rows', '7'))
const out = opt('--out', join(process.env.XDG_RUNTIME_DIR ?? '/tmp', 'clawd-term'))
const scenes = args.length ? args : readdirSync(sheet).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4))
mkdirSync(out, { recursive: true })

function decode(b64: string): Uint32Array {
  const bytes = Buffer.from(b64, 'base64')
  return new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
}

function ppm(words: Uint32Array, cols: number, rows: number): Buffer {
  const W = cols * CW
  const H = rows * CH
  const img = Buffer.alloc(W * H * 3)
  const put = (x: number, y: number, c: number) => {
    const i = (y * W + x) * 3
    img[i] = (c >> 16) & 255
    img[i + 1] = (c >> 8) & 255
    img[i + 2] = c & 255
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const k = (r * cols + c) * 3
      const ch = words[k]
      const fg = words[k + 1] === DEFAULT ? BG : words[k + 1]
      const bg = words[k + 2] === DEFAULT ? BG : words[k + 2]
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CW; x++) {
          let col = BG
          if (ch === 0x2588) col = fg
          else if (ch === 0x2580) col = y < CH / 2 ? fg : bg
          else if (ch === 0x2584) col = y >= CH / 2 ? fg : bg
          else if (ch !== 0x20) col = x > 1 && x < CW - 2 && y > 3 && y < CH - 3 ? fg : bg // a text glyph
          put(c * CW + x, r * CH + y, col)
        }
    }
  return Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), img])
}

for (const name of scenes) {
  const svg = readFileSync(join(sheet, `${name}.svg`), 'utf8')
  const w = Number(/<svg[^>]*\bwidth="([\d.]+)"/.exec(svg)?.[1] ?? 560)
  const cols = Math.floor(w / (2 * CELL))
  const doc = parseSvg(svg)
  const files: string[] = []
  let ms = 0
  for (const t of times) {
    const t0 = performance.now()
    const cells = frameAt(doc, t, cols, rows, CELL)
    ms += performance.now() - t0
    const f = join(out, `${name}-${t}.ppm`)
    writeFileSync(f, ppm(decode(cells), cols, rows))
    files.push(f)
  }
  const png = join(out, `${name}.png`)
  execFileSync('magick', [...files, '-background', '#444', '-splice', '0x4', '-append', png])
  console.log(`${png}  ${cols}x${rows} cells, ${(ms / times.length).toFixed(1)} ms/frame`)
}
