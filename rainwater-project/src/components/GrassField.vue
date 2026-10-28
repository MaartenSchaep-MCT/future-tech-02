<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, MeshStandardMaterial,
  Object3D, SphereGeometry,
} from 'three'
import type { InstancedMesh } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  attribute, cos, mix, mx_noise_float, positionGeometry, sin, smoothstep, time, uniform, vec3,
} from 'three/tsl'
import { useLoop } from '@tresjs/core'
import { terrainHeight } from '../scene/terrain'
import { ui } from '../scene/rainState'
import { sky } from '../scene/daylight'

// Dense, individually animated grass. Blades grow in tufts (neighbouring blades share a lean and a colour),
// every blade is a tapered, curved strip with a rounded cross-section in its normals, and the GPU animates them
// with travelling gust fronts plus fine flutter. Dry patches, wet darkening, back-lighting and a sprinkling of
// wildflowers finish the look.
const COUNT = 90000
const TUFT_SIZE = 9
const INNER_RADIUS = 2.2
const OUTER_RADIUS = 32

let seed = 99
const random = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

// Keep the grass off the house footprint (including the longest roof), the barrel row and the stone path
const blocked = (x: number, z: number) =>
  (x > -4.2 && x < 6.2 && z > -35 && z < 6.7) || (Math.abs(x) < 1.2 && z > 5)

// One blade: 5 rows with a gentle taper and a rounded cross-section (normals fan out across the width),
// drawn from both sides so the normal can stay pointing up
const buildBlade = () => {
  const rows = [
    { y: 0, half: 0.5 },
    { y: 0.22, half: 0.46 },
    { y: 0.45, half: 0.38 },
    { y: 0.7, half: 0.26 },
    { y: 0.88, half: 0.14 },
  ]
  const positions: number[] = []
  const normals: number[] = []
  for (const r of rows) {
    positions.push(-r.half, r.y, 0, 0, r.y, 0.04, r.half, r.y, 0) // left edge, midrib (slightly raised), right edge
    normals.push(-0.45, 1, 0.1, 0, 1, 0.2, 0.45, 1, 0.1)
  }
  positions.push(0, 1, 0)
  normals.push(0, 1, 0.2)

  const front: number[] = []
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 3
    const b = (i + 1) * 3
    front.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1)
  }
  const top = (rows.length - 1) * 3
  front.push(top, top + 1, top + 3, top + 1, top + 2, top + 3)
  const back: number[] = []
  for (let i = 0; i < front.length; i += 3) back.push(front[i], front[i + 2], front[i + 1])

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setIndex([...front, ...back])
  return geometry
}

const blade = buildBlade()
const geometry = new InstancedBufferGeometry()
geometry.index = blade.index
geometry.setAttribute('position', blade.getAttribute('position'))
geometry.setAttribute('normal', blade.getAttribute('normal'))
geometry.instanceCount = COUNT

const offsets = new Float32Array(COUNT * 3)
const data = new Float32Array(COUNT * 4) // angle, height, width, phase
const colors = new Float32Array(COUNT * 3)
const color = new Color()

interface Tuft {
  x: number
  z: number
  lean: number
  height: number
  hue: number
  saturation: number
  lightness: number
}
const makeTuft = (): Tuft | null => {
  // More blades close to the house, where the camera usually is
  const r = INNER_RADIUS + (OUTER_RADIUS - INNER_RADIUS) * Math.pow(random(), 1.35)
  const angle = random() * Math.PI * 2
  const x = Math.cos(angle) * r
  const z = Math.sin(angle) * r
  if (blocked(x, z)) return null
  // Patches of taller / drier grass using a smooth low-frequency field
  const patch = (Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17) + 1) / 2
  const meadow = (Math.sin(x * 0.07 - z * 0.05 + 2) + 1) / 2
  return {
    x,
    z,
    lean: random() * Math.PI * 2,
    height: (0.28 + random() * 0.4) * (0.75 + patch * 0.75),
    hue: 0.24 + random() * 0.05 - patch * 0.05 - meadow * 0.02,
    saturation: 0.4 + random() * 0.25,
    lightness: 0.28 + random() * 0.1 + meadow * 0.04,
  }
}

let placed = 0
while (placed < COUNT) {
  const tuft = makeTuft()
  if (!tuft) continue
  const blades = Math.min(COUNT - placed, 4 + Math.floor(random() * TUFT_SIZE))
  for (let k = 0; k < blades; k++) {
    const spread = 0.04 + random() * 0.14
    const around = random() * Math.PI * 2
    const x = tuft.x + Math.cos(around) * spread
    const z = tuft.z + Math.sin(around) * spread

    offsets[placed * 3] = x
    offsets[placed * 3 + 1] = terrainHeight(x, z) - 0.02
    offsets[placed * 3 + 2] = z

    // Blades of one tuft fan out around a shared direction
    data[placed * 4] = tuft.lean + (random() - 0.5) * 1.5 + (k / blades - 0.5) * 1.2
    data[placed * 4 + 1] = tuft.height * (0.65 + random() * 0.6)
    data[placed * 4 + 2] = 0.03 + random() * 0.03
    data[placed * 4 + 3] = random() * Math.PI * 2

    color.setHSL(tuft.hue + (random() - 0.5) * 0.015, tuft.saturation, tuft.lightness + (random() - 0.5) * 0.05)
    colors[placed * 3] = color.r
    colors[placed * 3 + 1] = color.g
    colors[placed * 3 + 2] = color.b
    placed++
  }
}
geometry.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3))
geometry.setAttribute('aData', new InstancedBufferAttribute(data, 4))
geometry.setAttribute('aColor', new InstancedBufferAttribute(colors, 3))

