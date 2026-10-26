<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ui, requestEmpty, setApocalypse, RUNOFF_COEFFICIENT } from '../scene/rainState'
import { mmFromIntensity, setPlace, startLive, stopLive } from '../scene/weather'
import { formatHour } from '../scene/daylight'
import { MIN_ROOF_AREA, MAX_ROOF_AREA, eaveX } from '../scene/config'
import { climateData } from '../scene/climate'
import { balancedOption, reliabilityCurve, roofOptions, simulate, syntheticSeries } from '../scene/sizing'

type Tab = 'plan' | 'weather' | 'world'
const tabs: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'weather', label: 'Weather' },
  { id: 'world', label: 'World' },
]
const tab = ref<Tab>('plan')

// ---- Tank summary ----
const percent = computed(() => Math.round((ui.volume / ui.capacity) * 100))

// ---- Location ----
const query = ref('')
const search = () => setPlace(query.value)
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const monthMax = computed(() => Math.max(1, ...ui.climate.monthly))

// ---- Weather ----
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
const isLive = computed(() => ui.mode === 'live')
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 15000)
onBeforeUnmount(() => clearInterval(clock))
const updatedAgo = computed(() => {
  if (!ui.live.updated) return ''
  const minutes = Math.floor((now.value - ui.live.updated) / 60000)
  return minutes < 1 ? 'just now' : `${minutes} min ago`
})

// ---- Plan: sizing the roof and the tanks ----
const MAX_TANKS = 10
const ROOF_SIZES = [20, 30, 40, 60, 80, 100, 120]
const usePresets = [
  { name: 'Garden', litres: 100 },
  { name: 'Toilets', litres: 150 },
  { name: 'Garden + toilets', litres: 300 },
  { name: 'Household', litres: 500 },
]
const timeLapses = [1, 10, 60, 300, 1440]
const roofLength = computed(() => ui.roofArea / eaveX)

// Rainfall series the calculations run on: the real history of the location, or a typical climate before that
const series = computed(() => {
  void ui.climate.version
  return ui.climate.loaded ? climateData.daily : syntheticSeries(ui.avgRainMmDay)
})
const target = computed(() => ui.targetReliability / 100)
const current = computed(() => simulate(series.value, ui.roofArea, ui.dailyUseL, ui.capacity))
const options = computed(() => roofOptions(series.value, ui.dailyUseL, target.value, ROOF_SIZES))
const balanced = computed(() => balancedOption(options.value))
const smallestRoof = computed(() => options.value.find((o) => o.tank !== null)?.area ?? null)

const tanksFor = (litres: number) => Math.max(1, Math.min(MAX_TANKS, Math.ceil(litres / ui.tankSize)))
const applyOption = (area: number, tank: number) => {
  ui.roofAuto = false
  ui.roofArea = area
  ui.tanks = tanksFor(tank)
}

