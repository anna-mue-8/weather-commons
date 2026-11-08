# 21 · consequential weathering

Author: Anna-Lena Mueller · Started: 2026-11-07 · Status: sketch · Stack: static HTML + JS

Before asking who has the right to change the weather, this sketch asks who is already interfering with it at large scales, starting with extractive open-pit mines flooded with river or groundwater. It will simulate how these sites interfere with the atmosphere across vertical scales, and argue that a weather commons must address this too.

## Run

Online, once published: https://anna-mue-8.github.io/weather-commons/21-consequential-weathering/

On your computer:

```bash
cd sketches/21-consequential-weathering
python -m http.server 8000
```

Then open http://localhost:8000.

## 1. Event

Extractive open-pit mining, especially pits flooded with river or groundwater. The sites, places and dates are still to be chosen.

Working question (interpretive, a draft): When we ask ‘Who has the right to control and change the weather?’, we should also ask ‘Who is already interfering in the weather at large scales?’ Because can we really achieve and talk about a weather commons, if all systems it is entangled with are extracted and manipulated across scales?

## 2. Simulate

First version (in `sim.js`, data in `data/slice-partwitz-summer.json` and `data/slice-partwitz-autumn.json`, built by `scripts/make_slice.py`). It's a side view of the air above a 20 km line west to east through Partwitzer See (51.52° N, 14.00–14.29° E), from the ground up to 4 km, in two panels running at the same time: 1991 (open pit) on the left, 2025 (lake) on the right.

Two seasons, each pairing the days a satellite photographed the ground:
- **Summer**, 06:00 to 20:30: 7 August 1991 and 12 August 2025, both hot, dry and clear.
- **Autumn**, 01:00 to 15:00: 26 October 1991 and 8 November 2025, both cold, calm and clear. Chosen because a lake that is much warmer than the air above it shows its effect most clearly. 8 November 2025 was the calmest, clearest cold day near a clear Landsat frame, and Landsat 8 photographed the area that morning.

Three choices of weather:
- **Each year's own day near the lake** (default): 2025 as measured at DWD Hoyerswerda, 8 km from the lake. 1991 estimated for the area near the lake from DWD Cottbus, 31 km away, the nearest station with hourly records in 1991 (see Sources and limits; modelled). A control picks the typical estimate or a colder or milder version (1 in 10 similar days).
- **Both on the 2025 day**: Hoyerswerda for both panels. The 1991 ground is lined up by its vegetation temperature, so only the ground differs.
- **Each year's own day as measured at Cottbus**: the same station in both years, without estimating.

Both panels start with the same small random nudges, so differences between them come from the ground and the weather.

What goes in:
- the ground along the line from Landsat: water, bare ground or vegetation, and surface temperature (observed);
- hourly air temperature, dew point, pressure and wind: observed at Hoyerswerda or Cottbus, or estimated near the lake for 1991 (modelled);
- how rough each surface is: typical roughness lengths (water 0.2 mm, bare pit floor 3 cm, vegetation 50 cm);
- a starting profile of the air with height (synthetic).

What the model calculates (modelled, approximate):
- **Air movement:** a 2D model in which warmer air rises and cooler air flows in to replace it. Grid of 160 × 64 cells, about 126 m wide and 62.5 m high, 4-second steps.
- **Friction:** the station's wind stands for the wind over typical land. Below 200 m, each surface has its own wind speed from the log wind profile: faster over smooth water, slower over rough forest. After a shore or forest edge the air adjusts over about 800 m. Where the wind speeds up or slows down along the line, the air spreads out and sinks or piles up and rises; this vertical motion is worked out so no air is made or lost.
- **Turbulence (mixing):** two kinds added together. From heating: strong where warm air is under cooler air, weak where the air is calm and layered (about 0.1 to 60 m²/s). From friction: wind over rough ground churns the air up to about 400 m, damped where the air is layered. Over water the friction part is two to three times weaker than over forest.
- **Heat and moisture from the ground:** an exchange speed that grows with the wind and the roughness of the surface, plus rising warm air where the surface is warmer than the air (free convection). Water gives off moisture most easily, then vegetation, then bare ground. Where the ground is colder than the air's dew point, dew or frost takes moisture out of the air.
- **Land temperature through the day:** follows the air temperature, warmer in sunshine by as much as the satellite saw (scaled by the height of the sun), about 1 °C colder than the air at night.
- **Cloud and mist:** water vapour condenses when the air is saturated.
- **Steam fog:** the forecasters' mixing check for each water cell. Mix saturated air at the water's temperature with the arriving air (station temperature and dew point); if a mixture is oversaturated, the water steams. Done as a check because steam fog is often only metres deep, thinner than the model's lowest layer.
- **Rain:** Kessler's (1969) warm-rain scheme. Cloud water turns into rain, rain collects cloud droplets, falls, and evaporates in dry air.
- **Dust:** more dust means more, smaller droplets, so rain starts later.

