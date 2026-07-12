import { Group, Text } from '@mantine/core';
import './LogoReveal.css';

/**
 * The DOCENT brand mark — a central hub node radiating three orbital rings, with
 * community nodes sitting exactly on those orbits. Reads as a signal/outreach
 * ripple and as an atom / solar system: a distributed network reaching outward.
 *
 * Static by default. Pass `ping` to run the looping radar "ping" (used in the
 * app header) — the same steady-state loop as LogoReveal, but with no one-time
 * entrance animation. For the full splash/auth reveal see LogoReveal.tsx.
 */
export function LogoMark({ size = 28, ping = false }: { size?: number; ping?: boolean }) {
  const gid = `docent-grad-${size}${ping ? '-ping' : ''}`;
  return (
    <svg
      className={ping ? 'dc-mark' : undefined}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="DOCENT"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6d41ec" />
          <stop offset="1" stopColor="#b14fe0" />
        </linearGradient>
      </defs>

      <rect x="1.5" y="1.5" width="61" height="61" rx="15" fill={`url(#${gid})`} />

      {/* orbital rings, centred on the hub */}
      <circle cx="32" cy="32" r="21.5" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1.7" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.9" />
      <circle cx="32" cy="32" r="8.5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.1" />

      {/* radar sweep (only when pinging) */}
      {ping && (
        <circle className="dcm-wave" cx="32" cy="32" r="24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.4" />
      )}

      {/* community nodes on their orbits */}
      <circle cx="37.5" cy="25.5" r="2.5" fill="#fff" />
      <circle cx="17.9" cy="26.9" r="2.5" fill="#fff" />
      <circle cx="35.9" cy="46.5" r="2.5" fill="#fff" />
      <circle cx="51.5" cy="41.1" r="2.5" fill="#fff" />

      {/* central hub node */}
      <circle className={ping ? 'dcm-core' : undefined} cx="32" cy="32" r="4" fill="#fff" />
    </svg>
  );
}

/** Brand mark + wordmark lockup. */
export function Logo({
  size = 28,
  showWordmark = true,
  ping = false,
}: {
  size?: number;
  showWordmark?: boolean;
  ping?: boolean;
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <LogoMark size={size} ping={ping} />
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
