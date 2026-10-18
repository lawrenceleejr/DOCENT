import { Button, Card, createTheme, type MantineColorsTuple } from '@mantine/core';

// Brand identity: a muted ink-indigo, nudged toward blue and kept below full
// saturation so it reads as considered rather than default. Still distinct
// from the chart blue/green so data never competes with the chrome.
const brand: MantineColorsTuple = [
  '#f2f4ff',
  '#e2e6ff',
  '#c2caff',
  '#a0aaf9',
  '#848df0',
  '#6c71e0',
  '#5355c4', // 6 — primary
  '#4544ab',
  '#373590',
  '#2a2873',
];

// Near-black surfaces with a faint indigo tint; text steps raised a notch so
// secondary/dimmed ink clears WCAG AA on the dark base.
const dark: MantineColorsTuple = [
  '#e7e7ee',
  '#c9c9d4',
  '#a2a2b3', // dimmed text (raised from Mantine default for contrast)
  '#6d6d80',
  '#34343f', // borders — subtle indigo tint
  '#26262f',
  '#1b1b22', // elevated card surface
  '#131318', // body background
  '#0e0e12',
  '#0a0a0d',
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },
  colors: { brand, dark },
  // Tonal, same-hue gradient for the few places that still use one.
  defaultGradient: { from: '#4544ab', to: '#5355c4', deg: 135 },
  defaultRadius: 'md',
  cursorType: 'pointer',
  focusRing: 'auto',
  fontFamily:
    "'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  headings: {
    fontFamily: "'Space Grotesk Variable', 'Inter Variable', sans-serif",
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '2rem', lineHeight: '1.2' },
      h2: { fontSize: '1.55rem', lineHeight: '1.25' },
      h3: { fontSize: '1.2rem', lineHeight: '1.3' },
    },
  },
  components: {
    Card: Card.extend({
      defaultProps: { radius: 'lg', withBorder: true },
    }),
    Button: Button.extend({
      defaultProps: { radius: 'md' },
    }),
  },
});
