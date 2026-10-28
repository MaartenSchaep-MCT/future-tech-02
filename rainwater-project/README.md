# Regenwaterplanner

Een 3D-scène (TresJS + three.js, WebGPU) van een huis met regenput, om te zien en te berekenen **hoe groot je dak en je regentanks moeten zijn** voor een bepaald waterverbruik. Regen valt, loopt over het dak door de goot naar de tank, en een planner rekent met echte neerslagcijfers van jouw plaats. Je bedient alles met sliders, met je stem ("Hey water, vergroot het dak naar 135 vierkante meter") of met getypte opdrachten.

## Starten

### Wat je nodig hebt
- **Node.js 20.19+ of 22.12+** (nodig voor Vite 8; getest met Node 24).
- **[Bun](https://bun.sh)** (aanbevolen: de `bun.lock` legt de versies vast, want in `package.json` staat overal `latest`) of npm.
- **Chrome of Edge**, recent. Die hebben WebGPU en spraakherkenning.
- Internet (voor de regencijfers en spraakherkenning).

### Stappen
Alle commando's draai je **in de map `rainwater-project`** (niet in de hoofdmap van de repository).

```bash
cd rainwater-project
bun install          # eenmalig; installeert de pakketten uit bun.lock
bun dev              # start de ontwikkelserver
```

Met npm: `npm install` en daarna `npm run dev`. Gebruik je npm zonder lockfile, dan kunnen nieuwere pakketversies dingen breken.

Open daarna **http://localhost:5173** (de terminal toont het adres; is de poort bezet, dan kiest Vite de volgende, zoals 5174). Stoppen doe je met `Ctrl+C`.

### Een productieversie bouwen (optioneel)
```bash
bunx vite build      # maakt de map dist/
bunx vite preview    # bekijkt die versie op http://localhost:4173
```
(`npm run build` voert eerst ook een typecontrole uit met `vue-tsc`; die draait niet op elke machine.)

### Live weer instellen (optioneel)
Alleen nodig voor de knop **Live**. Al het andere, ook de planner met echte regencijfers, werkt zonder sleutel.

1. Maak een gratis sleutel bij [OpenWeather](https://openweathermap.org/api) (een nieuwe sleutel kan een paar uur duren voor hij werkt).
2. Kopieer `.env.example` naar `.env.local` en vul in: `OPENWEATHER_API_KEY=jouwsleutel`.
3. **Herstart `bun dev`** (de sleutel wordt alleen bij het opstarten gelezen).

`.env.local` staat in `.gitignore`. De dev-server voegt de sleutel server-side toe (`vite.config.ts`), dus hij komt niet in de browsercode. Live weer werkt daarom alleen via `bun dev` of `vite preview`, niet op statische hosting.

### Gebruiken
1. Typ je stad bovenin het paneel en druk op **Go**: de planner gebruikt dan de echte regen van jouw plaats.
2. Tabblad **Plan**: vul je dagverbruik in en kijk welk dak en welke tanks nodig zijn.
3. Spraak: klik op de microfoon (of zet **Hey water** aan) en zeg bijvoorbeeld "vergroot het dak naar 135 vierkante meter". Je kunt dezelfde opdrachten ook typen.

### Problemen oplossen
| Probleem | Oplossing |
|---|---|
| Zwart scherm of foutmelding over WebGPU | Update Chrome/Edge en je grafische driver; controleer `chrome://gpu`. Zonder WebGPU valt de app terug op WebGL2, maar dat kan trager zijn. |
| `bun: command not found` | Installeer Bun, of gebruik `npm install` en `npm run dev`. |
| "Weather API key missing or invalid" | Sleutel ontbreekt, is nog niet actief, of de server is niet herstart na het invullen. |
| Microfoon werkt niet | Sta de microfoon toe in de browser (slotje in de adresbalk) en gebruik Chrome of Edge. Typen en de knoppen werken altijd. |
| De scène hapert | Zet de regen lager, gebruik een kleinere dakgrootte, of verlaag `COUNT` in `src/components/GrassField.vue`. |

## Bronnen van data

| Data | Bron | Gebruik |
|---|---|---|
| Plaats zoeken | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | naam → coördinaten |
| Dagelijkse neerslag, laatste 10 jaar | [Open-Meteo Historical Weather](https://open-meteo.com/en/docs/historical-weather-api) | klimaat en simulatie in de planner |
| Huidige regen (mm/u) | [OpenWeather Current Weather](https://openweathermap.org/current) | "Live"-modus |

Er zijn geen afbeeldingen of modellen nodig: textures, lucht, gras en dieren worden in code gegenereerd.

## Modellen en formules

**Opbrengst van het dak** (`scene/sizing.ts`, `RUNOFF_COEFFICIENT`)

```
liters = regen (mm) × dakoppervlak (m²) × 0,9        (1 mm op 1 m² = 1 liter; 0,9 = verlies door spatten en first flush)
```

**Waterbalans per dag** over de 10 jaar neerslag (zonder plaats: een typisch klimaat met het gemiddelde dat je invult):

```
niveau += regen × dak × 0,9
overloop = max(0, niveau − tankvolume)        niveau = min(niveau, tankvolume)
verbruik = min(niveau, liters per dag)        tekort = vraag − verbruik
betrouwbaarheid = 1 − totaal tekort / totale vraag
```

**Advies:** per dakmaat zoekt de planner met bisectie het kleinste tankvolume dat het gewenste percentage haalt (maximaal 30 000 L). De "gebalanceerde" keuze is de combinatie met het kleinste dak en de kleinste tank samen (beide geschaald op hun maximum).

**Scène** (`components/RainSystem.vue`)
- Intensiteit ↔ mm/u: `intensiteit = 1 − e^(−mm/8)`.
- Elke gesimuleerde druppel op het dak staat voor `liter per druppel = (mm × m² × 0,9 / 3600 × tijdversnelling) / druppels per seconde`, zodat de instroom klopt met de formule hierboven, ongeacht het aantal druppels. De tijdversnelling (×1 … ×1440) versnelt alleen het vullen en leegmaken in de scène.
- Het dak (beide hellingen, bovenaanzicht) is `2 × 3,2 m × lengte`; de lengte volgt uit het gekozen oppervlak. De goot hangt vast aan de voorkant en loopt naar de regenpijp; de linkerhelling gaat via een ondergrondse pijp naar de tanks.
- Druppels op het dak blijven eerst plakken en glijden dan weg (grotere druppels sneller); de rest is eenvoudige ballistiek met zwaartekracht en luchtweerstand.
- Waterspiegel in de ton: golfvergelijking op een raster (`components/BarrelWater.vue`).

**Zon en lucht** (`scene/daylight.ts`): zonshoogte `sin((uur − 6)/12 · π)`, opkomst 6:00, ondergang 18:00; kleuren en licht volgen daaruit en uit de regenintensiteit.

**Overstroming** (`components/Flood.vue`): waterstand stijgt tot een limiet; tsunami's zijn golven `A · e^(−(d/b)²)` met een steile voorkant (3,5 m) en lange staart (10 m), berekend op de videokaart.

**Spraak** (`scene/voice.ts`): browser-spraakherkenning (Web Speech API) geeft tekst; trefwoorden (regex, Nederlands en Engels) kiezen de opdracht en lezen de getallen. Geen taalmodel.

## Mappen

```
src/components   3D-onderdelen (huis, regen, water, gras, dieren) en panelen (RainHud, VoiceControl, RainCharts)
src/scene        berekeningen en gedeelde toestand (sizing, climate, weather, planner, voice, daylight)
```
