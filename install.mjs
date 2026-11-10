#!/usr/bin/env node
// Installs Clawd + the statusline into Claude Code.
//
//   node install.mjs              install (or update)
//   node install.mjs --uninstall  turn it off (removes the settings.json line; the files stay)
//
// What it does:
//   1. copies the clawd/ folder to ~/.claude/mods/clawd (a previous version becomes .bak-<date>)
//   2. copies statusline/statusline-rgb.js to ~/.claude/ (only if there is none yet)
//   3. backs up ~/.claude/settings.json and adds the mod folder to env.CLAUDE_CODE_PLUGIN_DIRS
//
// Messages are in English, or in Brazilian Portuguese when LC_ALL / LC_MESSAGES / LANG start with "pt".
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
const locale = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''
const pt = /^pt/i.test(locale)
const t = (en, ptBR) => (pt ? ptBR : en)

function readSettings() {
  if (!fs.existsSync(settingsPath)) return {}
  const raw = fs.readFileSync(settingsPath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.error(t(`Could not read ${settingsPath} (invalid JSON): ${err.message}`, `Não consegui ler ${settingsPath} (JSON inválido): ${err.message}`))
    console.error(t('Nothing was changed. Fix the file and run again.', 'Nada foi alterado. Corrija o arquivo e rode de novo.'))
    process.exit(1)
  }
}

function writeSettings(settings) {
  fs.mkdirSync(claudeDir, { recursive: true })
  if (fs.existsSync(settingsPath)) {
    const backup = `${settingsPath}.bak-clawd-${stamp}`
    fs.copyFileSync(settingsPath, backup)
    console.log(t(`• settings.json backup: ${backup}`, `• cópia do settings.json: ${backup}`))
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
    console.log(t('Clawd was not turned on in settings.json. Nothing to do.', 'O Clawd não estava ligado no settings.json. Nada a fazer.'))
    process.exit(0)
  }
  settings.env = settings.env ?? {}
  if (left.length) settings.env[KEY] = left.join(path.delimiter)
  else delete settings.env[KEY]
  if (Object.keys(settings.env).length === 0) delete settings.env
  writeSettings(settings)
  console.log(t(`• turned off. The files are still in ${dest} (you can delete the folder if you like).`, `• desligado. Os arquivos continuam em ${dest} (pode apagar a pasta, se quiser).`))
  console.log(t('New Claude Code conversations open without Clawd.', 'As conversas novas do Claude Code já abrem sem o Clawd.'))
  process.exit(0)
}

// 1. the mod
fs.mkdirSync(path.dirname(dest), { recursive: true })
if (fs.existsSync(dest)) {
  const old = `${dest}.bak-${stamp}`
  fs.renameSync(dest, old)
  console.log(t(`• previous version kept in ${old}`, `• versão anterior guardada em ${old}`))
}
fs.cpSync(path.join(here, 'clawd'), dest, { recursive: true })
console.log(t(`• mod copied to ${dest}`, `• mod copiado para ${dest}`))

// 2. the statusline
const statusline = path.join(claudeDir, 'statusline-rgb.js')
if (fs.existsSync(statusline)) console.log(t(`• statusline already exists at ${statusline} (kept)`, `• statusline já existe em ${statusline} (mantida)`))
else {
  fs.copyFileSync(path.join(here, 'statusline', 'statusline-rgb.js'), statusline)
  console.log(t(`• statusline copied to ${statusline}`, `• statusline copiada para ${statusline}`))
}

// 3. settings.json
if (dirs.some(d => same(d.replace(/^~/, os.homedir()), dest))) console.log(t('• settings.json already turns Clawd on', '• o settings.json já liga o Clawd'))
else {
  settings.env = settings.env ?? {}
  settings.env[KEY] = [...dirs, destForSettings].join(path.delimiter)
  writeSettings(settings)
  console.log(`• settings.json: env.${KEY} = ${settings.env[KEY]}`)
}

console.log(t('\nDone! Open a NEW Claude Code conversation (desktop app or terminal) to see Clawd.', '\nPronto! Abra uma conversa NOVA no Claude Code (app ou terminal) para ver o Clawd.'))
console.log(t('To turn it off: node install.mjs --uninstall', 'Para desligar: node install.mjs --uninstall'))
