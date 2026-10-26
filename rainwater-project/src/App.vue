<script setup lang="ts">
import { TresCanvas } from '@tresjs/core/webgpu'
import { ACESFilmicToneMapping } from 'three'
import TheExperience from './components/TheExperience.vue'
import RainHud from './components/RainHud.vue'
import RainCharts from './components/RainCharts.vue'
import { skyColor, ui } from './scene/rainState'
</script>

<template>
  <TresCanvas
    :clear-color="skyColor"
    window-size
    :dpr="[1, 1.5]"
    shadows
    :tone-mapping="ACESFilmicToneMapping"
    :tone-mapping-exposure="0.9"
  >
    <TheExperience />
  </TresCanvas>
  <RainHud />
  <RainCharts v-if="ui.showCharts" />
</template>
