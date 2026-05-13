# Frontdocs — Obsidian plugin

Thin UI for the [Frontdocs](https://github.com/bagault/frontdocs) CLI. The plugin
spawns the CLI as a child process and streams its output into a side panel; all
filesystem and network work is done by the CLI itself.

Supported platforms: **Linux x64** and **Windows x64** (desktop only). macOS is
not supported in this release.

## Install (manual / desktop only)

1. From the [v0.5.0 release](https://github.com/bagault/frontdocs/releases/tag/v0.5.0), download `manifest.json` and `main.js` (or grab `frontdocs-obsidian-0.5.0.zip` and extract its contents).
2. Place them under `<vault>/.obsidian/plugins/frontdocs/`. The plugin self-extracts the bundled CLI + viewer into `assets/` on first load — no further files are needed.
3. Enable **Frontdocs** in *Settings → Community plugins*.
4. Open the **Frontdocs** side panel and click **download blob** in the *MkDocs blob* section to fetch the platform-appropriate MkDocs binary. The plugin verifies the downloaded blob against a pinned SHA-256 checksum and refuses any mismatch.

## Usage

The right-side **Frontdocs** panel (also reachable via the *Open Frontdocs*
ribbon icon or command palette) exposes every CLI verb:

- **Build**: `analyze`, `export`, `build`, `verify`
- **AI**: `status`, `ping`, `summarize`, `logout`, plus a password field +
  **login** button for the `custom` (OpenAI-compatible) provider.

The plugin always passes the current vault as the `<vault>` argument; you can
point at a different one in *Settings → Vault override*. AI provider/endpoint/
model live in `<vault>/frontdocs.config.json` under the `ai` key.
