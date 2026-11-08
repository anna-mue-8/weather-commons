# Notes

Working notes for sketch 21. Read this first. Date each entry, and move items to Done when they ship.

## Next

- Simulation: replace the synthetic starting air profiles with real weather balloon soundings (Lindenberg, 12 August and 8 November 2025).
- Simulation: run each case many times and show the spread, so 1991 and 2025 can be compared fairly.
- Simulation: find an observation of the November mist over the lake (webcams, visibility at a nearer station, a satellite fog product) to check the model.
- Simulation: maybe a third day, a warm, humid summer day with showers (for example 28 August 2025; clear Landsat frame on 19 August).
- Simulation: the pit's shape (depth, slopes, spoil heaps) from a 1991 elevation source, if one exists. In a deep pit cold air pools at night and the wind is sheltered, which the flat model can't show.
- Weather estimate: look for measurements nearer the lake (LMBV, LfULG Sachsen, Lausitz research stations) to check the 1991 estimate and the 2025 steam fog.

- Choose one or a few open-pit mine sites flooded with river or groundwater, and add first sources.
- Replace the synthetic wind placeholder with a first model of how the pits interfere with the atmosphere across vertical scales.
- Refine the question (Anna-Lena is drafting).
- Add lake data: flooding dates per lake (LMBV) and water area over time (JRC Global Surface Water, from 1984).
- First chart: near-lake versus farther stations, before and after flooding.

## Decisions

- 2026-11-07: topic is extractive open-pit mines, especially pits flooded with river or groundwater, and how they already interfere with the atmosphere across vertical scales.

## Questions

- 2026-11-07: how does the question connect to the TBA21 Weather Commons white paper? The paper is not in the repository; add it or its key passages to check.
- 2026-11-08: which stations count as "near a lake" and which as "reference"? This depends on the lakes chosen and their flooding dates.
- 2026-11-08: there are few long-running stations close to the Lusatian lakes (Schipkau-Klettwitz from 1996, Hoyerswerda from 2010). Is satellite surface temperature needed there?
- 2026-11-08: the Landsat frames are 101 MB, ignored by git. Commit small web versions (JPG) for the page, and move the GeoTIFFs to Box with `scripts/assets.mjs`, or rely on re-running the script?

- 2026-11-08: the November 1991 pit uses a frame from 26 October; its pools are held at 7.1 °C, probably too warm for 8 November. Is there a closer autumn frame, or should the pools follow the air?

- 2026-11-08: the 1991 weather near the lake is now estimated from Cottbus (decided with Anna-Lena), with colder and milder versions because single nights vary by several degrees. Open: is there a 1991 autumn day colder and moister than 26 October that still has a clear Landsat frame? And the roughness lengths are textbook values; are there measured ones for Lusatian pine forest or pit floors?

## Done

- 2026-11-07: started from the template.
- 2026-11-07: first page: draft question, Sources and limits filled in, README Event and Run address.
- 2026-11-07: Anna-Lena's question and the open-pit mining plan on the page, README and notes.
- 2026-11-08: first side-view cloud simulation over Partwitzer See (`sim.js`), 1991 pit versus 2025 lake on the weather of 12 August 2025, with moisture, dust and wind controls. Not committed yet. Tested without a browser by running sim.js in Node with fake controls; `__sim` in the browser console shows the model's numbers.
- 2026-11-08: 15 Landsat frames (true colour and surface temperature), 1985–2025, for the Lusatian lake district box, in `assets/landsat/` (script: `scripts/fetch_landsat.py`). Not committed yet.
- 2026-11-08: friction and turbulence: roughness for water, bare pit floor and vegetation; wind near the ground from the log wind profile with rising and sinking air where it changes; turbulence from friction added to turbulence from heating; exchange of heat and moisture depending on roughness and wind; steam fog check over water. New curves under each panel: turbulence near the ground, air rising or sinking at 200 m. 1991 weather now estimated for the area near the lake from Cottbus (`scripts/estimate_weather.py`), with colder and milder versions. Not committed yet.
- 2026-11-08: 1991 and 2025 side by side, running at the same time with the same random nudges. Each year now has its own weather (DWD Cottbus, hourly, on the Landsat days 7 August and 26 October 1991, 12 August and 8 November 2025), or both on the 2025 day at Hoyerswerda. Inputs now one file per season (`data/slice-partwitz-summer.json`, `-autumn.json`). Finding: on Cottbus weather the 2025 lake makes no mist, because Cottbus stayed above freezing that night. Not committed yet.
- 2026-11-08: second simulated day, 8 November 2025 (cold, calm, clear), with Landsat frames of 8 November 2025 and 26 October 1991 (`scripts/fetch_autumn.py`) and that day's hourly weather. Day choice on the page. Model: dew and frost on cold ground, much weaker mixing in calm, layered air, land heating by the height of the sun. Result: thin mist over the lake before sunrise in 2025, none over the 1991 pit. Not committed yet.
- 2026-11-08: DWD daily station records for 12 stations around the Central German and Lusatian lakes, as monthly tables in `data/` (script: `scripts/fetch_dwd.py`).
