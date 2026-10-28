import { RUNOFF_COEFFICIENT } from './rainState'

// Daily water balance of a roof + tank, run over years of real (or, without a location, typical) rainfall:
//   level += rain (mm) x roof area (m2) x runoff coefficient      (1 mm on 1 m2 = 1 litre)
//   anything above the tank volume overflows; the daily demand is taken from the tank, the rest is a shortage.
export interface SimulationResult {
  reliability: number // 0..1, share of the demand that was met
  overflowPerYear: number // litres lost because the tank was full
  shortDaysPerYear: number // days on which not all demand could be met
}

export const simulate = (series: number[], roofArea: number, dailyUse: number, tankLiters: number): SimulationResult => {
  let level = tankLiters * 0.5
  let unmet = 0
  let overflow = 0
  let shortDays = 0
  for (const mm of series) {
    level += mm * roofArea * RUNOFF_COEFFICIENT
    if (level > tankLiters) {
      overflow += level - tankLiters
      level = tankLiters
    }
    const take = Math.min(level, dailyUse)
    level -= take
    if (dailyUse - take > 0.01) {
      unmet += dailyUse - take
      shortDays++
    }
  }
  const years = series.length / 365.25
  return {
    reliability: dailyUse > 0 ? 1 - unmet / (dailyUse * series.length) : 1,
    overflowPerYear: overflow / years,
    shortDaysPerYear: shortDays / years,
  }
}

// Smallest tank (litres, rounded up to 10 L) that reaches the target reliability, or null when even a huge tank
// cannot, because the roof simply does not collect enough rain.
export const minimumTank = (series: number[], roofArea: number, dailyUse: number, target: number): number | null => {
  if (dailyUse <= 0) return 0
  const LIMIT = 30000 // beyond 30 m3 a tank is not practical for a house
  if (simulate(series, roofArea, dailyUse, LIMIT).reliability < target) return null
  let low = 0
  let high = 100
  while (high < LIMIT && simulate(series, roofArea, dailyUse, high).reliability < target) {
    low = high
    high *= 2
  }
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2
    if (simulate(series, roofArea, dailyUse, mid).reliability >= target) high = mid
    else low = mid
  }
  return Math.ceil(high / 10) * 10
}

export interface RoofOption {
  area: number
  tank: number | null // litres needed at this roof size, null if not reachable
}

export const roofOptions = (series: number[], dailyUse: number, target: number, sizes: number[]): RoofOption[] =>
  sizes.map((area) => ({ area, tank: minimumTank(series, area, dailyUse, target) }))

// "Balanced": the option with the smallest combined (roof + tank) once both are scaled to their largest values
export const balancedOption = (options: RoofOption[]): (RoofOption & { tank: number }) | null => {
  const feasible = options.filter((o): o is RoofOption & { tank: number } => o.tank !== null)
  if (feasible.length === 0) return null
  const maxArea = Math.max(...feasible.map((o) => o.area))
  const maxTank = Math.max(1, ...feasible.map((o) => o.tank))
  return feasible.reduce((best, o) => (o.area / maxArea + o.tank / maxTank < best.area / maxArea + best.tank / maxTank ? o : best))
}

// Reliability for a range of tank sizes with the current roof
export const reliabilityCurve = (series: number[], roofArea: number, dailyUse: number, maxTank: number, points = 28) =>
  Array.from({ length: points + 1 }, (_, i) => {
    const tank = (maxTank * i) / points
    return { tank, reliability: simulate(series, roofArea, dailyUse, tank).reliability }
  })

// Typical rainfall for when no location is loaded: wet and dry spells (a simple two-state model) with the given
// average. Deterministic, so the numbers stay stable.
const syntheticCache = new Map<number, number[]>()
export const syntheticSeries = (avgMmDay: number): number[] => {
  const key = Math.round(avgMmDay * 20)
  const cached = syntheticCache.get(key)
  if (cached) return cached
  let seed = 12345
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const rainyShare = 1 / 3 // stationary share of rainy days of the chain below
  const meanRain = avgMmDay / rainyShare
  let raining = false
  const series: number[] = []
  for (let i = 0; i < 3652; i++) {
    raining = random() < (raining ? 0.6 : 0.2)
    series.push(raining ? -Math.log(1 - random()) * meanRain : 0)
  }
  syntheticCache.set(key, series)
  return series
}
