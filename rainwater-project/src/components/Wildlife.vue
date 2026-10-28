<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { useLoop } from '@tresjs/core'
import { Color, DoubleSide, Group, MeshBasicMaterial, MeshStandardMaterial, Object3D, SphereGeometry } from 'three'
import type { InstancedMesh } from 'three'
import { terrainHeight, smoothstep } from '../scene/terrain'
import { ui, world } from '../scene/rainState'
import { sky } from '../scene/daylight'
import { waveFlow, waveHeight } from '../scene/waves'
import { makeBird, makeButterflyGeometry, makeRabbit, makeSheep } from '../scene/animals'

// A small living world: sheep that graze and wander, rabbits that hop (and run for their burrows when it
// pours), a flock of birds circling overhead, butterflies in fair weather and smoke from the chimney.
// Everything is a handful of low-poly meshes animated on the CPU, so it costs next to nothing.
let seed = 4242
const random = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const range = (min: number, max: number) => min + random() * (max - min)

// ---- Shared geometry ----
const sphere = new SphereGeometry(1, 10, 8)

// ---- World rules ----
// Keep animals off the house, the barrel, the lamp post, the stone path and out of the far distance
const blocked = (x: number, z: number) =>
  (x > -6 && x < 8 && z > world.wallBackZ - 3 && z < 8) || (Math.abs(x) < 1.8 && z > 4 && z < 21) || Math.hypot(x, z) > 32

const pickTarget = (ax: number, az: number, radius: number) => {
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = random() * Math.PI * 2
    const r = Math.sqrt(random()) * radius
    const x = ax + Math.cos(angle) * r
    const z = az + Math.sin(angle) * r
    if (!blocked(x, z)) return { x, z }
  }
  return { x: ax, z: az }
}

interface Walker {
  group: Group
  kind: 'sheep' | 'rabbit'
  x: number
  z: number
  heading: number
  tx: number
  tz: number
  anchorX: number
  anchorZ: number
  radius: number
  state: 'walk' | 'graze' | 'sit' | 'hop' | 'home'
  timer: number
  phase: number
  hopTime: number
  hidden: boolean // rabbit safe in its burrow
  vx: number // velocity while carried by flood water
  vz: number
  spin: number
  swept: boolean
  flying: boolean // launched into the air by a tsunami front
  y: number
  fvx: number
  fvy: number
  fvz: number
  wx: number // angular velocity while tumbling through the air
  wy: number
  wz: number
  cooldown: number
}

const makeWalker = (kind: 'sheep' | 'rabbit', anchorX: number, anchorZ: number, radius: number): Walker => {
  const start = pickTarget(anchorX, anchorZ, radius)
  const target = pickTarget(anchorX, anchorZ, radius)
  return {
    group: kind === 'sheep' ? makeSheep() : makeRabbit(),
    kind,
    x: start.x,
    z: start.z,
    heading: random() * Math.PI * 2,
    tx: target.x,
    tz: target.z,
    anchorX,
    anchorZ,
    radius,
    state: kind === 'sheep' ? 'graze' : 'sit',
    timer: range(1, 5),
    phase: random() * 10,
    hopTime: 0,
    hidden: false,
    vx: 0,
    vz: 0,
    spin: 0,
    swept: false,
    flying: false,
    y: 0,
    fvx: 0,
    fvy: 0,
    fvz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    cooldown: 0,
  }
}

const walkers: Walker[] = [
  ...Array.from({ length: 6 }, () => makeWalker('sheep', -15, 13, 9)),
  ...Array.from({ length: 2 }, () => makeWalker('sheep', 17, -14, 7)),
  ...Array.from({ length: 3 }, () => makeWalker('rabbit', 11, -9, 7)),
  ...Array.from({ length: 3 }, () => makeWalker('rabbit', -12, -10, 7)),
  ...Array.from({ length: 2 }, () => makeWalker('rabbit', 12, 14, 6)),
]

interface Bird {
  group: Group
  angle: number
  speed: number
  radius: number
  altitude: number
  phase: number
}
const birds: Bird[] = Array.from({ length: 10 }, (_, i) => ({
  group: makeBird(),
  angle: random() * Math.PI * 2,
  speed: (i % 3 === 0 ? -1 : 1) * range(0.2, 0.38),
  radius: range(9, 18),
  altitude: range(10, 17),
  phase: random() * 10,
}))

