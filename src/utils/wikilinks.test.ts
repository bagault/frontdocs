import { describe, it, expect } from 'vitest';
import {
  normalizeLinkKey,
  stripMarkdownExtension,
  normalizeRelativeLinkTarget,
  pathDirname,
  pathBasename,
  buildLinkCandidates,
  pathDistance,
  markdownPathToHtmlHref,
  markdownPathToRelativeHtmlHref,
  resolveWorkspaceFile,
  type WorkspaceFile,
} from '../utils/wikilinks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(relative_path: string): WorkspaceFile {
  return {
    path: `/workspace/${relative_path}`,
    relative_path,
    name: pathBasename(relative_path),
  };
}

// ---------------------------------------------------------------------------
// normalizeLinkKey
// ---------------------------------------------------------------------------

describe('normalizeLinkKey', () => {
  it('lowercases', () => expect(normalizeLinkKey('Hello World')).toBe('hello world'));
  it('replaces %20 with space', () => expect(normalizeLinkKey('hello%20world')).toBe('hello world'));
  it('replaces underscores with spaces', () => expect(normalizeLinkKey('hello_world')).toBe('hello world'));
  it('normalises multiple spaces', () => expect(normalizeLinkKey('hello  world')).toBe('hello world'));
  it('trims surrounding whitespace', () => expect(normalizeLinkKey('  hello  ')).toBe('hello'));
  it('handles empty string', () => expect(normalizeLinkKey('')).toBe(''));
  it('normalises backslashes to forward slashes', () =>
    expect(normalizeLinkKey('a\\b')).toBe('a/b'));
});

// ---------------------------------------------------------------------------
// stripMarkdownExtension
// ---------------------------------------------------------------------------

describe('stripMarkdownExtension', () => {
  it('strips .md', () => expect(stripMarkdownExtension('foo.md')).toBe('foo'));
  it('strips .markdown', () => expect(stripMarkdownExtension('foo.markdown')).toBe('foo'));
  it('strips case-insensitively', () => expect(stripMarkdownExtension('foo.MD')).toBe('foo'));
  it('leaves other extensions', () => expect(stripMarkdownExtension('foo.html')).toBe('foo.html'));
  it('leaves plain name', () => expect(stripMarkdownExtension('foo')).toBe('foo'));
  it('handles nested path', () => expect(stripMarkdownExtension('a/b/foo.md')).toBe('a/b/foo'));
});

// ---------------------------------------------------------------------------
// normalizeRelativeLinkTarget
// ---------------------------------------------------------------------------

describe('normalizeRelativeLinkTarget', () => {
  it('strips .md extension', () => expect(normalizeRelativeLinkTarget('foo.md')).toBe('foo'));
  it('strips .html extension', () => expect(normalizeRelativeLinkTarget('foo.html')).toBe('foo'));
  it('strips /index.html suffix', () =>
    expect(normalizeRelativeLinkTarget('foo/index.html')).toBe('foo'));
  it('strips leading ./', () => expect(normalizeRelativeLinkTarget('./foo')).toBe('foo'));
  it('strips anchor', () => expect(normalizeRelativeLinkTarget('foo#section')).toBe('foo'));
  it('strips query string', () => expect(normalizeRelativeLinkTarget('foo?bar=1')).toBe('foo'));
  it('decodes %20', () => expect(normalizeRelativeLinkTarget('foo%20bar')).toBe('foo bar'));
  it('handles empty string', () => expect(normalizeRelativeLinkTarget('')).toBe(''));
});

// ---------------------------------------------------------------------------
// pathDirname / pathBasename
// ---------------------------------------------------------------------------

describe('pathDirname', () => {
  it('returns parent directory', () => expect(pathDirname('a/b/c.md')).toBe('a/b'));
  it('returns empty string for top-level file', () => expect(pathDirname('foo.md')).toBe(''));
  it('handles Windows separators', () => expect(pathDirname('a\\b\\c.md')).toBe('a/b'));
});

describe('pathBasename', () => {
  it('returns filename', () => expect(pathBasename('a/b/c.md')).toBe('c.md'));
  it('returns value when no directory', () => expect(pathBasename('foo.md')).toBe('foo.md'));
  it('handles Windows separators', () => expect(pathBasename('a\\b\\c.md')).toBe('c.md'));
});

// ---------------------------------------------------------------------------
// markdownPathToHtmlHref
// ---------------------------------------------------------------------------

describe('markdownPathToHtmlHref', () => {
  it('converts regular path to directory-style href', () =>
    expect(markdownPathToHtmlHref('section/page.md')).toBe('section/page/index.html'));

  it('converts top-level page', () =>
    expect(markdownPathToHtmlHref('page.md')).toBe('page/index.html'));

  it('keeps existing /index path as-is', () =>
    expect(markdownPathToHtmlHref('section/index.md')).toBe('section/index.html'));

  it('returns index.html for root index', () =>
    expect(markdownPathToHtmlHref('index.md')).toBe('index.html'));

  it('returns index.html for empty string', () =>
    expect(markdownPathToHtmlHref('')).toBe('index.html'));

  it('URL-encodes spaces', () =>
    expect(markdownPathToHtmlHref('my page.md')).toBe('my%20page/index.html'));

  it('does not double-encode already-clean paths', () =>
    expect(markdownPathToHtmlHref('a/b/c.md')).toBe('a/b/c/index.html'));
});

