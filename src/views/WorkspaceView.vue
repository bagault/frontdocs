<template>
  <div class="workspace-view d-flex fill-height">
    <!-- Editor / File Content -->
    <div class="flex-grow-1 d-flex flex-column" style="min-width: 0">
      <!-- Tab bar -->
      <div v-if="appStore.currentFile" class="file-tab-bar d-flex align-center px-3 py-1">
        <v-icon size="18" class="mr-2" color="info">mdi-language-markdown</v-icon>
        <span class="text-body-2 font-weight-medium text-truncate">
          {{ appStore.currentFile.name }}
        </span>
        <v-spacer />
        <v-btn-toggle v-model="viewMode" density="compact" mandatory variant="outlined" divided>
          <v-btn value="edit" size="x-small">
            <v-icon size="16">mdi-pencil</v-icon>
            <v-tooltip activator="parent" location="bottom">Edit</v-tooltip>
          </v-btn>
          <v-btn value="split" size="x-small">
            <v-icon size="16">mdi-view-split-vertical</v-icon>
            <v-tooltip activator="parent" location="bottom">Split</v-tooltip>
          </v-btn>
          <v-btn value="preview" size="x-small">
            <v-icon size="16">mdi-eye</v-icon>
            <v-tooltip activator="parent" location="bottom">Preview</v-tooltip>
          </v-btn>
        </v-btn-toggle>

        <v-btn
          icon
          size="x-small"
          variant="text"
          class="ml-2"
          @click="saveFile"
        >
          <v-icon size="18">mdi-content-save</v-icon>
          <v-tooltip activator="parent" location="bottom">Save (Ctrl+S)</v-tooltip>
        </v-btn>
      </div>

      <!-- Editor area -->
      <div v-if="appStore.currentFile" class="editor-area">
        <!-- Edit pane -->
        <div
          v-if="viewMode === 'edit' || viewMode === 'split'"
          class="editor-pane"
          :class="{ 'split-half': viewMode === 'split' }"
        >
          <MarkdownEditor
            v-model="editorContent"
            @save="saveFile"
          />
        </div>

        <!-- Split divider -->
        <v-divider v-if="viewMode === 'split'" vertical class="border-opacity-25" />

        <!-- Preview pane -->
        <div
          v-if="viewMode === 'preview' || viewMode === 'split'"
          class="preview-pane"
          :class="{ 'split-half': viewMode === 'split' }"
        >
          <MarkdownPreview :content="editorContent" />
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="flex-grow-1 d-flex align-center justify-center">
        <div class="text-center text-medium-emphasis">
          <v-icon size="80" class="mb-4" color="primary" style="opacity: 0.3">
            mdi-file-document-edit-outline
          </v-icon>
          <div class="text-h6 mb-2">No file open</div>
          <div class="text-body-2">
            Select a file from the sidebar or create a new page
          </div>
        </div>
      </div>
    </div>

    <!-- AI Panel (right drawer) -->
    <transition name="slide-x-reverse">
      <div v-if="appStore.aiPanelOpen" class="ai-panel-container">
        <AiPanel />
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useAppStore } from '../stores/app';
import MarkdownEditor from '../components/editor/MarkdownEditor.vue';
import MarkdownPreview from '../components/editor/MarkdownPreview.vue';
import AiPanel from '../components/ai/AiPanel.vue';

const appStore = useAppStore();

const viewMode = ref<'edit' | 'split' | 'preview'>('split');
const editorContent = ref('');

watch(
  () => appStore.currentFile,
  (file) => {
    if (file) {
      editorContent.value = file.content;
    }
  },
  { immediate: true }
);

watch(editorContent, (val, oldVal) => {
  if (appStore.currentFile) {
    appStore.currentFile.content = val;
  }
});

function saveFile() {
  appStore.pushUndo();
  appStore.saveCurrentFile();
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFile();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    appStore.undo();
    if (appStore.currentFile) {
      editorContent.value = appStore.currentFile.content;
    }
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<style scoped>
.workspace-view {
  height: 100%;
  overflow: hidden;
}
.file-tab-bar {
  height: 40px;
  background: var(--fd-surface-variant);
  border-bottom: 1px solid var(--fd-border);
  flex-shrink: 0;
}
.editor-area {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.editor-pane {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.editor-pane.split-half {
  flex: 0 0 50%;
  max-width: 50%;
}
.preview-pane {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.preview-pane.split-half {
  flex: 0 0 50%;
  max-width: 50%;
}
.ai-panel-container {
  width: 380px;
  flex-shrink: 0;
  border-left: 1px solid var(--fd-border);
  background: var(--fd-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
