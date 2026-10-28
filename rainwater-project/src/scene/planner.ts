import { computed } from 'vue'
import { ui } from './rainState'
import { climateData } from './climate'
import { balancedOption, roofOptions, simulate, syntheticSeries } from './sizing'

// The sizing results shared by the planner panel and the voice commands.
export const MAX_TANKS = 10
export const ROOF_SIZES = [40, 60, 80, 100, 130, 160, 200, 250]
const TANK_SIZES = [300, 500, 1000, 2000, 3000, 5000]

// Rainfall series the calculations run on: the real history of the location, or a typical climate before that
export const series = computed(() => {
  void ui.climate.version
  return ui.climate.loaded ? climateData.daily : syntheticSeries(ui.avgRainMmDay)
})
export const target = computed(() => ui.targetReliability / 100)
export const current = computed(() => simulate(series.value, ui.roofArea, ui.dailyUseL, ui.capacity))
export const options = computed(() => roofOptions(series.value, ui.dailyUseL, target.value, ROOF_SIZES))
export const balanced = computed(() => balancedOption(options.value))
export const smallestRoof = computed(() => options.value.find((o) => o.tank !== null)?.area ?? null)

// Common tank sizes: pick the smallest one that keeps the number of tanks reasonable (at most 4)
export const suggestTanks = (litres: number) => {
  const size = TANK_SIZES.find((s) => Math.ceil(litres / s) <= 4) ?? TANK_SIZES[TANK_SIZES.length - 1]
  return { size, count: Math.max(1, Math.min(MAX_TANKS, Math.ceil(litres / size))) }
}

export const applyOption = (area: number, tank: number) => {
  const { size, count } = suggestTanks(tank)
  ui.roofAuto = false
  ui.roofArea = area
  ui.tankSize = size
  ui.tanks = count
}
