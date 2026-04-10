# Frontdocs

[![GitHub](https://img.shields.io/github/license/bagault/frontdocs)](https://github.com/bagault/frontdocs)

**Academic Knowledge Base Builder** — A desktop application that transforms Markdown files into a beautiful, navigable static HTML knowledge base with AI assistance.

## Workflow

1. **Open a folder** — Launch Frontdocs and select a folder containing your Markdown files
2. **Edit & preview** — Use the split-pane editor with live preview, KaTeX math, and syntax highlighting
3. **AI-assisted writing** — Chat with the AI assistant to generate pages, edit content, produce metadata, or restructure your knowledge base (all file changes require your approval)
4. **Build** — Click the build button to compile everything into a static HTML site via Zola
5. **Export** — Export the built site as a folder or ZIP archive for hosting or offline use

## Features

### Editor
- **Split-pane Markdown editor** — Edit, preview, or side-by-side view modes
- **KaTeX math rendering** — Inline `$...$` and display `$$...$$` formulas
- **Internal link navigation** — Click `.md` links to open the referenced file
- **External link safety** — Confirmation dialog before opening external URLs in the browser
- **Undo support** — Ctrl+Z to revert changes; undo button in toolbar

### AI Assistant
- **Natural language file operations** — Say "edit ...", "create page ..." and AI proposes changes
- **Permission-based actions** — All file creates/edits show Apply/Reject buttons before taking effect
- **Snapshot system** — Every AI edit creates a snapshot; revert to any previous state per-message
- **Streaming responses** — AI text appears in real time as it generates
- **Quick actions** — One-click Generate, Summarize, Metadata, and Structure suggestions
- **Providers** — Ollama (local, recommended) or any OpenAI-compatible API

### Build & Export
- **Zola-powered static site** — Automatic theme, navigation, search index, and SCSS compilation
- **Progress indicator** — Hover the build button to see a live progress bar
- **Flexible output** — Folder or ZIP archive; configurable output location and base URL

### Editing Features
- **TOML/YAML frontmatter** — Auto-converted to Zola-compatible format during build
- **BibTeX citations** — `{% cite(key="author2024") %}` shortcode
- **Admonitions** — `{% note(type="info", title="Note") %}` shortcode
- **Code highlighting** — Syntax highlighting for 100+ languages
- **Academic templates** — Research note, literature review, method description, meeting notes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | [Tauri v2](https://tauri.app/) (Rust) |
| Frontend | [Vue 3](https://vuejs.org/) + [Vuetify 3](https://vuetifyjs.com/) |
| State management | [Pinia](https://pinia.vuejs.org/) |
| Static site generation | [Zola](https://www.getzola.org/) (bundled as sidecar) |
| AI integration | Ollama (local) / OpenAI-compatible APIs |
| Math rendering | KaTeX |
| Citations | BibTeX |

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) (stable)
- [Zola](https://www.getzola.org/documentation/getting-started/installation/) (for development; bundled in production builds)

### System Dependencies (Linux)

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

## Quick Start

```bash
cd frontdocs
npm install

# Download the Zola sidecar binary for your platform
chmod +x scripts/download-zola.sh
./scripts/download-zola.sh

# Development mode (with hot-reload)
./scripts/build.sh dev
# — or directly:
npm run tauri dev
```

## Building for Production

```bash
# Interactive (prompts for dev/prod)
./scripts/build.sh

# Direct production build
./scripts/build.sh prod

# Windows (PowerShell)
.\scripts\build.ps1 -Mode prod
```

Output artifacts are placed in `src-tauri/target/release/bundle/` — `.deb`, `.rpm`, and `.AppImage` on Linux; `.dmg` on macOS; `.msi` and `.exe` on Windows.

## Project Structure

```
frontdocs/
├── src/                        # Vue.js frontend
│   ├── components/
│   │   ├── ai/AiPanel.vue     # AI chat with file operations & snapshots
│   │   ├── editor/            # Markdown editor & preview with link handling
│   │   ├── export/            # Export dialog
│   │   ├── files/             # File tree browser
│   │   └── layout/            # App bar (with undo & build progress), sidebar
│   ├── stores/                # Pinia stores (app, ai, settings)
│   ├── views/                 # Home, Workspace, Settings
│   ├── styles/main.scss       # Global dark theme with #5C7CFA accent
│   └── types/index.ts         # TypeScript interfaces
├── src-tauri/                  # Rust backend
│   └── src/commands/
│       ├── ai.rs              # Ollama + OpenAI-compatible API
│       ├── export.rs          # Folder/ZIP export
│       ├── files.rs           # File system operations
│       ├── settings.rs        # Persistent JSON settings
│       └── zola.rs            # Zola build pipeline (theme embedding, frontmatter processing)
├── zola-theme/                 # HTML theme for generated knowledge base
│   ├── templates/             # Tera templates (base, index, page, section, shortcodes)
│   ├── sass/style.scss        # Dark academic theme
│   └── static/js/main.js      # Sidebar, search, code copy
├── scripts/
│   ├── build.sh               # Linux/macOS build script (dev/prod)
│   ├── build.ps1              # Windows build script (dev/prod)
│   └── download-zola.sh       # Zola sidecar downloader
└── assets/                     # App logo (SVG, PNG, ICO)
```

## AI Integration

### Ollama (Recommended)
1. Install [Ollama](https://ollama.ai/)
2. Pull a model: `ollama pull llama3.2`
3. Auto-detected at `http://localhost:11434`

### External API
Any OpenAI-compatible endpoint — configure URL, API key, and model name in Settings.

### AI Capabilities
| Action | Description |
|--------|-------------|
| **Generate Page** | Creates a new `.md` page from a topic (requires approval) |
| **Summarize** | Condenses the current document into key points |
| **Generate Metadata** | Proposes TOML frontmatter for the current file (requires approval) |
| **Suggest Structure** | Recommends navigation hierarchy across all files |
| **Edit via chat** | Type "edit/change/fix ..." to get an AI-proposed edit with Apply/Reject |
| **Create via chat** | Type "create page ..." to generate and propose a new file |

All file modifications go through a permission step — you see what will change and click **Apply** or **Reject**. Applied changes can be reverted at any time via the **Revert** button or **Revert to snapshot**.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save current file |
| `Ctrl+Z` | Undo last change |
