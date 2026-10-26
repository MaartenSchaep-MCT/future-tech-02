<script setup lang="ts">

import { defineProps, shallowRef } from 'vue'
import type { TresObject } from '@tresjs/core'
const props = defineProps<{
  position?: [number, number, number]
}>()

const meshRef = shallowRef<TresObject | null>(null)
defineExpose({ mesh: meshRef })
</script>


<template>
<TresMesh  ref="meshRef" :position="props.position">
  <TresTorusGeometry :args="[1, 0.4, 16, 32]" />
  <TresMeshBasicMaterial color="#ff6b35" />
</TresMesh>
</template>
