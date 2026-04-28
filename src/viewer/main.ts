// Browser-side Cosmos viewer with companion table, search, filters, and hover sync.
import { Graph } from '@cosmos.gl/graph';

interface Point {
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
interface Link { source: string; target: string; type: string }
interface CosmosData {
  schemaVersion: string;
  typeColors?: Record<string, string>;
  points: Point[];
  links: Link[];
}

declare global {
  interface Window {
    FRONTDOCS_GRAPH_DATA_URL?: string;
    FRONTDOCS_GRAPH_META_URL?: string;
  }
}

interface ViewerState {
  data: CosmosData;
  graph: any;
  // index → set of neighbour indices
  neighbours: Set<number>[];
  enabledTypes: Set<string>;
  filteredIndices: number[];
  sortKey: 'label' | 'type' | 'degree';
  sortDir: 1 | -1;
  selectedIdx: number | null;
  hoverIdx: number | null;
  searchQuery: string;
}

let state: ViewerState | null = null;

async function init(): Promise<void> {
  const root = document.getElementById('frontdocs-graph-root');
  const mount = document.getElementById('frontdocs-graph-canvas') as HTMLDivElement | null;
  const fallback = document.getElementById('frontdocs-graph-fallback');
  if (!root || !mount) {
    showFallback(fallback, 'Graph container missing.');
    return;
  }

  const dataUrl = window.FRONTDOCS_GRAPH_DATA_URL;
  if (!dataUrl) {
    showFallback(fallback, 'Graph data URL not configured.');
    return;
  }

  let data: CosmosData;
  try {
    const res = await fetch(dataUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    showFallback(fallback, `Failed to load graph data: ${(e as Error).message}`);
    return;
  }

  if (!data.points || data.points.length === 0) {
    showFallback(fallback, 'Graph is empty.');
    return;
  }

  // Build id→index map and neighbour sets.
  const idToIdx = new Map<string, number>();
  data.points.forEach((p, i) => idToIdx.set(p.id, i));
  const neighbours: Set<number>[] = data.points.map(() => new Set<number>());
  for (const l of data.links) {
    const a = idToIdx.get(l.source);
    const b = idToIdx.get(l.target);
    if (a == null || b == null) continue;
    neighbours[a].add(b);
    neighbours[b].add(a);
  }

  // Initial buffers.
  const positions = new Float32Array(data.points.length * 2);
  const colors = new Float32Array(data.points.length * 4);
  const sizes = new Float32Array(data.points.length);
  for (let i = 0; i < data.points.length; i++) {
    const p = data.points[i];
    positions[i * 2] = (Math.random() - 0.5) * 1000;
    positions[i * 2 + 1] = (Math.random() - 0.5) * 1000;
    writeColor(colors, i, hexToRgba(p.color, 1));
    sizes[i] = p.size;
  }
  const linksBuf = new Float32Array(data.links.length * 2);
  let n = 0;
  for (const l of data.links) {
    const a = idToIdx.get(l.source);
    const b = idToIdx.get(l.target);
    if (a == null || b == null) continue;
    linksBuf[n * 2] = a;
    linksBuf[n * 2 + 1] = b;
    n++;
  }
  const links = linksBuf.slice(0, n * 2);

  let graph: any;
  try {
    graph = new Graph(mount, {
      backgroundColor: 'rgba(0,0,0,0)',
      pointSize: 4,
      pointSizeScale: 1,
      linkWidth: 1,
      linkColor: '#cbd5e1',
      simulationGravity: 0.12,
      simulationRepulsion: 1.0,
      simulationLinkSpring: 0.5,
      simulationLinkDistance: 8,
      simulationFriction: 0.85,
      simulationDecay: 1000,
      onClick: (index: number | undefined) => {
        if (index == null) {
          clearSelection();
          return;
        }
        selectByIndex(index, true);
      },
      onMouseMove: (index: number | undefined, _pos: [number, number] | undefined, ev: MouseEvent) => {
        hoverByIndex(index ?? null, ev);
      },
    });
    graph.setPointPositions(positions);
    graph.setPointColors(colors);
    graph.setPointSizes(sizes);
    if (links.length > 0) graph.setLinks(links);
    graph.render();
    graph.start();
    setTimeout(() => { try { graph.pause(); } catch {} }, 4500);
  } catch (e) {
    showFallback(fallback, `Graph runtime failed: ${(e as Error).message}`);
    return;
  }

  state = {
    data,
    graph,
    neighbours,
    enabledTypes: new Set(data.points.map((p) => p.type)),
    filteredIndices: data.points.map((_, i) => i),
    sortKey: 'degree',
    sortDir: -1,
    selectedIdx: null,
    hoverIdx: null,
    searchQuery: '',
  };

  buildFilters();
  attachControls();
  rebuildTable();
  updateStats();

  window.addEventListener('resize', () => { try { graph.fitView(); } catch {} });
}

// ---- Filters & controls ----

function buildFilters(): void {
  if (!state) return;
  const host = document.getElementById('frontdocs-graph-filters');
  if (!host) return;
  const counts = new Map<string, number>();
  for (const p of state.data.points) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const types = Array.from(counts.keys()).sort();
  const colors = state.data.typeColors ?? {};
  host.innerHTML = '';
  for (const t of types) {
    const id = `frontdocs-filter-${t.replace(/[^a-z0-9]/gi, '-')}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = colors[t] ?? '#94a3b8';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.checked = true;
    cb.dataset.type = t;
    cb.addEventListener('change', () => {
      if (!state) return;
      if (cb.checked) state.enabledTypes.add(t);
      else state.enabledTypes.delete(t);
      applyFilters();
    });
    label.append(cb, sw, document.createTextNode(`${t} (${counts.get(t)})`));
    host.append(label);
  }
}

function attachControls(): void {
  const search = document.getElementById('frontdocs-graph-search') as HTMLInputElement | null;
  if (search) {
    search.addEventListener('input', () => {
      if (!state) return;
      state.searchQuery = search.value.trim().toLowerCase();
      applyFilters();
    });
    search.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && state && state.filteredIndices.length > 0) {
        selectByIndex(state.filteredIndices[0], false);
      }
    });
  }
  const headers = document.querySelectorAll<HTMLTableCellElement>('#frontdocs-graph-table thead th[data-sort]');
  headers.forEach((th) => {
    th.addEventListener('click', () => {
      if (!state) return;
      const key = th.dataset.sort as ViewerState['sortKey'];
      if (state.sortKey === key) state.sortDir = (state.sortDir === 1 ? -1 : 1);
      else { state.sortKey = key; state.sortDir = key === 'degree' ? -1 : 1; }
      rebuildTable();
    });
  });
}

function applyFilters(): void {
  if (!state) return;
  const q = state.searchQuery;
  state.filteredIndices = state.data.points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => state!.enabledTypes.has(p.type))
    .filter(({ p }) => !q || p.label.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)))
    .map(({ i }) => i);
  rebuildTable();
  updateStats();
}

function rebuildTable(): void {
  if (!state) return;
  const tbody = document.querySelector<HTMLTableSectionElement>('#frontdocs-graph-table tbody');
  if (!tbody) return;
  const indices = [...state.filteredIndices];
  const dir = state.sortDir;
  const key = state.sortKey;
  indices.sort((ai, bi) => {
    const a = state!.data.points[ai];
    const b = state!.data.points[bi];
    if (key === 'degree') return (a.degree - b.degree) * dir;
    return a[key].localeCompare(b[key]) * dir;
  });
  // Cap to 1000 rows for DOM performance.
  const capped = indices.slice(0, 1000);
  const colors = state.data.typeColors ?? {};
  const frag = document.createDocumentFragment();
  for (const idx of capped) {
    const p = state.data.points[idx];
    const tr = document.createElement('tr');
    tr.dataset.idx = String(idx);
    if (idx === state.selectedIdx) tr.classList.add('is-selected');
    tr.innerHTML =
      `<td class="col-label">${escapeHtml(p.label)}</td>` +
      `<td class="col-type"><span class="swatch" style="background:${escapeAttr(colors[p.type] ?? '#94a3b8')}"></span>${escapeHtml(p.type)}</td>` +
      `<td class="col-degree">${p.degree}</td>`;
    tr.addEventListener('click', () => selectByIndex(idx, false));
    tr.addEventListener('mouseenter', () => hoverByIndex(idx, null));
    tr.addEventListener('mouseleave', () => hoverByIndex(null, null));
    frag.append(tr);
  }
  tbody.replaceChildren(frag);
}

function updateStats(): void {
  if (!state) return;
  const el = document.getElementById('frontdocs-graph-stats');
  if (!el) return;
  el.textContent = `${state.filteredIndices.length} / ${state.data.points.length} nodes · ${state.data.links.length} links`;
}

// ---- Selection & hover ----

function selectByIndex(idx: number, fromGraph: boolean): void {
  if (!state) return;
  state.selectedIdx = idx;
  // Highlight node + neighbours in the graph.
  const set = new Set<number>([idx, ...state.neighbours[idx]]);
  try { state.graph.selectPointsByIndices(Array.from(set)); } catch {}
  try { state.graph.zoomToPointByIndex(idx, 600, 6, true); } catch {}
  // Update row classes.
  document.querySelectorAll('#frontdocs-graph-table tbody tr.is-selected').forEach((r) => r.classList.remove('is-selected'));
  const row = document.querySelector<HTMLTableRowElement>(`#frontdocs-graph-table tbody tr[data-idx="${idx}"]`);
  if (row) {
    row.classList.add('is-selected');
    if (!fromGraph) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  showDetail(state.data.points[idx]);
}

function clearSelection(): void {
  if (!state) return;
  state.selectedIdx = null;
  try { state.graph.unselectPoints(); } catch {}
  document.querySelectorAll('#frontdocs-graph-table tbody tr.is-selected').forEach((r) => r.classList.remove('is-selected'));
  const detail = document.getElementById('frontdocs-graph-detail');
  if (detail) detail.style.display = 'none';
}

function hoverByIndex(idx: number | null, ev: MouseEvent | null): void {
  if (!state) return;
  state.hoverIdx = idx;
  document.querySelectorAll('#frontdocs-graph-table tbody tr.is-hover').forEach((r) => r.classList.remove('is-hover'));
  if (idx != null) {
    const row = document.querySelector<HTMLTableRowElement>(`#frontdocs-graph-table tbody tr[data-idx="${idx}"]`);
    if (row) row.classList.add('is-hover');
  }
  const tooltip = document.getElementById('frontdocs-graph-tooltip');
  if (tooltip) {
    if (idx == null) {
      tooltip.style.display = 'none';
    } else {
      const p = state.data.points[idx];
      tooltip.textContent = `${p.label} · ${p.type} · deg ${p.degree}`;
      tooltip.style.display = 'block';
      const pane = document.getElementById('frontdocs-graph-root');
      if (pane && ev) {
        const r = pane.getBoundingClientRect();
        const x = Math.min(Math.max(0, ev.clientX - r.left + 12), Math.max(0, r.width - 220));
        const y = Math.min(Math.max(0, ev.clientY - r.top + 12), Math.max(0, r.height - 30));
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
      } else if (pane) {
        tooltip.style.left = '12px';
        tooltip.style.top = '12px';
      }
    }
  }
}

function showDetail(p: Point): void {
  const el = document.getElementById('frontdocs-graph-detail');
  if (!el) return;
  const parts: string[] = [];
  parts.push(`<div style="font-weight:600;margin-bottom:4px">${escapeHtml(p.label)}</div>`);
  parts.push(`<div style="opacity:0.7;font-size:0.9em">type: ${escapeHtml(p.type)} · degree: ${p.degree}</div>`);
  if (p.tags.length) {
    parts.push(`<div style="margin-top:4px;font-size:0.85em">tags: ${p.tags.map((t) => `<code>${escapeHtml(t)}</code>`).join(' ')}</div>`);
  }
  if (p.summary) {
    parts.push(`<div style="margin-top:6px;font-size:0.9em;line-height:1.35">${escapeHtml(p.summary)}</div>`);
  }
  if (p.url) {
    parts.push(`<div style="margin-top:6px"><a href="${escapeAttr(toAbsolute(p.url))}">open page →</a></div>`);
  }
  el.innerHTML = parts.join('');
  el.style.display = 'block';
}

// ---- Helpers ----

function showFallback(el: HTMLElement | null, msg: string): void {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'flex';
}

function toAbsolute(u: string): string {
  // Page URLs are vault-relative; resolve against site root by going up from /graph/.
  const baseDepth = (location.pathname.replace(/^\//, '').split('/').filter(Boolean).length) || 1;
  const up = '../'.repeat(baseDepth - 1);
  return up + u;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return [r, g, b, alpha];
}

function writeColor(buf: Float32Array, i: number, c: [number, number, number, number]): void {
  buf[i * 4] = c[0];
  buf[i * 4 + 1] = c[1];
  buf[i * 4 + 2] = c[2];
  buf[i * 4 + 3] = c[3];
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void init(); });
} else {
  void init();
}
