// Build Cosmos points/links artifact from the internal graph.
import type { AnalysisResult } from '../core/types.js';

const TYPE_COLORS: Record<string, string> = {
  note: '#4f8cff',
  tag: '#22c55e',
  asset: '#a855f7',
  missing: '#ef4444',
  source: '#f59e0b',
  canvas: '#0ea5e9',
  'canvas-node': '#06b6d4',
};

export interface CosmosPoint {
  id: string;
  label: string;
  type: string;
  color: string;
  size: number;
  degree: number;
  tags: string[];
  url?: string;
  summary?: string;
}

export interface CosmosArtifact {
  schemaVersion: string;
  typeColors: Record<string, string>;
  points: CosmosPoint[];
  links: { source: string; target: string; type: string }[];
}

export function buildCosmosArtifact(analysis: AnalysisResult, opts: { summaries?: Map<string, string> } = {}): CosmosArtifact {
  const summaries = opts.summaries ?? new Map<string, string>();
  const degrees = new Map<string, number>();
  for (const e of analysis.graph.edges) {
    degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
    degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
  }
  const points: CosmosPoint[] = analysis.graph.nodes.map((n) => {
    const deg = degrees.get(n.id) ?? 0;
    const meta = (n.meta ?? {}) as { tags?: unknown; path?: unknown };
    const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
    const path = typeof meta.path === 'string' ? meta.path : undefined;
    const summary = path ? summaries.get(path) : undefined;
    return {
      id: n.id,
      label: n.label,
      type: n.type,
      color: TYPE_COLORS[n.type] ?? '#94a3b8',
      // Stronger degree-based sizing: low ~3, high (deg=64) ~12.
      size: Math.min(14, 3 + Math.log2(1 + deg) * 1.6),
      degree: deg,
      tags,
      url: n.url,
      ...(summary ? { summary } : {}),
    };
  });
  const links = analysis.graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
  }));
  return { schemaVersion: '1.2.0', typeColors: TYPE_COLORS, points, links };
}
