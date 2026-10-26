export const FLAT_RADIUS = 14 // flat area around the house
export const FADE_RADIUS = 40

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Rolling hills that stay flat around the house
export const terrainHeight = (x: number, z: number) => {
  const d = Math.hypot(x, z)
  const hills =
    Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06) * 3 +
    Math.sin(x * 0.15 + z * 0.12) * 1.2 +
    Math.cos(z * 0.2 - x * 0.1) * 0.6 +
    4
  return smoothstep(FLAT_RADIUS, FADE_RADIUS, d) * hills
}
