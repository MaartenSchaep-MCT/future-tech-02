import { ui } from './rainState'

// Live rain from OpenWeather. Requests go to /api/geocode and /api/weather, which the Vite dev/preview server
// forwards to OpenWeather with the API key from .env.local added (see vite.config.ts).
const REFRESH_MS = 10 * 60 * 1000

// mm/h of rain -> 0..1 slider intensity: 0.5 mm/h drizzle ~ 0.06, 2.5 ~ 0.27, 8 ~ 0.63, 20 ~ 0.92
export const intensityFromMm = (mm: number) => Math.min(1, 1 - Math.exp(-mm / 8))
export const mmFromIntensity = (intensity: number) => -8 * Math.log(1 - Math.min(intensity, 0.99))

// OpenWeather condition ids, for when a rainy condition has no rain volume reported
const mmFromCondition = (id: number) => {
  if (id >= 200 && id < 300) return 12 // thunderstorm
  if (id >= 300 && id < 400) return 0.5 // drizzle
  if (id === 500) return 1
  if (id === 501) return 4
  if (id === 502) return 10
  if (id >= 503 && id < 600) return 25
  return 0
}

let timer: ReturnType<typeof setInterval> | null = null
let location: { lat: number; lon: number } | null = null

const getJson = async (url: string) => {
  const response = await fetch(url)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) throw new Error('Weather API key missing or invalid. Set OPENWEATHER_API_KEY in .env.local and restart the dev server.')
    throw new Error(body?.message ?? `Weather request failed (${response.status})`)
  }
  return body
}

const refresh = async () => {
  if (!location) return
  ui.live.loading = true
  try {
    const data = await getJson(`/api/weather?lat=${location.lat}&lon=${location.lon}&units=metric`)
    const condition = data.weather?.[0]
    const rain = data.rain?.['1h'] ?? (data.rain?.['3h'] ? data.rain['3h'] / 3 : undefined)
    const mm = rain ?? mmFromCondition(condition?.id ?? 800)
    ui.live.mmPerHour = mm
    ui.live.description = condition?.description ?? ''
    ui.live.updated = Date.now()
    ui.live.error = ''
    ui.intensity = intensityFromMm(mm)
  } catch (e) {
    ui.live.error = e instanceof Error ? e.message : 'Could not load weather'
  } finally {
    ui.live.loading = false
  }
}

export const stopLive = () => {
  if (timer) clearInterval(timer)
  timer = null
  location = null
  ui.mode = 'manual'
  ui.live.error = ''
}

export const startLive = async (query: string) => {
  const q = query.trim()
  if (!q) {
    ui.live.error = 'Type a city name, e.g. "Ghent" or "Seattle, US"'
    return
  }
  ui.live.loading = true
  ui.live.error = ''
  try {
    const places = await getJson(`/api/geocode?q=${encodeURIComponent(q)}&limit=1`)
    if (!Array.isArray(places) || places.length === 0) throw new Error(`No location found for "${q}"`)
    const place = places[0]
    location = { lat: place.lat, lon: place.lon }
    ui.live.name = [place.name, place.state, place.country].filter(Boolean).join(', ')
    ui.mode = 'live'
    if (timer) clearInterval(timer)
    timer = setInterval(refresh, REFRESH_MS)
    await refresh()
  } catch (e) {
    ui.live.error = e instanceof Error ? e.message : 'Could not look up that location'
    if (!location) ui.mode = 'manual'
  } finally {
    ui.live.loading = false
  }
}
