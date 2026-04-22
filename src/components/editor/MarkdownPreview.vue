<template>
  <div class="md-preview" ref="previewEl" v-html="rendered" @click="handleClick" />

  <v-dialog v-model="showExternalDialog" max-width="420">
    <v-card>
      <v-card-title class="text-h6">Open External Link</v-card-title>
      <v-card-text>
        <div class="text-body-2 mb-2">This link will open in your browser:</div>
        <div class="text-caption text-primary text-truncate">{{ pendingUrl }}</div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showExternalDialog = false">Cancel</v-btn>
        <v-btn color="primary" @click="confirmExternal">Open in Browser</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { marked } from 'marked';
import katex from 'katex';
import { open } from '@tauri-apps/plugin-shell';
import { useAppStore } from '../../stores/app';
import {
  normalizeLinkKey,
  stripMarkdownExtension,
  normalizeRelativeLinkTarget,
  pathDirname,
  pathBasename,
  buildLinkCandidates,
  pathDistance,
  markdownPathToHtmlHref,
  markdownPathToRelativeHtmlHref,
  resolveWorkspaceFile as resolveWorkspaceFileUtil,
} from '../../utils/wikilinks';

const props = defineProps<{
  content: string;
}>();

const appStore = useAppStore();
const previewEl = ref<HTMLElement>();
const showExternalDialog = ref(false);
const pendingUrl = ref('');

function handleClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('a');
  if (!target) return;
  e.preventDefault();

  const href = target.getAttribute('href') || '';

  // Internal .md link
  if (href.endsWith('.md') || href.endsWith('.markdown')) {
    const resolved = resolveInternalLink(href);
    if (resolved) {
      appStore.openFile(resolved);
    }
    return;
  }

  // Anchor link (same page)
  if (href.startsWith('#')) {
    const el = previewEl.value?.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  // External link
  if (href.startsWith('http://') || href.startsWith('https://')) {
    pendingUrl.value = href;
    showExternalDialog.value = true;
    return;
  }

  // Relative link that isn't .md — try to match a workspace file
  if (!href.startsWith('/') && appStore.workspacePath) {
    const resolved = resolveInternalLink(href);
    if (resolved) {
      appStore.openFile(resolved);
    }
  }
}

function resolveInternalLink(href: string): string | null {
  const match = resolveWorkspaceFile(href);
  return match?.path || null;
}

function currentRelativePath(): string {
  if (!appStore.workspacePath || !appStore.currentFile) return '';
  const workspace = appStore.workspacePath.replace(/\\/g, '/').replace(/\/+$/, '');
  const filePath = appStore.currentFile.path.replace(/\\/g, '/');
  return filePath.startsWith(`${workspace}/`) ? filePath.slice(workspace.length + 1) : '';
}

function resolveWorkspaceFile(link: string) {
  return resolveWorkspaceFileUtil(link, currentRelativePath(), appStore.files);
}

function confirmExternal() {
  open(pendingUrl.value);
  showExternalDialog.value = false;
  pendingUrl.value = '';
}

function renderLatex(text: string): string {
  // Display math: $$ ... $$
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<pre class="katex-error">${tex}</pre>`;
    }
  });

  // Inline math: $ ... $ (not greedy, not matching $$ or currency-like patterns)
  text = text.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_match, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<code class="katex-error">${tex}</code>`;
    }
  });

  return text;
}

function stripFrontmatter(content: string): string {
  const trimmed = content.trimStart();
  if (trimmed.startsWith('+++')) {
    const end = trimmed.indexOf('+++', 3);
    if (end !== -1) return trimmed.substring(end + 3).trimStart();
  }
  if (trimmed.startsWith('---')) {
    const end = trimmed.indexOf('---', 3);
    if (end !== -1) return trimmed.substring(end + 3).trimStart();
  }
  return content;
}

function convertWikiLinks(content: string): string {
  return content.replace(/\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g, (_match, target, alias) => {
    const display = (alias || target).trim();
    const resolved = findLinkPath(target.trim());
    return `[${display}](${resolved})`;
  });
}

function findLinkPath(link: string): string {
  const match = resolveWorkspaceFile(link);
  const currentPath = currentRelativePath();
  if (match) {
    return markdownPathToRelativeHtmlHref(match.relative_path, currentPath);
  }

  const normalizedTarget = normalizeRelativeLinkTarget(link) || link.trim();
  return markdownPathToRelativeHtmlHref(`${normalizedTarget}.md`, currentPath);
}

const rendered = computed(() => {
  const body = stripFrontmatter(props.content);
  const withWikiLinks = convertWikiLinks(body);
  const withLatex = renderLatex(withWikiLinks);
  return marked.parse(withLatex, { async: false }) as string;
});
</script>

<style>
@import 'katex/dist/katex.min.css';
</style>
