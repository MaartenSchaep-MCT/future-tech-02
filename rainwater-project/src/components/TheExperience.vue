<script setup lang="ts">
import type { TresObject } from '@tresjs/core'
import { CameraControls, AccumulativeShadows, RandomizedLights } from '@tresjs/cientos'

import { useLoop } from '@tresjs/core'
import { shallowRef, ref } from 'vue'
import House from './House.vue'

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
  <TresPerspectiveCamera :position="[25, 25, 25]" :look-at="[0, 0, 0]" />
      <CameraControls />
      <TresAmbientLight :intensity="0.5" />
         <TresDirectionalLight :position="[5, 5, 5]" />
  <!-- <TresMesh
    ref="boxRef"
    :position="[0, 2, 0]"
  >
    <TresBoxGeometry :args="[1, 1, 1]" />
    <TresMeshNormalMaterial />
  </TresMesh>
  <TresDirectionalLight
    :position="[0, 2, 4]"
    :intensity="1"
    cast-shadow
  />  -->
  <House ref="houseRef" :position="[0, 1, 0]" />
   <!-- <TresAxesHelper /> -->
    <TresGridHelper :args="[100, 10]" />
</template>
