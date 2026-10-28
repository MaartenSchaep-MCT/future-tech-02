<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { useLoop } from '@tresjs/core'
import { SphereGeometry } from 'three'
import type { InstancedMesh } from 'three'
import { createClearWaterMaterial } from '../scene/waterMaterial'
import {
  roofSurfaceY, eaveX, ROOF_FRONT_Z, gutterX, downspoutZ, BARREL_TOP_Y, BARREL_FLOOR_Y, barrelRadius,
} from '../scene/config'
import { terrainHeight } from '../scene/terrain'
import { blobRequests, hooks } from '../scene/water'
import { world } from '../scene/rainState'

// The bulk of the water thrown out when the barrel is emptied: a limited number of lumps of water with real
// ballistic physics (gravity, drag, bounce off the roof, flattening and spreading on the ground). Each lump is
// one instanced ellipsoid, stretched along its velocity while it flies, so the whole effect is a single draw call.
const MAX_BLOBS = 90
const GRAVITY = 9.8

const geometry = new SphereGeometry(1, 12, 8)
// Thick water is less see-through than a droplet, hence the higher minimum opacity
const material = createClearWaterMaterial(0.25, 0.95, '#e4f3fa')
const meshRef = shallowRef<InstancedMesh | null>(null)

const active = new Uint8Array(MAX_BLOBS)
const delay = new Float32Array(MAX_BLOBS) // staggered release so the water leaves as a column
const px = new Float32Array(MAX_BLOBS)
const py = new Float32Array(MAX_BLOBS)
const pz = new Float32Array(MAX_BLOBS)
const vx = new Float32Array(MAX_BLOBS)
const vy = new Float32Array(MAX_BLOBS)
const vz = new Float32Array(MAX_BLOBS)
const radius = new Float32Array(MAX_BLOBS)
const grounded = new Uint8Array(MAX_BLOBS)

let live = 0

const launch = (x: number, y: number, z: number, volume: number) => {
  const n = Math.min(MAX_BLOBS, Math.floor(30 + volume * 0.2))
  let launched = 0
  for (let i = 0; i < MAX_BLOBS && launched < n; i++) {
    if (active[i]) continue
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * barrelRadius * 0.55
    const column = Math.random() < 0.6
    const spread = column ? Math.random() * 1.4 : 2 + Math.random() * 4
    active[i] = 1
    grounded[i] = 0
    delay[i] = Math.random() * 0.22
    px[i] = x + Math.cos(a) * r
    py[i] = y
    pz[i] = z + Math.sin(a) * r
    vx[i] = Math.cos(a) * spread
    vz[i] = Math.sin(a) * spread
    vy[i] = column ? 6 + Math.random() * 5 : 3.5 + Math.random() * 4
    radius[i] = 0.1 + Math.random() * 0.14
    launched++
  }
  live = Math.max(live, launched)
}

const hide = (arr: Float32Array, i: number) => {
  const o = i * 16
  arr.fill(0, o, o + 16)
  arr[o + 13] = -100
  arr[o + 15] = 1
}

// Instances start as identity matrices (a unit sphere at the origin), so hide them all once the mesh exists
watch(meshRef, (mesh) => {
  if (!mesh) return
  const arr = mesh.instanceMatrix.array as Float32Array
  for (let i = 0; i < MAX_BLOBS; i++) hide(arr, i)
  mesh.instanceMatrix.needsUpdate = true
}, { immediate: true })

const writeScaled = (arr: Float32Array, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
  const o = i * 16
  arr.fill(0, o, o + 16)
  arr[o] = sx
  arr[o + 5] = sy
  arr[o + 10] = sz
  arr[o + 12] = x
  arr[o + 13] = y
  arr[o + 14] = z
  arr[o + 15] = 1
}

