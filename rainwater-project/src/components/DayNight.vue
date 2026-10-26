<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import { Fog } from 'three'
import type { DirectionalLight, HemisphereLight } from 'three'
import { ui, world } from '../scene/rainState'
import { sky, updateSky } from '../scene/daylight'

// Owns the time of day: moves the clock, then drives the sun/moon light, the sky light, the fog and the
// environment reflections from it. Other components read the shared `sky` values.
const { scene } = useTresContext()
const sunRef = shallowRef<DirectionalLight | null>(null)
const hemiRef = shallowRef<HemisphereLight | null>(null)

const fog = new Fog('#cfe3f0', 40, 110)
onMounted(() => {
  scene.value.fog = fog
})

let hour = ui.timeOfDay
let lastWritten = hour
let writeTimer = 0
const wrapDiff = (a: number, b: number) => ((a - b + 36) % 24) - 12

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const dt = Math.min(delta, 0.05)

  // The slider changed the time by hand
  if (Math.abs(wrapDiff(ui.timeOfDay, lastWritten)) > 0.001) {
    hour = ui.timeOfDay
    lastWritten = hour
  }
  if (ui.autoTime) hour = (hour + (dt * 24) / (ui.dayLengthMin * 60)) % 24
  writeTimer += dt
  if (writeTimer > 0.2) {
    writeTimer = 0
    ui.timeOfDay = hour
    lastWritten = ui.timeOfDay
  }

  world.hour = hour
  updateSky(hour, ui.intensity)

  const sun = sunRef.value
  if (sun) {
    sun.position.copy(sky.lightDir).multiplyScalar(40)
    sun.color.copy(sky.lightColor)
    sun.intensity = sky.lightIntensity
  }
  const hemi = hemiRef.value
  if (hemi) hemi.intensity = sky.hemiIntensity
  if (scene.value) scene.value.environmentIntensity = sky.envIntensity

  fog.color.copy(sky.horizon)
  fog.near = 40 - ui.intensity * 20
  fog.far = 110 - ui.intensity * 45
})
</script>

<template>
  <TresHemisphereLight ref="hemiRef" :args="['#cfe8ff', '#4f7a3a', 0.6]" />
  <TresDirectionalLight
    ref="sunRef"
    :position="[20, 30, 15]"
    color="#fff1d9"
    :intensity="2.2"
    cast-shadow
    :shadow-mapSize-width="2048"
    :shadow-mapSize-height="2048"
    :shadow-camera-left="-32"
    :shadow-camera-right="32"
    :shadow-camera-top="32"
    :shadow-camera-bottom="-32"
    :shadow-camera-far="120"
    :shadow-bias="-0.0002"
    :shadow-normal-bias="0.04"
  />
</template>
