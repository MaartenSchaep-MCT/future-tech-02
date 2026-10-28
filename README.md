# Rainwater Planner

A 3D scene (TresJS + three.js, WebGPU) of a house with a rain barrel, for seeing and calculating **how big your roof and rain tanks need to be** for a given water use. Rain falls, runs over the roof through the gutter into the tank, and a planner calculates with real rainfall data for your location. You control everything with sliders, with your voice ("Hey water, increase the roof size to 135 square meters") or with typed commands.

## Getting started

### What you need
- **Node.js** (tested with v24.13.0).
- **[Bun](https://bun.sh)** (tested with 1.3.9; recommended, because `bun.lock` pins the package versions and `package.json` uses `latest` everywhere) or npm.
- **A recent Chrome or Edge**, which have WebGPU and speech recognition.
- An internet connection (for the rainfall data and speech recognition).

### Steps
Run all commands **inside the `rainwater-project` folder** (not the repository root).

```bash
cd rainwater-project
bun install          # once; installs the packages from bun.lock
bun dev              # starts the development server
```

With npm: `npm install`, then `npm run dev`. Without a lockfile npm may install newer package versions, which can break things.

Then open **http://localhost:5173** (the terminal prints the address; if the port is taken Vite picks the next one, such as 5174). Stop the server with `Ctrl+C`.

### Building a production version (optional)
```bash
bunx vite build      # creates the dist/ folder
bunx vite preview    # serves it at http://localhost:4173
```
(`npm run build` also runs a type check with `vue-tsc` first, which did not run on the machine this was tested on.)

### Setting up live weather (optional)
Only needed for the **Live** button. Everything else, including the planner with real rainfall data, works without a key.

1. Create a free key at [OpenWeather](https://openweathermap.org/api) (a new key can take a few hours to become active).
2. Copy `rainwater-project/.env.example` to `rainwater-project/.env.local` and fill in: `OPENWEATHER_API_KEY=yourkey`.
3. **Restart `bun dev`** (the key is only read when the server starts).

`rainwater-project/.env.local` is listed in `.gitignore`. The dev server adds the key on the server side (`rainwater-project/vite.config.ts`), so it never ends up in the browser code. This means live weather only works through `bun dev` or `vite preview`, not on static hosting.

### Using it
1. Type your city at the top of the panel and press **Go**: the planner then uses the real rainfall of your location.
2. **Plan** tab: enter your daily water use and see which roof and tanks you need.
3. Voice: click the microphone (or switch on **Hey water**) and say, for example, "increase the roof size to 135 square meters". You can also type the same commands.

### Troubleshooting
| Problem | Solution |
|---|---|
| Black screen or a WebGPU error | Update Chrome/Edge and your graphics driver; check `chrome://gpu`. Without WebGPU the app falls back to WebGL2, which may be slower. |
| `bun: command not found` | Install Bun, or use `npm install` and `npm run dev`. |
| "Weather API key missing or invalid" | The key is missing, not active yet, or the server was not restarted after filling it in. |
| Microphone does not work | Allow the microphone in the browser (the lock icon in the address bar) and use Chrome or Edge. Typing and the buttons always work. |
| The scene stutters | Lower the rain, use a smaller roof size, or lower `COUNT` in `rainwater-project/src/components/GrassField.vue`. |

## Data sources

| Data | Source | Used for |
|---|---|---|
| Place search | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | name → coordinates |
| Daily rainfall, last 10 years | [Open-Meteo Historical Weather](https://open-meteo.com/en/docs/historical-weather-api) | climate and simulation in the planner |
| Current rain (mm/h) | [OpenWeather Current Weather](https://openweathermap.org/current) | "Live" mode |

No images or models are needed: textures, sky, grass and animals are generated in code.

## Models and formulas

**Roof yield** (`rainwater-project/src/scene/sizing.ts`, `RUNOFF_COEFFICIENT`)

```
litres = rainfall (mm) × roof area (m²) × 0.9        (1 mm on 1 m² = 1 litre; 0.9 = losses from splashing and first flush)
```

**Daily water balance** over the 10 years of rainfall (without a location: a typical climate with the average you enter):

```
level += rainfall × roof × 0.9
overflow = max(0, level − tank volume)        level = min(level, tank volume)
supplied = min(level, litres per day)         shortage = demand − supplied
reliability = 1 − total shortage / total demand
```

**Recommendation:** for each roof size the planner uses bisection to find the smallest tank volume that reaches the wanted percentage (at most 30,000 L). The "balanced" choice is the combination with the smallest roof and tank together (both scaled to their maximum).

**Scene** (`rainwater-project/src/components/RainSystem.vue`)
- Intensity ↔ mm/h: `intensity = 1 − e^(−mm/8)`.
- Every simulated drop that lands on the roof stands for `litres per drop = (mm × m² × 0.9 / 3600 × time-lapse) / drops per second`, so the inflow matches the formula above whatever the number of drops. The time-lapse (×1 … ×1440) only speeds up filling and emptying in the scene.
- The roof (both slopes, plan view) is `2 × 3.2 m × length`; the length follows from the chosen area. The gutter is fixed at the front and runs to the downspout; the left slope drains through an underground pipe to the tanks.
- Drops on the roof first stick and then slide off (larger drops faster); the rest is simple ballistics with gravity and air drag.
- Water surface in the barrel: a wave equation on a grid (`rainwater-project/src/components/BarrelWater.vue`).

**Sun and sky** (`rainwater-project/src/scene/daylight.ts`): sun height `sin((hour − 6)/12 · π)`, sunrise at 6:00, sunset at 18:00; colours and light follow from that and from the rain intensity.

**Flood** (`rainwater-project/src/components/Flood.vue`): the water level rises to a limit; tsunamis are waves `A · e^(−(d/b)²)` with a steep front (3.5 m) and a long tail (10 m), computed on the GPU.

**Voice** (`rainwater-project/src/scene/voice.ts`): the browser's speech recognition (Web Speech API) returns text; keywords (regex, Dutch and English) pick the command and read the numbers. No language model.

## Folders

```
rainwater-project/src/components   3D parts (house, rain, water, grass, animals) and panels (RainHud, VoiceControl, RainCharts)
rainwater-project/src/scene        calculations and shared state (sizing, climate, weather, planner, voice, daylight)
```
