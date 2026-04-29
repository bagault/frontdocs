#!/usr/bin/env node
// Frontdocs CLI: analyze | export | build | verify | ai
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { loadConfig } from '../core/config.js';
import { analyzeVault } from '../core/analyzer.js';
import { exportSite } from '../exporter/exporter.js';
import { buildWithMkdocs } from '../sidecars/mkdocs.js';
import { verifyBuild } from '../exporter/verify.js';
import type { AIProviderConfig } from '../ai/providers.js';
import { ping } from '../ai/providers.js';
import { backendStatus, deleteSecret, getSecret, setSecret } from '../ai/secrets.js';
import { cacheFilePath, summarizeAll } from '../ai/summarize.js';
import type { FrontdocsConfig } from '../core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findViewerJs(): string {
  // Allow callers (e.g. the Obsidian plugin) to point us at the viewer
  // bundle without depending on the on-disk layout.
  const env = process.env['FRONTDOCS_VIEWER_JS'];
  if (env && existsSync(env)) return env;
  // dist/cli/index.js → dist/viewer/frontdocs-graph-viewer.js
  return resolve(__dirname, '..', 'viewer', 'frontdocs-graph-viewer.js');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) return printHelp();
  const cmd = argv[0];

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') return printHelp();

  if (cmd === 'ai') return runAI(argv.slice(1));

  const vaultArg = argv[1];
  if (!vaultArg) {
    console.error('error: vault path is required');
    process.exit(2);
  }
  const vaultPath = resolve(vaultArg);
  if (!existsSync(vaultPath)) {
    console.error(`error: vault not found: ${vaultPath}`);
    process.exit(2);
  }
  const config = await loadConfig(vaultPath, resolve(process.cwd(), 'frontdocs.config.json'));

  if (cmd === 'analyze') {
    const t0 = Date.now();
    const a = await analyzeVault(vaultPath, config);
    console.log(JSON.stringify({
      stats: a.stats,
      issues: a.issues.slice(0, 20),
      issuesTotal: a.issues.length,
      durationMs: Date.now() - t0,
    }, null, 2));
    return;
  }

  if (cmd === 'export') {
    const a = await analyzeVault(vaultPath, config);
    const summaries = await loadSummaries(vaultPath, config);
    const r = await exportSite(a, findViewerJs(), { summaries });
    console.log(`exported ${r.pagesWritten} pages, ${r.assetsCopied} assets → ${r.outDir}${summaries.size ? ` (with ${summaries.size} AI summaries)` : ''}`);
    return;
  }

  if (cmd === 'build') {
    const t0 = Date.now();
    console.log('analyzing...');
    const a = await analyzeVault(vaultPath, config);
    console.log(`  ${a.stats.notes} notes, ${a.stats.publishedNotes} published, ${a.stats.assets} assets, ${a.stats.canvases} canvases, ${a.stats.wikilinks} wikilinks (${a.stats.brokenLinks} broken)`);
    const summaries = await loadSummaries(vaultPath, config);
    if (summaries.size) console.log(`  loaded ${summaries.size} AI summaries from cache`);
    console.log('exporting...');
    const r = await exportSite(a, findViewerJs(), { summaries });
    console.log(`  → ${r.outDir} (${r.pagesWritten} pages, ${r.assetsCopied} assets)`);
    console.log('building with mkdocs...');
    await buildWithMkdocs({ vaultPath, outDir: r.outDir, strict: false });
    const siteDir = join(r.outDir, 'site');
    console.log(`  → ${siteDir}`);
    console.log('verifying...');
    const v = await verifyBuild(siteDir);
    console.log(JSON.stringify(v, null, 2));
    console.log(`done in ${Date.now() - t0} ms`);
    if (v.brokenLinks.length > 0) process.exitCode = 1;
    return;
  }

  if (cmd === 'verify') {
    const siteDir = join(vaultPath, config.outputDir, 'site');
    if (!existsSync(siteDir)) {
      console.error(`error: site dir not found: ${siteDir} (run "frontdocs build" first)`);
      process.exit(2);
    }
    const v = await verifyBuild(siteDir);
    console.log(JSON.stringify(v, null, 2));
    if (v.brokenLinks.length > 0) process.exitCode = 1;
    return;
  }

  console.error(`unknown command: ${cmd}`);
  printHelp();
  process.exit(2);
}

