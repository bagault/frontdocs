import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../types';

const defaultSettings: AppSettings = {
  output_format: 'folder',
  output_path: null,
  ai_provider: 'ollama',
  ollama_url: 'http://localhost:11434',
  ollama_model: '',
  external_api_url: '',
  external_api_key: '',
  external_model: '',
  theme: 'dark',
  base_url: 'https://frontdocs.local',
  processor: 'mkdocs',
};

export const useSettingsStore = defineStore('settings', () => {
  const current = reactive<AppSettings>({ ...defaultSettings });
  const loaded = ref(false);
  const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null);

  async function persist(settings: AppSettings) {
    try {
      await invoke('save_settings', { settings });
    } catch (e) {
      console.error('Failed to save settings:', e);
      throw e;
    }
  }

  async function load() {
    try {
      const settings = await invoke<AppSettings>('get_settings');
      Object.assign(current, settings);
      loaded.value = true;
    } catch {
      Object.assign(current, defaultSettings);
      loaded.value = true;
    }
  }

  async function save() {
    if (saveTimer.value) {
      clearTimeout(saveTimer.value);
      saveTimer.value = null;
    }
    await persist({ ...current });
  }

  function saveSoon() {
    if (!loaded.value) return;
    if (saveTimer.value) {
      clearTimeout(saveTimer.value);
    }
    saveTimer.value = setTimeout(() => {
      saveTimer.value = null;
      void persist({ ...current });
    }, 250);
  }

  function update(partial: Partial<AppSettings>) {
    Object.assign(current, partial);
    saveSoon();
  }

  function reset() {
    Object.assign(current, defaultSettings);
    saveSoon();
  }

  return {
    current,
    loaded,
    load,
    save,
    saveSoon,
    update,
    reset,
    defaultSettings,
  };
});
