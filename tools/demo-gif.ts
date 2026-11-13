// Redraws the Clawd lane inside docs/demo.gif from the current code, keeping everything else.
//
// The GIF is a made-up dark terminal window (title bar with a caption per scene, prompt and
// statusline). Only the band where Clawd lives changes when the drawings change, so this script
// takes each frame of the existing GIF, repaints that band with raster.ts (exactly like the
// terminal band does) from the scene SVGs in docs/sheet, and writes the GIF back.
//
//   node tools/demo-gif.ts [--in docs/demo.gif] [--out docs/demo.gif]
//
// Run tools/make-sheet.py first if the drawings changed. Needs Node 22.6+ and ImageMagick.
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseSvg, frameAt } from '../clawd/hooks/raster.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const args = process.argv.slice(2)
const opt = (name: string, def: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const input = opt('--in', join(root, 'docs', 'demo.gif'))
const output = opt('--out', join(root, 'docs', 'demo.gif'))

// The scenes in the GIF, in order: sheet name, how many frames, and the scene time of the
// first one (frames are 80 ms apart). The frame counts must match the GIF's captions.
const SCENES: [string, number, number][] = [
  ['idle', 25, 0],
  ['work', 30, 0.8], // the end of the wave, grabbing the laptop, typing
  ['ultracode', 20, 0],
  ['team', 25, 0],
  ['rain', 20, 0],
  ['party', 25, 0],
]
const FRAME_S = 0.08

// The band inside each 800 x 244 frame: 96 columns x 7 rows of 8 x 18 px, from (16, 34). The
// title bar ends at y = 40, so the top 6 px of the band are cut (only rain ever reaches them).
const X0 = 16
const Y0 = 34
const TOP = 40
const COLS = 96
const ROWS = 7
const CW = 8
const CH = 18
const BG = 0x1f1f28
const DEFAULT = 0x01000000
const CELL = 2.25 // lane.ts CELL
// The sheet SVGs are 561 x 62 px. The terminal band has a whole number of points in height, so
// the lane is moved down until its floor sits on the band's floor (62 px -> 7 rows = 63 px),
// and only the right-hand 96 columns (where Clawd parks) are shown.
const SHEET_W = 561
const SHEET_H = 62
const FULL_COLS = Math.floor(SHEET_W / (2 * CELL))
const DROP = ROWS * 4 * CELL - SHEET_H

function sceneDoc(name: string) {
  let svg = readFileSync(join(root, 'docs', 'sheet', `${name}.svg`), 'utf8')
  svg = svg.replace(/<rect width="561" height="62"[^>]*\/>/, '') // the sheet's own background
  svg = svg.replace(/(<svg[^>]*>)/, `$1<g transform="translate(0 ${DROP})">`).replace(/<\/svg>\s*$/, '</g></svg>')
  return parseSvg(svg)
}

// The band of one frame as raw RGB (COLS*CW x ROWS*CH).
function band(doc: ReturnType<typeof parseSvg>, t: number): Buffer {
  const b = Buffer.from(frameAt(doc, t, FULL_COLS, ROWS, CELL), 'base64')
  const words = new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4)
  const W = COLS * CW
  const img = Buffer.alloc(W * ROWS * CH * 3)
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const k = (r * FULL_COLS + (FULL_COLS - COLS) + c) * 3
      const ch = words[k]
      const fg = words[k + 1] === DEFAULT ? BG : words[k + 1]
      const bg = words[k + 2] === DEFAULT ? BG : words[k + 2]
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CW; x++) {
          let col = BG
          if (ch === 0x2588) col = fg
          else if (ch === 0x2580) col = y < CH / 2 ? fg : bg
          else if (ch === 0x2584) col = y >= CH / 2 ? fg : bg
          else if (ch !== 0x20) col = x > 1 && x < CW - 2 && y > 2 && y < CH - 2 ? fg : bg // a text glyph
          const i = ((r * CH + y) * W + c * CW + x) * 3
          img[i] = (col >> 16) & 255
          img[i + 1] = (col >> 8) & 255
          img[i + 2] = col & 255
        }
    }
  return Buffer.concat([Buffer.from(`P6\n${W} ${ROWS * CH}\n255\n`), img])
}

const tmp = mkdtempSync(join(tmpdir(), 'clawd-gif-'))
execFileSync('magick', [input, '-coalesce', join(tmp, 'old-%03d.png')])
const old = readdirSync(tmp).filter(f => f.startsWith('old-')).sort()
const total = SCENES.reduce((n, [, frames]) => n + frames, 0)
if (old.length !== total) throw new Error(`the GIF has ${old.length} frames, the scene list expects ${total}`)

const out: string[] = []
let k = 0
for (const [name, frames, t0] of SCENES) {
  const doc = sceneDoc(name)
  for (let i = 0; i < frames; i++, k++) {
    const lane = join(tmp, `lane-${String(k).padStart(3, '0')}.ppm`)
    writeFileSync(lane, band(doc, t0 + i * FRAME_S))
    const frame = join(tmp, `new-${String(k).padStart(3, '0')}.png`)
    execFileSync('magick', [join(tmp, old[k]), '(', lane, '-crop', `${COLS * CW}x${ROWS * CH - (TOP - Y0)}+0+${TOP - Y0}`, '+repage', ')', '-geometry', `+${X0}+${TOP}`, '-composite', frame])
    out.push(frame)
  }
}
execFileSync('magick', ['-delay', String(FRAME_S * 100), '-loop', '0', ...out, '-layers', 'Optimize', output])
console.log(`${output}: ${out.length} frames (work files in ${tmp})`)
