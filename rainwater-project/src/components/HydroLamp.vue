<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { useLoop } from '@tresjs/core'
import { CatmullRomCurve3, Vector3 } from 'three'
import type { Group, Mesh, MeshStandardMaterial, SpotLight } from 'three'
import { gutterX, downspoutZ } from '../scene/config'
import { ui } from '../scene/rainState'

// Mini hydro generator: the water in the downspout drives a turbine (spinning fins around the pipe) that
// powers an LED lamp on a post. The brighter the lamp, the more electrical power (W) is being generated.
const TURBINE_Y = 1.62
const POST_X = gutterX + 2
const POST_TOP_Y = 2.05
const LAMP_FULL_POWER = 1 // W at which the lamp is at full brightness

const finsRef = shallowRef<Group | null>(null)
const bulbRef = shallowRef<Mesh | null>(null)
const ledRef = shallowRef<Mesh | null>(null)
const lightRef = shallowRef<SpotLight | null>(null)

// The spot light shines straight down from under the lamp hood and lights a pool on the ground
watch(lightRef, (light) => {
  if (!light) return
  light.target.position.set(POST_X, 0, downspoutZ)
  light.target.updateMatrixWorld()
}, { immediate: true })

// Cable sagging from the generator to the lamp post
const cable = new CatmullRomCurve3([
  new Vector3(gutterX + 0.13, TURBINE_Y, downspoutZ),
  new Vector3(gutterX + 0.7, TURBINE_Y - 0.25, downspoutZ),
  new Vector3(POST_X - 0.5, TURBINE_Y - 0.1, downspoutZ),
  new Vector3(POST_X, POST_TOP_Y - 0.25, downspoutZ),
])

let spin = 0
let brightness = 0

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const dt = Math.min(delta, 0.05)

  // Fins spin with the water flow
  spin += dt * (ui.flowRate > 0.01 ? 2 + ui.flowRate * 8 : 0)
  if (finsRef.value) finsRef.value.rotation.y = spin

  // The lamp follows the generated power, smoothed so it does not flicker with every drop
  const target = Math.min(1, Math.sqrt(ui.power / LAMP_FULL_POWER))
  brightness += (target - brightness) * (1 - Math.exp(-dt * 4))

  const bulb = bulbRef.value
  if (bulb) (bulb.material as MeshStandardMaterial).emissiveIntensity = 0.05 + brightness * 8
  const led = ledRef.value
  if (led) (led.material as MeshStandardMaterial).emissiveIntensity = ui.power > 0.005 ? 3 : 0.1
  if (lightRef.value) lightRef.value.intensity = brightness * 150
})
</script>

<template>
  <!-- Generator housing around the downspout -->
  <TresGroup :position="[gutterX, TURBINE_Y, downspoutZ]">
    <TresMesh cast-shadow>
      <TresCylinderGeometry :args="[0.12, 0.12, 0.16, 20]" />
      <TresMeshStandardMaterial color="#c99a1b" :metalness="0.6" :roughness="0.4" />
    </TresMesh>
    <!-- Turbine fins -->
    <TresGroup ref="finsRef" :position="[0, 0.11, 0]">
      <TresMesh v-for="k in 6" :key="k" :position="[Math.cos((k / 6) * Math.PI * 2) * 0.1, 0, Math.sin((k / 6) * Math.PI * 2) * 0.1]" :rotation="[0, -(k / 6) * Math.PI * 2, 0.4]">
        <TresBoxGeometry :args="[0.07, 0.015, 0.03]" />
        <TresMeshStandardMaterial color="#9aa3ab" :metalness="0.8" :roughness="0.3" />
      </TresMesh>
    </TresGroup>
    <!-- Status LED -->
    <TresMesh ref="ledRef" :position="[0.125, 0, 0]">
      <TresSphereGeometry :args="[0.018, 10, 10]" />
      <TresMeshStandardMaterial color="#22cc66" emissive="#22cc66" :emissive-intensity="0.1" />
    </TresMesh>
  </TresGroup>

  <!-- Cable -->
  <TresMesh>
    <TresTubeGeometry :args="[cable, 24, 0.012, 6, false]" />
    <TresMeshStandardMaterial color="#111111" :roughness="0.8" />
  </TresMesh>

  <!-- Lamp post -->
  <TresMesh :position="[POST_X, POST_TOP_Y / 2, downspoutZ]" cast-shadow>
    <TresCylinderGeometry :args="[0.045, 0.06, POST_TOP_Y, 10]" />
    <TresMeshStandardMaterial color="#2c3238" :metalness="0.6" :roughness="0.5" />
  </TresMesh>
  <TresMesh :position="[POST_X, POST_TOP_Y + 0.17, downspoutZ]" cast-shadow>
    <TresConeGeometry :args="[0.2, 0.14, 16]" />
    <TresMeshStandardMaterial color="#2c3238" :metalness="0.6" :roughness="0.5" />
  </TresMesh>
  <TresMesh ref="bulbRef" :position="[POST_X, POST_TOP_Y + 0.02, downspoutZ]">
    <TresSphereGeometry :args="[0.1, 16, 16]" />
    <TresMeshStandardMaterial color="#fff4d6" emissive="#ffd27a" :emissive-intensity="0.05" />
  </TresMesh>
  <!-- Warm light cone under the hood -->
  <TresSpotLight
    ref="lightRef"
    color="#ffd9a0"
    :position="[POST_X, POST_TOP_Y - 0.08, downspoutZ]"
    :intensity="0"
    :angle="1.05"
    :penumbra="0.9"
    :distance="12"
    :decay="2"
  />
</template>
