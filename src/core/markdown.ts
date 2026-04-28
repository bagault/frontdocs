// Markdown note parser: frontmatter, tags, headings, wikilinks, embeds, md links.
import yaml from 'js-yaml';
import type { WikilinkRef } from './types.js';

export interface ParsedNote {
  frontmatter: Record<string, unknown>;
  body: string;
  tags: string[];
  headings: { level: number; text: string; slug: string }[];
  wikilinks: WikilinkRef[];
  embeds: WikilinkRef[];
  mdLinks: { target: string; text: string }[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const WIKILINK_RE = /(!?)\[\[([^\]\n]+)\]\]/g;
const MD_LINK_RE = /(?<!\!)\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
// inline #tag (avoid matching colour codes / fragment URLs); allow unicode letters
const INLINE_TAG_RE = /(?:^|[\s(])#([\p{L}\p{N}_/\-äöüÄÖÜß]+)/gu;

export function parseNote(content: string): ParsedNote {
  const fmMatch = content.match(FRONTMATTER_RE);
  let frontmatter: Record<string, unknown> = {};
  let body = content;
  if (fmMatch) {
    try {
      const parsed = yaml.load(fmMatch[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        frontmatter = parsed as Record<string, unknown>;
      }
    } catch {
      // ignore malformed frontmatter; surfaced by validation elsewhere
    }
    body = content.slice(fmMatch[0].length);
  }

  const tags = extractTags(frontmatter, body);
  const headings = extractHeadings(body);
  const { wikilinks, embeds } = extractWikilinks(body);
  const mdLinks = extractMdLinks(body);

  return { frontmatter, body, tags, headings, wikilinks, embeds, mdLinks };
}

function extractTags(fm: Record<string, unknown>, body: string): string[] {
  const out = new Set<string>();
  const fmTags = fm['tags'];
  if (Array.isArray(fmTags)) {
    for (const t of fmTags) {
      if (typeof t === 'string') out.add(normalizeTag(t));
    }
  } else if (typeof fmTags === 'string') {
    for (const t of fmTags.split(/[\s,]+/)) if (t) out.add(normalizeTag(t));
  }
  // strip code blocks before scanning inline tags
  const stripped = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  for (const m of stripped.matchAll(INLINE_TAG_RE)) {
    out.add(normalizeTag(m[1]));
  }
  return [...out].filter(Boolean);
}

function normalizeTag(t: string): string {
  return t.replace(/^#/, '').trim();
}

function extractHeadings(body: string): { level: number; text: string; slug: string }[] {
  const out: { level: number; text: string; slug: string }[] = [];
  for (const m of body.matchAll(HEADING_RE)) {
    const level = m[1].length;
    const text = m[2].trim();
    out.push({ level, text, slug: slugify(text) });
  }
  return out;
}

export function slugify(s: string): string {
  // Mirrors python-markdown's default TOC slugifier: NFKD strip diacritics,
  // drop non-word/space/hyphen, lowercase, collapse whitespace+separators to '-'.
  // Preserves '_' to match python-markdown's '\w' character class.
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '-');
}

function extractWikilinks(body: string): { wikilinks: WikilinkRef[]; embeds: WikilinkRef[] } {
  const wikilinks: WikilinkRef[] = [];
  const embeds: WikilinkRef[] = [];
  // ignore inside code spans / fences
  const stripped = stripCode(body);
  for (const m of stripped.matchAll(WIKILINK_RE)) {
    const isEmbed = m[1] === '!';
    const inner = m[2].trim();
    const ref = parseWikilinkInner(inner, isEmbed);
    if (isEmbed) embeds.push(ref); else wikilinks.push(ref);
  }
  return { wikilinks, embeds };
}

export function parseWikilinkInner(inner: string, isEmbed: boolean): WikilinkRef {
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
  return { raw: inner, target: target.trim(), alias, heading, blockId, isEmbed };
}

function extractMdLinks(body: string): { target: string; text: string }[] {
  const out: { target: string; text: string }[] = [];
  const stripped = stripCode(body);
  for (const m of stripped.matchAll(MD_LINK_RE)) {
    out.push({ text: m[1], target: m[2] });
  }
  return out;
}

function stripCode(body: string): string {
  return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
}
