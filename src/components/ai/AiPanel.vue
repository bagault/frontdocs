<template>
  <div class="ai-panel d-flex flex-column" style="height: 100%; min-height: 0">
    <!-- Header -->
    <div class="ai-panel-header pa-3 d-flex align-center">
      <v-icon size="20" class="mr-2" color="primary">mdi-robot-outline</v-icon>
      <span class="text-subtitle-2 font-weight-bold">AI Assistant</span>
      <v-spacer />
      <v-btn icon size="x-small" variant="text" @click="aiStore.clearMessages()" title="Clear chat">
        <v-icon size="16">mdi-delete-outline</v-icon>
      </v-btn>
      <v-chip
        v-if="aiStore.isConfigured"
        size="x-small"
        color="success"
        variant="tonal"
        class="ml-1"
      >
        Ready
      </v-chip>
      <v-chip
        v-else
        size="x-small"
        color="warning"
        variant="tonal"
        class="ml-1"
      >
        Not configured
      </v-chip>
    </div>

    <!-- Quick Actions -->
    <div class="pa-2 d-flex flex-wrap gap-1 ai-panel-actions">
      <v-btn
        v-for="action in quickActions"
        :key="action.id"
        size="x-small"
        variant="tonal"
        :color="action.color"
        :prepend-icon="action.icon"
        @click="handleAction(action.id)"
        :disabled="!aiStore.isConfigured || aiStore.isGenerating"
      >
        {{ action.label }}
      </v-btn>
    </div>

    <!-- Chat messages (scrollable) -->
    <div ref="chatContainer" class="ai-chat-messages">
      <div v-if="aiStore.messages.length === 0 && !aiStore.isGenerating" class="text-center pa-6 text-medium-emphasis">
        <v-icon size="48" class="mb-3" style="opacity: 0.3">mdi-chat-outline</v-icon>
        <div class="text-body-2 mb-2">AI assistant is ready</div>
        <div class="text-caption">
          Use the quick actions above or type a message below.
        </div>
      </div>

      <div
        v-for="(msg, idx) in aiStore.messages"
        :key="idx"
        class="ai-msg-block"
      >
        <div class="ai-message-wrapper" :class="msg.role">
          <div class="ai-message" :class="msg.role">
            <div v-if="msg.role === 'assistant'" class="md-preview text-body-2" v-html="renderMsg(msg.content)" />
            <div v-else class="text-body-2">{{ msg.content }}</div>
          </div>
          <v-btn
            icon
            size="x-small"
            variant="text"
            class="ai-copy-btn"
            :class="msg.role"
            @click="copyMessage(msg.content)"
            title="Copy to clipboard"
          >
            <v-icon size="14">mdi-content-copy</v-icon>
          </v-btn>
        </div>

        <!-- File action buttons -->
        <div v-if="msg.fileAction && msg.actionStatus === 'pending'" class="d-flex gap-1 mt-1 ml-1">
          <v-btn size="x-small" color="success" variant="tonal" prepend-icon="mdi-check" @click="applyAction(idx)">
            {{ msg.fileAction.type === 'create' ? 'Create' : 'Apply' }}
          </v-btn>
          <v-btn size="x-small" color="error" variant="tonal" prepend-icon="mdi-close" @click="rejectAction(idx)">
            Reject
          </v-btn>
        </div>
        <div v-else-if="msg.fileAction && msg.actionStatus === 'applied'" class="d-flex gap-1 mt-1 ml-1">
          <v-chip size="x-small" color="success" variant="tonal" prepend-icon="mdi-check">Applied</v-chip>
          <v-btn size="x-small" variant="text" prepend-icon="mdi-undo" @click="revertAction(idx)">
            Revert
          </v-btn>
        </div>
        <div v-else-if="msg.fileAction && msg.actionStatus === 'reverted'" class="mt-1 ml-1">
          <v-chip size="x-small" color="warning" variant="tonal" prepend-icon="mdi-undo">Reverted</v-chip>
        </div>

        <!-- Snapshot revert (for any assistant message that has a snapshot) -->
        <div v-if="msg.snapshotId && msg.actionStatus !== 'pending'" class="mt-1 ml-1">
          <v-btn
            size="x-small"
            variant="text"
            prepend-icon="mdi-backup-restore"
            @click="revertToSnapshot(msg.snapshotId!)"
            class="text-caption"
          >
            Revert to snapshot
          </v-btn>
        </div>
      </div>

      <!-- Streaming indicator -->
      <div v-if="aiStore.isGenerating" class="ai-msg-block">
        <div class="ai-message assistant">
          <div v-if="aiStore.streamingContent" class="md-preview text-body-2" v-html="renderMsg(aiStore.streamingContent)" />
          <div v-else class="d-flex align-center">
            <v-progress-circular size="16" width="2" indeterminate color="primary" class="mr-2" />
            <span class="text-body-2 text-medium-emphasis">Generating response...</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Input area (always visible at bottom) -->
    <div class="ai-panel-input">
      <div class="d-flex align-center gap-1">
        <v-text-field
          v-model="userInput"
          placeholder="Ask AI anything..."
          density="compact"
          variant="outlined"
          hide-details
          @keydown.enter.exact.prevent="sendMessage"
          :disabled="!aiStore.isConfigured || aiStore.isGenerating"
          class="flex-grow-1"
        />
        <v-btn
          icon="mdi-send"
          size="small"
          variant="flat"
          color="primary"
          @click="sendMessage"
          :disabled="!userInput.trim() || aiStore.isGenerating"
        />
      </div>
    </div>

    <!-- Generate Page Dialog -->
    <v-dialog v-model="showGenerateDialog" max-width="480">
      <v-card>
        <v-card-title class="text-h6">Generate Page</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="generateTopic"
            label="Topic"
            placeholder="e.g., Machine Learning Fundamentals"
            autofocus
            @keydown.enter="doGeneratePage"
          />
          <v-textarea
            v-model="generateContext"
            label="Additional context (optional)"
            rows="3"
            placeholder="Add any background info, requirements, or related content..."
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showGenerateDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            @click="doGeneratePage"
            :loading="aiStore.isGenerating"
            :disabled="!generateTopic.trim()"
          >
            Generate
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import { marked } from 'marked';
import { useAppStore } from '../../stores/app';
import { useAiStore } from '../../stores/ai';
import type { AiAction } from '../../types';

