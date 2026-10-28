import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh,
  MeshStandardMaterial, RepeatWrapping, Shape, ShapeGeometry, SphereGeometry, SRGBColorSpace,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Low-poly but anatomically believable animals. Static parts (the fleece, the fur) are merged into one mesh;
// the moving parts (head, jaw, ears, tail, two-segment legs, wings with elbows) are pivot groups that
// Wildlife.vue animates.
let seed = 777
const random = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const range = (min: number, max: number) => min + random() * (max - min)
const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)]

const sphereBase = new SphereGeometry(1, 10, 8)
const blob = (x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => sphereBase.clone().scale(sx, sy, sz).translate(x, y, z)
const merge = (parts: BufferGeometry[]) => {
  const geometry = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!
  parts.forEach((p) => p.dispose())
  return geometry
}

const mesh = (geometry: BufferGeometry, material: MeshStandardMaterial, x = 0, y = 0, z = 0) => {
  const m = new Mesh(geometry, material)
  m.position.set(x, y, z)
  return m
}
const pivot = (x: number, y: number, z: number) => {
  const g = new Group()
  g.position.set(x, y, z)
  return g
}

// Curly fleece / fur bump texture (grayscale, used as bump map)
const furTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 1400; i++) {
    const x = random() * 256
    const y = random() * 256
    const r = 3 + random() * 7
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
    const light = random() < 0.5
    gradient.addColorStop(0, light ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)')
    gradient.addColorStop(1, 'rgba(128,128,128,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(2, 2)
  texture.colorSpace = SRGBColorSpace
  return texture
})()

const dark = new MeshStandardMaterial({ color: '#2a2424', roughness: 0.85 })
const black = new MeshStandardMaterial({ color: '#0c0c0c', roughness: 0.3 })
const pink = new MeshStandardMaterial({ color: '#d99a9a', roughness: 0.8 })
const white = new MeshStandardMaterial({ color: '#f1efe9', roughness: 1, bumpMap: furTexture, bumpScale: 1.5 })

// ---- Sheep ----
const woolColors = ['#ece8dc', '#e3dccb', '#d8d2c4', '#cfc9bd']
const faceColors = ['#2e2828', '#3a2f28', '#4a3d34']

export const makeSheep = () => {
  const group = new Group()
  const wool = new MeshStandardMaterial({ color: pick(woolColors), roughness: 1, bumpMap: furTexture, bumpScale: 3 })
  const face = new MeshStandardMaterial({ color: pick(faceColors), roughness: 0.85 })

  // Fleece: a core body plus overlapping lumps scattered over its surface
  const lumps: BufferGeometry[] = [blob(0, 0.62, 0, 0.36, 0.32, 0.52)]
  for (let i = 0; i < 22; i++) {
    const theta = random() * Math.PI * 2
    const phi = Math.acos(range(-0.55, 1))
    const x = Math.sin(phi) * Math.cos(theta) * 0.36
    const y = 0.62 + Math.cos(phi) * 0.3
    const z = Math.sin(phi) * Math.sin(theta) * 0.5
    lumps.push(blob(x, y, z, range(0.13, 0.2), range(0.12, 0.17), range(0.13, 0.2)))
  }
  lumps.push(blob(0, 0.78, 0.42, 0.17, 0.14, 0.15)) // tuft on the neck
  lumps.push(blob(0, 0.9, 0.58, 0.1, 0.07, 0.09)) // forelock
  const body = mesh(merge(lumps), wool)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Neck and head (pivot at the base of the neck)
  const head = pivot(0, 0.72, 0.5)
  head.add(mesh(blob(0, -0.04, 0.12, 0.085, 0.09, 0.14), face)) // skull
  head.add(mesh(blob(0, -0.07, 0.27, 0.06, 0.06, 0.08), face)) // muzzle
  head.add(mesh(blob(0, -0.075, 0.34, 0.025, 0.02, 0.02), pink)) // nose
  for (const side of [1, -1]) {
    head.add(mesh(blob(side * 0.05, 0.0, 0.2, 0.014), black)) // eyes
    const ear = pivot(side * 0.07, 0.0, 0.08)
    ear.rotation.z = side * -0.7
    ear.add(mesh(blob(side * 0.07, 0, 0, 0.09, 0.02, 0.045), face))
    head.add(ear)
    group.userData[side === 1 ? 'earL' : 'earR'] = ear
  }
  const jaw = pivot(0, -0.1, 0.17)
  jaw.add(mesh(blob(0, 0, 0.07, 0.045, 0.02, 0.08), face))
  head.add(jaw)
  group.add(head)

  // Legs: hip -> upper leg -> knee -> lower leg with a hoof
  const legs: Group[] = []
  const knees: Group[] = []
  const legGeometry = new CylinderGeometry(0.045, 0.036, 0.26, 7).translate(0, -0.13, 0)
  const shinGeometry = new CylinderGeometry(0.034, 0.028, 0.26, 7).translate(0, -0.13, 0)
  const hoofGeometry = new BoxGeometry(0.06, 0.04, 0.08).translate(0, -0.27, 0.01)
  for (const [x, z] of [[0.15, 0.33], [-0.15, 0.33], [0.15, -0.33], [-0.15, -0.33]]) {
    const hip = pivot(x, 0.48, z)
    hip.add(mesh(legGeometry, face))
    const knee = pivot(0, -0.25, 0)
    knee.add(mesh(shinGeometry, face))
    knee.add(mesh(hoofGeometry, black))
    hip.add(knee)
    group.add(hip)
    legs.push(hip)
    knees.push(knee)
  }

  // Short woolly tail
  const tail = pivot(0, 0.64, -0.52)
  tail.add(mesh(blob(0, -0.05, -0.04, 0.06, 0.1, 0.06), wool))
  group.add(tail)

  Object.assign(group.userData, { head, jaw, legs, knees, tail, body })
  return group
}

