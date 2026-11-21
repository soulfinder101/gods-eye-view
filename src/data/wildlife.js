import { createLocalGeoJsonLayer } from './localGeojsonCore.js';
import { WILDLIFE_DATA_URLS } from '../sources/wildlifeData.js';

/** Appearance of each bundled wildlife layer, in panel order. */
const WILDLIFE_LAYERS = Object.freeze([
  {
    id: 'wildlife-whales',
    name: 'Whale Migration',
    color: '#3fb8ff',
    icon: '◗',
    labelMax: 60,
  },
  {
    id: 'wildlife-birds',
    name: 'Bird Migration',
    color: '#7cdb5c',
    icon: '⋎',
    labelMax: 60,
  },
  {
    id: 'wildlife-insects',
    name: 'Bees, Wasps & Hornets',
    color: '#ffc21a',
    icon: '⬢',
    labelMax: 80,
  },
  {
    id: 'wildlife-wolves',
    name: 'Wolves',
    color: '#c39bff',
    icon: '◆',
    labelMax: 80,
  },
  {
    id: 'wildlife-bears',
    name: 'Bears',
    color: '#ff8a3d',
    icon: '●',
    labelMax: 80,
  },
]);

/**
 * Create fresh wildlife layers without starting or loading them.
 * @param {object} services Caller-owned context, overlay and render operations.
 * @returns {object[]} Whales, birds, bees/wasps/hornets, wolves, then bears.
 */
export function createWildlifeLayers(services) {
  return WILDLIFE_LAYERS.map(({ id, name, color, icon, labelMax }) =>
    createLocalGeoJsonLayer(
      {
        id,
        url: WILDLIFE_DATA_URLS[id],
        name,
        color,
        icon,
        source: 'Wildlife atlas', // i18n-ignore: data source tag, as 'Local' and 'USACE' are
        labels: true,
        labelMax,
        labelGridPx: 150,
      },
      services,
    ),
  );
}