const appStore = useAppStore();
const aiStore = useAiStore();

const userInput = ref('');
const chatContainer = ref<HTMLElement>();
const showGenerateDialog = ref(false);
const generateTopic = ref('');
const generateContext = ref('');

const quickActions = [
  { id: 'generate_page' as AiAction, label: 'Generate', icon: 'mdi-file-plus', color: 'primary' },
  { id: 'summarize' as AiAction, label: 'Summarize', icon: 'mdi-text-short', color: 'secondary' },
  { id: 'generate_metadata' as AiAction, label: 'Metadata', icon: 'mdi-tag-outline', color: 'info' },
  { id: 'suggest_structure' as AiAction, label: 'Structure', icon: 'mdi-file-tree', color: 'success' },
];

function renderMsg(content: string): string {
  return marked.parse(content, { async: false }) as string;
}

async function copyMessage(content: string) {
  try {
    await navigator.clipboard.writeText(content);
    appStore.showMessage('Copied to clipboard');
  } catch {
    appStore.showMessage('Failed to copy', 'error');
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
}

watch(() => aiStore.messages.length, scrollToBottom);
watch(() => aiStore.streamingContent, scrollToBottom);

async function sendMessage() {
  if (!userInput.value.trim()) return;
  const prompt = userInput.value.trim();
  userInput.value = '';

  const context = appStore.currentFile?.content;

  // Check if user is asking AI to edit or create a file
  const editMatch = prompt.match(/^(?:edit|change|update|modify|replace|fix)\s+(.+?)(?:\s+(?:to|with|:)\s+(.+))?$/i);
  const createMatch = prompt.match(/^(?:create|make|new)\s+(?:file|page)\s+(.+?)(?:\s+(?:about|with|containing|:)\s+(.+))?$/i);

  if (editMatch && appStore.currentFile) {
    aiStore.addMessage('user', prompt);
    try {
      const result = await aiStore.rawComplete(
        `Edit the following document. ${prompt}\n\nReturn ONLY the complete modified document content, nothing else.`,
        appStore.currentFile.content
      );
      await aiStore.requestFileEdit(
        appStore.currentFile.path,
        appStore.currentFile.name,
        appStore.currentFile.content,
        result,
        `Edit ${appStore.currentFile.name}: ${editMatch[1]}`
      );
    } catch (e: any) {
      aiStore.addMessage('assistant', `Error: ${e}`);
    }
  } else if (createMatch) {
    aiStore.addMessage('user', prompt);
    const fileName = createMatch[1].trim().replace(/[^a-z0-9-_. ]/gi, '').replace(/\s+/g, '-').toLowerCase();
    const topic = createMatch[2] || createMatch[1];
    try {
      const result = await aiStore.rawGeneratePage(topic);
      await aiStore.requestFileCreate(
        fileName.endsWith('.md') ? fileName : `${fileName}.md`,
        result,
        `Create file: ${fileName}.md`
      );
    } catch (e: any) {
      aiStore.addMessage('assistant', `Error: ${e}`);
    }
  } else {
    try {
      await aiStore.complete(prompt, context || undefined);
    } catch { /* error in chat */ }
  }
}

async function applyAction(msgIdx: number) {
  const msg = aiStore.messages[msgIdx];
  if (!msg?.fileAction) return;

  const action = msg.fileAction;
  if (action.type === 'edit' && appStore.currentFile && action.filePath === appStore.currentFile.path) {
    appStore.pushUndo();
    appStore.currentFile.content = action.newContent;
    await appStore.saveCurrentFile();
    aiStore.updateMessageStatus(msgIdx, 'applied');
    appStore.showMessage(`Applied edit to ${action.fileName}`);
  } else if (action.type === 'create') {
    await appStore.createFile(action.fileName, action.newContent);
    aiStore.updateMessageStatus(msgIdx, 'applied');
    appStore.showMessage(`Created ${action.fileName}`);
  }
}

async function rejectAction(msgIdx: number) {
  aiStore.updateMessageStatus(msgIdx, 'reverted');
}

async function revertAction(msgIdx: number) {
  const msg = aiStore.messages[msgIdx];
  if (!msg?.fileAction || !msg.snapshotId) return;

  const snapshot = aiStore.getSnapshot(msg.snapshotId);
  if (snapshot && appStore.currentFile && snapshot.filePath === appStore.currentFile.path) {
    appStore.currentFile.content = snapshot.content;
    await appStore.saveCurrentFile();
    aiStore.updateMessageStatus(msgIdx, 'reverted');
    appStore.showMessage('Changes reverted');
  }
}

async function revertToSnapshot(snapshotId: string) {
  const snapshot = aiStore.getSnapshot(snapshotId);
  if (snapshot && appStore.currentFile && snapshot.filePath === appStore.currentFile.path) {
    appStore.pushUndo();
    appStore.currentFile.content = snapshot.content;
    await appStore.saveCurrentFile();
    appStore.showMessage('Reverted to snapshot');
  }
}

async function handleAction(action: AiAction) {
  switch (action) {
    case 'generate_page':
      showGenerateDialog.value = true;
      break;
    case 'summarize':
      if (appStore.currentFile?.content) {
        try {
          await aiStore.summarize(appStore.currentFile.content);
        } catch { /* shown in chat */ }
      } else {
        appStore.showMessage('Open a file first', 'warning');
      }
      break;
    case 'generate_metadata':
      if (appStore.currentFile?.content) {
        try {
          const result = await aiStore.generateMetadata(appStore.currentFile.content);
          if (appStore.currentFile) {
            // Remove the last assistant message (the raw content) since we'll show the file action instead
            const lastIdx = aiStore.messages.length - 1;
            if (lastIdx >= 0 && aiStore.messages[lastIdx].role === 'assistant') {
              aiStore.messages.splice(lastIdx, 1);
            }
            await aiStore.requestFileEdit(
              appStore.currentFile.path,
              appStore.currentFile.name,
              appStore.currentFile.content,
              result,
              `Apply generated metadata to ${appStore.currentFile.name}`
            );
          }
        } catch { /* shown in chat */ }
      } else {
        appStore.showMessage('Open a file first', 'warning');
      }
      break;
    case 'suggest_structure':
      if (appStore.files.length > 0) {
        const docs = appStore.files.map(f => f.relative_path);
        try {
          await aiStore.suggestStructure(docs);
        } catch { /* shown in chat */ }
      } else {
        appStore.showMessage('No files in workspace', 'warning');
      }
      break;
  }
}

async function doGeneratePage() {
  if (!generateTopic.value.trim()) return;
  showGenerateDialog.value = false;

  const topic = generateTopic.value.trim();
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  aiStore.addMessage('user', `Generate page: ${topic}`);
  try {
    const content = await aiStore.rawGeneratePage(topic, generateContext.value.trim() || undefined);
    await aiStore.requestFileCreate(`${slug}.md`, content, `Create page: ${topic}`);
  } catch (e: any) {
    aiStore.addMessage('assistant', `Error: ${e}`);
  }

  generateTopic.value = '';
  generateContext.value = '';
}
</script>

<style scoped>
.ai-panel-header {
  border-bottom: 1px solid var(--fd-border);
  flex-shrink: 0;
}
.ai-panel-actions {
  border-bottom: 1px solid var(--fd-border);
  flex-shrink: 0;
}
.ai-chat-messages {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}
.ai-panel-input {
  flex-shrink: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--fd-border);
  background: var(--fd-surface);
}
.ai-msg-block {
  margin-bottom: 8px;
}
.ai-message-wrapper {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 4px;

  &.user {
    flex-direction: row-reverse;
  }
}
.ai-copy-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
  margin-top: 8px;

  &.user {
    color: white;
  }
}
.ai-message-wrapper:hover .ai-copy-btn {
  opacity: 0.6;
}
.ai-copy-btn:hover {
  opacity: 1 !important;
}
</style>
