/**
 * Pure utility functions for wiki-link resolution.
 * These are extracted here so they can be unit-tested independently of Vue.
 */

export function normalizeLinkKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/%20/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\\/g, '/')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(md|markdown)$/i, '');
}

export function normalizeRelativeLinkTarget(value: string): string {
  return decodeURIComponent(value)
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/^\.?\//, '')
    .replace(/\\/g, '/')
    .replace(/\/index\.html$/i, '')
    .replace(/\.html$/i, '')
    .replace(/\.(md|markdown)$/i, '');
}

export function pathDirname(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

export function pathBasename(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function buildLinkCandidates(target: string, currentFilePath: string): string[] {
  const cleanTarget = normalizeRelativeLinkTarget(target);
  const candidates = new Set<string>();
  if (!cleanTarget) return [];

  candidates.add(cleanTarget);

  let directory = pathDirname(stripMarkdownExtension(currentFilePath));
  while (directory) {
    candidates.add(`${directory}/${cleanTarget}`);
    directory = pathDirname(directory);
  }

  return Array.from(candidates);
}

export function pathDistance(fromDir: string, toFile: string): number {
  const fromParts = fromDir.split('/').filter(Boolean);
  const toParts = pathDirname(stripMarkdownExtension(toFile)).split('/').filter(Boolean);
  let shared = 0;
  while (
    shared < fromParts.length &&
    shared < toParts.length &&
    fromParts[shared] === toParts[shared]
  ) {
    shared += 1;
  }
  return (fromParts.length - shared) + (toParts.length - shared);
}

function markdownPathToHtmlPath(path: string): string {
  const clean = stripMarkdownExtension(path).replace(/\\/g, '/');
  if (!clean || clean === 'index') {
    return 'index.html';
  }
  if (clean.endsWith('/index')) {
    return `${clean}.html`;
  }
  return `${clean}/index.html`;
}

export function markdownPathToHtmlHref(path: string): string {
  return encodeURI(markdownPathToHtmlPath(path));
}

export function markdownPathToRelativeHtmlHref(targetPath: string, currentFilePath: string): string {
  const targetHtml = markdownPathToHtmlPath(targetPath);
  const currentHtml = markdownPathToHtmlPath(currentFilePath || 'index.md');

  const fromParts = pathDirname(currentHtml).split('/').filter(Boolean);
  const toParts = targetHtml.split('/').filter(Boolean);

  let shared = 0;
  while (
    shared < fromParts.length &&
    shared < toParts.length &&
    fromParts[shared] === toParts[shared]
  ) {
    shared += 1;
  }

  const up = new Array(fromParts.length - shared).fill('..');
  const down = toParts.slice(shared);
  const relative = [...up, ...down].join('/') || 'index.html';
  return encodeURI(relative);
}

export interface WorkspaceFile {
  path: string;
  relative_path: string;
  name: string;
}

/**
 * Resolve a wiki-link target against a list of workspace files.
 * @param link - the raw link text (e.g. "My Page" or "folder/My Page")
 * @param currentFilePath - the relative path of the file containing the link
 * @param files - all workspace files
 */
export function resolveWorkspaceFile(
  link: string,
  currentFilePath: string,
  files: WorkspaceFile[],
): WorkspaceFile | null {
  const candidates = buildLinkCandidates(link, currentFilePath);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeLinkKey(candidate);
    const exact = files.find(file => {
      const relative = normalizeLinkKey(stripMarkdownExtension(file.relative_path));
      return relative === normalizedCandidate;
    });
    if (exact) return exact;
  }

  const targetBaseName = normalizeLinkKey(pathBasename(normalizeRelativeLinkTarget(link)));
  const currentDir = pathDirname(currentFilePath);
  const baseMatches = files
    .filter(file => normalizeLinkKey(stripMarkdownExtension(file.name)) === targetBaseName)
    .sort((left, right) =>
      pathDistance(currentDir, left.relative_path) -
      pathDistance(currentDir, right.relative_path),
    );

  return baseMatches[0] || null;
}
