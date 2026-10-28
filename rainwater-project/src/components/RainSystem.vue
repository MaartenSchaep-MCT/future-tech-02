<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { useLoop } from '@tresjs/core'
import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, RingGeometry, SphereGeometry } from 'three'
import type { InstancedMesh, Mesh } from 'three'
import {
  HOUSE_Y, eaveX, roofSlope, houseGeometry, ROOF_FRONT_Z, MIN_ROOF_AREA, MAX_ROOF_AREA, roofSurfaceY, gutterX, gutterWorldY, downspoutZ,
  barrelRadius, BARREL_FLOOR_Y, BARREL_TOP_Y,
} from '../scene/config'
import { terrainHeight } from '../scene/terrain'
import { sim, ui, world, RUNOFF_COEFFICIENT } from '../scene/rainState'
import { sky } from '../scene/daylight'
import { water, addRipple, requestBlobExplosion, hooks } from '../scene/water'
import { pushSample } from '../scene/history'
import { createClearWaterMaterial } from '../scene/waterMaterial'
import { mmFromIntensity } from '../scene/weather'

// ---- Tuning ---------------------------------------------------------------
const MAX_DROPS = 5000
const RUNOFF_MAX = 3500 // beads on the roof, trails, and water in the gutter and downspout
const FX_MAX = 3000 // splashes, spills and the emptying explosion
const RING_MAX = 300 // expanding ripple rings on the ground
const MIST_MAX = 300 // spray / mist puffs
const AREA = 46 // rain falls inside a square of this size around the house
const SPAWN_Y = 28
const WIND = 2 // average wind speed; gusts vary it between ~0.1x and ~1.9x
const GRAVITY = 9.8
const AVG_FALL_SPEED = 23
// (the roof catchment in m2 comes from ui.roofArea; 1 scene unit = 1 m)
// Every simulated drop that lands on the catchment stands for this much water. It is recomputed each frame
// so the real inflow equals rainfall (mm/h) x catchment area x the time-lapse factor, whatever the drop count.
let litresPerDrop = 0.02
const WATER_RADIUS = 0.5
const WATER_MAX_HEIGHT = 1.15 // water height when the tank is full
const ROOF_COS = 1 / Math.sqrt(1 + roofSlope * roofSlope)
const BARREL_X = gutterX
const BARREL_Z = downspoutZ

// ---- Scene refs -----------------------------------------------------------
const dropsRef = shallowRef<InstancedMesh | null>(null)
const runoffRef = shallowRef<InstancedMesh | null>(null)
const fxRef = shallowRef<InstancedMesh | null>(null)
const ringsRef = shallowRef<InstancedMesh | null>(null)
const mistRef = shallowRef<InstancedMesh | null>(null)
const waterRef = shallowRef<Mesh | null>(null)
const shockRef = shallowRef<Mesh | null>(null)

const runoffGeometry = new SphereGeometry(1, 12, 8)
const fxGeometry = new SphereGeometry(1, 8, 6)
const runoffMaterial = createClearWaterMaterial(0.08, 0.9)
const fxMaterial = createClearWaterMaterial(0.1, 0.9)
const ringGeometry = new RingGeometry(0.8, 1, 20).rotateX(-Math.PI / 2)
const ringMaterial = new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false })
const mistGeometry = new SphereGeometry(1, 8, 6)
const mistMaterial = new MeshBasicMaterial({ color: '#dbeeff', transparent: true, opacity: 0.2, depthWrite: false })

// Instance colours are used to fade the rings; allocate them once
watch(ringsRef, (mesh) => {
  if (mesh && !mesh.instanceColor) mesh.setColorAt(0, new Color(0, 0, 0))
}, { immediate: true })

// ---- Rain drops -----------------------------------------------------------
const dx = new Float32Array(MAX_DROPS)
const dy = new Float32Array(MAX_DROPS)
const dz = new Float32Array(MAX_DROPS)
const dSize = new Float32Array(MAX_DROPS) // bigger drops are thicker and fall faster
const fall = new Float32Array(MAX_DROPS)
const newDropSize = (i: number) => {
  dSize[i] = 0.6 + Math.random() * 0.8
  fall[i] = 14 + dSize[i] * 9
}
for (let i = 0; i < MAX_DROPS; i++) {
  dx[i] = (Math.random() - 0.5) * AREA
  dz[i] = (Math.random() - 0.5) * AREA
  dy[i] = Math.random() * SPAWN_Y
  newDropSize(i)
}