async function loadSummaries(vaultPath: string, config: FrontdocsConfig): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const cachePath = cacheFilePath(join(vaultPath, config.outputDir));
  if (!existsSync(cachePath)) return out;
  try {
    const j = JSON.parse(await readFile(cachePath, 'utf8')) as { entries?: Record<string, { summary?: string }> };
    for (const [k, v] of Object.entries(j.entries ?? {})) {
      if (v.summary) out.set(k, v.summary);
    }
  } catch { /* ignore */ }
  return out;
}

function aiCfgFromConfig(config: FrontdocsConfig): AIProviderConfig {
  const ai = config.ai ?? {};
  return {
    kind: (ai.provider ?? 'ollama'),
    endpoint: ai.endpoint ?? 'http://localhost:11434',
    model: ai.model ?? 'llama3.2:3b',
    account: ai.account,
  };
}

async function runAI(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') return printAIHelp();

  if (sub === 'status') {
    const vaultArg = args[1];
    const backend = await backendStatus();
    console.log(`secret backend: ${backend} (env override: ${process.env['FRONTDOCS_AI_API_KEY'] ? 'set' : 'unset'})`);
    if (!vaultArg) {
      console.log('pass <vault> to inspect provider configuration and stored credentials.');
      return;
    }
    const vaultPath = resolve(vaultArg);
    const config = await loadConfig(vaultPath, resolve(process.cwd(), 'frontdocs.config.json'));
    const cfg = aiCfgFromConfig(config);
    const account = cfg.account ?? `${cfg.kind}:${cfg.endpoint}`;
    const { value, location } = await getSecret(account);
    console.log(JSON.stringify({
      provider: cfg.kind,
      endpoint: cfg.endpoint,
      model: cfg.model,
      account,
      key: value ? `stored (${location.backend})` : 'not stored',
      cache: cacheFilePath(join(vaultPath, config.outputDir)),
    }, null, 2));
    return;
  }

  if (sub === 'login') {
    const vaultArg = args[1];
    if (!vaultArg) { console.error('usage: frontdocs ai login <vault>'); process.exit(2); }
    const vaultPath = resolve(vaultArg);
    const config = await loadConfig(vaultPath, resolve(process.cwd(), 'frontdocs.config.json'));
    const cfg = aiCfgFromConfig(config);
    if (cfg.kind !== 'custom') {
      console.error(`error: provider "${cfg.kind}" does not require an API key. Set ai.provider="custom" first.`);
      process.exit(2);
    }
    const account = cfg.account ?? `${cfg.kind}:${cfg.endpoint}`;
    const key = await readSecretFromInput();
    if (!key) { console.error('error: empty key'); process.exit(2); }
    const loc = await setSecret(account, key);
    console.log(`stored API key for ${account} in ${loc.backend}`);
    return;
  }

  if (sub === 'logout') {
    const vaultArg = args[1];
    if (!vaultArg) { console.error('usage: frontdocs ai logout <vault>'); process.exit(2); }
    const vaultPath = resolve(vaultArg);
    const config = await loadConfig(vaultPath, resolve(process.cwd(), 'frontdocs.config.json'));
    const cfg = aiCfgFromConfig(config);
    const account = cfg.account ?? `${cfg.kind}:${cfg.endpoint}`;
    const ok = await deleteSecret(account);
    console.log(ok ? `removed key for ${account}` : `no key found for ${account}`);
    return;
  }

  if (sub === 'ping') {
    const vaultArg = args[1];
    if (!vaultArg) { console.error('usage: frontdocs ai ping <vault>'); process.exit(2); }
    const vaultPath = resolve(vaultArg);
    const config = await loadConfig(vaultPath, resolve(process.cwd(), 'frontdocs.config.json'));
    const cfg = aiCfgFromConfig(config);
    const r = await ping(cfg);
    console.log(JSON.stringify({ provider: cfg.kind, endpoint: cfg.endpoint, model: cfg.model, ...r }, null, 2));
    if (!r.ok) process.exitCode = 1;
    return;
  }

  if (sub === 'summarize') {
    const vaultArg = args[1];
    if (!vaultArg) { console.error('usage: frontdocs ai summarize <vault> [--max N] [--concurrency N]'); process.exit(2); }
    const vaultPath = resolve(vaultArg);
    const config = await loadConfig(vaultPath, resolve(process.cwd(), 'frontdocs.config.json'));
    const cfg = aiCfgFromConfig(config);
    const maxArg = args.indexOf('--max');
    const ccArg = args.indexOf('--concurrency');
    const max = maxArg >= 0 ? Number(args[maxArg + 1]) : (config.ai?.maxNotes ?? 0);
    const cc = ccArg >= 0 ? Number(args[ccArg + 1]) : (config.ai?.concurrency ?? 2);

    console.log(`provider: ${cfg.kind}  endpoint: ${cfg.endpoint}  model: ${cfg.model}`);
    console.log('analyzing vault...');
    const a = await analyzeVault(vaultPath, config);
    const notes = a.notes.filter((n) => n.publish);
    console.log(`${notes.length} published notes; concurrency=${cc}; limit=${max || 'all'}`);
    // Build bodies map.
    const bodies = new Map<string, string>();
    for (const n of notes) {
      try {
        const txt = await readFile(n.absPath, 'utf8');
        bodies.set(n.path, txt.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''));
      } catch { /* skip */ }
    }
    let last = 0;
    const t0 = Date.now();
    const r = await summarizeAll({
      cfg,
      vaultPath,
      outDir: join(vaultPath, config.outputDir),
      notes,
      bodies,
      maxNotes: max,
      concurrency: cc,
      summaryWords: config.ai?.summaryWords ?? 60,
      onProgress: (done, total, path) => {
        if (done - last >= 5 || done === total) {
          last = done;
          process.stderr.write(`\r  ${done}/${total}  ${path.slice(0, 60).padEnd(60)}`);
        }
      },
    });
    process.stderr.write('\n');
    console.log(`cached: ${r.cached}  generated: ${r.generated}  failed: ${r.failed}  in ${Date.now() - t0} ms`);
    console.log(`cache: ${cacheFilePath(join(vaultPath, config.outputDir))}`);
    return;
  }

  console.error(`unknown ai subcommand: ${sub}`);
  printAIHelp();
  process.exit(2);
}

