"""Basemap tile configuration, shared by the web map and the PDF report.

CARTO's raster basemaps (which both surfaces used to hit anonymously) now stamp
an "API KEY REQUIRED" watermark into the tile pixels, and CARTO's own docs say
the raster endpoints "are being retired". So the default here is a keyless
provider — OpenStreetMap's own tiles — with a monochrome treatment applied on
top: OSM's standard style is colourful, and the map's whole point is that the
coloured markers read clearly against a flat background.

The treatment is deliberately expressible in *both* CSS and PIL so the PDF's
map matches the web map: grayscale, a brightness lift, and (for dark mode) an
inversion. Because grayscale discards hue, `grayscale -> invert` is hue-free
and the two implementations agree without any colour-space bookkeeping.

An admin can point the URLs at any {z}/{x}/{y} raster provider instead — CARTO
with their own key, Stadia, MapTiler, or a self-hosted tile server — which is
also the escape hatch for anyone who wants the old Positron look back.
"""
import html
import re
from dataclasses import dataclass
from string import Formatter
from urllib.parse import urlsplit

# Keyless defaults. OSM's tile usage policy permits normal interactive viewing
# at modest volume and requires a self-identifying User-Agent (see the report
# fetcher) and visible attribution.
DEFAULT_LIGHT_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
DEFAULT_DARK_URL = ""  # empty: reuse the light tiles, inverted when monochrome
DEFAULT_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

# Placeholders a tile template may use. Anything else is rejected, so the
# server-side `str.format` can never raise KeyError on an admin-entered URL.
ALLOWED_PLACEHOLDERS = frozenset({"s", "z", "x", "y", "r"})
REQUIRED_PLACEHOLDERS = frozenset({"z", "x", "y"})

# The placeholder used in the admin panel's ready-made CARTO templates. Left
# un-replaced it is a syntactically fine URL that silently yields watermarked
# or rejected tiles, so we catch it at the form instead.
KEY_PLACEHOLDER = "YOUR_KEY"

# Brightness lift applied after grayscale. OSM's greens/greys go quite dark
# once desaturated; this pulls the mid-tones up toward Positron's airy feel
# while clipping keeps paper-white backgrounds white.
MONOCHROME_BRIGHTNESS = 1.15


class InvalidTileUrl(ValueError):
    """An admin-supplied tile URL template we refuse to store or fetch."""


def placeholders(url: str) -> set[str]:
    """The `{...}` field names used in a tile template."""
    return {name for _, name, _, _ in Formatter().parse(url) if name is not None}


def validate_tile_url(url: str) -> str:
    """Check an admin-supplied tile URL template, returning it stripped.

    Empty is allowed and means "fall back to the default / the light URL". We
    validate rather than sanitise: a bad template would otherwise surface as a
    500 from the PDF renderer or as silently blank tiles on the web map.

    Note this URL is fetched server-side by the report renderer, so it is an
    SSRF-shaped input — but it is settable by admins only, who already control
    the deployment and could edit `.env` directly. We therefore constrain the
    scheme and the format string rather than trying to police destinations,
    which would also break the legitimate self-hosted-tile-server case.
    """
    url = (url or "").strip()
    if not url:
        return ""

    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise InvalidTileUrl("Tile URL must start with http:// or https://")
    if not parts.netloc:
        raise InvalidTileUrl("Tile URL is missing a host")

    found = placeholders(url)
    unknown = found - ALLOWED_PLACEHOLDERS
    if unknown:
        allowed = ", ".join("{%s}" % p for p in sorted(ALLOWED_PLACEHOLDERS))
        raise InvalidTileUrl(
            "Unsupported placeholder(s) %s — only %s are available"
            % (", ".join("{%s}" % p for p in sorted(unknown)), allowed)
        )
    missing = REQUIRED_PLACEHOLDERS - found
    if missing:
        raise InvalidTileUrl(
            "Tile URL must include %s"
            % ", ".join("{%s}" % p for p in sorted(missing))
        )
    if KEY_PLACEHOLDER in url:
        raise InvalidTileUrl(
            "Replace %s with the key your tile provider gave you" % KEY_PLACEHOLDER
        )
    return url


@dataclass(frozen=True)
class Basemap:
    """Resolved basemap settings for one instance."""

    light_url: str
    dark_url: str
    attribution: str
    monochrome: bool

    @property
    def report_url(self) -> str:
        """The PDF's activity map is always rendered light-on-white."""
        return self.light_url or DEFAULT_LIGHT_URL

    def url_for(self, dark: bool) -> str:
        """Tiles for one colour scheme. An unset dark URL reuses the light
        tiles — the monochrome inversion is what makes them read as dark."""
        if dark and self.dark_url:
            return self.dark_url
        return self.light_url or DEFAULT_LIGHT_URL

    def inverts(self, dark: bool) -> bool:
        """Whether the client should invert. Only when we're faking a dark
        basemap out of light tiles; a real dark style is already dark."""
        return dark and self.monochrome and not self.dark_url


def apply_monochrome(img, *, invert: bool = False):
    """The PIL half of the CSS treatment, so the PDF matches the web map.

    Mirrors `grayscale(1) brightness(1.15)` and, when inverting, a trailing
    `invert(1)`. Takes/returns a PIL image; imported lazily by the caller.
    """
    from PIL import ImageOps

    gray = img.convert("L")
    if MONOCHROME_BRIGHTNESS != 1.0:
        lut = [min(255, round(v * MONOCHROME_BRIGHTNESS)) for v in range(256)]
        gray = gray.point(lut)
    if invert:
        gray = ImageOps.invert(gray)
    return gray.convert("RGB") if img.mode == "RGB" else gray.convert(img.mode)


_TAG_RE = re.compile(r"<[^>]+>")


def attribution_text(attribution: str) -> str:
    """Flatten the Leaflet-facing attribution (which carries links and HTML
    entities) into plain text for the PDF caption."""
    return " ".join(html.unescape(_TAG_RE.sub("", attribution or "")).split())


def css_filter(*, invert: bool = False) -> str:
    """The CSS equivalent of `apply_monochrome`, for reference/tests."""
    parts = ["grayscale(1)", f"brightness({MONOCHROME_BRIGHTNESS})"]
    if invert:
        parts.append("invert(1)")
    return " ".join(parts)
