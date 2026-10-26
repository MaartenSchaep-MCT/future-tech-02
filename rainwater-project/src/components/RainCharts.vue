<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ui } from '../scene/rainState'
import { history, historyVersion } from '../scene/history'

// Line charts of the last minutes: rainfall, water in the tank, and tank inflow vs. usage.
// Dark-surface categorical slots 1 and 2 (blue, orange) from the dataviz palette.
const BLUE = '#3987e5'
const ORANGE = '#d95926'
const INK = '#f0efec'
const GREEN = '#199e70'
const MUTED = '#c3c2b7'
const GRID = 'rgba(255, 255, 255, 0.1)'

type Series = { label: string; color: string; data: () => number[] }
type ChartDef = {
  title: string
  unit: string
  series: Series[]
  yMax: () => number
  decimals: number
}

const windows = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
]
const windowSeconds = ref(300)

const charts: ChartDef[] = [
  {
    title: 'Rainfall',
    unit: 'mm/h',
    series: [{ label: 'Rainfall', color: BLUE, data: () => history.rainMm }],
    yMax: () => Math.max(5, Math.ceil(Math.max(0, ...history.rainMm.slice(-windowSeconds.value)) / 5) * 5),
    decimals: 1,
  },
  {
    title: 'Water in tank',
    unit: 'L',
    series: [{ label: 'Tank volume', color: BLUE, data: () => history.volume }],
    yMax: () => ui.capacity,
    decimals: 1,
  },
  {
    title: 'Hydro power',
    unit: 'W',
    series: [{ label: 'Power', color: GREEN, data: () => history.power }],
    yMax: () => Math.max(1, Math.ceil(Math.max(0, ...history.power.slice(-windowSeconds.value)) * 2) / 2),
    decimals: 2,
  },
  {
    title: 'Inflow vs. usage',
    unit: 'L/min',
    series: [
      { label: 'Inflow', color: BLUE, data: () => history.inflow },
      { label: 'Usage', color: ORANGE, data: () => history.usage },
    ],
    yMax: () => {
      const recent = [...history.inflow.slice(-windowSeconds.value), ...history.usage.slice(-windowSeconds.value)]
      const max = Math.max(1, ...recent)
      return Math.ceil(max / 5) * 5
    },
    decimals: 1,
  },
]

const canvases = ref<HTMLCanvasElement[]>([])
const hover = ref<{ chart: number; index: number } | null>(null) // index counted back from "now"

const WIDTH = 340
const HEIGHT = 120
const PAD = { left: 34, right: 8, top: 8, bottom: 16 }

const windowOf = (data: number[]) => data.slice(-windowSeconds.value)

const draw = () => {
  charts.forEach((chart, c) => {
    const canvas = canvases.value[c]
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== WIDTH * dpr) {
      canvas.width = WIDTH * dpr
      canvas.height = HEIGHT * dpr
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)

    const plotW = WIDTH - PAD.left - PAD.right
    const plotH = HEIGHT - PAD.top - PAD.bottom
    const yMax = chart.yMax()
    const xOf = (secondsAgo: number) => PAD.left + plotW * (1 - secondsAgo / windowSeconds.value)
    const yOf = (v: number) => PAD.top + plotH * (1 - Math.min(v, yMax) / yMax)

    // Recessive grid with three y labels
    ctx.font = '10px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.lineWidth = 1
    for (let i = 0; i <= 2; i++) {
      const v = (yMax * i) / 2
      const y = Math.round(yOf(v)) + 0.5
      ctx.strokeStyle = GRID
      ctx.beginPath()
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(WIDTH - PAD.right, y)
      ctx.stroke()
      ctx.fillStyle = MUTED
      ctx.fillText(String(Math.round(v * 10) / 10), PAD.left - 5, y)
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`−${windowSeconds.value >= 60 ? windowSeconds.value / 60 + ' min' : windowSeconds.value + ' s'}`, PAD.left, HEIGHT - 3)
    ctx.textAlign = 'right'
    ctx.fillText('now', WIDTH - PAD.right, HEIGHT - 3)

    // Lines, 2px, newest sample at the right edge
    chart.series.forEach((series) => {
      const data = windowOf(series.data())
      if (data.length < 2) return
      ctx.strokeStyle = series.color
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.beginPath()
      data.forEach((v, i) => {
        const x = xOf(data.length - 1 - i)
        const y = yOf(v)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    })

    // Hover crosshair and markers with a 2px surface ring
    if (hover.value && hover.value.chart === c) {
      const x = xOf(hover.value.index)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.round(x) + 0.5, PAD.top)
      ctx.lineTo(Math.round(x) + 0.5, PAD.top + plotH)
      ctx.stroke()
      chart.series.forEach((series) => {
        const data = series.data()
        const v = data[data.length - 1 - hover.value!.index]
        if (v === undefined) return
        ctx.beginPath()
        ctx.arc(x, yOf(v), 4, 0, Math.PI * 2)
        ctx.fillStyle = series.color
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#18222c'
        ctx.stroke()
      })
    }
  })
}

