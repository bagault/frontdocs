import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { AiConfig, AiMessage, AiResponse, OllamaModel, Snapshot, AiFileAction } from '../types';
import { useSettingsStore } from './settings';

export const useAiStore = defineStore('ai', () => {
  const messages = ref<AiMessage[]>([]);
  const isGenerating = ref(false);
  const streamingContent = ref('');
  const ollamaModels = ref<OllamaModel[]>([]);
  const ollamaConnected = ref(false);
  const snapshots = ref<Snapshot[]>([]);
  const pendingActions = ref<AiFileAction[]>([]);

  const aiConfig = computed((): AiConfig => {
    const settings = useSettingsStore();
    return {
      provider: settings.current.ai_provider,
      ollama_url: settings.current.ollama_url,
      ollama_model: settings.current.ollama_model,
      external_url: settings.current.external_api_url,
      external_key: settings.current.external_api_key,
      external_model: settings.current.external_model,
    };
  });

  const isConfigured = computed(() => {
    const config = aiConfig.value;
    if (config.provider === 'ollama') {
      return ollamaConnected.value && !!config.ollama_model;
    }
    return !!config.external_url && !!config.external_key && !!config.external_model;
  });

  async function checkOllama() {
    const settings = useSettingsStore();
    try {
      ollamaConnected.value = await invoke<boolean>('check_ollama_status', {
        ollamaUrl: settings.current.ollama_url,
      });
      if (ollamaConnected.value) {
        await loadModels();
      }
    } catch {
      ollamaConnected.value = false;
    }
  }

  async function loadModels() {
    const settings = useSettingsStore();
    try {
      ollamaModels.value = await invoke<OllamaModel[]>('list_ollama_models', {
        ollamaUrl: settings.current.ollama_url,
      });
    } catch {
      ollamaModels.value = [];
    }
  }

  function addMessage(role: 'user' | 'assistant', content: string, extra?: Partial<AiMessage>) {
    messages.value.push({ role, content, timestamp: Date.now(), ...extra });
  }

  function createSnapshot(filePath: string, content: string, description: string): string {
    const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    snapshots.value.push({ id, timestamp: Date.now(), filePath, content, description });
    return id;
  }

  function getSnapshot(id: string): Snapshot | undefined {
    return snapshots.value.find(s => s.id === id);
  }

  function removeSnapshotsAfter(id: string) {
    const idx = snapshots.value.findIndex(s => s.id === id);
    if (idx !== -1) {
      snapshots.value.splice(idx, 1);
    }
  }

  async function simulateStreaming(content: string): Promise<string> {
    streamingContent.value = '';
    const words = content.split(/(\s+)/);
    for (let i = 0; i < words.length; i++) {
      streamingContent.value += words[i];
      if (i % 2 === 0) {
        await new Promise(r => setTimeout(r, 25));
      }
    }
    const final_ = streamingContent.value;
    streamingContent.value = '';
    return final_;
  }

  async function complete(prompt: string, context?: string): Promise<string> {
    isGenerating.value = true;
    addMessage('user', prompt);
    try {
      const response = await invoke<AiResponse>('ai_complete', {
        config: aiConfig.value,
        prompt,
        context: context || null,
      });
      await simulateStreaming(response.content);
      addMessage('assistant', response.content);
      return response.content;
    } catch (e: any) {
      const err = `Error: ${e}`;
      addMessage('assistant', err);
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  async function rawComplete(prompt: string, context?: string): Promise<string> {
    isGenerating.value = true;
    try {
      const response = await invoke<AiResponse>('ai_complete', {
        config: aiConfig.value,
        prompt,
        context: context || null,
      });
      return response.content;
    } catch (e: any) {
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  async function rawGeneratePage(topic: string, context?: string): Promise<string> {
    isGenerating.value = true;
    try {
      const response = await invoke<AiResponse>('ai_generate_page', {
        config: aiConfig.value,
        topic,
        context: context || null,
      });
      return response.content;
    } catch (e: any) {
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  async function generatePage(topic: string, context?: string): Promise<string> {
    isGenerating.value = true;
    addMessage('user', `Generate page: ${topic}`);
    try {
      const response = await invoke<AiResponse>('ai_generate_page', {
        config: aiConfig.value,
        topic,
        context: context || null,
      });
      await simulateStreaming(response.content);
      addMessage('assistant', response.content);
      return response.content;
    } catch (e: any) {
      addMessage('assistant', `Error: ${e}`);
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  async function summarize(content: string): Promise<string> {
    isGenerating.value = true;
    addMessage('user', 'Summarize current document');
    try {
      const response = await invoke<AiResponse>('ai_summarize', {
        config: aiConfig.value,
        content,
      });
      await simulateStreaming(response.content);
      addMessage('assistant', response.content);
      return response.content;
    } catch (e: any) {
      addMessage('assistant', `Error: ${e}`);
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  async function suggestStructure(documents: string[]): Promise<string> {
    isGenerating.value = true;
    addMessage('user', 'Suggest navigation structure');
    try {
      const response = await invoke<AiResponse>('ai_suggest_structure', {
        config: aiConfig.value,
        documents,
      });
      await simulateStreaming(response.content);
      addMessage('assistant', response.content);
      return response.content;
    } catch (e: any) {
      addMessage('assistant', `Error: ${e}`);
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  async function generateMetadata(content: string): Promise<string> {
    isGenerating.value = true;
    addMessage('user', 'Generate metadata for current document');
    try {
      const response = await invoke<AiResponse>('ai_generate_metadata', {
        config: aiConfig.value,
        content,
      });
      await simulateStreaming(response.content);
      addMessage('assistant', response.content);
      return response.content;
    } catch (e: any) {
      addMessage('assistant', `Error: ${e}`);
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  async function requestFileEdit(filePath: string, fileName: string, oldContent: string, newContent: string, description: string): Promise<void> {
    const action: AiFileAction = {
      type: 'edit',
      filePath,
      fileName,
      oldContent,
      newContent,
      description,
    };
    const snapshotId = createSnapshot(filePath, oldContent, `Before: ${description}`);
    addMessage('assistant', description, { fileAction: action, snapshotId, actionStatus: 'pending' });
  }

  async function requestFileCreate(fileName: string, content: string, description: string): Promise<void> {
    const action: AiFileAction = {
      type: 'create',
      filePath: '',
      fileName,
      newContent: content,
      description,
    };
    addMessage('assistant', description, { fileAction: action, actionStatus: 'pending' });
  }

  function updateMessageStatus(idx: number, status: 'applied' | 'reverted') {
    if (messages.value[idx]) {
      messages.value[idx].actionStatus = status;
    }
  }

  function clearMessages() {
    messages.value = [];
    snapshots.value = [];
    streamingContent.value = '';
  }

  return {
    messages,
    isGenerating,
    streamingContent,
    ollamaModels,
    ollamaConnected,
    snapshots,
    pendingActions,
    aiConfig,
    isConfigured,
    checkOllama,
    loadModels,
    addMessage,
    complete,
    rawComplete,
    rawGeneratePage,
    generatePage,
    summarize,
    suggestStructure,
    generateMetadata,
    requestFileEdit,
    requestFileCreate,
    updateMessageStatus,
    createSnapshot,
    getSnapshot,
    removeSnapshotsAfter,
    simulateStreaming,
    clearMessages,
  };
});
