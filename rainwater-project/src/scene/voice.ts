import { reactive } from 'vue'
import { ui, world, setApocalypse, requestEmpty } from './rainState'
import { MIN_ROOF_AREA, MAX_ROOF_AREA } from './config'
import { formatHour } from './daylight'
import { intensityFromMm, mmFromIntensity, setPlace, startLive, stopLive } from './weather'
import { MAX_TANKS, applyOption, balanced, current, smallestRoof, suggestTanks, target } from './planner'

// Voice (and typed) commands, in English and Dutch. Speech comes from the Web Speech API (SpeechRecognition,
// Chrome / Edge / Safari); the recognised text goes through a small pattern-based parser that reads the numbers,
// so "increase the roof size to 135 square meters" or "zet de zon op 15 uur" change real settings.
// Every command returns what it understood and what happened; the panel shows both and can read them aloud.
export interface Outcome {
  ok: boolean
  message: string
}

export const voice = reactive({
  supported: false,
  listening: false,
  lang: (typeof navigator !== 'undefined' && navigator.language?.startsWith('nl') ? 'nl-BE' : 'en-US') as string,
  speak: true,
  wake: false, // always listening for the wake word
  awake: false, // the wake word was heard; the next sentence is a command
  interim: '', // what is being recognised right now
  heard: '', // the last complete command
  answer: '', // what happened
  ok: true,
  error: '',
})

const dutch = () => voice.lang.startsWith('nl')
// pick the sentence in the language of the speaker
const say = (en: string, nl: string) => (dutch() ? nl : en)

const SMALL_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
}

