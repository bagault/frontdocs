// Bundles the Frontdocs CLI into a single CJS file that can be spawned via
// Electron-as-Node from the Obsidian plugin (no external `node` required).
//
// Output: dist/cli-bundle/frontdocs-cli.cjs
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist/cli-bundle', { recursive: true });

await build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  // keytar is an optional native module — leave it external; the CLI already
  // tolerates `import('keytar')` failing.
  external: ['keytar'],
  outfile: 'dist/cli-bundle/frontdocs-cli.mjs',
  logLevel: 'info',
});

console.log('cli bundled -> dist/cli-bundle/frontdocs-cli.mjs');
