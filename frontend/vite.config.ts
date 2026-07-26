import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Version shown in the app footer (#26): an explicit VITE_APP_VERSION wins
 * (the Docker build passes it, since its build context has no .git), otherwise
 * the git tag when HEAD is exactly tagged, else the short commit hash, else
 * "dev" when git isn't available at all. */
function appVersion(): string {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  const git = (args: string) =>
    execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    return git('describe --tags --exact-match');
  } catch {
    /* HEAD isn't tagged — fall through to the commit hash */
  }
  try {
    return git('rev-parse --short HEAD');
  } catch {
    /* no git available (e.g. a container build without .git) */
  }
  return 'dev';
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  server: {
    port: 5173,
    proxy: {
      // Same-origin API in dev, matching the nginx proxy in production.
      '/api': 'http://localhost:8000',
    },
  },
});
