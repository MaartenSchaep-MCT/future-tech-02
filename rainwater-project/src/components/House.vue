<script setup lang="ts">
import { defineProps, shallowRef } from 'vue'
import type { TresObject } from '@tresjs/core'

import { Shape } from 'three';
const props = defineProps<{
  position?: [x: number, y: number, z: number]
}>()

const meshRef = shallowRef<TresObject | null>(null)
defineExpose({ mesh: meshRef })

const width = 3;
const houseWidth = 10;
const shape = new Shape()
shape.moveTo( width, 1 )
shape.lineTo( 0, width )
shape.lineTo( -width, 1 )



</script>


<template>
<TresGroup :position="props.position">
  <TresMesh ref="meshRef" :position="[0, 0, -(houseWidth / 2)]">
    <TresExtrudeGeometry :args="[shape, { depth: 10 }]" />
    <TresMeshStandardMaterial
         color="#FFFFFF"
         :metalness="0.8"
         :roughness="0.7"
       />
  </TresMesh>
  <TresMesh ref="meshRef" :position="[0, 0, 0]">
    <TresBoxGeometry :args="[houseWidth /2, 2, houseWidth]" />
    <TresMeshBasicMaterial color="#63291e" />
    <!-- <MeshReflectionMaterial
            :blur="[300, 100]"
            :mixBlur="30"
            :mixStrength="80"
            :mixContrast="1"
            color="#000000"
            :metalness=0.5
          :roughness=1
          :mirror="0"
        /> -->
</TresMesh>
</TresGroup>

</template>
