# Frontdocs

Static-site publisher for [Obsidian](https://obsidian.md/) vaults, powered by
[MkDocs Material](https://squidfunk.github.io/mkdocs-material/) with an
interactive [Cosmos.gl](https://cosmos.gl/) graph view and an optional AI
summarisation layer.

> Note: the project was rewritten from scratch in v0.5.0. The previous
> Tauri-based prototype (≤ v0.4.0) is preserved in the first commit only as
> historical context and is no longer maintained.

## Highlights

- Pure Node/TypeScript pipeline — no Rust, no Electron.
- Wikilink + embed + Canvas → Markdown rewriting.
- Cosmos.gl knowledge graph with side panel, search, type filters, and
  degree-based sizing.
- Per-vault Python venv for the MkDocs sidecar (auto-discovered system
  Python on Linux/Windows).
- Optional AI summaries with two providers:
  - **Ollama** (local, no auth)
  - **Custom** OpenAI-compatible HTTP endpoint (Bearer auth)
- Secrets stored in the OS keychain via `keytar`, with a chmod-600 file
  fallback. Override via `FRONTDOCS_AI_API_KEY`.

## Requirements

- Node.js ≥ 20
- Python 3.10+ on `PATH` (Linux: `python3` + `python3-venv` + `python3-pip`;
  Windows: install from python.org so `py -3` is available)
- Optional: Ollama, or any OpenAI-compatible inference endpoint

## Quick start

```bash
npm install
npm run build
node dist/cli/index.js build path/to/your/vault
```

The build is written to `<vault>/dist/site/`.

## CLI

```text
frontdocs analyze   <vault>      Analyze a vault and print stats / issues
frontdocs export    <vault>      Write the static-site source under <vault>/dist
frontdocs build     <vault>      Analyze + export + run MkDocs + verify
frontdocs verify    <vault>      Verify <vault>/dist/site against the analyzer
frontdocs ai        <subcommand> AI features; see "frontdocs ai help"
```

AI subcommands:

```text
frontdocs ai status     [<vault>]
frontdocs ai login       <vault>            # store API key (provider="custom")
frontdocs ai logout      <vault>
frontdocs ai ping        <vault>
frontdocs ai summarize   <vault> [--max N] [--concurrency N]
```

## Configuration

Frontdocs looks for `<vault>/frontdocs.config.json`, then
`<cwd>/frontdocs.config.json`, otherwise built-in defaults. Example:

```json
{
  "siteName": "My Knowledge Base",
  "publishField": "publish",
  "publishValues": ["extern"],
  "outputDir": "dist",
  "graph": { "enabled": true, "navTitle": "Graph" },
  "ai": {
    "enabled": false,
    "provider": "ollama",
    "endpoint": "http://localhost:11434",
    "model": "llama3.2:3b",
    "summaryWords": 60,
    "concurrency": 2,
    "injectIntoPages": true
  }
}
```

## MkDocs sidecar blobs

Frontdocs ships pre-built MkDocs sidecar binaries for **Linux x64** and
**Windows x64** only. macOS is not supported in this release.

PyInstaller cannot cross-compile, so the blobs are produced by the GitHub
Actions workflow at
[`.github/workflows/build-mkdocs-blobs.yml`](.github/workflows/build-mkdocs-blobs.yml).
It runs on `windows-latest` and `ubuntu-latest`, computes a `.sha256` next
to each binary, and uploads both as workflow artifacts. On a release tag
those artifacts are attached to the GitHub Release.

The Obsidian plugin pins the expected SHA-256 of every blob it ships and
refuses to install or run a binary whose checksum does not match.

## License

[CC-BY-NC-4.0](LICENSE).
