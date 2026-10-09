// ---------- o clima: os endereços, o ritmo e a tradução da previsão ----------

// A consulta (lugar pelo Windows ou por IP, e Open-Meteo) fica no register.tsx (usa o $).

// source: de onde veio o lugar. Guardado antigo (sem source) veio do IP.
export type PlaceSource = 'windows' | 'ip' | 'env'
export type Place = { lat: number; lon: number; city: string; at: number; source?: PlaceSource }
export const PLACE_EVERY_MS = 60 * 60_000
export const PLACE_SERVICES = ['https://get.geojs.io/v1/ip/geo.json', 'https://ipwho.is/']

// Mudou de lugar de verdade: outra fonte, ou mais de 1 km (a grade de 2 casas decimais já tem uns 1,1 km).
export const PLACE_MOVED_KM = 1
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

// O serviço de localização do Windows (GeoCoordinateWatcher, só no Windows PowerShell 5.1: o pwsh 7 responde
// "Denied"). Uma linha só, sem aspas duplas, e os números na cultura invariante (o Windows em pt-BR usa vírgula).
// A saída é "<status>|<permission>|<lat>|<lon>|<acc>". O TryStart espera até 20 s.
export const WINDOWS_PLACE_TIMEOUT_MS = 30_000
export const WINDOWS_PLACE_SCRIPT = [
  'Add-Type -AssemblyName System.Device',
  '$w = New-Object System.Device.Location.GeoCoordinateWatcher',
  '$null = $w.TryStart($false, [TimeSpan]::FromSeconds(20))',
  '$i = 0',
  "while ($w.Status -ne 'Ready' -and $i -lt 40) { Start-Sleep -Milliseconds 500; $i++ }",
  '$loc = $w.Position.Location',
  '$c = [Globalization.CultureInfo]::InvariantCulture',
  "Write-Output ($w.Status.ToString() + '|' + $w.Permission.ToString() + '|' + $loc.Latitude.ToString($c) + '|' + $loc.Longitude.ToString($c) + '|' + $loc.HorizontalAccuracy.ToString($c))",
  '$w.Stop()',
].join('; ')
export const WINDOWS_PLACE_ARGV = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_PLACE_SCRIPT]

// Só vale com status Ready, permissão Granted e lat/lon finitos (e não 0,0). Arredonda a 2 casas, como o IP.
export function parseWindowsPlace(out: string): { lat: number; lon: number; acc: number } | null {
  const line = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes('|'))[0]
  if (!line) return null
  const [st, perm, la, lo, ac] = line.split('|').map((x) => x.trim())
  if (st !== 'Ready' || perm !== 'Granted') return null
  const lat = Number(la)
  const lon = Number(lo)
  if (la === '' || lo === '' || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const acc = Number(ac)
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, acc: Number.isFinite(acc) ? Math.round(acc) : -1 }
}

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
