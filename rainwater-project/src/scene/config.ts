// Shared house / roof / gutter / barrel dimensions.
// House.vue builds the meshes from these, the rain simulation uses them for collisions.
// House-local coordinates: centre at origin, floor at y = floorY. The house group sits at y = HOUSE_Y.
export const HOUSE_Y = 1

export const houseWidth = 5
export const houseHeight = 2
export const houseLength = 10
export const floorY = -houseHeight / 2

export const eaveX = 3.2 // horizontal distance from centre to the roof edge (overhang included)
export const eaveY = houseHeight / 2
export const ridgeY = 3
export const roofThickness = 0.15
export const roofLength = houseLength + 0.8
export const roofSlope = (ridgeY - eaveY) / eaveX

export const gutterX = eaveX + 0.05
export const gutterY = eaveY - 0.02
export const gutterRadius = 0.16
export const gutterSlope = 0.03
export const downspoutZ = roofLength / 2 - 0.4

export const barrelRadius = 0.6
export const barrelHeight = 1.4

// World-space helpers used by the rain simulation
export const roofSurfaceY = (absX: number) => HOUSE_Y + ridgeY - absX * roofSlope + roofThickness / 2 + 0.02
export const gutterWorldY = (z: number) => HOUSE_Y + gutterY - gutterRadius * 0.6 - gutterSlope * z
export const BARREL_FLOOR_Y = HOUSE_Y + floorY
export const BARREL_TOP_Y = BARREL_FLOOR_Y + barrelHeight
export const DOWNSPOUT_BOTTOM_Y = BARREL_TOP_Y - 0.15
