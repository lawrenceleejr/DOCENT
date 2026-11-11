// Chart color roles from the validated reference palette (dataviz skill).
// Both modes are explicitly selected steps, not an automatic flip.
export interface VizTheme {
  series1: string; // visits
  series2: string; // people reached
  grid: string;
  axis: string;
  mutedInk: string;
  ink: string; // direct value labels
  tooltipBg: string;
  tooltipInk: string;
  tooltipBorder: string;
}

export const VIZ_LIGHT: VizTheme = {
  series1: '#2a78d6',
  series2: '#1baf7a',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  // Darkened from #898781 so 11–12px axis text clears WCAG AA on a white card.
  mutedInk: '#6b6963',
  ink: '#2b2b29',
  tooltipBg: '#fcfcfb',
  tooltipInk: '#0b0b0b',
  tooltipBorder: 'rgba(11,11,11,0.10)',
};

export const VIZ_DARK: VizTheme = {
  series1: '#3987e5',
  series2: '#199e70',
  grid: '#2c2c2a',
  axis: '#383835',
  mutedInk: '#9a9892',
  ink: '#e6e5e0',
  tooltipBg: '#1a1a19',
  tooltipInk: '#ffffff',
  tooltipBorder: 'rgba(255,255,255,0.10)',
};
