import { Color, Vector3 } from 'three'
import { smoothstep } from './terrain'

// Everything that depends on the time of day, computed once per frame by DayNight.vue and read by the sky,
// the lights, the fog and the rest of the scene.
export const sky = {
  sunDir: new Vector3(0, 1, 0), // direction towards the sun (y < 0: below the horizon)
  elevation: 1, // sun height, -1 .. 1
  day: 1, // 0 night .. 1 full daylight
  twilight: 0, // 1 at sunrise / sunset
  top: new Color(),
  horizon: new Color(),
  lightDir: new Vector3(0, 1, 0), // direction towards the main light (the sun, or the moon at night)
  lightColor: new Color(),
  lightIntensity: 2.2,
  hemiIntensity: 0.6,
  envIntensity: 0.3,
}

const dayTop = new Color('#3f86d6')
const dayHorizon = new Color('#cfe3f0')
const nightTop = new Color('#050a18')
const nightHorizon = new Color('#0d1424')
const duskTop = new Color('#35508a')
const duskHorizon = new Color('#f0975f')
const stormTop = new Color('#4d565e')
const stormHorizon = new Color('#6a7580')
const sunLow = new Color('#ff9a55')
const sunHigh = new Color('#fff1d9')
const moonLight = new Color('#9db4ff')
const scratch = new Color()

export const updateSky = (hour: number, rain: number) => {
  const storm = Math.min(1, rain * 1.1)
  // Sunrise at 6:00, noon at 12:00, sunset at 18:00
  const angle = ((hour - 6) / 12) * Math.PI
  sky.sunDir.set(-Math.cos(angle) * 0.92, Math.sin(angle), 0.38).normalize()
  const e = sky.sunDir.y
  sky.elevation = e
  sky.day = smoothstep(-0.06, 0.28, e)
  sky.twilight = Math.exp(-((e / 0.14) ** 2))

  sky.top.copy(nightTop).lerp(dayTop, sky.day)
  sky.horizon.copy(nightHorizon).lerp(dayHorizon, sky.day)
  sky.top.lerp(duskTop, sky.twilight * 0.5)
  sky.horizon.lerp(duskHorizon, sky.twilight * 0.85 * (1 - 0.6 * storm))

  // Storm clouds: grey, and darker the less daylight there is
  const brightness = 0.08 + 0.92 * sky.day
  sky.top.lerp(scratch.copy(stormTop).multiplyScalar(brightness), storm)
  sky.horizon.lerp(scratch.copy(stormHorizon).multiplyScalar(brightness), storm)

  // Main light: the sun by day, a weak blue moon at night
  if (e > 0) {
    sky.lightDir.copy(sky.sunDir)
    sky.lightColor.copy(sunLow).lerp(sunHigh, smoothstep(0, 0.4, e))
    sky.lightIntensity = 2.2 * smoothstep(0, 0.2, e) * (1 - 0.64 * storm) + 0.15
  } else {
    sky.lightDir.copy(sky.sunDir).negate()
    sky.lightColor.copy(moonLight)
    sky.lightIntensity = 0.35 * (1 - 0.6 * storm)
  }
  sky.hemiIntensity = 0.12 + 0.48 * sky.day
  sky.envIntensity = 0.04 + 0.26 * sky.day
}

export const formatHour = (hour: number) => {
  const h = Math.floor(hour) % 24
  const m = Math.floor((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
