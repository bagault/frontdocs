// Frontdocs Obsidian plugin.
//
// All vault-modifying work lives in the Frontdocs CLI (separate Node project).
// This plugin is a thin UI: it spawns `node <cliPath>` (or a configured binary)
// with sub-commands and streams stdout/stderr back into a side panel.

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
} from 'obsidian';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, isAbsolute, resolve } from 'node:path';

export const FRONTDOCS_VIEW_TYPE = 'frontdocs-view';

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------

interface FrontdocsSettings {
  cliPath: string;        // path to dist/cli/index.js   OR  a `frontdocs` binary
  nodePath: string;       // optional explicit node executable
  vaultOverride: string;  // optional alternate vault path; default = current vault root
  defaultMaxNotes: string;
  defaultConcurrency: string;
}

const DEFAULT_SETTINGS: FrontdocsSettings = {
  cliPath: '',
  nodePath: '',
  vaultOverride: '',
  defaultMaxNotes: '0',
  defaultConcurrency: '2',
};

// --------------------------------------------------------------------------
// Plugin
// --------------------------------------------------------------------------

export default class FrontdocsPlugin extends Plugin {
  settings: FrontdocsSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

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
      callback: () =>
        this.runWithPanel([
          'ai',
          'summarize',
          ...this.summarizeArgs(),
        ]),
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

  // -- helpers ------------------------------------------------------------

