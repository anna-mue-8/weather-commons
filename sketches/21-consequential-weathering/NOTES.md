# Notes

Working notes for sketch 21. Read this first. Date each entry, and move items to Done when they ship.

## Next

- A · I: maybe add DWD radar rain (RADOLAN/RADKLIM) for the same days, and NASA Worldview daily MODIS for regional clouds.
- A · II: tune the cloud simulation with Anna-Lena (rise, wind, density, framing). Maybe set the wind from an observed day, e.g. one of the 17 Sentinel-2 days. Replace the Google ground texture with an openly licensed orthophoto if a ground image is wanted.
- A · IV: the model again, with particles.
- A · III: social media posts and headlines, each with source and date.
- A · IV: read and quote the two DWD Thema des Tages pages (2018/2/5 and 2/6) and add the research on ultrafine particles. Maybe meteorological maps beneath the model.
- A · V: Altmark gas field map and geology, with a Blender model on top.
- A · VI: reflections text and a satellite time-lapse.
- B · I–III: cloud model, silver iodide and potassium iodide particle models, texts on materials and mining.
- Sources and limits: fill in as each page gets its content.

- Radar and the 'weather machine' effect (DWD Thema des Tages 2018/2/6, Niederaußem): scan RADKLIM 5-minute radar for 2015–2016 (the Sentinel-2 period) for showery days with showers starting or growing at Schwarze Pumpe, check each with station wind and weather; then a radar time-lapse (observed) for A · IV, maybe under the 3D model.

- Radar next: a 'birthplace map' of new showers (where rain cells first appear) over all cold-season shower days, Schwarze Pumpe against its surroundings; better filter days with the radar itself (scattered small cells, not fronts). Needs more radar months (about 400 MB each).
- MODIS (NASA GIBS/Worldview): collect clear days with the plume streak visible, as a wider companion to the Sentinel-2 close-ups.

## Decisions

- 2026-11-07: topic is extractive landscapes and how they already interfere with the atmosphere across vertical scales.
- 2026-11-14: the sketch becomes a visual essay, ‘consequential weathering / earthly atmospheres’, in two parts: A, extraction modifying the weather (Schwarze Pumpe); B, extracting for weather modification (cloud seeding materials). One page at a time with arrows, text left, visual centre, contents right, light with a dark switch. The earlier cloud simulation over Partwitzer See is set aside, kept privately by Anna-Lena and not linked from the site.
- 2026-11-14: research only from sources Anna-Lena provides.

## Questions

- 2026-11-23: rights to show the screen grab of the Weather Channel article and the JAXA Earth-graphy page (A · III archive); DWD terms for reusing its Thema des Tages pages.


- 2026-11-16: the A · II animation shows the Google satellite image as its ground: check whether it may be published, or re-render with an openly licensed ground image.

- 2026-11-16: the 1959 atlas map (Volk und Wissen) on A · I: is it still under copyright, and may a scan be shown on a public site? Same for the two Instagram screenshots on A · II (photos by private people: ask, blur, or quote only the words?).

- 2026-11-15: the 'smoke images' picture in the Blender model: where is it from, and may it be published? (Left out of the web copy for now.)

- 2026-11-07: how does the question connect to the TBA21 Weather Commons white paper? The paper is not in the repository; add it or its key passages to check.
- 2026-11-14: social media posts by private people: blur or leave out names and faces, or ask permission?
- 2026-11-14: should the folder be renamed to match the new title? Renaming changes the web address, so for now it stays `21-consequential-weathering`.

## Done