// ---- Runoff particles (kinds: 0 right roof, 1 left roof, 2 gutter, 3 downspout) ----
const rActive = new Uint8Array(RUNOFF_MAX)
const rKind = new Uint8Array(RUNOFF_MAX)
const rx = new Float32Array(RUNOFF_MAX)
const ry = new Float32Array(RUNOFF_MAX)
const rz = new Float32Array(RUNOFF_MAX)
const rSpeed = new Float32Array(RUNOFF_MAX)
const rPin = new Float32Array(RUNOFF_MAX) // seconds a roof bead stays stuck (or, for trail beads, seconds until they evaporate)
const rMass = new Float32Array(RUNOFF_MAX) // bead size; beads gather water as they grow and slide
const rTrail = new Float32Array(RUNOFF_MAX) // time until the next trail bead is left behind
let rCursor = 0

const spawnRunoff = (kind: number, x: number, y: number, z: number, pin = 0, mass = 0.7 + Math.random() * 0.5): boolean => {
  for (let n = 0; n < RUNOFF_MAX; n++) {
    const i = (rCursor + n) % RUNOFF_MAX
    if (!rActive[i]) {
      rCursor = i + 1
      rActive[i] = 1
      rKind[i] = kind
      rx[i] = x
      ry[i] = y
      rz[i] = z
      rSpeed[i] = 0.1 + Math.random() * 0.4
      rPin[i] = pin
      rMass[i] = mass
      rTrail[i] = 0.1 + Math.random() * 0.2
      return true
    }
  }
  return false
}

// ---- FX particles (ballistic with air drag; kind 1 = explosion, bounces into smaller droplets) ----
const fLife = new Float32Array(FX_MAX)
const fKind = new Uint8Array(FX_MAX)
const fx = new Float32Array(FX_MAX)
const fy = new Float32Array(FX_MAX)
const fz = new Float32Array(FX_MAX)
const fvx = new Float32Array(FX_MAX)
const fvy = new Float32Array(FX_MAX)
const fvz = new Float32Array(FX_MAX)
const fSize = new Float32Array(FX_MAX)
let fCursor = 0

const spawnFx = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, kind = 0) => {
  const i = fCursor
  fCursor = (fCursor + 1) % FX_MAX
  fLife[i] = life
  fKind[i] = kind
  fx[i] = x
  fy[i] = y
  fz[i] = z
  fvx[i] = vx
  fvy[i] = vy
  fvz[i] = vz
  fSize[i] = size
}

// ---- Ripple rings on the ground ----
const gLife = new Float32Array(RING_MAX)
const gMax = new Float32Array(RING_MAX)
const gx = new Float32Array(RING_MAX)
const gy = new Float32Array(RING_MAX)
const gz = new Float32Array(RING_MAX)
const gSize = new Float32Array(RING_MAX)
let gCursor = 0

const spawnRing = (x: number, y: number, z: number, size: number, life = 0.6) => {
  const i = gCursor
  gCursor = (gCursor + 1) % RING_MAX
  gLife[i] = gMax[i] = life
  gx[i] = x
  gy[i] = y
  gz[i] = z
  gSize[i] = size
}

// ---- Mist / spray puffs ----
const mLife = new Float32Array(MIST_MAX)
const mMax = new Float32Array(MIST_MAX)
const mx = new Float32Array(MIST_MAX)
const my = new Float32Array(MIST_MAX)
const mz = new Float32Array(MIST_MAX)
const mvx = new Float32Array(MIST_MAX)
const mvy = new Float32Array(MIST_MAX)
const mvz = new Float32Array(MIST_MAX)
const mSize = new Float32Array(MIST_MAX)
let mCursor = 0

const spawnMist = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number) => {
  const i = mCursor
  mCursor = (mCursor + 1) % MIST_MAX
  mLife[i] = mMax[i] = life
  mx[i] = x
  my[i] = y
  mz[i] = z
  mvx[i] = vx
  mvy[i] = vy
  mvz[i] = vz
  mSize[i] = size
}

