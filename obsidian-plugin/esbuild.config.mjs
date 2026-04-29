// Bundles the Frontdocs Obsidian plugin into main.js next to manifest.json,
// and stages the bundled CLI + viewer assets that the plugin ships alongside.
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

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
    // Node built-ins (resolved by Obsidian's electron runtime).
    'child_process', 'fs', 'fs/promises', 'path', 'os', 'url', 'util', 'stream', 'events', 'crypto', 'http', 'https',
  ],
  sourcemap: 'inline',
  logLevel: 'info',
};

function stageAssets() {
  const repoRoot = resolve(__dirname, '..');
  const cliSrc = resolve(repoRoot, 'dist/cli-bundle/frontdocs-cli.mjs');
  const viewerSrc = resolve(repoRoot, 'dist/viewer/frontdocs-graph-viewer.js');
  if (!existsSync(cliSrc)) {
    console.warn('[stage] CLI bundle missing — run `npm run build` in the repo root first:', cliSrc);
    return;
  }
  if (!existsSync(viewerSrc)) {
    console.warn('[stage] viewer missing:', viewerSrc);
    return;
  }
  const assetsDir = resolve(__dirname, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  copyFileSync(cliSrc, resolve(assetsDir, 'frontdocs-cli.mjs'));
  copyFileSync(viewerSrc, resolve(assetsDir, 'frontdocs-graph-viewer.js'));
  console.log('[stage] copied cli + viewer →', assetsDir);
}

if (watch) {
  stageAssets();
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log('plugin: watching');
} else {
  await esbuild.build(opts);
  stageAssets();
  console.log('plugin: built ->', opts.outfile);
}
