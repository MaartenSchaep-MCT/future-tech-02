<script setup lang="ts">
import { shallowRef } from 'vue'
import type { TresObject } from '@tresjs/core'
import { Shape, DoubleSide } from 'three'

const props = defineProps<{
  position?: [x: number, y: number, z: number]
}>()

const meshRef = shallowRef<TresObject | null>(null)
defineExpose({ mesh: meshRef })

// Local coordinates: house centre at origin, floor at y = -1
const houseWidth = 5
const houseHeight = 2
const houseLength = 10
const floorY = -houseHeight / 2

// Roof
const eaveX = 3.2 // horizontal distance from centre to the roof edge (overhang included)
const eaveY = houseHeight / 2
const ridgeY = 3
const roofThickness = 0.15
const roofLength = houseLength + 0.8
const roofPitch = Math.atan2(ridgeY - eaveY, eaveX)
const roofPanelWidth = Math.hypot(eaveX, ridgeY - eaveY) + 0.1
const roofCenterX = eaveX / 2
const roofCenterY = (eaveY + ridgeY) / 2

// Attic block between the walls and the roof, so the roof rests on the house
const roofSlope = (ridgeY - eaveY) / eaveX
const atticApexY = ridgeY - 0.12
const atticEdgeY = atticApexY - roofSlope * (houseWidth / 2)
const atticShape = new Shape()
atticShape.moveTo(-houseWidth / 2, eaveY - 0.05)
atticShape.lineTo(houseWidth / 2, eaveY - 0.05)
atticShape.lineTo(houseWidth / 2, atticEdgeY)
atticShape.lineTo(0, atticApexY)
atticShape.lineTo(-houseWidth / 2, atticEdgeY)

// Gutter (runs along the +x eave and slopes towards +z)
const gutterX = eaveX + 0.05
const gutterY = eaveY - 0.02
const gutterRadius = 0.16
const gutterSlope = 0.03
const downspoutZ = roofLength / 2 - 0.4

// Rain barrel, directly below the end of the gutter
const barrelRadius = 0.6
const barrelHeight = 1.4
const barrelCenterY = floorY + barrelHeight / 2
const barrelTopY = floorY + barrelHeight
const downspoutBottomY = barrelTopY - 0.15
const downspoutHeight = gutterY - gutterRadius - downspoutBottomY
const bandYs = [-0.45, 0.45]
</script>