// ---- Rabbit ----
const furColors = ['#8a7358', '#6f6a62', '#b59a78', '#a8a198', '#5f4b3a']

export const makeRabbit = () => {
  const group = new Group()
  const color = pick(furColors)
  const fur = new MeshStandardMaterial({ color, roughness: 1, bumpMap: furTexture, bumpScale: 1 })
  const belly = new MeshStandardMaterial({ color: new Color(color).lerp(new Color('#ffffff'), 0.55), roughness: 1 })

  const torso = pivot(0, 0, 0)
  torso.add(mesh(merge([
    blob(0, 0.15, 0, 0.085, 0.085, 0.17), // body
    blob(0, 0.17, -0.1, 0.1, 0.1, 0.1), // rump
    blob(0, 0.2, 0.13, 0.07, 0.075, 0.08), // shoulders
  ]), fur))
  torso.add(mesh(blob(0, 0.1, 0.02, 0.07, 0.04, 0.14), belly))

  // Head, eyes, nose, long ears
  const head = pivot(0, 0.24, 0.2)
  head.add(mesh(blob(0, 0, 0.04, 0.05, 0.05, 0.07), fur))
  head.add(mesh(blob(0, -0.015, 0.1, 0.03, 0.028, 0.035), belly))
  head.add(mesh(blob(0, -0.005, 0.135, 0.01), pink))
  const ears: Group[] = []
  for (const side of [1, -1]) {
    head.add(mesh(blob(side * 0.04, 0.012, 0.06, 0.012), black))
    const ear = pivot(side * 0.025, 0.04, 0.02)
    ear.add(mesh(blob(0, 0.07, 0, 0.018, 0.085, 0.03), fur))
    ear.add(mesh(blob(0, 0.07, 0.01, 0.01, 0.07, 0.02), pink))
    head.add(ear)
    ears.push(ear)
  }
  torso.add(head)

  // Cotton tail
  torso.add(mesh(blob(0, 0.19, -0.2, 0.04), white))

  // Front legs and big hind legs (thigh + long foot)
  const front: Group[] = []
  const hind: Group[] = []
  for (const side of [1, -1]) {
    const frontLeg = pivot(side * 0.04, 0.13, 0.14)
    frontLeg.add(mesh(new CylinderGeometry(0.014, 0.012, 0.13, 6).translate(0, -0.065, 0), fur))
    torso.add(frontLeg)
    front.push(frontLeg)

    const hindLeg = pivot(side * 0.07, 0.14, -0.1)
    hindLeg.add(mesh(blob(0, -0.01, 0, 0.045, 0.07, 0.085), fur))
    hindLeg.add(mesh(blob(0, -0.11, 0.045, 0.02, 0.016, 0.07), belly))
    torso.add(hindLeg)
    hind.push(hindLeg)
  }
  group.add(torso)

  Object.assign(group.userData, { ears, torso, front, hind })
  return group
}

