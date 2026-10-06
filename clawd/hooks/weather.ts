// ---------- o clima: os endereços, o ritmo e a tradução da previsão ----------

// A consulta (lugar por IP e Open-Meteo) fica no register.tsx (usa o $).

export type Place = { lat: number; lon: number; city: string; at: number }
export const PLACE_EVERY_MS = 60 * 60_000
export const PLACE_SERVICES = ['https://get.geojs.io/v1/ip/geo.json', 'https://ipwho.is/']

export const weatherUrl = (p: Place) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code,is_day,precipitation,rain,showers&timezone=auto`
export const WEATHER_EVERY_MS = 15 * 60_000
export const WEATHER_STALE_MS = 60 * 60_000 // leitura mais velha que isso não abre guarda-chuva

// Códigos WMO do tempo para um emoji, de dia e de noite.
export function weatherEmoji(code: number, day: boolean): string {
  if (code === 0) return day ? '☀️' : '🌙'
  if (code === 1) return day ? '🌤️' : '🌙'
  if (code === 2) return day ? '⛅' : '☁️'
  if (code === 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 57) return '🌦️'
  if (code >= 61 && code <= 67) return '🌧️'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '🌨️'
  if (code >= 80 && code <= 82) return '🌦️'
  if (code >= 95) return '⛈️'
  return day ? '🌤️' : '🌙'
}

// Chuva de verdade: chuva, pancadas e trovoadas. A garoa (51–57) só conta com precipitação medida.
export const WET = new Set([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 97, 99])
export const DRIZZLE = new Set([51, 53, 55, 56, 57])
export const DRIZZLE_MIN_MM = 0.5
// Guarda-chuva ou não: o serviço marca garoa e um traço de precipitação com facilidade no centro
// da cidade (o lugar vem do IP), e o Gus viu chover na faixa com o céu seco em 06/10/2026.
export function isRaining(code: number, precipitationMm: number): boolean {
  if (WET.has(code)) return true
  if (DRIZZLE.has(code)) return precipitationMm >= DRIZZLE_MIN_MM
  return false
}
