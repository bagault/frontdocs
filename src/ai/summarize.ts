// Per-note summarization with content-hash cache.
// Cache file lives at <vault>/dist/.frontdocs/ai-cache.json so it persists across builds.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { AIProviderConfig } from './providers.js';
import { chat } from './providers.js';
import type { NoteRecord } from '../core/types.js';

export interface AICache {
  schemaVersion: '1.0.0';
  provider: string;
  model: string;
  entries: Record<string, AICacheEntry>;
}

export interface AICacheEntry {
  hash: string;     // sha256 of (provider+model+prompt+body)
  summary: string;
  createdAt: string;
}

export interface SummarizeOptions {
  cfg: AIProviderConfig;
  vaultPath: string;
  outDir: string;             // <vault>/dist
  notes: NoteRecord[];
  bodies: Map<string, string>; // path → body (already frontmatter-stripped optional)
  maxNotes?: number;          // 0 / undefined = no limit
  concurrency?: number;
  summaryWords?: number;
  onProgress?: (done: number, total: number, path: string) => void;
}

const SYSTEM_PROMPT = (words: number) => `You are a concise technical summarizer. Given a markdown note, produce a single-paragraph summary of at most ${words} words. Keep terminology from the source. Do not add headers, markdown formatting, or commentary. Reply in the source language.`;

export async function summarizeAll(opts: SummarizeOptions): Promise<{ cache: AICache; cached: number; generated: number; failed: number }> {
  const cachePath = cacheFilePath(opts.outDir);
  const cache = await loadCache(cachePath, opts.cfg);

  const summaryWords = opts.summaryWords ?? 60;
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const limit = opts.maxNotes && opts.maxNotes > 0 ? opts.maxNotes : opts.notes.length;
  const queue = opts.notes.slice(0, limit);

  let cached = 0;
  let generated = 0;
  let failed = 0;
  let done = 0;

  // Mark cached entries up front.
  for (const n of queue) {
    const body = opts.bodies.get(n.path) ?? '';
    const h = hashFor(opts.cfg, summaryWords, body);
    if (cache.entries[n.path]?.hash === h) cached++;
  }

  // Worker loop.
  const work = queue.slice();
  async function worker(): Promise<void> {
    while (work.length > 0) {
      const note = work.shift();
      if (!note) break;
      const body = opts.bodies.get(note.path) ?? '';
      const h = hashFor(opts.cfg, summaryWords, body);
      if (cache.entries[note.path]?.hash === h) {
        done++;
        opts.onProgress?.(done, queue.length, note.path);
        continue;
      }
      try {
        const r = await chat(opts.cfg, [
          { role: 'system', content: SYSTEM_PROMPT(summaryWords) },
          { role: 'user', content: clampForLLM(body) },
        ]);
        cache.entries[note.path] = {
          hash: h,
          summary: r.text.trim(),
          createdAt: new Date().toISOString(),
        };
        generated++;
      } catch {
        failed++;
      }
      done++;
      opts.onProgress?.(done, queue.length, note.path);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  await saveCache(cachePath, cache);
  return { cache, cached, generated, failed };
}

export async function loadCache(path: string, cfg: AIProviderConfig): Promise<AICache> {
  if (existsSync(path)) {
    try {
      const j = JSON.parse(await readFile(path, 'utf8')) as AICache;
      if (j && j.entries) return j;
    } catch { /* fall through */ }
  }
  return { schemaVersion: '1.0.0', provider: cfg.kind, model: cfg.model, entries: {} };
}

export async function saveCache(path: string, cache: AICache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2), 'utf8');
}

export function cacheFilePath(outDir: string): string {
  return join(outDir, '.frontdocs', 'ai-cache.json');
}

function hashFor(cfg: AIProviderConfig, words: number, body: string): string {
  const h = createHash('sha256');
  h.update(cfg.kind);
  h.update('\n');
  h.update(cfg.model);
  h.update('\n');
  h.update(String(words));
  h.update('\n');
  h.update(body);
  return h.digest('hex');
}

function clampForLLM(body: string, maxChars = 12_000): string {
  if (body.length <= maxChars) return body;
  return body.slice(0, maxChars) + '\n…[truncated]';
}
