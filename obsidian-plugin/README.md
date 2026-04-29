# Frontdocs — Obsidian plugin

Thin UI for the [Frontdocs](https://github.com/bagault/frontdocs) CLI. The plugin
spawns the CLI as a child process and streams its output into a side panel; all
filesystem and network work is done by the CLI itself.

## Install (manual / desktop only)

1. Build the CLI in the parent repo:
   ```bash
   cd ..
   npm install
   npm run build
   ```
2. Build this plugin:
   ```bash
   npm install
   npm run build
   ```
3. Copy `manifest.json` and `main.js` into your vault under
   `<vault>/.obsidian/plugins/frontdocs/`. Then enable **Frontdocs** in
   *Settings → Community plugins*.
4. Open *Settings → Frontdocs* and set **CLI path** to the absolute path of
   `dist/cli/index.js` from the parent repo (e.g.
   `/home/you/code/frontdocs/dist/cli/index.js`).

## Usage

The right-side **Frontdocs** panel (also reachable via the *Open Frontdocs*
ribbon icon or command palette) exposes every CLI verb:

- **Build**: `analyze`, `export`, `build`, `verify`
- **AI**: `status`, `ping`, `summarize`, `logout`, plus a password field +
  **login** button for the `custom` (OpenAI-compatible) provider.

The plugin always passes the current vault as the `<vault>` argument; you can
point at a different one in *Settings → Vault override*. AI provider/endpoint/
model live in `<vault>/frontdocs.config.json` under the `ai` key.
