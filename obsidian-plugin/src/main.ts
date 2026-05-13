// Frontdocs Obsidian plugin.
//
// Self-contained: the Frontdocs CLI is bundled into the plugin folder as
// `assets/frontdocs-cli.mjs` and executed via Electron-as-Node
// (process.execPath + ELECTRON_RUN_AS_NODE=1), so users do NOT need a Node.js
// or npm installation. The only external dependency is the MkDocs blob, which
// the plugin can download on demand from the Frontdocs GitHub release.

import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  ItemView,
  WorkspaceLeaf,
  ButtonComponent,
  TextComponent,
  DropdownComponent,
  requestUrl,
} from 'obsidian';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, unlink, stat, rename, chmod, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { delimiter, join } from 'node:path';
import { get as httpsGet } from 'node:https';

// Embedded assets (base64-encoded by esbuild's loader). They are unpacked into
// the plugin folder on first load so the plugin is fully self-contained —
// users only need to ship manifest.json + main.js.
// @ts-expect-error — base64 string injected at build time
import CLI_BUNDLE_BASE64 from '../assets/frontdocs-cli.mjs';
// @ts-expect-error — base64 string injected at build time
import VIEWER_BUNDLE_BASE64 from '../assets/frontdocs-graph-viewer.embed.js';

export const FRONTDOCS_VIEW_TYPE = 'frontdocs-view';

// Where to fetch the MkDocs blob from. Pinned to the v0.5.0 release.
const BLOB_RELEASE_TAG = 'v0.5.0';
const BLOB_BASE_URL = `https://github.com/bagault/frontdocs/releases/download/${BLOB_RELEASE_TAG}`;

// Pinned SHA-256 checksums for the MkDocs blob, keyed by `${platform}-${arch}`.
// The plugin refuses to install or run a blob whose checksum does not match.
// Update these values whenever a new release re-builds the blobs (see
// `.github/workflows/build-mkdocs-blobs.yml`, which now also emits
// `<asset>.sha256` files).
const BLOB_CHECKSUMS: Record<string, string> = {
  'win32-x64': '94da2b54b119e3c3e3e5fa46607b01d7239deeec12b3583a9ecdbb4a1ea47d79',
  'linux-x64': 'fd58277ce4a93a000071e7535b18afd997848da05df92064b0a94ed06743c748',
};

// Supported `${platform}-${arch}` combinations for the MkDocs blob.
const SUPPORTED_BLOB_PLATFORMS = new Set(Object.keys(BLOB_CHECKSUMS));

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------

interface FrontdocsSettings {
  vaultOverride: string;
  defaultMaxNotes: string;
  defaultConcurrency: string;
  /** Optional override: absolute path to a Node executable to use instead of
   *  Obsidian's bundled Electron-as-Node. Useful as a workaround if
   *  ELECTRON_RUN_AS_NODE behaves badly on a particular platform. */
  nodeOverride: string;
}

const DEFAULT_SETTINGS: FrontdocsSettings = {
  vaultOverride: '',
  defaultMaxNotes: '0',
  defaultConcurrency: '2',
  nodeOverride: '',
};

// --------------------------------------------------------------------------
// Plugin
// --------------------------------------------------------------------------

export default class FrontdocsPlugin extends Plugin {
  settings: FrontdocsSettings = DEFAULT_SETTINGS;

  /** Absolute path to <vault>/.obsidian/plugins/frontdocs/. */
  pluginDir(): string {
    const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
    const base = adapter.getBasePath?.() ?? '';
    return join(base, this.app.vault.configDir, 'plugins', this.manifest.id);
  }

  /** Path to the bundled CLI shipped in the plugin folder. */
  cliBundlePath(): string {
    return join(this.pluginDir(), 'assets', 'frontdocs-cli.mjs');
  }

  /** Path to the bundled viewer JS shipped in the plugin folder. */
  viewerJsPath(): string {
    return join(this.pluginDir(), 'assets', 'frontdocs-graph-viewer.js');
  }

  /** Local cache directory for downloaded MkDocs blobs. */
  blobsDir(): string {
    return join(this.pluginDir(), 'bin', `${process.platform}-${process.arch}`);
  }

  blobFilename(): string {
    return process.platform === 'win32' ? 'frontdocs-mkdocs.exe' : 'frontdocs-mkdocs';
  }

  blobPath(): string {
    return join(this.blobsDir(), this.blobFilename());
  }

