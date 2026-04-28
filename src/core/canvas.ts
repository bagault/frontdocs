// Canvas (.canvas) parser. Obsidian canvas is JSON.
import type { CanvasNode, CanvasEdge } from './types.js';

export interface ParsedCanvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export function parseCanvas(content: string): ParsedCanvas {
  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    return { nodes: [], edges: [] };
  }
  const nodes: CanvasNode[] = [];
  for (const n of data.nodes ?? []) {
    nodes.push({
      id: String(n.id ?? ''),
      type: (n.type as CanvasNode['type']) ?? 'text',
      text: typeof n.text === 'string' ? n.text : undefined,
      file: typeof n.file === 'string' ? n.file : undefined,
      url: typeof n.url === 'string' ? n.url : undefined,
    });
  }
  const edges: CanvasEdge[] = [];
  for (const e of data.edges ?? []) {
    edges.push({
      id: String(e.id ?? ''),
      fromNode: String(e.fromNode ?? ''),
      toNode: String(e.toNode ?? ''),
      label: typeof e.label === 'string' ? e.label : undefined,
    });
  }
  return { nodes, edges };
}
