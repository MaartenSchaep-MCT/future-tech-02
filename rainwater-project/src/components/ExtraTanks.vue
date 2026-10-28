<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import { DoubleSide } from 'three'
import type { Mesh } from 'three'
import { gutterX, downspoutZ, barrelRadius, barrelHeight, BARREL_FLOOR_Y } from '../scene/config'
import { ui } from '../scene/rainState'
import { water } from '../scene/water'

// Additional tanks lined up along the wall, linked to the first one by overflow pipes. They fill and empty
// together with it: all tanks share the same fill level, and the total storage is tankSize x tanks.
const SPACING = 1.55
const WATER_MAX_HEIGHT = 1.15
const WATER_RADIUS = 0.5

const extra = computed(() => Array.from({ length: Math.max(0, ui.tanks - 1) }, (_, i) => ({ z: downspoutZ - SPACING * (i + 1) })))
const waters = shallowRef<Mesh[]>([])
const setWater = (el: Mesh | null, i: number) => {
  if (el) waters.value[i] = el
}

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  const h = water.level * WATER_MAX_HEIGHT
  for (const mesh of waters.value) {
    if (!mesh) continue
    mesh.visible = h > 0.02
    mesh.scale.y = Math.max(h, 0.001)
    mesh.position.y = BARREL_FLOOR_Y + 0.02 + h / 2
  }
})
</script>

<template>
  <template v-for="(tank, i) in extra" :key="i">
    <TresGroup :position="[gutterX, BARREL_FLOOR_Y + barrelHeight / 2, tank.z]">
      <TresMesh cast-shadow>
        <TresCylinderGeometry :args="[barrelRadius, barrelRadius * 0.88, barrelHeight, 24, 1, true]" />
        <TresMeshStandardMaterial color="#2f5d8a" :roughness="0.6" :side="DoubleSide" transparent :opacity="0.45" :depth-write="false" />
      </TresMesh>
      <TresMesh :position="[0, -barrelHeight / 2 + 0.02, 0]" :rotation="[-Math.PI / 2, 0, 0]">
        <TresCircleGeometry :args="[barrelRadius * 0.88, 24]" />
        <TresMeshStandardMaterial color="#1f3d5c" />
      </TresMesh>
      <TresMesh :position="[0, barrelHeight / 2, 0]" :rotation="[Math.PI / 2, 0, 0]">
        <TresTorusGeometry :args="[barrelRadius, 0.03, 8, 24]" />
        <TresMeshStandardMaterial color="#1f3d5c" />
      </TresMesh>
      <TresMesh v-for="y in [-0.45, 0.45]" :key="y" :position="[0, y, 0]" :rotation="[Math.PI / 2, 0, 0]">
        <TresTorusGeometry :args="[barrelRadius * (1 - 0.06 * Math.abs(y) / 0.45) + 0.01, 0.03, 8, 24]" />
        <TresMeshStandardMaterial color="#555b61" :metalness="0.8" :roughness="0.4" />
      </TresMesh>
    </TresGroup>
    <!-- Water inside -->
    <TresMesh :ref="(el: any) => setWater(el, i)" :position="[gutterX, BARREL_FLOOR_Y + 0.5, tank.z]" :scale="[1, 0.001, 1]" :visible="false">
      <TresCylinderGeometry :args="[WATER_RADIUS, WATER_RADIUS, 1, 24]" />
      <TresMeshStandardMaterial color="#1d4a50" transparent :opacity="0.9" :roughness="0.05" />
    </TresMesh>
    <!-- Overflow pipe to the previous tank -->
    <TresMesh :position="[gutterX, BARREL_FLOOR_Y + 0.9, tank.z + SPACING / 2]" :rotation="[Math.PI / 2, 0, 0]">
      <TresCylinderGeometry :args="[0.05, 0.05, SPACING - barrelRadius * 2 + 0.2, 10]" />
      <TresMeshStandardMaterial color="#9aa3ab" :metalness="0.7" :roughness="0.4" />
    </TresMesh>
  </template>
</template>
