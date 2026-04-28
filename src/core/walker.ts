// Vault file walker. Yields markdown notes, canvases, and assets.
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep, posix } from 'node:path';

export interface WalkResult {
  notes: string[];      // vault-relative posix paths
  canvases: string[];
  assets: string[];
}

const ASSET_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico',
  '.pdf', '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.mov',
  '.zip', '.csv', '.json', '.xlsx', '.docx', '.pptx',
]);

export async function walkVault(vaultPath: string, ignored: string[]): Promise<WalkResult> {
  const result: WalkResult = { notes: [], canvases: [], assets: [] };
  const ignoredSet = new Set(ignored);

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.obsidian') {
        // hidden files generally skipped, except .obsidian (handled by ignored list)
      }
      const full = join(dir, entry.name);
      const rel = toPosix(relative(vaultPath, full));
      if (entry.isDirectory()) {
        if (ignoredSet.has(entry.name)) continue;
        if (rel.split('/').some((seg) => ignoredSet.has(seg))) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.md')) {
        result.notes.push(rel);
      } else if (lower.endsWith('.canvas')) {
        result.canvases.push(rel);
      } else {
        const dot = lower.lastIndexOf('.');
        const ext = dot >= 0 ? lower.slice(dot) : '';
        if (ASSET_EXTS.has(ext)) result.assets.push(rel);
      }
    }
  }

  await walk(vaultPath);
  result.notes.sort();
  result.canvases.sort();
  result.assets.sort();
  return result;
}

function toPosix(p: string): string {
  return sep === posix.sep ? p : p.split(sep).join(posix.sep);
}
