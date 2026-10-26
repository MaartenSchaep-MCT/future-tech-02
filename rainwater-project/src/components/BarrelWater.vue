<script setup lang="ts">
import { shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import { RingGeometry } from 'three'
import type { Mesh } from 'three'
import { gutterX, downspoutZ, DOWNSPOUT_BOTTOM_Y } from '../scene/config'
import { ui } from '../scene/rainState'
import { water, rippleQueue } from '../scene/water'

// Water surface of the barrel: a 2D wave-equation height field. Every drop that lands, and the
// stream from the downspout, pushes the surface down; the waves then travel, reflect off the wall and fade.
const BARREL_X = gutterX
const BARREL_Z = downspoutZ
const R = 0.5 // radius of the water surface
const N = 40 // grid resolution
const CELL = (2 * R) / (N - 1)
const WAVE_SPEED = 1.2
const K = (WAVE_SPEED / CELL) ** 2
const DAMPING = 1.6
const MAX_HEIGHT = 0.05
const STEP = 1 / 120

const h = new Float32Array(N * N)
const v = new Float32Array(N * N)
const inside = new Uint8Array(N * N)
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = -R + i * CELL
    const z = -R + j * CELL
    inside[j * N + i] = x * x + z * z < R * R ? 1 : 0
  }
}

const inject = (x: number, z: number, strength: number) => {
  const gi = (x + R) / CELL
  const gj = (z + R) / CELL
  const ci = Math.round(gi)
  const cj = Math.round(gj)
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      const i = ci + di
      const j = cj + dj
      if (i < 0 || j < 0 || i >= N || j >= N || !inside[j * N + i]) continue
      const w = Math.exp(-((i - gi) ** 2 + (j - gj) ** 2) / 1.2)
      v[j * N + i] -= strength * w
    }
  }
}

const step = (dt: number) => {
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i
      if (!inside[idx]) continue
      const c = h[idx]
      // Neighbours outside the barrel reflect (same height as the cell itself)
      const l = i > 0 && inside[idx - 1] ? h[idx - 1] : c
      const r = i < N - 1 && inside[idx + 1] ? h[idx + 1] : c
      const u = j > 0 && inside[idx - N] ? h[idx - N] : c
      const d = j < N - 1 && inside[idx + N] ? h[idx + N] : c
      v[idx] += K * (l + r + u + d - 4 * c) * dt
      v[idx] *= 1 - DAMPING * dt
    }
  }
  for (let idx = 0; idx < N * N; idx++) {
    if (!inside[idx]) continue
    h[idx] = Math.max(-MAX_HEIGHT, Math.min(MAX_HEIGHT, h[idx] + v[idx] * dt))
  }
}

const sample = (x: number, z: number) => {
  const gi = Math.min(N - 1.001, Math.max(0, (x + R) / CELL))
  const gj = Math.min(N - 1.001, Math.max(0, (z + R) / CELL))
  const i = Math.floor(gi)
  const j = Math.floor(gj)
  const fi = gi - i
  const fj = gj - j
  const a = h[j * N + i]
  const b = h[j * N + i + 1]
  const c = h[(j + 1) * N + i]
  const d = h[(j + 1) * N + i + 1]
  return (a * (1 - fi) + b * fi) * (1 - fj) + (c * (1 - fi) + d * fi) * fj
}

const surfaceGeometry = new RingGeometry(0.0001, R - 0.01, 64, 20).rotateX(-Math.PI / 2)
const surfaceRef = shallowRef<Mesh | null>(null)
const streamRef = shallowRef<Mesh | null>(null)
const edgeRef = shallowRef<Mesh | null>(null)