What comes out: moving dots for air movement, grey for cloud and mist, wavy lines for steam fog, strokes for rain, and bars for rain on the ground. Below the ground: surface temperature, turbulence near the ground, and air rising or sinking at about 200 m. A readout under each panel compares the Partwitzer See area with the rest of the line: wind near the ground, turbulence, rising or sinking air, steam fog, mist, cloud and rain.

First results (8 November 2026, one run each unless noted):
- **Summer, each year's own day:** no cloud in either year, as observed (7 August 1991 up to 33.9 °C at Cottbus, 0–2 okta cloud). In the afternoon over the 2025 lake, turbulence near the ground is lower than over the land around it (about 32 against 37–39 m²/s), and the air at 200 m sinks (−0.02 to −0.08 m/s) while it rises over the land (+0.04 to +0.07 m/s). The cool lake calms the air above it.
- **Autumn, each year's own day:** the 2025 lake (about 9 °C) is much warmer than the night air (−1.6 °C at Hoyerswerda). It churns the air above it (turbulence about 5–12 m²/s against about 0.1 over calm land) and steams: steam fog over all its open water, about two thirds of the Partwitzer See area, all night. In 1991 the pit held groundwater pools, about a third of the area, at about 7 °C. On the typical estimated night they steam only around dawn; on the colder version all night; on the milder version not at all.
- **Autumn, both on the 2025 day:** steam fog over all open water in both years. The difference is the area of open water (69% against 31% of the Partwitzer See area).
- **Autumn, as measured at Cottbus:** Cottbus was 3–5 °C milder than Hoyerswerda on the night of 8 November 2025; steam fog over the lake only part of the night.
- The model's own mist (in its 62 m layers) no longer forms in autumn now that heat and moisture exchange depend on roughness and wind; an earlier version, with a fixed, faster exchange, made mist up to about 60 m over half the lake area. Real steam fog is thinner than one layer, which is why the steam fog check was added.
- Friction makes the wind in the lowest layer about 10% faster over the water and about 10% slower over forest than over typical land, and the vertical motion it causes at shores is at most about 4 cm/s (summer afternoon, wind about 2.7 m/s). The friction velocity, which drives the friction-made turbulence, is about 0.06 m/s over water and 0.15 m/s over forest. With the light winds of these days, heating moves the air more than friction does.

To test without a browser, see the notes.

## 3. Situate

Where does it sit in the world: places, infrastructure, institutions, history, politics?

## 4. Narrate

The story in a few sentences. What can a viewer learn here, and what should they not conclude?

## Sources and limits

For every dataset: who made it, which version and date, when you downloaded it, its licence, and what you changed. Say whether each layer is observed, reanalysed, modelled, synthetic or interpretive. Then say what this sketch cannot show.

