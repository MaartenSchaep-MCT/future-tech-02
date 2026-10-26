<script setup lang="ts">
import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  attribute, cos, mix, positionGeometry, sin, time, uniform, vec3,
} from 'three/tsl'
import { useLoop } from '@tresjs/core'
import { terrainHeight } from '../scene/terrain'
import { ui } from '../scene/rainState'

// Dense, individually animated grass blades (GPU instanced). Every blade is a tapered, curved strip;
// bending, wind and colour are computed on the GPU, so 100k+ blades stay cheap.
const COUNT = 45000
const INNER_RADIUS = 2.5
const OUTER_RADIUS = 30

let seed = 99
const random = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

// Keep the grass off the house footprint, the barrel and the stone path
const blocked = (x: number, z: number) =>
  (x > -4.2 && x < 5.2 && z > -6.7 && z < 6.7) || (Math.abs(x) < 1.2 && z > 5)

// One blade: 3 stacked quads plus a tip, rendered from both sides so the normal can stay pointing up
const buildBlade = () => {
  const rows = [
    { y: 0, half: 0.5 },
    { y: 0.35, half: 0.42 },
    { y: 0.7, half: 0.28 },
  ]
  const positions: number[] = []
  const normals: number[] = []
  for (const r of rows) {
    positions.push(-r.half, r.y, 0, r.half, r.y, 0)
    normals.push(0, 1, 0, 0, 1, 0)
  }
  positions.push(0, 1, 0)
  normals.push(0, 1, 0)

  const front: number[] = []
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2
    front.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const top = (rows.length - 1) * 2
  front.push(top, top + 1, top + 2)
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
let placed = 0
while (placed < COUNT) {
  const angle = random() * Math.PI * 2
  const r = INNER_RADIUS + Math.sqrt(random()) * (OUTER_RADIUS - INNER_RADIUS)
  const x = Math.cos(angle) * r
  const z = Math.sin(angle) * r
  if (blocked(x, z)) continue

  offsets[placed * 3] = x
  offsets[placed * 3 + 1] = terrainHeight(x, z) - 0.02
  offsets[placed * 3 + 2] = z

  // Patches of taller / drier grass using a smooth low-frequency field
  const patch = (Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17) + 1) / 2
  data[placed * 4] = random() * Math.PI * 2
  data[placed * 4 + 1] = (0.3 + random() * 0.45) * (0.8 + patch * 0.7)
  data[placed * 4 + 2] = 0.035 + random() * 0.03
  data[placed * 4 + 3] = random() * Math.PI * 2

  color.setHSL(0.22 + random() * 0.07 - patch * 0.04, 0.45 + random() * 0.25, 0.3 + random() * 0.12)
  colors[placed * 3] = color.r
  colors[placed * 3 + 1] = color.g
  colors[placed * 3 + 2] = color.b
  placed++
}
geometry.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3))
geometry.setAttribute('aData', new InstancedBufferAttribute(data, 4))
geometry.setAttribute('aColor', new InstancedBufferAttribute(colors, 3))

const uWind = uniform(0.15)
const uWet = uniform(0)

const aOffset = attribute('aOffset', 'vec3')
const aData = attribute('aData', 'vec4')
const aColor = attribute('aColor', 'vec3')
const heightAlong = positionGeometry.y

const material = new MeshStandardNodeMaterial()
material.side = DoubleSide
material.roughness = 0.75

// Blade shape, natural lean, and wind that sways the tips in travelling waves
material.positionNode = (() => {
  const angle = aData.x
  const bladeHeight = aData.y
  const width = aData.z
  const phase = aData.w
  const bend = heightAlong.mul(heightAlong)

  const sway = sin(time.mul(1.7).add(aOffset.x.mul(0.35)).add(aOffset.z.mul(0.2)).add(phase.mul(0.3)))
    .add(sin(time.mul(3.1).add(aOffset.z.mul(0.5)).add(phase)).mul(0.35))
    .mul(uWind)

  const localX = positionGeometry.x.mul(width)
  const localY = heightAlong.mul(bladeHeight)
  const localZ = bend.mul(bladeHeight).mul(0.35) // blades lean forward as they grow

  const rotatedX = localX.mul(cos(angle)).add(localZ.mul(sin(angle)))
  const rotatedZ = localZ.mul(cos(angle)).sub(localX.mul(sin(angle)))

  const windX = bend.mul(bladeHeight).mul(sway)
  const windZ = bend.mul(bladeHeight).mul(sway).mul(0.5)

  return aOffset.add(vec3(rotatedX.add(windX), localY, rotatedZ.add(windZ)))
})()

// Dark, saturated roots fading to bright tips, a little darker when wet
const root = aColor.mul(0.32)
const tip = aColor.mul(1.35).add(vec3(0.04, 0.06, 0.0))
material.colorNode = mix(root, tip, heightAlong).mul(uWet.mul(-0.35).add(1))
material.roughnessNode = uWet.mul(-0.35).add(0.8)

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  uWind.value = 0.08 + ui.intensity * 0.35
  uWet.value = ui.wetness
})
</script>

<template>
  <TresMesh :geometry="geometry" :material="material" :frustum-culled="false" receive-shadow />
</template>
