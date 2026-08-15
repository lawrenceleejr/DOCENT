/**
 * Render the DOCENT seamless Instagram carousel.
 *
 * Loads instagram-carousel.html (a single 8640×1350 panorama), freezes every
 * CSS animation at one instant so the slice is consistent across the whole
 * canvas, then writes:
 *
 *   out/panorama.png     the full 8640×1350 surface (for checking the seams)
 *   out/slide-01..08.png the eight 1080×1350 slides, in posting order
 *   out/slide-01.mp4     the cover as an animated 5s loop (optional)
 *
 * Usage:  npm install && npm run render          # stills
 *         npm run render -- --video              # stills + animated cover
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');

const SLIDE_W = 1080;
const SLIDE_H = 1350;
const SLIDES = 8;

/** Instant (ms into the page's timeline) that every animation is frozen at.
 *  2.1s is when the app's reveal hands over to the looping radar ping, so
 *  7.7s = the second ping, 12% into its 5s cycle: the reveal has fully
 *  settled and the sweep is halfway across the panorama. */
const FREEZE_MS = 7700;

/** The ping loop, for the animated cover: one full cycle, so it loops cleanly.
 *  Starts at the *second* ping (2.1s + 5s) — by then the reveal has finished,
 *  so the first and last frames match. */
const LOOP_START_MS = 7100;
const LOOP_MS = 5000;
const FPS = 30;

const wantVideo = process.argv.includes('--video');

/** Freeze (or scrub) every running animation to an absolute timeline position. */
const scrub = (page, ms) =>
  page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, ms);

/** A full ffmpeg — Instagram wants H.264/MP4, so Playwright's bundled
 *  VP8-only build is no use here. `npm install` pulls ffmpeg-static; set
 *  FFMPEG_PATH to point at a system one instead. */
async function ffmpegBin() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try {
    const { default: bin } = await import('ffmpeg-static');
    if (bin && existsSync(bin)) return bin;
  } catch {
    /* not installed — fall through to the system binaries */
  }
  for (const p of ['/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) if (existsSync(p)) return p;
  return null;
}

const run = (bin, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}\n${err.slice(-2000)}`))));
  });

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({
    // CHROMIUM_PATH lets a machine with a preinstalled browser skip the download
    executablePath: process.env.CHROMIUM_PATH || undefined,
    // the page links the app's LogoReveal.css from a sibling directory
    args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  const context = await browser.newContext({
    viewport: { width: SLIDE_W * SLIDES, height: SLIDE_H },
    deviceScaleFactor: 1, // the panorama is authored at Instagram's exact pixel size
    reducedMotion: 'no-preference',
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  await page.goto(pathToFileURL(join(HERE, 'instagram-carousel.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  await scrub(page, FREEZE_MS);

  console.log('panorama.png  8640×1350');
  await page.screenshot({ path: join(OUT, 'panorama.png'), clip: { x: 0, y: 0, width: SLIDE_W * SLIDES, height: SLIDE_H } });

  // a quarter-size strip of the same surface, small enough to keep in git —
  // this is the one to look at when checking that the seams line up
  await page.evaluate(() => {
    const c = document.querySelector('.canvas');
    c.style.transformOrigin = 'top left';
    c.style.transform = 'scale(0.25)';
  });
  console.log('panorama-preview.png  2160×338');
  await page.screenshot({ path: join(OUT, 'panorama-preview.png'), clip: { x: 0, y: 0, width: 2160, height: 338 } });
  await page.evaluate(() => {
    document.querySelector('.canvas').style.transform = '';
  });

  for (let i = 0; i < SLIDES; i++) {
    const name = `slide-${String(i + 1).padStart(2, '0')}.png`;
    console.log(`${name}   ${SLIDE_W}×${SLIDE_H}`);
    await page.screenshot({
      path: join(OUT, name),
      clip: { x: i * SLIDE_W, y: 0, width: SLIDE_W, height: SLIDE_H },
    });
  }

  if (wantVideo) {
    const ffmpeg = await ffmpegBin();
    if (!ffmpeg) {
      console.warn('! no ffmpeg found — skipping the animated cover (set FFMPEG_PATH to override)');
    } else {
      const frames = join(OUT, '.frames');
      await rm(frames, { recursive: true, force: true });
      await mkdir(frames, { recursive: true });

      const total = Math.round((LOOP_MS / 1000) * FPS);
      console.log(`slide-01.mp4  ${total} frames @ ${FPS}fps`);
      for (let f = 0; f < total; f++) {
        await scrub(page, LOOP_START_MS + (f * LOOP_MS) / total);
        const buf = await page.screenshot({ clip: { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H } });
        await writeFile(join(frames, `f${String(f).padStart(4, '0')}.png`), buf);
      }

      await run(ffmpeg, [
        '-y', '-framerate', String(FPS), '-i', join(frames, 'f%04d.png'),
        '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-crf', '18', '-movflags', '+faststart',
        join(OUT, 'slide-01.mp4'),
      ]);
      await rm(frames, { recursive: true, force: true });
    }
  }

  await browser.close();
  console.log(`\nDone → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