// Metaball lumps from the emptying explosion leave rings, spray and droplets where they land
hooks.onBlobImpact = (x, y, z, size, speed) => {
  spawnRing(x, y + 0.03, z, 0.2 + size * 1.5, 1.1)
  const a = Math.random() * Math.PI * 2
  const h = 1 + Math.random() * speed * 0.3
  spawnFx(x, y + 0.05, z, Math.cos(a) * h, 1.5 + Math.random() * speed * 0.25, Math.sin(a) * h, 0.8, 0.03 + Math.random() * 0.03, 1)
  spawnMist(x, y + 0.1, z, (Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2, 0.8 + Math.random() * 0.8, 0.15 + Math.random() * 0.2)
}

// ---- Barrel water -----------------------------------------------------------
let shownFraction = 0 // smoothed fill level, so draining collapses quickly instead of popping
const waterTopY = () => BARREL_FLOOR_Y + 0.02 + shownFraction * WATER_MAX_HEIGHT

let roofSmooth = ui.roofArea
let roofTarget = ui.roofArea
let collectedSinceSync = 0
let usedSinceSync = 0
let sampleTimer = 0
let syncTimer = 0
let lastOverflow = -10
let emptyHandled = 0
let emptyingUntil = 0
let shockTime = -1
let wetness = 0

const collect = (elapsed: number, x: number, z: number) => {
  addRipple(x - BARREL_X, z - BARREL_Z, 0.5)
  if (sim.volume < ui.capacity) {
    sim.volume = Math.min(ui.capacity, sim.volume + litresPerDrop)
    collectedSinceSync += litresPerDrop
    if (Math.random() < 0.25) spawnFx(x, waterTopY(), z, (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 0.8, 0.35, 0.025)
  } else {
    // Tank is full: the water spills over the rim
    lastOverflow = elapsed
    const a = Math.random() * Math.PI * 2
    spawnFx(BARREL_X + Math.cos(a) * barrelRadius, BARREL_TOP_Y, BARREL_Z + Math.sin(a) * barrelRadius, Math.cos(a) * 1.2, 0.5, Math.sin(a) * 1.2, 1.2, 0.035)
  }
}

// The explosion droplets are released over a handful of frames, so the spike is spread out instead of one big hitch
let pendingSpray = 0
let pendingTop = 0
const SPRAY_PER_FRAME = 40

const releaseSpray = (count: number) => {
  const top = pendingTop
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * WATER_RADIUS
    const wide = Math.random() < 0.55
    const horizontal = wide ? 2 + Math.random() * 6 : Math.random() * 1.5
    const up = wide ? 4 + Math.random() * 9 : 9 + Math.random() * 11
    spawnFx(
      BARREL_X + Math.cos(a) * r, top + 0.05, BARREL_Z + Math.sin(a) * r,
      Math.cos(a) * horizontal, up, Math.sin(a) * horizontal,
      2.5 + Math.random() * 2, 0.04 + Math.random() * 0.09, 1,
    )
  }
}

const explode = () => {
  pendingTop = waterTopY()
  pendingSpray = Math.min(300, Math.floor(60 + sim.volume * 0.8))
  // Fine spray that hangs in the air
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * Math.PI * 2
    const h = 0.5 + Math.random() * 3
    spawnMist(
      BARREL_X + Math.cos(a) * Math.random() * WATER_RADIUS, pendingTop + 0.1, BARREL_Z + Math.sin(a) * Math.random() * WATER_RADIUS,
      Math.cos(a) * h, 1 + Math.random() * 4, Math.sin(a) * h,
      1.2 + Math.random() * 1.2, 0.25 + Math.random() * 0.35,
    )
  }
  requestBlobExplosion(BARREL_X, pendingTop + 0.05, BARREL_Z, sim.volume)
  sim.volume = 0
  shockTime = 0
}

// ---- Instance matrix helpers ----
const writeSphere = (arr: Float32Array, i: number, x: number, y: number, z: number, s: number) => {
  const o = i * 16
  arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0
  arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0
  arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1
}


// A water blob with its long axis along (ax, ay, az), squashed along the normal n (n must be perpendicular to the axis)
const writeBlob = (
  arr: Float32Array, i: number, x: number, y: number, z: number,
  ax: number, ay: number, az: number, nx: number, ny: number, nz: number,
  length: number, width: number, thin: number,
) => {
  let px = ay * nz - az * ny
  let py = az * nx - ax * nz
  let pz = ax * ny - ay * nx
  const pl = Math.hypot(px, py, pz) || 1
  px /= pl; py /= pl; pz /= pl
  const o = i * 16
  arr[o] = px * width; arr[o + 1] = py * width; arr[o + 2] = pz * width; arr[o + 3] = 0
  arr[o + 4] = ax * length; arr[o + 5] = ay * length; arr[o + 6] = az * length; arr[o + 7] = 0
  arr[o + 8] = nx * thin; arr[o + 9] = ny * thin; arr[o + 10] = nz * thin; arr[o + 11] = 0
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1
}

