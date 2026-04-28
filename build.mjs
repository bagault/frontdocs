// Bundles the browser Cosmos viewer into a single IIFE script.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist/viewer', { recursive: true });

await build({
  entryPoints: ['src/viewer/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'FrontdocsViewer',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: true,
  outfile: 'dist/viewer/frontdocs-graph-viewer.js',
  logLevel: 'info',
});

console.log('viewer bundled');
