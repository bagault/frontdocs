# Frontdocs

[![GitHub](https://img.shields.io/github/license/bagault/frontdocs)](https://github.com/bagault/frontdocs)

**Academic Knowledge Base Builder** — A desktop application that transforms Markdown files into a navigable static HTML knowledge base with AI assistance, powered by [mdBook](https://rust-lang.github.io/mdBook/).

## Workflow

1. **Open a folder** — Launch Frontdocs and select a folder. If it contains Markdown files but no `book.toml`, you'll be offered to convert it into an mdBook project
2. **Edit & preview** — Use the split-pane editor with live preview, KaTeX math, and syntax highlighting
3. **Organize** — Drag files and folders in the sidebar to reorder them; right-click to delete
4. **AI-assisted writing** — Chat with the AI assistant to generate pages, edit content, produce metadata, or restructure your knowledge base (all file changes require your approval)
5. **Build** — Click the build button to compile everything into a static HTML site via mdBook
6. **Export** — Export the built site as a folder or ZIP archive for hosting or offline use

## Working with mdBook

### Project Structure

An mdBook project has this layout:

```
my-knowledge-base/
├── book.toml          # Configuration file
├── src/
│   ├── SUMMARY.md     # Table of contents (auto-generated)
│   ├── README.md      # Introduction page
│   ├── chapter-1.md
│   ├── chapter-2/
│   │   ├── README.md  # Section index
│   │   ├── topic-a.md
│   │   └── topic-b.md
│   └── ...
└── dist/              # Built HTML output (after build)
    └── html/
```

### SUMMARY.md

`SUMMARY.md` is the navigation file that mdBook uses to generate the sidebar. Frontdocs auto-generates it from your directory structure when you build, but you can also edit it manually:

```markdown
# Summary

[Introduction](./README.md)

- [Chapter 1](./chapter-1.md)
- [Chapter 2](./chapter-2/README.md)
  - [Topic A](./chapter-2/topic-a.md)
  - [Topic B](./chapter-2/topic-b.md)
```

### Page Format

mdBook pages are plain Markdown — no frontmatter needed. The first `# Heading` becomes the page title:

```markdown
# My Page Title

Content goes here. Use standard Markdown features:
- **Bold**, *italic*, `code`
- [Links to other pages](./other-page.md)
- Math: $E = mc^2$ or display blocks with $$...$$
```

### Two Modes

- **Project folder** — Has `book.toml` + `src/` directory. Build output goes to `dist/`
- **Raw markdown folder** — Any folder with `.md` files. Frontdocs creates a temporary mdBook project during build. You can convert it to a project at any time

## Features

### Editor
- **Split-pane Markdown editor** — Edit, preview, or side-by-side view modes
- **KaTeX math rendering** — Inline `$...$` and display `$$...$$` formulas
- **Internal link navigation** — Click `.md` links to open the referenced file
- **External link safety** — Confirmation dialog before opening external URLs
- **Undo support** — Ctrl+Z to revert changes

### File Management
- **Drag and drop** — Move files and folders by dragging them in the sidebar
- **Delete with confirmation** — Delete files or folders with a confirmation dialog
- **Project conversion** — Convert raw Markdown folders into mdBook projects

### AI Assistant
- **Natural language file operations** — Say "edit ...", "create page ..." and AI proposes changes
- **Permission-based actions** — All file creates/edits show Apply/Reject buttons
- **Snapshot system** — Every AI edit creates a snapshot; revert at any time
- **Streaming responses** — AI text appears in real time
- **Quick actions** — Generate, Summarize, Metadata, Structure suggestions
- **Providers** — Ollama (local, recommended) or any OpenAI-compatible API

### Build & Export
- **mdBook-powered static site** — Automatic navigation, search index, and syntax highlighting
- **Default theme** — Clean, responsive mdBook theme with dark mode
- **Progress indicator** — Live progress bar during build
- **Flexible output** — Folder or ZIP archive

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | [Tauri v2](https://tauri.app/) (Rust) |
| Frontend | [Vue 3](https://vuejs.org/) + [Vuetify 3](https://vuetifyjs.com/) |
| State management | [Pinia](https://pinia.vuejs.org/) |
| Static site generation | [mdBook](https://rust-lang.github.io/mdBook/) (bundled as sidecar) |
| AI integration | Ollama (local) / OpenAI-compatible APIs |
| Math rendering | KaTeX |

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) (stable)

### System Dependencies (Linux)

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

## Quick Start

```bash
cd frontdocs
npm install

# Download the mdBook sidecar binary for your platform
chmod +x scripts/download-mdbook.sh
./scripts/download-mdbook.sh

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
│   │   ├── files/             # File tree with drag-and-drop & delete
│   │   └── layout/            # App bar, sidebar with templates
│   ├── stores/                # Pinia stores (app, ai, settings)
│   ├── views/                 # Home (project detection), Workspace, Settings
│   ├── styles/main.scss       # Global dark theme with #5C7CFA accent
│   └── types/index.ts         # TypeScript interfaces
├── src-tauri/                  # Rust backend
│   └── src/commands/
│       ├── ai.rs              # Ollama + OpenAI-compatible API
│       ├── export.rs          # Folder/ZIP export
│       ├── files.rs           # File operations (CRUD, move, delete)
│       ├── mdbook.rs          # mdBook build pipeline (SUMMARY.md generation, frontmatter stripping)
│       └── settings.rs        # Persistent JSON settings
├── scripts/
│   ├── build.sh               # Linux/macOS build script (dev/prod)
│   ├── build.ps1              # Windows build script (dev/prod)
│   └── download-mdbook.sh     # mdBook sidecar downloader
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
| **Generate Metadata** | Proposes a structured header with title, description, keywords |
| **Suggest Structure** | Recommends navigation hierarchy across all files |
| **Edit via chat** | Type "edit/change/fix ..." to get an AI-proposed edit with Apply/Reject |
| **Create via chat** | Type "create page ..." to generate and propose a new file |

All file modifications go through a permission step — you see what will change and click **Apply** or **Reject**. Applied changes can be reverted at any time.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save current file |
| `Ctrl+Z` | Undo last change |
