// Convert Obsidian markdown to MkDocs-friendly markdown:
// - rewrite [[wikilinks]] to standard [text](url) targeting the exported page
// - rewrite ![[embeds]] to images / links / fallback
// - leave fenced code untouched
import { posix } from 'node:path';
import type { NoteRecord, AnalysisResult } from '../core/types.js';
import { slugify } from '../core/markdown.js';

export interface RewriteContext {
  note: NoteRecord;
  analysis: AnalysisResult;
  pageRelDir: string; // posix dir of the exported page (relative to docs/)
}

export function rewriteNoteBody(body: string, ctx: RewriteContext): string {
  // strip frontmatter (already parsed)
  const stripped = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  // protect code fences and inline code
  const placeholders: string[] = [];
  const guarded = stripped
    .replace(/```[\s\S]*?```/g, (m) => `\u0000CB${placeholders.push(m) - 1}\u0000`)
    .replace(/`[^`]*`/g, (m) => `\u0000IC${placeholders.push(m) - 1}\u0000`);

  let out = guarded;

  // embeds first (start with `![[`)
  out = out.replace(/!\[\[([^\]\n]+)\]\]/g, (_full, inner: string) => renderEmbed(inner, ctx));
  // wikilinks
  out = out.replace(/\[\[([^\]\n]+)\]\]/g, (_full, inner: string) => renderWikilink(inner, ctx));
  // plain markdown links to .md files: try to resolve as note (vault-root-relative or by basename)
  out = out.replace(/(!?)\[([^\]\n]+)\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/g, (full, bang: string, text: string, target: string, frag: string | undefined) => {
    if (bang === '!') return full;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return full;
    const cleaned = decodeURIComponent(target).replace(/^\.\/+/, '');
    const note = findNote(cleaned, ctx.analysis);
    if (!note) return full;
    const href = relUrl(ctx.pageRelDir, noteDocPath(note)) + (frag ?? '');
    return `[${text}](${href})`;
  });

  // restore code
  out = out.replace(/\u0000CB(\d+)\u0000/g, (_m, i) => placeholders[Number(i)]);
  out = out.replace(/\u0000IC(\d+)\u0000/g, (_m, i) => placeholders[Number(i)]);
  return out;
}

function renderWikilink(inner: string, ctx: RewriteContext): string {
  const { target, alias, heading, blockId } = splitWikilink(inner);
  const note = findNote(target, ctx.analysis);
  const display = alias ?? target.split('/').pop() ?? target;
  if (!note) {
    return `<span class="frontdocs-broken-link" title="unresolved: ${escapeAttr(target)}">${escapeText(display)}</span>`;
  }
  const targetDocPath = noteDocPath(note);
  const fragment = heading ? `#${slugify(heading)}` : blockId ? `#${slugify(blockId)}` : '';
  const href = relUrl(ctx.pageRelDir, targetDocPath) + fragment;
  return `[${escapeText(display)}](${href})`;
}

function renderEmbed(inner: string, ctx: RewriteContext): string {
  const { target, alias } = splitWikilink(inner);
  // try note transclusion (rendered as a link, not full inline, to keep output stable)
  const note = findNote(target, ctx.analysis);
  if (note) {
    const targetDocPath = noteDocPath(note);
    const href = relUrl(ctx.pageRelDir, targetDocPath);
    return `> *Embedded note:* [${escapeText(alias ?? note.title)}](${href})`;
  }
  // asset?
  const asset = findAsset(target, ctx.analysis);
  if (asset) {
    const lower = asset.path.toLowerCase();
    const href = relUrl(ctx.pageRelDir, asset.path);
    if (/\.(png|jpe?g|gif|svg|webp|bmp)$/.test(lower)) {
      return `![${escapeText(alias ?? target)}](${href})`;
    }
    if (/\.pdf$/.test(lower)) {
      return `<iframe src="${href}" sandbox="allow-same-origin" style="width:100%;height:80vh;border:0"></iframe>`;
    }
    if (/\.(mp3|wav|ogg)$/.test(lower)) {
      return `<audio controls src="${href}"></audio>`;
    }
    if (/\.(mp4|webm|mov)$/.test(lower)) {
      return `<video controls src="${href}" style="max-width:100%"></video>`;
    }
    return `[${escapeText(alias ?? target)}](${href})`;
  }
  return `<span class="frontdocs-broken-embed" title="unresolved: ${escapeAttr(target)}">![${escapeText(alias ?? target)}]</span>`;
}

export function splitWikilink(inner: string): { target: string; alias?: string; heading?: string; blockId?: string } {
  let alias: string | undefined;
  let target = inner;
  const pipe = target.indexOf('|');
  if (pipe >= 0) {
    alias = target.slice(pipe + 1).trim();
    target = target.slice(0, pipe).trim();
  }
  let heading: string | undefined;
  let blockId: string | undefined;
  const hashIdx = target.indexOf('#');
  if (hashIdx >= 0) {
    const after = target.slice(hashIdx + 1);
    target = target.slice(0, hashIdx);
    if (after.startsWith('^')) blockId = after.slice(1);
    else heading = after;
  }
  return { target: target.trim(), alias, heading, blockId };
}

export function findNote(target: string, analysis: AnalysisResult): NoteRecord | undefined {
  const t = target.toLowerCase().replace(/\\/g, '/');
  const tNoExt = t.replace(/\.md$/, '');
  for (const n of analysis.notes) {
    const p = n.path.toLowerCase();
    if (p === t || p.replace(/\.md$/, '') === tNoExt) return n;
  }
  // by basename
  const wanted = posix.basename(tNoExt);
  for (const n of analysis.notes) {
    if (posix.basename(n.path.toLowerCase().replace(/\.md$/, '')) === wanted) return n;
  }
  return undefined;
}

function findAsset(target: string, analysis: AnalysisResult) {
  const t = target.toLowerCase().replace(/\\/g, '/');
  for (const a of analysis.assets) {
    if (a.path.toLowerCase() === t) return a;
  }
  const base = posix.basename(t);
  for (const a of analysis.assets) {
    if (posix.basename(a.path.toLowerCase()) === base) return a;
  }
  return undefined;
}

export function noteDocPath(note: NoteRecord): string {
  // Mirror vault path verbatim under docs/
  return note.path;
}

export function relUrl(fromDir: string, toPath: string): string {
  const fromSegs = fromDir ? fromDir.split('/').filter(Boolean) : [];
  const toSegs = toPath.split('/').filter(Boolean);
  // compute relative
  let i = 0;
  while (i < fromSegs.length && i < toSegs.length && fromSegs[i] === toSegs[i]) i++;
  const up = '../'.repeat(fromSegs.length - i);
  const down = toSegs.slice(i).join('/');
  const rel = (up + down) || './';
  return encodePath(rel);
}

function encodePath(p: string): string {
  return p.split('/').map((seg) => seg === '..' || seg === '.' || seg === '' ? seg : encodeURIComponent(seg)).join('/');
}

function escapeText(s: string): string {
  return s.replace(/[\\`*_[\]]/g, (c) => `\\${c}`);
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
