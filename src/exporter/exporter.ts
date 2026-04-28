// Static exporter: writes <vault>/dist/{mkdocs.yml, docs/, overrides/, assets/, .frontdocs/}
import { mkdir, writeFile, copyFile, readFile, rm } from 'node:fs/promises';
import { join, dirname, posix, sep } from 'node:path';
import { existsSync } from 'node:fs';
import type { AnalysisResult, NoteRecord } from '../core/types.js';
import { rewriteNoteBody, noteDocPath } from './rewrite.js';
import { GRAPH_OVERRIDE_TEMPLATE, indexPage, graphPage } from './templates.js';
import { buildCosmosArtifact } from '../graph/cosmos.js';

export interface ExportResult {
  outDir: string;
  docsDir: string;
  overridesDir: string;
  pagesWritten: number;
  assetsCopied: number;
  navYaml: string;
}

export async function exportSite(analysis: AnalysisResult, viewerJsPath: string, opts: { summaries?: Map<string, string> } = {}): Promise<ExportResult> {
  const outDir = join(analysis.vaultPath, analysis.config.outputDir);
  const docsDir = join(outDir, 'docs');
  const overridesDir = join(outDir, 'overrides');
  const assetsDir = join(docsDir, 'assets');
  const fdDir = join(outDir, '.frontdocs');
  const summaries = opts.summaries ?? new Map<string, string>();
  const injectIntoPages = analysis.config.ai?.injectIntoPages !== false;

  // wipe and recreate everything except site/ (kept for incremental builds), and .frontdocs/venv
  await rm(docsDir, { recursive: true, force: true });
  await rm(overridesDir, { recursive: true, force: true });
  await mkdir(docsDir, { recursive: true });
  await mkdir(overridesDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  await mkdir(fdDir, { recursive: true });

  // Index page
  await writeFile(join(docsDir, 'index.md'), indexPage(analysis.config.siteName), 'utf8');

  // Graph page + override template
  const navTitle = analysis.config.graph?.navTitle ?? 'Graph';
  await writeFile(join(docsDir, 'graph.md'), graphPage(navTitle), 'utf8');
  await writeFile(join(overridesDir, 'graph.html'), GRAPH_OVERRIDE_TEMPLATE, 'utf8');

  // Notes
  let pagesWritten = 0;
  for (const note of analysis.notes) {
    if (!note.publish) continue;
    const docRel = noteDocPath(note);
    const target = join(docsDir, docRel);
    await mkdir(dirname(target), { recursive: true });
    const original = await readFile(note.absPath, 'utf8');
    const pageDir = posix.dirname(docRel) === '.' ? '' : posix.dirname(docRel);
    const rewritten = rewriteNoteBody(original, { note, analysis, pageRelDir: pageDir });
    const fmKeep = renderFrontmatter(note);
    const summary = summaries.get(note.path);
    const aiBlock = injectIntoPages && summary
      ? `\n!!! abstract "Summary"\n${summary.split(/\r?\n/).map((l) => `    ${l}`).join('\n')}\n\n`
      : '';
    await writeFile(target, fmKeep + aiBlock + rewritten, 'utf8');
    pagesWritten++;
  }

  // Assets
  let assetsCopied = 0;
  for (const a of analysis.assets) {
    const dest = join(docsDir, a.path);
    await mkdir(dirname(dest), { recursive: true });
    try {
      await copyFile(a.absPath, dest);
      assetsCopied++;
    } catch {
      /* skip unreadable */
    }
  }

  // Graph artifacts
  const cosmos = buildCosmosArtifact(analysis, { summaries });
  await writeFile(join(assetsDir, 'frontdocs-graph.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    nodes: analysis.graph.nodes,
    edges: analysis.graph.edges,
  }, null, 2));
  await writeFile(join(assetsDir, 'frontdocs-cosmos.json'), JSON.stringify(cosmos));
  await writeFile(join(assetsDir, 'frontdocs-metadata.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    siteName: analysis.config.siteName,
    stats: analysis.stats,
  }, null, 2));
  await writeFile(join(assetsDir, 'frontdocs-validation.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    issues: analysis.issues,
  }, null, 2));
  await writeFile(join(assetsDir, 'frontdocs-sitemap.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    pages: analysis.notes.filter((n) => n.publish).map((n) => ({
      id: n.id,
      title: n.title,
      url: n.path.replace(/\.md$/i, '/'),
    })),
  }, null, 2));

  // Viewer bundle
  if (existsSync(viewerJsPath)) {
    await copyFile(viewerJsPath, join(assetsDir, 'frontdocs-graph-viewer.js'));
  }

  // mkdocs.yml
  const mkdocsYml = buildMkDocsYml(analysis);
  await writeFile(join(outDir, 'mkdocs.yml'), mkdocsYml, 'utf8');

  return { outDir, docsDir, overridesDir, pagesWritten, assetsCopied, navYaml: mkdocsYml };
}

