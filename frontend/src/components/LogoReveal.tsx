import { useCallback, useState } from 'react';
import './LogoReveal.css';

/**
 * Animated DOCENT reveal for the auth / splash screen.
 *
 * On mount the gradient tile springs in, the hub pops, three orbits ripple
 * outward, community nodes land on each orbit, then the wordmark rises in
 * letter-by-letter. In steady state a radar "ping" sweeps out of the core once
 * every 5s, lighting each orbit and snapping its nodes bright as it crosses.
 *
 * Fonts (Space Grotesk + Inter) come from the app theme — no extra loading.
 * All motion is plain CSS (LogoReveal.css); nothing runs on the main thread.
 * Honours prefers-reduced-motion (see the CSS).
 */
export function LogoReveal({
  size = 184,
  showTagline = true,
  showReplay = false,
}: {
  size?: number;
  showTagline?: boolean;
  showReplay?: boolean;
}) {
  // Bumping the key remounts the animated block, restarting every CSS animation.
  const [runKey, setRunKey] = useState(0);
  const replay = useCallback(() => setRunKey((k) => k + 1), []);

  const wordDelays = ['1.35s', '1.42s', '1.49s', '1.56s', '1.63s', '1.70s'];

  return (
    <div className="dc-reveal">
      <div key={runKey} className="dc-reveal-lockup" style={{ gap: size * 0.16 }}>
        <svg
          className="dc-svg"
          width={size}
          height={size}
          viewBox="0 0 64 64"
          role="img"
          aria-label="DOCENT logo"
          style={{ display: 'block', filter: 'drop-shadow(0 24px 60px rgba(109,65,236,0.4))' }}
        >
          <defs>
            <linearGradient id="dcRevealGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#6d41ec" />
              <stop offset="1" stopColor="#b14fe0" />
            </linearGradient>
          </defs>

          <rect className="dc-tile" x="1.5" y="1.5" width="61" height="61" rx="15" fill="url(#dcRevealGrad)" />

          {/* orbital rings */}
          <circle className="dc-el dc-ring3" cx="32" cy="32" r="21.5" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1.7" />
          <circle className="dc-el dc-ring2" cx="32" cy="32" r="15" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.9" />
          <circle className="dc-el dc-ring1" cx="32" cy="32" r="8.5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.1" />

          {/* radar sweep */}
          <circle className="dc-el dc-wave" cx="32" cy="32" r="24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />

          {/* community nodes on their orbits */}
          <g className="dc-el dc-sat1"><circle className="dc-flash1" cx="37.5" cy="25.5" r="2.5" fill="#fff" /></g>
          <g className="dc-el dc-sat2"><circle className="dc-flash2" cx="17.9" cy="26.9" r="2.5" fill="#fff" /></g>
          <g className="dc-el dc-sat3"><circle className="dc-flash2" cx="35.9" cy="46.5" r="2.5" fill="#fff" /></g>
          <g className="dc-el dc-sat4"><circle className="dc-flash3" cx="51.5" cy="41.1" r="2.5" fill="#fff" /></g>

          {/* central hub node */}
          <g className="dc-el dc-node"><circle className="dc-core" cx="32" cy="32" r="4" fill="#fff" /></g>
        </svg>

        <div className="dc-wordmark" style={{ fontSize: size * 0.36 }}>
          {'DOCENT'.split('').map((ch, i) => (
            <span key={i} className="dc-letter" style={{ animationDelay: wordDelays[i] }}>
              {ch}
            </span>
          ))}
        </div>

        {showTagline && (
          <div className="dc-tagline">
            <b>D</b>istributed&nbsp;&nbsp;<b>O</b>utreach&nbsp;&amp;&nbsp;<b>C</b>ommunity&nbsp;&nbsp;
            <b>E</b>ngagement&nbsp;&nbsp;<b>N</b>etwork&nbsp;&nbsp;<b>T</b>racker
          </div>
        )}
      </div>

      {showReplay && (
        <button type="button" className="dc-replay" onClick={replay}>
          <span aria-hidden>&#10227;</span> Replay
        </button>
      )}
    </div>
  );
}
