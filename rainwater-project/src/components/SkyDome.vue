<script setup lang="ts">
import { useLoop } from '@tresjs/core'
import { BackSide, Color, Vector3 } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  clamp, dot, float, max, mix, mx_cell_noise_float, mx_fractal_noise_float, normalize, oneMinus, pow, positionLocal, smoothstep, step, time, uniform, vec2, vec3,
} from 'three/tsl'
import { ui, world } from '../scene/rainState'
import { sky } from '../scene/daylight'

// Procedural sky (TSL node material): day/night gradient, sun, moon, stars and drifting clouds that thicken and
// darken with the rain. Colours and the sun position come from the shared `sky` state (see DayNight.vue).

const uTop = uniform(new Color())
const uHorizon = uniform(new Color())
const uSun = uniform(new Vector3(0, 1, 0))
const uMoon = uniform(new Vector3(0, -1, 0))
const uDay = uniform(1)
const uCover = uniform(0.3)
const uDark = uniform(0)
const uFlash = uniform(0) // lightning

const dir = normalize(positionLocal)
const height = clamp(dir.y, 0, 1)
const base = mix(uHorizon, uTop, pow(height, 0.55))

// Sun disc and glow, hidden by cloud cover
const sunAmount = max(dot(dir, uSun), 0)
const aboveHorizon = smoothstep(-0.02, 0.05, dir.y)
const sun = vec3(1.0, 0.85, 0.6).mul(pow(sunAmount, 800).mul(3).add(pow(sunAmount, 10).mul(0.12))).mul(float(1).sub(uCover)).mul(aboveHorizon)

// Moon and stars, only when it is dark and not overcast
const moonAmount = max(dot(dir, uMoon), 0)
const nightClear = oneMinus(uDay).mul(float(1).sub(uCover))
const moon = vec3(0.8, 0.85, 1.0).mul(pow(moonAmount, 1500).mul(2.5).add(pow(moonAmount, 25).mul(0.05))).mul(nightClear).mul(aboveHorizon)
const stars = vec3(1.0, 0.95, 0.9).mul(step(0.985, mx_cell_noise_float(dir.mul(140)))).mul(nightClear).mul(aboveHorizon)

// Clouds: fractal noise projected onto a plane above the viewer
const cloudUv = dir.xz.div(dir.y.add(0.2)).mul(0.8).add(vec2(time.mul(0.012), time.mul(0.004))).mul(1.4)
const noise = mx_fractal_noise_float(vec3(cloudUv, 0), 5, 2.0, 0.5).mul(0.6).add(0.5)
const low = float(0.62).sub(uCover.mul(0.38))
const cloud = smoothstep(low, low.add(0.25), noise).mul(smoothstep(-0.02, 0.12, dir.y))
const lit = mix(vec3(1.0), vec3(0.36, 0.39, 0.43), uDark)
const shade = mix(vec3(0.72, 0.76, 0.82), vec3(0.22, 0.24, 0.28), uDark)
const cloudColor = mix(lit, shade, smoothstep(low, low.add(0.4), noise)).mul(mix(0.07, 1.0, uDay))

const material = new MeshBasicNodeMaterial()
material.side = BackSide
material.depthWrite = false
material.fog = false
material.colorNode = mix(base.add(sun).add(moon).add(stars), cloudColor, cloud.mul(0.92)).add(vec3(0.55, 0.6, 0.9).mul(uFlash).mul(float(0.35).add(cloud.mul(0.65))))

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  const i = Math.min(1, ui.intensity * 1.1)
  uTop.value.copy(sky.top)
  uHorizon.value.copy(sky.horizon)
  uSun.value.copy(sky.sunDir)
  uMoon.value.copy(sky.sunDir).negate()
  uDay.value = sky.day
  uCover.value = 0.3 + 0.7 * i
  uDark.value = i
  uFlash.value = world.flash
})
</script>

<template>
  <TresMesh :material="material" :render-order="-1" :frustum-culled="false">
    <TresSphereGeometry :args="[500, 32, 16]" />
  </TresMesh>
</template>
