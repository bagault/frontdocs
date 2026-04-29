// Bundles the Frontdocs Obsidian plugin into main.js next to manifest.json.
// The bundled CLI and viewer are inlined as base64 strings so the plugin is
// self-contained: a user only needs to ship manifest.json + main.js.
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

// Stage assets first so the text loader has something to embed.
function stageAssets() {
  const repoRoot = resolve(__dirname, '..');
  const cliSrc = resolve(repoRoot, 'dist/cli-bundle/frontdocs-cli.mjs');
  const viewerSrc = resolve(repoRoot, 'dist/viewer/frontdocs-graph-viewer.js');
  if (!existsSync(cliSrc)) throw new Error(`CLI bundle missing: ${cliSrc} (run \`npm run build\` in the repo root first)`);
  if (!existsSync(viewerSrc)) throw new Error(`viewer missing: ${viewerSrc}`);
  const assetsDir = resolve(__dirname, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  copyFileSync(cliSrc, resolve(assetsDir, 'frontdocs-cli.mjs'));
  copyFileSync(viewerSrc, resolve(assetsDir, 'frontdocs-graph-viewer.js'));
  // Also stage the viewer with a .embed.js suffix so esbuild's text loader
  // (which matches by extension) picks it up without affecting other .js imports.
  copyFileSync(viewerSrc, resolve(assetsDir, 'frontdocs-graph-viewer.embed.js'));
  console.log('[stage] copied cli + viewer →', assetsDir);
}

stageAssets();

const opts = {
  entryPoints: [resolve(__dirname, 'src/main.ts')],
  bundle: true,
  outfile: resolve(__dirname, 'main.js'),
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  external: [
    'obsidian',
    'electron',
    'child_process', 'fs', 'fs/promises', 'path', 'os', 'url', 'util', 'stream', 'events', 'crypto', 'http', 'https',
  ],
  loader: {
    '.mjs': 'base64',
    '.embed.js': 'base64',
  },
  // Re-route the viewer asset through the .embed.js extension so the text
  // loader matches without affecting other .js imports.
  alias: {},
  sourcemap: 'inline',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log('plugin: watching');
} else {
  await esbuild.build(opts);
  console.log('plugin: built ->', opts.outfile);
}