<template>
<TresGroup :position="props.position">
  <!-- Walls -->
  <TresMesh ref="meshRef" cast-shadow receive-shadow>
    <TresBoxGeometry :args="[houseWidth, houseHeight, houseLength]" />
    <TresMeshStandardMaterial color="#d9c7a3" :roughness="0.9" />
  </TresMesh>

  <!-- Attic / gable block under the roof -->
  <TresMesh :position="[0, 0, -houseLength / 2]">
    <TresExtrudeGeometry :args="[atticShape, { depth: houseLength, bevelEnabled: false }]" />
    <TresMeshStandardMaterial color="#d9c7a3" :roughness="0.9" />
  </TresMesh>

  <!-- Foundation -->
  <TresMesh :position="[0, floorY + 0.1, 0]">
    <TresBoxGeometry :args="[houseWidth + 0.15, 0.2, houseLength + 0.15]" />
    <TresMeshStandardMaterial color="#7d7d80" :roughness="1" />
  </TresMesh>

  <!-- Roof panels -->
  <TresMesh :position="[-roofCenterX, roofCenterY, 0]" :rotation="[0, 0, roofPitch]" cast-shadow>
    <TresBoxGeometry :args="[roofPanelWidth, roofThickness, roofLength]" />
    <TresMeshStandardMaterial color="#8a3b2a" :roughness="0.8" />
  </TresMesh>
  <TresMesh :position="[roofCenterX, roofCenterY, 0]" :rotation="[0, 0, -roofPitch]" cast-shadow>
    <TresBoxGeometry :args="[roofPanelWidth, roofThickness, roofLength]" />
    <TresMeshStandardMaterial color="#8a3b2a" :roughness="0.8" />
  </TresMesh>

  <!-- Roof ridge cap -->
  <TresMesh :position="[0, ridgeY + 0.05, 0]" :rotation="[0, 0, Math.PI / 4]">
    <TresBoxGeometry :args="[0.35, 0.35, roofLength + 0.1]" />
    <TresMeshStandardMaterial color="#5e2418" :roughness="0.7" />
  </TresMesh>

  <!-- Fascia boards along the eaves -->
  <TresMesh v-for="side in [-1, 1]" :key="side" :position="[side * (eaveX + 0.02), eaveY - 0.05, 0]">
    <TresBoxGeometry :args="[0.06, 0.2, roofLength]" />
    <TresMeshStandardMaterial color="#f2efe8" />
  </TresMesh>

  <!-- Chimney -->
  <TresMesh :position="[-1.2, 2.4, -2]" cast-shadow>
    <TresBoxGeometry :args="[0.7, 1.6, 0.7]" />
    <TresMeshStandardMaterial color="#8c5a48" :roughness="1" />
  </TresMesh>
  <TresMesh :position="[-1.2, 3.25, -2]">
    <TresBoxGeometry :args="[0.9, 0.12, 0.9]" />
    <TresMeshStandardMaterial color="#6b6b6e" />
  </TresMesh>

  <!-- Door (front) -->
  <TresMesh :position="[0, floorY + 0.8, houseLength / 2 + 0.03]">
    <TresBoxGeometry :args="[0.9, 1.6, 0.08]" />
    <TresMeshStandardMaterial color="#4a2f1b" :roughness="0.8" />
  </TresMesh>
  <TresMesh :position="[0.3, floorY + 0.8, houseLength / 2 + 0.09]">
    <TresSphereGeometry :args="[0.05, 12, 12]" />
    <TresMeshStandardMaterial color="#d4af37" :metalness="0.8" :roughness="0.3" />
  </TresMesh>

  <!-- Windows (both long sides) -->
  <template v-for="side in [-1, 1]" :key="side">
    <template v-for="z in [-2.8, 0, 2.8]" :key="z">
      <TresMesh :position="[side * (houseWidth / 2 + 0.02), 0, z]">
        <TresBoxGeometry :args="[0.06, 0.9, 0.9]" />
        <TresMeshStandardMaterial color="#f2efe8" />
      </TresMesh>
      <TresMesh :position="[side * (houseWidth / 2 + 0.06), 0, z]">
        <TresBoxGeometry :args="[0.04, 0.7, 0.7]" />
        <TresMeshStandardMaterial color="#9fd3ee" :metalness="0.6" :roughness="0.1" />
      </TresMesh>
    </template>
  </template>

  <!-- Gutter: half pipe along the +x eave, tilted so water runs towards the downspout (+z) -->
  <TresGroup :position="[gutterX, gutterY, 0]" :rotation="[gutterSlope, 0, 0]">
    <TresMesh :rotation="[Math.PI / 2, 0, 0]">
      <TresCylinderGeometry :args="[gutterRadius, gutterRadius, roofLength, 16, 1, true, -Math.PI / 2, Math.PI]" />
      <TresMeshStandardMaterial color="#9aa3ab" :metalness="0.7" :roughness="0.4" :side="DoubleSide" />
    </TresMesh>
  </TresGroup>

  <!-- Downspout from the gutter into the barrel -->
  <TresMesh :position="[gutterX, downspoutBottomY + downspoutHeight / 2, downspoutZ]">
    <TresCylinderGeometry :args="[0.07, 0.07, downspoutHeight, 12]" />
    <TresMeshStandardMaterial color="#9aa3ab" :metalness="0.7" :roughness="0.4" />
  </TresMesh>

  <!-- Rain barrel -->
  <TresGroup :position="[gutterX, barrelCenterY, downspoutZ]">
    <TresMesh cast-shadow>
      <TresCylinderGeometry :args="[barrelRadius, barrelRadius * 0.88, barrelHeight, 24, 1, true]" />
      <TresMeshStandardMaterial color="#2f5d8a" :roughness="0.6" :side="DoubleSide" />
    </TresMesh>
    <!-- bottom -->
    <TresMesh :position="[0, -barrelHeight / 2 + 0.02, 0]" :rotation="[-Math.PI / 2, 0, 0]">
      <TresCircleGeometry :args="[barrelRadius * 0.88, 24]" />
      <TresMeshStandardMaterial color="#1f3d5c" />
    </TresMesh>
    <!-- water surface -->
    <TresMesh :position="[0, barrelHeight / 2 - 0.2, 0]" :rotation="[-Math.PI / 2, 0, 0]">
      <TresCircleGeometry :args="[barrelRadius - 0.02, 24]" />
      <TresMeshStandardMaterial color="#3fa7d6" :metalness="0.3" :roughness="0.1" />
    </TresMesh>
    <!-- top rim -->
    <TresMesh :position="[0, barrelHeight / 2, 0]" :rotation="[Math.PI / 2, 0, 0]">
      <TresTorusGeometry :args="[barrelRadius, 0.03, 8, 24]" />
      <TresMeshStandardMaterial color="#1f3d5c" />
    </TresMesh>
    <!-- metal bands -->
    <TresMesh v-for="y in bandYs" :key="y" :position="[0, y, 0]" :rotation="[Math.PI / 2, 0, 0]">
      <TresTorusGeometry :args="[barrelRadius * (1 - 0.06 * Math.abs(y) / 0.45) + 0.01, 0.03, 8, 24]" />
      <TresMeshStandardMaterial color="#555b61" :metalness="0.8" :roughness="0.4" />
    </TresMesh>
    <!-- tap -->
    <TresMesh :position="[barrelRadius * 0.95, -barrelHeight / 2 + 0.25, 0]" :rotation="[0, 0, Math.PI / 2]">
      <TresCylinderGeometry :args="[0.04, 0.04, 0.16, 8]" />
      <TresMeshStandardMaterial color="#b08d57" :metalness="0.8" :roughness="0.3" />
    </TresMesh>
  </TresGroup>
</TresGroup>
</template>
