# Frontdocs Academic Publishing Bundle

## Purpose

Frontdocs is a production-grade Obsidian extension bundle for academic publishing. It converts an Obsidian research vault into a validated, navigable, graph-aware static knowledge base while preserving the workflows that make the vault useful: Zotero-backed literature notes, structured metadata, Dataview-style tables, wikilinks, canvases, publish profiles, and optional AI-assisted curation.

The product promise is:

> A researcher can maintain knowledge in Obsidian and publish a complete static academic knowledge base without requiring readers or editors to install Obsidian, Python, MkDocs, Node, Java, Zotero, or developer tooling.

Frontdocs is the integration and publishing layer between Obsidian, Zotero, Dataview, MkDocs, and the graph renderer. It does not replace any of them.

## Project Identity

- Repository: `github.com/bagault/frontdocs`
- Author: bagault
- License: **CC BY-NC 4.0** (may be re-licensed to a more permissive license in a future release)
- Initial release target: **v0.5.0**, with a likely jump to **v1.0.0** shortly after.
- Local-only workflow at this stage: no CI/CD, no automated pushes. GitHub publication of the built site is delegated to existing Obsidian Git plugins; Frontdocs does not implement push.

## Non-Negotiable Product Principles

- Obsidian remains the authoring environment.
- Zotero remains the source and bibliography manager.
- Frontdocs owns analysis, validation, export, graph generation, sidecar orchestration, and publish readiness.
- Static output is **frontend-only** — the built site contains no server code, no live database, and no runtime backend.
- The graph renderer is `@cosmograph/cosmos` (MIT). The non-commercial `@cosmograph/cosmograph` package is forbidden as a dependency.
- AI is optional, explicit, privacy-aware, and never required for publishing.
- Sidecars are versioned, checksum-verified, OS/architecture-specific, and installed only with explicit user approval.
- Unsupported vault features must produce clear validation messages instead of silent corruption.
- Node/edge taxonomy, metadata schemas, and publishing rules are configuration, not code.
- Build output lives **inside the active vault** at `<vault>/dist/` so the workflow stays sandbox-friendly under Obsidian's plugin permissions. The `dist` folder must remain in the analyzer's ignored-directory list.

## Production-Grade Definition

Frontdocs is "production-grade" when, in a single iteration:

- every feature listed in this document is implemented,
- every test in the Test Plan passes cleanly on Linux x64, macOS arm64, and Windows x64 when the developer runs them locally,
- a non-developer academic user can complete the Target User Workflow end-to-end without manual sidecar setup beyond the in-extension install prompt,
- the Acceptance Criteria are met without exception.

There are no staged milestones. The project is either production-grade or not.

## Target User Workflow

1. Researcher writes and links notes in Obsidian, with Zotero imports producing source notes and citation keys.
2. Researcher marks public content with the configured publish profile (default `publish: extern`).
3. Researcher runs Frontdocs from inside Obsidian: analyze, preview graph, export, build, open.
4. Frontdocs reports validation issues, builds the static site through a managed sidecar into `<vault>/dist/`, and produces a self-contained directory openable locally or hostable as plain files.
5. Optional: the researcher uses an existing Obsidian Git plugin to push `<vault>/dist/` to a static host.

## Repository Shape

```text
frontdocs/
  AI/
    IDEA.md
    AGENT.md
    TEST/                # example/reference vaults; users supply their own real vaults
  docs/
    testing.md
    modules.md
    sidecars.md
    zotero.md
    security.md
    licensing.md
    schemas.md
    decisions.md         # ADR-style record of design decisions
  schemas/
    frontdocs.config.schema.json
    graph.schema.json
    cosmos.schema.json
    sitemap.schema.json
    metadata.schema.json
    validation.schema.json
  packages/
    core/                # analyzer, validation, types
    exporter/            # static export, Dataview rendering
    graph/               # graph artifacts + browser viewer (cosmos shell)
    ai/                  # provider clients, fallback orchestration
    sidecars/            # sidecar manager (no binaries committed)
    obsidian-plugin/     # Obsidian plugin shell, commands, settings UI
  frontdocs.config.json
  package.json
  pnpm-workspace.yaml
  tsconfig.json
```

Implementation language is TypeScript everywhere: extension, analyzer, exporter, graph artifact generation, sidecar manager, AI layer, browser graph runtime, and tests.

## Stack And Tooling

