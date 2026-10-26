<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ui, requestEmpty, setApocalypse } from '../scene/rainState'
import { mmFromIntensity, startLive, stopLive } from '../scene/weather'
import { formatHour } from '../scene/daylight'

const formatPower = (w: number) => (w < 1 ? `${(w * 1000).toFixed(0)} mW` : `${w.toFixed(2)} W`)
const formatEnergy = (wh: number) => (wh < 1 ? `${(wh * 1000).toFixed(0)} mWh` : wh < 1000 ? `${wh.toFixed(2)} Wh` : `${(wh / 1000).toFixed(3)} kWh`)

const percent = computed(() => Math.round((ui.volume / ui.capacity) * 100))
const intensityPercent = computed({
  get: () => Math.round(ui.intensity * 100),
  set: (v: number) => (ui.intensity = v / 100),
})
const mm = computed(() => (ui.intensity > 0.001 ? mmFromIntensity(ui.intensity) : 0))
const label = computed(() => {
  const i = ui.intensity
  if (i <= 0.01) return 'Dry'
  if (i < 0.25) return 'Drizzle'
  if (i < 0.6) return 'Rain'
  if (i < 0.85) return 'Heavy rain'
  return 'Storm'
})
const presets = [
  { name: 'Off', value: 0 },
  { name: 'Drizzle', value: 15 },
  { name: 'Rain', value: 50 },
  { name: 'Storm', value: 100 },
]

// Live weather
const query = ref('')
const isLive = computed(() => ui.mode === 'live')
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 15000)
onBeforeUnmount(() => clearInterval(clock))
const updatedAgo = computed(() => {
  if (!ui.live.updated) return ''
  const minutes = Math.floor((now.value - ui.live.updated) / 60000)
  return minutes < 1 ? 'just now' : `${minutes} min ago`
})
const submit = () => startLive(query.value)
const toggleApocalypse = () => {
  if (!ui.apocalypse) stopLive()
  setApocalypse(!ui.apocalypse)
}

// Time of day
const timePresets = [
  { name: 'Dawn', hour: 6 },
  { name: 'Noon', hour: 12 },
  { name: 'Dusk', hour: 18.5 },
  { name: 'Night', hour: 0 },
]
const dayLengths = [1, 2, 5]
const phase = computed(() => {
  const h = ui.timeOfDay
  if (h >= 5 && h < 7.5) return 'Dawn'
  if (h >= 7.5 && h < 17) return 'Day'
  if (h >= 17 && h < 20) return 'Dusk'
  return 'Night'
})

// Water usage
const usagePresets = [0, 2, 5, 10, 20]
const timeLapses = [1, 10, 60, 300]
</script>

