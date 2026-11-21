#!/usr/bin/env node
/**
 * Build src/data/local_data/wildlife/*.geojsonl from the five wildlife atlas
 * pages (standalone HTML files that hold the route, range and camera data).
 *
 * Inputs (all in --atlas-dir, default: your home directory):
 *   whale-migration-atlas.html   bird-flyways-atlas.html
 *   bees-wasps-hornets-atlas.html   wolves-of-the-world.html
 *   bears-of-the-world.html (also supplies the embedded world-atlas 110m
 *   country topology, Natural Earth public domain, used for country points)
 *
 * Each atlas keeps its data in plain constants in its last inline <script>;
 * only that data block is evaluated, never the page's rendering code.
 *
 * Output (deterministic for the same inputs), one Feature per line:
 *   route lines, a detail point at each route start, one point per country
 *   summarising ranges, and live-camera points with their stream links.
 *
 * Usage:
 *   node scripts/build-wildlife-data.mjs [--atlas-dir DIR] [--out DIR]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
}
const HOME = flag('--atlas-dir', os.homedir());
const OUT = flag('--out', path.join(root, 'src/data/local_data/wildlife'));
fs.mkdirSync(OUT, { recursive: true });

function readScripts(file) {
  const html = fs.readFileSync(file, 'utf8');
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

// The last inline <script> of each atlas holds its data; evaluate only the data block.
function dataBlock(file, from, to, names) {
  const scripts = readScripts(file);
  const js = scripts[scripts.length - 1];
  const a = js.indexOf(from);
  const b = js.indexOf(to);
  if (a < 0 || b < 0) throw new Error(`markers not found in ${file}`);
  return new Function(
    `const addEventListener = () => {};\n${js.slice(a, b)}; return { ${names.join(', ')} };`,
  )();
}

// ---- Country representative points (largest ring area centroid, with overrides) ----
// Minimal TopoJSON decoder for the quantized world-atlas topology.
function topologyFeatures(topology, object) {
  const { scale, translate } = topology.transform;
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
  const ring = (indexes) => {
    const points = [];
    for (const i of indexes) {
      const arc = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      points.push(...(points.length ? arc.slice(1) : arc));
    }
    return points;
  };
  return topology.objects[object].geometries.map((g) => ({
    properties: g.properties,
    geometry: {
      type: g.type,
      coordinates:
        g.type === 'Polygon'
          ? g.arcs.map(ring)
          : g.type === 'MultiPolygon'
            ? g.arcs.map((p) => p.map(ring))
            : [],
    },
  }));
}
const worldScript = readScripts(
  path.join(HOME, 'bears-of-the-world.html'),
).find((s) => s.trim().startsWith('const WORLD ='));
if (!worldScript)
  throw new Error('bears-of-the-world.html has no WORLD topology');
const world = new Function(`${worldScript}; return WORLD;`)();
const countries = topologyFeatures(world, 'countries').filter(
  (f) => f.geometry.coordinates.length,
);
const OVERRIDE = {
  'United States of America': [-98.5, 39.5],
  Canada: [-106, 57],
  Russia: [96, 62],
  Norway: [9, 61.5],
  France: [2.5, 46.6],
  Indonesia: [117, -1],
  Malaysia: [102, 4],
  Chile: [-71, -33],
  Greenland: [-41, 72],
  'New Zealand': [172.5, -42],
  Japan: [138.5, 36.5],
  Fiji: [178, -17.8],
};
function ringCentroid(ring) {
  let a = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i],
      [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    x += (x0 + x1) * f;
    y += (y0 + y1) * f;
  }
  return a === 0
    ? null
    : { area: Math.abs(a / 2), c: [x / (3 * a), y / (3 * a)] };
}
const CENTER = {};
for (const f of countries) {
  const name = f.properties.name;
  if (OVERRIDE[name]) {
    CENTER[name] = OVERRIDE[name];
    continue;
  }
  const polys =
    f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates;
  let best = null;
  for (const p of polys) {
    const r = ringCentroid(p[0]);
    if (r && (!best || r.area > best.area)) best = r;
  }
  if (best) CENTER[name] = best.c.map((v) => Number(v.toFixed(3)));
}

// ---- Helpers ----
const round = (c) => [Number(c[0].toFixed(3)), Number(c[1].toFixed(3))];
const point = (coords, properties) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: round(coords) },
  properties,
});
const line = (coords, properties) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: coords.map(round) },
  properties,
});
function write(name, features) {
  fs.writeFileSync(
    path.join(OUT, `${name}.geojsonl`),
    features.map((f) => JSON.stringify(f)).join('\n') + '\n',
  );
  const pts = features.filter((f) => f.geometry.type === 'Point').length;
  console.log(
    `${name}: ${features.length} features (${pts} points, ${features.length - pts} lines)`,
  );
}
// Cameras sharing a location become one marker that lists each stream.
function camFeatures(cams, where, kindLabel) {
  const byLoc = new Map();
  for (const c of cams) {
    const loc = where[c.t];
    if (!loc) continue;
    const key = loc.c.join();
    if (!byLoc.has(key)) byLoc.set(key, { loc, cams: [] });
    byLoc.get(key).cams.push(c);
  }
  return [...byLoc.values()].map(({ loc, cams: list }) =>
    point(loc.c, {
      name: `Live: ${list[0].t}${list.length > 1 ? ` +${list.length - 1}` : ''}`,
      Type: kindLabel,
      Location: loc.label,
      ...(loc.approx ? { 'Map position': 'Approximate' } : {}),
      'Live video': list.map((c) => `${c.t}: ${c.u}`).join(' | '),
      About: list.map((c) => c.p).join(' '),
    }),
  );
}
const join = (xs) => (xs.length ? xs.join(', ') : undefined);
const clean = (o) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== ''),
  );

// ---- Whales ----
{
  const { SPECIES, ROUTES, CAMS, CONF } = dataBlock(
    `${HOME}/whale-migration-atlas.html`,
    'const SPECIES',
    'const OTHERS',
    ['SPECIES', 'ROUTES', 'CAMS', 'CONF'],
  );
  const feats = [];
  for (const r of ROUTES) {
    const label = `${SPECIES[r.sp].label} whale · ${r.name}`;
    for (const p of r.p)
      feats.push(line(p, { name: label, Leg: 'Migration route' }));
    for (const p of r.d || [])
      feats.push(
        line(p, {
          name: label,
          Leg:
            r.conf === 'record'
              ? 'Individual record (track unknown)'
              : 'Partial or historical route',
        }),
      );
    const start = (r.p[0] || r.d[0])[0];
    feats.push(
      point(
        start,
        clean({
          name: label,
          Species: `${SPECIES[r.sp].label} whale (${SPECIES[r.sp].latin})`,
          Population: r.pop,
          [r.conf === 'record' ? 'First sighting' : 'Feeding / summer ground']:
            r.a,
          [r.conf === 'record' ? 'Later sighting' : 'Breeding / winter ground']:
            r.b,
          'Distance (km)': r.km,
          Timing: r.when,
          Abundance: r.abund,
          Status: r.status,
          Confidence: CONF[r.conf],
          Notes: r.note,
        }),
      ),
    );
  }
  const WHERE = {
    'Hawaiian Islands humpback cam': {
      c: [-156.45, 20.75],
      label: 'Maui, Hawaiʻi',
    },
    'Langley Whale Cam': {
      c: [-122.41, 48.04],
      label: 'Langley, Whidbey Island, Washington',
    },
    'Depoe Bay whale cam': { c: [-124.06, 44.81], label: 'Depoe Bay, Oregon' },
    'East Passage live webcam': {
      c: [-122.37, 47.47],
      label: 'Burien, Washington',
    },
    'Lime Kiln Point cam & hydrophone': {
      c: [-123.152, 48.516],
      label: 'Lime Kiln Point, San Juan Island',
    },
    'Orcasound live hydrophones': {
      c: [-123.18, 48.56],
      label: 'Haro Strait, Washington',
      approx: true,
    },
    'MBARI deep-sea hydrophone': {
      c: [-122.19, 36.71],
      label: 'Monterey Bay, California (900 m deep)',
    },
    'Raincoast whale livestream': {
      c: [-123.2, 48.77],
      label: 'Southern Gulf Islands, British Columbia',
      approx: true,
    },
    'Beluga Cam': { c: [-94.2, 58.77], label: 'Churchill River, Manitoba' },
  };
  feats.push(...camFeatures(CAMS, WHERE, 'Live whale camera or hydrophone'));
  write('whales', feats);
}

// ---- Birds ----
{
  const { GROUPS, FLYWAYS, ROUTES, CAMS } = dataBlock(
    `${HOME}/bird-flyways-atlas.html`,
    'const GROUPS',
    'const $ =',
    ['GROUPS', 'FLYWAYS', 'ROUTES', 'CAMS'],
  );
  const feats = [];
  for (const f of FLYWAYS) {
    feats.push(
      line(f.p, { name: f.name, Leg: 'Flyway corridor (centre line)' }),
    );
    feats.push(
      point(f.lab, {
        name: f.name,
        Type: 'Global flyway',
        Scale: f.spp,
        About: f.d,
      }),
    );
  }
  for (const r of ROUTES) {
    for (const p of r.p)
      feats.push(line(p, { name: r.name, Leg: 'Outbound migration' }));
    for (const p of r.d || [])
      feats.push(line(p, { name: r.name, Leg: 'Return migration' }));
    feats.push(
      point(r.p[0][0], {
        name: r.name,
        Species: `${r.name} (${r.latin})`,
        Group: GROUPS[r.g].label,
        'Breeding ground': r.a,
        'Wintering ground': r.b,
        'Distance (km)': r.km,
        Timing: r.when,
        Flyway: r.fly,
        Notes: r.note,
      }),
    );
  }
  const WHERE = {
    'Cornell Lab Bird Cams': {
      c: [-76.45, 42.48],
      label: 'Cornell Lab of Ornithology, Ithaca, New York',
    },
    'Sandhill Crane Cam': {
      c: [-109.71, 31.56],
      label: 'Whitewater Draw, Arizona',
    },
    'Rowe Sanctuary Crane Cam': {
      c: [-98.89, 40.67],
      label: 'Platte River, Nebraska',
    },
    'Seabird Institute live cams': {
      c: [-69.38, 43.86],
      label: 'Maine seabird islands',
      approx: true,
    },
    'White stork nest': {
      c: [15.5, 49.8],
      label: 'Czech Republic',
      approx: true,
    },
    'White stork nest, Szczecin': {
      c: [14.55, 53.43],
      label: 'Szczecin, Poland',
    },
  };
  feats.push(...camFeatures(CAMS, WHERE, 'Live bird camera'));
  write('birds', feats);
}

// ---- Bees, wasps & hornets ----
{
  const { R, GROUPS, TAXA, HOT, CAMS } = dataBlock(
    `${HOME}/bees-wasps-hornets-atlas.html`,
    'const R =',
    '// ---------- Range resolution',
    ['R', 'GROUPS', 'TAXA', 'HOT', 'CAMS'],
  );
  const expand = (list) => {
    const out = new Set();
    list
      .filter((x) => !x.startsWith('-'))
      .forEach((x) =>
        x.startsWith('@')
          ? R[x.slice(1)].forEach((c) => out.add(c))
          : out.add(x),
      );
    list
      .filter((x) => x.startsWith('-'))
      .forEach((x) => out.delete(x.slice(1)));
    return out;
  };
  TAXA.forEach((t) => {
    t.N = expand(t.n);
    t.I = expand(t.i || []);
    t.N.forEach((c) => t.I.delete(c));
  });
  const feats = [];
  for (const [name, c] of Object.entries(CENTER)) {
    const native = (g) =>
      TAXA.filter((t) => t.g === g && t.N.has(name)).map((t) => t.name);
    const intro = TAXA.filter((t) => t.I.has(name)).map((t) => t.name);
    const props = clean({
      name: `${name} · bees, wasps & hornets`,
      'Native bees': join(native('bees')),
      'Native wasps': join(native('wasps')),
      'Native hornets': join(native('hornets')),
      'Introduced or invasive': join(intro),
    });
    if (Object.keys(props).length > 1) feats.push(point(c, props));
  }
  for (const h of HOT)
    feats.push(
      point(h.c, {
        name: `Hotspot: ${h.h}`,
        Type: h.k === 7 ? 'Hornet diversity hotspot' : 'Bee diversity hotspot',
        About: h.p,
      }),
    );
  const WHERE = {
    'Beehive livestream': {
      c: [16.37, 48.21],
      label: 'AGES, Vienna, Austria',
      approx: true,
    },
    'Legislature beehive cam': {
      c: [-79.39, 43.66],
      label: "Queen's Park, Toronto",
    },
    'NJ BeeCam': {
      c: [-74.76, 40.22],
      label: 'Trenton, New Jersey',
      approx: true,
    },
    BeeTV: {
      c: [-84.48, 42.72],
      label: 'Michigan State University, East Lansing',
    },
    'Honeybee colonies in Vorarlberg': {
      c: [9.75, 47.25],
      label: 'Vorarlberg, Austria',
      approx: true,
    },
    'Busy bees at work': { c: [4.47, 50.5], label: 'Belgium', approx: true },
    'Bees landing zone': {
      c: [11.5, 48.8],
      label: 'Bavaria, Germany',
      approx: true,
    },
    'European hornet nest': {
      c: [-3.7, 40.42],
      label: 'Near Madrid, Spain',
      approx: true,
    },
  };
  feats.push(...camFeatures(CAMS, WHERE, 'Live hive or nest camera'));
  write('insects', feats);
}

// ---- Wolves and bears share the range format ----
function rangeLayer(
  file,
  from,
  to,
  extraNames,
  noun,
  where,
  kindLabel,
  skipGroup,
) {
  const { TAXA, CAMS } = dataBlock(file, from, to, [
    'TAXA',
    'CAMS',
    ...extraNames,
  ]);
  const feats = [];
  for (const [name, c] of Object.entries(CENTER)) {
    const here = TAXA.filter(
      (t) => t.g !== skipGroup && t.n.includes(name),
    ).map((t) => t.name);
    const lost = TAXA.filter(
      (t) => t.g !== skipGroup && t.h.includes(name) && !t.n.includes(name),
    ).map((t) => t.name);
    const related = skipGroup
      ? TAXA.filter((t) => t.g === skipGroup && t.n.includes(name)).map(
          (t) => t.name,
        )
      : [];
    const props = clean({
      name: `${name} · ${noun}`,
      [`Here today`]: join(here),
      [`Lost here`]: join(lost),
      Related: join(related),
    });
    if (Object.keys(props).length > 1) feats.push(point(c, props));
  }
  feats.push(...camFeatures(CAMS, where, kindLabel));
  return feats;
}
write(
  'wolves',
  rangeLayer(
    `${HOME}/wolves-of-the-world.html`,
    'const GROUPS',
    'const $ =',
    [],
    'wolves',
    {
      'International Wolf Center cams': {
        c: [-91.85, 47.9],
        label: 'International Wolf Center, Ely, Minnesota',
      },
      'Wolf Cam 2 on explore.org': {
        c: [-91.85, 47.9],
        label: 'International Wolf Center, Ely, Minnesota',
      },
      'Ambassador wolf cam': {
        c: [-73.56, 41.25],
        label: 'Wolf Conservation Center, South Salem, New York',
      },
      'Red wolf enclosure & den cam': {
        c: [-73.56, 41.25],
        label: 'Wolf Conservation Center, South Salem, New York',
      },
      'Red Wolf Center cams': {
        c: [-76.25, 35.92],
        label: 'Red Wolf Center, Columbia, North Carolina',
      },
      'California Wolf Center cam': {
        c: [-116.6, 33.08],
        label: 'California Wolf Center, Julian, California',
        approx: true,
      },
      'Endangered Wolf Center live streams': {
        c: [-90.63, 38.5],
        label: 'Endangered Wolf Center, Eureka, Missouri',
      },
      'Yellowstone webcams': {
        c: [-110.83, 44.46],
        label: 'Old Faithful, Yellowstone National Park',
      },
    },
    'Live wolf camera',
    'rel',
  ),
);
write(
  'bears',
  rangeLayer(
    `${HOME}/bears-of-the-world.html`,
    'const GROUPS',
    'const $ =',
    [],
    'bears',
    {
      'Brooks Falls bearcams': {
        c: [-155.78, 58.555],
        label: 'Brooks Falls, Katmai National Park, Alaska',
      },
      'explore.org bear cams': {
        c: [-155.78, 58.555],
        label: 'Brooks Falls, Katmai National Park, Alaska',
      },
      'Churchill polar bear cams': {
        c: [-94.17, 58.77],
        label: 'Churchill, Manitoba',
      },
      'Black bear den cam': {
        c: [-77.6, 41.0],
        label: 'Pennsylvania (den location withheld; state centre shown)',
        approx: true,
      },
      'Giant Panda Cam': {
        c: [-77.05, 38.93],
        label: "Smithsonian's National Zoo, Washington DC",
      },
      'San Diego Zoo Panda Cam': {
        c: [-117.15, 32.735],
        label: 'San Diego Zoo, California',
      },
    },
    'Live bear camera',
    'look',
  ),
);
