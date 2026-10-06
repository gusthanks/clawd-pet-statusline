import type { Lines } from '../types'

// ---------- linhas mexidas e commits ----------

// A regra do terminal (claude.exe, a mesma que alimenta cost.total_lines_added):
// só Edit e Write contam, inclusive os dos ajudantes; recusados, com erro ou
// "staged" não contam. Cada linha do trecho que começa com + ou - conta uma.
// Um Write que cria o arquivo conta todas as linhas (quebras + 1).
function fromPatch(patch: unknown): Lines {
  let added = 0
  let removed = 0
  for (const hunk of Array.isArray(patch) ? (patch as { lines?: unknown }[]) : []) {
    for (const line of Array.isArray(hunk.lines) ? hunk.lines : []) {
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) added++
      else if (line.startsWith('-')) removed++
    }
  }
  return { added, removed }
}

export type Ran = { deny?: string; isError?: boolean; text?: string; result?: unknown }

export function changedLines(tool: string, ran: Ran): Lines | null {
  if (ran.deny !== undefined || ran.isError) return null
  const r = (ran.result ?? {}) as { staged?: boolean; type?: string; content?: unknown; structuredPatch?: unknown }
  if (r.staged === true) return null
  if (tool === 'Write' && r.type === 'create') return { added: typeof r.content === 'string' && r.content ? r.content.split('\n').length : 0, removed: 0 }
  return fromPatch(r.structuredPatch)
}

// Commit e push: o próprio Claude Code marca no resultado do Bash/PowerShell
// (result.gitOperation) quando um aconteceu de verdade. Reservas para o que ele
// perde: um commit que imprimiu antes de a linha falhar, e o commit quieto (-q).
const COMMIT_LINE = /^\[(?:([\w./-]+)|detached HEAD)(?: \(root-commit\))? ([0-9a-f]{4,})\]/m
const PUSH_LINE = /^\s*[+\-*!= ]?\s*(?:\[new branch\]|[0-9a-f]+\.\.+[0-9a-f]+)\s+\S+\s*->\s*(\S+)/m
const gitSub = (sub: string) =>
  new RegExp(String.raw`(?:^|[\s;&|(])git(?:\.exe)?(?:\s+-[cC]\s+(?:"[^"]*"|'[^']*'|\S+)|\s+--[^\s=]+=\S+)*\s+${sub}\b`)
const GIT_COMMIT = gitSub('commit')
const GIT_PUSH = gitSub('push')
const argsOf = (re: RegExp, cmd: string) => (cmd.split(re)[1] ?? '').split(/[&|;\n]/)[0] ?? ''
const QUIET = /(?:^|\s)(?:-q|--quiet)(?=\s|$)/
const COMMIT_DRY = /(?:^|\s)--dry-run(?=\s|$)/ // no commit, -n quer dizer --no-verify
const PUSH_DRY = /(?:^|\s)(?:-n|--dry-run)(?=\s|$)/ // no push, -n é --dry-run
const NOTHING = /nothing to commit|no changes added to commit|nothing added to commit/

export function gitHappened(command: unknown, ran: Ran): boolean {
  if (typeof command !== 'string' || ran.deny !== undefined) return false
  const commitArgs = argsOf(GIT_COMMIT, command)
  const pushArgs = argsOf(GIT_PUSH, command)
  const wantsCommit = GIT_COMMIT.test(command) && !COMMIT_DRY.test(commitArgs)
  const wantsPush = GIT_PUSH.test(command) && !PUSH_DRY.test(pushArgs)
  if (!wantsCommit && !wantsPush) return false
  if (ran.isError) {
    const text = ran.text ?? String(ran.result ?? '')
    return (wantsCommit && COMMIT_LINE.test(text)) || (wantsPush && PUSH_LINE.test(text))
  }
  const r = (ran.result ?? {}) as { gitOperation?: { commit?: unknown; push?: unknown }; stdout?: string; stderr?: string; backgroundTaskId?: string }
  if (r.backgroundTaskId) return false // ainda rodando em segundo plano: não dá pra saber
  if (r.gitOperation?.commit || r.gitOperation?.push) return true
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  if ((wantsCommit && COMMIT_LINE.test(out)) || (wantsPush && PUSH_LINE.test(out))) return true
  return wantsCommit && QUIET.test(commitArgs) && !NOTHING.test(out)
}

export const isLines = (v: unknown): v is Lines =>
  !!v && typeof (v as Lines).added === 'number' && typeof (v as Lines).removed === 'number'
