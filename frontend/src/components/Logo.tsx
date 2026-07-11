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
        <circle cx="10" cy="22" r="2.4" fill="#fff" stroke="none" />
        <path d="M14 18 A 6 6 0 0 1 14 26" strokeWidth="2.1" opacity="0.95" />
        <path d="M17.5 14.5 A 11 11 0 0 1 17.5 29.5" strokeWidth="2.1" opacity="0.7" />
        <path d="M21 11 A 16 16 0 0 1 21 33" strokeWidth="2.1" opacity="0.45" />
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