// A droplet in flight: stretched along its velocity into a teardrop-ish ellipsoid, volume roughly kept
const writeFlyingDrop = (arr: Float32Array, i: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number) => {
  const speed = Math.hypot(vx, vy, vz)
  if (speed < 0.5) {
    writeSphere(arr, i, x, y, z, size)
    return
  }
  const ax = vx / speed
  const ay = vy / speed
  const az = vz / speed
  // any unit vector perpendicular to the axis
  const useUp = Math.abs(ay) < 0.9
  const rx = useUp ? 0 : 1
  const ry = useUp ? 1 : 0
  const dot = rx * ax + ry * ay
  let nx = rx - ax * dot
  let ny = ry - ay * dot
  let nz = -az * dot
  const nl = Math.hypot(nx, ny, nz) || 1
  nx /= nl; ny /= nl; nz /= nl
  const stretch = 1 + Math.min(2.5, speed * 0.15)
  const side = size / Math.sqrt(stretch)
  writeBlob(arr, i, x, y, z, ax, ay, az, nx, ny, nz, size * stretch, side, side)
}

// A streak: leaning with the wind (rotation about Z), thickness w, length l
const writeDrop = (arr: Float32Array, i: number, x: number, y: number, z: number, w: number, l: number, cosT: number, sinT: number) => {
  const o = i * 16
  arr[o] = cosT * w; arr[o + 1] = sinT * w; arr[o + 2] = 0; arr[o + 3] = 0
  arr[o + 4] = -sinT * l; arr[o + 5] = cosT * l; arr[o + 6] = 0; arr[o + 7] = 0
  arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = w; arr[o + 11] = 0
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1
}

// ---- Main loop ---------------------------------------------------------------
const { onBeforeRender } = useLoop()

