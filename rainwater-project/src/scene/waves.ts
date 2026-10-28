import { world } from './rainState'

// CPU copy of the tsunami fronts that Flood.vue draws on the GPU, so that animals (and anything else) can
// ask how high the water is and how fast it is pushing at a given spot.
const WIDTH_FRONT = 3.5
const WIDTH_BACK = 10

const crest = (x: number, z: number, i: number) => {
  const w = world.waves[i]
  if (w.a <= 0) return 0
  const d = x * w.x + z * w.z - w.s
  const k = d / (d > 0 ? WIDTH_FRONT : WIDTH_BACK)
  return w.a * Math.exp(-k * k)
}

// Extra height of the water surface caused by the tsunami fronts
export const waveHeight = (x: number, z: number) => crest(x, z, 0) + crest(x, z, 1) + crest(x, z, 2)

// Horizontal push of the water: along each front's direction, stronger the taller the wave is at that spot
export const waveFlow = (x: number, z: number, out: { x: number; z: number }) => {
  out.x = 0
  out.z = 0
  for (let i = 0; i < 3; i++) {
    const h = crest(x, z, i)
    if (h <= 0.01) continue
    const speed = h * 2.4
    out.x += world.waves[i].x * speed
    out.z += world.waves[i].z * speed
  }
}
