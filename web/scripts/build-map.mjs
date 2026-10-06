// Builds assets/img/pilotregion.svg: Switzerland (generalised BFS/swisstopo boundaries via swiss-maps)
// with the four pilot cantons ZH, SZ, ZG, SG and Lake Zurich highlighted.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature, mesh } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { geoMercator, geoPath, geoCentroid } from 'd3-geo';

const require = createRequire(import.meta.url);
const raw = require('swiss-maps/2026/ch-combined.json');
const pre = presimplify(raw);
const topo = simplify(pre, quantile(pre, 0.25));
const PILOT = { 1: 'ZH', 5: 'SZ', 9: 'ZG', 17: 'SG' };

const country = feature(topo, topo.objects.country);
const cantons = feature(topo, topo.objects.cantons).features;
const lakes = feature(topo, topo.objects.lakes).features;
const pilot = cantons.filter((c) => PILOT[c.id]);

const W = 1000, H = 640, PAD = 26;
const projection = geoMercator().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], country);
const path = geoPath(projection);
const r = (d) => d.replace(/(\d+\.\d)\d+/g, '$1');

const zurichsee = lakes
  .map((l) => ({ l, c: geoCentroid(l) }))
  .sort((a, b) => Math.hypot(a.c[0] - 8.72, a.c[1] - 47.25) - Math.hypot(b.c[0] - 8.72, b.c[1] - 47.25))[0].l;

const innerBorders = mesh(topo, topo.objects.cantons, (a, b) => a !== b);
const labels = pilot.map((c) => {
  const [x, y] = projection(geoCentroid(c));
  return { id: PILOT[c.id], x: x.toFixed(1), y: y.toFixed(1) };
});
const [lx, ly] = projection(geoCentroid(zurichsee));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="map-title">
<title id="map-title">Pilotregion: Kantone Zürich, Schwyz, Zug und St. Gallen</title>
<path class="map-country" d="${r(path(country))}"/>
<path class="map-borders" d="${r(path(innerBorders))}"/>
${pilot.map((c) => `<path class="map-pilot" data-canton="${PILOT[c.id]}" d="${r(path(c))}"/>`).join('\n')}
${lakes.map((l) => `<path class="map-lake${l === zurichsee ? ' map-lake--zh' : ''}" d="${r(path(l))}"/>`).join('\n')}
${labels.map((l) => `<text class="map-label" data-canton="${l.id}" x="${l.x}" y="${l.y}">${l.id}</text>`).join('\n')}
<text class="map-lake-label" x="${(lx + 34).toFixed(1)}" y="${(ly + 26).toFixed(1)}">Zürichsee</text>
</svg>
`;
fs.writeFileSync(new URL('../gewinnen/assets/img/pilotregion.svg', import.meta.url), svg);
// projection helper for partner pins (lon/lat → svg coords) used by the page
const p = projection.translate(), s = projection.scale();
fs.writeFileSync(new URL('../gewinnen/assets/data/map-projection.json', import.meta.url), JSON.stringify({ type: 'mercator', scale: s, translate: p, width: W, height: H }, null, 2));
console.log('map written', (svg.length / 1024).toFixed(1) + ' KB', labels);