<template>
  <div class="hud">
    <h2>Rain barrel</h2>

    <div class="tank">
      <div class="gauge">
        <div class="fill" :class="{ full: ui.overflowing }" :style="{ height: percent + '%' }" />
      </div>
      <div class="readout">
        <div class="volume">{{ ui.volume.toFixed(1) }}<span> L</span></div>
        <div class="sub">of {{ ui.capacity }} L · {{ percent }}%</div>
        <div class="sub flow">+{{ (ui.flowRate * 60).toFixed(1) }} L/min in</div>
        <div class="sub use">−{{ (ui.usageRate * 60).toFixed(1) }} L/min used</div>
        <div v-if="ui.overflowing" class="warn">Overflowing!</div>
        <div v-else-if="ui.usageLpm > 0 && ui.volume < 0.5" class="warn">Tank empty</div>
      </div>
    </div>

    <section>
      <h3>Weather</h3>
      <div class="segmented">
        <button :class="{ active: !isLive }" @click="stopLive">Manual</button>
        <button :class="{ active: isLive }" :disabled="ui.live.loading" @click="isLive ? null : submit()">Live</button>
      </div>
      <form class="location" @submit.prevent="submit">
        <input v-model="query" type="text" placeholder="City, e.g. Ghent or Seattle, US" aria-label="Location" />
        <button type="submit" :disabled="ui.live.loading">{{ ui.live.loading ? '…' : 'Go' }}</button>
      </form>
      <div v-if="ui.live.error" class="error">{{ ui.live.error }}</div>
      <div v-else-if="isLive" class="live-info">
        <div><strong>{{ ui.live.name }}</strong></div>
        <div class="sub">{{ ui.live.description }} · {{ ui.live.mmPerHour.toFixed(1) }} mm/h · updated {{ updatedAgo }}</div>
      </div>
    </section>

    <section>
      <label class="row">
        <span>Time of day</span>
        <strong>{{ formatHour(ui.timeOfDay) }} · {{ phase }}</strong>
      </label>
      <input v-model.number="ui.timeOfDay" type="range" min="0" max="23.99" step="0.05" />
      <div class="presets">
        <button v-for="t in timePresets" :key="t.name" @click="ui.timeOfDay = t.hour">{{ t.name }}</button>
      </div>
      <div class="presets">
        <button :class="{ active: ui.autoTime }" @click="ui.autoTime = !ui.autoTime">{{ ui.autoTime ? 'Pause clock' : 'Run clock' }}</button>
        <button v-for="d in dayLengths" :key="d" :class="{ active: ui.dayLengthMin === d }" @click="ui.dayLengthMin = d">{{ d }} min/day</button>
      </div>
    </section>

    <section>
      <label class="row">
        <span>Rain intensity</span>
        <strong>{{ label }} · {{ mm.toFixed(1) }} mm/h</strong>
      </label>
      <input v-model.number="intensityPercent" type="range" min="0" max="100" step="1" :disabled="isLive || ui.apocalypse" />
      <div class="presets">
        <button v-for="p in presets" :key="p.name" :disabled="isLive || ui.apocalypse" @click="intensityPercent = p.value">{{ p.name }}</button>
      </div>
    </section>

    <section>
      <label class="row">
        <span>Water usage</span>
        <strong>{{ ui.usageLpm }} L/min</strong>
      </label>
      <input v-model.number="ui.usageLpm" type="range" min="0" max="30" step="0.5" />
      <div class="presets">
        <button v-for="u in usagePresets" :key="u" @click="ui.usageLpm = u">{{ u }}</button>
      </div>
      <label class="row">
        <span>Time-lapse (tank only)</span>
        <strong>×{{ ui.timeLapse }}</strong>
      </label>
      <div class="presets">
        <button v-for="t in timeLapses" :key="t" :class="{ active: ui.timeLapse === t }" @click="ui.timeLapse = t">×{{ t }}</button>
      </div>
      <div class="sub">Used so far: {{ ui.usedTotal.toFixed(1) }} L</div>
    </section>

    <section>
      <h3>Hydro generator</h3>
      <div class="power">
        <span class="power-value">{{ formatPower(ui.power) }}</span>
        <span class="sub">lamp {{ ui.power > 0.9 ? 'full' : ui.power > 0.05 ? 'glowing' : ui.power > 0.005 ? 'dim' : 'off' }}</span>
      </div>
      <div class="sub">Generated: {{ formatEnergy(ui.energyWh) }} · stored in water: {{ formatEnergy(ui.potentialWh) }}</div>
      <label class="row">
        <span>Turbine efficiency</span>
        <strong>{{ Math.round(ui.efficiency * 100) }}%</strong>
      </label>
      <input v-model.number="ui.efficiency" type="range" min="0.1" max="0.9" step="0.05" />
      <label class="row">
        <span>Tank size</span>
        <strong>{{ ui.capacity }} L</strong>
      </label>
      <input v-model.number="ui.capacity" type="range" min="50" max="600" step="10" />
    </section>

    <button class="apocalypse" :class="{ on: ui.apocalypse }" @click="toggleApocalypse">
      {{ ui.apocalypse ? 'Stop the flood' : 'Apocalypse: flood the world' }}
    </button>
    <div v-if="ui.floodLevel > 0.05" class="sub flood-level">Flood level: {{ ui.floodLevel.toFixed(1) }} m</div>

    <button class="graphs" :class="{ active: ui.showCharts }" @click="ui.showCharts = !ui.showCharts">
      {{ ui.showCharts ? 'Hide graphs' : 'Show graphs' }}
    </button>
    <button class="empty" :disabled="ui.volume < 0.5 || ui.emptying" @click="requestEmpty">
      Empty tank
    </button>
  </div>
