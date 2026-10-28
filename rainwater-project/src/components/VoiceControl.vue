<script setup lang="ts">
import { computed, ref } from 'vue'
import { voice, runCommand, setWake, startListening } from '../scene/voice'

const typed = ref('')
const busy = ref(false)

const send = async (text: string) => {
  if (!text.trim() || busy.value) return
  busy.value = true
  await runCommand(text)
  busy.value = false
}
const submit = () => {
  send(typed.value)
  typed.value = ''
}

const languages = [
  { code: 'nl-BE', label: 'Nederlands (BE)' },
  { code: 'nl-NL', label: 'Nederlands (NL)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
]

// Buttons that fire the same commands, for browsers without speech recognition or when talking is not an option
const shortcuts = computed(() => [
  { label: 'Roof +10 m²', command: 'increase the roof size by 10 square meters' },
  { label: 'Roof −10 m²', command: 'decrease the roof size by 10 square meters' },
  { label: 'More rain', command: 'more rain' },
  { label: 'Less rain', command: 'less rain' },
  { label: 'More wind', command: 'more wind' },
  { label: 'Less wind', command: 'less wind' },
  { label: 'Noon', command: 'set the time to 12' },
  { label: 'Night', command: 'set the time to 23' },
  { label: 'What do I need?', command: 'what do I need?' },
  { label: 'Apply that', command: 'apply that' },
  { label: 'Live weather', command: 'show the live weather' },
  { label: 'Tank level?', command: 'how much water is in the tank?' },
  { label: 'Empty tank', command: 'empty the tank' },
  { label: 'Flood 5 m', command: 'flood the world to 5 meters' },
  { label: 'Tsunami!', command: 'send a tsunami' },
  { label: 'Stop flood', command: 'stop the flood' },
])

const examples = [
  '"Hey water, increase the roof size to 135 square meters" (switch on the Hey water button first)',
  '"Increase the roof size to 135 square meters"',
  '"Use 200 liters per day"',
  '"3 tanks of 2000 liters"',
  '"Set the time to 15" / "Zet de zon op 15 uur"',
  '"More rain" · "More wind" · "Storm"',
  '"Location Ghent" · "Show the live weather" · "Live weather in Ghent" · "Toon het live weer"',
  '"What do I need?" then "Apply that"',
  '"How much water is in the tank?"',
  '"Empty the tank" / "Leeg de regenput"',
  '"Flood the world" · "Flood level 5 meters" · "Send a tsunami" · "How high is the flood?" · "Stop the flood"',
]
</script>

<template>
  <div class="voice" role="region" aria-label="Voice commands">
    <div class="line">
      <button
        class="mic"
        :class="{ on: voice.listening }"
        :disabled="!voice.supported"
        :title="voice.supported ? (voice.listening ? 'Listening… click to stop' : 'Click and speak a command') : 'Speech recognition is not available in this browser'"
        :aria-label="voice.listening ? 'Stop listening' : 'Start listening'"
        :aria-pressed="voice.listening"
        @click="startListening"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>

      <form class="type" @submit.prevent="submit">
        <input v-model="typed" type="text" placeholder="Say or type: “increase the roof size to 135 m²”" aria-label="Command" />
        <button type="submit" :disabled="busy">Send</button>
      </form>

      <select v-model="voice.lang" aria-label="Language" title="Language of speech recognition and answers">
        <option v-for="l in languages" :key="l.code" :value="l.code">{{ l.label }}</option>
      </select>
      <label class="speak" title="Read the answers aloud"><input v-model="voice.speak" type="checkbox" /> 🔊</label>
      <button
        class="wake"
        :class="{ on: voice.wake, awake: voice.awake }"
        :disabled="!voice.supported"
        :aria-pressed="voice.wake"
        title="Always listening for Hey water. Keeps the microphone open and sends the audio to the browser's speech service until you switch it off."
        @click="setWake(!voice.wake)"
      >
        Hey water
      </button>
    </div>

    <div class="feedback" aria-live="polite">
      <div v-if="voice.awake" class="listening">Yes? Say your command… <em>{{ voice.interim }}</em></div>
      <div v-else-if="voice.wake && !voice.listening" class="armed">Waiting for “Hey water” … <span class="mute">(microphone is on)</span></div>
      <div v-if="voice.listening" class="listening">Listening… <em>{{ voice.interim }}</em></div>
      <template v-if="!voice.listening && !voice.awake">
        <div v-if="voice.heard" class="heard"><span>Heard</span> “{{ voice.heard }}”</div>
        <div v-if="voice.answer" class="answer" :class="{ bad: !voice.ok }"><span>{{ voice.ok ? 'Done' : 'Not done' }}</span> {{ voice.answer }}</div>
      </template>
      <div v-if="voice.error" class="error">{{ voice.error }}</div>
      <div v-if="!voice.supported" class="error">No speech recognition in this browser (use Chrome or Edge). Typing and the buttons below work everywhere.</div>
    </div>

    <details>
      <summary>What can I say? · quick buttons</summary>
      <div class="chips">
        <button v-for="s in shortcuts" :key="s.label" :title="s.command" @click="send(s.command)">{{ s.label }}</button>
      </div>
      <ul>
        <li v-for="e in examples" :key="e">{{ e }}</li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.voice {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: min(620px, calc(100vw - 700px));
  min-width: 360px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(15, 30, 45, 0.86);
  backdrop-filter: blur(8px);
  color: #e8f4ff;
  font-family: system-ui, sans-serif;
  font-size: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}
.line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mic {
  flex: none;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: inherit;
  background: #2a78d6;
  cursor: pointer;
}
.mic:disabled {
  background: rgba(255, 255, 255, 0.12);
  cursor: not-allowed;
  opacity: 0.5;
}
.mic.on {
  background: #d9304f;
  animation: pulse 1.2s ease-out infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(217, 48, 79, 0.6); }
  100% { box-shadow: 0 0 0 14px rgba(217, 48, 79, 0); }
}
.type {
  flex: 1;
  display: flex;
  gap: 6px;
  min-width: 0;
}
input[type='text'] {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
}
select {
  max-width: 120px;
  padding: 7px 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(15, 30, 45, 0.9);
  color: inherit;
  font: inherit;
}
.speak {
  cursor: pointer;
  white-space: nowrap;
}
button {
  cursor: pointer;
  border: 0;
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  color: inherit;
  background: rgba(255, 255, 255, 0.14);
}
button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.24);
}
.mic:hover:not(:disabled) {
  background: #3987e5;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid #8fc8ee;
  outline-offset: 2px;
}
.feedback {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.35;
}
.feedback span {
  display: inline-block;
  min-width: 52px;
  margin-right: 4px;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.listening {
  color: #ff9ab0;
}
.armed {
  color: #8fc8ee;
}
.mute {
  opacity: 0.6;
}
.wake {
  white-space: nowrap;
}
.wake.on {
  background: #2a78d6;
}
.wake.awake {
  background: #d9304f;
}
.answer span {
  background: rgba(63, 200, 150, 0.3);
}
.answer.bad span {
  background: rgba(240, 153, 111, 0.35);
}
.error {
  color: #ffb08a;
}
details {
  margin-top: 6px;
  opacity: 0.9;
}
summary {
  cursor: pointer;
  opacity: 0.75;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.chips button {
  padding: 5px 9px;
}
ul {
  margin: 4px 0 0;
  padding-left: 18px;
  opacity: 0.8;
}
</style>
