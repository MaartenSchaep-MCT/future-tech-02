<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useTresContext } from '@tresjs/core'
import { PMREMGenerator } from 'three/webgpu'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// Subtle image-based lighting (generated in code, no HDR download) so surfaces get soft reflections
const { scene, renderer } = useTresContext()
let target: { texture: any; dispose: () => void } | null = null

onMounted(async () => {
  const gpu = renderer.value as any
  await gpu.init?.() // the WebGPU backend must be ready before PMREM can render
  const pmrem = new PMREMGenerator(gpu)
  target = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.value.environment = target!.texture
  pmrem.dispose()
})

onBeforeUnmount(() => {
  if (scene.value) scene.value.environment = null
  target?.dispose()
})
</script>

<template />