</template>

<style scoped>
.hud {
  position: fixed;
  top: 16px;
  left: 16px;
  width: 280px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 16px;
  border-radius: 14px;
  background: rgba(15, 30, 45, 0.78);
  backdrop-filter: blur(8px);
  color: #e8f4ff;
  font-family: system-ui, sans-serif;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}
h2 {
  margin: 0 0 12px;
  font-size: 15px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.8;
}
h3 {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.65;
}
section {
  margin-bottom: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.tank {
  display: flex;
  gap: 14px;
  margin-bottom: 14px;
}
.gauge {
  position: relative;
  flex: none;
  width: 46px;
  height: 120px;
  border: 2px solid #8fc8ee;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: flex-end;
}
.fill {
  width: 100%;
  background: linear-gradient(#5cc2f5, #2a7fb8);
  transition: height 0.15s linear;
}
.fill.full {
  background: linear-gradient(#ff9a6c, #d9534f);
}
.volume {
  font-size: 32px;
  font-weight: 700;
}
.volume span {
  font-size: 16px;
  font-weight: 400;
}
.sub {
  font-size: 12px;
  opacity: 0.75;
  margin-top: 2px;
}
.flow {
  color: #7fb6f2;
  opacity: 1;
}
.use {
  color: #f0996f;
  opacity: 1;
}
.power {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.power-value {
  font-size: 24px;
  font-weight: 700;
  color: #3fc896;
}
.warn {
  margin-top: 6px;
  color: #ffb08a;
  font-weight: 600;
  font-size: 13px;
}
.error {
  margin-top: 6px;
  color: #ffb08a;
  font-size: 12px;
}
.live-info {
  margin-top: 8px;
  font-size: 13px;
}
.row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 6px;
}
input[type='range'] {
  width: 100%;
  accent-color: #5cc2f5;
}
input[type='range']:disabled {
  opacity: 0.4;
}
input[type='text'] {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  font-size: 12px;
}
.location {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.location button {
  flex: none;
  width: 44px;
}
.segmented {
  display: flex;
  gap: 6px;
}
.presets {
  display: flex;
  gap: 6px;
  margin: 8px 0;
}
button {
  cursor: pointer;
  border: 0;
  border-radius: 8px;
  padding: 6px 4px;
  font: inherit;
  font-size: 12px;
  color: inherit;
  background: rgba(255, 255, 255, 0.12);
  flex: 1;
}
button.active {
  background: #2a78d6;
}
button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.22);
}
button.active:hover:not(:disabled) {
  background: #3987e5;
}
.graphs {
  width: 100%;
  margin-bottom: 8px;
  padding: 8px;
}
.apocalypse {
  width: 100%;
  margin-bottom: 4px;
  padding: 10px;
  font-size: 13px;
  font-weight: 600;
  background: linear-gradient(135deg, #1f5f8f, #123a5c);
}
.apocalypse.on {
  background: linear-gradient(135deg, #c0392b, #7a1f1a);
}
.flood-level {
  margin-bottom: 8px;
  text-align: center;
}
.empty {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
  background: linear-gradient(135deg, #ff7a4d, #d9304f);
}
.empty:hover:not(:disabled) {
  background: linear-gradient(135deg, #ff8d65, #e8405f);
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
