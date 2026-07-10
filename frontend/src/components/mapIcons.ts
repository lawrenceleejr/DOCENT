import L from 'leaflet';

// Simple colored dot icons — a divIcon avoids Leaflet's bundler image-path issues
// and reads clearly in both light and dark mode.
export const COLORS = {
  covered: '#2f9e44', // green — an institution we've reached
  gap: '#e8590c', // orange-red — a gap (no visit yet)
  venue: '#1971c2', // blue — a visited venue not in the catalog
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