- **Package manager**: pnpm with workspaces.
- **Bundler**: esbuild (matches the Obsidian plugin template; reused for the browser viewer).
- **Test runner**: Vitest for unit and integration; Playwright for browser tests.
- **Static analysis**: ESLint + Prettier + `tsc --noEmit`.
- **Release tooling**: deferred. The initial release is a single squashed commit at v0.5.0; Changesets or similar will be introduced when releases become recurrent.
- **No CI/CD pipeline.** Test, lint, schema, license, and performance commands are local scripts the developer runs before tagging a release. They are mandatory but not enforced by an external service at this stage.

## Compatibility And Versioning Policy

- Node.js: current LTS at release time, declared in `package.json` `engines`.
- Obsidian API: minimum supported version pinned in plugin manifest.
- Artifact JSON files (`frontdocs-graph.json`, `frontdocs-cosmos.json`, `frontdocs-sitemap.json`, `frontdocs-metadata.json`, `frontdocs-validation.json`) carry a top-level `schemaVersion` (semver). Schemas under `schemas/` are the authoritative contract.
- Sidecar binaries are pinned by version and SHA-256. The plugin refuses to run a sidecar whose checksum does not match the pinned value.
- Config file carries `schemaVersion`; unknown fields produce warnings, removed fields produce errors with migration hints.

## Performance Budgets

For a representative academic vault of up to 5,000 notes, 500 canvases, 10,000 assets, 20,000 wikilinks:

- Analyzer cold run: under 30 s.
- Analyzer incremental run (single-file change): under 1 s.
- Exporter full run on analyzer output: under 30 s.
- Sidecar build: budget 60 s.
- Graph artifact generation: under 5 s.
- Graph page first render in browser: under 3 s for up to 20,000 nodes.

The local `npm run perf:test` command measures these against a synthetic vault and fails if any budget is exceeded by more than 2x.

## Error Recovery And Build Semantics

- Validation severities: `error`, `warning`, `info`.
- Default behavior: analyzer and exporter continue past `warning`/`info` and past per-file `error`s, marking the affected pages as `skipped`. They abort only on configuration or I/O errors.
- A `--strict` flag (and `strict: true` in config) promotes any `error` to a build-aborting failure.
- Every skipped or partially exported page appears in `frontdocs-validation.json` with reason and remediation.
- Sidecar build failures surface stdout/stderr verbatim and the exact command line used.

## Logging Policy

- Structured logs (JSON lines) written to `<vault>/dist/.frontdocs/logs/` with rotation.
- Log levels: `error`, `warn`, `info`, `debug`. Default `info`.
- No telemetry. No network calls except (a) explicit sidecar download from a configured release URL, (b) explicit AI calls the user has confirmed.
- Logs never contain note body text at `info` or below; `debug` may include excerpts and is opt-in.

## Configuration Contract

`frontdocs.config.json` is validated against `schemas/frontdocs.config.schema.json`. Minimum:

```json
{
  "schemaVersion": "1.0.0",
  "siteName": "Frontdocs Knowledge Base",
  "publishField": "publish",
  "publishValues": ["extern"],
  "protocolTag": "#Protokoll",
  "outputDir": "dist",
  "ignoredDirectories": [".obsidian", ".git", "node_modules", "dist"],
  "strict": false
}
```

Production configuration also supports:

- `noteTypes`: per-type required frontmatter fields and validation rules.
- `zotero`: source folder conventions, citation-key field name, bibliography fields, attachment export rules.
- `graph`: node-type and edge-type definitions with mapping rules from frontmatter, tags, links, and inline fields. Built-in types are seeded; users may add, remove, or rename types entirely through config.
- `publish`: profile names, allowed/forbidden metadata fields, asset export rules.
- `sidecar`: pinned version, checksum, release URL template, install directory.
- `ai`: providers, default provider, fallback order, per-action enablement, confirmation requirements.
- `dataview`: enabled features, unsupported-feature behavior (`warn` or `error`).
- `i18n`: UI language, available translations, AI-translation provider hook.
- `theme`: MkDocs theme selection (default `material`), theme overrides.
- `mkdocsPlugins`: extra MkDocs plugins to enable in the generated `mkdocs.yml`, including custom plugins shipped inside the sidecar.
- `performance`: optional overrides for budgets.

## Module Contracts

### Core Analyzer

Single source of truth. Other modules consume its output and never rescan the vault independently.

