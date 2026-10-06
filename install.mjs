#!/usr/bin/env node
// Instala o Clawd + statusline no Claude Code.
//
//   node install.mjs              instala (ou atualiza)
//   node install.mjs --uninstall  desliga (tira a linha do settings.json; os arquivos ficam)
//
// O que ele faz:
//   1. copia a pasta clawd/ para ~/.claude/mods/clawd (a versão anterior vira .bak-<data>)
//   2. copia statusline/statusline-rgb.js para ~/.claude/ (só se ainda não existir)
//   3. guarda uma cópia do ~/.claude/settings.json e acrescenta a pasta do mod em
//      env.CLAUDE_CODE_PLUGIN_DIRS
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const claudeDir = path.join(os.homedir(), '.claude')
const dest = path.join(claudeDir, 'mods', 'clawd')
const settingsPath = path.join(claudeDir, 'settings.json')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
const uninstall = process.argv.includes('--uninstall')
const KEY = 'CLAUDE_CODE_PLUGIN_DIRS'

function readSettings() {
  if (!fs.existsSync(settingsPath)) return {}
  const raw = fs.readFileSync(settingsPath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.error(`Não consegui ler ${settingsPath} (JSON inválido): ${err.message}`)
    console.error('Nada foi alterado. Corrija o arquivo e rode de novo.')
    process.exit(1)
  }
}

function writeSettings(settings) {
  fs.mkdirSync(claudeDir, { recursive: true })
  if (fs.existsSync(settingsPath)) {
    const backup = `${settingsPath}.bak-clawd-${stamp}`
    fs.copyFileSync(settingsPath, backup)
    console.log(`• cópia do settings.json: ${backup}`)
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
}

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
const dirsOf = settings => (settings.env?.[KEY] ?? '').split(path.delimiter).map(s => s.trim()).filter(Boolean)
const destForSettings = dest.split(path.sep).join('/')

const settings = readSettings()
const dirs = dirsOf(settings)

if (uninstall) {
  const left = dirs.filter(d => !same(d.replace(/^~/, os.homedir()), dest))
  if (left.length === dirs.length) {
    console.log('O Clawd não estava ligado no settings.json. Nada a fazer.')
    process.exit(0)
  }
  settings.env = settings.env ?? {}
  if (left.length) settings.env[KEY] = left.join(path.delimiter)
  else delete settings.env[KEY]
  if (Object.keys(settings.env).length === 0) delete settings.env
  writeSettings(settings)
  console.log(`• desligado. Os arquivos continuam em ${dest} (pode apagar a pasta, se quiser).`)
  console.log('As conversas novas do Claude Code já abrem sem o Clawd.')
  process.exit(0)
}

// 1. o mod
fs.mkdirSync(path.dirname(dest), { recursive: true })
if (fs.existsSync(dest)) {
  const old = `${dest}.bak-${stamp}`
  fs.renameSync(dest, old)
  console.log(`• versão anterior guardada em ${old}`)
}
fs.cpSync(path.join(here, 'clawd'), dest, { recursive: true })
console.log(`• mod copiado para ${dest}`)

// 2. a statusline
const statusline = path.join(claudeDir, 'statusline-rgb.js')
if (fs.existsSync(statusline)) console.log(`• statusline já existe em ${statusline} (mantida)`)
else {
  fs.copyFileSync(path.join(here, 'statusline', 'statusline-rgb.js'), statusline)
  console.log(`• statusline copiada para ${statusline}`)
}

// 3. o settings.json
if (dirs.some(d => same(d.replace(/^~/, os.homedir()), dest))) console.log('• o settings.json já liga o Clawd')
else {
  settings.env = settings.env ?? {}
  settings.env[KEY] = [...dirs, destForSettings].join(path.delimiter)
  writeSettings(settings)
  console.log(`• settings.json: env.${KEY} = ${settings.env[KEY]}`)
}

console.log('\nPronto! Abra uma conversa NOVA no app do Claude Code (aba Code) para ver o Clawd.')
console.log('Para desligar: node install.mjs --uninstall')
