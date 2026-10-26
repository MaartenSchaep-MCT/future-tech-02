import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import glsl from 'vite-plugin-glsl'
import { templateCompilerOptions } from '@tresjs/core'

// The OpenWeather key lives in .env.local (OPENWEATHER_API_KEY, no VITE_ prefix) and is added to the
// request here, on the server side, so it never ends up in the browser bundle or in git.
const weatherProxy = (key: string) => {
  const target = 'https://api.openweathermap.org'
  const appendKey = (path: string) => `${path}${path.includes('?') ? '&' : '?'}appid=${encodeURIComponent(key)}`
  return {
    '/api/geocode': { target, changeOrigin: true, rewrite: (p: string) => appendKey(p.replace(/^\/api\/geocode/, '/geo/1.0/direct')) },
    '/api/weather': { target, changeOrigin: true, rewrite: (p: string) => appendKey(p.replace(/^\/api\/weather/, '/data/2.5/weather')) },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = weatherProxy(env.OPENWEATHER_API_KEY ?? '')
  return {
    plugins: [
      vue({
        ...templateCompilerOptions,
      }),
      glsl(),
    ],
    server: { proxy },
    preview: { proxy },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id: string) => (id.includes('node_modules/three/') ? 'three' : undefined),
        },
      },
    },
    optimizeDeps: {
      exclude: ['vue', 'three'],
    },
  }
})
