import { useEffect, useState } from 'react';
import { LogoReveal } from './LogoReveal';
import './MobileSplash.css';

// Once shown, we don't replay it as the user moves between login/register in
// the same session — a splash on every navigation would be annoying (#33).
const SPLASH_KEY = 'docent_splash_shown';
const LEAVE_AT = 2900; // let the reveal play and the tagline settle, then exit
const REMOVE_AT = 3350; // matches the fade-out transition in the CSS

/** Decide synchronously (before first paint) whether the animated splash
 * should run: only on phone-width screens, only once per session, and never
 * when the user prefers reduced motion. Computing this in the initial state
 * avoids a flash of the login form before the overlay mounts. */
function shouldPlay(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    if (sessionStorage.getItem(SPLASH_KEY) === '1') return false;
  } catch {
    /* storage may be unavailable (private mode) — fall through and play once */
  }
  const isPhone = window.matchMedia('(max-width: 47.99em)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return isPhone && !reduceMotion;
}

/**
 * Brief animated-logo splash shown before the login form on phones (#33).
 * Desktop already sees the animation in the auth hero panel, so this only
 * runs below the `sm` breakpoint where that panel is hidden.
 */
export function MobileSplash() {
  const [phase, setPhase] = useState<'in' | 'leaving' | 'done'>(() =>
    shouldPlay() ? 'in' : 'done',
  );

  useEffect(() => {
    if (phase !== 'in') return;
    try {
      sessionStorage.setItem(SPLASH_KEY, '1');
    } catch {
      /* ignore — worst case the splash shows again next navigation */
    }
    const leave = window.setTimeout(() => setPhase('leaving'), LEAVE_AT);
    const remove = window.setTimeout(() => setPhase('done'), REMOVE_AT);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, [phase]);

  if (phase === 'done') return null;

  const dismiss = () => setPhase((p) => (p === 'in' ? 'leaving' : p));

  return (
    <div
      className={`docent-splash${phase === 'leaving' ? ' is-leaving' : ''}`}
      role="presentation"
      onClick={dismiss}
      onTransitionEnd={() => phase === 'leaving' && setPhase('done')}
    >
      <LogoReveal size={172} showTagline />
    </div>
  );
}