Detects: markdown files, canvas files, assets, YAML frontmatter, tags, headings, wikilinks, embeds, Markdown links and images, inline Dataview-style fields, fenced Dataview blocks, publish profiles, Zotero/source-note relationships, validation issues.

Outputs typed indexes:

- `notes`, `canvases`, `assets`
- `graph` (nodes and edges, typed per config)
- `issues` (typed validation records)
- `stats` (vault and publishability statistics)

Note IDs are stable across runs (path-based, with a content-hash tiebreaker for renames within the same run).

#### Wikilink resolution

Frontdocs matches Obsidian's resolution rules so that links work identically in the editor and in the static output:

1. Exact path match (case-insensitive on Windows/macOS, case-sensitive on Linux per filesystem).
2. Short-name match (`[[Note]]` → unique `Note.md` anywhere in the vault).
3. Aliased links (`[[Note|alias]]`) resolve the target by rule 1 or 2; alias becomes link text.
4. Heading and block references (`[[Note#Heading]]`, `[[Note#^block-id]]`) resolve to anchors in the exported page.
5. Ambiguous short-name links produce a `warning` and resolve to the first match in lexicographic path order, recorded in validation.
6. Unresolvable links become `missing` graph nodes and a `warning` validation entry.

### Validation

Deterministic and actionable. Each issue has `severity`, `code`, `message`, `path?`, `line?`, `suggestion?`.

Categories:

- missing required frontmatter
- unsupported frontmatter value type
- missing publish profile
- broken wikilink or embed
- ambiguous wikilink
- unsupported Dataview query
- missing Zotero source link
- missing citation key
- duplicate Zotero source (by DOI, citation key, or title+year)
- private attachment referenced by public note
- graph node without resolvable page where one is expected

### Zotero Integration

Frontdocs preserves Zotero-backed structure; it does not replace Zotero.

Understands and validates: imported Zotero folders, source notes, protocol/literature-analysis notes, citation keys, DOI, ISBN, URL, title, authors, year, item type, abstract, attachments, local PDFs subject to export rules.

Outputs: source index page, bibliography metadata JSON, source nodes and protocol→source edges in the graph, duplicate-source report, privacy report for attachments and unpublished sources.

### Static Exporter

Produces a deterministic source tree under `<vault>/dist/`:

```text
<vault>/dist/
  mkdocs.yml
  docs/
    index.md
    graph.md
    graph-preview.html
    assets/
      frontdocs-graph.json
      frontdocs-cosmos.json
      frontdocs-sitemap.json
      frontdocs-metadata.json
      frontdocs-validation.json
      frontdocs-graph-runtime.js
      frontdocs-graph-viewer.js
  site/                  # produced by the sidecar build step (final HTML)
  .frontdocs/            # logs, build metadata
```

Responsibilities:

- Honor configured publish profiles and asset export rules.
- Convert wikilinks to relative Markdown links (or anchors for heading/block references).
- Render embeds and copy allowed assets only.
- Render the supported Dataview subset statically; report unsupported queries as validation issues without dropping the source block.
- Generate `mkdocs.yml` navigation including index pages for notes, sources, tags, and any user-defined node types that have an index template.
- Apply error-recovery semantics from the Error Recovery section.

#### Embed handling

- Image, audio, and video files: rendered with the appropriate native HTML element.
- PDFs and other binary documents: rendered as a sandboxed `<iframe>` with `sandbox="allow-same-origin"` and no `allow-scripts`, `allow-top-navigation`, or `allow-forms`.
- Note transclusions (`![[Note]]`): rendered as inline HTML extracted from the target note at export time, with a visible source link.
- Canvas embeds: rendered as a link to the canvas page (see Canvas Rendering).
- Embeds whose target is not in the publish set are replaced with a placeholder and a validation `warning`.

#### Canvas Rendering

Canvases export to interactive HTML pages, frontend-only, no backend:

- A standalone HTML file per canvas under `docs/canvases/<canvas>.html`.
- Pan/zoom and node selection rendered with the same Cosmos-based viewer used for the main graph (or a lightweight 2D layout when the canvas defines fixed positions).
- Each node links to its corresponding exported page when one exists.
- Canvases also contribute `canvas` and `canvas-node` nodes plus `canvas-edge` edges to the main graph.

#### Math And Diagrams