  /** Identifier for the current host's blob (`${platform}-${arch}`). */
  blobPlatformId(): string {
    return `${process.platform}-${process.arch}`;
  }

  /** Whether a blob is published + checksum-pinned for the current host. */
  isBlobPlatformSupported(): boolean {
    return SUPPORTED_BLOB_PLATFORMS.has(this.blobPlatformId());
  }

  /** Pinned SHA-256 for the current host's blob, or undefined if unsupported. */
  blobExpectedSha256(): string | undefined {
    return BLOB_CHECKSUMS[this.blobPlatformId()];
  }

  /** GitHub Release asset name for the current OS/arch. */
  blobAssetName(): string {
    const ext = process.platform === 'win32' ? '.exe' : '';
    return `frontdocs-mkdocs-${process.platform}-${process.arch}${ext}`;
  }

  blobAssetUrl(): string {
    return `${BLOB_BASE_URL}/${this.blobAssetName()}`;
  }

  /** Path to the vault's frontdocs.config.json (created on demand). */
  vaultConfigPath(): string {
    return join(this.vaultPath() || this.pluginDir(), 'frontdocs.config.json');
  }

  /** Read the vault config (or {} if it doesn't exist / is malformed). */
  async readVaultConfig(): Promise<Record<string, unknown>> {
    const p = this.vaultConfigPath();
    if (!existsSync(p)) return {};
    try { return JSON.parse(await readFile(p, 'utf8')); } catch { return {}; }
  }