onBeforeRender(({ delta, elapsed }) => {
  const dt = Math.min(delta, 0.05)
  const drops = dropsRef.value
  const runoff = runoffRef.value
  const fxMesh = fxRef.value
  const rings = ringsRef.value
  const mist = mistRef.value
  if (!drops || !runoff || !fxMesh || !rings || !mist) return

  // Emptying request from the UI
  if (sim.emptyRequests !== emptyHandled) {
    emptyHandled = sim.emptyRequests
    if (sim.volume > 0.5) {
      explode()
      emptyingUntil = elapsed + 1.2
    }
  }

  if (pendingSpray > 0) {
    const batch = Math.min(SPRAY_PER_FRAME, pendingSpray)
    releaseSpray(batch)
    pendingSpray -= batch
  }

  // Gusting wind
  const wind = WIND * (ui.apocalypse ? 2.2 : 1) * (1 + 0.6 * Math.sin(elapsed * 0.37) + 0.3 * Math.sin(elapsed * 1.13 + 2))
  const tilt = Math.atan2(wind, 22)
  const cosT = Math.cos(tilt)
  const sinT = Math.sin(tilt)
  const ringChance = 0.03 + 0.07 * wetness

  // Rain drops
  const count = Math.floor(MAX_DROPS * ui.intensity)
  const mm = ui.intensity > 0.001 ? mmFromIntensity(ui.intensity) : 0
  const geometry = houseGeometry(ui.roofArea)
  world.roofBackZ = geometry.roofBackZ
  world.chimneyZ = geometry.chimneyZ
  world.gutterTilt = geometry.gutterTilt
  world.wallBackZ = geometry.wallBackZ
  const rainCenterZ = (ROOF_FRONT_Z + geometry.roofBackZ) / 2 // keep the rain over the whole (possibly long) roof
  const catchment = geometry.roofLen * eaveX * 2 // m2 of roof (both slopes) that drains into the gutters
  const hitsPerSecond = count * (AVG_FALL_SPEED / (SPAWN_Y + 2)) * (catchment / (AREA * AREA))
  litresPerDrop = hitsPerSecond > 0 ? ((mm * catchment * RUNOFF_COEFFICIENT) / 3600 * ui.timeLapse) / hitsPerSecond : 0

  // Automatic roof size: the area that collects the daily use from the average rainfall of the location
  if (ui.roofAuto) {
    const needed = ui.avgRainMmDay > 0 ? ui.dailyUseL / (ui.avgRainMmDay * RUNOFF_COEFFICIENT) : MAX_ROOF_AREA
    roofTarget = Math.max(MIN_ROOF_AREA, Math.min(MAX_ROOF_AREA, needed))
    roofSmooth += (roofTarget - roofSmooth) * (1 - Math.exp(-dt * 0.8))
  } else {
    roofSmooth = ui.roofArea
    roofTarget = ui.roofArea
  }
  drops.count = count
  ;(drops.material as any).opacity = 0.45 * (0.3 + 0.7 * sky.day) // rain is hard to see at night
  const dropArr = drops.instanceMatrix.array as Float32Array
  for (let i = 0; i < count; i++) {
    const y = dy[i] - fall[i] * dt
    const x = dx[i] + wind * dt
    const z = dz[i]
    let hit = false

    const flood = world.floodY
    if (y < Math.max(4.4, flood + 0.2)) {
      const ax = Math.abs(x)
      if (y < flood) {
        // Lands on the flood water: a ring on its surface
        if (x * x + z * z < 900 && Math.random() < 0.05) spawnRing(x, flood + 0.05, z, 0.1 + Math.random() * 0.15)
        hit = true
      } else if (ax <= eaveX + 0.05 && z <= ROOF_FRONT_Z && z >= world.roofBackZ && y < roofSurfaceY(ax)) {
        // Hit the roof: the water runs down towards the nearest eave
        const ry0 = roofSurfaceY(ax)
        if (!spawnRunoff(x > 0 ? 0 : 1, x, ry0, z, 0.3 + Math.random() * 1.8) ) collect(elapsed, BARREL_X, BARREL_Z)
        if (Math.random() < 0.2) spawnFx(x, ry0, z, (Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5), 0.3, 0.02)
        hit = true
      } else if (y < BARREL_TOP_Y && (x - BARREL_X) ** 2 + (z - BARREL_Z) ** 2 < (barrelRadius - 0.05) ** 2) {
        // Straight into the barrel
        collect(elapsed, x, z)
        hit = true
      } else if (y < 3 && y < terrainHeight(x, z)) {
        const gh = Math.max(0, terrainHeight(x, z))
        if (Math.random() < 0.04) {
          for (let k = 0; k < 2; k++) spawnFx(x, gh, z, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 0.4, 0.025)
        }
        // Splash rings expand on the flat ground near the house, more of them once puddles form
        if (x * x + z * z < 169 && Math.random() < ringChance) spawnRing(x, gh + 0.03, z, 0.05 + Math.random() * 0.1)
        hit = true
      }
    }

    if (hit) {
      dx[i] = (Math.random() - 0.5) * AREA
      dz[i] = rainCenterZ + (Math.random() - 0.5) * AREA
      dy[i] = SPAWN_Y + Math.random() * 4
      newDropSize(i)
      writeSphere(dropArr, i, 0, -100, 0, 0)
    } else {
      dx[i] = x
      dy[i] = y
      writeDrop(dropArr, i, x, y, z, dSize[i], fall[i] / 22, cosT, sinT)
    }
  }
  drops.instanceMatrix.needsUpdate = true

  // Runoff particles
  const runoffArr = runoff.instanceMatrix.array as Float32Array
  for (let i = 0; i < RUNOFF_MAX; i++) {
    if (!rActive[i]) {
      writeSphere(runoffArr, i, 0, -100, 0, 0)
      continue
    }
    const kind = rKind[i]
    if (kind === 5) {
      // Thin film left behind by a sliding bead: evaporates
      rPin[i] -= dt
      if (rPin[i] <= 0) {
        rActive[i] = 0
        continue
      }
    } else if (kind === 0 || kind === 1) {
      if (rPin[i] > 0) {
        // Stuck to the tiles by surface tension, slowly collecting more water until heavy enough to slide
        rPin[i] -= dt
        rMass[i] += 0.12 * dt
      } else {
        // Sliding: heavier beads accelerate faster, gather water as they go and leave a thin trail
        rSpeed[i] += (2.6 * rMass[i] - 1.2 * rSpeed[i]) * dt
        rMass[i] += 0.08 * dt
        const step = rSpeed[i] * ROOF_COS * dt
        rx[i] += kind === 0 ? step : -step
        rTrail[i] -= dt
        if (rTrail[i] <= 0 && rSpeed[i] > 0.4) {
          rTrail[i] = 0.16
          spawnRunoff(5, rx[i], ry[i], rz[i], 0.8 + Math.random() * 1.2, 0.35)
        }
      }
      const ax = Math.abs(rx[i])
      if (ax >= eaveX) {
        if (kind === 0) {
          rKind[i] = 2
          rx[i] = gutterX + (Math.random() - 0.5) * 0.08
          rSpeed[i] = 1.4 + Math.random() * 0.4
        } else {
          // Left slope: into the left gutter, which runs to its own downspout and an underground pipe to the tanks
          rKind[i] = 6
          rx[i] = -gutterX + (Math.random() - 0.5) * 0.08
          rSpeed[i] = 1.4 + Math.random() * 0.4
        }
      } else {
        ry[i] = roofSurfaceY(ax) + 0.02
      }
    } else if (kind === 6) {
      // Left gutter: the water ends up in the tanks through the underground pipe
      rz[i] += rSpeed[i] * dt
      ry[i] = gutterWorldY(rz[i], world.gutterTilt)
      if (rz[i] >= downspoutZ) {
        collect(elapsed, BARREL_X, BARREL_Z)
        rActive[i] = 0
        continue
      }
    } else if (kind === 2) {
      // Flowing along the gutter towards the downspout
      rz[i] += rSpeed[i] * dt
      ry[i] = gutterWorldY(rz[i], world.gutterTilt)
      if (rz[i] >= downspoutZ) {
        rKind[i] = 3
        rz[i] = downspoutZ
        rx[i] = gutterX
        rSpeed[i] = 0
      }
    } else {
      // Falling down the downspout into the barrel
      rSpeed[i] += GRAVITY * dt
      ry[i] -= rSpeed[i] * dt
      if (ry[i] <= waterTopY()) {
        collect(elapsed, BARREL_X, BARREL_Z)
        rActive[i] = 0
        continue
      }
    }
    const size = 0.8 + (i % 7) * 0.07
    if (kind === 5) {
      // Thin film: a small flat smear that shrinks as it evaporates
      const fade = Math.min(1, rPin[i] * 1.5)
      writeBlob(runoffArr, i, rx[i], ry[i] + 0.008, rz[i], 1, 0, 0, 0, 1, 0, 0.022 * size * fade, 0.016 * size * fade, 0.006 * fade)
    } else if (kind === 0 || kind === 1) {
      const dir = kind === 0 ? 1 : -1
      const sinP = roofSlope * ROOF_COS
      const m = Math.sqrt(rMass[i])
      if (rPin[i] > 0) {
        // Stuck: a round dome bead (contact angle), slightly squashed downhill by gravity
        writeBlob(runoffArr, i, rx[i], ry[i] + 0.01, rz[i], dir * ROOF_COS, -sinP, 0, dir * sinP, ROOF_COS, 0, 0.026 * m * size, 0.024 * m * size, 0.016 * m * size)
      } else {
        // Sliding: stretched along the slope, round head and tapered by speed
        const stretch = 1 + rSpeed[i] * 0.55
        writeBlob(runoffArr, i, rx[i], ry[i] + 0.012, rz[i], dir * ROOF_COS, -sinP, 0, dir * sinP, ROOF_COS, 0, 0.03 * m * size * stretch, 0.026 * m * size, 0.014 * m * size)
      }
    } else if (kind === 2 || kind === 6) {
      // A small stream in the gutter, elongated along the flow
      writeBlob(runoffArr, i, rx[i], ry[i] + 0.01, rz[i], 0, 0, 1, 0, 1, 0, 0.07 * size, 0.045 * size, 0.025 * size)
    } else {
      // Falling in the downspout: a vertical streak that stretches as it accelerates
      writeBlob(runoffArr, i, rx[i], ry[i], rz[i], 0, -1, 0, 1, 0, 0, 0.03 * size + rSpeed[i] * 0.02, 0.03 * size, 0.03 * size)
    }
  }
  runoff.instanceMatrix.needsUpdate = true

  // FX particles
  const fxArr = fxMesh.instanceMatrix.array as Float32Array
  for (let i = 0; i < FX_MAX; i++) {
    if (fLife[i] <= 0) {
      if (fLife[i] === 0) continue
      fLife[i] = 0
      writeSphere(fxArr, i, 0, -100, 0, 0)
      continue
    }
    fLife[i] -= dt
    fvy[i] -= GRAVITY * dt
    // Air drag: small droplets slow down faster, explosion droplets less so
    const drag = 1 - (fKind[i] === 1 ? 0.3 : 0.8) * dt
    fvx[i] *= drag
    fvz[i] *= drag
    fx[i] += fvx[i] * dt
    fy[i] += fvy[i] * dt
    fz[i] += fvz[i] * dt

    const x = fx[i]
    const y = fy[i]
    const z = fz[i]
    let dead = fLife[i] <= 0

    // Bounce off the underside of the roof
    const ax = Math.abs(x)
    if (!dead && fvy[i] > 0 && ax <= eaveX && z <= ROOF_FRONT_Z && z >= world.roofBackZ) {
      const roofY = roofSurfaceY(ax)
      if (y > roofY - 0.4 && y < roofY + 0.1) {
        fvy[i] *= -0.25
        fy[i] = roofY - 0.4
      }
    }

    // Falling back into the barrel
    if (!dead && fvy[i] < 0 && y < BARREL_TOP_Y && y > BARREL_FLOOR_Y && (x - BARREL_X) ** 2 + (z - BARREL_Z) ** 2 < WATER_RADIUS ** 2) {
      if (fKind[i] === 1 && Math.random() < 0.3) addRipple(x - BARREL_X, z - BARREL_Z, 0.6)
      dead = true
    }

    // Ground
    if (!dead && y < 3) {
      const gh = terrainHeight(x, z)
      if (y < gh) {
        if (fKind[i] === 1 && fvy[i] < -4) {
          if (Math.random() < 0.08) {
            spawnFx(x, gh + 0.02, z, fvx[i] * 0.3 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2, fvz[i] * 0.3 + (Math.random() - 0.5) * 2, 0.6, 0.03)
          }
          if (Math.random() < 0.06) spawnRing(x, gh + 0.03, z, 0.12 + Math.random() * 0.25, 0.9)
          if (Math.random() < 0.02) spawnMist(x, gh + 0.1, z, (Math.random() - 0.5) * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5, 1 + Math.random(), 0.2 + Math.random() * 0.25)
        }
        dead = true
      }
    }

    if (dead) {
      fLife[i] = -1
      writeSphere(fxArr, i, 0, -100, 0, 0)
    } else {
      writeFlyingDrop(fxArr, i, x, fy[i], z, fvx[i], fvy[i], fvz[i], fSize[i] * Math.min(1, fLife[i] * 3))
    }
  }
  fxMesh.instanceMatrix.needsUpdate = true

  // Ripple rings
  const ringArr = rings.instanceMatrix.array as Float32Array
  const ringColors = rings.instanceColor ? (rings.instanceColor.array as Float32Array) : null
  for (let i = 0; i < RING_MAX; i++) {
    if (gLife[i] <= 0) {
      if (gLife[i] === 0) continue
      gLife[i] = 0
      writeSphere(ringArr, i, 0, -100, 0, 0)
      if (ringColors) ringColors[i * 3] = ringColors[i * 3 + 1] = ringColors[i * 3 + 2] = 0
      continue
    }
    gLife[i] -= dt
    const t = 1 - Math.max(gLife[i], 0) / gMax[i]
    writeSphere(ringArr, i, gx[i], gy[i], gz[i], gSize[i] * (0.3 + t * 2.2))
    if (ringColors) {
      const fade = (1 - t) * (1 - t) * 0.7
      ringColors[i * 3] = fade * 0.7
      ringColors[i * 3 + 1] = fade * 0.85
      ringColors[i * 3 + 2] = fade
    }
    if (gLife[i] <= 0) gLife[i] = -1
  }
  rings.instanceMatrix.needsUpdate = true
  if (rings.instanceColor) rings.instanceColor.needsUpdate = true

  // Mist puffs: slow, drifting, growing
  const mistArr = mist.instanceMatrix.array as Float32Array
  for (let i = 0; i < MIST_MAX; i++) {
    if (mLife[i] <= 0) {
      if (mLife[i] === 0) continue
      mLife[i] = 0
      writeSphere(mistArr, i, 0, -100, 0, 0)
      continue
    }
    mLife[i] -= dt
    const damp = 1 - 1.8 * dt
    mvx[i] *= damp
    mvz[i] *= damp
    mvy[i] = mvy[i] * damp + 0.4 * dt
    mx[i] += mvx[i] * dt
    my[i] += mvy[i] * dt
    mz[i] += mvz[i] * dt
    const t = 1 - Math.max(mLife[i], 0) / mMax[i]
    writeSphere(mistArr, i, mx[i], my[i], mz[i], mSize[i] * (0.6 + t) * Math.min(1, mLife[i] * 3) * Math.min(1, t * 6 + 0.2))
    if (mLife[i] <= 0) mLife[i] = -1
  }
  mist.instanceMatrix.needsUpdate = true

  if (sim.volume > ui.capacity || world.floodY > BARREL_TOP_Y) sim.volume = ui.capacity // the flood also fills the tank

  // Water drawn from the tank (time-lapse applies, so usage keeps pace with the faster filling)
  const drawn = Math.min(sim.volume, (ui.dailyUseL / 86400) * ui.timeLapse * dt)
  sim.volume -= drawn
  usedSinceSync += drawn

  // Water level in the barrel
  const target = sim.volume / ui.capacity
  shownFraction += (target - shownFraction) * (1 - Math.exp(-dt * (target < shownFraction ? 14 : 6)))
  const body = waterRef.value
  const h = shownFraction * WATER_MAX_HEIGHT
  if (body) {
    body.visible = h > 0.02
    body.scale.y = Math.max(h, 0.001)
    body.position.y = BARREL_FLOOR_Y + 0.02 + h / 2
  }
  water.topY = waterTopY()
  water.level = shownFraction

  // Shock ring of the explosion
  const shock = shockRef.value
  if (shock) {
    if (shockTime >= 0) {
      shockTime += dt
      const t = shockTime / 0.9
      shock.visible = t < 1
      shock.scale.setScalar(1 + shockTime * 14)
      ;(shock.material as MeshBasicMaterial).opacity = 0.8 * (1 - t)
      if (t >= 1) shockTime = -1
    } else {
      shock.visible = false
    }
  }

  // Surfaces get wet while it rains and dry out slowly afterwards
  wetness = Math.min(1, Math.max(0, wetness + (ui.intensity > 0.02 ? ui.intensity / 45 : -1 / 240) * dt))

  // One history sample per second for the charts
  sampleTimer += dt
  if (sampleTimer >= 1) {
    sampleTimer -= 1
    pushSample(mm, sim.volume, ui.flowRate * 60, ui.usageRate * 60)
  }

  // Sync UI state ~10x per second
  syncTimer += dt
  if (syncTimer >= 0.1) {
    ui.flowRate = ui.flowRate * 0.6 + (collectedSinceSync / syncTimer) * 0.4
    ui.usageRate = ui.usageRate * 0.6 + (usedSinceSync / syncTimer) * 0.4
    ui.usedTotal += usedSinceSync

    usedSinceSync = 0
    collectedSinceSync = 0
    syncTimer = 0
    ui.volume = sim.volume
    if (ui.roofAuto) ui.roofArea = roofSmooth
    ui.wetness = wetness
    ui.overflowing = elapsed - lastOverflow < 1
    ui.emptying = elapsed < emptyingUntil
  }
})
</script>

