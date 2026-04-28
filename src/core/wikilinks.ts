// Obsidian-style wikilink resolution.
// Rules (in order):
//   1. Exact path match (with or without .md extension).
//   2. Unique short-name match by basename (case-insensitive).
//   3. Aliased links: alias is purely display text; resolution follows rules 1-2 on target.
//   4. Heading and block refs become URL fragments.
//   5. Ambiguous short names: warn, resolve to first lexicographically.
//   6. Unresolvable: returns undefined; caller produces a `missing` graph node.
import { posix } from 'node:path';

export interface ResolverIndex {
  byPath: Map<string, string>;       // lowercased path → canonical vault-relative path
  byBaseName: Map<string, string[]>; // lowercased basename (no ext) → list of canonical paths
}

export function buildResolverIndex(notePaths: string[]): ResolverIndex {
  const byPath = new Map<string, string>();
  const byBaseName = new Map<string, string[]>();
  for (const p of notePaths) {
    const norm = p.replace(/\\/g, '/');
    byPath.set(norm.toLowerCase(), norm);
    byPath.set(norm.toLowerCase().replace(/\.md$/, ''), norm);
    const base = posix.basename(norm).replace(/\.md$/i, '').toLowerCase();
    const list = byBaseName.get(base) ?? [];
    list.push(norm);
    byBaseName.set(base, list);
  }
  for (const list of byBaseName.values()) list.sort();
  return { byPath, byBaseName };
}

export interface ResolveResult {
  resolvedPath?: string;
  ambiguous?: boolean;
  candidates?: string[];
}

export function resolveWikilink(target: string, idx: ResolverIndex): ResolveResult {
  if (!target) return {};
  const t = target.replace(/\\/g, '/').trim();
  const lower = t.toLowerCase();

  // path match
  const direct = idx.byPath.get(lower) ?? idx.byPath.get(lower.replace(/\.md$/, ''));
  if (direct) return { resolvedPath: direct };

  // short-name match
  const baseKey = posix.basename(lower).replace(/\.md$/, '');
  const list = idx.byBaseName.get(baseKey);
  if (!list || list.length === 0) return {};
  if (list.length === 1) return { resolvedPath: list[0] };
  return { resolvedPath: list[0], ambiguous: true, candidates: list };
}

// Resolve any vault asset (image, pdf, etc.) by short name or path.
export function buildAssetIndex(assetPaths: string[]): ResolverIndex {
  const byPath = new Map<string, string>();
  const byBaseName = new Map<string, string[]>();
  for (const p of assetPaths) {
    const norm = p.replace(/\\/g, '/');
    byPath.set(norm.toLowerCase(), norm);
    const base = posix.basename(norm).toLowerCase();
    const list = byBaseName.get(base) ?? [];
    list.push(norm);
    byBaseName.set(base, list);
  }
  for (const list of byBaseName.values()) list.sort();
  return { byPath, byBaseName };
}

export function resolveAsset(target: string, idx: ResolverIndex): string | undefined {
  if (!target) return undefined;
  const t = target.replace(/\\/g, '/').trim();
  const lower = t.toLowerCase();
  const direct = idx.byPath.get(lower);
  if (direct) return direct;
  const base = posix.basename(lower);
  const list = idx.byBaseName.get(base);
  if (list && list.length > 0) return list[0];
  return undefined;
}