// A few leaves floating on the surface: they drift, bob on the waves and tilt with the slope
const LEAVES = 5
const leafRefs = shallowRef<Mesh[]>([])
const leaves = Array.from({ length: LEAVES }, (_, i) => ({
  x: Math.cos(i * 2.4) * 0.28,
  z: Math.sin(i * 2.4) * 0.28,
  angle: i * 1.3,
  drift: i * 1.7,
}))
const setLeaf = (el: Mesh | null, i: number) => {
  if (el) leafRefs.value[i] = el
}
let accumulator = 0
let clock = 0

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const dt = Math.min(delta, 0.05)

  // Impacts queued by RainSystem
  for (let k = 0; k < rippleQueue.length; k += 3) inject(rippleQueue[k], rippleQueue[k + 1], rippleQueue[k + 2])
  rippleQueue.length = 0

  // The inflow stream keeps the surface churning under the downspout
  const flow = ui.flowRate
  if (flow > 0.03 && water.level > 0.02) {
    inject((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, Math.min(flow, 3) * 0.5)
  }

  accumulator += dt
  while (accumulator >= STEP) {
    step(STEP)
    accumulator -= STEP
  }

  const surface = surfaceRef.value
  if (surface) {
    surface.visible = water.level > 0.02
    surface.position.y = water.topY
    const pos = surfaceGeometry.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setY(i, sample(pos.getX(i), pos.getZ(i)))
    pos.needsUpdate = true
    surfaceGeometry.computeVertexNormals()
  }

  // Meniscus where the water meets the barrel wall
  if (edgeRef.value) {
    edgeRef.value.visible = water.level > 0.02
    edgeRef.value.position.y = water.topY
  }

  // Floating leaves
  clock += dt
  leaves.forEach((leaf, i) => {
    const mesh = leafRefs.value[i]
    if (!mesh) return
    mesh.visible = water.level > 0.05
    if (!mesh.visible) return
    leaf.x += Math.sin(clock * 0.3 + leaf.drift) * 0.01 * dt * 10
    leaf.z += Math.cos(clock * 0.27 + leaf.drift * 1.3) * 0.01 * dt * 10
    const dist = Math.hypot(leaf.x, leaf.z)
    if (dist > R - 0.08) {
      leaf.x *= (R - 0.08) / dist
      leaf.z *= (R - 0.08) / dist
    }
    const slopeX = sample(leaf.x + 0.03, leaf.z) - sample(leaf.x - 0.03, leaf.z)
    const slopeZ = sample(leaf.x, leaf.z + 0.03) - sample(leaf.x, leaf.z - 0.03)
    leaf.angle += slopeX * 2 * dt
    mesh.position.set(BARREL_X + leaf.x, water.topY + sample(leaf.x, leaf.z) + 0.004, BARREL_Z + leaf.z)
    mesh.rotation.set(slopeZ * 6, leaf.angle, -slopeX * 6)
  })

  const stream = streamRef.value
  if (stream) {
    const length = DOWNSPOUT_BOTTOM_Y - water.topY
    stream.visible = flow > 0.03 && length > 0.02
    if (stream.visible) {
      const radius = Math.min(0.065, 0.015 + Math.sqrt(flow) * 0.02)
      stream.scale.set(radius, length, radius)
      stream.position.y = water.topY + length / 2
    }
  }
})
</script>

<template>
  <TresMesh ref="surfaceRef" :geometry="surfaceGeometry" :position="[BARREL_X, 0, BARREL_Z]">
    <TresMeshPhysicalMaterial
      color="#1d4a50"
      :roughness="0.015"
      :metalness="0"
      :clearcoat="1"
      :clearcoat-roughness="0.02"
      :ior="1.33"
      :specular-intensity="1"
      transparent
      :opacity="0.93"
      :env-map-intensity="6"
    />
  </TresMesh>

  <!-- Meniscus: a thin bright rim where the water climbs the wall -->
  <TresMesh ref="edgeRef" :position="[BARREL_X, 0, BARREL_Z]" :rotation="[Math.PI / 2, 0, 0]" :visible="false">
    <TresTorusGeometry :args="[R, 0.012, 6, 48]" />
    <TresMeshStandardMaterial color="#9fc8c8" transparent :opacity="0.55" :roughness="0.1" />
  </TresMesh>

  <!-- Floating leaves -->
  <TresMesh v-for="i in LEAVES" :key="i" :ref="(el: any) => setLeaf(el, i - 1)" :scale="[1, 0.15, 0.6]" :visible="false">
    <TresSphereGeometry :args="[0.06, 8, 6]" />
    <TresMeshStandardMaterial :color="i % 2 ? '#4a5a22' : '#6b4a1e'" :roughness="0.9" />
  </TresMesh>

  <!-- Stream falling out of the downspout -->
  <TresMesh ref="streamRef" :position="[BARREL_X, 1, BARREL_Z]" :visible="false">
    <TresCylinderGeometry :args="[1, 0.85, 1, 10, 1, true]" />
    <TresMeshStandardMaterial color="#e6f4f8" transparent :opacity="0.5" :roughness="0.05" />
  </TresMesh>
</template>