const normalise = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)\s*(m²|m2|m\^2|sqm)/g, '$1 m2')
    .replace(/[?!;,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const numberIn = (text: string): number | null => {
  const m = text.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const fmt = (n: number) => Math.round(n).toLocaleString(dutch() ? 'nl-BE' : 'en-US')

const coverageNote = () =>
  ui.dailyUseL > 0
    ? ' ' + say(`Rain now covers ${Math.round(current.value.reliability * 100)}% of your use.`, `Regen dekt nu ${Math.round(current.value.reliability * 100)}% van je verbruik.`)
    : ''

// ---- Individual commands ----
const help = (): Outcome => ({
  ok: true,
  message: say(
    'Try: "increase the roof size to 135 square meters", "use 200 liters per day", "3 tanks of 2000 liters", "set the time to 15", "more rain", "more wind", "empty the tank", "flood the world", "location Ghent", "what do I need?", "how much water is in the tank?"',
    'Probeer: "vergroot het dak naar 135 vierkante meter", "verbruik 200 liter per dag", "3 tanks van 2000 liter", "zet de zon op 15 uur", "meer regen", "meer wind", "leeg de regenput", "overstroom de wereld", "locatie Gent", "wat heb ik nodig?", "hoeveel water zit er in de tank?"',
  ),
})

const roofCommand = (t: string): Outcome => {
  if (/(auto|automatic|automatisch)/.test(t)) {
    ui.roofAuto = !/(off|uit|stop|manual|handmatig)/.test(t)
    return { ok: true, message: ui.roofAuto ? say('The roof is now sized automatically from your use.', 'Het dak wordt nu automatisch bepaald op basis van je verbruik.') : say('Automatic roof sizing is off.', 'Automatisch dak staat uit.') }
  }
  const n = numberIn(t)
  const up = /(increase|bigger|larger|grow|enlarge|extend|more|verhoog|vergroot|groter|uitbreid|meer)/.test(t)
  const down = /(decrease|smaller|reduce|shrink|less|verklein|verlaag|kleiner|minder)/.test(t)
  const absolute = /\b(to|naar|op|at|is|=)\b/.test(t) || (!up && !down)
  const before = ui.roofArea
  let area: number
  if (n !== null) area = absolute ? n : before + (up ? n : -n)
  else if (up || down) area = before * (up ? 1.15 : 0.85)
  else return { ok: true, message: say(`The roof is ${fmt(before)} m².`, `Het dak is ${fmt(before)} m².`) }

  const clamped = clamp(Math.round(area), MIN_ROOF_AREA, MAX_ROOF_AREA)
  ui.roofAuto = false
  ui.roofArea = clamped
  const limit = clamped !== Math.round(area)
  return {
    ok: true,
    message:
      say(`Roof set to ${clamped} m² (was ${fmt(before)} m²${limit ? `; the limit is ${MIN_ROOF_AREA}–${MAX_ROOF_AREA} m²` : ''}).`,
        `Dak ingesteld op ${clamped} m² (was ${fmt(before)} m²${limit ? `; de grens is ${MIN_ROOF_AREA}–${MAX_ROOF_AREA} m²` : ''}).`) + coverageNote(),
  }
}

const tanksCommand = (t: string): Outcome => {
  const sizeMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:l\b|liter|litre|liters|litres)/)
  const m3 = t.match(/(\d+(?:\.\d+)?)\s*(?:m3|kubieke|cubic)/)
  const word = Object.keys(SMALL_NUMBERS).find((w) => new RegExp(`\\b${w}\\s*(?:x\\s*)?(?:tanks?|tonnen|regentonnen|barrels?|regenputten|cisterns?)`).test(t))
  const countMatch = t.match(/(\d+)\s*(?:x\s*)?(?:tanks?|tonnen|regentonnen|barrels?|regenputten|cisterns?)/)
  const count = countMatch ? parseInt(countMatch[1], 10) : word ? SMALL_NUMBERS[word] : null
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : m3 ? parseFloat(m3[1]) * 1000 : null
  if (count === null && size === null) return { ok: true, message: say(`You have ${ui.tanks} × ${fmt(ui.tankSize)} L = ${fmt(ui.capacity)} L of storage.`, `Je hebt ${ui.tanks} × ${fmt(ui.tankSize)} L = ${fmt(ui.capacity)} L opslag.`) }
  if (size !== null) ui.tankSize = clamp(Math.round(size / 10) * 10, 100, 5000)
  if (count !== null) ui.tanks = clamp(Math.round(count), 1, MAX_TANKS)
  return {
    ok: true,
    message: say(`Storage set to ${ui.tanks} × ${fmt(ui.tankSize)} L = ${fmt(ui.capacity)} L.`, `Opslag ingesteld op ${ui.tanks} × ${fmt(ui.tankSize)} L = ${fmt(ui.capacity)} L.`) + coverageNote(),
  }
}

const useCommand = (t: string): Outcome => {
  const n = numberIn(t)
  if (n === null) return { ok: true, message: say(`You use ${fmt(ui.dailyUseL)} liters per day.`, `Je verbruikt ${fmt(ui.dailyUseL)} liter per dag.`) }
  let litres = /(m3|kubiek|cubic)/.test(t) ? n * 1000 : n
  if (/(week)/.test(t)) litres /= 7
  else if (/(month|maand)/.test(t)) litres /= 30
  else if (/(year|jaar)/.test(t)) litres /= 365
  ui.dailyUseL = clamp(Math.round(litres), 0, 2000)
  return { ok: true, message: say(`Daily use set to ${fmt(ui.dailyUseL)} liters.`, `Dagverbruik ingesteld op ${fmt(ui.dailyUseL)} liter.`) + coverageNote() }
}

const reliabilityCommand = (t: string): Outcome => {
  const n = numberIn(t)
  if (n === null) {
    return {
      ok: true,
      message: say(`Rain covers ${Math.round(current.value.reliability * 100)}% of your ${fmt(ui.dailyUseL)} L/day with this roof and these tanks (goal ${ui.targetReliability}%).`,
        `Regen dekt ${Math.round(current.value.reliability * 100)}% van je ${fmt(ui.dailyUseL)} L/dag met dit dak en deze tanks (doel ${ui.targetReliability}%).`),
    }
  }
  ui.targetReliability = clamp(Math.round(n), 50, 99)
  return { ok: true, message: say(`Goal set to ${ui.targetReliability}% of your use from rain.`, `Doel ingesteld op ${ui.targetReliability}% van je verbruik uit regen.`) }
}

const timeCommand = (t: string): Outcome => {
  const named: [RegExp, number][] = [
    [/(midnight|middernacht)/, 0],
    [/(noon|midday|middag)/, 12],
    [/(dawn|sunrise|zonsopgang|ochtend|morning)/, 6],
    [/(dusk|sunset|zonsondergang|avond|evening)/, 18.5],
    [/(night|nacht)/, 23],
  ]
  let hour: number | null = null
  const clock = t.match(/(\d{1,2})[:h](\d{2})/)
  if (clock) hour = parseInt(clock[1], 10) + parseInt(clock[2], 10) / 60
  else {
    const n = numberIn(t)
    if (n !== null) {
      hour = n
      if (/\bpm\b/.test(t) && hour < 12) hour += 12
      if (/\bam\b/.test(t) && hour === 12) hour = 0
    } else {
      hour = named.find(([re]) => re.test(t))?.[1] ?? null
    }
  }
  if (hour === null) return { ok: true, message: say(`It is ${formatHour(ui.timeOfDay)}.`, `Het is ${formatHour(ui.timeOfDay)}.`) }
  ui.timeOfDay = ((hour % 24) + 24) % 24
  return { ok: true, message: say(`Time of day set to ${formatHour(ui.timeOfDay)}.`, `Tijdstip ingesteld op ${formatHour(ui.timeOfDay)}.`) }
}

const windCommand = (t: string): Outcome => {
  const n = numberIn(t)
  if (/(no wind|geen wind|calm|windstil|stil)/.test(t)) ui.windScale = 0
  else if (n !== null && /(percent|procent|%)/.test(t)) ui.windScale = clamp(n / 100, 0, 3)
  else if (/(more|stronger|harder|meer|sterker|increase|verhoog)/.test(t)) ui.windScale = clamp(ui.windScale + 0.4, 0, 3)
  else if (/(less|weaker|softer|minder|zwakker|zachter|decrease|verlaag)/.test(t)) ui.windScale = clamp(ui.windScale - 0.4, 0, 3)
  else return { ok: true, message: say(`Wind is at ${Math.round(ui.windScale * 100)}%.`, `Wind staat op ${Math.round(ui.windScale * 100)}%.`) }
  return { ok: true, message: say(`Wind set to ${Math.round(ui.windScale * 100)}%.`, `Wind ingesteld op ${Math.round(ui.windScale * 100)}%.`) }
}

const rainCommand = (t: string): Outcome => {
  if (ui.mode === 'live' || ui.apocalypse) {
    return {
      ok: false,
      message: ui.apocalypse
        ? say('The flood is on and keeps the storm at full strength. Stop the flood first.', 'De overstroming staat aan en houdt de storm op volle kracht. Stop eerst de overstroming.')
        : say('Live weather controls the rain. Say "manual weather" first.', 'Live weer bepaalt de regen. Zeg eerst "handmatig weer".'),
    }
  }
  const n = numberIn(t)
  if (n !== null && /mm/.test(t)) ui.intensity = clamp(intensityFromMm(n), 0, 1)
  else if (n !== null && /(percent|procent|%)/.test(t)) ui.intensity = clamp(n / 100, 0, 1)
  else if (/(storm|onweer)/.test(t)) ui.intensity = 1
  else if (/(heavy|zwaar|hard)/.test(t)) ui.intensity = 0.8
  else if (/(drizzle|motregen|lichte)/.test(t)) ui.intensity = 0.15
  else if (/(stop|off|no rain|geen|droog|dry|uit)/.test(t)) ui.intensity = 0
  else if (/(more|harder|meer|increase|verhoog)/.test(t)) ui.intensity = clamp(ui.intensity + 0.2, 0, 1)
  else if (/(less|minder|decrease|verlaag|lighter)/.test(t)) ui.intensity = clamp(ui.intensity - 0.2, 0, 1)
  else ui.intensity = 0.5
  const mm = ui.intensity > 0.001 ? mmFromIntensity(ui.intensity) : 0
  return { ok: true, message: say(`Rain set to ${mm.toFixed(1)} mm/h (${Math.round(ui.intensity * 100)}%).`, `Regen ingesteld op ${mm.toFixed(1)} mm/u (${Math.round(ui.intensity * 100)}%).`) }
}

const recommendation = (): Outcome => {
  if (ui.dailyUseL <= 0) return { ok: false, message: say('Tell me your daily water use first, for example "use 200 liters per day".', 'Zeg eerst je dagverbruik, bijvoorbeeld "verbruik 200 liter per dag".') }
  const place = ui.place.name || say('a typical climate', 'een typisch klimaat')
  if (!balanced.value) {
    return {
      ok: false,
      message: say(`Even the largest roof cannot reach ${ui.targetReliability}% for ${fmt(ui.dailyUseL)} L/day in ${place}. Lower the goal or the use.`,
        `Zelfs het grootste dak haalt geen ${ui.targetReliability}% voor ${fmt(ui.dailyUseL)} L/dag in ${place}. Verlaag het doel of het verbruik.`),
    }
  }
  const { size, count } = suggestTanks(balanced.value.tank)
  return {
    ok: true,
    message: say(
      `For ${ui.targetReliability}% of ${fmt(ui.dailyUseL)} L/day in ${place}: a ${balanced.value.area} m² roof with ${count} × ${fmt(size)} L tanks (${fmt(balanced.value.tank)} L). Say "apply that" to use it. The smallest roof that works is ${smallestRoof.value} m².`,
      `Voor ${ui.targetReliability}% van ${fmt(ui.dailyUseL)} L/dag in ${place}: een dak van ${balanced.value.area} m² met ${count} × ${fmt(size)} L tanks (${fmt(balanced.value.tank)} L). Zeg "pas dat toe" om het te gebruiken. Het kleinste werkende dak is ${smallestRoof.value} m².`,
    ),
  }
}

const applyRecommendation = (): Outcome => {
  if (!balanced.value) return recommendation()
  applyOption(balanced.value.area, balanced.value.tank)
  return { ok: true, message: say(`Applied: ${ui.roofArea} m² roof with ${ui.tanks} × ${fmt(ui.tankSize)} L.`, `Toegepast: dak van ${ui.roofArea} m² met ${ui.tanks} × ${fmt(ui.tankSize)} L.`) + coverageNote() }
}

const tankContents = (): Outcome => ({
  ok: true,
  message: say(`The tank holds ${fmt(ui.volume)} of ${fmt(ui.capacity)} liters (${Math.round((ui.volume / ui.capacity) * 100)}%).`,
    `De tank bevat ${fmt(ui.volume)} van ${fmt(ui.capacity)} liter (${Math.round((ui.volume / ui.capacity) * 100)}%).`),
})

const inflow = (energy: boolean): Outcome => ({
  ok: true,
  message:
    (energy ? say('There is no generator any more, but the water: ', 'Er is geen generator meer, maar het water: ') : '') +
    say(`${(ui.flowRate * 60).toFixed(1)} L/min is coming in and ${(ui.usageRate * 60).toFixed(1)} L/min is used (scene speed ×${ui.timeLapse}).`,
      `Er komt ${(ui.flowRate * 60).toFixed(1)} L/min binnen en er wordt ${(ui.usageRate * 60).toFixed(1)} L/min gebruikt (scènesnelheid ×${ui.timeLapse}).`),
})

// ---- Dispatcher ----
export const handleCommand = async (raw: string): Promise<Outcome> => {
  const t = normalise(raw)
  if (!t) return { ok: false, message: say('I did not hear anything.', 'Ik heb niets verstaan.') }
  const has = (re: RegExp) => re.test(t)
  const question = has(/^(how|what|which|where|is|are|do|does|hoeveel|wat|welk|welke|hoe|is|zijn|wanneer)\b/)

  if (has(/\b(help|commands|opdrachten|wat kan ik zeggen|what can i say)\b/)) return help()

  // Actions with a clear verb
  if (has(/(empty|drain|flush|leeg|ledig)/) && has(/(tank|barrel|well|put|ton|regenput|regenton)/)) {
    if (ui.volume < 0.5) return { ok: false, message: say('The tank is already empty.', 'De tank is al leeg.') }
    requestEmpty()
    return { ok: true, message: say('Emptying the tank, stand back!', 'De tank wordt geleegd, ga opzij!') }
  }
  if (has(/\b(stop|end|einde|stopt|beëindig)\b/) && has(/(flood|overstro+m|apocalyps|tsunami)/)) {
    setApocalypse(false)
    return { ok: true, message: say('The flood is receding.', 'De overstroming trekt weg.') }
  }
  // Flood: how high it is, a specific level, a tsunami right now, or the whole disaster
  if (has(/(how high|hoe hoog|flood level|water level|waterstand|waterpeil|peil)/) && has(/(flood|water|overstro+m|peil|stand)/) && numberIn(t) === null) {
    return ui.floodLevel > 0.05
      ? { ok: true, message: say(`The flood water is ${ui.floodLevel.toFixed(1)} meters deep (it rises to ${ui.floodLimit.toFixed(0)} m).`, `Het water staat ${ui.floodLevel.toFixed(1)} meter hoog (het stijgt tot ${ui.floodLimit.toFixed(0)} m).`) }
      : { ok: true, message: say('There is no flood right now. Say "flood the world".', 'Er is nu geen overstroming. Zeg "overstroom de wereld".') }
  }
  if (has(/(flood|overstro+m|water|peil|level)/) && has(/(meter|metre|\bm\b)/) && numberIn(t) !== null) {
    stopLive()
    ui.floodLimit = clamp(numberIn(t)!, 0.5, 12)
    setApocalypse(true)
    return { ok: true, message: say(`The flood rises to ${ui.floodLimit.toFixed(1)} meters.`, `De overstroming stijgt tot ${ui.floodLimit.toFixed(1)} meter.`) }
  }
  if (has(/(tsunami|wave|golf|vloedgolf)/)) {
    stopLive()
    setApocalypse(true)
    world.waveRequests++
    return { ok: true, message: say('Incoming tsunami!', 'Tsunami op komst!') }
  }
  if (has(/(flood|overstro+m|apocalyps)/)) {
    stopLive()
    setApocalypse(true)
    return { ok: true, message: say('Flood mode on: endless storm, rising water and tsunamis.', 'Overstromingsmodus aan: eindeloze storm, stijgend water en tsunamis.') }
  }
  if (has(/(manual|handmatig)/) && has(/(weather|weer|rain|regen)/)) {
    stopLive()
    return { ok: true, message: say('Manual weather.', 'Handmatig weer.') }
  }
  // Live weather: "show live weather", "live weather in Ghent", "how is the weather?", "toon het live weer"
  const weatherWord = has(/(weather|weer)/)
  const liveWord = has(/(live|echt|actual|current|huidig|right now|real.?time|momenteel|\bnu\b)/)
  const askWord = has(/(show|toon|laat zien|zie|see|how|hoe|what|wat|geef|give|check)/)
  const weatherPlace = t.match(/\b(?:in|for|voor|te|bij)\s+([a-z][a-z\s'.-]*?)\s*$/)
  const placeName = weatherPlace && !/^(now|nu|real|the|het|de|live)\b/.test(weatherPlace[1]) ? weatherPlace[1] : null
  if (weatherWord && !has(/(manual|handmatig)/) && (liveWord || askWord || placeName)) {
    ui.hudTab = 'weather'
    stopLive()
    if (placeName && placeName !== ui.place.name.toLowerCase()) {
      await setPlace(placeName)
      if (ui.place.error) return { ok: false, message: ui.place.error }
    }
    await startLive()
    return ui.mode === 'live'
      ? {
          ok: true,
          message: say(
            `Live weather for ${ui.place.name}: ${ui.live.description || 'no description'}, ${ui.live.mmPerHour.toFixed(1)} mm/h of rain. The rain in the scene now follows it.`,
            `Live weer voor ${ui.place.name}: ${ui.live.description || 'geen omschrijving'}, ${ui.live.mmPerHour.toFixed(1)} mm/u regen. De regen in de scène volgt dit nu.`,
          ),
        }
      : { ok: false, message: ui.live.error || say('Could not start live weather. Name a place, for example "live weather in Ghent".', 'Live weer kon niet starten. Noem een plaats, bijvoorbeeld "live weer in Gent".') }
  }
  const place = t.match(/(?:location|locatie|city|stad|climate in|klimaat in|weather in|weer in|i live in|ik woon in)\s*(?:to|naar|op|is|in|:)?\s*(.+)$/)
  if (place) {
    await setPlace(place[1])
    return ui.place.error
      ? { ok: false, message: ui.place.error }
      : { ok: true, message: say(`Location ${ui.place.name}: ${ui.climate.loaded ? Math.round(ui.climate.annualMm) + ' mm of rain per year.' : 'loading rainfall…'}`, `Locatie ${ui.place.name}: ${ui.climate.loaded ? Math.round(ui.climate.annualMm) + ' mm regen per jaar.' : 'regenval wordt geladen…'}`) + coverageNote() }
  }
  if (has(/(apply|pas .*toe|doe maar|neem dat|gebruik dat|use that|set it)/) && has(/(that|dat|it|recommend|advies|balanced|aanbeveling|best)/)) return applyRecommendation()
  if (has(/(run|start|play|laat|zet)/) && has(/(clock|klok)/)) {
    ui.autoTime = true
    return { ok: true, message: say('The clock is running.', 'De klok loopt.') }
  }
  if (has(/(pause|stop|pauzeer)/) && has(/(clock|klok)/)) {
    ui.autoTime = false
    return { ok: true, message: say('Clock paused.', 'Klok gepauzeerd.') }
  }
  if (has(/(speed|snelheid|time.?lapse|versnel)/)) {
    const n = numberIn(t)
    if (n === null) return { ok: true, message: say(`Scene speed is ×${ui.timeLapse}.`, `Scènesnelheid is ×${ui.timeLapse}.`) }
    const steps = [1, 10, 60, 300, 1440]
    ui.timeLapse = steps.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best))
    return { ok: true, message: say(`Scene speed set to ×${ui.timeLapse}.`, `Scènesnelheid ingesteld op ×${ui.timeLapse}.`) }
  }

  // Questions
  if (question || /\?/.test(raw) || has(/(hoeveel|how much|how many)/)) {
    if (has(/(energy|energie|power|stroom|opwek|produce|produceren|coming in|inflow|binnen|opbrengst|collect)/)) return inflow(has(/(energy|energie|power|stroom|opwek)/))
    if (has(/(need|nodig|recommend|advies|aanbevel|best|ideal|optimal|optimaal|how big|hoe groot|how many|hoeveel tanks|hoeveel regentonnen)/)) return recommendation()
    if (has(/(cover|dekking|reliab|betrouwbaar|enough|genoeg|sustain|voldoende)/)) return reliabilityCommand('')
    if (has(/(tank|barrel|put|ton|water|liter)/)) return tankContents()
  }

  // Settings
  if (has(/(roof|dak)/)) return roofCommand(t)
  if (has(/(tank|tanks|regenton|regentonnen|tonnen|regenput|regenputten|barrel|cistern)/)) return tanksCommand(t)
  if (has(/(reliab|betrouwbaar|dekking|coverage|target|doel)/)) return reliabilityCommand(t)
  if (has(/(use|usage|using|verbruik|gebruik|per day|per dag|a day)/) && numberIn(t) !== null && has(/(l\b|liter|litre|m3)/)) return useCommand(t)
  if (has(/\bwind\b/)) return windCommand(t)
  if (has(/(rain|regen|storm|drizzle|motregen|onweer|droog|dry)/)) return rainCommand(t)
  if (has(/(time|tijd|uur|hour|clock|klok|sun|zon|o'clock|noon|midday|midnight|dawn|dusk|sunrise|sunset|zonsopgang|zonsondergang|middag|middernacht|nacht|night|ochtend|morning|avond|evening)/)) return timeCommand(t)
  if (has(/(use|usage|verbruik|gebruik)/)) return useCommand(t)

  return {
    ok: false,
    message: say(`I did not understand "${raw.trim()}". Say "help" for examples.`, `Ik begreep "${raw.trim()}" niet. Zeg "help" voor voorbeelden.`),
  }
}

// ---- Speech in and out ----
const speakAloud = (text: string) => {
  if (!voice.speak || typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text.replace(/[²]/g, ' squared').replace(/×/g, ' times ').replace(/–/g, ' to '))
  utterance.lang = voice.lang
  speechSynthesis.speak(utterance)
}

export const runCommand = async (text: string) => {
  voice.heard = text
  voice.interim = ''
  voice.error = ''
  const outcome = await handleCommand(text)
  voice.answer = outcome.message
  voice.ok = outcome.ok
  speakAloud(outcome.message)
}

const Recognition: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined
voice.supported = !!Recognition
let recognition: any = null

export const stopListening = () => {
  recognition?.stop()
}

export const startListening = () => {
  if (!Recognition) {
    voice.error = say('This browser has no speech recognition. Use Chrome or Edge, or type / click a command instead.', 'Deze browser heeft geen spraakherkenning. Gebruik Chrome of Edge, of typ / klik een opdracht.')
    return
  }
  if (voice.listening) {
    stopListening()
    return
  }
  speechSynthesis?.cancel()
  pauseWake()
  recognition = new Recognition()
  recognition.lang = voice.lang
  recognition.interimResults = true
  recognition.continuous = false
  recognition.maxAlternatives = 1
  voice.error = ''
  voice.interim = ''

  let finalText = ''
  recognition.onstart = () => (voice.listening = true)
  recognition.onresult = (event: any) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) finalText += result[0].transcript
      else interim += result[0].transcript
    }
    voice.interim = finalText || interim
  }
  recognition.onerror = (event: any) => {
    const reasons: Record<string, [string, string]> = {
      'not-allowed': ['Microphone access was blocked. Allow it in the browser, or type / click a command.', 'Toegang tot de microfoon is geblokkeerd. Sta het toe in de browser, of typ / klik een opdracht.'],
      'service-not-allowed': ['Speech recognition is not allowed here. Type / click a command instead.', 'Spraakherkenning is hier niet toegestaan. Typ / klik een opdracht.'],
      'no-speech': ['I did not hear anything. Try again.', 'Ik hoorde niets. Probeer opnieuw.'],
      'audio-capture': ['No microphone found.', 'Geen microfoon gevonden.'],
      network: ['Speech recognition needs an internet connection.', 'Spraakherkenning heeft internet nodig.'],
    }
    const reason = reasons[event.error]
    voice.error = reason ? say(reason[0], reason[1]) : say(`Speech recognition error: ${event.error}`, `Fout bij spraakherkenning: ${event.error}`)
  }
  recognition.onend = () => {
    voice.listening = false
    const text = finalText.trim() || voice.interim.trim()
    if (text) runCommand(text)
    resumeWake()
  }
  recognition.start()
}

// ---- Wake word: "Hey water" ----
// The Web Speech API has no wake word feature. So when it is switched on, a continuous recognition session keeps
// running (Chrome ends it every minute or so, so it is restarted) and every sentence is checked for the phrase.
// Sentences without it are ignored. The sentence after it (or the rest of the same sentence) is the command.
// "hey water" is often heard as "hey walter", "hi water", "hé water", "okay water" ...
const wakeRe = /\b(?:hey|hay|hei|h\u00e9|he|hi|hoi|hallo|hello|ok|okay|ok\u00e9)[\s,.!-]*(?:water|walter|wata|wader|watter|what a)\b/

// Returns the part of the sentence after the wake word, or null when the wake word is not in it
export const extractWakeCommand = (sentence: string): string | null => {
  const text = sentence.toLowerCase()
  const m = wakeRe.exec(text)
  return m ? text.slice(m.index + m[0].length).replace(/^[\s,.!:-]+/, '').trim() : null
}

const beep = (frequencies: number[]) => {
  try {
    const ctx = new AudioContext()
    frequencies.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.11)
      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start(ctx.currentTime + i * 0.12)
      oscillator.stop(ctx.currentTime + i * 0.12 + 0.12)
    })
    setTimeout(() => ctx.close(), 600)
  } catch {
    // no audio output available: the panel still shows that the wake word was heard
  }
}

