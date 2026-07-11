import { Group, Text } from '@mantine/core';

/** The DOCENT brand mark — a "reach out" broadcast motif on a gradient tile. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const id = `docent-logo-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="DOCENT"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6d41ec" />
          <stop offset="1" stopColor="#b14fe0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <g fill="none" stroke="#fff" strokeLinecap="round">
        <circle cx="10.5" cy="16" r="2.4" fill="#fff" stroke="none" />
        <path d="M13.5 12 A 6 6 0 0 1 13.5 20" strokeWidth="2.2" opacity="0.95" />
        <path d="M16.5 9 A 10 10 0 0 1 16.5 23" strokeWidth="2.2" opacity="0.7" />
        <path d="M19.5 6 A 14 14 0 0 1 19.5 26" strokeWidth="2.2" opacity="0.48" />
      </g>
    </svg>
  );
}

/** Brand mark + wordmark lockup. */
export function Logo({
  size = 28,
  showWordmark = true,
}: {
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <LogoMark size={size} />
      {showWordmark && (
        <Text
          span
          fw={700}
          fz={size * 0.62}
          style={{
            fontFamily: "'Space Grotesk Variable', sans-serif",
            letterSpacing: '0.02em',
            lineHeight: 1,
          }}
        >
          DOCENT
        </Text>
      )}
    </Group>
  );
}
