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
## Live weather

The "Live" mode fetches current rainfall from [OpenWeather](https://openweathermap.org/api).

1. Create a free API key.
2. Copy `.env.example` to `.env.local` and put the key in `OPENWEATHER_API_KEY` (`.env.local` is git-ignored).
3. Restart `bun dev`.

The key is added by the Vite dev/preview server (see `vite.config.ts`), so it is never bundled into the browser code.
A static deployment would need an equivalent small proxy.
