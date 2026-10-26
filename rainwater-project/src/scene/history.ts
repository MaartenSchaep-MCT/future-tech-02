import { ref } from 'vue'

// One sample per second, kept for 15 minutes; the charts read these arrays.
export const HISTORY_MAX = 900

export const history = {
  rainMm: [] as number[], // rainfall, mm/h
  volume: [] as number[], // litres in the tank
  inflow: [] as number[], // litres per minute into the tank
  usage: [] as number[], // litres per minute drawn from the tank
  power: [] as number[], // turbine output, W
}

// Bumped whenever a sample is added so charts know to redraw
export const historyVersion = ref(0)

export const pushSample = (rainMm: number, volume: number, inflowLpm: number, usageLpm: number, powerW: number) => {
  const push = (list: number[], v: number) => {
    list.push(v)
    if (list.length > HISTORY_MAX) list.shift()
  }
  push(history.rainMm, rainMm)
  push(history.volume, volume)
  push(history.inflow, inflowLpm)
  push(history.usage, usageLpm)
  push(history.power, powerW)
  historyVersion.value++
}