// ---- Instanced extras ----
const BUTTERFLIES = 14
const SMOKE = 18
const butterflyGeometry = makeButterflyGeometry()
const butterflyMaterial = new MeshStandardMaterial({ color: '#ffffff', side: DoubleSide, vertexColors: true, roughness: 0.7 })
const smokeMaterial = new MeshBasicMaterial({ color: '#9a9a9a', transparent: true, opacity: 0.3, depthWrite: false })
const butterflyRef = shallowRef<InstancedMesh | null>(null)
const smokeRef = shallowRef<InstancedMesh | null>(null)

const butterflies = Array.from({ length: BUTTERFLIES }, () => {
  const spot = pickTarget(0, 0, 16)
  return { x: spot.x, z: spot.z, y: range(0.6, 1.5), phase: random() * 20 }
})

watch(butterflyRef, (mesh) => {
  if (!mesh) return
  const palette = ['#f2a33a', '#f6f1d8', '#6fa8e6', '#f2d544', '#e87bb0']
  butterflies.forEach((_, i) => mesh.setColorAt(i, new Color(palette[i % palette.length])))
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}, { immediate: true })

// Chimney top in world space (see House.vue: chimney at [-1.2, 2.4, -2], 1.6 high, house group at y = 1)
const CHIMNEY = { x: -1.2, y: 4.4 }

const dummy = new Object3D()
const flow = { x: 0, z: 0 }

