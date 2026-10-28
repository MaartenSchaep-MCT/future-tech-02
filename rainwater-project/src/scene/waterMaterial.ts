import { Color } from 'three'
import { MeshPhysicalNodeMaterial } from 'three/webgpu'
import { dot, normalView, oneMinus, positionViewDirection, pow, saturate } from 'three/tsl'

// Clear water without the cost of real refraction: almost transparent when looking straight at the surface,
// increasingly reflective towards the grazing edges (Fresnel), like glass or water. The tint stays very faint,
// so droplets read as transparent rather than blue.
export const createClearWaterMaterial = (minOpacity: number, maxOpacity: number, tint = '#f2faff') => {
  const material = new MeshPhysicalNodeMaterial({
    color: new Color(tint),
    roughness: 0,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0,
    ior: 1.33,
    envMapIntensity: 4,
    transparent: true,
    depthWrite: false,
  })
  const fresnel = pow(oneMinus(saturate(dot(normalView, positionViewDirection))), 3)
  material.opacityNode = fresnel.mul(maxOpacity - minOpacity).add(minOpacity)
  return material
}
