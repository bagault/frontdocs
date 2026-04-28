// Top-level analyzer: walks vault, parses notes/canvases, resolves links, builds graph.
import { readFile, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { walkVault } from './walker.js';
import { parseNote } from './markdown.js';
import { parseCanvas } from './canvas.js';
import { buildResolverIndex, buildAssetIndex, resolveWikilink, resolveAsset } from './wikilinks.js';
import type {
  AnalysisResult,
  AssetRecord,
  CanvasRecord,
  FrontdocsConfig,
  GraphEdge,
  GraphNode,
  Issue,
  NoteRecord,
} from './types.js';

export async function analyzeVault(vaultPath: string, config: FrontdocsConfig): Promise<AnalysisResult> {
  const issues: Issue[] = [];
  const walk = await walkVault(vaultPath, config.ignoredDirectories);

  // Notes (parsed). Filter out notes whose basename is invalid for MkDocs (e.g. "....md").
  const noteList = walk.notes.filter((p) => !/^\.+$/.test(posix.basename(p.replace(/\.md$/i, ''))));
  const notes: NoteRecord[] = [];
  const resolver = buildResolverIndex(noteList);
  const assetIdx = buildAssetIndex(walk.assets);

  for (const rel of noteList) {
    const abs = join(vaultPath, rel);
    let content: string;
    try {
      content = await readFile(abs, 'utf8');
    } catch (e) {
      issues.push({ severity: 'error', code: 'IO_READ', message: `cannot read ${rel}: ${(e as Error).message}`, path: rel });
      continue;
    }
    const parsed = parseNote(content);
    const id = rel.replace(/\.md$/i, '');
    const title = String(parsed.frontmatter['title'] ?? posix.basename(id));
    const publish = isPublished(parsed.frontmatter, config);

    // resolve wikilinks
    const wikilinks = parsed.wikilinks.map((w) => {
      const r = resolveWikilink(w.target, resolver);
      if (r.ambiguous) {
        issues.push({
          severity: 'warning',
          code: 'WIKILINK_AMBIGUOUS',
          message: `ambiguous wikilink "${w.target}" → ${r.candidates?.join(', ')}`,
          path: rel,
          suggestion: 'use the full vault path to disambiguate',
        });
      } else if (!r.resolvedPath) {
        issues.push({
          severity: 'warning',
          code: 'WIKILINK_BROKEN',
          message: `unresolved wikilink "${w.target}"`,
          path: rel,
        });
      }
      return { ...w, resolvedPath: r.resolvedPath, ambiguous: r.ambiguous };
    });

    const embeds = parsed.embeds.map((e) => {
      // try note resolution first, then asset
      const noteR = resolveWikilink(e.target, resolver);
      if (noteR.resolvedPath) return { ...e, resolvedPath: noteR.resolvedPath, ambiguous: noteR.ambiguous };
      const assetR = resolveAsset(e.target, assetIdx);
      if (assetR) return { ...e, resolvedPath: assetR };
      issues.push({
        severity: 'warning',
        code: 'EMBED_BROKEN',
        message: `unresolved embed "${e.target}"`,
        path: rel,
      });
      return e;
    });

    notes.push({
      id,
      path: rel,
      absPath: abs,
      title,
      frontmatter: parsed.frontmatter,
      tags: parsed.tags,
      headings: parsed.headings,
      wikilinks,
      embeds,
      mdLinks: parsed.mdLinks,
      publish,
    });
  }

  // Canvases
  const canvases: CanvasRecord[] = [];
  for (const rel of walk.canvases) {
    const abs = join(vaultPath, rel);
    try {
      const content = await readFile(abs, 'utf8');
      const c = parseCanvas(content);
      canvases.push({ path: rel, absPath: abs, nodes: c.nodes, edges: c.edges });
    } catch (e) {
      issues.push({ severity: 'warning', code: 'CANVAS_PARSE', message: (e as Error).message, path: rel });
    }
  }

  // Assets
  const assets: AssetRecord[] = [];
  for (const rel of walk.assets) {
    const abs = join(vaultPath, rel);
    let size = 0;
    try { size = (await stat(abs)).size; } catch { /* ignore */ }
    const dot = rel.lastIndexOf('.');
    assets.push({ path: rel, absPath: abs, size, ext: dot >= 0 ? rel.slice(dot).toLowerCase() : '' });
  }

  // Build graph
  const graph = buildGraph(notes, canvases, assets);

  // Stats
  const tagSet = new Set<string>();
  let wikilinkCount = 0;
  let brokenLinks = 0;
  for (const n of notes) {
    for (const t of n.tags) tagSet.add(t);
    wikilinkCount += n.wikilinks.length;
    for (const w of n.wikilinks) if (!w.resolvedPath) brokenLinks++;
  }

  return {
    config,
    vaultPath,
    notes,
    assets,
    canvases,
    issues,
    graph,
    stats: {
      notes: notes.length,
      publishedNotes: notes.filter((n) => n.publish).length,
      canvases: canvases.length,
      assets: assets.length,
      wikilinks: wikilinkCount,
      brokenLinks,
      tags: tagSet.size,
    },
  };
}

function isPublished(fm: Record<string, unknown>, cfg: FrontdocsConfig): boolean {
  if (cfg.publish?.includeAllByDefault) return true;
  const v = fm[cfg.publishField];
  if (v == null) return false;
  if (Array.isArray(v)) return v.some((x) => cfg.publishValues.includes(String(x)));
  return cfg.publishValues.includes(String(v));
}

function buildGraph(notes: NoteRecord[], canvases: CanvasRecord[], assets: AssetRecord[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const tagSet = new Set<string>();

  function addNode(n: GraphNode) {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  }

  for (const note of notes) {
    addNode({
      id: `note:${note.id}`,
      type: 'note',
      label: note.title,
      url: noteUrl(note.path),
      meta: { tags: note.tags, path: note.path, published: note.publish },
    });
    for (const tag of note.tags) {
      tagSet.add(tag);
      const tagId = `tag:${tag}`;
      addNode({ id: tagId, type: 'tag', label: `#${tag}` });
      edges.push({ id: `${note.id}-tag-${tag}`, source: `note:${note.id}`, target: tagId, type: 'has-tag' });
    }
    for (const w of note.wikilinks) {
      if (w.resolvedPath) {
        const targetId = `note:${w.resolvedPath.replace(/\.md$/i, '')}`;
        edges.push({ id: `${note.id}-link-${edges.length}`, source: `note:${note.id}`, target: targetId, type: 'links-to' });
      } else {
        const missingId = `missing:${w.target.toLowerCase()}`;
        addNode({ id: missingId, type: 'missing', label: w.target });
        edges.push({ id: `${note.id}-missing-${edges.length}`, source: `note:${note.id}`, target: missingId, type: 'links-to' });
      }
    }
    for (const e of note.embeds) {
      if (!e.resolvedPath) continue;
      const lower = e.resolvedPath.toLowerCase();
      if (lower.endsWith('.md')) {
        const targetId = `note:${e.resolvedPath.replace(/\.md$/i, '')}`;
        edges.push({ id: `${note.id}-embed-${edges.length}`, source: `note:${note.id}`, target: targetId, type: 'embeds' });
      } else {
        const targetId = `asset:${e.resolvedPath}`;
        addNode({ id: targetId, type: 'asset', label: e.resolvedPath, url: assetUrl(e.resolvedPath) });
        edges.push({ id: `${note.id}-embed-${edges.length}`, source: `note:${note.id}`, target: targetId, type: 'embeds' });
      }
    }
  }

  for (const c of canvases) {
    const cid = `canvas:${c.path}`;
    addNode({ id: cid, type: 'canvas', label: c.path });
    for (const cn of c.nodes) {
      const nid = `canvas-node:${c.path}#${cn.id}`;
      addNode({ id: nid, type: 'canvas-node', label: cn.text?.slice(0, 60) ?? cn.file ?? cn.url ?? cn.id });
      edges.push({ id: `${c.path}-contains-${cn.id}`, source: cid, target: nid, type: 'canvas-edge' });
      if (cn.type === 'file' && cn.file) {
        const isMd = cn.file.toLowerCase().endsWith('.md');
        const targetId = isMd ? `note:${cn.file.replace(/\.md$/i, '')}` : `asset:${cn.file}`;
        edges.push({ id: `${c.path}-${cn.id}-target`, source: nid, target: targetId, type: 'canvas-edge' });
      }
    }
    for (const ce of c.edges) {
      const from = `canvas-node:${c.path}#${ce.fromNode}`;
      const to = `canvas-node:${c.path}#${ce.toNode}`;
      edges.push({ id: `${c.path}-edge-${ce.id}`, source: from, target: to, type: 'canvas-edge' });
    }
  }

  return { nodes: [...nodes.values()], edges };
}

function noteUrl(relPath: string): string {
  return relPath.replace(/\.md$/i, '/').replace(/\\/g, '/');
}

function assetUrl(relPath: string): string {
  return relPath.replace(/\\/g, '/');
}
