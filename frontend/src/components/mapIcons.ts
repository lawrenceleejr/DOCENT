import L from 'leaflet';

// Simple colored dot icons — a divIcon avoids Leaflet's bundler image-path issues
// and reads clearly in both light and dark mode.
// Harmonized with the app palette: reached = chart green, your-venue = brand
// violet, gap = a warm amber that reads as "attention / not yet reached".
export const COLORS = {
  covered: '#199e70', // green — an institution we've reached
  gap: '#e8843a', // warm amber — a gap (no visit yet)
  venue: '#6d41ec', // brand violet — a visited venue
} as const;

export function dotIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'docent-dot',
    html: `<span style="
      display:block;width:14px;height:14px;border-radius:50%;
      background:${color};border:2px solid #fff;
      box-shadow:0 0 3px rgba(0,0,0,.6);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -7],
  });
}

export const coveredIcon = dotIcon(COLORS.covered);
export const gapIcon = dotIcon(COLORS.gap);
export const venueIcon = dotIcon(COLORS.venue);
