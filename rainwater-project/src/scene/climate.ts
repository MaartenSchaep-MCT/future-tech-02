import { ui } from './rainState'

// Real rainfall statistics for a place, from the free Open-Meteo APIs (no API key needed):
// geocoding for the place name and ten years of daily precipitation from the historical archive.
export const climateData = { daily: [] as number[] } // mm per day, oldest first (kept outside the reactive state)

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

export const findPlace = async (query: string) => {
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`)
  if (!response.ok) throw new Error(`Location search failed (${response.status})`)
  const body = await response.json()
  const hit = body.results?.[0]
  if (!hit) throw new Error(`No location found for "${query}"`)
  return {
    name: [hit.name, hit.admin1, hit.country_code].filter(Boolean).join(', ') as string,
    lat: hit.latitude as number,
    lon: hit.longitude as number,
  }
}

export const loadClimate = async (lat: number, lon: number) => {
  const climate = ui.climate
  climate.loading = true
  climate.error = ''
  try {
    // The archive lags a few days behind, so end a week ago and go back ten years
    const end = new Date()
    end.setDate(end.getDate() - 8)
    const start = new Date(end)
    start.setFullYear(end.getFullYear() - 10)
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=${isoDate(start)}&end_date=${isoDate(end)}&daily=precipitation_sum&timezone=auto`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Rainfall history failed (${response.status})`)
    const body = await response.json()
    const days: string[] = body.daily?.time ?? []
    const rain: (number | null)[] = body.daily?.precipitation_sum ?? []
    if (days.length < 365) throw new Error('Not enough rainfall history for this location')

    const daily = rain.map((v) => v ?? 0)
    const years = daily.length / 365.25
    const monthSum = new Array(12).fill(0)
    let total = 0
    let rainyDays = 0
    let dryRun = 0
    let longestDry = 0
    daily.forEach((mm, i) => {
      total += mm
      monthSum[Number(days[i].slice(5, 7)) - 1] += mm
      if (mm >= 1) {
        rainyDays++
        dryRun = 0
      } else {
        dryRun++
        longestDry = Math.max(longestDry, dryRun)
      }
    })

    climateData.daily = daily
    climate.years = years
    climate.annualMm = total / years
    climate.avgMmDay = total / daily.length
    climate.rainyDays = rainyDays / years
    climate.longestDry = longestDry
    climate.monthly = monthSum.map((s) => s / years)
    climate.loaded = true
    climate.version++
    ui.avgRainMmDay = climate.avgMmDay
  } catch (e) {
    climate.error = e instanceof Error ? e.message : 'Could not load rainfall history'
    climate.loaded = false
  } finally {
    climate.loading = false
  }
}