async function readSecretFromInput(): Promise<string> {
  // If stdin is piped (e.g. `echo $KEY | frontdocs ai login`), read all of it.
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const ch of process.stdin) chunks.push(Buffer.from(ch));
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  // Interactive prompt; not echoed.
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const stdoutWrite = (process.stdout.write as any).bind(process.stdout);
  process.stderr.write('API key: ');
  // Hide echo by overriding output write during the prompt.
  const realWrite = (rl as any).output.write.bind((rl as any).output);
  (rl as any).output.write = (s: string) => { if (s !== '\n' && s !== '\r\n') return; realWrite('\n'); };
  return new Promise<string>((resolveP) => {
    rl.question('', (answer) => {
      rl.close();
      stdoutWrite('\n');
      resolveP((answer ?? '').trim());
    });
  });
}

function printHelp(): void {
  console.log(`Frontdocs CLI

Usage:
  frontdocs analyze <vault>          Analyze a vault and print stats / issues
  frontdocs export  <vault>          Analyze + write static-site source under <vault>/dist
  frontdocs build   <vault>          Analyze + export + run MkDocs + verify
  frontdocs verify  <vault>          Verify the existing build under <vault>/dist/site
  frontdocs ai      <subcommand>     AI features; see "frontdocs ai help"

Config:
  Looks for <vault>/frontdocs.config.json, then <cwd>/frontdocs.config.json,
  otherwise built-in defaults.
`);
}

function printAIHelp(): void {
  console.log(`Frontdocs AI

Usage:
  frontdocs ai status     [<vault>]            Show secret backend & provider config
  frontdocs ai login      <vault>              Store API key (provider must be "custom")
  frontdocs ai logout     <vault>              Remove the stored API key
  frontdocs ai ping       <vault>              Send a 'ping' to the configured provider
  frontdocs ai summarize  <vault> [--max N] [--concurrency N]
                                               Generate per-note summaries (cached by hash)

Providers:
  - "ollama" (default): no auth; expects an Ollama server at ai.endpoint
  - "custom": OpenAI-compatible HTTP at ai.endpoint, requires API key via "ai login"

Secret backend:
  - OS keychain via "keytar" (preferred). Falls back to plaintext file at
    ~/.config/frontdocs/secrets.json (chmod 600). Override with env var
    FRONTDOCS_AI_API_KEY (wins for both providers).
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
