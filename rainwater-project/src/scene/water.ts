// Shared between RainSystem (drops, volume) and BarrelWater (surface waves, inflow stream)
export const water = {
  topY: 0, // world height of the water surface in the barrel
  level: 0, // 0 empty .. 1 full
}

// Pending impacts on the barrel surface: x, z (relative to the barrel centre), strength
export const rippleQueue: number[] = []
export const addRipple = (x: number, z: number, strength: number) => {
  if (rippleQueue.length < 900) rippleQueue.push(x, z, strength)
}

// Emptying the barrel: RainSystem asks WaterBlobs (metaball surface) to throw out the bulk of the water
export const blobRequests: { x: number; y: number; z: number; volume: number }[] = []
export const requestBlobExplosion = (x: number, y: number, z: number, volume: number) => {
  blobRequests.push({ x, y, z, volume })
}

// Set by RainSystem so that blobs hitting the ground can leave rings, spray and droplets behind
export const hooks: { onBlobImpact: ((x: number, y: number, z: number, size: number, speed: number) => void) | null } = {
  onBlobImpact: null,
}
