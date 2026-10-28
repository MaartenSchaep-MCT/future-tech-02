import { computed, reactive, watchEffect } from 'vue'
import { DEFAULT_ROOF_AREA, ROOF_FRONT_Z, eaveX } from './config'
import { Color } from 'three'

export const CAPACITY = 300 // litres per tank (default)

// Share of the rain falling on the roof that actually ends up in the tank (splashing, first flush, evaporation)
export const RUNOFF_COEFFICIENT = 0.9

// Mutable simulation state, updated every frame by RainSystem (not reactive on purpose)
export const sim = { volume: 0, emptyRequests: 0 }

// Reactive state for the UI; RainSystem syncs it ~10x per second
export const ui = reactive({
  intensity: 0.5, // 0 .. 1
  volume: 0,
  capacity: CAPACITY, // total storage in litres = tankSize * tanks (kept up to date below)
  tankSize: CAPACITY, // litres of one tank
  tanks: 1,
  roofArea: DEFAULT_ROOF_AREA, // m2 of roof (both slopes) draining into the gutters
  roofAuto: false, // size the roof automatically so the rain covers the usage
  avgRainMmDay: 2.2, // average daily rainfall; replaced by the real climate average once a location is loaded
  dailyUseL: 150, // litres of water used per day: the demand the roof and tanks have to cover
  targetReliability: 90, // % of the demand the rain should be able to cover
  place: { name: '', lat: 0, lon: 0, loading: false, error: '' },
  climate: {
    loaded: false,
    loading: false,
    error: '',
    years: 0,
    annualMm: 0,
    avgMmDay: 0,
    rainyDays: 0, // days per year with at least 1 mm
    longestDry: 0, // longest run of days under 1 mm
    monthly: [] as number[], // average rainfall per calendar month, mm
    version: 0, // bumped whenever new data arrives, so computed values know to refresh
  },
  flowRate: 0, // litres per second flowing into the tank
  overflowing: false,
  emptying: false,
  mode: 'manual' as 'manual' | 'live',
  live: {
    loading: false,
    error: '',
    name: '',
    description: '',
    mmPerHour: 0,
    updated: 0, // ms timestamp of the last successful fetch
  },
  apocalypse: false, // flood mode: endless storm, rising water and tsunamis
  floodLevel: 0, // metres of flood water above the ground
  timeOfDay: 14, // hours, 0..24
  autoTime: false,
  dayLengthMin: 2, // real minutes for a full 24 h when the clock runs
  usageRate: 0, // litres per second actually drawn (smoothed)
  usedTotal: 0,
  timeLapse: 10, // multiplies how fast the tank fills and is used compared to reality
  showCharts: false,
  wetness: 0, // 0 dry .. 1 soaked; builds up while it rains and slowly dries
})

watchEffect(() => {
  ui.capacity = ui.tankSize * ui.tanks
})

// Plain (non-reactive) values read every frame by the 3D scene
export const world = {
  roofBackZ: ROOF_FRONT_Z - DEFAULT_ROOF_AREA / (2 * eaveX), // z of the back end of the roof (see houseGeometry)
  chimneyZ: -2,
  gutterTilt: 0.03,
  wallBackZ: -5,
  floodY: 0, // flood surface height, or -10 when there is no flood
  waterLevel: 0, // base flood level (>= 0), without the tsunami fronts
  waves: [
    { x: 1, z: 0, s: 0, a: 0 },
    { x: 1, z: 0, s: 0, a: 0 },
    { x: 1, z: 0, s: 0, a: 0 },
  ], // tsunami fronts: direction, position along it, amplitude (a = 0: inactive)
  flash: 0,
  hour: 14,
}

let intensityBeforeFlood = 0.5
export const setApocalypse = (on: boolean) => {
  if (on === ui.apocalypse) return
  if (on) intensityBeforeFlood = ui.intensity
  ui.apocalypse = on
  ui.intensity = on ? 1 : intensityBeforeFlood
}

export const requestEmpty = () => {
  if (sim.volume > 0.5) sim.emptyRequests++
}

const clear = new Color('#cfe3f0')
const storm = new Color('#6a7580')
const mixed = new Color()
export const skyColor = computed(() => mixed.copy(clear).lerp(storm, Math.min(1, ui.intensity * 1.1)).getStyle())
