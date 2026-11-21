# Wildlife atlas

GeoJSON Lines, one Feature per line, read by the **Wildlife** layer group
(`src/data/wildlife.js`). Nothing is fetched at runtime.

| File | Layer | Contents |
| --- | --- | --- |
| `whales.geojsonl` | `wildlife-whales` | 29 migration routes and individual records as lines, one detail point at each route's start, and live whale cameras and hydrophones |
| `birds.geojsonl` | `wildlife-birds` | 9 global flyways (centre lines and label points), 26 tracked species routes with a detail point each, and live bird cameras |
| `insects.geojsonl` | `wildlife-insects` | One point per country listing native and introduced bee, wasp and hornet groups (31 groups), bee and hornet diversity hotspots, and live hive and nest cameras |
| `wolves.geojsonl` | `wildlife-wolves` | One point per country listing wolves living there and wolves lost there, and live wolf cameras |
| `bears.geojsonl` | `wildlife-bears` | One point per country listing bears living there and bears lost there, and live bear cameras |

Point properties are shown as written in the selected-feature card; `name` is the
label. Route lines carry `name` and `Leg`.

Regenerate with `node scripts/build-wildlife-data.mjs [--atlas-dir DIR]`, which
reads the five atlas pages (`whale-migration-atlas.html`, `bird-flyways-atlas.html`,
`bees-wasps-hornets-atlas.html`, `wolves-of-the-world.html`,
`bears-of-the-world.html`; default directory: your home folder).

Routes are simplified corridors; ranges are country-level. Sources and licence
notes are in [DATA_SOURCES.md](../../../../DATA_SOURCES.md#wildlife-atlas-wildlife).
