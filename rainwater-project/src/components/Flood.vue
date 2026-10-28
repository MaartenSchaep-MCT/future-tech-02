<script setup lang="ts">
import { shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import { PlaneGeometry, Vector4 } from 'three'
import type { AmbientLight, Mesh } from 'three'
import { MeshPhysicalNodeMaterial } from 'three/webgpu'
import {
  Fn, abs, dot, exp, float, mix, normalize, positionLocal, select, sin, smoothstep, time, transformNormalToView, uniform, varying, vec2, vec3,
} from 'three/tsl'
import { ui, world } from '../scene/rainState'

// Apocalypse mode: the rain never stops, the water rises over the whole map and tsunami waves sweep across it.
// Everything is done on the GPU in the vertex shader of ONE plane (no extra particles), so it stays cheap:
// the water surface is a height function (small ripples + up to three travelling tsunami fronts).
// The flood rises up to ui.floodLimit (10 m covers the house and the hills)
const RISE_SPEED = 0.09 // metres per second
const FALL_SPEED = 0.8
const FIRST_WAVE = 6 // seconds after the start
const WAVE_INTERVAL = 22
const WAVE_SPEED = 16
const WAVE_START = -200 // distance behind the map centre where a wave starts
const WAVE_END = 200

const geometry = new PlaneGeometry(420, 420, 210, 210).rotateX(-Math.PI / 2)

// Up to three tsunami fronts at once: (direction x, direction z, position along the direction, amplitude)
const waves = [uniform(new Vector4()), uniform(new Vector4()), uniform(new Vector4())]

const heightAt = Fn(([p]: [any]) => {
  // Everyday ripples that run in two directions
  let h = sin(p.x.mul(0.35).add(time.mul(1.3))).mul(0.07).add(sin(p.y.mul(0.5).sub(time.mul(1.7))).mul(0.05))
  h = h.add(sin(p.x.mul(0.8).add(p.y.mul(0.6)).add(time.mul(2.3))).mul(0.03))
  for (const u of waves) {
    // Steep front, long gentle tail behind the crest
    const d = dot(p, vec2(u.x, u.y)).sub(u.z)
    const width = select(d.greaterThan(0), float(3.5), float(10.0))
    const k = d.div(width)
    h = h.add(u.w.mul(exp(k.mul(k).negate())))
  }
  return h
})

const p = positionLocal.xz
const height = heightAt(p)
const e = 0.7
const dx = heightAt(p.add(vec2(e, 0)))
const dz = heightAt(p.add(vec2(0, e)))

const material = new MeshPhysicalNodeMaterial({
  roughness: 0.06,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  envMapIntensity: 4,
  transparent: true,
  opacity: 0.92,
})
material.positionNode = positionLocal.add(vec3(0, height, 0))
material.normalNode = transformNormalToView(normalize(vec3(height.sub(dx), e, height.sub(dz))))

// Dark green-blue water with white foam on the tsunami crests and on steep ripples
const crest = varying(height)
const deep = vec3(0.06, 0.2, 0.26)
const shallow = vec3(0.16, 0.42, 0.5)
const foam = smoothstep(1.0, 2.6, crest).add(smoothstep(0.17, 0.26, abs(crest)).mul(0.25))
material.colorNode = mix(mix(deep, shallow, smoothstep(-0.2, 1.2, crest)), vec3(0.92, 0.97, 1.0), foam.clamp(0, 1))

const waterRef = shallowRef<Mesh | null>(null)
const flashRef = shallowRef<AmbientLight | null>(null)

let level = 0
let handledWaves = 0
let elapsedFlood = 0
let uiTimer = 0
let nextStrike = 3
let strikeAge = 99

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const dt = Math.min(delta, 0.05)

  // A tsunami was requested (for example by voice): jump to the start of the next wave
  if (world.waveRequests !== handledWaves) {
    handledWaves = world.waveRequests
    if (ui.apocalypse) elapsedFlood = FIRST_WAVE + (Math.floor((elapsedFlood - FIRST_WAVE) / WAVE_INTERVAL) + 1) * WAVE_INTERVAL
  }

  if (ui.apocalypse) {
    elapsedFlood += dt
    // Rises up to the limit, and sinks back when the limit is lowered
    level = level < ui.floodLimit ? Math.min(ui.floodLimit, level + RISE_SPEED * dt) : Math.max(ui.floodLimit, level - FALL_SPEED * dt)
  } else {
    elapsedFlood = 0
    level = Math.max(0, level - FALL_SPEED * dt)
  }
  const flooded = level > 0.05
  world.floodY = flooded ? level : -10
  world.waterLevel = level

  const water = waterRef.value
  if (water) {
    water.visible = flooded
    water.position.y = level
  }

  // Tsunami fronts: a new one every WAVE_INTERVAL seconds, each coming from a different direction and a bit bigger
  const newest = Math.floor((elapsedFlood - FIRST_WAVE) / WAVE_INTERVAL)
  waves.forEach((uniformValue, slot) => {
    const k = newest - slot
    const age = elapsedFlood - FIRST_WAVE - k * WAVE_INTERVAL
    const position = WAVE_START + WAVE_SPEED * age
    if (!ui.apocalypse || k < 0 || position > WAVE_END) {
      uniformValue.value.set(1, 0, 0, 0)
      world.waves[slot].a = 0
      return
    }
    const angle = k * 2.3 + 0.5
    const amplitude = Math.min(6.5, 2.5 + 0.6 * k)
    uniformValue.value.set(Math.cos(angle), Math.sin(angle), position, amplitude)
    Object.assign(world.waves[slot], { x: Math.cos(angle), z: Math.sin(angle), s: position, a: amplitude })
  })

  // Lightning during heavy storms: a double flash that also brightens the sky
  strikeAge += dt
  if (ui.intensity > 0.8) {
    nextStrike -= dt
    if (nextStrike <= 0) {
      strikeAge = 0
      nextStrike = 3 + Math.random() * 6
    }
  }
  const flash = strikeAge < 0.8 ? Math.max(Math.exp(-strikeAge * 14), strikeAge > 0.2 ? 0.7 * Math.exp(-(strikeAge - 0.2) * 9) : 0) : 0
  world.flash = flash
  if (flashRef.value) flashRef.value.intensity = flash * 3

  uiTimer += dt
  if (uiTimer > 0.2) {
    uiTimer = 0
    ui.floodLevel = level
  }
})
</script>

<template>
  <TresMesh ref="waterRef" :geometry="geometry" :material="material" :visible="false" :frustum-culled="false" />
  <TresAmbientLight ref="flashRef" color="#b8c8ff" :intensity="0" />
</template>
