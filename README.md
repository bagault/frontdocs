# Frontdocs

[![GitHub](https://img.shields.io/github/license/bagault/frontdocs)](https://github.com/bagault/frontdocs)

Frontdocs is a desktop Academic Knowledge Base Builder that turns Markdown folders into navigable static documentation sites.

It supports two build processors:

- [MkDocs](https://www.mkdocs.org/) with Material theme
- [mdBook](https://rust-lang.github.io/mdBook/)

## Core Workflow

1. Open a folder
2. If needed, convert raw Markdown into a project structure
3. Edit and preview with live rendering
4. Build with the selected processor
5. Export as folder or ZIP

## Current Feature Set

### Editor and Preview

- Split editor/preview workflow
- KaTeX math rendering for inline and block formulas
- Syntax highlighting in preview
- Wiki-link conversion from [[Page]] and [[Page|Alias]]
- Smart link resolution that maps project files and resolves closest matching targets
- Links are generated in directory-style HTML form, for example topic/index.html
- Internal link click-to-open for Markdown files
- External link confirmation dialog

### File and Project Management

- Markdown tree loading with folder structure
- Drag and drop move support
- Delete with confirmation
- Convert raw Markdown folders into MkDocs or mdBook project layouts

### Build and Export

- Processor selection in Settings: MkDocs or mdBook
- Automatic processor routing during builds
- Rebuild-safe output handling: previous output folder is removed before fresh build/export
- Build progress UI with logs
- Export as folder or archive

### Settings

- Auto-apply settings updates (no manual save step)
- Default reset action
- AI provider settings (Ollama or external OpenAI-compatible API)
- Output format/path and base URL settings

## Project Modes

### MkDocs Project Mode

Project folder contains mkdocs.yml and usually a src directory.

### mdBook Project Mode

Project folder contains book.toml and a src directory.

### Raw Markdown Mode

Any folder containing Markdown files can be opened directly. Frontdocs can build from it using a temporary project layout, or convert it into a full project.

## Wiki-link Behavior

Frontdocs resolves wiki-links by:

1. Building a map of available Markdown files
2. Trying contextual candidates based on current file location
3. Falling back to basename matching with distance-based tie breaking
4. Emitting directory-style HTML targets

Examples:

- [[Intro]]
- [[chapter/topic]]
- [[Long Page Name|short label]]

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | [Tauri v2](https://tauri.app/) |
| Frontend | [Vue 3](https://vuejs.org/) + [Vuetify 3](https://vuetifyjs.com/) |
| State management | [Pinia](https://pinia.vuejs.org/) |
| Site processors | MkDocs sidecar + mdBook sidecar |
| AI integration | Ollama and OpenAI-compatible APIs |
| Math rendering | KaTeX |

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) stable

Linux packages commonly required for Tauri builds:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

## Development

```bash
cd frontdocs
npm install

# Start development mode (script handles sidecars)
./scripts/build.sh dev

# Alternative
npm run tauri dev
```

## Production Build

```bash
# Interactive mode chooser
./scripts/build.sh

# Direct production
./scripts/build.sh prod

# Windows
.\scripts\build.ps1 -Mode prod
```

Artifacts are generated under src-tauri/target/release/bundle.

## Tests and Validation

```bash
# Frontend unit tests
npm test

# Type checks
npx vue-tsc --noEmit

# Rust tests
cargo test --manifest-path src-tauri/Cargo.toml

# Rust compile check
cargo check --manifest-path src-tauri/Cargo.toml
```

## Repository Layout

```text
frontdocs/
├── src/
│   ├── components/
│   ├── stores/
│   ├── views/
│   ├── utils/
│   └── types/
├── src-tauri/
│   ├── binaries/
│   ├── src/
│   │   └── commands/
│   └── tauri.conf.json
├── scripts/
└── assets/
```

## AI Integration

### Ollama

1. Install Ollama
2. Pull a model, for example:

```bash
ollama pull llama3.2
```

3. Set provider to Ollama in Settings

### External API

Set provider to External API and configure:

- Base URL
- API key
- Model name

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save current file |
| Ctrl+Z | Undo last change |
