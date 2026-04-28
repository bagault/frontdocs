// MkDocs Material template overrides + graph page body.

export const GRAPH_OVERRIDE_TEMPLATE = `{% extends "main.html" %}

{% block content %}
<article class="md-content__inner md-typeset" id="frontdocs-graph-article">
  <h1>{{ page.title or "Knowledge Graph" }}</h1>
  <p class="frontdocs-graph-help">
    Drag to pan, scroll to zoom. Hover a node to highlight neighbours; click for details.
    Use the table on the right to search and jump to a node.
  </p>
  <style>
    #frontdocs-graph-shell { display: flex; gap: 12px; height: 78vh; min-height: 520px; }
    #frontdocs-graph-shell .frontdocs-graph-pane {
      flex: 0 0 60%;
      position: relative;
      border: 1px solid var(--md-default-fg-color--lightest);
      border-radius: 6px;
      background: var(--md-default-bg-color);
      overflow: hidden;
      min-width: 0;
    }
    #frontdocs-graph-shell .frontdocs-graph-side {
      flex: 1 1 40%;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    #frontdocs-graph-controls { display: flex; flex-direction: column; gap: 6px; }
    #frontdocs-graph-search {
      width: 100%;
      padding: 6px 8px;
      font: inherit;
      border: 1px solid var(--md-default-fg-color--lightest);
      border-radius: 4px;
      background: var(--md-default-bg-color);
      color: var(--md-default-fg-color);
      box-sizing: border-box;
    }
    #frontdocs-graph-filters { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 0.82em; }
    #frontdocs-graph-filters label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
    #frontdocs-graph-filters .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
    #frontdocs-graph-table-wrapper {
      flex: 1 1 auto;
      overflow: auto;
      border: 1px solid var(--md-default-fg-color--lightest);
      border-radius: 6px;
      min-height: 120px;
    }
    #frontdocs-graph-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82em;
    }
    #frontdocs-graph-table thead th {
      position: sticky;
      top: 0;
      background: var(--md-default-bg-color);
      text-align: left;
      padding: 4px 6px;
      border-bottom: 1px solid var(--md-default-fg-color--lightest);
      cursor: pointer;
      user-select: none;
      z-index: 1;
    }
    #frontdocs-graph-table tbody tr { cursor: pointer; }
    #frontdocs-graph-table tbody tr:hover,
    #frontdocs-graph-table tbody tr.is-hover { background: var(--md-accent-fg-color--transparent); }
    #frontdocs-graph-table tbody tr.is-selected { background: var(--md-primary-fg-color--light); }
    #frontdocs-graph-table td { padding: 3px 6px; border-bottom: 1px solid var(--md-default-fg-color--lightest); }
    #frontdocs-graph-table td.col-type { white-space: nowrap; }
    #frontdocs-graph-table td.col-degree { text-align: right; font-variant-numeric: tabular-nums; }
    #frontdocs-graph-table td .swatch { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
    #frontdocs-graph-detail {
      max-height: 35%;
      overflow: auto;
      background: var(--md-default-bg-color);
      border: 1px solid var(--md-default-fg-color--lightest);
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 0.85em;
      display: none;
    }
    #frontdocs-graph-tooltip {
      position: absolute;
      pointer-events: none;
      padding: 3px 6px;
      background: var(--md-default-bg-color);
      border: 1px solid var(--md-default-fg-color--lightest);
      border-radius: 3px;
      font-size: 0.78em;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      display: none;
      z-index: 5;
    }
    #frontdocs-graph-fallback {
      display: none;
      position: absolute;
      inset: 0;
      align-items: center;
      justify-content: center;
      color: var(--md-default-fg-color--light);
      font-style: italic;
    }
    #frontdocs-graph-stats { font-size: 0.78em; opacity: 0.7; padding: 0 2px; }
    @media (max-width: 900px) {
      #frontdocs-graph-shell { flex-direction: column; height: auto; }
      #frontdocs-graph-shell .frontdocs-graph-pane { flex: 0 0 60vh; height: 60vh; }
      #frontdocs-graph-shell .frontdocs-graph-side { flex: 1 1 auto; }
      #frontdocs-graph-table-wrapper { max-height: 50vh; }
    }
  </style>
  <div id="frontdocs-graph-shell">
    <div id="frontdocs-graph-root" class="frontdocs-graph-pane">
      <div id="frontdocs-graph-canvas" style="width:100%;height:100%;"></div>
      <div id="frontdocs-graph-tooltip"></div>
      <div id="frontdocs-graph-fallback">Graph unavailable.</div>
    </div>
    <aside class="frontdocs-graph-side">
      <div id="frontdocs-graph-controls">
        <input id="frontdocs-graph-search" type="search" placeholder="Search nodes (label or tag)..." autocomplete="off" />
        <div id="frontdocs-graph-filters"></div>
      </div>
      <div id="frontdocs-graph-table-wrapper">
        <table id="frontdocs-graph-table">
          <thead>
            <tr>
              <th data-sort="label">Label</th>
              <th data-sort="type">Type</th>
              <th data-sort="degree" class="col-degree">Deg</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div id="frontdocs-graph-stats"></div>
      <div id="frontdocs-graph-detail"></div>
    </aside>
  </div>
  <script>
    window.FRONTDOCS_GRAPH_DATA_URL = "{{ 'assets/frontdocs-cosmos.json' | url }}";
    window.FRONTDOCS_GRAPH_META_URL = "{{ 'assets/frontdocs-graph.json' | url }}";
  </script>
  <script src="{{ 'assets/frontdocs-graph-viewer.js' | url }}" defer></script>
</article>
{% endblock %}
`;

export function indexPage(siteName: string): string {
  return `# ${siteName}

Welcome to the Frontdocs static knowledge base.

- Browse notes via the navigation.
- Open the [Graph](graph.md) for an interactive overview.
`;
}

export function graphPage(navTitle: string): string {
  // Front-matter selects the override template; body is mostly a fallback for non-Material themes.
  return `---
template: graph.html
title: ${navTitle}
---

# ${navTitle}

The interactive graph requires JavaScript. If you see this text, the viewer did not load.
`;
}