function renderFrontmatter(note: NoteRecord): string {
  // Forward only stable fields; MkDocs Material understands `title` and our `template`.
  const t = note.title;
  return `---\ntitle: ${yamlString(t)}\n---\n`;
}

function yamlString(s: string): string {
  if (/[:#&*!|>%@`]|^[-?]| $|^$/.test(s)) return JSON.stringify(s);
  return s;
}

function buildMkDocsYml(analysis: AnalysisResult): string {
  const cfg = analysis.config;
  const navTitle = cfg.graph?.navTitle ?? 'Graph';
  const nav = buildNav(analysis, navTitle);
  const lines: string[] = [];
  lines.push(`site_name: ${yamlString(cfg.siteName)}`);
  // site_url enables sitemap.xml population. Default to a placeholder if unset.
  const siteUrl = cfg.siteUrl ?? 'https://example.org/';
  lines.push(`site_url: ${yamlString(siteUrl)}`);
  lines.push(`docs_dir: docs`);
  lines.push(`site_dir: site`);
  lines.push(`use_directory_urls: true`);
  lines.push(`theme:`);
  lines.push(`  name: material`);
  lines.push(`  custom_dir: overrides`);
  lines.push(`  features:`);
  lines.push(`    - navigation.instant`);
  lines.push(`    - navigation.tracking`);
  lines.push(`    - navigation.sections`);
  lines.push(`    - navigation.top`);
  lines.push(`    - search.highlight`);
  lines.push(`    - search.suggest`);
  lines.push(`    - content.code.copy`);
  lines.push(`markdown_extensions:`);
  lines.push(`  - admonition`);
  lines.push(`  - attr_list`);
  lines.push(`  - md_in_html`);
  lines.push(`  - tables`);
  lines.push(`  - toc:`);
  lines.push(`      permalink: true`);
  lines.push(`  - pymdownx.details`);
  lines.push(`  - pymdownx.highlight`);
  lines.push(`  - pymdownx.inlinehilite`);
  lines.push(`  - pymdownx.snippets`);
  lines.push(`  - pymdownx.tasklist:`);
  lines.push(`      custom_checkbox: true`);
  lines.push(`  - pymdownx.tabbed:`);
  lines.push(`      alternate_style: true`);
  lines.push(`  - pymdownx.arithmatex:`);
  lines.push(`      generic: true`);
  lines.push(`  - pymdownx.superfences:`);
  lines.push(`      custom_fences:`);
  lines.push(`        - name: mermaid`);
  lines.push(`          class: mermaid`);
  lines.push(`          format: !!python/name:pymdownx.superfences.fence_code_format`);
  lines.push(`plugins:`);
  lines.push(`  - search`);
  lines.push(`extra_javascript:`);
  lines.push(`  - https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js`);
  lines.push(`  - https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js`);
  lines.push(`extra_css: []`);
  lines.push(`nav:`);
  for (const line of nav) lines.push('  ' + line);
  return lines.join('\n') + '\n';
}

function buildNav(analysis: AnalysisResult, graphTitle: string): string[] {
  // Build a nested nav from folder structure of published notes
  type Tree = { files: { title: string; path: string }[]; dirs: Map<string, Tree> };
  const root: Tree = { files: [], dirs: new Map() };
  function ensure(root: Tree, segs: string[]): Tree {
    let cur = root;
    for (const s of segs) {
      let next = cur.dirs.get(s);
      if (!next) {
        next = { files: [], dirs: new Map() };
        cur.dirs.set(s, next);
      }
      cur = next;
    }
    return cur;
  }
  for (const n of analysis.notes) {
    if (!n.publish) continue;
    const parts = n.path.split('/');
    const file = parts.pop()!;
    const node = ensure(root, parts);
    node.files.push({ title: n.title, path: n.path });
  }
  const lines: string[] = [];
  lines.push(`- Home: index.md`);
  function emit(tree: Tree, indent: number, prefix: string) {
    const pad = '  '.repeat(indent);
    // Files first, sorted
    for (const f of [...tree.files].sort((a, b) => a.title.localeCompare(b.title))) {
      lines.push(`${pad}- ${yamlString(f.title)}: ${quoteIfNeeded(f.path)}`);
    }
    for (const [name, sub] of [...tree.dirs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${pad}- ${yamlString(name)}:`);
      emit(sub, indent + 1, prefix ? `${prefix}/${name}` : name);
    }
  }
  emit(root, 0, '');
  if (analysis.config.graph?.enabled !== false) {
    lines.push(`- ${yamlString(graphTitle)}: graph.md`);
  }
  return lines;
}

function quoteIfNeeded(p: string): string {
  if (/[:\s#'"&*!|>%@`]/.test(p)) return JSON.stringify(p);
  return p;
}