- Moving dots in `index.html`: synthetic. A steady east wind made up for the starter template, not a model of a real place. To be replaced.
- The question on the page: interpretive, a working draft.
- **Weather station records** in `data/dwd-monthly.csv` and `data/dwd-stations.json`: **observed.**
  - Made by: Deutscher Wetterdienst (DWD), Climate Data Center, daily climate observations ("kl"): https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/
  - Licence: CC BY 4.0 (https://www.dwd.de/copyright). Credit "Deutscher Wetterdienst".
  - Version: the historical files run to 31 December 2025, and the recent files fill in up to the download date.
  - Downloaded: 8 November 2026, by `scripts/fetch_dwd.py`.
  - Time covered: from 1950 (each station's own start if later) to November 2026.
  - What was changed: daily values averaged into months (rain and sunshine summed, only for months with at least 25 days of values). Missing values (-999) were left out. `days_with_temp` says how many days each month is based on.
  - Stations: in the Central German lake district, Leipzig-Holzhausen, Leipzig/Halle, Bad Lauchstädt, Querfurt, Zeitz, Köthen and Wittenberg; in the Lusatian lake district, Schipkau-Klettwitz (from 1996), Hoyerswerda (from 2010), Cottbus, Doberlug-Kirchhain and Bad Muskau.
  - The raw daily files are not in git. Run `python scripts/fetch_dwd.py` from the sketch folder to download them again into `assets/dwd/`.
- Lake centre points in `scripts/fetch_dwd.py`: approximate, only used for measuring distances. To check against LMBV maps.
- **Satellite frames** in `assets/landsat/` (not in git yet): **observed.**
  - Made by: USGS/NASA Landsat, Collection 2 Level-2 (surface reflectance and surface temperature). These are the same products as on USGS EarthExplorer, read from the copy on Microsoft Planetary Computer (collection `landsat-c2-l2`).
  - Satellites: Landsat 5 TM for 1985–2010, Landsat 8 OLI/TIRS for 2013–2018, Landsat 9 for 2022–2025. Landsat 7 was left out because of its striped gaps after 2003.
  - Licence: public domain (USGS).
  - Downloaded: 8 November 2026, by `scripts/fetch_landsat.py` (packages in `scripts/requirements.txt`).
  - Dates: 1985-06-03, 1988-08-14, 1991-08-07, 1994-07-14, 1996-08-20, 2000-05-11, 2004-08-10, 2005-08-29, 2009-08-24, 2010-07-10, 2013-08-03, 2016-06-24, 2018-08-17, 2022-07-19, 2025-08-12. Scene ids are in `assets/landsat/frames.json`.
  - Chosen as: one summer frame (June–August, May–September if needed) about every three years, scene cloud 10% or less, and the least cloud and fewest gaps inside the box. If the target year had no clear frame, the year before or after was used.
  - What was changed: cut to the box 13.75–14.35° E, 51.40–51.65° N and reprojected to UTM zone 33N at 30 m, so all frames line up. True colour uses one fixed stretch for every frame (surface reflectance 0 to 0.3, gamma 0.5). Surface temperature converted to °C.
- Limits of the satellite frames:
  - Each frame is one moment, a summer morning at about 10:00 local solar time, on a clear day. It doesn't show an average or a climate.
  - Surface temperature is the temperature of the ground or water surface, not of the air. Pixels on shores mix land and water.
  - Landsat 5 and Landsat 8/9 see colour and heat slightly differently, so small changes across 2011–2013 may come from the change of satellite.
  - The 2010 frame has some light cloud near Hoyerswerda (about 5% of the box).
- **Autumn satellite frames** in `assets/landsat/` (not in git): **observed.** Downloaded on 8 November 2026 by `scripts/fetch_autumn.py`, same source, licence, box and processing as the summer frames. Scene ids in `assets/landsat/autumn-frames.json`.
  - 2025-11-08, Landsat 8, overpass 09:57 UTC, 2.5% of the box cloudy or missing.
  - 1991-10-26, Landsat 5, overpass 09:20 UTC, 1.0% of the box cloudy or missing. The clearest autumn frame near 1991.
- **Simulation inputs** in `data/slice-partwitz-summer.json` and `data/slice-partwitz-autumn.json`, made by `scripts/make_slice.py` on 8 November 2026:
  - Ground along the line: **observed.** Summer, the Landsat frames of 1991-08-07 and 2025-08-12. Autumn, 1991-10-26 and 2025-11-08. Water if NDWI > 0.05, vegetation if NDVI > 0.3, otherwise bare. Lake shore positions from OpenStreetMap (Nominatim), © OpenStreetMap contributors, ODbL.
  - Hourly weather on each Landsat day: **observed.** DWD Climate Data Center, hourly observations (historical files to 31 December 2025, plus recent files), CC BY 4.0, downloaded 8 November 2026 into `assets/dwd/hourly/` (not in git). Temperature, humidity, dew point, pressure, wind, cloud cover, rain. Hours are in UTC.
    - Station 00880 Cottbus, 31 km north-east of the lake, in a town: 7 August 1991, 26 October 1991, 12 August 2025, 8 November 2025. No hourly rain before 1995, so rain is empty for 1991. Wind in 1991 is in whole metres per second.
    - Station 07393 Hoyerswerda, 8 km from the lake, records from 2010: 12 August 2025, 8 November 2025.
  - Surface temperatures on 8 November 2025 at 09:57 UTC (medians): lake water 9.4 °C, bare ground 10.1 °C, vegetation 9.9 °C. On 26 October 1991 at 09:20 UTC: pools in the pit 7.1 °C, bare ground 4.4 °C, vegetation 2.3 °C.
- **Weather near the lake in 1991** (`estimated-1991`, `-cold`, `-mild` in the season files), made by `scripts/estimate_weather.py` on 8 November 2026: **modelled** (a statistical estimate from observed readings).
  - Method: Cottbus's hourly reading plus the average Hoyerswerda-minus-Cottbus difference over 2010–2024, in hours with the same hour of day, within a month of the date, and the same cloud class (0–2, 3–5, 6–8 okta) and wind class (under 2, 2–4, over 4 m/s) at Cottbus (130,566 hours with both stations). Wind speed scaled by the average ratio, pressure shifted by the average difference; wind direction and cloud as at Cottbus. Fewer than 40 matching hours: drop the wind class, then the cloud class.
  - Colder and milder versions: the average of the coldest or warmest tenth of matching hours. On clear, calm October and November nights, Hoyerswerda is on average 0.4 °C warmer than Cottbus, but single nights range from 4.2 °C colder to 5.8 °C warmer, and Cottbus's own readings don't tell which.
  - Check on the 2025 days, which were left out of the learning (`data/weather-estimate-check.json`): 12 August 2025, temperature off by about 1.0 °C (dew point 1.3 °C), and the observed night low (9.7 °C) inside the cold-to-mild range (8.4 to 13.3 °C). 8 November 2025, off by about 2.5 °C: estimated night low +2.0 °C (cold version −0.8 °C), observed −1.6 °C, a night colder than 1 in 10 similar ones.
  - Hoyerswerda stands in for the area near the lake: it is on land, 8 km away, and its 2010–2024 records already include the flooded lakes nearby.
- **Roughness of each surface** in `sim.js`: typical values from the literature (for example Stull 1988, *An Introduction to Boundary Layer Meteorology*; Wieringa 1993), approximate. Water 0.0002 m, bare pit floor 0.03 m, vegetation 0.5 m (mostly pine forest and fields). The station's wind stands for land with roughness 0.1 m.
- **Starting profile of the air** in `sim.js`: **synthetic.**
  - August, 06:00: a cool layer near the ground after the night (up to 200 m), yesterday's mixed air (2 °C below the day's highest temperature) up to 1.8 km, stable air above.
  - November, 01:00: a strong cold layer near the ground after a clear, calm evening (up to 300 m), mixed air (4 °C below the day's highest temperature) up to 800 m, stable air above.
  - Moisture from the station's dew point at the start, at most 90% humidity. To be replaced with weather balloon soundings (for example from Lindenberg).
- **Simulation** in `sim.js`: **modelled, approximate.** Not a forecast or hindcast.
- Limits of the simulation:
  - It is a 2D slice, so air can't move along the lake's other direction.
  - It has no ice and no range of droplet sizes: mist and steam fog are treated as liquid droplets, though below 0 °C some could freeze as frost.
  - The lake temperature is held at its value at the satellite's pass all day. Land surface temperature follows the sun around the observed air temperature.
  - On each year's own day, the weather differs as well as the ground, so a difference between the panels can't be put down to the ground alone. On "both on the 2025 day", the 1991 ground is lined up by the vegetation temperature, and the pools in the 1991 pit keep their 26 October temperature (7.1 °C), probably too warm for 8 November.
  - One station's readings (or the estimate) drive the whole 20 km line. Neither station is at the lake, and neither can see mist over it. Cottbus is 31 km away in a town and was about 3–5 °C milder than Hoyerswerda on the night of 8 November 2025.
  - The 1991 estimate gives a typical day near the lake; one night can differ by several degrees.
  - Friction is worked out from the log wind profile over flat ground, adjusting over about 800 m after a surface change. The pit's depth, slopes and spoil heaps, which would also steer the wind and trap cold air, are not in the model. Roughness lengths are typical values, not measured here.
  - Turbulence, exchange and the steam fog check use simple formulas for neutral air; how strongly calm, layered air damps them is a rough choice.
  - Real steam fog is often only metres deep, thinner than the model's lowest layer (62 m), so it is estimated with the mixing check, not calculated by the model.
  - The left and right edges act as walls.
  - Each run starts with small random nudges, so results vary from run to run. Compare several runs.
  - Numbers like the exchange speed, evaporation factors and the dust effect are rough choices, written in `sim.js`.

What this sketch cannot show yet:
- There is no lake data yet: when each pit flooded and how big each lake is. Without it, there is no "before" and "after".
- The region warmed by about 2 °C between the 1950s and the 2020s, at stations near and far from the lakes. A shift at one station is not evidence of a lake effect unless it differs from stations farther away.
- Several stations moved over the years. Leipzig-Holzhausen moved about 2.5 km in 2004, Zeitz moved about 100 m higher in 2006, and Querfurt moved in 1983 and 2007. Each station's full history is in `data/dwd-stations.json`. A move can look like a change in the weather.
- Most stations are 9 to 45 km from the lakes. Lake effects are mostly local, so the stations may not catch them.
