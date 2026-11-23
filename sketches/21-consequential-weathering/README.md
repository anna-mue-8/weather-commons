# 21 · consequential weathering / earthly atmospheres

Author: Anna-Lena Mueller · Started: 2026-11-07 · Status: sketch · Stack: static HTML + JS

A visual essay on who is already interfering with the weather at large scales. In part A, extraction modifies the weather: the lignite power station Schwarze Pumpe in Lusatia, its ‘cloud factory’ controversy, its invisible particles and its abandoned carbon storage. In part B, extraction serves weather modification: cloud seeding and the minerals it needs. The essay plays with the earthly cosmologies of weather modification, the almost magical or conspiratorial qualities people ascribe to it, and the unpredictable possibilities that emerge once entanglements are drawn.

## Run

Online, once published: https://anna-mue-8.github.io/weather-commons/21-consequential-weathering/

On your computer:

```bash
cd sketches/21-consequential-weathering
python -m http.server 8000
```

Then open http://localhost:8000.

## 1. Event

Working question (interpretive, a draft): When we ask ‘Who has the right to control and change the weather?’, we should also ask ‘Who is already interfering with, and in, the weather at large scales?’ Can we really achieve and talk about a weather commons, if all systems it is entangled with are extracted and manipulated across scales, and if weather modification itself depends on geological extraction?

## The essay

One page at a time, not a scroll. The footer has arrows and a numbered button for each page, as in sketch 04 (without its timeline); the keyboard's arrow keys and a swipe also flip pages. The contents open from the Page Navigation button at the right of the footer. On each page the image or model is on the left, and the text box is on the right with an archive box for small images under it (on the start page, the text box is on the left). Header and footer are white with medium grey text; the content is black with white text. Each page has its own address (`#a3`), so it can be linked. A page can have a legend (a `<div class="page-legend">` in its section), shown at the bottom of the right column.

**Adding small images (the archive box).** Put the image in `media/` (a JPG or PNG, about 1000 px wide is plenty) and add an entry to `media/media.json`. Each entry names its page; a page with several entries gets ← → arrows in its box. A page with none shows an empty box, "Images to come".

```json
[
  {
    "page": "a2",
    "type": "photo",
    "src": "media/a2-instagram-cloud-factory.jpg",
    "caption": "What the image shows.",
    "kind": "quoted",
    "credit": "Who made it, or the account or outlet",
    "date": "2019-06-01",
    "licence": "Its licence, or 'quoted for critique'",
    "source": "https://… where it was found"
  },
  {
    "page": "a2",
    "type": "clipping",
    "headline": "A headline, as text",
    "outlet": "Newspaper",
    "date": "2019-06-01",
    "kind": "quoted",
    "source": "https://…"
  }
]
```

For a video, use `"type": "video"` and a `.webm` file in `src`; it plays muted with controls. `licence_url` makes the licence a link, and `changes` says whether the item was changed (CC licences ask for both). `kind` says what the item is (observed, quoted, cartographic, modelled, interpretive) and shows in its credit line.

- **Start**: two cards like tarot cards, one per part, over a faint wind, with the question in a box on the left.
- **A · Extraction modifying the weather** (case study: Schwarze Pumpe, Niederlausitz)
  - I. Schwarze Pumpe from above: satellite image, clouds from the cooling towers.
  - II. Cloud factory: 3D model (Blender) of the power station with clouds from the cooling towers.
  - III. ‘Cloud factories’: social media posts and headlines, the controversy and its ‘debunking’.
  - IV. Invisible particles: the model again, showing ultrafine particles; maybe meteorological maps beneath.
  - V. Carbon underground: carbon capture and storage, the Altmark gas field as a map with a 3D model of its geology on top.
  - VI. Reflections: text, with a satellite time-lapse of clouds.
- **B · Extracting for weather modification** (cloud seeding in general)
  - I. Seeding a cloud: 3D cloud, the minerals and the process.
  - II. Silver iodide: 3D particle model; how it is extracted and where it is mined.
  - III. Potassium iodide: the same.
- **Sources and limits**

The start cards are final; the other images and models are placeholders for now. The files: `index.html` (the pages, one `<section>` each), `essay.css` (the layout), `essay.js` (flipping pages, contents, the archive boxes, the tilting time-lapse, the wind behind the start cards), `cloud-sim.js` (the earlier live 3D model, not shown now), `radar-map.js` (A · III, the radar map), `radar-player.js` (the earlier radar player, not shown now).

