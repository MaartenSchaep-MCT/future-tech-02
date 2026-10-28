# rainwater-project

> A TresJS Vue application

## Features

- [Tres.js](https://tresjs.org) and latest [Three.js](https://threejs.org)
- `@tresjs/cientos` package pre-installed 📦
- `@tresjs/leches` GUI controls for debugging 🍰
- Shader support (glsl) with [`vite-plugin-glsl`](https://github.com/UstymUkhman/vite-plugin-glsl) 🎨
- TypeScript support 🦄
- ESLint configuration 🔧

## Getting Started

### Install dependencies

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

### Build

Build the application for production:

```bash
npm run build
```

### Preview

Locally preview production build:

```bash
npm run preview
```

### Lint

Run ESLint:

```bash
npm run lint
```

Fix ESLint issues:

```bash
npm run lint:fix
```

## Learn More

- [TresJS Documentation](https://tresjs.org)
- [Three.js Documentation](https://threejs.org/docs/)
- [Vue.js Documentation](https://vuejs.org/)
## Planning your roof and tanks

1. Type your city in the planner and press Go. The app downloads the last ten years of daily rainfall for it
   (free [Open-Meteo](https://open-meteo.com/) API, no key needed).
2. Fill in your daily water use and how much of it the rain should cover (reliability).
3. The planner runs a day-by-day water balance of roof + tank over those ten years and shows the tank volume
   needed for each roof size, a "balanced" choice, and how reliability grows with tank volume.

Model: `litres = rainfall (mm) x roof area (m2) x 0.9`, tank overflow above its volume, daily use taken from the tank.
Without a location a typical climate with the average rainfall you enter is used.

## Live weather

The "Live" mode fetches the current rainfall at your location from [OpenWeather](https://openweathermap.org/api).

1. Create a free API key.
2. Copy `.env.example` to `.env.local` and put the key in `OPENWEATHER_API_KEY` (`.env.local` is git-ignored).
3. Restart `bun dev`.

The key is added by the Vite dev/preview server (see `vite.config.ts`), so it is never bundled into the browser code.
A static deployment would need an equivalent small proxy. The rainfall statistics above do not need a key.

## Voice commands

The panel at the bottom of the screen takes spoken (Chrome / Edge / Safari, Web Speech API) or typed commands in
English or Dutch, shows what it heard and what it did, and has buttons as a fallback. Values are understood:

- "Increase the roof size to 135 square meters" / "Dak naar 135 vierkante meter"
- "Use 200 liters per day" · "3 tanks of 2000 liters" · "Reliability 95 percent"
- "Set the time to 15" / "Zet de zon op 15 uur" · "More rain" · "More wind" · "Location Ghent"
- "What do I need?" then "Apply that" · "How much water is in the tank?" · "Empty the tank"