const AWAKE_SECONDS = 8 // how long a bare "hey water" waits for the command
let wakeRecognition: any = null
let wakeRestart: ReturnType<typeof setTimeout> | null = null
let awakeUntil = 0
let wakeFailures = 0

const clearWakeRestart = () => {
  if (wakeRestart) clearTimeout(wakeRestart)
  wakeRestart = null
}

const startWakeSession = () => {
  if (!Recognition || !voice.wake || voice.listening || wakeRecognition) return
  const session = new Recognition()
  wakeRecognition = session
  session.lang = voice.lang
  session.continuous = true
  session.interimResults = true
  session.maxAlternatives = 1
  const handled = new Set<number>()

  session.onstart = () => (wakeFailures = 0)
  session.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const heard = result[0].transcript as string
      const rest = extractWakeCommand(heard)

      // Wake word heard (even in half-finished text, so the panel reacts quickly)
      if (rest !== null && !voice.awake) {
        voice.awake = true
        awakeUntil = Date.now() + AWAKE_SECONDS * 1000
        beep([660, 880])
      }
      if (voice.awake) voice.interim = rest ?? heard.trim()

      if (!result.isFinal || handled.has(i)) continue
      handled.add(i)
      if (!voice.awake) continue
      if (Date.now() > awakeUntil && rest === null) {
        voice.awake = false
        voice.interim = ''
        continue
      }
      const command = (rest ?? heard).trim()
      if (command) {
        voice.awake = false
        runCommand(command)
      } else {
        awakeUntil = Date.now() + AWAKE_SECONDS * 1000 // only "hey water": wait for the command
      }
    }
  }
  session.onerror = (event: any) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      voice.wake = false
      voice.error = say('Microphone access was blocked, so the wake word is off.', 'Toegang tot de microfoon is geblokkeerd, dus het wekwoord staat uit.')
    } else if (event.error === 'audio-capture') {
      voice.wake = false
      voice.error = say('No microphone found, so the wake word is off.', 'Geen microfoon gevonden, dus het wekwoord staat uit.')
    } else if (event.error === 'network') {
      wakeFailures++
    }
  }
  session.onend = () => {
    if (wakeRecognition === session) wakeRecognition = null
    voice.awake = false
    // Chrome ends continuous sessions after a while: start again (with a longer pause after repeated failures)
    if (voice.wake && !voice.listening) {
      if (wakeFailures >= 5) {
        voice.wake = false
        voice.error = say('Speech recognition keeps failing (is there an internet connection?). The wake word is off.', 'Spraakherkenning blijft falen (is er internet?). Het wekwoord staat uit.')
        return
      }
      clearWakeRestart()
      wakeRestart = setTimeout(startWakeSession, 250 + wakeFailures * 1000)
    }
  }
  try {
    session.start()
  } catch {
    wakeRecognition = null
  }
}

// Push-to-talk and the wake word share the microphone, so the wake session pauses while the mic button is used
function pauseWake() {
  clearWakeRestart()
  if (wakeRecognition) {
    const session = wakeRecognition
    wakeRecognition = null
    session.onend = null
    session.stop()
  }
  voice.awake = false
}
function resumeWake() {
  if (voice.wake) {
    clearWakeRestart()
    wakeRestart = setTimeout(startWakeSession, 400)
  }
}

export const setWake = (on: boolean) => {
  if (on && !Recognition) {
    voice.error = say('This browser has no speech recognition, so the wake word is not available.', 'Deze browser heeft geen spraakherkenning, dus het wekwoord is niet beschikbaar.')
    return
  }
  voice.wake = on
  voice.error = ''
  if (on) startWakeSession()
  else pauseWake()
}

