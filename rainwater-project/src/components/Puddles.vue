<script setup lang="ts">
import { computed } from 'vue'
import { ui } from '../scene/rainState'
import { smoothstep } from '../scene/terrain'

// Puddles form on the flat ground around the house as it gets wetter
const spots = [
  { x: -8, z: 3, r: 1.8, squash: 0.7, rot: 0.4, start: 0.2 },
  { x: 7, z: 9, r: 1.4, squash: 0.6, rot: 1.2, start: 0.3 },
  { x: -5, z: -9, r: 2.2, squash: 0.75, rot: 2.1, start: 0.25 },
  { x: 9, z: -5, r: 1.6, squash: 0.65, rot: 0.8, start: 0.4 },
  { x: -10, z: -3, r: 1.2, squash: 0.8, rot: 2.8, start: 0.5 },
  { x: 4, z: 12, r: 1.5, squash: 0.7, rot: 0.1, start: 0.35 },
  { x: -3, z: 10, r: 1.3, squash: 0.6, rot: 1.7, start: 0.45 },
]

const puddles = computed(() =>
  spots.map((s) => {
    const grow = smoothstep(s.start, s.start + 0.45, ui.wetness)
    return { ...s, scale: s.r * grow, opacity: 0.9 * grow }
  }),
)
</script>

<template>
  <TresMesh
    v-for="(p, i) in puddles"
    :key="i"
    :position="[p.x, 0.025, p.z]"
    :rotation="[-Math.PI / 2, 0, p.rot]"
    :scale="[p.scale, p.scale * p.squash, 1]"
    :visible="p.scale > 0.02"
    receive-shadow
  >
    <TresCircleGeometry :args="[1, 32]" />
    <TresMeshPhysicalMaterial
      color="#1d2b33"
      :roughness="0.02"
      :metalness="0.1"
      :clearcoat="1"
      transparent
      :opacity="p.opacity"
      :env-map-intensity="4"
      :polygon-offset="true"
      :polygon-offset-factor="-2"
      :polygon-offset-units="-2"
    />
  </TresMesh>
</template>
