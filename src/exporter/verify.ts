// Verify built HTML for broken local links and that key artifacts exist.
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, posix, relative } from 'node:path';
import { existsSync } from 'node:fs';

export interface VerifyReport {
  pagesScanned: number;
  brokenLinks: { from: string; href: string }[];
  hasSitemap: boolean;
  hasGraphPage: boolean;
  graphHasViewer: boolean;
  graphHasCanvas: boolean;
  navHasGraph: boolean;
}

export async function verifyBuild(siteDir: string): Promise<VerifyReport> {
  const report: VerifyReport = {
    pagesScanned: 0,
    brokenLinks: [],
    hasSitemap: false,
    hasGraphPage: false,
    graphHasViewer: false,
    graphHasCanvas: false,
    navHasGraph: false,
  };

  report.hasSitemap = existsSync(join(siteDir, 'sitemap.xml'));

  const htmlFiles = await collectHtml(siteDir);
  for (const file of htmlFiles) {
    report.pagesScanned++;
    const html = await readFile(file, 'utf8');
    // collect hrefs and srcs
    const refs: string[] = [];
    for (const m of html.matchAll(/\b(?:href|src)\s*=\s*"([^"#?]+)(?:[#?][^"]*)?"/g)) {
      refs.push(m[1]);
    }
    for (const r of refs) {
      if (!r) continue;
      // Skip external links and any URI with a scheme (http/https/mailto/zotero/obsidian/etc.)
      if (/^[a-z][a-z0-9+.-]*:/i.test(r) || r.startsWith('//') || r.startsWith('#')) continue;
      // Skip obviously malformed source markdown like "[https://x](https://x)"
      if (r.startsWith('[')) continue;
      // resolve against current file
      const abs = resolveLocal(file, r, siteDir);
      if (!abs) continue;
      if (!existsSync(abs)) {
        // try with index.html if it's a directory-style URL
        const withIndex = join(abs, 'index.html');
        if (existsSync(withIndex)) continue;
        report.brokenLinks.push({ from: posix.relative(siteDir, file).split('/').join('/'), href: r });
      }
    }
    if (file.endsWith(`graph${pathSep()}index.html`) || file.endsWith(`graph.html`)) {
      report.hasGraphPage = true;
      if (html.includes('frontdocs-graph-viewer.js')) report.graphHasViewer = true;
      if (html.includes('id="frontdocs-graph-canvas"')) report.graphHasCanvas = true;
    }
    // detect graph in nav (any page with the navigation menu)
    if (!report.navHasGraph && /<nav[\s\S]*?Graph[\s\S]*?<\/nav>/i.test(html)) {
      report.navHasGraph = true;
    }
  }

  return report;
}

function pathSep(): string {
  return process.platform === 'win32' ? '\\' : '/';
}

function resolveLocal(fromFile: string, href: string, siteDir: string): string | undefined {
  try {
    const baseDir = dirname(fromFile);
    const decoded = safeDecode(href);
    if (decoded.startsWith('/')) {
      return join(siteDir, decoded.slice(1));
    }
    return join(baseDir, decoded);
  } catch {
    return undefined;
  }
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

async function collectHtml(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) out.push(full);
    }
  }
  await walk(dir);
  return out;
}