const valueText = (c: number) => {
  void historyVersion.value // re-evaluate whenever a sample is added
  const chart = charts[c]
  const index = hover.value && hover.value.chart === c ? hover.value.index : 0
  const when = index === 0 ? 'now' : `${index}s ago`
  const values = chart.series.map((s) => {
    const data = s.data()
    const v = data[data.length - 1 - index]
    return { label: s.label, color: s.color, text: v === undefined ? '–' : v.toFixed(chart.decimals) }
  })
  return { when, values }
}

const onMove = (c: number, event: MouseEvent) => {
  const rect = (event.currentTarget as HTMLCanvasElement).getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * WIDTH
  const plotW = WIDTH - PAD.left - PAD.right
  const fraction = Math.min(1, Math.max(0, (x - PAD.left) / plotW))
  const secondsAgo = Math.round((1 - fraction) * windowSeconds.value)
  hover.value = { chart: c, index: Math.min(secondsAgo, Math.max(0, history.volume.length - 1)) }
}

onMounted(draw)
watch([historyVersion, windowSeconds, hover, () => ui.capacity], draw, { flush: 'post' })
</script>

<template>
  <div class="charts">
    <header>
      <h2>History</h2>
      <div class="windows">
        <button v-for="w in windows" :key="w.seconds" :class="{ active: windowSeconds === w.seconds }" @click="windowSeconds = w.seconds">
          {{ w.label }}
        </button>
      </div>
    </header>

    <div v-for="(chart, c) in charts" :key="chart.title" class="chart">
      <div class="head">
        <span class="title">{{ chart.title }} <span class="unit">({{ chart.unit }})</span></span>
        <span class="values">
          <span v-for="v in valueText(c).values" :key="v.label" class="value">
            <i :style="{ background: v.color }" />{{ chart.series.length > 1 ? v.label + ' ' : '' }}{{ v.text }}
          </span>
          <span class="when">{{ valueText(c).when }}</span>
        </span>
      </div>
      <canvas
        :ref="(el) => { if (el) canvases[c] = el as HTMLCanvasElement }"
        :style="{ width: '340px', height: '120px' }"
        @mousemove="onMove(c, $event)"
        @mouseleave="hover = null"
      />
    </div>
  </div>
</template>

<style scoped>
.charts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 372px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(15, 30, 45, 0.82);
  backdrop-filter: blur(8px);
  color: #f0efec;
  font-family: system-ui, sans-serif;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
h2 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.8;
}
.windows {
  display: flex;
  gap: 4px;
}
button {
  cursor: pointer;
  border: 0;
  border-radius: 6px;
  padding: 4px 8px;
  font: inherit;
  font-size: 11px;
  color: inherit;
  background: rgba(255, 255, 255, 0.12);
}
button.active {
  background: #2a78d6;
}
.chart {
  margin-top: 6px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
}
.title {
  font-weight: 600;
}
.unit {
  font-weight: 400;
  color: #c3c2b7;
}
.values {
  display: flex;
  gap: 8px;
  color: #f0efec;
}
.value i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}
.when {
  color: #c3c2b7;
}
canvas {
  display: block;
}
</style>