// ---- Birds ----
const birdPalettes = [
  { body: '#f2f0ea', wing: '#a9b0b8', tip: '#202328', beak: '#e0a020' }, // gull
  { body: '#2b2d31', wing: '#202226', tip: '#16171a', beak: '#3a3a3a' }, // crow
  { body: '#a88d6a', wing: '#7b6648', tip: '#4a3d2c', beak: '#6a5a40' }, // sparrow
]

export const makeBird = () => {
  const group = new Group()
  const palette = pick(birdPalettes)
  const bodyMaterial = new MeshStandardMaterial({ color: palette.body, roughness: 0.9, side: DoubleSide })
  const wingMaterial = new MeshStandardMaterial({ color: palette.wing, roughness: 0.9, side: DoubleSide })
  const tipMaterial = new MeshStandardMaterial({ color: palette.tip, roughness: 0.9, side: DoubleSide })
  const beakMaterial = new MeshStandardMaterial({ color: palette.beak, roughness: 0.6 })
  const size = range(0.9, 1.3)

  group.add(mesh(merge([blob(0, 0, 0, 0.065, 0.06, 0.18), blob(0, 0.015, 0.17, 0.042)]), bodyMaterial))
  const beak = mesh(new ConeGeometry(0.014, 0.06, 6).rotateX(Math.PI / 2).translate(0, 0.012, 0.25), beakMaterial)
  group.add(beak)
  group.add(mesh(new BoxGeometry(0.07, 0.006, 0.13).translate(0, 0.01, -0.24), tipMaterial)) // tail fan

  const wings: Group[] = []
  const elbows: Group[] = []
  for (const side of [1, -1]) {
    const shoulder = pivot(side * 0.05, 0.02, 0.03)
    shoulder.add(mesh(blob(side * 0.11, 0, 0, 0.12, 0.008, 0.075), wingMaterial)) // inner wing
    const elbow = pivot(side * 0.22, 0, 0)
    elbow.add(mesh(blob(side * 0.12, 0, -0.012, 0.13, 0.006, 0.06), tipMaterial)) // outer wing and feather tips
    shoulder.add(elbow)
    group.add(shoulder)
    wings.push(shoulder)
    elbows.push(elbow)
  }
  group.scale.setScalar(size)
  Object.assign(group.userData, { wings, elbows })
  return group
}

// ---- Butterfly: two-lobed wings, darker towards the edge (vertex colours), lying flat in the XZ plane ----
export const makeButterflyGeometry = () => {
  const wing = new Shape()
  // right-hand wings (x > 0): a large forewing and a smaller hindwing
  wing.moveTo(0, 0.02)
  wing.bezierCurveTo(0.03, 0.09, 0.13, 0.11, 0.15, 0.05)
  wing.bezierCurveTo(0.16, 0.0, 0.1, -0.02, 0.04, -0.005)
  wing.bezierCurveTo(0.12, -0.02, 0.11, -0.1, 0.06, -0.09)
  wing.bezierCurveTo(0.03, -0.085, 0.01, -0.04, 0, -0.01)
  wing.lineTo(0, 0.02)
  const right = new ShapeGeometry(wing, 10)
  const left = right.clone().scale(-1, 1, 1)
  const geometry = mergeGeometries([right, left].map((g) => (g.index ? g.toNonIndexed() : g)), false)!
  geometry.rotateX(-Math.PI / 2)

  // darker rim: brightness falls off with the distance from the body
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    const distance = Math.hypot(position.getX(i), position.getZ(i))
    const shade = Math.max(0.3, 1 - Math.max(0, distance - 0.07) * 7)
    colors.set([shade, shade, shade], i * 3)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}