Images and models will go in `images/` and `models/` in this folder. Blender models can be exported as `.glb` for the web (keep each under 10 MB; `.blend` files go to Box, not git).

## Sources and limits

- The question and the essay: interpretive. A working draft.
- A · IV: Deutscher Wetterdienst, Thema des Tages, 2018, https://www.dwd.de/DE/wetter/thema_des_tages/2018/2/5.html and https://www.dwd.de/DE/wetter/thema_des_tages/2018/2/6.html. To read and quote.
- A · IV: research on coal power stations, ultrafine particles and weather. To add.
- A · I: Kraftwerk Schwarze Pumpe from above, 17 days from July 2015 to December 2016: observed. Copernicus Sentinel-2 Level-2A (ESA), true colour, 10 m pixels, a 10 × 10 km square around 51.5371° N, 14.3533° E, via Microsoft Planetary Computer, downloaded 2026-11-15 (`scripts/fetch_schwarze_pumpe_s2.py`). Contains modified Copernicus Sentinel data 2015–2016 (free and open). Chosen by eye from the 21 images covering the site with under 50 % cloud over the tile, for a visible plume or plume shadow; list and details in `images/schwarze-pumpe-s2/frames.json`. On the page they play as one time-lapse, `images/schwarze-pumpe-s2/schwarze-pumpe-clouds.webp`: Anna-Lena Mueller compiled the 17 frames into a GIF with the date on each frame and a red box around the cooling towers (the box and dates are added, interpretive), converted to animated WebP (quality 88, 1 s a frame) to stay under the 10 MB file limit; the original GIF is kept in `assets/schwarze-pumpe-s2/` (not in git). Viewers can tilt and turn it; it does not zoom. Limits: Sentinel-2 began in June 2015 and passes about every 10 days at 10:00–10:25 UTC, so the images show late mornings only; whether a cloud near the towers formed from the plume can't be told from one picture.
- A · II: 3D animation of Kraftwerk Schwarze Pumpe with clouds from the cooling towers, by Anna-Lena Mueller, made in Blender: interpretive. Converted from her MP4 (1080 × 1080, 24 fps, 31 s; the original is in `assets/media/`, not in git, because MP4 files stay out of the repository and it is 12 MB) to WebM VP9 with ffmpeg (`media/a2-cloud-animation-schwarze-pumpe.webm`, 3.5 MB), otherwise unchanged; a still frame at 6 s is its poster image (`media/a2-cloud-animation-schwarze-pumpe-poster.jpg`). Its ground is a Google satellite image: Google's terms generally do not allow such imagery to be republished, so its use on the public site is to check, or the animation re-rendered on an openly licensed image (e.g. Sentinel-2 or an open orthophoto). The earlier live version (three.js model and cloud simulation, `cloud-sim.js`, `models/schwarze-pumpe.glb`, `scripts/make_web_model.py`) is kept in the folder but no longer shown.
- A · I archive: map "Deutsche Demokratische Republik: Wirtschaft", from a 1959 GDR atlas (Anna-Lena Mueller's grandfather's copy), published by Volk und Wissen Volkseigener Verlag Berlin, 1959: cartographic. Overlaid by Anna-Lena Mueller, 2026, with a diagram of the Elbe watershed (thick black line) and a pink box marking Schwarze Pumpe in the lignite field: interpretive. Scan reduced to 1400 px wide JPG for the page (`media/a1-gdr-economy-1959-elbe-watershed.jpg`); the full scan is in `assets/media/` (not in git, 15 MB). Rights to the 1959 map: to check.
- A · II archive: two Instagram posts, as screenshots: blitz.kaiser, 20 June 2025, and felix89_dd ("Wolken-Produktionsstätte Schwarze Pumpe"), 12 October 2020. Quoted. Credits and permission: to add.
- A · II archive: video of Kraftwerk Schwarze Pumpe filmed from the Wolkenberg viewpoint, 30 August 2014, by Ubahnverleih (own work), Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Kraftwerk_Schwarze_Pumpe_-_Video.webm. Licence CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Observed. Not changed, only renamed: `media/a2-kraftwerk-schwarze-pumpe-wolkenberg-2014.webm`. Downloaded by Anna-Lena Mueller, 2026-11-16.
- A · III radar map, 9 January 2015, 13:00–18:00 UTC, after Anna-Lena Mueller's QGIS project `assets/gis/Radar GIS file.qgz` (same view in ETRS89 / UTM 33N, same layer colours, with a legend after sketch 04's in the right column; false colour by default; zoom (scroll, pinch), move (drag), tilt (right-drag or Shift-drag), one Reset, and ¼× / ½× / 1× speed; `radar-map.js`, data `images/radar-map/` made with `scripts/make_radar_map.py`).
  - Rain: observed. DWD RADKLIM (radar climatology v2017.002, product YW, rain every 5 minutes on a 1 km grid), opendata.dwd.de, downloaded 2026-11-16, reprojected to the map's 1 km UTM grid (nearest neighbour). Datenbasis: Deutscher Wetterdienst, CC BY 4.0. Colours from Anna-Lena's QGIS style (`assets/gis/style-rain-mm-per-5min.qml`).
  - Wind: observed at four DWD stations (Cottbus 00880, Hoyerswerda 07393, Doberlug-Kirchhain 01001, Görlitz 01684), 10-minute mean speed and direction, 13:00–18:00 UTC, CC BY 4.0. Between stations: derived, by inverse-distance weighting of the four stations (1 / distance²) and linear blending between the 10-minute values. Four stations cannot show local gusts or eddies; far from them the field is a guess. Drawn as streaks after sketch 04's currents, and as a wind indicator for the plant's position.
  - Black particles from the plant: synthetic. They are carried by the interpolated wind and spread sideways by a set amount; they show where air from the cooling towers would drift, not a measured plume.
  - Timeline marks 1–4 (13:00–13:35 before the rain crosses the plant; 13:40–16:45 downwind, the rain becomes stronger; 16:50–17:40 the wind turns and the rain stays in line with the plume's direction; 17:45–18:00 the rain dies down but lingers in the plume's streak): Anna-Lena Mueller's reading of the radar against the simulated particles. Interpretive; set in `PHASES` at the top of `radar-map.js`. From 13:40 a white dashed box in every 5-minute frame frames the radar rain lying in the path of the simulated particles (traced on the interpolated wind; without rain in that path, the plume's first 25 km). Derived, a guide for the eye (`computeFocus` in `radar-map.js`).
  - Ground: Copernicus Sentinel-2 L2A, true and false colour, 29 September 2026 (Copernicus Browser), coloured with the stretch saved in the QGIS project. Not the day of the radar. Contains modified Copernicus Sentinel data 2026.
  - Analysis behind the choice of day (`scripts/shower_days.py`, `scripts/radar_compare.py`): on 9 January 2015 rain fell at the plant without a break from 14:25 to 16:10 UTC, longer than at 90 % of the area around it; over 12 cold-season shower days, rain downwind of the plant was not more frequent than beside it. The day shows a possibility, not a proven effect.
  - Earlier two-panel player with 8 December 2017 (`radar-player.js`, `images/radar/`) kept in the folder, not shown.