// Ellipsoid with its long axis along the unit vector (ax, ay, az)
const writeStretched = (arr: Float32Array, i: number, x: number, y: number, z: number, ax: number, ay: number, az: number, length: number, width: number) => {
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
  const bx = ay * nz - az * ny
  const by = az * nx - ax * nz
  const bz = ax * ny - ay * nx
  const o = i * 16
  arr[o] = bx * width; arr[o + 1] = by * width; arr[o + 2] = bz * width; arr[o + 3] = 0
  arr[o + 4] = ax * length; arr[o + 5] = ay * length; arr[o + 6] = az * length; arr[o + 7] = 0
  arr[o + 8] = nx * width; arr[o + 9] = ny * width; arr[o + 10] = nz * width; arr[o + 11] = 0
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1
}

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const mesh = meshRef.value
  if (!mesh) return
  const dt = Math.min(delta, 0.05)

  for (const request of blobRequests) launch(request.x, request.y, request.z, request.volume)
  blobRequests.length = 0
  if (live === 0) return

  const arr = mesh.instanceMatrix.array as Float32Array
  live = 0

  for (let i = 0; i < MAX_BLOBS; i++) {
    if (!active[i]) continue
    live++

    if (delay[i] > 0) {
      // Still inside the barrel: waits for its turn in the column
      delay[i] -= dt
      hide(arr, i)
      continue
    }

    if (!grounded[i]) {
      vy[i] -= GRAVITY * dt
      const drag = 1 - 0.15 * dt
      vx[i] *= drag
      vz[i] *= drag
    } else {
      // Spreading over the ground: friction, then the puddle thins out and soaks away
      const friction = Math.exp(-4 * dt)
      vx[i] *= friction
      vz[i] *= friction
      radius[i] -= 0.12 * dt
      if (radius[i] < 0.04) {
        active[i] = 0
        hide(arr, i)
        continue
      }
    }
    px[i] += vx[i] * dt
    py[i] += vy[i] * dt
    pz[i] += vz[i] * dt

    // Bounces off the underside of the roof
    const ax = Math.abs(px[i])
    if (!grounded[i] && vy[i] > 0 && ax <= eaveX && pz[i] <= ROOF_FRONT_Z && pz[i] >= world.roofBackZ) {
      const roofY = roofSurfaceY(ax)
      if (py[i] > roofY - 0.5 && py[i] < roofY + 0.1) {
        vy[i] *= -0.2
        py[i] = roofY - 0.5
      }
    }

    // Falls back into the barrel (and is gone)
    if (!grounded[i] && vy[i] < 0 && py[i] < BARREL_TOP_Y && py[i] > BARREL_FLOOR_Y &&
      (px[i] - gutterX) ** 2 + (pz[i] - downspoutZ) ** 2 < barrelRadius ** 2) {
      active[i] = 0
      hide(arr, i)
      continue
    }

    // Hits the ground: splashes and then spreads out as a flat lump
    const ground = terrainHeight(px[i], pz[i])
    if (py[i] < ground + radius[i] * 0.4) {
      if (!grounded[i]) {
        const speed = Math.hypot(vx[i], vy[i], vz[i])
        hooks.onBlobImpact?.(px[i], ground, pz[i], radius[i], speed)
        grounded[i] = 1
        vx[i] += (Math.random() - 0.5) * speed * 0.35
        vz[i] += (Math.random() - 0.5) * speed * 0.35
      }
      py[i] = ground + radius[i] * 0.4
      vy[i] = 0
    }

    if (grounded[i]) {
      // Flat puddle-like lump
      writeScaled(arr, i, px[i], py[i], pz[i], radius[i] * 1.9, radius[i] * 0.45, radius[i] * 1.9)
    } else {
      // In flight: stretched along the velocity, volume roughly kept
      const speed = Math.hypot(vx[i], vy[i], vz[i]) || 1
      const stretch = 1 + Math.min(1.8, speed * 0.1)
      writeStretched(arr, i, px[i], py[i], pz[i], vx[i] / speed, vy[i] / speed, vz[i] / speed, radius[i] * stretch, radius[i] / Math.sqrt(stretch))
    }
  }
  mesh.instanceMatrix.needsUpdate = true
})
</script>

<template>
  <TresInstancedMesh ref="meshRef" :args="[geometry, material, MAX_BLOBS]" :frustum-culled="false" />
</template>
