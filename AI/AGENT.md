# AGENT.md — Frontdocs Implementation Notes

## Mission

Implement the IDEA.md spec to production-grade in one iteration, then verify against `AI/TEST` (a real Obsidian vault).

## Effective Architecture (single package, deferred monorepo)

The IDEA.md describes a `packages/*` pnpm monorepo. For initial delivery this is collapsed into a single npm package at the repo root, with subfolders under `src/` mirroring the module list:

```
src/
  core/       # Analyzer, validation, types (single source of truth)
  exporter/   # Static exporter to <vault>/dist/, mkdocs.yml, wikilink rewriter
  graph/      # Graph artifact generator (frontdocs-graph.json + Cosmos points/links)
  viewer/     # Browser Cosmos viewer (bundled via esbuild to IIFE)
  sidecars/   # MkDocs runner (currently invokes a local Python venv; PyInstaller blob shipping deferred)
  cli/        # `frontdocs` CLI: build, analyze, verify
  index.ts    # public API
```

Migration to `packages/*` workspaces is a future refactor; nothing in the user-facing CLI or output should change.

## Key Implementation Decisions Already Locked

- Output directory: `<vault>/dist/`. The exporter writes `mkdocs.yml`, `docs/`, `overrides/`, and the sidecar build emits `site/`.
- Cosmos viewer is embedded in the **MkDocs Material content block** by giving the generated `docs/graph.md` a custom template (`overrides/graph.html`) that extends `main.html` and overrides `{% block content %}`.
- The graph nav entry comes from the `nav:` section in generated `mkdocs.yml`.
- Wikilink resolution: exact path → unique short name → aliased; ambiguous warns; unresolvable becomes a `missing` graph node + warning.
- MkDocs is invoked through a managed Python venv at `<vault>/dist/.frontdocs/venv/` with a pinned set of plugins. PyInstaller binary distribution is deferred.

## Bundled MkDocs plugin set (pinned)

- mkdocs (>=1.6)
- mkdocs-material
- pymdown-extensions
- mkdocs-awesome-pages-plugin

KaTeX/Mermaid are enabled through `pymdown-extensions` Arithmatex + SuperFences with Mermaid custom fence (no extra plugin needed).

## Test Strategy For This Iteration

- Unit tests (Vitest) for analyzer wikilink resolution, frontmatter parsing, graph construction.
- End-to-end smoke: CLI `build AI/TEST` produces `AI/TEST/dist/site/`, MkDocs exits 0, `sitemap.xml` exists, graph page contains the viewer script tag and the Cosmos canvas root, internal link verifier passes.
- Playwright is deferred.

## Deferred (documented in `docs/decisions.md` once written)

- Full Obsidian plugin UI shell.
- AI provider stack (Ollama + OpenAI-compatible) with fallback.
- OS keychain native binding + AES-256-GCM/Argon2id encrypted-file backend.
- Full Dataview engine (TABLE/WHERE/SORT/FLATTEN/LIMIT) — current iteration reports unsupported queries.
- macOS sidecar blobs (project currently ships Linux x64 + Windows x64 only).

## Supported platforms

- Linux x64 and Windows x64. macOS is intentionally out of scope for now.
- The Obsidian plugin pins SHA-256 checksums for every published blob in `BLOB_CHECKSUMS` (see [obsidian-plugin/src/main.ts](../obsidian-plugin/src/main.ts)) and refuses to install or run a binary whose checksum does not match. Update those values whenever the GitHub Actions workflow rebuilds the blobs.

## Files an agent will most often touch

- `src/core/analyzer.ts` — vault scan + indexes
- `src/core/wikilinks.ts` — Obsidian-style resolution
- `src/exporter/exporter.ts` — write `mkdocs.yml`, `docs/`, rewrite links
- `src/exporter/templates.ts` — `overrides/graph.html` and the graph page body
- `src/graph/graph.ts` — internal + Cosmos JSON
- `src/viewer/main.ts` — browser Cosmos viewer
- `src/sidecars/mkdocs.ts` — venv bootstrap and `mkdocs build` invocation
- `src/cli/index.ts` — `build` / `analyze` / `verify` commands
