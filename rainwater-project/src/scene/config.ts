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

// ---- Roof size ----
// The roof can be longer or shorter than the default. It always keeps its front end (where the downspout and the
// barrel are) in place and grows or shrinks towards the back. The gutter-side roof area in m2 = eaveX * roof length.
export const ROOF_FRONT_Z = roofLength / 2
export const WALL_FRONT_Z = houseLength / 2
export const DEFAULT_ROOF_AREA = eaveX * roofLength
export const MIN_ROOF_AREA = 15
export const MAX_ROOF_AREA = 120

export const houseGeometry = (roofArea: number) => {
  const roofLen = Math.max(3, roofArea / eaveX)
  const wallLen = roofLen - 0.8
  return {
    roofLen,
    wallLen,
    roofCenterZ: ROOF_FRONT_Z - roofLen / 2,
    wallCenterZ: WALL_FRONT_Z - wallLen / 2,
    roofBackZ: ROOF_FRONT_Z - roofLen,
    wallBackZ: WALL_FRONT_Z - wallLen,
    chimneyZ: WALL_FRONT_Z - Math.min(wallLen - 1.5, 7),
  }
}