<template>
  <!-- Falling rain -->
  <TresInstancedMesh ref="dropsRef" :args="[null, null, MAX_DROPS]" :frustum-culled="false">
    <TresBoxGeometry :args="[0.012, 0.55, 0.012]" />
    <TresMeshBasicMaterial color="#b8d4ee" transparent :opacity="0.45" :depth-write="false" />
  </TresInstancedMesh>

  <!-- Water running over the roof, through the gutter and down the downspout -->
  <TresInstancedMesh ref="runoffRef" :args="[runoffGeometry, runoffMaterial, RUNOFF_MAX]" :frustum-culled="false" />

  <!-- Splashes and the emptying explosion -->
  <TresInstancedMesh ref="fxRef" :args="[fxGeometry, fxMaterial, FX_MAX]" :frustum-culled="false" />

  <!-- Ripple rings on the ground -->
  <TresInstancedMesh ref="ringsRef" :args="[ringGeometry, ringMaterial, RING_MAX]" :frustum-culled="false" />

  <!-- Spray / mist -->
  <TresInstancedMesh ref="mistRef" :args="[mistGeometry, mistMaterial, MIST_MAX]" :frustum-culled="false" />

  <!-- Body of water inside the barrel (the animated surface is drawn by BarrelWater) -->
  <TresMesh ref="waterRef" :position="[BARREL_X, BARREL_FLOOR_Y + 0.5, BARREL_Z]" :scale="[1, 0.001, 1]">
    <TresCylinderGeometry :args="[WATER_RADIUS, WATER_RADIUS, 1, 24, 1, true]" />
    <TresMeshStandardMaterial color="#17383f" transparent :opacity="0.85" :roughness="0.08" :metalness="0.1" :side="DoubleSide" />
  </TresMesh>

  <!-- Shock ring of the explosion -->
  <TresMesh ref="shockRef" :position="[BARREL_X, HOUSE_Y - 0.95, BARREL_Z]" :rotation="[-Math.PI / 2, 0, 0]" :visible="false">
    <TresRingGeometry :args="[0.6, 0.75, 48]" />
    <TresMeshBasicMaterial color="#bfe8ff" transparent :opacity="0.8" :depth-write="false" />
  </TresMesh>
</template>
