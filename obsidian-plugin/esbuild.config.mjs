// Bundles the Frontdocs Obsidian plugin into main.js next to manifest.json.
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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
    'child_process', 'fs', 'fs/promises', 'path', 'os', 'url', 'util', 'stream', 'events', 'crypto',
  ],
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