- LaTeX math via **KaTeX** rendered at build time where possible, with a small client-side KaTeX bundle for fallback.
- Diagrams via **Mermaid**, rendered client-side from fenced ` ```mermaid ` blocks.
- Both are enabled by default; both can be disabled via `mkdocsPlugins` config.

#### Search

The built site uses MkDocs Material's built-in search. Frontdocs does not generate a separate index.

#### Internationalization

- All UI strings (plugin commands, settings labels, generated page chrome, validation messages) are loaded from message catalogs and addressable by key. English is the only catalog shipped at v0.5.0.
- Catalog keys and a translation contract are stable so the AI layer can power an `ai-translate` action that produces additional catalogs without code changes.

### Dataview-Compatible Static Queries

Dataview is an authoring dependency only. Frontdocs renders the following at build time:

`TABLE`, `FROM`, `WHERE`, `SORT`, `FLATTEN`, `LIMIT`, with operands over tags, frontmatter fields, inline fields, simple comparisons, and simple `choice` expressions.

Anything outside this subset is reported per the configured `dataview` policy.

### Graph

The graph is static and browser-native, rendered with `@cosmograph/cosmos` (MIT) inside a Frontdocs viewer shell.

Artifacts: internal graph JSON, Cosmos points/links JSON, sitemap JSON, metadata JSON, embedded graph page, standalone preview HTML, bundled runtime asset.

Node and edge types are entirely **config-driven**. The shipped default config seeds:

- node types: `note`, `tag`, `asset`, `missing`, `source`, `canvas`, `canvas-node`
- edge types: `links-to`, `embeds`, `has-tag`, `cites-source`, `canvas-edge`

Additional types (e.g., `institution`, `standard`, `concept`, `use-case` and their relations) are documented as config examples in `docs/`; they are not built-in.

The graph page must render a nonblank visualization or display a defined fallback message describing why (empty graph, runtime failed to load, no permitted nodes after filtering). Detail panel exposes title, path, URL, tags, source metadata when present, and graph degree.

### Sidecar Manager

The sidecar is a self-contained MkDocs distribution. **MkDocs upstream does not publish standalone binaries**, so Frontdocs ships its own pre-built sidecar blobs (PyInstaller-bundled MkDocs + locked plugin set) per OS/architecture.

Distribution model:

- Sidecar binaries are **not vendored in the source repository**.
- They are attached to the Frontdocs GitHub Release for the corresponding plugin version, one blob per supported OS/architecture, plus a `checksums.txt`.
- The plugin downloads the matching blob on first run, into a user-writable directory outside the vault, after explicit user approval.

Default install layout (per user machine, never inside the vault):

```text
<sidecarRoot>/
  mkdocs/
    <version>/
      linux-x64/frontdocs-mkdocs
      linux-arm64/frontdocs-mkdocs
      darwin-x64/frontdocs-mkdocs
      darwin-arm64/frontdocs-mkdocs
      win-x64/frontdocs-mkdocs.exe
      checksums.txt
```

The manager must:

- detect OS and architecture,
- resolve the binary path for the pinned version,
- report `missing`, `available`, `running`, `error` states,
- download from the configured GitHub Releases URL, verify SHA-256 against the pinned checksum, and refuse to execute on mismatch,
- support local-archive and local-binary install for offline environments,
- mark executables on Unix,
- never download or execute a new binary without explicit user approval,
- support `frontdocs-mkdocs --version` and `frontdocs-mkdocs build --strict`.

#### Bundled MkDocs Base

The sidecar bundles a pinned, optimal base set of components and is extensible via configuration:

- MkDocs (BSD-2)
- `mkdocs-material` theme (MIT)
- `pymdown-extensions` (MIT)
- `mkdocs-material[imaging]` optional bits only when needed
- `mkdocs-katex` (or equivalent) for math
- `mkdocs-mermaid2-plugin` for diagrams
- `mkdocs-awesome-pages-plugin` for navigation flexibility
- Frontdocs custom plugins (loaded by the sidecar from a known internal path) for graph integration, validation surfacing, and Dataview-rendered tables

Additional MkDocs plugins requested in `mkdocsPlugins` are activated only if they are present in the bundled distribution; unknown plugin names produce a validation `error`.

### Obsidian Plugin

Commands: analyze vault, export static-site scaffold, preview graph, check sidecars, install missing sidecar, build with bundled sidecar, show validation report, run AI action with confirmation.

Settings:

- vault path (defaults to active vault)
- output directory (defaults to `<vault>/dist`)
- publish profiles
- sidecar root path and pinned version
- AI provider settings (keys held in OS keychain — see Secrets)
- AI confirmation requirement
- UI language

The plugin must not mutate notes without preview, confirmation, and a recoverable diff.

### AI Layer

Optional. Never blocks publishing.

Required providers, both first-class:

- **Local**: Ollama (HTTP, default base `http://127.0.0.1:11434`).
- **Remote API**: OpenAI-compatible (user-owned key; works with OpenAI, Azure OpenAI compatibility mode, and any compatible endpoint).

