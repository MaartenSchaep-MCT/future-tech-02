<script setup lang="ts">
import type { TresObject } from '@tresjs/core'
import { CameraControls, AccumulativeShadows, RandomizedLights } from '@tresjs/cientos'

import { useLoop } from '@tresjs/core'
import { shallowRef, ref } from 'vue'
import House from './House.vue'
import Landscape from './Landscape.vue'
import RainSystem from './RainSystem.vue'
import SkyDome from './SkyDome.vue'
import BarrelWater from './BarrelWater.vue'
import RainCurtain from './RainCurtain.vue'
import Puddles from './Puddles.vue'
import WaterBlobs from './WaterBlobs.vue'
import Flood from './Flood.vue'
import Wildlife from './Wildlife.vue'
import DayNight from './DayNight.vue'
import ExtraTanks from './ExtraTanks.vue'
import SceneEnvironment from './SceneEnvironment.vue'
import { skyColor, ui } from '../scene/rainState'

const houseRef = ref()
// const { onBeforeRender } = useLoop()
// const boxRef = shallowRef<TresObject | null>(null)

// onBeforeRender(({ elapsed }) => {
  // if (boxRef.value) {
  //   boxRef.value.rotation.y = elapsed
  //   boxRef.value.rotation.z = elapsed
  // }
  // const mesh = donutRef.value?.mesh
  // if (mesh) {
  //   mesh.rotation.x = elapsed * 0.5
  //   mesh.rotation.y = elapsed * 0.3
  // }
// })
</script>

<template>
  <TresPerspectiveCamera :position="[25, 15, 25]" :look-at="[0, 1, 0]" :far="1200" />
  <CameraControls :max-polar-angle="Math.PI / 2 - 0.05" :max-distance="130" />
  <DayNight />
  <SkyDome />
  <SceneEnvironment />
  <House ref="houseRef" :position="[0, 1, 0]" />
  <Landscape />
  <Puddles />
  <BarrelWater />
  <ExtraTanks />
  <RainSystem />
  <WaterBlobs />
  <Wildlife />
  <Flood />
  <RainCurtain />
</template>
