/**
 * Basemap tile selection for the map.
 *
 * CARTO's anonymous raster tiles now carry an "API KEY REQUIRED" watermark and
 * CARTO's own docs say the raster endpoints are being retired, so the tile
 * source is admin-configurable (see backend/app/services/basemap.py) and
 * defaults to keyless OpenStreetMap.
 *
 * OSM's standard style is colourful, though, and this map depends on a flat
 * background for its coloured markers to read. So we apply the same monochrome
 * treatment the PDF report applies in PIL — keep the two in step, or reports
 * stop matching the screen.
 */
import type { AuthConfig } from '../api/types';

/** Must match MONOCHROME_BRIGHTNESS in backend/app/services/basemap.py. */
export const MONOCHROME_BRIGHTNESS = 1.15;

export const DEFAULT_LIGHT_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * CARTO's raster templates, offered in the admin panel as the ready-made
 * "I have a key" answer. These are the styles DOCENT used to request
 * anonymously, before CARTO started requiring a key and watermarking the
 * tiles — so pasting these with a key restores exactly the old look.
 *
 * `{r}` asks for @2x retina tiles, which CARTO serves and which the PDF
 * report's stitcher will pick up automatically for a sharper printed map.
 */
export const CARTO_KEY_PLACEHOLDER = 'YOUR_KEY';
export const CARTO_LIGHT_URL =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=YOUR_KEY';
export const CARTO_DARK_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=YOUR_KEY';
/** CARTO require their credit to stay visible alongside OpenStreetMap's. */
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
export const CARTO_APIKEY_URL = 'https://carto.com/basemaps/apikey/';

export interface BasemapChoice {
  url: string;
  attribution: string;
  /** A CSS `filter` value, or undefined to leave the tiles untouched. */
  filter: string | undefined;
  /** Ask Leaflet to compensate for a provider that has no @2x tiles. */
  detectRetina: boolean;
}

/**
 * Highest zoom we ask a tile layer for. With `detectRetina` Leaflet knocks one
 * off this and fetches the level below, so 19 keeps the map's usable maximum at
 * 18 — what it was before — while staying inside OpenStreetMap's z19 ceiling.
 */
export const MAX_ZOOM = 19;

/**
 * Resolve the tile layer for one colour scheme.
 *
 * An empty `basemap_dark_url` means "reuse the light tiles": inverting them is
 * what gives the keyless default a usable dark mode. An admin who supplies a
 * real dark style gets it untouched.
 */
export function basemapFor(
  config: Pick<
    AuthConfig,
    'basemap_light_url' | 'basemap_dark_url' | 'basemap_attribution' | 'basemap_monochrome'
  > | undefined,
  dark: boolean,
): BasemapChoice {
  const light = config?.basemap_light_url || DEFAULT_LIGHT_URL;
  const darkUrl = config?.basemap_dark_url || '';
  const monochrome = config?.basemap_monochrome ?? true;

  const usingLightTilesForDark = dark && !darkUrl;
  const parts: string[] = [];
  if (monochrome) {
    parts.push('grayscale(1)', `brightness(${MONOCHROME_BRIGHTNESS})`);
    if (usingLightTilesForDark) parts.push('invert(1)');
  }

  const url = dark && darkUrl ? darkUrl : light;
  return {
    url,
    attribution: config?.basemap_attribution || DEFAULT_ATTRIBUTION,
    filter: parts.length ? parts.join(' ') : undefined,
    // A provider offering {r} serves @2x tiles and Leaflet substitutes it on
    // HiDPI screens, so the map is already sharp. Everything else — including
    // the OpenStreetMap default — serves 256px tiles only, which a retina
    // display draws at half its pixel density, i.e. visibly soft. There,
    // `detectRetina` makes Leaflet fetch one zoom level deeper and draw it at
    // half size, restoring full density. Turning both on at once would fetch
    // four @2x tiles where one belongs, so it's strictly either/or.
    detectRetina: !url.includes('{r}'),
  };
}