Fallback policy (configurable order, default shown):

1. Try the user's configured primary provider.
2. On transport failure, timeout, or explicit unavailability, fall back to the next configured provider.
3. If all providers fail, the action returns a structured error and the calling command surfaces it without retrying silently.
4. Remote providers are skipped from the fallback chain unless the user has confirmed remote use for the current action.

Actions: summarize note, suggest metadata, suggest tags, detect publish-readiness problems, suggest links to existing concepts, normalize terminology, translate UI catalogs (`ai-translate`).

Privacy:

- Remote providers disabled by default.
- Per-action confirmation before any remote content transfer, with a visible content-scope preview.
- API keys are never written to exported output, logs, or the vault.
- No silent note rewrites; all modifications go through the plugin's diff/confirm flow.

### Secrets

API keys and other secrets are stored through a pluggable secrets backend. Two backends are supported and any user can choose between them in plugin settings:

- **OS keychain** (default when available) via a `keytar`-equivalent native binding:
  - macOS: Keychain.
  - Windows: Credential Vault.
  - Linux: Secret Service (libsecret).
- **Encrypted file** (default when no keychain is available; selectable on every platform):
  - Stored outside the vault in the plugin's data directory.
  - Encrypted with an authenticated cipher (AES-256-GCM) using a key derived from a user passphrase via Argon2id.
  - The passphrase is requested once per Obsidian session and cached only in memory.

The plugin settings UI references entries by name; secret material never appears in plugin settings JSON, never in the vault, and never in logs. Both backends pass the same Secrets unit tests (round-trip, absence of plaintext on disk, no leakage in logs).

## Licensing

- **Frontdocs project**: CC BY-NC 4.0 (author bagault). Recorded in `LICENSE` and `package.json`.
- **Graph runtime**: `@cosmograph/cosmos` (MIT). The non-commercial `@cosmograph/cosmograph` package is forbidden as a dependency.
- **Sidecar dependencies**: MkDocs (BSD-2), Material theme (MIT), pymdown-extensions (MIT), KaTeX/Mermaid plugins, awesome-pages plugin — each cleared in `docs/licensing.md`. PyInstaller bootloader license obligations bundled with the sidecar distribution.
- **AI providers**: no embedded model weights. Ollama and remote APIs are user-installed/user-owned.
- **Exported sites**: contain no Frontdocs license obligations beyond attribution of the bundled graph runtime where required by its license. Note that Frontdocs itself being CC BY-NC 4.0 does **not** restrict the user's own authored content; users own their vault content and the resulting publication.

A local `npm run verify:licenses` command checks every production dependency against the configured allowlist and fails on any mismatch.

## Acceptance Criteria

### Functional

- Analyze a representative vault without crashing.
- Export only configured publish profiles unless drafts are explicitly included.
- Generate an MkDocs source scaffold under `<vault>/dist/` and build static HTML through the managed sidecar.
- `index.html` and `graph.html` open from the local file system.
- The graph page renders content or a defined fallback message.
- Local links (including ambiguous and aliased wikilinks) resolve in both exported Markdown and built HTML.
- Allowed assets are copied; disallowed private assets are excluded.
- Unsupported Dataview queries and Zotero metadata problems are reported.
- Artifact JSON files validate against their schemas.
- Math and Mermaid diagrams render in built HTML.

### Runtime

- Sidecar paths are defined for `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win-x64`.
- Missing sidecar produces a clear status and an in-extension install option.
- Installed sidecar passes `--version` and `build --strict` smoke tests.
- Sidecar downloads are pinned by version and SHA-256; mismatched checksums abort installation.

### Security And Privacy

- Remote AI calls are disabled until explicitly enabled and confirmed per action.
- Sidecar downloads are verified before execution.
- API keys are stored only in the OS keychain; never in vault, logs, or exported output.
- Vault content is never executed as code.
- Embedded PDFs are rendered in sandboxed iframes without script or top-navigation permissions.
- Private Zotero attachments are never exported unless explicitly allowed by config.

### Documentation

