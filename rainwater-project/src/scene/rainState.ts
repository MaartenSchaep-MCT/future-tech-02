import { computed, reactive } from 'vue'
import { Color } from 'three'

export const CAPACITY = 300 // litres

// Mutable simulation state, updated every frame by RainSystem (not reactive on purpose)
export const sim = { volume: 0, emptyRequests: 0 }

// Reactive state for the UI; RainSystem syncs it ~10x per second
export const ui = reactive({
  intensity: 0.5, // 0 .. 1
  volume: 0,
  capacity: CAPACITY,
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
  power: 0, // W, electrical output of the downspout turbine
  energyWh: 0, // generated so far (in simulated time)
  potentialWh: 0, // energy stored in the raised water
  efficiency: 0.6, // turbine + generator efficiency
  apocalypse: false, // flood mode: endless storm, rising water and tsunamis
  floodLevel: 0, // metres of flood water above the ground
  timeOfDay: 14, // hours, 0..24
  autoTime: false,
  dayLengthMin: 2, // real minutes for a full 24 h when the clock runs
  usageLpm: 0, // water drawn from the tank, litres per minute
  usageRate: 0, // litres per second actually drawn (smoothed)
  usedTotal: 0,
  timeLapse: 10, // multiplies how fast the tank fills and is used compared to reality
  showCharts: false,
  wetness: 0, // 0 dry .. 1 soaked; builds up while it rains and slowly dries
})

// Plain (non-reactive) values read every frame by the 3D scene
export const world = {
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
