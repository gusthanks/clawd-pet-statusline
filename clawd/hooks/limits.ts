// ---------- os limites (5 horas e 7 dias) ----------

// A consulta e a vez de consultar ficam no register.tsx (usam o $); aqui, o endereço, o ritmo
// e a leitura da resposta.

// Os limites ao vivo, do mesmo lugar que o /usage do Claude Code lê.
export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
export const LIMITS_EVERY_MS = 2 * 60_000
export const LIMITS_FRESH_MS = 6 * 60_000
export const LIMITS_BACKOFF_MS = [5, 10, 20].map(m => m * 60_000) // depois de "muitas consultas" (429), espera mais

export type Window = { used_percentage: number; resets_at?: number }

// Lê uma janela de limite em qualquer um dos formatos conhecidos.
export function windowOf(x: unknown): Window | undefined {
  if (!x || typeof x !== 'object') return undefined
  const o = x as Record<string, unknown>
  const pct = typeof o.utilization === 'number' ? o.utilization : typeof o.used_percentage === 'number' ? o.used_percentage : undefined
  if (pct === undefined) return undefined
  const r = o.resets_at ?? o.resetsAt
  const resets = typeof r === 'string' ? Date.parse(r) / 1000 : typeof r === 'number' ? (r > 1e12 ? r / 1000 : r) : NaN
  return Number.isFinite(resets) ? { used_percentage: pct, resets_at: resets } : { used_percentage: pct }
}