const uWind = uniform(0.15)
const uWet = uniform(0)
const uDay = uniform(1)

const aOffset = attribute('aOffset', 'vec3')
const aData = attribute('aData', 'vec4')
const aColor = attribute('aColor', 'vec3')
const along = positionGeometry.y

const material = new MeshStandardNodeMaterial()
material.side = DoubleSide
material.roughness = 0.7

material.positionNode = (() => {
  const angle = aData.x
  const phase = aData.w
  // Rain weighs the blades down a little
  const bladeHeight = aData.y.mul(uWet.mul(-0.18).add(1))
  const width = aData.z
  const bend = along.mul(along)

  // Gust fronts roll across the field (low-frequency noise travelling downwind) plus fast flutter on top
  const gust = mx_noise_float(vec3(aOffset.x.mul(0.09).add(time.mul(0.7)), aOffset.z.mul(0.06).add(time.mul(0.25)), 0)).mul(1.6)
  const flutter = sin(time.mul(3.4).add(aOffset.x.mul(0.9)).add(phase)).mul(0.25)
  const sway = gust.add(flutter).add(0.35).mul(uWind)

  const localX = positionGeometry.x.mul(width)
  const localY = along.mul(bladeHeight)
  // Natural curve: blades arch forward, more so when they are tall
  const localZ = bend.mul(bladeHeight).mul(0.4).add(positionGeometry.z)

  const rotatedX = localX.mul(cos(angle)).add(localZ.mul(sin(angle)))
  const rotatedZ = localZ.mul(cos(angle)).sub(localX.mul(sin(angle)))

  const windX = bend.mul(bladeHeight).mul(sway)
  const windZ = bend.mul(bladeHeight).mul(sway).mul(0.45)
  // The tip dips as it bends, so a strong gust lowers it instead of stretching it
  const dip = bend.mul(bladeHeight).mul(sway.abs()).mul(0.35)

  return aOffset.add(vec3(rotatedX.add(windX), localY.sub(dip), rotatedZ.add(windZ)))
})()

// Dark roots fading to bright, slightly yellow tips; dry patches; darker when wet; back-lit by the sun
const dryPatch = smoothstep(0.2, 0.9, mx_noise_float(vec3(aOffset.x.mul(0.05), aOffset.z.mul(0.05), 3.7)).mul(0.5).add(0.5))
const root = aColor.mul(0.3)
const tip = aColor.mul(1.3).add(vec3(0.05, 0.07, 0.0))
const blended = mix(root, tip, along.pow(0.8))
const dried = mix(blended, vec3(0.62, 0.55, 0.28).mul(along.mul(0.6).add(0.4)), dryPatch.mul(0.35))
const baseColor = dried.mul(uWet.mul(-0.35).add(1))
material.colorNode = baseColor
material.roughnessNode = uWet.mul(-0.3).add(0.8)
// Light shining through the blades near their tips (stronger at low sun)
material.emissiveNode = baseColor.mul(along.pow(2)).mul(uDay).mul(0.12)

// ---- Wildflowers ----
const FLOWERS = 1400
const flowerRef = shallowRef<InstancedMesh | null>(null)
const flowerGeometry = new SphereGeometry(1, 7, 5)
const flowerMaterial = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })
watch(flowerRef, (mesh) => {
  if (!mesh) return
  const palette = ['#f6f2e4', '#f2d544', '#b88ad8', '#ec7fa8', '#f2f2f2', '#e8643c']
  const dummy = new Object3D()
  let count = 0
  while (count < FLOWERS) {
    const angle = random() * Math.PI * 2
    const r = 3 + Math.pow(random(), 1.3) * 24
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (blocked(x, z)) continue
    // Flowers grow in little groups
    const group = Math.floor(count / 6)
    const groupAngle = group * 2.399
    const gx = x + Math.cos(groupAngle) * 0.4
    const gz = z + Math.sin(groupAngle) * 0.4
    dummy.position.set(gx, terrainHeight(gx, gz) + 0.16 + random() * 0.22, gz)
    dummy.scale.set(0.035, 0.022, 0.035).multiplyScalar(0.8 + random() * 0.6)
    dummy.rotation.set((random() - 0.5) * 0.4, random() * Math.PI, (random() - 0.5) * 0.4)
    dummy.updateMatrix()
    mesh.setMatrixAt(count, dummy.matrix)
    mesh.setColorAt(count, new Color(palette[group % palette.length]))
    count++
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}, { immediate: true })

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  uWind.value = 0.1 + ui.intensity * 0.4
  uWet.value = ui.wetness
  uDay.value = sky.day
})
</script>

<template>
  <TresMesh :geometry="geometry" :material="material" :frustum-culled="false" receive-shadow />
  <TresInstancedMesh ref="flowerRef" :args="[flowerGeometry, flowerMaterial, FLOWERS]" :frustum-culled="false" />
</template>
