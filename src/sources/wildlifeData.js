/**
 * Bundled wildlife layers: migration routes (whales, birds) and range
 * summaries (bees, wasps and hornets; wolves; bears) as GeoJSON Lines.
 * Each file holds route lines, clickable points with the record's details,
 * and the locations of public live cameras.
 */

// Resolved by Vite in builds and relative to this module in other consumers,
// when read, so importing this module never needs a module URL.
export const WILDLIFE_DATA_URLS = Object.freeze({
  get 'wildlife-whales'() {
    return new URL(
      '../data/local_data/wildlife/whales.geojsonl',
      import.meta.url,
    ).href;
  },
  get 'wildlife-birds'() {
    return new URL(
      '../data/local_data/wildlife/birds.geojsonl',
      import.meta.url,
    ).href;
  },
  get 'wildlife-insects'() {
    return new URL(
      '../data/local_data/wildlife/insects.geojsonl',
      import.meta.url,
    ).href;
  },
  get 'wildlife-wolves'() {
    return new URL(
      '../data/local_data/wildlife/wolves.geojsonl',
      import.meta.url,
    ).href;
  },
  get 'wildlife-bears'() {
    return new URL(
      '../data/local_data/wildlife/bears.geojsonl',
      import.meta.url,
    ).href;
  },
});

/** Stable ids of the wildlife layers, in panel order. */
export const WILDLIFE_LAYER_IDS = Object.freeze(
  Object.keys(WILDLIFE_DATA_URLS),
);