`docs/` covers installation, first-run sidecar setup, manual sidecar installation, the supported Dataview subset, Zotero metadata expectations, publish profile behavior, graph runtime licensing, AI privacy model, JSON artifact schemas, secrets/keychain behavior, and troubleshooting for missing sidecars, broken links, unsupported queries, graph runtime failures, and source metadata problems. Design decisions are recorded in `docs/decisions.md`.

## Test Plan

Tests must exist and pass locally before tagging a release. There is no CI; the developer runs the suite manually on each supported platform.

### Unit

- **Analyzer**: frontmatter parsing, malformed frontmatter, tags, inline fields, wikilinks (exact, short-name, aliased, heading, block-ref, ambiguous), embeds, Markdown asset links, headings, canvas parsing, note ID stability, ignored directories.
- **Dataview**: each supported clause (`TABLE`, `WHERE`, `SORT`, `FLATTEN`, `LIMIT`) and unsupported-query reporting.
- **Graph**: nodes and edges produced per config mapping rules, missing-reference creation, source edges, canvas edges, validity of Cosmos points/links JSON, sitemap-to-page mapping.
- **Sidecar**: platform detection, path resolution, status transitions, version command, strict build, checksum acceptance and rejection.
- **AI**: provider request construction, Ollama path, OpenAI-compatible path, fallback chain (primary failure → secondary success, all failure → structured error), remote-disabled-by-default gate, confirmation gate, no mutation without approval.
- **Secrets**: round-trip via the keychain abstraction; absence of plaintext in plugin settings JSON.

### Integration

Test vaults are **user-supplied**. Frontdocs ships small example/reference vaults under `AI/TEST/` for developer smoke tests; users provide their own real vaults for full acceptance. Integration tests therefore operate on `AI/TEST/` fixtures and any vault path passed via `FRONTDOCS_TEST_VAULT`.

Assertions: analyzer stats match expected counts on `AI/TEST/` fixtures; export creates expected files under `<vault>/dist/`; all artifact JSONs validate against their schemas; exported Markdown and built HTML have zero broken local links; MkDocs navigation targets all exist; sidecar builds successfully; graph page contains runtime and viewer assets; standalone preview opens from a `file://` URL.

### Browser

Playwright on built output:

- `index.html` and `graph.html` load.
- Graph root and runtime are present; canvas is nonblank or fallback is shown.
- Detail panel is present.
- Navigation between site and graph works.
- A note page loads; image assets render.
- KaTeX math and Mermaid diagrams render.
- Sandboxed PDF iframes load and cannot escape sandbox.
- Mobile viewport keeps main navigation and graph panel reachable.

### Extension Commands

Without manual clicking:

- analyze returns analysis,
- export writes the scaffold to `<vault>/dist/`,
- preview writes preview file and URL,
- sidecar status reports accurately,
- sidecar install is mockable,
- build-with-sidecar returns export and build results,
- failures return useful error messages.

### Performance

`npm run perf:test` runs the analyzer, exporter, and graph generation against a synthetic vault sized to the budgets in Performance Budgets. Exceeding a budget by more than 2x fails.

### Release

Run locally on Linux x64, macOS arm64, and Windows x64 before tagging:

- full unit, integration, browser, command, and performance suites pass,
- sidecar download and checksum succeed end-to-end,
- extension installs cleanly into a fresh Obsidian vault,
- built site opens locally and serves correctly from a plain static server,
- no fixture private data appears in output,
- dependency audit (`npm audit` / `pnpm audit`) passes the configured threshold,
- license allowlist check passes.

## Required Local Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm build:plugin
pnpm analyze:test
pnpm export:test
pnpm verify:links
pnpm verify:mkdocs
pnpm verify:schemas
pnpm verify:licenses
pnpm sidecars:status
pnpm sidecars:mkdocs
pnpm perf:test
```

All commands are deterministic and safe to run repeatedly.

## Definition Of Done

A non-developer academic user can:

1. Install the extension.
2. Open an Obsidian vault.
3. Run analysis and understand validation messages.
4. Install or verify the correct sidecar via the in-extension prompt.
5. Export a publish profile.
6. Build static HTML into `<vault>/dist/`.
7. Preview the graph.
8. Open the built site locally.
9. Publish the built site to static hosting using an existing Obsidian Git plugin.

The maintainer can prove this with the full test suite (unit, integration, browser, command, performance, release) passing locally on all three supported platforms, with pinned sidecar checksums, a passing license allowlist, and the documentation set under `docs/` complete.
