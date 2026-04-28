// Frontdocs core types

export interface FrontdocsConfig {
  schemaVersion: string;
  siteName: string;
  siteUrl?: string;
  publishField: string;
  publishValues: string[];
  protocolTag?: string;
  outputDir: string;
  ignoredDirectories: string[];
  strict: boolean;
  theme?: string;
  graph?: {
    enabled?: boolean;
    navTitle?: string;
  };
  publish?: {
    includeAllByDefault?: boolean;
  };
  ai?: {
    enabled?: boolean;
    provider?: 'ollama' | 'custom';
    endpoint?: string;
    model?: string;
    account?: string;
    summaryWords?: number;
    concurrency?: number;
    maxNotes?: number;
    injectIntoPages?: boolean; // emit "Summary" admonition at top of each note
  };
}

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  path?: string;
  line?: number;
  suggestion?: string;
}

export interface NoteRecord {
  id: string;            // stable id (vault-relative path without .md)
  path: string;          // vault-relative path (.md)
  absPath: string;
  title: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  headings: { level: number; text: string; slug: string }[];
  wikilinks: WikilinkRef[];
  embeds: WikilinkRef[];
  mdLinks: { target: string; text: string }[];
  publish: boolean;
}

export interface WikilinkRef {
  raw: string;            // [[...]] inner text
  target: string;         // resolved or unresolved short name / path
  alias?: string;
  heading?: string;
  blockId?: string;
  resolvedPath?: string;  // vault-relative path of resolved note
  ambiguous?: boolean;
  isEmbed?: boolean;
}

export interface AssetRecord {
  path: string;
  absPath: string;
  size: number;
  ext: string;
}

export interface CanvasRecord {
  path: string;
  absPath: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasNode {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  text?: string;
  file?: string;
  url?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  label?: string;
}

export interface GraphNode {
  id: string;
  type: string;        // 'note' | 'tag' | 'asset' | 'missing' | 'source' | 'canvas' | ...
  label: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;        // 'links-to' | 'embeds' | 'has-tag' | 'canvas-edge' | ...
}

export interface AnalysisResult {
  config: FrontdocsConfig;
  vaultPath: string;
  notes: NoteRecord[];
  assets: AssetRecord[];
  canvases: CanvasRecord[];
  issues: Issue[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  stats: {
    notes: number;
    publishedNotes: number;
    canvases: number;
    assets: number;
    wikilinks: number;
    brokenLinks: number;
    tags: number;
  };
}