describe('markdownPathToRelativeHtmlHref', () => {
  it('returns same-directory relative target', () => {
    expect(markdownPathToRelativeHtmlHref('a/b/target.md', 'a/b/current.md')).toBe('../target/index.html');
  });

  it('returns parent-directory traversal', () => {
    expect(markdownPathToRelativeHtmlHref('a/target.md', 'a/b/current.md')).toBe('../../target/index.html');
  });

  it('returns nested descendant path', () => {
    expect(markdownPathToRelativeHtmlHref('a/b/c/target.md', 'a/b/current.md')).toBe('../c/target/index.html');
  });

  it('handles root index', () => {
    expect(markdownPathToRelativeHtmlHref('index.md', 'a/b/current.md')).toBe('../../../index.html');
  });

  it('encodes spaces in relative target', () => {
    expect(markdownPathToRelativeHtmlHref('a/my page.md', 'a/current.md')).toBe('../my%20page/index.html');
  });
});

// ---------------------------------------------------------------------------
// buildLinkCandidates
// ---------------------------------------------------------------------------

describe('buildLinkCandidates', () => {
  it('includes bare target', () => {
    const candidates = buildLinkCandidates('Page', 'section/file.md');
    expect(candidates).toContain('Page');
  });

  it('includes contextual candidates from parent folders', () => {
    const candidates = buildLinkCandidates('Page', 'a/b/file.md');
    expect(candidates).toContain('a/b/Page');
    expect(candidates).toContain('a/Page');
    expect(candidates).toContain('Page');
  });

  it('returns empty array for empty target', () => {
    expect(buildLinkCandidates('', 'a/b/file.md')).toEqual([]);
  });

  it('normalises the target (strips .md)', () => {
    const candidates = buildLinkCandidates('Page.md', 'section/file.md');
    expect(candidates).toContain('Page');
    expect(candidates).not.toContain('Page.md');
  });

  it('strips anchor from target', () => {
    const candidates = buildLinkCandidates('Page#header', 'section/file.md');
    expect(candidates).toContain('Page');
    expect(candidates.some(c => c.includes('#'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pathDistance
// ---------------------------------------------------------------------------

describe('pathDistance', () => {
  it('returns 0 for files in the same directory', () => {
    expect(pathDistance('a/b', 'a/b/other.md')).toBe(0);
  });

  it('returns 1 for sibling directory', () => {
    expect(pathDistance('a/b', 'a/c/page.md')).toBe(2);
  });

  it('returns higher value for distant files', () => {
    const near = pathDistance('a/b', 'a/b/page.md');
    const far = pathDistance('a/b', 'x/y/z/page.md');
    expect(far).toBeGreaterThan(near);
  });

  it('handles top-level fromDir', () => {
    expect(pathDistance('', 'a/page.md')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolveWorkspaceFile
// ---------------------------------------------------------------------------

describe('resolveWorkspaceFile', () => {
  const files = [
    makeFile('intro.md'),
    makeFile('chapter1/overview.md'),
    makeFile('chapter1/detail.md'),
    makeFile('chapter2/overview.md'),
    makeFile('chapter2/sub/deep.md'),
  ];

  it('resolves exact top-level file by name', () => {
    const result = resolveWorkspaceFile('intro', 'chapter1/overview.md', files);
    expect(result?.relative_path).toBe('intro.md');
  });

  it('resolves sibling file in same directory', () => {
    const result = resolveWorkspaceFile('detail', 'chapter1/overview.md', files);
    expect(result?.relative_path).toBe('chapter1/detail.md');
  });

  it('prefers contextually closer match when name is ambiguous', () => {
    // Both chapter1/overview.md and chapter2/overview.md exist.
    // Linking from chapter1/detail.md should prefer chapter1/overview.md.
    const result = resolveWorkspaceFile('overview', 'chapter1/detail.md', files);
    expect(result?.relative_path).toBe('chapter1/overview.md');
  });

  it('prefers contextually closer match from chapter2 side', () => {
    const result = resolveWorkspaceFile('overview', 'chapter2/sub/deep.md', files);
    expect(result?.relative_path).toBe('chapter2/overview.md');
  });

  it('returns null when no file matches', () => {
    const result = resolveWorkspaceFile('nonexistent', 'chapter1/overview.md', files);
    expect(result).toBeNull();
  });

  it('resolves case-insensitively', () => {
    const result = resolveWorkspaceFile('INTRO', 'chapter1/overview.md', files);
    expect(result?.relative_path).toBe('intro.md');
  });

  it('resolves with .md extension in link', () => {
    const result = resolveWorkspaceFile('intro.md', 'chapter1/overview.md', files);
    expect(result?.relative_path).toBe('intro.md');
  });

  it('resolves with path prefix in link', () => {
    const result = resolveWorkspaceFile('chapter2/sub/deep', 'intro.md', files);
    expect(result?.relative_path).toBe('chapter2/sub/deep.md');
  });

  it('resolves underscore-named files (underscore = space)', () => {
    const filesWithUnderscore = [makeFile('my_page.md')];
    const result = resolveWorkspaceFile('my page', 'intro.md', filesWithUnderscore);
    expect(result?.relative_path).toBe('my_page.md');
  });
});
