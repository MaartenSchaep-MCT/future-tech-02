<script setup lang="ts">
import { Color, Float32BufferAttribute, PlaneGeometry } from 'three'
import { computed } from 'vue'
import { grassTexture } from '../scene/textures'
import { ui } from '../scene/rainState'
import GrassField from './GrassField.vue'
import { smoothstep, terrainHeight, FLAT_RADIUS } from '../scene/terrain'

const SIZE = 400
const grassMap = grassTexture(150)

// Wet ground is darker and glossier
const groundColor = computed(() => `hsl(0, 0%, ${100 - ui.wetness * 38}%)`)
const groundRoughness = computed(() => 1 - ui.wetness * 0.5)

// Seeded random so the scene is the same on every load
let seed = 7
const random = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const groundGeometry = new PlaneGeometry(SIZE, SIZE, 200, 200)
groundGeometry.rotateX(-Math.PI / 2)
{
  const pos = groundGeometry.attributes.position
  const colors: number[] = []
  const grass = new Color('#5c9e3f')
  const darkGrass = new Color('#3f7a2e')
  const rock = new Color('#8a8578')
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = terrainHeight(x, z)
    pos.setY(i, h)
    const patch = (Math.sin(x * 0.9) * Math.cos(z * 0.8) + 1) / 2
    c.copy(grass).lerp(darkGrass, patch * 0.5 + smoothstep(0, 6, h) * 0.4)
    c.lerp(rock, smoothstep(6, 9, h))
    colors.push(c.r, c.g, c.b)
  }
  groundGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  groundGeometry.computeVertexNormals()
}

type Spot = { x: number; z: number; y: number; scale: number; rot: number }

const scatter = (count: number, minR: number, maxR: number, minScale: number, maxScale: number): Spot[] => {
  const spots: Spot[] = []
  while (spots.length < count) {
    const angle = random() * Math.PI * 2
    const r = minR + random() * (maxR - minR)
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    // keep clear of the house, including the longest roof the planner allows
    if (x > -7 && x < 9 && z > -36 && z < 9) continue
    spots.push({
      x, z,
      y: terrainHeight(x, z),
      scale: minScale + random() * (maxScale - minScale),
      rot: random() * Math.PI * 2,
    })
  }
  return spots
}

const pines = scatter(35, 16, 70, 0.8, 1.8)
const roundTrees = scatter(20, 15, 60, 0.8, 1.5)
const rocks = scatter(18, 9, 40, 0.3, 1)
const bushes = scatter(14, 8, 20, 0.5, 0.9)
</script>

<template>
  <!-- Terrain -->
  <TresMesh :geometry="groundGeometry" receive-shadow>
    <TresMeshStandardMaterial vertex-colors :color="groundColor" :roughness="groundRoughness" :map="grassMap" :bump-map="grassMap" :bump-scale="2" />
  </TresMesh>

  <GrassField />

  <!-- Stone path from the front door -->
  <TresMesh :position="[0, 0.03, 12]" receive-shadow>
    <TresBoxGeometry :args="[1.4, 0.06, 13]" />
    <TresMeshStandardMaterial color="#b9a98a" :roughness="1" />
  </TresMesh>

  <!-- Pine trees -->
  <TresGroup v-for="(t, i) in pines" :key="`pine-${i}`" :position="[t.x, t.y, t.z]" :scale="t.scale" :rotation="[0, t.rot, 0]">
    <TresMesh :position="[0, 0.6, 0]" cast-shadow>
      <TresCylinderGeometry :args="[0.2, 0.3, 1.2, 8]" />
      <TresMeshStandardMaterial color="#5a3d26" :roughness="1" />
    </TresMesh>
    <TresMesh :position="[0, 2, 0]" cast-shadow>
      <TresConeGeometry :args="[1.3, 2.4, 8]" />
      <TresMeshStandardMaterial color="#2b5e2f" :roughness="0.9" />
    </TresMesh>
    <TresMesh :position="[0, 3.2, 0]" cast-shadow>
      <TresConeGeometry :args="[1, 2, 8]" />
      <TresMeshStandardMaterial color="#357a3a" :roughness="0.9" />
    </TresMesh>
    <TresMesh :position="[0, 4.3, 0]" cast-shadow>
      <TresConeGeometry :args="[0.65, 1.6, 8]" />
      <TresMeshStandardMaterial color="#3f8a43" :roughness="0.9" />
    </TresMesh>
  </TresGroup>

  <!-- Round trees -->
  <TresGroup v-for="(t, i) in roundTrees" :key="`tree-${i}`" :position="[t.x, t.y, t.z]" :scale="t.scale" :rotation="[0, t.rot, 0]">
    <TresMesh :position="[0, 1, 0]" cast-shadow>
      <TresCylinderGeometry :args="[0.2, 0.3, 2, 8]" />
      <TresMeshStandardMaterial color="#6b4a2e" :roughness="1" />
    </TresMesh>
    <TresMesh :position="[0, 2.8, 0]" cast-shadow>
      <TresIcosahedronGeometry :args="[1.4, 1]" />
      <TresMeshStandardMaterial color="#4f9a3a" :roughness="0.9" flat-shading />
    </TresMesh>
    <TresMesh :position="[0.7, 2.3, 0.4]" cast-shadow>
      <TresIcosahedronGeometry :args="[0.9, 1]" />
      <TresMeshStandardMaterial color="#5aa845" :roughness="0.9" flat-shading />
    </TresMesh>
  </TresGroup>

  <!-- Rocks -->
  <TresMesh v-for="(r, i) in rocks" :key="`rock-${i}`" :position="[r.x, r.y + r.scale * 0.2, r.z]" :scale="[r.scale, r.scale * 0.6, r.scale]" :rotation="[0, r.rot, 0]" cast-shadow receive-shadow>
    <TresDodecahedronGeometry :args="[1, 0]" />
    <TresMeshStandardMaterial color="#8d8a84" :roughness="1" flat-shading />
  </TresMesh>

  <!-- Bushes -->
  <TresMesh v-for="(b, i) in bushes" :key="`bush-${i}`" :position="[b.x, b.y + b.scale * 0.5, b.z]" :scale="b.scale" cast-shadow>
    <TresIcosahedronGeometry :args="[0.8, 1]" />
    <TresMeshStandardMaterial color="#3c8a34" :roughness="1" flat-shading />
  </TresMesh>
</template>