  vaultPath(): string {
    if (this.settings.vaultOverride.trim()) return this.settings.vaultOverride.trim();
    // Obsidian's vault adapter exposes the absolute base path on desktop.
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

  resolveCommand(): { cmd: string; args: string[] } | null {
    const cli = this.settings.cliPath.trim();
    if (!cli) return null;
    if (!existsSync(cli)) return null;
    if (cli.endsWith('.js')) {
      const node = this.settings.nodePath.trim() || 'node';
      return { cmd: node, args: [cli] };
    }
    return { cmd: cli, args: [] };
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

  /** Run a Frontdocs command in the panel (opens it if needed). */
  async runWithPanel(extraArgs: string[]): Promise<void> {
    const view = await this.activateView();
    if (!view) {
      new Notice('Frontdocs: could not open panel');
      return;
    }
    view.runCommand(extraArgs);
  }

  /** Run a one-shot command capturing combined stdout/stderr; used by ping/status. */
  runCapture(extraArgs: string[]): Promise<{ ok: boolean; output: string }> {
    return new Promise((resolveP) => {
      const cmd = this.resolveCommand();
      if (!cmd) {
        resolveP({ ok: false, output: 'Frontdocs CLI path is not configured. Open Settings → Frontdocs.' });
        return;
      }
      const args = [...cmd.args, ...extraArgs];
      const env = { ...process.env, PATH: pathWithCommonBins(process.env.PATH ?? '') };
      let buf = '';
      const child = spawn(cmd.cmd, args, { env });
      child.stdout.on('data', (d) => { buf += d.toString(); });
      child.stderr.on('data', (d) => { buf += d.toString(); });
      child.on('error', (e) => resolveP({ ok: false, output: `spawn error: ${e.message}` }));
      child.on('close', (code) => resolveP({ ok: code === 0, output: buf }));
    });
  }
}

function pathWithCommonBins(p: string): string {
  // Help GUI launches find common toolchains (Homebrew, asdf, fnm).
  const extras = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin'];
  const parts = p.split(delimiter).filter(Boolean);
  for (const e of extras) if (!parts.includes(e)) parts.push(e);
  return parts.join(delimiter);
}

// --------------------------------------------------------------------------
// View
// --------------------------------------------------------------------------

class FrontdocsView extends ItemView {
  private logEl!: HTMLPreElement;
  private statusEl!: HTMLDivElement;
  private currentChild: ChildProcessWithoutNullStreams | null = null;
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
    await this.refreshStatus();

    // --- Build group ---
    const buildGroup = root.createDiv();
    buildGroup.createEl('h4', { text: 'Build' });
    const buildBtns = buildGroup.createDiv({ cls: 'frontdocs-row' });
    buildBtns.style.display = 'flex';
    buildBtns.style.gap = '6px';
    buildBtns.style.flexWrap = 'wrap';

    new ButtonComponent(buildBtns).setButtonText('analyze').onClick(() => this.runCommand(['analyze']));
    new ButtonComponent(buildBtns).setButtonText('export').onClick(() => this.runCommand(['export']));
    new ButtonComponent(buildBtns).setButtonText('build').setCta().onClick(() => this.runCommand(['build']));
    new ButtonComponent(buildBtns).setButtonText('verify').onClick(() => this.runCommand(['verify']));

    // --- AI group ---
    const aiGroup = root.createDiv();
    aiGroup.createEl('h4', { text: 'AI' });

    const aiBtns = aiGroup.createDiv({ cls: 'frontdocs-row' });
    aiBtns.style.display = 'flex';
    aiBtns.style.gap = '6px';
    aiBtns.style.flexWrap = 'wrap';

    new ButtonComponent(aiBtns).setButtonText('status').onClick(() => this.runCommand(['ai', 'status']));
    new ButtonComponent(aiBtns).setButtonText('ping').onClick(() => this.runCommand(['ai', 'ping']));
    new ButtonComponent(aiBtns).setButtonText('summarize').setCta()
      .onClick(() => this.runCommand(['ai', 'summarize', ...this.plugin.summarizeArgs().slice(1)]));
    new ButtonComponent(aiBtns).setButtonText('logout').setWarning()
      .onClick(() => this.runCommand(['ai', 'logout']));

    // login row (custom provider): API key text field + button
    const loginRow = aiGroup.createDiv({ cls: 'frontdocs-row' });
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
    const cmd = this.plugin.resolveCommand();
    const v = this.plugin.vaultPath();
    if (!cmd) {
      this.statusEl.setText('CLI not configured. Settings → Frontdocs.');
      return;
    }
    this.statusEl.setText(`vault: ${v || '(unset)'}\ncli:   ${cmd.cmd} ${cmd.args.join(' ')}`);
  }

  private appendLine(s: string): void {
    this.logEl.appendText(s);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  /** Spawn the CLI with [vault, ...extra]; the vault is auto-prepended for vault-scoped subcommands. */
  runCommand(args: string[]): void {
    if (this.currentChild) {
      new Notice('Frontdocs: a command is already running');
      return;
    }
    const cmd = this.plugin.resolveCommand();
    if (!cmd) { new Notice('Frontdocs CLI not configured'); return; }

    const v = this.plugin.vaultPath();
    const finalArgs = withVaultArg(args, v);
    const env = { ...process.env, PATH: pathWithCommonBins(process.env.PATH ?? '') };

    this.appendLine(`\n$ ${cmd.cmd} ${[...cmd.args, ...finalArgs].join(' ')}\n`);
    const child = spawn(cmd.cmd, [...cmd.args, ...finalArgs], { env });
    this.currentChild = child;

    child.stdout.on('data', (d) => this.appendLine(d.toString()));
    child.stderr.on('data', (d) => this.appendLine(d.toString()));
    child.on('error', (e) => this.appendLine(`\n[error] ${e.message}\n`));
    child.on('close', (code) => {
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
    const cmd = this.plugin.resolveCommand();
    if (!cmd) { new Notice('Frontdocs CLI not configured'); return; }
    const key = this.apiKeyInput.getValue();
    if (!key) { new Notice('Frontdocs: paste an API key first'); return; }
    const v = this.plugin.vaultPath();
    const finalArgs = ['ai', 'login', v];
    const env = { ...process.env, PATH: pathWithCommonBins(process.env.PATH ?? '') };

    this.appendLine(`\n$ echo *** | ${cmd.cmd} ${[...cmd.args, ...finalArgs].join(' ')}\n`);
    const child = spawn(cmd.cmd, [...cmd.args, ...finalArgs], { env });
    this.currentChild = child;
    child.stdout.on('data', (d) => this.appendLine(d.toString()));
    child.stderr.on('data', (d) => this.appendLine(d.toString()));
    child.on('error', (e) => this.appendLine(`\n[error] ${e.message}\n`));
    child.on('close', (code) => {
      this.appendLine(`\n[exit ${code}]\n`);
      this.currentChild = null;
      this.apiKeyInput.setValue('');
    });
    child.stdin.write(key + '\n');
    child.stdin.end();
  }
}

function withVaultArg(args: string[], vault: string): string[] {
  // Subcommands that take <vault> as a positional argument.
  // - top-level: analyze | export | build | verify (vault is argv[1])
  // - ai:       status [vault] | login <vault> | logout <vault> | ping <vault> | summarize <vault> [...]
  // We always inject the vault path right after the subcommand identifier.
  if (args.length === 0) return args;
  const head = args[0];
  if (head === 'ai') {
    const sub = args[1] ?? '';
    if (!sub) return args;
    const rest = args.slice(2);
    return ['ai', sub, vault, ...rest];
  }
  // Top-level command. If the user already passed a vault path, leave it.
  if (args.length >= 2 && (isAbsolute(args[1]) || args[1].startsWith('.'))) return args;
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
        'Frontdocs is a separate Node CLI. Point this plugin at the bundled entry script ' +
        '(dist/cli/index.js) or at a binary on your PATH.',
    });

    new Setting(containerEl)
      .setName('CLI path')
      .setDesc('Absolute path to dist/cli/index.js or to a frontdocs executable.')
      .addText((t) =>
        t.setPlaceholder('/path/to/frontdocs/dist/cli/index.js')
          .setValue(this.plugin.settings.cliPath)
          .onChange(async (v) => { this.plugin.settings.cliPath = v.trim(); await this.plugin.saveSettings(); }),
      );

    new Setting(containerEl)
      .setName('Node executable')
      .setDesc('Optional. Defaults to "node" on PATH; only needed when CLI path ends with .js and node is not on PATH for GUI launches.')
      .addText((t) =>
        t.setPlaceholder('node')
          .setValue(this.plugin.settings.nodePath)
          .onChange(async (v) => { this.plugin.settings.nodePath = v.trim(); await this.plugin.saveSettings(); }),
      );

    new Setting(containerEl)
      .setName('Vault override')
      .setDesc('Absolute path to operate on. Defaults to the current Obsidian vault.')
      .addText((t) =>
        t.setPlaceholder(this.plugin.vaultPath() || '/path/to/vault')
          .setValue(this.plugin.settings.vaultOverride)
          .onChange(async (v) => { this.plugin.settings.vaultOverride = v.trim(); await this.plugin.saveSettings(); }),
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

    containerEl.createEl('p', {
      text:
        'Provider, endpoint and model are configured in <vault>/frontdocs.config.json under "ai". ' +
        'API keys for the "custom" provider are stored in your OS keychain by the CLI.',
    });
  }
}

void resolve; // silence unused-import lint; kept for future path joining