- 2026-11-07: started from the template; first page with the question.
- 2026-11-08: side-view cloud simulation over Partwitzer See, 1991 pit and 2025 lake (published 2026-11-08, now set aside).
- 2026-11-14: visual essay draft: start page with two tarot-like cards and a faint moving web, nine placeholder pages in parts A and B, sources and limits page, contents, arrows, keyboard and swipe, dark mode switch. Not committed yet.
- 2026-11-15: layout flipped: inverted header and footer, contents on the left (only on essay pages), text boxes on the right, start text two sizes smaller, faint wind instead of the web behind the cards, numbered page buttons in the footer after sketch 04. Not committed yet.
- 2026-11-15: dark switch removed; header and footer white with medium grey text, content black with white text; start page text box on the left. Not committed yet.
- 2026-11-15: 17 Sentinel-2 close-ups of Schwarze Pumpe, July 2015 to December 2016, with the plume or its shadow visible, in `images/schwarze-pumpe-s2/` (script `scripts/fetch_schwarze_pumpe_s2.py`; all 21 candidates and an overview sheet in `assets/schwarze-pumpe-s2/`). Not committed yet.
- 2026-11-15: start page cards replaced with Anna-Lena's card images (`images/tarot-cards/schwarze-pumpe.png` for A, `silver.png` for B), with a thin white edge so they show on the black page. Not committed yet.
- 2026-11-15: A · I shows Anna-Lena's time-lapse of the 17 Sentinel-2 frames, which can be tilted and turned by dragging or with the arrow keys (no zoom), with the Copernicus credit. Her GIF (10.6 MB, over the limit) became an animated WebP (5.5 MB); the original is in `assets/schwarze-pumpe-s2/`. Not committed yet.
- 2026-11-15: parts A and B each became one continuous scroll; text boxes on the left of their visuals, the one being read lit; arrows and page numbers removed from the footer (now a Start link and the section name); links at the end of each part. The start page is unchanged. Not committed yet.
- 2026-11-15: A · II shows Anna-Lena's Blender model with clouds simulated live from both cooling towers (three.js, `cloud-sim.js`), wind direction from her Blender scene, turn and tilt, no zoom. Web copy of the model without the Google ground texture and the smoke picture (`scripts/make_web_model.py`); original in `3D models/`, ignored by git. Not committed yet.
- 2026-11-15: back to one page at a time with arrows and page numbers; text boxes on the left with an archive box for small images under each (filled from `media/media.json`, after sketch 04); image or model on the right. Not committed yet.
- 2026-11-15: text boxes and archive boxes moved to the right of each page, visuals on the left (start page unchanged). Not committed yet.
- 2026-11-16: A · II archive: the Wikimedia Commons video of Schwarze Pumpe from the Wolkenberg viewpoint (Ubahnverleih, 2014, CC BY 3.0), with caption and credit; the archive box can now play videos. The two images in `images/Media Images/` are waiting. Not committed yet.
- 2026-11-16: text in the text boxes about 4 pt smaller (12 px). A · II archive: the video plus two Instagram screenshots, flicked with the arrows; A · I archive: the 1959 GDR economy map with Anna-Lena's watershed overlay. Archive images open large on click. Not committed yet.
- 2026-11-16: archive videos start by themselves, muted and looping, when their page shows (not with reduced motion). Not committed yet.
- 2026-11-16: first radar test (`scripts/radklim.py`; data in `assets/`, not in git; preview pictures in `assets/research/`). DWD RADKLIM 5-min radar for Dec 2017 and Feb 2018: the reader reproduces the article's shower starting at Niederaußem on 2 Feb 2018, 15:15 UTC. At Schwarze Pumpe: 2 Feb 2018 dry (the showers stayed in the west); 8 Dec 2017 a train of showers from the WSW (station wind 240–270°, 4–8 m/s; Cottbus 'Eiskörner: stark' at 12 UTC), one shower roughly doubling as it crossed the plant 10:15–10:25 UTC, which is consistent with the article but not proof. NASA Worldview/GIBS MODIS Terra, 2 Feb 2018 morning: a ~10 km white streak from the plant to the NE, matching the SW wind (Cottbus, Hoyerswerda 220–230°), likely the plume cloud seen from space.
- 2026-11-16: stations and radar compared (`scripts/shower_days.py`, `scripts/radar_compare.py`; results and pictures in `assets/research/`). The automatic stations nearby rarely report 'Schauer' and no cloud types, so showery hours were found from seven rain gauges within 33 km (rain at 1–3 gauges, with a 10-minute burst): 76 days in 2015–2016, 12 of them Oct–Apr with W wind ≥ 3 m/s. Gauges: Spremberg-Graustein (9 km downwind in W wind) is not wetter than the others in shower hours. Radar, wind-relative over the 12 days: downwind strip 7.3 % of 5-min pictures with rain, beside 7.3 / 9.0 %, upwind 6.0 %: no clear signal. 3 days looked wetter downwind (30 Mar 2015, 3 Apr 2015, 2 Feb 2016), but the radar shows large rain systems passing through, not showers starting at the plant. So far, no case of the Niederaußem effect at Schwarze Pumpe; the clearest sign of the plant in the data is the MODIS plume streak of 2 Feb 2018.
- 2026-11-16: A · III 'Weather Machines' shows a radar time-lapse (`radar-player.js`, data `images/radar/`): 8 Dec 2017 and 9 Jan 2015, rain every 5 minutes beside 'minutes of rain so far', with the plant's minutes against the typical value around it. Persistence check over 13 rainy days: the plant's total rain minutes are above the surroundings' median on 8 of 13 days (about chance); on 9 Jan 2015 its longest unbroken rain (14:25–16:10 UTC) beat 90 % of the area, though in a broad rain band. Not committed yet.
- 2026-11-16: radar 'rain now' panel in colour, light to heavy: green, yellow, blue (6 mm/h and more), with a colour key; 'minutes of rain so far' stays grey. Not committed yet.
- 2026-11-16: radar 'minutes of rain so far' in the same green-yellow-blue colours with its own key; white specks stream from the plant with the station wind (synthetic, labelled), on both panels. Not committed yet.
- 2026-11-16: wind particles drawn as small pink crosses instead of dots (colour pink chosen by Anna-Lena). Not committed yet.
- 2026-11-16: A · II shows Anna-Lena's Blender animation instead of the live 3D model (MP4 converted to WebM, 3.5 MB; ffmpeg via imageio-ffmpeg in the sketch's .venv; MP4 moved to `assets/media/`). Plays muted in a loop, click to pause. three.js no longer loaded; `cloud-sim.js` and the .glb kept. Not committed yet.
- 2026-11-16: A · II animation: autoplay set on the video itself, poster image, plays even with reduced motion (Anna-Lena's wish; click pauses), play button appears if a browser refuses. Tested: local server, reduced motion, file opened directly. Not committed yet.
- 2026-11-16: radar of both time-lapse days exported as GeoTIFFs for GIS (200 x 200 km, every 5 min, RADOLAN grid and EPSG:25833), rain-minutes maps, places.geojson, QGIS styles in the website colours (`scripts/export_radar_gis.py` -> `assets/gis/`, not in git).
- 2026-11-23: wind for 9 Jan 2015 exported for GIS: DWD 10-minute wind at Cottbus, Hoyerswerda, Doberlug-Kirchhain and Görlitz as points, direction lines and CSV, with a QGIS arrow style (`scripts/export_wind_gis.py` -> `assets/gis/wind-20150109/`, not in git).
- 2026-11-23: A · III shows the radar map of 9 Jan 2015 after Anna-Lena's QGIS project: her view and colours, Sentinel-2 true/false colour switch, white cross, faint 10 km grid; wind from four DWD stations interpolated, as streaks (after sketch 04) and a white indicator bottom left; black particles from the plant on that wind. 8 Dec 2017 left out for now. Not committed yet.
- 2026-11-23: A · III map: label 'Schwarze Pumpe' removed; a legend over the map, top left, after sketch 04 (small type, 7 px swatches, raised numbers pointing to the numbered sources under the map). Not committed yet.
- 2026-11-23: A · III map: about three times more, smaller particles; zoom (wheel, pinch, − +), drag to move, tilt slider, reset; speed ¼× ½× 1×; drawn on one canvas (the image and radar prepared off screen). Legends now open from a Legend button at the right of the footer, on pages that have one (`.page-legend`); the map is larger and its credit is one line. Not committed yet.
- 2026-11-23: contents moved off the page into a pop-up from a Page Navigation button, bottom right of the footer (all pages), so visuals have more room. A · III: legend permanent at the bottom of the right column; false colour default; wind streaks fainter with longer tails; zoom and tilt by mouse only (scroll, drag, right-drag or Shift-drag; two fingers on a phone) with one Reset. Not committed yet.
- 2026-11-23: A · III: timeline after sketch 04 (inverted): Run, 15-minute ticks, hour labels, the time large on the right; Anna-Lena's four phases as thick marks with numbers, the current phase's text below, and ← → under Run to jump between them. Map fills the left area; speed, image and Reset in a column beside the legend; credit line under the map removed (sources are in the legend). Not committed yet.
- 2026-11-23: A · III: legend moved onto the map, top left (sources and help folded under 'Sources and how to use'); speed, image and Reset view on the map, lower left, above the wind indicator. The map fills the whole left area and opens zoomed in on Anna-Lena's frame (`START` in radar-map.js); zooming out shows the whole map; Reset view returns to the first view. Not committed yet.
- 2026-11-23: A · III: white dashed boxes where the rain meets the wind and particles, from Anna-Lena's marks at 13:40, 13:45, 13:50, 16:45 and 17:45 (`FOCUS` in radar-map.js), in the legend as interpretive. Not committed yet.
- 2026-11-23: A · III: ¼× is the default speed; particles smaller; dashed boxes now computed for every frame from 13:40 where radar rain lies in the particles' path (derived), replacing the five hand-placed ones. Not committed yet.
- 2026-11-23: A · III dashed boxes: each 5-minute frame its own box, changing with the radar, no smoothing or blending. Not committed yet.
- 2026-11-23: A · III: about three times more, smaller particles (they stand for UFP); archive holds screen grabs of the Weather Channel article (2019) and the two DWD Thema des Tages pages (2018), each with a short summary, the image linking to the article. Not committed yet.
- 2026-11-23: A · III archive: JAXA Earth-graphy article on the July 2021 floods in Germany and Belgium added (screen grab, summary, links to the article). Not committed yet.
- 2026-11-23: Sources and limits page filled with all sources used so far, page by page, each labelled observed, derived, cartographic, quoted, synthetic or interpretive, with links and licences. Not committed yet.
