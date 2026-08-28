"""Basemap tile configuration: URL validation, the monochrome treatment, and
the light/dark resolution the web map and the PDF report share."""
import pytest

from app.services.basemap import (
    DEFAULT_ATTRIBUTION,
    DEFAULT_LIGHT_URL,
    MONOCHROME_BRIGHTNESS,
    Basemap,
    InvalidTileUrl,
    apply_monochrome,
    attribution_text,
    css_filter,
    validate_tile_url,
)


def test_default_is_keyless():
    """The shipped default must work with no API key: CARTO's anonymous raster
    tiles now carry an "API KEY REQUIRED" watermark, so a keyed host in the
    default would silently watermark every map and every PDF report."""
    assert "cartocdn.com" not in DEFAULT_LIGHT_URL
    assert "key=" not in DEFAULT_LIGHT_URL
    assert "apikey" not in DEFAULT_LIGHT_URL.lower()
    assert DEFAULT_LIGHT_URL.startswith("https://")


@pytest.mark.parametrize(
    "url",
    [
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        # CARTO with the admin's own key — the escape hatch back to Positron.
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=SECRET",
        # Reversed y/x order (Esri-style) is fine: placeholders are named.
        "https://example.org/tiles/{z}/{y}/{x}",
        # A self-hosted tile server on the LAN, over plain http.
        "http://tiles.internal:8080/{z}/{x}/{y}.png",
    ],
)
def test_accepts_real_provider_urls(url):
    assert validate_tile_url(url) == url


@pytest.mark.parametrize(
    "url, message",
    [
        ("ftp://x.example/{z}/{x}/{y}.png", "http"),
        ("https://x.example/{z}/{x}.png", "{y}"),
        ("https://x.example/{z}/{y}.png", "{x}"),
        ("/relative/{z}/{x}/{y}.png", "http"),
        # An unknown placeholder would make the report renderer's str.format
        # raise KeyError mid-PDF, so it's rejected at the form instead.
        ("https://x.example/{z}/{x}/{y}/{apikey}.png", "apikey"),
    ],
)
def test_rejects_unusable_urls(url, message):
    with pytest.raises(InvalidTileUrl) as exc:
        validate_tile_url(url)
    assert message in str(exc.value)


def test_rejects_unreplaced_key_placeholder():
    """The admin panel offers ready-made CARTO templates containing YOUR_KEY.
    Pasting one without substituting the key is a valid-looking URL that just
    returns watermarked or rejected tiles, so catch it at the form."""
    template = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=YOUR_KEY"
    with pytest.raises(InvalidTileUrl) as exc:
        validate_tile_url(template)
    assert "YOUR_KEY" in str(exc.value)
    # The same template with a real key is fine.
    assert validate_tile_url(template.replace("YOUR_KEY", "abc123")).endswith("key=abc123")


def test_empty_url_allowed_and_stripped():
    """Empty means "fall back" — for the dark URL that's "reuse the light tiles"."""
    assert validate_tile_url("") == ""
    assert validate_tile_url("   ") == ""
    assert validate_tile_url("  https://x.example/{z}/{x}/{y}.png  ") == (
        "https://x.example/{z}/{x}/{y}.png"
    )


def test_light_tiles_reused_and_inverted_for_dark():
    """With no dark URL configured we fake dark mode by inverting the light
    tiles, which is what keeps the keyless default usable in both themes."""
    bm = Basemap(DEFAULT_LIGHT_URL, "", DEFAULT_ATTRIBUTION, monochrome=True)
    assert bm.url_for(dark=True) == bm.url_for(dark=False) == DEFAULT_LIGHT_URL
    assert bm.inverts(dark=True) is True
    assert bm.inverts(dark=False) is False


def test_real_dark_style_is_not_inverted():
    """An admin who supplies a genuine dark style (CARTO dark_matter, say) must
    not have it inverted back to light."""
    bm = Basemap(
        DEFAULT_LIGHT_URL,
        "https://example.org/dark/{z}/{x}/{y}.png",
        DEFAULT_ATTRIBUTION,
        monochrome=True,
    )
    assert bm.url_for(dark=True) == "https://example.org/dark/{z}/{x}/{y}.png"
    assert bm.inverts(dark=True) is False


def test_monochrome_off_never_inverts():
    bm = Basemap(DEFAULT_LIGHT_URL, "", DEFAULT_ATTRIBUTION, monochrome=False)
    assert bm.inverts(dark=True) is False


def test_report_url_falls_back_when_light_cleared():
    """An admin clearing the light URL must not leave the PDF with no source."""
    bm = Basemap("", "", DEFAULT_ATTRIBUTION, monochrome=True)
    assert bm.report_url == DEFAULT_LIGHT_URL


def test_attribution_flattened_for_pdf():
    """The stored attribution is Leaflet HTML; the PDF caption needs latin-1
    plain text (fpdf2 core fonts) with no tags or entities."""
    text = attribution_text(DEFAULT_ATTRIBUTION)
    assert text == "© OpenStreetMap contributors"
    assert "<" not in text and "&" not in text
    text.encode("latin-1")  # must not raise


def test_monochrome_matches_its_css():
    """The PDF applies the treatment in PIL and the web map in CSS; they have to
    describe the same thing or reports won't match the screen."""
    assert css_filter() == f"grayscale(1) brightness({MONOCHROME_BRIGHTNESS})"
    assert css_filter(invert=True) == (
        f"grayscale(1) brightness({MONOCHROME_BRIGHTNESS}) invert(1)"
    )


def test_monochrome_desaturates_and_inverts():
    from PIL import Image

    # A saturated red must come out grey (equal channels) and lighter than the
    # raw luminance thanks to the brightness lift.
    red = Image.new("RGB", (4, 4), (200, 30, 30))
    out = apply_monochrome(red)
    r, g, b = out.getpixel((0, 0))
    assert r == g == b, "monochrome must remove all colour"

    inverted = apply_monochrome(red, invert=True).getpixel((0, 0))
    assert inverted[0] == 255 - r

    # White paper stays white (the brightness lift clips rather than greying).
    assert apply_monochrome(Image.new("RGB", (2, 2), (255, 255, 255))).getpixel((0, 0)) == (
        255,
        255,
        255,
    )
