import { describe, it, expect } from 'vitest';
import { parseNote, slugify } from '../src/core/markdown.js';
import { buildResolverIndex, resolveWikilink } from '../src/core/wikilinks.js';

describe('parseNote', () => {
  it('parses frontmatter, tags, headings, wikilinks, embeds', () => {
    const md = `---
title: Hello
tags:
  - alpha
  - "#beta"
---

# Title

A paragraph with #inline-tag and a [[Link]] and an alias [[Other|alias]] plus ![[image.png]] embed.

## Sub

\`\`\`
[[code-link-not-counted]]
\`\`\`
`;
    const r = parseNote(md);
    expect(r.frontmatter['title']).toBe('Hello');
    expect(r.tags.sort()).toEqual(['alpha', 'beta', 'inline-tag'].sort());
    expect(r.headings.map((h) => h.text)).toEqual(['Title', 'Sub']);
    expect(r.wikilinks.map((w) => w.target)).toEqual(['Link', 'Other']);
    expect(r.wikilinks[1].alias).toBe('alias');
    expect(r.embeds.map((e) => e.target)).toEqual(['image.png']);
  });

  it('handles heading and block refs', () => {
    const r = parseNote('See [[Note#Section]] and [[Note#^abc]]');
    expect(r.wikilinks[0].heading).toBe('Section');
    expect(r.wikilinks[1].blockId).toBe('abc');
  });
});

describe('slugify', () => {
  it('slugs unicode and spaces', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('Über Größe')).toBe('uber-groe');
  });
});

describe('wikilink resolver', () => {
  const idx = buildResolverIndex(['a/Foo.md', 'b/Foo.md', 'c/Bar.md']);
  it('resolves exact path', () => {
    expect(resolveWikilink('a/Foo', idx).resolvedPath).toBe('a/Foo.md');
  });
  it('resolves unique short name', () => {
    expect(resolveWikilink('Bar', idx).resolvedPath).toBe('c/Bar.md');
  });
  it('flags ambiguous short name', () => {
    const r = resolveWikilink('Foo', idx);
    expect(r.ambiguous).toBe(true);
    expect(r.candidates?.length).toBe(2);
  });
  it('returns nothing for missing', () => {
    expect(resolveWikilink('Nope', idx).resolvedPath).toBeUndefined();
  });
});
