import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

// Procedural canvas textures, so the scene needs no image assets.
let seed = 1234
const random = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const makeTexture = (size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeatX: number, repeatY: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const grey = (v: number, a = 1) => `rgba(${v}, ${v}, ${v}, ${a})`

// Rough plaster: mottled blotches plus fine grain
export const plasterTexture = () =>
  makeTexture(512, (ctx, s) => {
    ctx.fillStyle = grey(235)
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 260; i++) {
      const r = 8 + random() * 40
      ctx.fillStyle = grey(random() < 0.5 ? 200 : 255, 0.06)
      ctx.beginPath()
      ctx.arc(random() * s, random() * s, r, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = 0; i < 14000; i++) {
      ctx.fillStyle = grey(random() < 0.5 ? 150 : 255, 0.25)
      ctx.fillRect(random() * s, random() * s, 1 + random() * 2, 1 + random() * 2)
    }
  }, 2, 1)

// Clay roof tiles. Rows are stacked along the slope (canvas x) and tiles run along the ridge (canvas y).
export const roofTileTexture = (repeatX: number, repeatY: number) =>
  makeTexture(512, (ctx, s) => {
    const rows = 8
    const tiles = 4
    const rowW = s / rows
    const tileH = s / tiles
    ctx.fillStyle = grey(60)
    ctx.fillRect(0, 0, s, s)
    for (let r = 0; r < rows; r++) {
      for (let t = -1; t < tiles; t++) {
        const offset = r % 2 ? tileH / 2 : 0
        const y = t * tileH + offset
        const v = 175 + random() * 80
        // lighter towards the exposed lower edge of each tile (canvas x)
        const grad = ctx.createLinearGradient(r * rowW, 0, (r + 1) * rowW, 0)
        grad.addColorStop(0, grey(Math.round(v * 0.62)))
        grad.addColorStop(0.85, grey(Math.round(v)))
        grad.addColorStop(1, grey(Math.round(v * 0.45)))
        ctx.fillStyle = grad
        ctx.fillRect(r * rowW, y + 2, rowW, tileH - 4)
      }
    }
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = grey(random() < 0.5 ? 0 : 255, 0.08)
      ctx.fillRect(random() * s, random() * s, 2, 2)
    }
  }, repeatX, repeatY)

// Mottled grass, multiplied with the terrain vertex colours
export const grassTexture = (repeat: number) =>
  makeTexture(512, (ctx, s) => {
    ctx.fillStyle = grey(200)
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = grey(random() < 0.5 ? 150 : 255, 0.08)
      ctx.beginPath()
      ctx.arc(random() * s, random() * s, 10 + random() * 40, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = 0; i < 9000; i++) {
      const x = random() * s
      const y = random() * s
      ctx.strokeStyle = grey(random() < 0.5 ? 110 : 255, 0.35)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (random() - 0.5) * 4, y - 3 - random() * 6)
      ctx.stroke()
    }
  }, repeat, repeat)
