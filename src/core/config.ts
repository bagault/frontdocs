// Configuration loader.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FrontdocsConfig } from './types.js';

export const DEFAULT_CONFIG: FrontdocsConfig = {
  schemaVersion: '1.0.0',
  siteName: 'Frontdocs Knowledge Base',
  publishField: 'publish',
  publishValues: ['extern'],
  protocolTag: '#Protokoll',
  outputDir: 'dist',
  ignoredDirectories: ['.obsidian', '.git', 'node_modules', 'dist', '.venv'],
  strict: false,
  theme: 'material',
  graph: { enabled: true, navTitle: 'Graph' },
  publish: { includeAllByDefault: true },
  ai: {
    enabled: false,
    provider: 'ollama',
    endpoint: 'http://localhost:11434',
    model: 'llama3.2:3b',
    summaryWords: 60,
    concurrency: 2,
    maxNotes: 0,
    injectIntoPages: true,
  },
};

export async function loadConfig(vaultPath: string, repoConfigPath?: string): Promise<FrontdocsConfig> {
  // Precedence: vault/frontdocs.config.json → repo/frontdocs.config.json → defaults.
  const candidates = [
    join(vaultPath, 'frontdocs.config.json'),
    repoConfigPath,
  ].filter((p): p is string => Boolean(p));

  for (const c of candidates) {
    if (existsSync(c)) {
      const raw = await readFile(c, 'utf8');
      const parsed = JSON.parse(raw) as Partial<FrontdocsConfig>;
      return mergeConfig(DEFAULT_CONFIG, parsed);
    }
  }
  return DEFAULT_CONFIG;
}

function mergeConfig(base: FrontdocsConfig, patch: Partial<FrontdocsConfig>): FrontdocsConfig {
  return {
    ...base,
    ...patch,
    ignoredDirectories: patch.ignoredDirectories ?? base.ignoredDirectories,
    publishValues: patch.publishValues ?? base.publishValues,
    graph: { ...base.graph, ...(patch.graph ?? {}) },
    publish: { ...base.publish, ...(patch.publish ?? {}) },
    ai: { ...base.ai, ...(patch.ai ?? {}) },
  };
}