// Reliability against tank volume for the current roof (SVG chart)
const curveMax = computed(() => {
  const wanted = Math.max(1000, ui.capacity * 1.5, (balanced.value?.tank ?? 0) * 1.5)
  return Math.ceil(wanted / 500) * 500
})
const curve = computed(() => reliabilityCurve(series.value, ui.roofArea, ui.dailyUseL, curveMax.value))
const CW = 268
const CH = 96
const CP = { left: 26, right: 6, top: 6, bottom: 16 }
const cx = (tank: number) => CP.left + ((CW - CP.left - CP.right) * tank) / curveMax.value
const cy = (r: number) => CP.top + (CH - CP.top - CP.bottom) * (1 - r)
const curvePath = computed(() => curve.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(p.tank).toFixed(1)},${cy(p.reliability).toFixed(1)}`).join(' '))

const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0))

// ---- World ----
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
const toggleApocalypse = () => {
  if (!ui.apocalypse) stopLive()
  setApocalypse(!ui.apocalypse)
}
</script>

<template>
  <div class="hud">
    <header>
      <h2>Rainwater planner</h2>
      <div class="icons">
        <button class="icon" :class="{ active: ui.showCharts }" title="Show / hide graphs" aria-label="Toggle graphs" @click="ui.showCharts = !ui.showCharts">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>
        </button>
        <button class="icon danger" :disabled="ui.volume < 0.5 || ui.emptying" title="Empty the tank (water explosion)" aria-label="Empty tank" @click="requestEmpty">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z" /><path d="M4 4l2 2M20 4l-2 2M3 12h2M19 12h2" /></svg>
        </button>
      </div>
    </header>

    <div class="tank">
      <div class="gauge" :title="`${percent}% full`">
        <div class="fill" :class="{ full: ui.overflowing }" :style="{ height: percent + '%' }" />
      </div>
      <div class="readout">
        <div class="volume">{{ ui.volume.toFixed(0) }}<span> / {{ fmt(ui.capacity) }} L</span></div>
        <div class="sub flow">+{{ (ui.flowRate * 60).toFixed(1) }} L/min in</div>
        <div class="sub use">−{{ (ui.usageRate * 60).toFixed(1) }} L/min used</div>
        <div v-if="ui.overflowing" class="warn">Overflowing!</div>
        <div v-else-if="ui.dailyUseL > 0 && ui.volume < 0.5" class="warn">Tank empty</div>
      </div>
    </div>

    <!-- Location: drives both the rainfall statistics and the live weather -->
    <form class="location" @submit.prevent="search">
      <input v-model="query" type="text" placeholder="Your city, e.g. Ghent or Seattle, US" aria-label="Location" />
      <button type="submit" :disabled="ui.place.loading">{{ ui.place.loading ? '…' : 'Go' }}</button>
    </form>
    <div v-if="ui.place.error" class="error">{{ ui.place.error }}</div>
    <div v-else-if="ui.place.name" class="place">
      <span>{{ ui.place.name }}</span>
      <span v-if="ui.climate.loading" class="muted">loading rainfall…</span>
      <span v-else-if="ui.climate.loaded" class="muted">{{ ui.climate.annualMm.toFixed(0) }} mm/year</span>
    </div>

    <nav class="tabs" role="tablist">
      <button v-for="t in tabs" :key="t.id" role="tab" :aria-selected="tab === t.id" :class="{ active: tab === t.id }" @click="tab = t.id">
        {{ t.label }}
      </button>
    </nav>

    <!-- Plan -->
    <section v-if="tab === 'plan'">
      <h3>Rainfall {{ ui.climate.loaded ? 'at your location' : '(typical)' }}</h3>
      <div v-if="ui.climate.error" class="error">{{ ui.climate.error }}</div>
      <template v-if="ui.climate.loaded">
        <dl class="stats">
          <dt>Per year</dt><dd>{{ ui.climate.annualMm.toFixed(0) }} mm</dd>
          <dt>Per day, average</dt><dd>{{ ui.climate.avgMmDay.toFixed(2) }} mm</dd>
          <dt>Rainy days (≥ 1 mm)</dt><dd>{{ ui.climate.rainyDays.toFixed(0) }} / year</dd>
          <dt>Longest dry spell</dt><dd>{{ ui.climate.longestDry }} days</dd>
        </dl>
        <div class="months" aria-label="Average rainfall per month">
          <div v-for="(value, i) in ui.climate.monthly" :key="i" class="month" :title="`${MONTHS[i]}: ${value.toFixed(0)} mm`">
            <div class="bar" :style="{ height: (value / monthMax) * 100 + '%' }" />
            <span>{{ MONTHS[i] }}</span>
          </div>
        </div>
        <div class="sub">Average of the last {{ ui.climate.years.toFixed(0) }} years (Open-Meteo)</div>
      </template>
      <template v-else>
        <div class="sub">Search for your city above to use its real rainfall. Until then a typical climate is used:</div>
        <label class="inline">Average rain <input v-model.number="ui.avgRainMmDay" type="number" min="0.2" max="12" step="0.1" /> mm/day <span class="muted">({{ (ui.avgRainMmDay * 365).toFixed(0) }} mm/year)</span></label>
      </template>

      <h3>Your water use</h3>
      <label class="row">
        <span>Daily use</span>
        <strong><input v-model.number="ui.dailyUseL" class="num" type="number" min="0" max="2000" step="10" /> L/day</strong>
      </label>
      <input v-model.number="ui.dailyUseL" type="range" min="0" max="1000" step="10" aria-label="Daily water use" />
      <div class="chips">
        <button v-for="p in usePresets" :key="p.name" :class="{ active: ui.dailyUseL === p.litres }" @click="ui.dailyUseL = p.litres">{{ p.name }} {{ p.litres }}</button>
      </div>
      <label class="row">
        <span>Reliability wanted</span>
        <strong>{{ ui.targetReliability }}% of the use from rain</strong>
      </label>
      <input v-model.number="ui.targetReliability" type="range" min="50" max="99" step="1" aria-label="Target reliability" />

      <h3>Your system</h3>
      <label class="row">
        <span>Roof surface</span>
        <strong>{{ ui.roofArea.toFixed(0) }} m² <span class="muted">({{ roofLength.toFixed(1) }} m long)</span></strong>
      </label>
      <input v-model.number="ui.roofArea" type="range" :min="MIN_ROOF_AREA" :max="MAX_ROOF_AREA" step="1" :disabled="ui.roofAuto" aria-label="Roof surface" />
      <label class="check">
        <input v-model="ui.roofAuto" type="checkbox" />
        <span>Size the roof from my daily use and the average rain</span>
      </label>
      <label class="row">
        <span>Tank size</span>
        <strong>{{ ui.tankSize }} L</strong>
      </label>
      <input v-model.number="ui.tankSize" type="range" min="50" max="1000" step="10" aria-label="Tank size" />
      <div class="row stepper">
        <span>Number of tanks <span class="muted">= {{ fmt(ui.capacity) }} L</span></span>
        <span class="step-controls">
          <button :disabled="ui.tanks <= 1" aria-label="Fewer tanks" @click="ui.tanks--">−</button>
          <strong>{{ ui.tanks }}</strong>
          <button :disabled="ui.tanks >= MAX_TANKS" aria-label="More tanks" @click="ui.tanks++">+</button>
        </span>
      </div>

      <div class="card result" :class="{ bad: current.reliability < target - 0.005 }">
        <div class="big">{{ Math.round(current.reliability * 100) }}%</div>
        <div>
          <strong>{{ ui.dailyUseL > 0 ? 'of your use covered by rain' : 'Enter your daily use' }}</strong>
          <div class="sub" v-if="ui.dailyUseL > 0">Overflow {{ fmt(current.overflowPerYear) }} L/year · short on {{ current.shortDaysPerYear.toFixed(0) }} days/year</div>
        </div>
      </div>

      <div v-if="ui.dailyUseL > 0" class="card">
        <h3>What you need for {{ ui.targetReliability }}%</h3>
        <div v-if="smallestRoof === null" class="error">Even a {{ ROOF_SIZES[ROOF_SIZES.length - 1] }} m² roof can't reach {{ ui.targetReliability }}% here. Lower the target or the use.</div>
        <template v-else>
          <div class="table" role="table">
            <div class="head" role="row"><span>Roof</span><span>Tank volume</span><span>Tanks</span></div>
            <button
              v-for="o in options"
              :key="o.area"
              class="rowbtn"
              :class="{ best: balanced && o.area === balanced.area, off: o.tank === null }"
              :disabled="o.tank === null"
              :title="o.tank === null ? 'Not reachable with this roof size' : 'Use this combination'"
              @click="o.tank !== null && applyOption(o.area, o.tank)"
            >
              <span>{{ o.area }} m²<em v-if="balanced && o.area === balanced.area"> ★</em></span>
              <span>{{ o.tank === null ? '—' : fmt(o.tank) + ' L' }}</span>
              <span>{{ o.tank === null ? '' : Math.ceil(o.tank / ui.tankSize) + ' × ' + ui.tankSize + ' L' }}</span>
            </button>
          </div>
          <button v-if="balanced" class="primary" @click="applyOption(balanced.area, balanced.tank)">
            Use balanced choice: {{ balanced.area }} m² + {{ fmt(balanced.tank) }} L
          </button>
          <div class="sub">★ balanced = the smallest roof and tank together. Based on {{ ui.climate.loaded ? 'the real daily rainfall of the last ' + ui.climate.years.toFixed(0) + ' years' : 'a typical climate' }}, with {{ Math.round(RUNOFF_COEFFICIENT * 100) }}% of the rain reaching the tank.</div>
        </template>

        <h3>Reliability by tank volume</h3>
        <svg :viewBox="`0 0 ${CW} ${CH}`" class="chart" role="img" aria-label="Share of the use covered against total tank volume">
          <g class="grid">
            <line v-for="r in [0, 0.5, 1]" :key="r" :x1="CP.left" :x2="CW - CP.right" :y1="cy(r)" :y2="cy(r)" />
          </g>
          <text v-for="r in [0, 0.5, 1]" :key="'t' + r" :x="CP.left - 4" :y="cy(r) + 3" text-anchor="end">{{ r * 100 }}%</text>
          <line class="target" :x1="CP.left" :x2="CW - CP.right" :y1="cy(target)" :y2="cy(target)" />
          <path :d="curvePath" class="curve" />
          <line class="marker" :x1="cx(Math.min(ui.capacity, curveMax))" :x2="cx(Math.min(ui.capacity, curveMax))" :y1="CP.top" :y2="CH - CP.bottom" />
          <text :x="CP.left" :y="CH - 3">0</text>
          <text :x="CW - CP.right" :y="CH - 3" text-anchor="end">{{ fmt(curveMax) }} L</text>
        </svg>
        <div class="sub legend"><i class="l-curve" /> your roof ({{ ui.roofArea.toFixed(0) }} m²) <i class="l-marker" /> your tanks <i class="l-target" /> target</div>
      </div>

      <h3>Scene speed</h3>
      <div class="chips">
        <button v-for="t in timeLapses" :key="t" :class="{ active: ui.timeLapse === t }" @click="ui.timeLapse = t">×{{ t }}</button>
      </div>
      <div class="sub">How much faster the tank in the 3D scene fills and is used than in real life.</div>
    </section>

    <!-- Weather -->
    <section v-else-if="tab === 'weather'">
      <div class="segmented">
        <button :class="{ active: !isLive }" @click="stopLive">Manual</button>
        <button :class="{ active: isLive }" :disabled="ui.live.loading" @click="isLive ? null : startLive()">Live at {{ ui.place.name ? 'your place' : 'location' }}</button>
      </div>
      <div v-if="ui.live.error" class="error">{{ ui.live.error }}</div>
      <div v-else-if="isLive" class="live-info">
        <strong>{{ ui.place.name }}</strong>
        <div class="sub">{{ ui.live.description }} · {{ ui.live.mmPerHour.toFixed(1) }} mm/h · updated {{ updatedAgo }}</div>
      </div>

      <label class="row">
        <span>Rain intensity</span>
        <strong>{{ label }} · {{ mm.toFixed(1) }} mm/h</strong>
      </label>
      <input v-model.number="intensityPercent" type="range" min="0" max="100" step="1" :disabled="isLive || ui.apocalypse" />
      <div class="presets">
        <button v-for="p in presets" :key="p.name" :disabled="isLive || ui.apocalypse" @click="intensityPercent = p.value">{{ p.name }}</button>
      </div>
    </section>

    <!-- World -->
    <section v-else>
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

      <details class="danger-zone">
        <summary>Disaster mode</summary>
        <p class="sub">Endless storm, rising water and tsunamis that sweep away the animals.</p>
        <button class="apocalypse" :class="{ on: ui.apocalypse }" @click="toggleApocalypse">
          {{ ui.apocalypse ? 'Stop the flood' : 'Flood the world' }}
        </button>
        <div v-if="ui.floodLevel > 0.05" class="sub">Flood level: {{ ui.floodLevel.toFixed(1) }} m</div>
      </details>
    </section>
  </div>
</template>

<style scoped>
.hud {
  position: fixed;
  top: 16px;
  left: 16px;
  width: 316px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 14px 16px 16px;
  border-radius: 14px;
  background: rgba(15, 30, 45, 0.86);
  backdrop-filter: blur(8px);
  color: #e8f4ff;
  font-family: system-ui, sans-serif;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
h2 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.85;
}
h3 {
  margin: 16px 0 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
}
.card h3:first-child,
section > h3:first-child {
  margin-top: 0;
}
.icons {
  display: flex;
  gap: 6px;
}
.tank {
  display: flex;
  gap: 14px;
  margin-bottom: 12px;
}
.gauge {
  flex: none;
  width: 40px;
  height: 84px;
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
  font-size: 26px;
  font-weight: 700;
}
.volume span {
  font-size: 13px;
  font-weight: 400;
  opacity: 0.75;
}
.sub {
  font-size: 12px;
  opacity: 0.75;
  margin-top: 3px;
}
.flow {
  color: #7fb6f2;
  opacity: 1;
}
.use {
  color: #f0996f;
  opacity: 1;
}
.warn {
  margin-top: 6px;
  color: #ffb08a;
  font-weight: 600;
  font-size: 13px;
}
.error {
  margin: 6px 0;
  color: #ffb08a;
  font-size: 12px;
}
.muted {
  opacity: 0.6;
  font-weight: 400;
}
.live-info {
  margin: 8px 0;
  font-size: 13px;
}

.location {
  display: flex;
  gap: 6px;
}
.location button {
  flex: none;
  width: 44px;
}
.place {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
}

.tabs {
  display: flex;
  gap: 2px;
  margin: 12px 0;
  padding: 3px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
}
.tabs button {
  padding: 6px 2px;
  font-size: 12px;
  background: transparent;
}
.tabs button.active {
  background: #2a78d6;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  margin: 10px 0 6px;
}
.inline {
  display: block;
  margin-top: 8px;
  font-size: 12px;
}
.stepper {
  align-items: center;
}
.step-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
.step-controls button {
  flex: none;
  width: 28px;
  padding: 4px 0;
  font-size: 15px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  font-size: 12px;
}
input[type='range'] {
  width: 100%;
  accent-color: #5cc2f5;
}
input[type='range']:disabled {
  opacity: 0.4;
}
input[type='text'],
input[type='number'] {
  min-width: 0;
  padding: 5px 7px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  font-size: 12px;
}
input[type='text'] {
  flex: 1;
}
input[type='number'] {
  width: 56px;
}
input.num {
  width: 64px;
  text-align: right;
}
.segmented,
.presets,
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.presets,
.chips {
  margin: 8px 0;
}
.chips button {
  flex: 0 1 auto;
  padding: 5px 9px;
}

.stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 3px 10px;
  margin: 6px 0 10px;
  font-size: 12px;
}
.stats dt {
  opacity: 0.7;
}
.stats dd {
  margin: 0;
  text-align: right;
  font-weight: 600;
}
.months {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 56px;
  margin-bottom: 4px;
}
.month {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  font-size: 9px;
  text-align: center;
  color: #c3c2b7;
}
.month .bar {
  min-height: 1px;
  background: #3987e5;
  border-radius: 2px 2px 0 0;
}

.card {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
}
.result {
  display: flex;
  align-items: center;
  gap: 12px;
}
.result.bad {
  outline: 1px solid #d95926;
}
.big {
  font-size: 30px;
  font-weight: 700;
  color: #7fb6f2;
}
.result.bad .big {
  color: #f0996f;
}
.table {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 6px 0 8px;
  font-size: 12px;
}
.table .head,
.table .rowbtn {
  display: grid;
  grid-template-columns: 56px 1fr 1fr;
  gap: 6px;
  text-align: left;
}
.table .head {
  opacity: 0.6;
  padding: 0 8px;
}
.table .rowbtn {
  padding: 5px 8px;
  background: rgba(255, 255, 255, 0.06);
}
.table .rowbtn.best {
  background: rgba(57, 135, 229, 0.35);
}
.table .rowbtn.off {
  opacity: 0.35;
}
.table em {
  font-style: normal;
  color: #f2d544;
}
.primary {
  width: 100%;
  margin: 4px 0;
  padding: 8px;
  background: #2a78d6;
}
.chart {
  width: 100%;
  height: auto;
  margin-top: 4px;
}
.chart text {
  fill: #c3c2b7;
  font-size: 8px;
}
.chart .grid line {
  stroke: rgba(255, 255, 255, 0.1);
}
.chart .curve {
  fill: none;
  stroke: #3987e5;
  stroke-width: 2;
  stroke-linejoin: round;
}
.chart .target {
  stroke: #c3c2b7;
  stroke-dasharray: 3 3;
}
.chart .marker {
  stroke: #d95926;
  stroke-width: 2;
}
.legend i {
  display: inline-block;
  width: 14px;
  height: 0;
  margin: 0 3px 2px 8px;
  border-top: 2px solid;
}
.legend i:first-child {
  margin-left: 0;
}
.l-curve {
  border-color: #3987e5;
}
.l-marker {
  border-color: #d95926;
}
.l-target {
  border-color: #c3c2b7;
  border-top-style: dashed;
}

.danger-zone {
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
}
.danger-zone summary {
  cursor: pointer;
  opacity: 0.7;
}
.apocalypse {
  width: 100%;
  margin: 6px 0;
  padding: 7px;
  font-size: 12px;
  background: rgba(31, 95, 143, 0.7);
}
.apocalypse.on {
  background: #b0352a;
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
button.active:hover:not(:disabled),
.primary:hover:not(:disabled) {
  background: #3987e5;
}
.tabs button:hover:not(:disabled):not(.active) {
  background: rgba(255, 255, 255, 0.12);
}
button.icon {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  display: grid;
  place-items: center;
}
button.icon.danger {
  background: linear-gradient(135deg, #ff7a4d, #d9304f);
}
button.icon.danger:hover:not(:disabled) {
  background: linear-gradient(135deg, #ff8d65, #e8405f);
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
button:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 2px solid #8fc8ee;
  outline-offset: 2px;
}
</style>