- A · III archive: screen grabs (top of each page, taken 2026-11-23; quoted, linking to the article): Pam Wright, 'Coal-Fired Power Plants Can Change Rainfall Patterns, 15-Year Study Says', The Weather Channel, 13 March 2019 (the Weather Channel image was darkened by a cookie notice and brightened again); Markus Übel, 'Kohlekraftwerke – kleine „Wettermaschinen“' parts 1 and 2, Deutscher Wetterdienst, Thema des Tages, 5 and 6 February 2018. Also JAXA Earth Observation Research Center, 'The floods caused by heavy rainfall in Germany and Belgium – increase of heavy rainfall under climate change', JAXA Earth-graphy, 28 September 2021 (to check: JAXA's site policy and media usage guidelines). Summaries by the sketch, paraphrased. To check: whether screen grabs of the Weather Channel page may be shown (DWD content is generally free to reuse with credit, to confirm).
- A · VI: satellite images. To add: satellite, date, licence.
- A · III: social media posts and headlines. To add: source and date for each.
- A · V: map and geology of the Altmark gas field. To add.
- B · I–III: cloud seeding materials and where they are mined. To add.
- 3D models: made by Anna-Lena Mueller in Blender. Interpretive.
- Start page: the two cards (`images/tarot-cards/`) are by Anna-Lena Mueller. Interpretive. The wind behind them is synthetic, not data.

What this essay cannot show: still to write.