// ---- Update ----
const { onBeforeRender } = useLoop()
onBeforeRender(({ delta, elapsed }) => {
  const dt = Math.min(delta, 0.05)
  const rainy = ui.intensity

  for (const w of walkers) {
    const ground = terrainHeight(w.x, w.z)
    const g = w.group
    // Water surface here: the flood level plus any tsunami front passing over this spot
    const surface = world.waterLevel > 0.05 ? world.waterLevel + waveHeight(w.x, w.z) : -10
    const submerged = surface > ground + 0.15

    // A flooded burrow drives the rabbits out
    if (w.hidden && submerged) w.hidden = false
    g.visible = w.flying || (!w.hidden && !(world.waterLevel > 0.05 && surface > ground + 9))
    if (!g.visible) continue

    // Hit by the crest of a tsunami front: launched high into the air, tumbling and kicking
    w.cooldown -= dt
    if (!w.flying && w.cooldown <= 0 && world.waterLevel > 0.05 && waveHeight(w.x, w.z) > 0.9) {
      waveFlow(w.x, w.z, flow)
      const push = Math.hypot(flow.x, flow.z) || 1
      const power = 9 + random() * 8
      w.flying = true
      w.y = Math.max(ground, surface) + 0.4
      w.fvx = (flow.x / push) * power + (random() - 0.5) * 4
      w.fvz = (flow.z / push) * power + (random() - 0.5) * 4
      w.fvy = 12 + random() * 9
      w.wx = (random() < 0.5 ? -1 : 1) * (6 + random() * 8)
      w.wy = (random() < 0.5 ? -1 : 1) * (4 + random() * 8)
      w.wz = (random() < 0.5 ? -1 : 1) * (5 + random() * 9)
      w.hidden = false
      w.swept = true
    }

    if (w.flying) {
      // Ballistic flight with a bit less gravity than usual, so there is plenty of hang time
      w.fvy -= 7 * dt
      w.x = Math.max(-140, Math.min(140, w.x + w.fvx * dt))
      w.z = Math.max(-140, Math.min(140, w.z + w.fvz * dt))
      w.y += w.fvy * dt
      g.position.set(w.x, w.y, w.z)
      g.rotation.x += w.wx * dt
      g.rotation.y += w.wy * dt
      g.rotation.z += w.wz * dt
      if (w.kind === 'sheep') {
        // Legs flailing, head thrown about
        const { head, legs, knees, jaw } = g.userData as { head: Group; legs: Group[]; knees: Group[]; jaw: Group }
        legs.forEach((leg, i) => (leg.rotation.x = Math.sin(elapsed * 26 + i * 1.7) * 1.1))
        knees.forEach((knee, i) => (knee.rotation.x = Math.abs(Math.sin(elapsed * 22 + i)) * 1.0))
        head.rotation.x = Math.sin(elapsed * 18) * 0.8
        jaw.rotation.x = 0.5 + Math.sin(elapsed * 20) * 0.4 // bleating
      } else {
        const { ears, front, hind } = g.userData as { ears: Group[]; front: Group[]; hind: Group[] }
        ears[0].rotation.z = 0.9 + Math.sin(elapsed * 30) * 0.5
        ears[1].rotation.z = -0.9 - Math.sin(elapsed * 30) * 0.5
        front.forEach((leg, i) => (leg.rotation.x = Math.sin(elapsed * 24 + i) * 1.2))
        hind.forEach((leg, i) => (leg.rotation.x = Math.sin(elapsed * 24 + i * 2) * 1.2))
      }

      const waterTop = world.waterLevel > 0.05 ? world.waterLevel + waveHeight(w.x, w.z) : -10
      const landing = Math.max(terrainHeight(w.x, w.z), waterTop)
      if (w.fvy < 0 && w.y < landing) {
        w.heading = Math.atan2(w.fvx, w.fvz)
        if (waterTop > terrainHeight(w.x, w.z) + 0.15) {
          // Splashes down in the flood and gets carried on again
          w.flying = false
          w.vx = w.fvx * 0.4
          w.vz = w.fvz * 0.4
          w.cooldown = 4
          g.rotation.set(0, w.heading, 0)
        } else {
          // Bounces on the ground a few times, tumbling less each time
          w.y = landing
          w.fvy = -w.fvy * 0.45
          w.fvx *= 0.6
          w.fvz *= 0.6
          w.wx *= 0.6
          w.wy *= 0.6
          w.wz *= 0.6
          if (w.fvy < 2.5) {
            w.flying = false
            w.cooldown = 4
            g.rotation.set(0, w.heading, 0)
          }
        }
      }
      continue
    }

    if (submerged) {
      // Swept away: carried along by the water, tumbling, bobbing on the surface
      waveFlow(w.x, w.z, flow)
      const follow = Math.min(1, dt * 2.5)
      w.vx += (flow.x - w.vx) * follow
      w.vz += (flow.z - w.vz) * follow
      w.x = Math.max(-110, Math.min(110, w.x + w.vx * dt))
      w.z = Math.max(-110, Math.min(110, w.z + w.vz * dt))
      const speed = Math.hypot(w.vx, w.vz)
      if (speed > 0.5) w.heading += (Math.atan2(w.vx, w.vz) - w.heading) * Math.min(1, dt * 3)
      w.spin += dt * (1 + speed * 0.6)
      const tumble = Math.min(1, speed / 6)
      g.position.set(w.x, surface + 0.05 + Math.sin(elapsed * 1.6 + w.phase) * 0.05, w.z)
      g.rotation.set(Math.sin(w.spin + w.phase) * (0.15 + tumble * 1.1), w.heading, Math.cos(w.spin * 0.8 + w.phase) * (0.12 + tumble * 1.4))
      w.swept = true
      continue
    }

    if (w.swept) {
      // The water has gone: get up and head back home
      w.swept = false
      w.vx = 0
      w.vz = 0
      const t = pickTarget(w.anchorX, w.anchorZ, w.radius)
      w.tx = t.x
      w.tz = t.z
      w.state = w.kind === 'sheep' ? 'walk' : 'hop'
      w.timer = 20
    }

    w.timer -= dt
    const speedBase = w.kind === 'sheep' ? 0.7 : 2.6

    // Decide what to do
    if (w.kind === 'rabbit' && rainy > 0.45 && w.state !== 'home') {
      w.state = 'home'
      w.tx = w.anchorX
      w.tz = w.anchorZ
    } else if (w.kind === 'rabbit' && rainy < 0.3 && w.state === 'home') {
      w.state = 'sit'
      w.timer = range(1, 3)
      w.hidden = false
      g.visible = true
    } else if (w.timer <= 0 && w.state !== 'home') {
      if (w.kind === 'sheep') {
        if (w.state === 'graze') {
          const t = pickTarget(w.anchorX, w.anchorZ, w.radius)
          w.tx = t.x
          w.tz = t.z
          w.state = 'walk'
          w.timer = range(6, 14)
        } else {
          w.state = 'graze'
          w.timer = range(5, 12)
        }
      } else if (w.state === 'sit') {
        const t = pickTarget(w.anchorX, w.anchorZ, w.radius)
        w.tx = t.x
        w.tz = t.z
        w.state = 'hop'
        w.timer = range(2, 5)
        w.hopTime = 0
      } else {
        w.state = 'sit'
        w.timer = range(1.5, 5)
      }
    }

    // Steering
    const moving = w.state === 'walk' || w.state === 'hop' || w.state === 'home'
    let hopHeight = 0
    if (moving) {
      const dx = w.tx - w.x
      const dz = w.tz - w.z
      const distance = Math.hypot(dx, dz)
      if (distance < 0.5) {
        if (w.state === 'home') {
          w.hidden = true // safe in the burrow until the rain eases
          g.visible = false
          continue
        }
        w.state = w.kind === 'sheep' ? 'graze' : 'sit'
        w.timer = range(3, 9)
      } else {
        // Turn towards the target, then move forward
        const wanted = Math.atan2(dx, dz)
        let turn = wanted - w.heading
        turn = Math.atan2(Math.sin(turn), Math.cos(turn))
        w.heading += Math.max(-3 * dt, Math.min(3 * dt, turn))
        let speed = speedBase * (w.state === 'home' ? 1.6 : 1)
        if (w.kind === 'rabbit') {
          // Hops: move in bursts that follow the jump arc
          w.hopTime += dt
          const cycle = (w.hopTime * 2.2) % 1
          hopHeight = Math.sin(cycle * Math.PI) * 0.22
          speed *= Math.sin(cycle * Math.PI) * 1.4
        }
        const nx = w.x + Math.sin(w.heading) * speed * dt
        const nz = w.z + Math.cos(w.heading) * speed * dt
        // (an animal that was swept into a forbidden spot may always walk back out)
        if (blocked(nx, nz) && !blocked(w.x, w.z)) {
          const t = pickTarget(w.anchorX, w.anchorZ, w.radius)
          w.tx = t.x
          w.tz = t.z
        } else {
          w.x = nx
          w.z = nz
        }
        w.phase += dt * (w.kind === 'sheep' ? 7 : 0)
      }
    }

    // Pose
    const y = terrainHeight(w.x, w.z)
    g.position.set(w.x, y + hopHeight, w.z)
    g.rotation.set(w.kind === 'rabbit' && moving ? -Math.cos(((w.hopTime * 2.2) % 1) * Math.PI) * 0.35 : 0, w.heading, 0)

    const lerp = Math.min(1, dt * 10)
    if (w.kind === 'sheep') {
      const { head, jaw, legs, knees, tail, body, earL, earR } = g.userData as {
        head: Group; jaw: Group; legs: Group[]; knees: Group[]; tail: Group; body: Object3D; earL: Group; earR: Group
      }
      const walking = w.state === 'walk'
      // Diagonal gait: opposite legs swing together, the knee bends while the leg is lifted
      legs.forEach((leg, i) => {
        const cycle = Math.sin(w.phase + (i === 0 || i === 3 ? 0 : Math.PI))
        leg.rotation.x += ((walking ? cycle * 0.5 : 0) - leg.rotation.x) * lerp
        knees[i].rotation.x += ((walking ? Math.max(0, -cycle) * 0.9 : 0) - knees[i].rotation.x) * lerp
      })
      // Head down and chewing while grazing, up and bobbing while walking
      const grazing = w.state === 'graze'
      const headTarget = grazing ? 0.95 + Math.sin(elapsed * 2.2 + w.phase) * 0.05 : walking ? 0.08 + Math.sin(w.phase) * 0.05 : 0.2
      head.rotation.x += (headTarget - head.rotation.x) * Math.min(1, dt * 4)
      jaw.rotation.x = grazing ? 0.18 + Math.abs(Math.sin(elapsed * 6 + w.phase)) * 0.2 : 0.03
      // Idle details: breathing, tail wag, ear flicks
      body.scale.y = 1 + Math.sin(elapsed * 1.8 + w.phase) * 0.012
      tail.rotation.x = Math.sin(elapsed * 4 + w.phase) * 0.12
      const flick = Math.max(0, Math.sin(elapsed * 0.7 + w.phase * 3) - 0.92) * 8
      earL.rotation.x = flick
      earR.rotation.x = -flick * 0.5
    } else {
      const { ears, torso, front, hind } = g.userData as { ears: Group[]; torso: Group; front: Group[]; hind: Group[] }
      const hopping = moving
      const cycle = (w.hopTime * 2.2) % 1
      const airborne = hopping ? Math.sin(cycle * Math.PI) : 0
      // In the air the hind legs stretch out behind and the front legs tuck in; sitting, everything rests
      hind.forEach((leg) => (leg.rotation.x += ((hopping ? -airborne * 0.9 : 0.5) - leg.rotation.x) * lerp))
      front.forEach((leg) => (leg.rotation.x += ((hopping ? airborne * 0.8 : -0.3) - leg.rotation.x) * lerp))
      torso.rotation.x += ((w.state === 'sit' ? -0.25 : 0) - torso.rotation.x) * lerp // sits up on its haunches
      const twitch = w.state === 'sit' ? Math.sin(elapsed * 7 + w.phase) * 0.08 + Math.max(0, Math.sin(elapsed * 0.9 + w.phase) - 0.9) * 2 : 0
      const lay = hopping ? 0.9 : 0.12 // ears lie back while running, stand up while sitting
      ears[0].rotation.z = lay * 0.5 + twitch
      ears[1].rotation.z = -lay * 0.5 - twitch
      ears[0].rotation.x = ears[1].rotation.x = hopping ? -0.9 : 0
    }
  }

  // Birds circle high above and leave when the weather turns
  const birdPresence = ui.apocalypse ? 0 : (1 - smoothstep(0.2, 0.45, rainy)) * smoothstep(0.1, 0.3, sky.day)
  const cx = Math.sin(elapsed * 0.04) * 8
  const cz = Math.cos(elapsed * 0.03) * 8
  for (const b of birds) {
    b.angle += b.speed * dt
    const flapping = Math.floor(elapsed * 0.4 + b.phase) % 3 !== 0
    const group = b.group
    group.visible = birdPresence > 0.01
    if (!group.visible) continue
    const x = cx + Math.cos(b.angle) * b.radius
    const z = cz + Math.sin(b.angle) * b.radius
    const flee = (1 - birdPresence) * 40
    group.position.set(x, b.altitude + Math.sin(elapsed * 0.7 + b.phase) * 1.2 + flee, z)
    const vx = -Math.sin(b.angle) * Math.sign(b.speed)
    const vz = Math.cos(b.angle) * Math.sign(b.speed)
    group.rotation.set(0, Math.atan2(vx, vz), -0.3 * Math.sign(b.speed))
    const { wings, elbows } = group.userData as { wings: Group[]; elbows: Group[] }
    // Downstroke with the wing extended, upstroke with the wing folded at the elbow; the outer wing lags behind
    const beat = elapsed * 11 + b.phase
    const flap = flapping ? Math.sin(beat) * 0.65 : 0.12
    const fold = flapping ? Math.sin(beat - 0.9) * 0.45 - 0.1 : -0.05
    wings[0].rotation.z = flap
    wings[1].rotation.z = -flap
    elbows[0].rotation.z = fold
    elbows[1].rotation.z = -fold
  }

  // Butterflies in fair weather
  const butterflyMesh = butterflyRef.value
  if (butterflyMesh) {
    const presence = ui.apocalypse ? 0 : (1 - smoothstep(0.05, 0.2, rainy)) * smoothstep(0.3, 0.6, sky.day)
    butterflyMesh.visible = presence > 0.01
    if (butterflyMesh.visible) {
      butterflies.forEach((bf, i) => {
        const t = elapsed + bf.phase
        dummy.position.set(
          bf.x + Math.sin(t * 0.6) * 1.8 + Math.sin(t * 1.9) * 0.3,
          terrainHeight(bf.x, bf.z) + bf.y + Math.sin(t * 1.7) * 0.25,
          bf.z + Math.cos(t * 0.5) * 1.8,
        )
        dummy.rotation.set(0, t * 0.6 + Math.PI / 2, Math.sin(t * 1.7) * 0.2)
        // Wing beat: the flat wings narrow and widen
        dummy.scale.set(0.25 + 0.75 * Math.abs(Math.sin(t * 20)), 1, 1).multiplyScalar(presence * 1.2)
        dummy.updateMatrix()
        butterflyMesh.setMatrixAt(i, dummy.matrix)
      })
      butterflyMesh.instanceMatrix.needsUpdate = true
    }
  }

  // Chimney smoke drifting downwind
  const smokeMesh = smokeRef.value
  if (smokeMesh) {
    const gust = 1.2 + rainy * 2.5
    for (let i = 0; i < SMOKE; i++) {
      const t = (elapsed * 0.18 + i / SMOKE) % 1
      dummy.position.set(
        CHIMNEY.x + t * gust * 2.2 + Math.sin(elapsed * 0.7 + i) * 0.1 * t,
        CHIMNEY.y + t * 3.4,
        world.chimneyZ + Math.sin(i * 2.1 + elapsed * 0.3) * 0.15 * t,
      )
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar((0.1 + t * 0.55) * (1 - t * t * t) * (1 - rainy * 0.5))
      dummy.updateMatrix()
      smokeMesh.setMatrixAt(i, dummy.matrix)
    }
    smokeMesh.instanceMatrix.needsUpdate = true
  }
})
</script>

<template>
  <primitive v-for="(w, i) in walkers" :key="`walker-${i}`" :object="w.group" />
  <primitive v-for="(b, i) in birds" :key="`bird-${i}`" :object="b.group" />
  <TresInstancedMesh ref="butterflyRef" :args="[butterflyGeometry, butterflyMaterial, BUTTERFLIES]" :frustum-culled="false" />
  <TresInstancedMesh ref="smokeRef" :args="[sphere, smokeMaterial, SMOKE]" :frustum-culled="false" />
</template>
