<script setup lang="ts">
import { useLoop } from '@tresjs/core'
import { BackSide, Color } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { clamp, float, mx_noise_float, oneMinus, smoothstep, time, uniform, uv, vec3 } from 'three/tsl'
import { ui } from '../scene/rainState'
import { sky } from '../scene/daylight'

// Volumetric look for distant rain: sheets of streaks falling around the scene plus low ground haze.
const uIntensity = uniform(0)
const uBright = uniform(1)

const coord = uv()
let streaks = float(0)
for (let k = 0; k < 2; k++) {
  const p = vec3(
    coord.x.mul(700 + 500 * k),
    coord.y.mul(10 - 3 * k).add(time.mul(4 + 1.5 * k)).add(17 * k).mul(0.4),
    k * 3.7,
  )
  const n = mx_noise_float(p).mul(0.5).add(0.5)
  streaks = streaks.add(smoothstep(float(0.62).sub(uIntensity.mul(0.1)), 0.85, n).mul(0.5))
}
// Sheets thin out towards the top, haze hugs the ground
const sheets = streaks.mul(oneMinus(smoothstep(0.55, 1.0, coord.y))).mul(uIntensity).mul(0.3)
const haze = oneMinus(smoothstep(0.0, 0.12, coord.y)).mul(uIntensity).mul(0.15)

const material = new MeshBasicNodeMaterial()
material.side = BackSide // the camera stays inside the cylinder
material.transparent = true
material.depthWrite = false
material.fog = false
material.colorNode = vec3(new Color('#c4d4e2')).mul(uBright)
material.opacityNode = clamp(sheets.add(haze), 0, 0.8)

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  uIntensity.value = ui.intensity
  uBright.value = 0.1 + 0.9 * sky.day
})
</script>

<template>
  <TresMesh :material="material" :position="[0, 30, 0]" :frustum-culled="false" :render-order="5">
    <TresCylinderGeometry :args="[150, 150, 60, 64, 1, true]" />
  </TresMesh>
</template>