  /** Merge a patch into the vault config's `ai` section and write it back. */
  async writeVaultAiConfig(patch: { provider?: string; endpoint?: string; model?: string }): Promise<void> {
    const cfg = await this.readVaultConfig();
    const ai = (cfg.ai && typeof cfg.ai === 'object') ? cfg.ai as Record<string, unknown> : {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (v === '') delete ai[k]; else ai[k] = v;
    }
    if (!('enabled' in ai)) ai.enabled = true;
    cfg.ai = ai;
    if (!('schemaVersion' in cfg)) cfg.schemaVersion = '1.0.0';
    if (!('siteName' in cfg)) cfg.siteName = 'Frontdocs Knowledge Base';
    if (!('publishField' in cfg)) cfg.publishField = 'publish';
    await writeFile(this.vaultConfigPath(), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  }

  /** Fetch the list of locally installed Ollama models from /api/tags. */
  async listOllamaModels(endpoint: string): Promise<string[]> {
    const url = endpoint.replace(/\/$/, '') + '/api/tags';
    const r = await requestUrl({ url, method: 'GET' });
    const j = r.json as { models?: { name?: string }[] };
    return (j.models ?? []).map((m) => m.name).filter((n): n is string => !!n).sort();
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.ensureAssetsExtracted();

    this.registerView(FRONTDOCS_VIEW_TYPE, (leaf) => new FrontdocsView(leaf, this));

    this.addRibbonIcon('book-marked', 'Open Frontdocs', () => this.activateView());
    this.addCommand({
      id: 'frontdocs-open-panel',
      name: 'Open Frontdocs panel',
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: 'frontdocs-build',
      name: 'Build site (analyze + export + mkdocs)',
      callback: () => this.runWithPanel(['build']),
    });
    this.addCommand({
      id: 'frontdocs-summarize',
      name: 'AI: summarize notes',
      callback: () => this.runWithPanel(['ai', 'summarize', ...this.summarizeArgs().slice(1)]),
    });

    this.addSettingTab(new FrontdocsSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(FRONTDOCS_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Unpack embedded CLI + viewer into <plugin>/assets/ on first run. */
  async ensureAssetsExtracted(): Promise<void> {
    const assetsDir = join(this.pluginDir(), 'assets');
    await mkdir(assetsDir, { recursive: true });
    const targets: { path: string; data: string }[] = [
      { path: this.cliBundlePath(), data: CLI_BUNDLE_BASE64 as unknown as string },
      { path: this.viewerJsPath(), data: VIEWER_BUNDLE_BASE64 as unknown as string },
    ];
    for (const t of targets) {
      if (existsSync(t.path)) continue;
      try {
        await writeFile(t.path, Buffer.from(t.data, 'base64'));
      } catch (e) {
        console.error(`Frontdocs: failed to extract embedded asset to ${t.path}: ${(e as Error).message}`);
      }
    }
  }

  vaultPath(): string {
    if (this.settings.vaultOverride.trim()) return this.settings.vaultOverride.trim();
    const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
    return adapter.getBasePath?.() ?? '';
  }

  summarizeArgs(): string[] {
    const v = this.vaultPath();
    const args = [v];
    const max = this.settings.defaultMaxNotes.trim();
    const cc = this.settings.defaultConcurrency.trim();
    if (max && max !== '0') args.push('--max', max);
    if (cc) args.push('--concurrency', cc);
    return args;
  }

  /** Spawn a child process running the bundled CLI. Prefers a real `node`
   *  binary (system PATH or user override) because some Obsidian builds
   *  ship Electron with the `runAsNode` fuse disabled, which makes
   *  ELECTRON_RUN_AS_NODE silently launch a second Obsidian instead of
   *  Node. Falls back to Electron-as-Node only when it has been verified
   *  to actually behave as Node. */
  spawnCli(args: string[]): { child: ChildProcess; display: string } | null {
    const cli = this.cliBundlePath();
    if (!existsSync(cli)) {
      this.ensureAssetsExtracted().catch(() => {});
      if (!existsSync(cli)) {
        new Notice(`Frontdocs: failed to extract bundled CLI to ${cli}. Check the plugin folder permissions.`);
        return null;
      }
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      FRONTDOCS_VIEWER_JS: this.viewerJsPath(),
      PATH: pathWithCommonBins(process.env.PATH ?? ''),
    };
    if (existsSync(this.blobPath()) && this.isBlobPlatformSupported()) {
      env.FRONTDOCS_MKDOCS_BLOB = this.blobPath();
    }

    const node = this.resolveNode(env.PATH ?? '');
    if (!node) {
      new Notice('Frontdocs: no usable Node.js runtime found. Install Node.js (>=20) or set "Node executable override" in Frontdocs settings.', 10000);
      return null;
    }

    let cmd = node.cmd;
    let cmdArgs = [cli, ...args];
    if (node.kind === 'electron-as-node') {
      env.ELECTRON_RUN_AS_NODE = '1';
    }

    const display = `${cmd} ${cmdArgs.join(' ')}`;
    try {
      const child = spawn(cmd, cmdArgs, { env, cwd: this.vaultPath() || undefined });
      return { child, display };
    } catch (e) {
      new Notice(`Frontdocs: spawn failed — ${(e as Error).message}`);
      return null;
    }
  }

  /** Find a usable Node.js runtime. Returns null if nothing works. */
  private _cachedNode: { cmd: string; kind: 'node' | 'electron-as-node' } | null | undefined;
  resolveNode(pathEnv: string): { cmd: string; kind: 'node' | 'electron-as-node' } | null {
    if (this._cachedNode !== undefined) return this._cachedNode;

    const tryNode = (cmd: string): boolean => {
      try {
        const r = spawnSync(cmd, ['-e', 'process.stdout.write(process.versions.node||"")'], { encoding: 'utf8', timeout: 5000 });
        return r.status === 0 && /^\d+\.\d+\.\d+/.test((r.stdout || '').trim());
      } catch { return false; }
    };

    // 1. user override
    const override = this.settings.nodeOverride.trim();
    if (override && tryNode(override)) {
      return (this._cachedNode = { cmd: override, kind: 'node' });
    }

    // 2. system node on PATH (and common locations)
    const candidates = ['node'];
    for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
      candidates.push(join(dir, process.platform === 'win32' ? 'node.exe' : 'node'));
    }
    for (const c of candidates) {
      if (c !== 'node' && !existsSync(c)) continue;
      if (tryNode(c)) {
        return (this._cachedNode = { cmd: c, kind: 'node' });
      }
    }

    // 3. Electron-as-Node (only if the fuse is enabled). Verify by actually
    //    running it; if it fails or hangs, treat it as unusable.
    try {
      const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(process.versions.node||"")'], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      if (r.status === 0 && /^\d+\.\d+\.\d+/.test(r.stdout.trim())) {
        return (this._cachedNode = { cmd: process.execPath, kind: 'electron-as-node' });
      }
    } catch { /* fall through */ }

    return (this._cachedNode = null);
  }

  async activateView(): Promise<FrontdocsView | null> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(FRONTDOCS_VIEW_TYPE)[0];
    if (!leaf) {
      const right = workspace.getRightLeaf(false);
      if (!right) return null;
      leaf = right;
      await leaf.setViewState({ type: FRONTDOCS_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
    return leaf.view as FrontdocsView;
  }

  async runWithPanel(extraArgs: string[]): Promise<void> {
    const view = await this.activateView();
    if (!view) {
      new Notice('Frontdocs: could not open panel');
      return;
    }
    view.runCommand(extraArgs);
  }
}

function pathWithCommonBins(p: string): string {
  const extras = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin'];
  const parts = p.split(delimiter).filter(Boolean);
  for (const e of extras) if (!parts.includes(e)) parts.push(e);
  return parts.join(delimiter);
}

// --------------------------------------------------------------------------
// Blob download
// --------------------------------------------------------------------------

function downloadFile(
  url: string,
  dest: string,
  onProgress?: (received: number, total: number) => void,
): Promise<number> {
  return new Promise((resolveP, reject) => {
    const tmp = dest + '.part';
    const chunks: Buffer[] = [];
    let received = 0;
    let total = 0;

    const req = httpsGet(url, { headers: { 'user-agent': 'frontdocs-obsidian-plugin' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, dest, onProgress).then(resolveP, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const len = res.headers['content-length'];
      total = len ? Number(len) : 0;
      res.on('data', (c: Buffer) => {
        chunks.push(c);
        received += c.length;
        if (onProgress) onProgress(received, total);
      });
      res.on('end', async () => {
        try {
          await writeFile(tmp, Buffer.concat(chunks));
          if (existsSync(dest)) await unlink(dest).catch(() => {});
          await rename(tmp, dest);
          if (process.platform !== 'win32') {
            await chmod(dest, 0o755);
          }
          resolveP(received);
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

/** Compute the lowercase hex SHA-256 of a file. */
async function sha256File(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

// --------------------------------------------------------------------------
// View
// --------------------------------------------------------------------------

class FrontdocsView extends ItemView {
  private logEl!: HTMLPreElement;
  private statusEl!: HTMLDivElement;
  private blobStatusEl!: HTMLSpanElement;
  private currentChild: ChildProcess | null = null;
  private apiKeyInput!: TextComponent;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: FrontdocsPlugin) {
    super(leaf);
  }

  getViewType(): string { return FRONTDOCS_VIEW_TYPE; }
  getDisplayText(): string { return 'Frontdocs'; }
  getIcon(): string { return 'book-marked'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('frontdocs-panel');
    root.style.padding = '12px';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = '10px';

    root.createEl('h3', { text: 'Frontdocs' });

    this.statusEl = root.createDiv({ cls: 'frontdocs-status' });
    this.statusEl.style.fontSize = '0.85em';
    this.statusEl.style.opacity = '0.8';
    this.statusEl.style.whiteSpace = 'pre-wrap';
    await this.refreshStatus();

    // --- MkDocs blob ---
    const blobGroup = root.createDiv();
    blobGroup.createEl('h4', { text: 'MkDocs blob' });
    const blobInfo = blobGroup.createDiv();
    blobInfo.style.fontSize = '0.85em';
    blobInfo.style.marginBottom = '6px';
    this.blobStatusEl = blobInfo.createSpan();
    await this.refreshBlobStatus();

    const blobBtns = blobGroup.createDiv();
    blobBtns.style.display = 'flex';
    blobBtns.style.gap = '6px';
    blobBtns.style.flexWrap = 'wrap';
    new ButtonComponent(blobBtns)
      .setButtonText('download blob')
      .setCta()
      .onClick(() => this.downloadBlob(false));
    new ButtonComponent(blobBtns)
      .setButtonText('redownload')
      .onClick(() => this.downloadBlob(true));

    // --- Build ---
    const buildGroup = root.createDiv();
    buildGroup.createEl('h4', { text: 'Build' });
    const buildBtns = buildGroup.createDiv();
    buildBtns.style.display = 'flex';
    buildBtns.style.gap = '6px';
    buildBtns.style.flexWrap = 'wrap';
    new ButtonComponent(buildBtns).setButtonText('analyze').onClick(() => this.runCommand(['analyze']));
    new ButtonComponent(buildBtns).setButtonText('export').onClick(() => this.runCommand(['export']));
    new ButtonComponent(buildBtns).setButtonText('build').setCta().onClick(() => this.runCommand(['build']));
    new ButtonComponent(buildBtns).setButtonText('verify').onClick(() => this.runCommand(['verify']));

    // --- AI ---
    const aiGroup = root.createDiv();
    aiGroup.createEl('h4', { text: 'AI' });
    const aiBtns = aiGroup.createDiv();
    aiBtns.style.display = 'flex';
    aiBtns.style.gap = '6px';
    aiBtns.style.flexWrap = 'wrap';
    new ButtonComponent(aiBtns).setButtonText('status').onClick(() => this.runCommand(['ai', 'status']));
    new ButtonComponent(aiBtns).setButtonText('ping').onClick(() => this.runCommand(['ai', 'ping']));
    new ButtonComponent(aiBtns).setButtonText('summarize').setCta()
      .onClick(() => this.runCommand(['ai', 'summarize', ...this.plugin.summarizeArgs().slice(1)]));
    new ButtonComponent(aiBtns).setButtonText('logout').setWarning()
      .onClick(() => this.runCommand(['ai', 'logout']));

    const loginRow = aiGroup.createDiv();
    loginRow.style.display = 'flex';
    loginRow.style.gap = '6px';
    loginRow.style.alignItems = 'center';
    loginRow.style.marginTop = '6px';
    this.apiKeyInput = new TextComponent(loginRow);
    this.apiKeyInput.setPlaceholder('API key for "custom" provider');
    this.apiKeyInput.inputEl.type = 'password';
    this.apiKeyInput.inputEl.style.flex = '1';
    new ButtonComponent(loginRow).setButtonText('login').onClick(() => this.doLogin());

    // --- Output ---
    root.createEl('h4', { text: 'Output' });
    const toolbar = root.createDiv();
    toolbar.style.display = 'flex';
    toolbar.style.gap = '6px';
    new ButtonComponent(toolbar).setButtonText('clear').onClick(() => { this.logEl.empty(); });
    new ButtonComponent(toolbar).setButtonText('stop').setWarning().onClick(() => this.stopCurrent());

    this.logEl = root.createEl('pre');
    this.logEl.style.background = 'var(--background-secondary)';
    this.logEl.style.padding = '8px';
    this.logEl.style.borderRadius = '4px';
    this.logEl.style.minHeight = '180px';
    this.logEl.style.maxHeight = '40vh';
    this.logEl.style.overflow = 'auto';
    this.logEl.style.whiteSpace = 'pre-wrap';
    this.logEl.style.fontSize = '0.85em';
  }

  async onClose(): Promise<void> {
    this.stopCurrent();
  }

  private async refreshStatus(): Promise<void> {
    const v = this.plugin.vaultPath();
    const cli = this.plugin.cliBundlePath();
    const cliOk = existsSync(cli);
    const node = this.plugin.resolveNode(pathWithCommonBins(process.env.PATH ?? ''));
    const rt = node ? `${node.kind} (${node.cmd})` : 'NONE — install Node.js (>=20)';
    this.statusEl.setText(
      `vault: ${v || '(unset)'}\n` +
      `cli:   ${cliOk ? cli : '(missing — will be extracted on next run)'}\n` +
      `runtime: ${rt}`,
    );
  }

  private async refreshBlobStatus(): Promise<void> {
    const p = this.plugin.blobPath();
    const url = this.plugin.blobAssetUrl();
    if (!this.plugin.isBlobPlatformSupported()) {
      this.blobStatusEl.setText(
        `unsupported platform (${this.plugin.blobPlatformId()}). ` +
        `Frontdocs ships pinned MkDocs blobs only for: ${[...SUPPORTED_BLOB_PLATFORMS].join(', ')}.`,
      );
      return;
    }
    if (existsSync(p)) {
      try {
        const s = await stat(p);
        const mb = (s.size / (1024 * 1024)).toFixed(1);
        const expected = this.plugin.blobExpectedSha256();
        let suffix = '';
        if (expected) {
          try {
            const got = await sha256File(p);
            suffix = got === expected ? ' — sha256 OK' : ' — sha256 MISMATCH (will be re-downloaded)';
          } catch { suffix = ' — sha256 unreadable'; }
        }
        this.blobStatusEl.setText(`installed (${mb} MB) at ${p}${suffix}`);
      } catch { this.blobStatusEl.setText(`installed at ${p}`); }
    } else {
      this.blobStatusEl.setText(`not installed. Will download from ${url}`);
    }
  }

  private appendLine(s: string): void {
    this.logEl.appendText(s);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private async downloadBlob(force: boolean): Promise<void> {
    if (this.currentChild) { new Notice('Frontdocs: a command is already running'); return; }
    if (!this.plugin.isBlobPlatformSupported()) {
      const msg = `Frontdocs: no MkDocs blob is published for ${this.plugin.blobPlatformId()}. ` +
        `Supported: ${[...SUPPORTED_BLOB_PLATFORMS].join(', ')}.`;
      this.appendLine(`\n[error] ${msg}\n`);
      new Notice(msg, 10000);
      return;
    }
    const expected = this.plugin.blobExpectedSha256();
    if (!expected) {
      const msg = 'Frontdocs: refusing to download blob — no pinned SHA-256 checksum is configured for this platform.';
      this.appendLine(`\n[error] ${msg}\n`);
      new Notice(msg, 10000);
      return;
    }
    const dir = this.plugin.blobsDir();
    const dest = this.plugin.blobPath();
    const url = this.plugin.blobAssetUrl();
    try {
      await mkdir(dir, { recursive: true });
      if (existsSync(dest)) {
        if (!force) {
          this.appendLine(`\nBlob already present at ${dest} — use "redownload" to replace.\n`);
          return;
        }
        await unlink(dest);
      }
      this.appendLine(`\nDownloading ${url}\n  → ${dest}\n  expected sha256: ${expected}\n`);
      let lastPct = -1;
      const bytes = await downloadFile(url, dest, (recv, total) => {
        if (!total) return;
        const pct = Math.floor((recv / total) * 100);
        if (pct !== lastPct && pct % 5 === 0) {
          lastPct = pct;
          this.appendLine(`  ${pct}% (${(recv / (1024 * 1024)).toFixed(1)} MB)\n`);
        }
      });
      const got = await sha256File(dest);
      if (got !== expected) {
        await unlink(dest).catch(() => {});
        const msg = `checksum mismatch — expected ${expected}, got ${got}. The downloaded file has been deleted.`;
        this.appendLine(`\n[error] ${msg}\n`);
        new Notice(`Frontdocs: ${msg}`, 12000);
        return;
      }
      this.appendLine(`Downloaded ${(bytes / (1024 * 1024)).toFixed(1)} MB.\nsha256 verified: ${got}\n`);
      new Notice('Frontdocs: MkDocs blob installed and verified');
    } catch (e) {
      const msg = (e as Error).message;
      this.appendLine(`\n[error] download failed: ${msg}\n`);
      new Notice(`Frontdocs: blob download failed — ${msg}`);
    } finally {
      await this.refreshBlobStatus();
    }
  }

  runCommand(args: string[]): void {
    if (this.currentChild) { new Notice('Frontdocs: a command is already running'); return; }
    const v = this.plugin.vaultPath();
    const finalArgs = withVaultArg(args, v);
    const spawned = this.plugin.spawnCli(finalArgs);
    if (!spawned) return;
    this.appendLine(`\n$ ${spawned.display}\n`);
    this.currentChild = spawned.child;
    spawned.child.stdout?.on('data', (d) => this.appendLine(d.toString()));
    spawned.child.stderr?.on('data', (d) => this.appendLine(d.toString()));
    spawned.child.on('error', (e) => this.appendLine(`\n[error] ${e.message}\n`));
    spawned.child.on('close', (code) => {
      this.appendLine(`\n[exit ${code}]\n`);
      this.currentChild = null;
    });
  }

  private stopCurrent(): void {
    if (this.currentChild) {
      this.currentChild.kill('SIGTERM');
      this.appendLine('\n[stopped]\n');
      this.currentChild = null;
    }
  }

  private async doLogin(): Promise<void> {
    if (this.currentChild) { new Notice('Frontdocs: a command is already running'); return; }
    const key = this.apiKeyInput.getValue();
    if (!key) { new Notice('Frontdocs: paste an API key first'); return; }
    const v = this.plugin.vaultPath();
    const finalArgs = ['ai', 'login', v];
    const spawned = this.plugin.spawnCli(finalArgs);
    if (!spawned) return;
    this.appendLine(`\n$ echo *** | ${spawned.display}\n`);
    this.currentChild = spawned.child;
    spawned.child.stdout?.on('data', (d) => this.appendLine(d.toString()));
    spawned.child.stderr?.on('data', (d) => this.appendLine(d.toString()));
    spawned.child.on('error', (e) => this.appendLine(`\n[error] ${e.message}\n`));
    spawned.child.on('close', (code) => {
      this.appendLine(`\n[exit ${code}]\n`);
      this.currentChild = null;
      this.apiKeyInput.setValue('');
    });
    spawned.child.stdin?.write(key + '\n');
    spawned.child.stdin?.end();
  }
}

function withVaultArg(args: string[], vault: string): string[] {
  if (args.length === 0) return args;
  const head = args[0];
  if (head === 'ai') {
    const sub = args[1] ?? '';
    if (!sub) return args;
    const rest = args.slice(2);
    return ['ai', sub, vault, ...rest];
  }
  if (args.length >= 2 && (args[1].startsWith('/') || args[1].startsWith('.') || /^[A-Za-z]:[\\/]/.test(args[1]))) {
    return args;
  }
  return [head, vault, ...args.slice(1)];
}

// --------------------------------------------------------------------------
// Settings tab
// --------------------------------------------------------------------------

class FrontdocsSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: FrontdocsPlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Frontdocs' });
    containerEl.createEl('p', {
      text:
        'The Frontdocs CLI is bundled into this plugin and runs via the Electron ' +
        'runtime that Obsidian already ships. The only external artifact is the ' +
        'MkDocs blob, which can be downloaded from the Frontdocs panel.',
    });

    new Setting(containerEl)
      .setName('Vault override')
      .setDesc('Absolute path to operate on. Defaults to the current Obsidian vault.')
      .addText((t) =>
        t.setPlaceholder(this.plugin.vaultPath() || '/path/to/vault')
          .setValue(this.plugin.settings.vaultOverride)
          .onChange(async (v) => { this.plugin.settings.vaultOverride = v.trim(); await this.plugin.saveSettings(); }),
      );

    new Setting(containerEl)
      .setName('Node executable override')
      .setDesc(
        'Optional. Absolute path to a Node.js binary to run the bundled CLI. ' +
        'Leave empty to use Obsidian\u2019s built-in Electron runtime ' +
        '(ELECTRON_RUN_AS_NODE), which is the default and needs no extra install.',
      )
      .addText((t) =>
        t.setPlaceholder('e.g. C:\\Program Files\\nodejs\\node.exe or /usr/local/bin/node')
          .setValue(this.plugin.settings.nodeOverride)
          .onChange(async (v) => { this.plugin.settings.nodeOverride = v.trim(); this.plugin._cachedNode = undefined; await this.plugin.saveSettings(); }),
      );

    containerEl.createEl('h3', { text: 'AI defaults' });

    new Setting(containerEl)
      .setName('Max notes to summarize (0 = all)')
      .addText((t) =>
        t.setValue(this.plugin.settings.defaultMaxNotes)
          .onChange(async (v) => { this.plugin.settings.defaultMaxNotes = v.trim(); await this.plugin.saveSettings(); }),
      );

    new Setting(containerEl)
      .setName('Concurrency')
      .addText((t) =>
        t.setValue(this.plugin.settings.defaultConcurrency)
          .onChange(async (v) => { this.plugin.settings.defaultConcurrency = v.trim(); await this.plugin.saveSettings(); }),
      );

    containerEl.createEl('h3', { text: 'AI provider' });
    containerEl.createEl('p', {
      text:
        'Provider, endpoint and model are written to <vault>/frontdocs.config.json under "ai". ' +
        'API keys for the "custom" provider are stored in your OS keychain via the "login" button in the Frontdocs panel.',
    });
    containerEl.createEl('p', {
      text: 'Loading current values from ' + this.plugin.vaultConfigPath() + ' …',
      cls: 'frontdocs-ai-config-status',
    }).style.fontSize = '0.8em';

    void this.renderAiSection(containerEl);
  }

  private async renderAiSection(containerEl: HTMLElement): Promise<void> {
    const cfg = await this.plugin.readVaultConfig();
    const ai = (cfg.ai && typeof cfg.ai === 'object' ? cfg.ai : {}) as Record<string, string>;
    const current = {
      provider: (ai.provider as string) || 'ollama',
      endpoint: (ai.endpoint as string) || (ai.provider === 'custom' ? 'https://api.openai.com' : 'http://localhost:11434'),
      model: (ai.model as string) || '',
    };

    const status = containerEl.querySelector('.frontdocs-ai-config-status') as HTMLElement | null;
    status?.setText('Stored in: ' + this.plugin.vaultConfigPath());

    let modelDropdown: DropdownComponent | null = null;
    let modelText: TextComponent | null = null;
    let providerDropdown: DropdownComponent | null = null;
    let endpointText: TextComponent | null = null;

    const save = async (): Promise<void> => {
      try {
        await this.plugin.writeVaultAiConfig({
          provider: providerDropdown?.getValue(),
          endpoint: endpointText?.getValue().trim(),
          model: (modelDropdown?.getValue() ?? modelText?.getValue() ?? '').trim(),
        });
      } catch (e) {
        new Notice(`Frontdocs: failed to write config — ${(e as Error).message}`);
      }
    };

    new Setting(containerEl)
      .setName('Provider')
      .setDesc('"ollama" talks to a local Ollama server. "custom" is an OpenAI-compatible HTTP endpoint that requires an API key.')
      .addDropdown((d) => {
        providerDropdown = d;
        d.addOption('ollama', 'ollama (local)');
        d.addOption('custom', 'custom (OpenAI-compatible)');
        d.setValue(current.provider);
        d.onChange(async (v) => {
          current.provider = v;
          // Suggest a sensible default endpoint when switching
          if (v === 'custom' && /localhost:11434/.test(endpointText?.getValue() ?? '')) {
            endpointText?.setValue('https://api.openai.com');
          } else if (v === 'ollama' && !/localhost:11434/.test(endpointText?.getValue() ?? '')) {
            endpointText?.setValue('http://localhost:11434');
          }
          await save();
          await refreshModels();
        });
      });

    new Setting(containerEl)
      .setName('Endpoint URL')
      .setDesc('Base URL of the LLM provider. Examples: http://localhost:11434 (Ollama), https://api.openai.com, https://api.groq.com/openai, https://openrouter.ai/api.')
      .addText((t) => {
        endpointText = t;
        t.setPlaceholder('http://localhost:11434');
        t.setValue(current.endpoint);
        t.inputEl.style.width = '100%';
        t.onChange(async () => { await save(); });
      });

    const modelSetting = new Setting(containerEl)
      .setName('Model')
      .setDesc('For Ollama, click "refresh" to populate from your local server. For custom, type any model name your provider accepts (e.g. gpt-4o-mini, llama-3.1-70b-versatile).');

    modelSetting.addDropdown((d) => {
      modelDropdown = d;
      d.selectEl.style.minWidth = '12em';
      d.onChange(async () => { await save(); });
    });
    modelSetting.addText((t) => {
      modelText = t;
      t.setPlaceholder('gpt-4o-mini');
      t.setValue(current.model);
      t.onChange(async () => { await save(); });
    });
    modelSetting.addButton((b) => {
      b.setButtonText('refresh').setTooltip('Fetch installed models from the Ollama endpoint').onClick(async () => {
        await refreshModels(true);
      });
    });

    const refreshModels = async (notify = false): Promise<void> => {
      if (!modelDropdown || !modelText || !providerDropdown || !endpointText) return;
      const provider = providerDropdown.getValue();
      const dropdownEl = modelDropdown.selectEl;
      const textEl = modelText.inputEl;
      if (provider === 'ollama') {
        textEl.style.display = 'none';
        dropdownEl.style.display = '';
        // Clear existing options
        while (dropdownEl.options.length) dropdownEl.remove(0);
        try {
          const models = await this.plugin.listOllamaModels(endpointText.getValue());
          if (models.length === 0) {
            modelDropdown.addOption('', '(no models — run `ollama pull <name>`)');
          } else {
            for (const m of models) modelDropdown.addOption(m, m);
            const want = current.model || models[0];
            modelDropdown.setValue(models.includes(want) ? want : models[0]);
            current.model = modelDropdown.getValue();
            await save();
          }
          if (notify) new Notice(`Frontdocs: found ${models.length} Ollama model(s)`);
        } catch (e) {
          modelDropdown.addOption('', '(failed to query Ollama)');
          if (notify) new Notice(`Frontdocs: cannot reach Ollama at ${endpointText.getValue()} — ${(e as Error).message}`, 8000);
        }
      } else {
        dropdownEl.style.display = 'none';
        textEl.style.display = '';
      }
    };

    await refreshModels(false);
  }
}
